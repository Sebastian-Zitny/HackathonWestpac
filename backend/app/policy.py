"""Deterministic policy engine.

Sits between the AI assessment and any money movement. Mandatory checks are
evaluated independently of the AI and can never be overridden by a trust
score. Only once every mandatory check passes does the trust score (together
with the customer's own settings) choose *how* the customer authorises the
transfer.

AutoTopUp never moves money on its own: every workflow asks the customer to
approve or decline, and the lightest one is a single tap. Merchant
familiarity is learned from purchase history (there is no trusted list).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time

QUICK_APPROVE = "QUICK_APPROVE"
STANDARD_AUTH = "STANDARD_AUTH"
ENHANCED_AUTH = "ENHANCED_AUTH"
BLOCKED = "BLOCKED"

WORKFLOW_LABELS = {
    QUICK_APPROVE: "Quick approval (one tap)",
    STANDARD_AUTH: "Approval + standard authentication",
    ENHANCED_AUTH: "Approval + enhanced authentication (PIN)",
    BLOCKED: "Top-up not available",
}

HIGH_TRUST = 85
MEDIUM_TRUST = 60
MAX_REQUESTS_PER_PURCHASE = 3


def fmt(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    return f"{sign}${abs(cents) / 100:,.2f}"


def _parse_hhmm(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


def within_hours(now: datetime, start: str, end: str) -> bool:
    t, a, b = now.time(), _parse_hhmm(start), _parse_hhmm(end)
    if a <= b:
        return a <= t <= b
    return t >= a or t <= b  # window wraps past midnight


@dataclass
class PolicyContext:
    settings: dict
    now: datetime
    shortfall_cents: int
    source_balance_cents: int | None
    source_exists: bool
    destination_exists: bool
    merchant_id: str
    merchant_visits: int
    trust_score: int
    financial_status: str  # HEALTHY | CAUTION | AT_RISK
    transfers_today_cents: int
    transfers_today_count: int
    security_hold: bool
    session_authenticated: bool
    prior_requests_for_purchase: int = 0
    recent_requests_24h: int = 0
    consent_complete: bool = False


@dataclass
class PolicyResult:
    checks: list[dict] = field(default_factory=list)
    mandatory_passed: bool = True
    workflow: str = BLOCKED
    workflow_reasons: list[str] = field(default_factory=list)
    quick_eligibility: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "checks": self.checks,
            "mandatory_passed": self.mandatory_passed,
            "workflow": self.workflow,
            "workflow_label": WORKFLOW_LABELS[self.workflow],
            "workflow_reasons": self.workflow_reasons,
            "quick_eligibility": self.quick_eligibility,
        }


def mandatory_checks(ctx: PolicyContext) -> list[dict]:
    s = ctx.settings
    amt = ctx.shortfall_cents
    checks: list[dict] = []

    def add(cid: str, label: str, ok: bool | None, detail: str):
        status = "pending" if ok is None else ("pass" if ok else "fail")
        checks.append({"id": cid, "label": label, "status": status, "detail": detail, "mandatory": True})

    add("enabled", "AutoTopUp is on for this card", bool(s.get("enabled")),
        "Switched on for this card" if s.get("enabled") else "AutoTopUp is switched off for this card")

    accounts_ok = (ctx.source_exists and ctx.destination_exists
                   and s.get("source_account_id") != s.get("destination_account_id"))
    add("accounts", "Source and destination accounts authorised", accounts_ok,
        "Linked savings → everyday accounts verified" if accounts_ok else "Linked accounts are missing or invalid")

    bal = ctx.source_balance_cents or 0
    add("funds", "Savings has enough transferable funds", bal >= amt,
        f"Savings {fmt(bal)} covers the {fmt(amt)} shortfall" if bal >= amt
        else f"Savings {fmt(bal)} cannot cover the {fmt(amt)} shortfall")

    reserve = int(s.get("min_savings_reserve_cents", 0))
    after = bal - amt
    add("reserve", "Minimum savings reserve protected", after >= reserve,
        f"Savings would be {fmt(after)} (reserve {fmt(reserve)})" if after >= reserve
        else f"Savings would drop to {fmt(after)}, below your {fmt(reserve)} reserve")

    per_tx = int(s.get("max_per_transfer_cents", 0))
    add("per_tx_limit", "Within per-transfer limit", amt <= per_tx,
        f"{fmt(amt)} is within your {fmt(per_tx)} limit" if amt <= per_tx
        else f"{fmt(amt)} exceeds your {fmt(per_tx)} per-transfer limit")

    daily_cap = int(s.get("max_daily_total_cents", 0))
    total = ctx.transfers_today_cents + amt
    add("daily_total", "Within daily transfer total", total <= daily_cap,
        f"{fmt(total)} of {fmt(daily_cap)} used today" if total <= daily_cap
        else f"Would reach {fmt(total)} today, over your {fmt(daily_cap)} daily limit")

    daily_n = int(s.get("max_daily_count", 0))
    n = ctx.transfers_today_count + 1
    add("daily_count", "Within daily AutoTopUp count", n <= daily_n,
        f"This would be top-up {n} of {daily_n} today" if n <= daily_n
        else f"You've reached your limit of {daily_n} AutoTopUps today")

    add("security", "No security or fraud hold on the account", not ctx.security_hold,
        "No active holds" if not ctx.security_hold else "A security hold is active — top-ups are paused")

    add("consent", "Customer consent and authentication", True if ctx.consent_complete else None,
        "Completed" if ctx.consent_complete else "Required before funds move (see workflow)")
    return checks


def evaluate(ctx: PolicyContext) -> PolicyResult:
    res = PolicyResult()
    res.checks = mandatory_checks(ctx)
    res.mandatory_passed = all(c["status"] != "fail" for c in res.checks)
    s = ctx.settings

    start, end = s.get("quick_hours_start", "06:00"), s.get("quick_hours_end", "22:00")
    in_hours = within_hours(ctx.now, start, end)
    familiar = ctx.merchant_visits > 0
    elig = [
        {"label": f"AI trust score ≥ {HIGH_TRUST}", "met": ctx.trust_score >= HIGH_TRUST},
        {"label": "Merchant recognised from your purchase history", "met": familiar},
        {"label": "One-tap approval turned on in settings", "met": bool(s.get("quick_approve_enabled"))},
        {"label": "Signed in to the banking app", "met": ctx.session_authenticated},
        {"label": f"Within one-tap hours ({start}–{end})", "met": in_hours},
        {"label": "Upcoming bills stay covered after the transfer", "met": ctx.financial_status != "AT_RISK"},
        {"label": "No repeated top-up requests", "met": ctx.recent_requests_24h < MAX_REQUESTS_PER_PURCHASE},
    ]
    res.quick_eligibility = elig

    if not res.mandatory_passed:
        res.workflow = BLOCKED
        res.workflow_reasons = [c["detail"] for c in res.checks if c["status"] == "fail"]
        return res

    reasons: list[str] = []
    score = ctx.trust_score
    if score < MEDIUM_TRUST:
        wf = ENHANCED_AUTH
        reasons.append(f"AI trust score {score} is in the low band (below {MEDIUM_TRUST})")
    elif score < HIGH_TRUST:
        wf = STANDARD_AUTH
        reasons.append(f"AI trust score {score} is in the medium band ({MEDIUM_TRUST}–{HIGH_TRUST - 1})")
    elif all(e["met"] for e in elig):
        wf = QUICK_APPROVE
        reasons.append(f"AI trust score {score} is high and every one-tap condition is met — you still choose Approve or Decline")
    else:
        wf = STANDARD_AUTH
        reasons.append(f"AI trust score {score} is high, but one-tap approval conditions are not all met")
        reasons += [f"Not met: {e['label']}" for e in elig if not e["met"] and "trust score" not in e["label"]]

    # Escalations that apply regardless of the score: a familiar merchant or a
    # high score can never relax these.
    if not familiar and s.get("unfamiliar_requires_enhanced") and wf != ENHANCED_AUTH:
        wf = ENHANCED_AUTH
        reasons.append("First purchase with this merchant — your settings require enhanced authentication")
    if ctx.recent_requests_24h >= MAX_REQUESTS_PER_PURCHASE and wf != ENHANCED_AUTH:
        wf = ENHANCED_AUTH
        reasons.append(f"{ctx.recent_requests_24h} top-up requests in the last 24 hours — stepping up verification")

    res.workflow = wf
    res.workflow_reasons = reasons
    return res
