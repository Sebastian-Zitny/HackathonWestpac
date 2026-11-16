"""Payment + AutoTopUp orchestration.

State machine for a purchase (payment intent):

    CREATED --tap--> APPROVED                         (enough funds)
    CREATED --tap--> DECLINED_INSUFFICIENT            (top-up offered, awaiting customer)
    CREATED --tap--> DECLINED_FINAL                   (mandatory rule blocked the top-up)
    DECLINED_* --tap again--> re-evaluated; a pending offer is re-used, never duplicated
    APPROVED --tap again--> no-op, returns the original receipt (duplicate protection)

AutoTopUp never moves money without the customer's explicit approval. Each
request stays open for a real-time approval window (APPROVAL_WINDOW) so the
customer always has time to approve or decline; after that it expires.

Every balance change happens inside one SQLite transaction with conditional
updates, so a retry can never move money twice.
"""
from __future__ import annotations

import json
import secrets
import time
from datetime import datetime, timedelta

import numpy as np

from . import policy as pol
from .db import Database
from .explain import explain, group_summaries
from .ml.features import FEATURES, Purchase, compute_features
from .ml.trust_engine import get_model
from .policy import fmt
from .seed import CUSTOMER, DEMO_PIN, SCENARIOS, merchant_row, normalise_settings

APPROVAL_WINDOW_SECONDS = 300  # real-time window the customer has to approve or decline
MAX_PIN_FAILURES = 3
WORKFLOW_STRENGTH = {pol.QUICK_APPROVE: 1, pol.STANDARD_AUTH: 2, pol.ENHANCED_AUTH: 3, pol.BLOCKED: 4}


class ServiceError(Exception):
    def __init__(self, status: int, code: str, message: str, extra: dict | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.extra = status, code, message, extra or {}


def wall_clock() -> float:
    """Real time (patched in tests). The approval window uses real seconds, not the demo clock."""
    return time.time()


def _id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(5)}"


