"""End-to-end API tests for AutoTopUp AI (run: pytest -q)."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import policy as pol
from app.main import create_app
from app.seed import DEFAULT_SETTINGS

DATE = "2026-11-14"


@pytest.fixture()
def client(tmp_path):
    app = create_app(str(tmp_path / "test.db"))
    return TestClient(app)


def reset(client, scenario, **kw):
    r = client.post("/api/demo/reset", json={"scenario_id": scenario, "date": kw.pop("date", DATE), **kw})
    assert r.status_code == 200, r.text
    return r.json()["scenario"]


def balances(client):
    accts = {a["id"]: a["balance_cents"] for a in client.get("/api/state").json()["accounts"]}
    return accts["acc-everyday"], accts["acc-savings"]


def settings(client, **changes):
    s = {**client.get("/api/settings").json(), **changes}
    r = client.put("/api/settings", json=s)
    assert r.status_code == 200, r.text
    return r.json()


def pay(client, merchant_id, amount_cents):
    iid = client.post("/api/payments", json={"merchant_id": merchant_id, "amount_cents": amount_cents}).json()["intent"]["id"]
    return iid, client.post(f"/api/payments/{iid}/tap").json()


def scenario_payment(client, n):
    sc = reset(client, n)
    return pay(client, sc["merchant_id"], sc["amount_cents"])


# ------------------------------------------------------------------ scenarios
def test_scenario2_quick_approval_full_journey(client):
    iid, r = scenario_payment(client, 2)
    assert r["result"] == "DECLINED_INSUFFICIENT"
    offer = r["offer"]
    assert offer["workflow"] == pol.QUICK_APPROVE
    assert offer["amount_cents"] == 1_500
    assert offer["assessment"]["trust"]["trust_score"] >= 85
    assert balances(client) == (6_500, 120_000)

    r = client.post(f"/api/topups/{offer['id']}/approve", json={"method": "tap"}).json()
    assert r["result"] == "TRANSFER_COMPLETED"
    assert balances(client) == (8_000, 118_500)

    r = client.post(f"/api/payments/{iid}/tap").json()
    assert r["result"] == "APPROVED"
    assert r["receipt"]["amount_cents"] == 8_000
    assert balances(client) == (0, 118_500)

    kinds = [(t["kind"], t["amount_cents"]) for t in client.get("/api/state").json()["transactions"][:3]]
    assert ("purchase", -8_000) in kinds and ("transfer_in", 1_500) in kinds and ("transfer_out", -1_500) in kinds


def test_scenario1_enhanced_authentication(client):
    iid, r = scenario_payment(client, 1)
    offer = r["offer"]
    assert offer["workflow"] == pol.ENHANCED_AUTH
    assert offer["assessment"]["trust"]["trust_score"] < 60
    assert offer["amount_cents"] == 10_000
    url = f"/api/topups/{offer['id']}/approve"

    # biometric alone is not enough, nor is a quick tap, nor a PIN without confirming the purchase
    assert client.post(url, json={"method": "biometric", "biometric_ok": True, "confirm_recognised": True}).status_code == 401
    assert client.post(url, json={"method": "tap", "confirm_recognised": True}).status_code == 401
    assert client.post(url, json={"method": "pin", "pin": "1234"}).status_code == 400
    bad = client.post(url, json={"method": "pin", "pin": "0000", "confirm_recognised": True})
    assert bad.status_code == 401 and bad.json()["attempts_remaining"] == 2
    assert balances(client) == (90_000, 250_000)

    ok = client.post(url, json={"method": "pin", "pin": "1234", "confirm_recognised": True}).json()
    assert ok["result"] == "TRANSFER_COMPLETED"
    assert balances(client) == (100_000, 240_000)
    assert client.post(f"/api/payments/{iid}/tap").json()["result"] == "APPROVED"
    assert balances(client) == (0, 240_000)


def test_scenario1_pin_lockout(client):
    _, r = scenario_payment(client, 1)
    url = f"/api/topups/{r['offer']['id']}/approve"
    for _ in range(2):
        assert client.post(url, json={"method": "pin", "pin": "9999", "confirm_recognised": True}).status_code == 401
    assert client.post(url, json={"method": "pin", "pin": "9999", "confirm_recognised": True}).status_code == 423
    assert client.post(url, json={"method": "pin", "pin": "1234", "confirm_recognised": True}).status_code == 409
    assert balances(client) == (90_000, 250_000)


def test_scenario3_regular_merchant_still_asks(client):
    iid, r = scenario_payment(client, 3)
    assert r["result"] == "DECLINED_INSUFFICIENT"          # never automatic
    assert r["offer"]["workflow"] == pol.QUICK_APPROVE
    assert r["offer"]["assessment"]["trust"]["trust_score"] >= 85
    assert balances(client) == (5_000, 80_000)               # nothing moved yet
    assert r["offer"]["seconds_remaining"] > 250             # customer has time to decide
    client.post(f"/api/topups/{r['offer']['id']}/approve", json={"method": "tap"})
    assert client.post(f"/api/payments/{iid}/tap").json()["result"] == "APPROVED"
    assert balances(client) == (0, 77_500)


def test_no_scenario_moves_money_without_approval(client):
    for n in (1, 2, 3):
        sc = reset(client, n)
        _, r = pay(client, sc["merchant_id"], sc["amount_cents"])
        assert r["result"] == "DECLINED_INSUFFICIENT" and r["offer"]["status"] == "PENDING"
        assert balances(client) == (sc["everyday_cents"], sc["savings_cents"])
        notes = client.get("/api/state").json()["notifications"]
        assert notes[0]["kind"] == "topup_request" and "approve or decline" in notes[0]["body"]


@pytest.mark.parametrize("offset", range(0, 14))
def test_scenarios_stable_across_dates(client, offset):
    day = (datetime(2026, 11, 2) + timedelta(days=offset)).date().isoformat()
    for n, wf in ((1, pol.ENHANCED_AUTH), (2, pol.QUICK_APPROVE), (3, pol.QUICK_APPROVE)):
        sc = reset(client, n, date=day)
        _, r = pay(client, sc["merchant_id"], sc["amount_cents"])
        assert r["offer"]["workflow"] == wf, (day, n, r["offer"]["assessment"]["trust"]["trust_score"])


# ---------------------------------------------------------------- edge cases
def test_normal_purchase_needs_no_topup(client):
    reset(client, 2)
    _, r = pay(client, "greenleaf-rochedale", 2_000)
    assert r["result"] == "APPROVED" and r["offer"] is None
    assert balances(client) == (4_500, 120_000)


def test_insufficient_savings_blocks(client):
    reset(client, 3)
    settings(client, max_per_transfer_cents=200_000, max_daily_total_cents=200_000, min_savings_reserve_cents=0)
    _, r = pay(client, "metro-fuel-springwood", 90_000)  # shortfall $850 > savings $800
    assert r["result"] == "DECLINED_FINAL"
    checks = {c["id"]: c["status"] for c in r["offer"]["assessment"]["policy"]["checks"]}
    assert checks["funds"] == "fail"
    assert balances(client) == (5_000, 80_000)


def test_unfamiliar_merchant_requires_enhanced_and_setting_controls_it(client):
    reset(client, 2)
    _, r = pay(client, "quickbite-rochedale", 7_000)
    assert r["offer"]["workflow"] == pol.ENHANCED_AUTH
    assert any("First purchase" in x for x in r["offer"]["assessment"]["policy"]["workflow_reasons"])

    reset(client, 2)
    settings(client, unfamiliar_requires_enhanced=False)
    _, r = pay(client, "quickbite-rochedale", 7_000)
    assert not any("First purchase" in x for x in r["offer"]["assessment"]["policy"]["workflow_reasons"])


def test_familiar_merchant_is_high_trust(client):
    reset(client, 2)
    a = client.post("/api/assess", json={"merchant_id": "greenleaf-rochedale", "amount_cents": 8_000}).json()
    assert a["trust"]["trust_band"] == "HIGH"
    assert {g["id"] for g in a["groups"]} == {"merchant", "spending", "location", "account", "financial"}


def test_outside_one_tap_hours_requires_verification(client):
    sc = reset(client, 3)
    client.post("/api/demo/clock", json={"time": "23:15"})
    _, r = pay(client, sc["merchant_id"], sc["amount_cents"])
    assert r["offer"]["workflow"] == pol.STANDARD_AUTH
    elig = {e["label"].split(" (")[0]: e["met"] for e in r["offer"]["assessment"]["policy"]["quick_eligibility"]}
    assert elig["Within one-tap hours"] is False
    assert balances(client) == (5_000, 80_000)


def test_daily_frequency_limit(client):
    reset(client, 2)
    settings(client, max_daily_count=1)
    iid, r = pay(client, "greenleaf-rochedale", 8_000)
    client.post(f"/api/topups/{r['offer']['id']}/approve", json={"method": "tap"})
    assert client.post(f"/api/payments/{iid}/tap").json()["result"] == "APPROVED"
    _, r2 = pay(client, "greenleaf-rochedale", 1_000)  # everyday is $0 now
    assert r2["result"] == "DECLINED_FINAL"
    checks = {c["id"]: c["status"] for c in r2["offer"]["assessment"]["policy"]["checks"]}
    assert checks["daily_count"] == "fail"


def test_daily_total_limit(client):
    reset(client, 2)
    settings(client, max_daily_total_cents=1_000)
    _, r = pay(client, "greenleaf-rochedale", 8_000)  # $15 shortfall > $10 daily total
    assert r["result"] == "DECLINED_FINAL"


def test_max_transfer_amount(client):
    sc = reset(client, 1)
    settings(client, max_per_transfer_cents=5_000)
    _, r = pay(client, sc["merchant_id"], sc["amount_cents"])
    assert r["result"] == "DECLINED_FINAL"
    assert {c["id"]: c["status"] for c in r["offer"]["assessment"]["policy"]["checks"]}["per_tx_limit"] == "fail"


def test_minimum_savings_reserve(client):
    sc = reset(client, 3)
    settings(client, min_savings_reserve_cents=79_000)
    _, r = pay(client, sc["merchant_id"], sc["amount_cents"])
    assert r["result"] == "DECLINED_FINAL"
    assert balances(client) == (5_000, 80_000)


def test_customer_declines_transfer(client):
    iid, r = scenario_payment(client, 2)
    d = client.post(f"/api/topups/{r['offer']['id']}/decline").json()
    assert d["result"] == "TOPUP_DECLINED"
    assert balances(client) == (6_500, 120_000)
    assert client.post(f"/api/topups/{r['offer']['id']}/approve", json={"method": "tap"}).status_code == 409
    # tapping again later creates a fresh offer
    r2 = client.post(f"/api/payments/{iid}/tap").json()
    assert r2["offer"]["id"] != r["offer"]["id"]


def test_duplicate_attempts_never_double_move_money(client):
    iid, r = scenario_payment(client, 2)
    oid = r["offer"]["id"]
    again = client.post(f"/api/payments/{iid}/tap").json()
    assert again["duplicate"] is True and again["offer"]["id"] == oid

    client.post(f"/api/topups/{oid}/approve", json={"method": "tap"})
    dup = client.post(f"/api/topups/{oid}/approve", json={"method": "tap"}).json()
    assert dup["duplicate"] is True
    assert balances(client) == (8_000, 118_500)

    assert client.post(f"/api/payments/{iid}/tap").json()["result"] == "APPROVED"
    second = client.post(f"/api/payments/{iid}/tap").json()
    assert second["duplicate"] is True
    assert balances(client) == (0, 118_500)
    purchases = [t for t in client.get("/api/state").json()["transactions"] if t["ref"] == iid]
    assert len(purchases) == 1


def test_security_hold_overrides_high_trust(client):
    sc = reset(client, 3)
    client.post("/api/demo/flags", json={"security_hold": True})
    _, r = pay(client, sc["merchant_id"], sc["amount_cents"])
    assert r["offer"]["assessment"]["trust"]["trust_score"] >= 85
    assert r["result"] == "DECLINED_FINAL" and r["offer"]["workflow"] == pol.BLOCKED
    assert balances(client) == (5_000, 80_000)


def test_disabled_autotopup_blocks(client):
    sc = reset(client, 2)
    settings(client, enabled=False)
    _, r = pay(client, sc["merchant_id"], sc["amount_cents"])
    assert r["result"] == "DECLINED_FINAL"


def test_familiar_merchant_unusual_amount_not_one_tap(client):
    reset(client, 3)
    _, r = pay(client, "metro-fuel-springwood", 29_000)  # about 4x usual fuel spend
    assert r["offer"]["assessment"]["trust"]["trust_score"] < 85
    assert r["offer"]["workflow"] == pol.STANDARD_AUTH
    assert balances(client) == (5_000, 80_000)


def test_quick_approve_disabled_requires_authentication(client):
    sc = reset(client, 2)
    settings(client, quick_approve_enabled=False)
    _, r = pay(client, sc["merchant_id"], sc["amount_cents"])
    assert r["offer"]["workflow"] == pol.STANDARD_AUTH
    url = f"/api/topups/{r['offer']['id']}/approve"
    assert client.post(url, json={"method": "tap"}).status_code == 401
    assert client.post(url, json={"method": "biometric", "biometric_ok": True}).json()["result"] == "TRANSFER_COMPLETED"


def test_familiarity_learned_from_purchase_history(client):
    reset(client, 2)
    fam = {m["merchant_id"]: m for m in client.get("/api/state").json()["familiar_merchants"]}
    assert fam["greenleaf-rochedale"]["visits"] >= 5 and fam["greenleaf-rochedale"]["familiarity"] == "Regular"
    assert "quickbite-rochedale" not in fam
    # first purchase at a new merchant needs enhanced verification...
    iid, r = pay(client, "quickbite-rochedale", 7_000)
    assert r["offer"]["workflow"] == pol.ENHANCED_AUTH
    client.post(f"/api/topups/{r['offer']['id']}/approve", json={"method": "pin", "pin": "1234", "confirm_recognised": True})
    client.post(f"/api/payments/{iid}/tap")
    # ...and that purchase now goes into the history the AI learns from
    fam = {m["merchant_id"]: m for m in client.get("/api/state").json()["familiar_merchants"]}
    assert fam["quickbite-rochedale"]["visits"] == 1
    a = client.post("/api/assess", json={"merchant_id": "quickbite-rochedale", "amount_cents": 3_000}).json()
    assert not any("First purchase" in x for x in a["policy"]["workflow_reasons"])


def test_legacy_settings_are_migrated(client):
    reset(client, 2)
    db = client.app.state.db
    old = {k: v for k, v in DEFAULT_SETTINGS.items() if not k.startswith("quick_hours")}
    db.set_kv("settings", {**old, "auto_hours_start": "07:00", "auto_hours_end": "21:00",
                           "trusted_merchant_ids": ["metro-fuel-springwood"], "auto_transfer_enabled": True})
    s = client.get("/api/settings").json()
    assert s["quick_hours_start"] == "07:00" and "trusted_merchant_ids" not in s and "auto_transfer_enabled" not in s
    assert client.put("/api/settings", json=s).status_code == 200


def test_approval_window_expiry(client, monkeypatch):
    import app.service as service
    iid, r = scenario_payment(client, 2)
    real = service.wall_clock
    monkeypatch.setattr(service, "wall_clock", lambda: real() + service.APPROVAL_WINDOW_SECONDS + 1)
    resp = client.post(f"/api/topups/{r['offer']['id']}/approve", json={"method": "tap"})
    assert resp.status_code == 409 and resp.json()["error"] == "offer_expired"
    view = client.get(f"/api/payments/{iid}").json()
    assert view["offer"]["status"] == "EXPIRED" and view["intent"]["status"] == "DECLINED_FINAL"
    assert balances(client) == (6_500, 120_000)
    # tapping again starts a fresh request with a fresh window
    r2 = client.post(f"/api/payments/{iid}/tap").json()
    assert r2["offer"]["status"] == "PENDING" and r2["offer"]["id"] != r["offer"]["id"]


def test_balance_change_between_offer_and_approval_is_rechecked(client):
    iid, r = scenario_payment(client, 2)
    settings(client, min_savings_reserve_cents=119_000)  # reserve tightened after offer
    resp = client.post(f"/api/topups/{r['offer']['id']}/approve", json={"method": "tap"})
    assert resp.status_code == 409 and resp.json()["error"] == "policy_blocked"
    assert balances(client) == (6_500, 120_000)


def test_reset_and_replay(client):
    iid, r = scenario_payment(client, 2)
    client.post(f"/api/topups/{r['offer']['id']}/approve", json={"method": "tap"})
    client.post(f"/api/payments/{iid}/tap")
    assert balances(client) == (0, 118_500)
    reset(client, 2)
    assert balances(client) == (6_500, 120_000)
    _, r2 = scenario_payment(client, 2)
    assert r2["offer"]["workflow"] == pol.QUICK_APPROVE


def test_reset_can_keep_settings(client):
    reset(client, 2)
    settings(client, max_daily_count=7)
    reset(client, 1, keep_settings=True)
    assert client.get("/api/settings").json()["max_daily_count"] == 7
    reset(client, 1)
    assert client.get("/api/settings").json()["max_daily_count"] == DEFAULT_SETTINGS["max_daily_count"]


def test_settings_validation(client):
    s = client.get("/api/settings").json()
    assert client.put("/api/settings", json={**s, "destination_account_id": s["source_account_id"]}).status_code == 422
    assert client.put("/api/settings", json={**s, "quick_hours_start": "25:00"}).status_code == 422
    assert client.put("/api/settings", json={**s, "max_per_transfer_cents": -5}).status_code == 422


def test_money_is_integer_cents(client):
    reset(client, 2)
    for a in client.get("/api/state").json()["accounts"]:
        assert isinstance(a["balance_cents"], int)


def test_insights(client):
    iid, r = scenario_payment(client, 1)
    client.post(f"/api/topups/{r['offer']['id']}/approve", json={"method": "pin", "pin": "1234", "confirm_recognised": True})
    client.post(f"/api/payments/{iid}/tap")
    ins = client.get("/api/insights").json()
    assert ins["spending_by_category"]
    assert any(u["merchant"] == "Volt Electronics" for u in ins["unusual_transactions"])
    assert ins["autotopups_30d"]["count"] >= 1


# ------------------------------------------------------------ policy (unit)
def _ctx(**kw):
    base = dict(settings=DEFAULT_SETTINGS, now=datetime(2026, 11, 14, 12, 0), shortfall_cents=1_000,
                source_balance_cents=100_000, source_exists=True, destination_exists=True,
                merchant_id="metro-fuel-springwood", merchant_visits=10, trust_score=99,
                financial_status="HEALTHY", transfers_today_cents=0, transfers_today_count=0,
                security_hold=False, session_authenticated=True)
    base.update(kw)
    return pol.PolicyContext(**base)


def test_policy_never_returns_automatic():
    assert not hasattr(pol, "AUTO")
    assert pol.evaluate(_ctx()).workflow == pol.QUICK_APPROVE


def test_policy_trust_never_overrides_mandatory_checks():
    assert pol.evaluate(_ctx()).workflow == pol.QUICK_APPROVE
    for kw in ({"security_hold": True}, {"source_balance_cents": 500}, {"shortfall_cents": 40_000},
               {"transfers_today_count": 3}, {"source_exists": False}):
        assert pol.evaluate(_ctx(**kw)).workflow == pol.BLOCKED, kw


def test_policy_at_risk_cashflow_prevents_auto():
    assert pol.evaluate(_ctx(financial_status="AT_RISK")).workflow == pol.STANDARD_AUTH


def test_policy_hours_wrap_midnight():
    assert pol.within_hours(datetime(2026, 1, 1, 23, 30), "22:00", "06:00")
    assert not pol.within_hours(datetime(2026, 1, 1, 12, 0), "22:00", "06:00")
