"""Fictional customer, merchants, scenarios and seeded transaction history.

Everything here is invented for the hackathon prototype. No real customer,
account or Westpac data is used.
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta

from .db import Database

CUSTOMER = {
    "id": "cust-riley",
    "first_name": "Riley",
    "last_name": "Carter",
    "home_suburb": "Rochedale South QLD",
    "home_lat": -27.597,
    "home_lon": 153.125,
}

ACCOUNTS = [
    {"id": "acc-everyday", "name": "Everyday Choice", "type": "everyday", "bsb": "000-000", "number_masked": "•••• 4821"},
    {"id": "acc-savings", "name": "eSaver", "type": "savings", "bsb": "000-000", "number_masked": "•••• 7390"},
    {"id": "acc-goal", "name": "Holiday Goal Saver", "type": "savings", "bsb": "000-000", "number_masked": "•••• 1176"},
]

MERCHANTS = [
    # id, name, category, suburb, lat, lon, icon
    ("greenleaf-rochedale", "GreenLeaf Supermarket", "grocery", "Rochedale South QLD", -27.5952, 153.1231, "shopping-cart"),
    ("freshco-mtgravatt", "FreshCo Market", "grocery", "Mount Gravatt QLD", -27.5381, 153.0805, "shopping-basket"),
    ("metro-fuel-springwood", "Metro Fuel", "fuel", "Springwood QLD", -27.6121, 153.1279, "fuel"),
    ("bean-there-cbd", "Bean There Café", "cafe", "Brisbane City QLD", -27.4689, 153.0251, "coffee"),
    ("spice-route-sunnybank", "Spice Route Kitchen", "dining", "Sunnybank QLD", -27.5781, 153.0602, "utensils"),
    ("careplus-umg", "CarePlus Pharmacy", "health", "Upper Mount Gravatt QLD", -27.5586, 153.0832, "pill"),
    ("shopnest-online", "ShopNest Online", "online", "Online", None, None, "globe"),
    ("homeware-hub-carindale", "Homeware Hub", "retail", "Carindale QLD", -27.5025, 153.1018, "store"),
    ("volt-electronics-sydney", "Volt Electronics", "electronics", "Sydney NSW", -33.8705, 151.2069, "smartphone"),
    ("quickbite-rochedale", "QuickBite Burgers", "dining", "Rochedale QLD", -27.5732, 153.1287, "sandwich"),
    ("harbour-fashion-gc", "Harbour Fashion", "retail", "Surfers Paradise QLD", -28.0023, 153.4302, "shirt"),
]

DEFAULT_SETTINGS = {
    "enabled": True,
    "source_account_id": "acc-savings",
    "destination_account_id": "acc-everyday",
    "max_per_transfer_cents": 30_000,
    "max_daily_total_cents": 50_000,
    "max_daily_count": 3,
    "min_savings_reserve_cents": 20_000,
    "quick_hours_start": "06:00",
    "quick_hours_end": "22:00",
    "unfamiliar_requires_enhanced": True,
    "quick_approve_enabled": True,
    "preferred_auth": "biometric",
    "notifications": {"push": True, "email": False, "transfer_receipts": True, "weekly_summary": True},
}

LEGACY_KEYS = {"auto_hours_start": "quick_hours_start", "auto_hours_end": "quick_hours_end"}


def normalise_settings(s: dict | None) -> dict:
    """Fill missing keys with defaults and map/drop keys from older versions."""
    s = dict(s or {})
    for old, new in LEGACY_KEYS.items():
        if old in s and new not in s:
            s[new] = s[old]
    out = {k: s.get(k, v) for k, v in DEFAULT_SETTINGS.items()}
    out["notifications"] = {**DEFAULT_SETTINGS["notifications"], **(s.get("notifications") or {})}
    return out


# Fictional demo PIN for the simulated authentication step.
DEMO_PIN = "1234"

SCENARIOS = {
    1: {
        "id": 1, "key": "low-trust", "title": "Low trust: enhanced authentication",
        "subtitle": "New iPhone at an unfamiliar electronics store",
        "merchant_id": "volt-electronics-sydney", "amount_cents": 100_000,
        "item": "iPhone (simulated)", "everyday_cents": 90_000, "savings_cents": 250_000,
        "time": (14, 30), "expected_workflow": "ENHANCED_AUTH",
    },
    2: {
        "id": 2, "key": "high-trust", "title": "High trust: quick approval",
        "subtitle": "Weekly groceries at your usual supermarket",
        "merchant_id": "greenleaf-rochedale", "amount_cents": 8_000,
        "item": "Weekly groceries", "everyday_cents": 6_500, "savings_cents": 120_000,
        "time": (10, 15), "expected_workflow": "QUICK_APPROVE",
    },
    3: {
        "id": 3, "key": "very-high-trust", "title": "Very high trust: regular merchant, one-tap approval",
        "subtitle": "Fuel at your regular petrol station",
        "merchant_id": "metro-fuel-springwood", "amount_cents": 7_500,
        "item": "Unleaded fuel", "everyday_cents": 5_000, "savings_cents": 80_000,
        "time": (17, 40), "expected_workflow": "QUICK_APPROVE",
    },
}

GOAL_SAVER_CENTS = 340_000


def merchant_row(mid: str) -> dict | None:
    for m in MERCHANTS:
        if m[0] == mid:
            return {"id": m[0], "name": m[1], "category": m[2], "suburb": m[3], "lat": m[4], "lon": m[5], "icon": m[6]}
    return None


def _ins_tx(c, account_id, ts, kind, desc, amount, merchant=None, ref=None, autotopup=False, balance_after=None):
    c.execute(
        "INSERT INTO transactions(account_id,ts,kind,description,merchant_id,category,amount_cents,"
        "balance_after_cents,lat,lon,ref,is_autotopup) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        (account_id, ts.isoformat(timespec="seconds"), kind, desc,
         merchant["id"] if merchant else None, merchant["category"] if merchant else None,
         amount, balance_after, merchant["lat"] if merchant else None, merchant["lon"] if merchant else None,
         ref, 1 if autotopup else 0),
    )


def _history(now: datetime, rng: random.Random):
    """Yield (ts, kind, merchant_id|None, description, amount_cents, account, extra) for 90 days."""
    out = []
    start = (now - timedelta(days=90)).replace(hour=0, minute=0, second=0)
    day = start
    fuel_next = start + timedelta(days=rng.randint(1, 5))
    while day.date() < now.date():
        dow = day.weekday()  # 0 = Mon
        def at(h0, h1):
            return day + timedelta(hours=rng.uniform(h0, h1))
        # weekly shop (Saturday morning) at the usual supermarket
        if dow == 5:
            out.append((at(9, 11.5), "purchase", "greenleaf-rochedale", None, int(rng.gauss(8200, 1300)), "acc-everyday"))
        if dow == 2 and rng.random() < 0.5:
            out.append((at(17, 19), "purchase", "greenleaf-rochedale", None, int(rng.uniform(1800, 4200)), "acc-everyday"))
        if dow == 6 and rng.random() < 0.25:
            out.append((at(10, 13), "purchase", "freshco-mtgravatt", None, int(rng.uniform(2500, 5500)), "acc-everyday"))
        # fuel roughly weekly, late afternoon
        if day.date() >= fuel_next.date():
            out.append((at(16, 18.8), "purchase", "metro-fuel-springwood", None, int(rng.gauss(7000, 700)), "acc-everyday"))
            fuel_next = day + timedelta(days=rng.randint(6, 8))
        # weekday coffee in the city
        if dow < 5 and rng.random() < 0.7:
            out.append((at(7.4, 8.6), "purchase", "bean-there-cbd", None, int(rng.uniform(480, 650)), "acc-everyday"))
        if dow == 4 and rng.random() < 0.6:
            out.append((at(18.5, 20.5), "purchase", "spice-route-sunnybank", None, int(rng.uniform(3500, 6500)), "acc-everyday"))
        if rng.random() < 0.05:
            out.append((at(9.5, 17.5), "purchase", "careplus-umg", None, int(rng.uniform(1500, 4000)), "acc-everyday"))
        if rng.random() < 0.07:
            out.append((at(19, 22), "purchase", "shopnest-online", None, int(rng.uniform(2500, 9000)), "acc-everyday"))
        if rng.random() < 0.035:
            out.append((at(10.5, 16), "purchase", "homeware-hub-carindale", None, int(rng.uniform(3000, 12000)), "acc-everyday"))
        day += timedelta(days=1)

    # fortnightly salary (Thursdays), with an automatic $200 to savings
    first_pay = now - timedelta(days=9)
    d = first_pay
    while d > start:
        pay_ts = d.replace(hour=6, minute=5, second=0)
        out.append((pay_ts, "income", None, "Salary — Northwind Logistics (fictional)", 185_000, "acc-everyday"))
        out.append((pay_ts + timedelta(minutes=5), "transfer_out", None, "Transfer to eSaver", -20_000, "acc-everyday"))
        out.append((pay_ts + timedelta(minutes=5), "transfer_in", None, "Transfer from Everyday Choice", 20_000, "acc-savings"))
        d -= timedelta(days=14)
    # monthly bills
    for months_ago in (1, 2, 3):
        base = now - timedelta(days=30 * months_ago)
        out.append(((base + timedelta(days=3)).replace(hour=3, minute=0), "bill", None, "Mobile plan — Telwave (fictional)", -6_500, "acc-everyday"))
        out.append(((base + timedelta(days=2)).replace(hour=3, minute=0), "bill", None, "StreamFlix subscription (fictional)", -1_799, "acc-everyday"))
    out.append(((now - timedelta(days=81)).replace(hour=3, minute=0), "bill", None, "Electricity — BrightGrid (fictional)", -21_000, "acc-everyday"))
    # one previous AutoTopUp, ~3 weeks ago, at the supermarket
    return out


def seed(db: Database, scenario_id: int = 2, now: datetime | None = None, keep_settings: bool = False) -> dict:
    """Reset all fictional data atomically (readers never see a half-seeded database)."""
    with db.tx():
        return _seed(db, scenario_id, now, keep_settings)


def _seed(db: Database, scenario_id: int, now: datetime | None, keep_settings: bool) -> dict:
    sc = SCENARIOS[scenario_id]
    if now is None:
        now = datetime.now()
    now = now.replace(hour=sc["time"][0], minute=sc["time"][1], second=0, microsecond=0)

    settings = db.get_kv("settings") if keep_settings else None
    db.wipe()
    rng = random.Random(4821)
    with db.tx() as c:
        for m in MERCHANTS:
            c.execute("INSERT INTO merchants(id,name,category,suburb,lat,lon,icon) VALUES(?,?,?,?,?,?,?)", m)
        balances = {"acc-everyday": sc["everyday_cents"], "acc-savings": sc["savings_cents"], "acc-goal": GOAL_SAVER_CENTS}
        for a in ACCOUNTS:
            c.execute("INSERT INTO accounts(id,name,type,bsb,number_masked,balance_cents) VALUES(?,?,?,?,?,?)",
                      (a["id"], a["name"], a["type"], a["bsb"], a["number_masked"], balances[a["id"]]))

        events = _history(now, rng)
        events.sort(key=lambda e: e[0])
        for ts, kind, mid, desc, amount, acct in events:
            m = merchant_row(mid) if mid else None
            if kind == "purchase":
                _ins_tx(c, acct, ts, kind, m["name"], -abs(amount), merchant=m)
            else:
                _ins_tx(c, acct, ts, kind, desc, amount)
        # previous AutoTopUp (account behaviour history)
        prev = (now - timedelta(days=23)).replace(hour=10, minute=4)
        gl = merchant_row("greenleaf-rochedale")
        _ins_tx(c, "acc-savings", prev, "transfer_out", "AutoTopUp to Everyday Choice", -1_200, ref="ATU-HIST-1", autotopup=True)
        _ins_tx(c, "acc-everyday", prev, "transfer_in", "AutoTopUp from eSaver", 1_200, ref="ATU-HIST-1", autotopup=True)
        _ins_tx(c, "acc-everyday", prev + timedelta(seconds=40), "purchase", gl["name"], -8_650, merchant=gl)

        # upcoming commitments (financial health)
        for kind, desc, days, amt in [
            ("bill", "StreamFlix subscription (fictional)", 2, 1_799),
            ("bill", "Mobile plan — Telwave (fictional)", 3, 6_500),
            ("income", "Salary — Northwind Logistics (fictional)", 5, 185_000),
            ("bill", "Gym membership — FitLab (fictional)", 6, 2_500),
            ("bill", "Electricity — BrightGrid (fictional)", 9, 21_000),
        ]:
            c.execute("INSERT INTO scheduled(kind,description,due,amount_cents) VALUES(?,?,?,?)",
                      (kind, desc, (now + timedelta(days=days)).date().isoformat(), amt))

    db.set_now(now)
    db.set_kv("settings", normalise_settings(settings))
    db.set_kv("security_hold", False)
    db.set_kv("app_session_authenticated", True)
    db.set_kv("scenario_id", scenario_id)
    db.audit("demo_reset", {"scenario": scenario_id, "kept_settings": bool(settings)})
    return sc