class Service:
    def __init__(self, db: Database):
        self.db = db

    # ------------------------------------------------------------------ reads
    def settings(self) -> dict:
        return normalise_settings(self.db.get_kv("settings"))

    def merchant(self, mid: str) -> dict:
        m = self.db.one("SELECT * FROM merchants WHERE id=?", (mid,))
        if not m:
            raise ServiceError(404, "merchant_not_found", f"Unknown merchant {mid}")
        return m

    def accounts(self) -> list[dict]:
        return self.db.q("SELECT * FROM accounts ORDER BY CASE type WHEN 'everyday' THEN 0 ELSE 1 END, id")

    def account(self, aid: str) -> dict | None:
        return self.db.one("SELECT * FROM accounts WHERE id=?", (aid,))

    def purchase_history(self, before: datetime | None = None) -> list[Purchase]:
        rows = self.db.q("SELECT ts,amount_cents,merchant_id,category,lat,lon FROM transactions "
                         "WHERE kind='purchase' ORDER BY ts")
        out = [Purchase(datetime.fromisoformat(r["ts"]), -r["amount_cents"], r["merchant_id"], r["category"],
                        r["lat"], r["lon"]) for r in rows]
        return [p for p in out if before is None or p.ts < before]

    def topup_times(self) -> list[datetime]:
        rows = self.db.q("SELECT ts FROM transactions WHERE is_autotopup=1 AND kind='transfer_in'")
        return [datetime.fromisoformat(r["ts"]) for r in rows]

    def transfers_today(self, now: datetime) -> tuple[int, int]:
        day = now.date().isoformat()
        r = self.db.one("SELECT COALESCE(SUM(amount_cents),0) AS total, COUNT(*) AS n FROM transactions "
                        "WHERE is_autotopup=1 AND kind='transfer_in' AND substr(ts,1,10)=?", (day,))
        return int(r["total"]), int(r["n"])

    def requests_24h(self, now: datetime, exclude_offer: str | None = None) -> int:
        since = (now - timedelta(hours=24)).isoformat()
        r = self.db.one("SELECT COUNT(*) AS n FROM topup_offers WHERE created_ts>=? AND status!='BLOCKED' AND id!=?",
                        (since, exclude_offer or ""))
        return int(r["n"])

    # ------------------------------------------------------- financial health
    def finance_outlook(self, now: datetime, everyday_after: int, savings_after: int, settings: dict) -> dict:
        sched = self.db.q("SELECT * FROM scheduled ORDER BY due")
        horizon = (now + timedelta(days=14)).date().isoformat()
        upcoming = [s for s in sched if s["due"] <= horizon]
        income = [s for s in upcoming if s["kind"] == "income"]
        next_pay = income[0] if income else None
        bills_before_pay = sum(s["amount_cents"] for s in upcoming if s["kind"] == "bill"
                               and (next_pay is None or s["due"] < next_pay["due"]))
        bills_14d = sum(s["amount_cents"] for s in upcoming if s["kind"] == "bill")
        income_14d = sum(s["amount_cents"] for s in income)
        reserve = int(settings.get("min_savings_reserve_cents", 0))
        spare_savings = savings_after - reserve
        gap = bills_before_pay - everyday_after
        projected = everyday_after + savings_after + income_14d - bills_14d
        if gap <= 0:
            status = "HEALTHY"
            headline = "Upcoming bills are covered"
            detail = f"{fmt(bills_before_pay)} due before payday is covered by your everyday balance"
        elif spare_savings >= gap:
            status = "CAUTION"
            headline = "Bills before payday may need another top-up"
            detail = (f"{fmt(bills_before_pay)} due before payday"
                      f"{' on ' + next_pay['due'] if next_pay else ''}; your savings above the reserve "
                      f"({fmt(spare_savings)}) can cover it")
        else:
            status = "AT_RISK"
            headline = "Transfer could leave too little for upcoming bills"
            detail = (f"{fmt(bills_before_pay)} due before payday, but only {fmt(max(spare_savings, 0))} "
                      f"of savings would remain above your reserve")
        return {
            "status": status, "headline": headline, "detail": detail,
            "bills_before_payday_cents": bills_before_pay, "next_payday": next_pay["due"] if next_pay else None,
            "expected_income_14d_cents": income_14d, "bills_14d_cents": bills_14d,
            "projected_position_14d_cents": projected, "savings_after_cents": savings_after,
            "everyday_after_purchase_cents": everyday_after,
        }

    # -------------------------------------------------------------- assessment
    def assess(self, merchant_id: str, amount_cents: int, everyday_cents: int | None = None,
               exclude_offer: str | None = None, consent_complete: bool = False) -> dict:
        """Run AI assessment + deterministic policy for a (hypothetical) top-up."""
        s = self.settings()
        now = self.db.now()
        m = self.merchant(merchant_id)
        src = self.account(s["source_account_id"])
        dst = self.account(s["destination_account_id"])
        everyday = everyday_cents if everyday_cents is not None else (dst["balance_cents"] if dst else 0)
        shortfall = max(amount_cents - everyday, 0)

        cand = Purchase(now, amount_cents, m["id"], m["category"], m["lat"], m["lon"])
        feats, raw = compute_features(self.purchase_history(before=now), self.topup_times(), cand)
        trust = get_model().assess(feats)

        savings_bal = src["balance_cents"] if src else 0
        finance = self.finance_outlook(now, everyday + shortfall - amount_cents, savings_bal - shortfall, s)
        t_total, t_count = self.transfers_today(now)
        req = self.requests_24h(now, exclude_offer)
        topups_90d = len([t for t in self.topup_times() if now - t <= timedelta(days=90)])

        ctx = pol.PolicyContext(
            settings=s, now=now, shortfall_cents=shortfall,
            source_balance_cents=savings_bal, source_exists=bool(src and src["type"] == "savings"),
            destination_exists=bool(dst and dst["type"] == "everyday"),
            merchant_id=m["id"], merchant_visits=raw["merchant_visits"], trust_score=trust["trust_score"],
            financial_status=finance["status"], transfers_today_cents=t_total, transfers_today_count=t_count,
            security_hold=bool(self.db.get_kv("security_hold", False)),
            session_authenticated=bool(self.db.get_kv("app_session_authenticated", True)),
            recent_requests_24h=req, consent_complete=consent_complete,
        )
        policy = pol.evaluate(ctx).to_dict()
        groups = group_summaries(raw, trust["contributions"], m, finance,
                                 {"requests_24h": req, "topups_90d": topups_90d})
        explanation = explain(m, amount_cents, shortfall, trust, groups, policy)
        return {
            "assessed_at": now.isoformat(), "merchant": m, "amount_cents": amount_cents,
            "everyday_cents": everyday, "shortfall_cents": shortfall,
            "trust": trust, "features": feats, "raw": raw, "groups": groups,
            "finance": finance, "policy": policy, "explanation": explanation,
            "disclaimer": "Illustrative prototype score from an anomaly model trained on synthetic data. "
                          "Not a fraud probability and not a validated banking risk threshold.",
        }

    # ------------------------------------------------------------ primitives
    def _notify(self, c, kind: str, title: str, body: str, offer_id=None, intent_id=None):
        c.execute("INSERT INTO notifications(ts,kind,title,body,offer_id,intent_id) VALUES(?,?,?,?,?,?)",
                  (self.db.now(advance_seconds=1).isoformat(), kind, title, body, offer_id, intent_id))

    def _transfer(self, c, amount: int, ref: str) -> None:
        s = self.settings()
        src, dst = s["source_account_id"], s["destination_account_id"]
        cur = c.execute("UPDATE accounts SET balance_cents=balance_cents-? WHERE id=? AND balance_cents>=?",
                        (amount, src, amount))
        if cur.rowcount != 1:
            raise ServiceError(409, "insufficient_savings", "Savings balance changed; transfer not made")
        c.execute("UPDATE accounts SET balance_cents=balance_cents+? WHERE id=?", (amount, dst))
        ts = self.db.now(advance_seconds=5).isoformat()
        sb = c.execute("SELECT balance_cents FROM accounts WHERE id=?", (src,)).fetchone()[0]
        db_ = c.execute("SELECT balance_cents FROM accounts WHERE id=?", (dst,)).fetchone()[0]
        src_name = self.account(src)["name"]
        dst_name = self.account(dst)["name"]
        c.execute("INSERT INTO transactions(account_id,ts,kind,description,amount_cents,balance_after_cents,ref,is_autotopup)"
                  " VALUES(?,?,?,?,?,?,?,1)", (src, ts, "transfer_out", f"AutoTopUp to {dst_name}", -amount, sb, ref))
        c.execute("INSERT INTO transactions(account_id,ts,kind,description,amount_cents,balance_after_cents,ref,is_autotopup)"
                  " VALUES(?,?,?,?,?,?,?,1)", (dst, ts, "transfer_in", f"AutoTopUp from {src_name}", amount, db_, ref))

    def _charge(self, c, intent: dict) -> int:
        s = self.settings()
        acct = s["destination_account_id"]
        amt = intent["amount_cents"]
        cur = c.execute("UPDATE accounts SET balance_cents=balance_cents-? WHERE id=? AND balance_cents>=?",
                        (amt, acct, amt))
        if cur.rowcount != 1:
            raise ServiceError(409, "insufficient_funds", "Insufficient funds")
        m = self.merchant(intent["merchant_id"])
        bal = c.execute("SELECT balance_cents FROM accounts WHERE id=?", (acct,)).fetchone()[0]
        ts = self.db.now(advance_seconds=8).isoformat()
        c.execute("INSERT INTO transactions(account_id,ts,kind,description,merchant_id,category,amount_cents,"
                  "balance_after_cents,lat,lon,ref) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                  (acct, ts, "purchase", m["name"], m["id"], m["category"], -amt, bal, m["lat"], m["lon"], intent["id"]))
        txn_id = c.execute("SELECT last_insert_rowid()").fetchone()[0]
        c.execute("UPDATE payment_intents SET status='APPROVED', purchase_txn_id=?, updated_ts=?, decline_reason=NULL "
                  "WHERE id=?", (txn_id, ts, intent["id"]))
        return txn_id

    # ------------------------------------------------------------- payments
    def create_intent(self, merchant_id: str, amount_cents: int) -> dict:
        if amount_cents <= 0 or amount_cents > 2_000_000:
            raise ServiceError(422, "invalid_amount", "Amount must be between $0.01 and $20,000")
        self.merchant(merchant_id)
        iid = _id("pay")
        now = self.db.now().isoformat()
        with self.db.tx() as c:
            c.execute("INSERT INTO payment_intents(id,merchant_id,amount_cents,status,created_ts,updated_ts) "
                      "VALUES(?,?,?,?,?,?)", (iid, merchant_id, amount_cents, "CREATED", now, now))
        return self.intent_view(iid)

    def intent(self, iid: str) -> dict:
        r = self.db.one("SELECT * FROM payment_intents WHERE id=?", (iid,))
        if not r:
            raise ServiceError(404, "intent_not_found", "Payment not found")
        return r

    def offer(self, oid: str) -> dict:
        r = self.db.one("SELECT * FROM topup_offers WHERE id=?", (oid,))
        if not r:
            raise ServiceError(404, "offer_not_found", "Top-up offer not found")
        return r

    def offer_view(self, o: dict | None) -> dict | None:
        if not o:
            return None
        v = {k: o[k] for k in ("id", "intent_id", "amount_cents", "status", "workflow", "trust_score",
                               "created_ts", "expires_ts", "completed_ts", "transfer_ref", "auth_method", "pin_failures")}
        v["workflow_label"] = pol.WORKFLOW_LABELS[o["workflow"]]
        v["assessment"] = json.loads(o["assessment_json"])
        v["pin_attempts_remaining"] = max(MAX_PIN_FAILURES - o["pin_failures"], 0)
        v["approval_window_seconds"] = APPROVAL_WINDOW_SECONDS
        v["seconds_remaining"] = (max(0, int(round(o["expires_epoch"] - wall_clock())))
                                  if o["status"] == "PENDING" and o.get("expires_epoch") else 0)
        return v

    def _expired(self, o: dict) -> bool:
        return o["status"] == "PENDING" and bool(o.get("expires_epoch")) and wall_clock() >= o["expires_epoch"]

    def _expire_if_due(self, c, o: dict) -> bool:
        if self._expired(o):
            c.execute("UPDATE topup_offers SET status='EXPIRED' WHERE id=? AND status='PENDING'", (o["id"],))
            c.execute("UPDATE payment_intents SET status='DECLINED_FINAL', decline_reason=? WHERE id=? AND status!='APPROVED'",
                      ("Top-up request expired — no money was moved", o["intent_id"]))
            return True
        return False

    def latest_offer(self, iid: str) -> dict | None:
        return self.db.one("SELECT * FROM topup_offers WHERE intent_id=? ORDER BY created_ts DESC, rowid DESC LIMIT 1", (iid,))

    def intent_view(self, iid: str, **extra) -> dict:
        o = self.latest_offer(iid)
        if o and self._expired(o):
            with self.db.tx() as c:
                self._expire_if_due(c, o)
        i = self.intent(iid)
        m = self.merchant(i["merchant_id"])
        receipt = None
        if i["purchase_txn_id"]:
            t = self.db.one("SELECT * FROM transactions WHERE id=?", (i["purchase_txn_id"],))
            receipt = {"transaction_id": t["id"], "ts": t["ts"], "merchant": m["name"], "suburb": m["suburb"],
                       "amount_cents": -t["amount_cents"], "account": self.account(t["account_id"])["name"],
                       "balance_after_cents": t["balance_after_cents"], "reference": i["id"]}
        return {"intent": {**i, "merchant": m}, "offer": self.offer_view(self.latest_offer(iid)),
                "receipt": receipt, "accounts": self.accounts(), **extra}

    def tap(self, iid: str) -> dict:
        with self.db.tx() as c:
            i = self.intent(iid)
            c.execute("UPDATE payment_intents SET attempts=attempts+1 WHERE id=?", (iid,))
            self.db.now(advance_seconds=10)
            if i["status"] == "APPROVED":
                return self.intent_view(iid, result="APPROVED", duplicate=True,
                                        message="This payment was already approved — you have not been charged again.")
            s = self.settings()
            dst = self.account(s["destination_account_id"])
            if dst and dst["balance_cents"] >= i["amount_cents"]:
                self._charge(c, i)
                if s["notifications"].get("transfer_receipts", True):
                    m = self.merchant(i["merchant_id"])
                    self._notify(c, "receipt", "Payment approved", f"{fmt(i['amount_cents'])} at {m['name']}", intent_id=iid)
                return self.intent_view(iid, result="APPROVED", duplicate=False, message="Payment approved")

            # insufficient funds — re-use any live offer rather than creating a duplicate
            now = self.db.now()
            o = self.latest_offer(iid)
            if o and o["status"] == "PENDING":
                if not self._expire_if_due(c, o):
                    return self.intent_view(iid, result="DECLINED_INSUFFICIENT", duplicate=True,
                                            message="Insufficient funds — your top-up request is still waiting for approval.")

            a = self.assess(i["merchant_id"], i["amount_cents"])
            wf = a["policy"]["workflow"]
            oid = _id("atu")
            status = "BLOCKED" if wf == pol.BLOCKED else "PENDING"
            c.execute("INSERT INTO topup_offers(id,intent_id,amount_cents,status,workflow,trust_score,assessment_json,"
                      "policy_json,created_ts,expires_ts,expires_epoch) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                      (oid, iid, a["shortfall_cents"], status, wf, a["trust"]["trust_score"], json.dumps(a),
                       json.dumps(a["policy"]), now.isoformat(),
                       (now + timedelta(seconds=APPROVAL_WINDOW_SECONDS)).isoformat(),
                       wall_clock() + APPROVAL_WINDOW_SECONDS))
            m = a["merchant"]
            short = fmt(a["shortfall_cents"])
            self.db.audit("topup_offer_created", {"offer": oid, "workflow": wf, "trust": a["trust"]["trust_score"]})

            if wf == pol.BLOCKED:
                reason = a["policy"]["workflow_reasons"][0] if a["policy"]["workflow_reasons"] else "a security rule"
                c.execute("UPDATE payment_intents SET status='DECLINED_FINAL', decline_reason=?, updated_ts=? WHERE id=?",
                          (reason, now.isoformat(), iid))
                self._notify(c, "declined", "Payment declined — insufficient funds",
                             f"AutoTopUp couldn't help with {fmt(i['amount_cents'])} at {m['name']}: {reason}.", oid, iid)
                return self.intent_view(iid, result="DECLINED_FINAL", duplicate=False,
                                        message=f"Declined. AutoTopUp unavailable: {reason}")

            c.execute("UPDATE payment_intents SET status='DECLINED_INSUFFICIENT', decline_reason='Insufficient funds', "
                      "updated_ts=? WHERE id=?", (now.isoformat(), iid))
            mins = APPROVAL_WINDOW_SECONDS // 60
            self._notify(c, "topup_request", "Insufficient funds",
                         f"Transfer {short} from Savings to complete your purchase at {m['name']}? "
                         f"You have {mins} minutes to approve or decline.", oid, iid)
            return self.intent_view(iid, result="DECLINED_INSUFFICIENT", duplicate=False,
                                    message=f"Declined — insufficient funds. AutoTopUp can transfer {short}.")

    # ----------------------------------------------------------- approvals
    def approve(self, oid: str, method: str, pin: str | None = None, biometric_ok: bool = False,
                confirm_recognised: bool = False) -> dict:
        # Errors that follow a state change (PIN failure count, lock, expiry, block) are
        # returned from the transaction rather than raised inside it, so the change commits.
        with self.db.tx() as c:
            out = self._approve(c, oid, method, pin, biometric_ok, confirm_recognised)
        if isinstance(out, ServiceError):
            raise out
        return out

    def _approve(self, c, oid, method, pin, biometric_ok, confirm_recognised):
        if True:
            o = self.offer(oid)
            if o["status"] == "COMPLETED":
                return self.intent_view(o["intent_id"], result="TRANSFER_COMPLETED", duplicate=True,
                                        message="This transfer was already completed — no money was moved twice.")
            if o["status"] != "PENDING":
                raise ServiceError(409, "offer_not_pending", f"This top-up is {o['status'].lower()}")
            if self._expire_if_due(c, o):
                return ServiceError(409, "offer_expired", "This top-up request expired. No money was moved — tap your card again.")

            # Re-check every mandatory rule with fresh balances (state may have changed)
            i = self.intent(o["intent_id"])
            a = self.assess(i["merchant_id"], i["amount_cents"], exclude_offer=oid, consent_complete=True)
            fresh = a["policy"]
            if not fresh["mandatory_passed"]:
                c.execute("UPDATE topup_offers SET status='BLOCKED' WHERE id=?", (oid,))
                return ServiceError(409, "policy_blocked", "A mandatory rule now blocks this transfer",
                                   {"reasons": fresh["workflow_reasons"]})
            required = max(o["workflow"], fresh["workflow"], key=lambda w: WORKFLOW_STRENGTH[w])

            if required == pol.ENHANCED_AUTH:
                if not confirm_recognised:
                    raise ServiceError(400, "confirmation_required", "Please confirm you recognise this purchase")
                if method != "pin":
                    raise ServiceError(401, "pin_required", "Enhanced authentication requires your PIN")
            if required in (pol.ENHANCED_AUTH, pol.STANDARD_AUTH):
                if method == "pin":
                    if pin != DEMO_PIN:
                        fails = o["pin_failures"] + 1
                        if fails >= MAX_PIN_FAILURES:
                            c.execute("UPDATE topup_offers SET pin_failures=?, status='LOCKED' WHERE id=?", (fails, oid))
                            self._notify(c, "security", "Top-up locked",
                                         "Too many incorrect PIN attempts. No money was moved.", oid, o["intent_id"])
                            return ServiceError(423, "locked", "Too many incorrect PIN attempts. Top-up locked.")
                        c.execute("UPDATE topup_offers SET pin_failures=? WHERE id=?", (fails, oid))
                        return ServiceError(401, "incorrect_pin", "Incorrect PIN",
                                           {"attempts_remaining": MAX_PIN_FAILURES - fails})
                elif method == "biometric":
                    if not biometric_ok:
                        raise ServiceError(401, "biometric_failed", "Biometric check failed")
                else:
                    raise ServiceError(401, "auth_required", "Authentication required")

            ref = f"ATU-{oid[4:].upper()}"
            self._transfer(c, o["amount_cents"], ref)
            stored = json.loads(o["assessment_json"])
            stored["policy"] = fresh  # record the policy result at the moment funds moved
            c.execute("UPDATE topup_offers SET status='COMPLETED', completed_ts=?, transfer_ref=?, auth_method=?, "
                      "policy_json=?, assessment_json=? WHERE id=?",
                      (self.db.now().isoformat(), ref, method, json.dumps(fresh), json.dumps(stored), oid))
            self._notify(c, "transfer", f"{fmt(o['amount_cents'])} moved to Everyday",
                         "Transfer complete. Tap your card again to finish your purchase.", oid, o["intent_id"])
            self.db.audit("topup_approved", {"offer": oid, "method": method, "required": required})
            return self.intent_view(o["intent_id"], result="TRANSFER_COMPLETED", duplicate=False,
                                    message="Transfer complete — tap your card again to pay")

    def decline(self, oid: str) -> dict:
        with self.db.tx() as c:
            o = self.offer(oid)
            if o["status"] == "PENDING":
                c.execute("UPDATE topup_offers SET status='DECLINED' WHERE id=?", (oid,))
                c.execute("UPDATE payment_intents SET status='DECLINED_FINAL', decline_reason='You declined the top-up', "
                          "updated_ts=? WHERE id=?", (self.db.now().isoformat(), o["intent_id"]))
                self.db.audit("topup_declined", {"offer": oid})
            elif o["status"] == "COMPLETED":
                raise ServiceError(409, "already_completed", "The transfer has already been completed")
            return self.intent_view(o["intent_id"], result="TOPUP_DECLINED", duplicate=False,
                                    message="You declined the top-up. No money was moved.")

    # -------------------------------------------------------------- views
    def state(self) -> dict:
        now = self.db.now()
        s = self.settings()
        t_total, t_count = self.transfers_today(now)
        txns = self.db.q("SELECT * FROM transactions ORDER BY ts DESC, id DESC LIMIT 25")
        notes = self.db.q("SELECT * FROM notifications ORDER BY id DESC LIMIT 20")
        return {
            "customer": CUSTOMER, "now": now.isoformat(), "scenario_id": self.db.get_kv("scenario_id"),
            "accounts": self.accounts(), "settings": s,
            "autotopup": {"enabled": s["enabled"], "quick_enabled": s["quick_approve_enabled"],
                          "approval_window_seconds": APPROVAL_WINDOW_SECONDS,
                          "today_count": t_count, "today_total_cents": t_total,
                          "max_daily_count": s["max_daily_count"], "max_daily_total_cents": s["max_daily_total_cents"]},
            "security_hold": bool(self.db.get_kv("security_hold", False)),
            "app_session_authenticated": bool(self.db.get_kv("app_session_authenticated", True)),
            "transactions": txns, "notifications": notes,
            "merchants": self.db.q("SELECT * FROM merchants ORDER BY name"),
            "familiar_merchants": self.familiar_merchants(now),
            "scenarios": list(SCENARIOS.values()),
        }

    def familiar_merchants(self, now: datetime) -> list[dict]:
        """Merchant familiarity learned from the last 90 days of purchase history (no manual list)."""
        since = (now - timedelta(days=90)).isoformat()
        rows = self.db.q("SELECT t.merchant_id, m.name, m.suburb, m.icon, COUNT(*) AS visits, MAX(t.ts) AS last_visit, "
                         "SUM(-t.amount_cents) AS total_cents FROM transactions t JOIN merchants m ON m.id=t.merchant_id "
                         "WHERE t.kind='purchase' AND t.ts>=? GROUP BY t.merchant_id ORDER BY visits DESC", (since,))
        for r in rows:
            r["typical_cents"] = int(r["total_cents"] / max(r["visits"], 1))
            r["familiarity"] = "Regular" if r["visits"] >= 5 else "Occasional"
        return rows

    def insights(self) -> dict:
        now = self.db.now()
        hist = self.purchase_history(before=now + timedelta(seconds=1))
        last30 = [p for p in hist if now - p.ts <= timedelta(days=30)]
        by_cat: dict[str, int] = {}
        for p in last30:
            by_cat[p.category] = by_cat.get(p.category, 0) + p.amount_cents
        weeks = []
        for w in range(7, -1, -1):
            end = now - timedelta(days=7 * w)
            start = end - timedelta(days=7)
            weeks.append({"week_ending": end.date().isoformat(),
                          "total_cents": sum(p.amount_cents for p in hist if start < p.ts <= end)})
        # score the last 30 days of purchases with the model (each vs its own prior history)
        model = get_model()
        tops = self.topup_times()
        merchants = {m["id"]: m for m in self.db.q("SELECT * FROM merchants")}
        scored = []
        rows = []
        for p in last30:
            f, raw = compute_features(hist, tops, p)
            rows.append([f[k] for k in FEATURES])
            scored.append((p, raw))
        unusual = []
        if rows:
            scores = model.model.decision_function(np.array(rows))
            for (p, raw), sc in zip(scored, scores):
                t = int(round(model.to_trust(float(sc))))
                if t < 60:
                    unusual.append({"ts": p.ts.isoformat(), "merchant": merchants.get(p.merchant_id, {}).get("name", p.merchant_id),
                                    "amount_cents": p.amount_cents, "trust_score": t,
                                    "why": f"{raw['amount_ratio']}× typical spend, {raw['merchant_visits']} prior visits, "
                                           f"{raw['distance_km']:.0f} km from usual area"})
        unusual.sort(key=lambda u: u["trust_score"])
        atu = self.db.q("SELECT ts,amount_cents,ref FROM transactions WHERE is_autotopup=1 AND kind='transfer_in' "
                        "ORDER BY ts DESC LIMIT 10")
        s = self.settings()
        src = self.account(s["source_account_id"])
        dst = self.account(s["destination_account_id"])
        fin = self.finance_outlook(now, dst["balance_cents"], src["balance_cents"], s)
        atu30 = [a for a in atu if now - datetime.fromisoformat(a["ts"]) <= timedelta(days=30)]
        return {
            "now": now.isoformat(),
            "spending_by_category": sorted(({"category": k, "total_cents": v} for k, v in by_cat.items()),
                                           key=lambda x: -x["total_cents"]),
            "weekly_totals": weeks,
            "unusual_transactions": unusual[:6],
            "autotopups": atu,
            "autotopups_30d": {"count": len(atu30), "total_cents": sum(a["amount_cents"] for a in atu30)},
            "upcoming": self.db.q("SELECT * FROM scheduled ORDER BY due"),
            "finance": fin,
            "model": model.meta,
        }
