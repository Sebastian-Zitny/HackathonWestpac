"""Synthetic banking-transaction population used to train the anomaly model.

Every customer, merchant and transaction here is fictional and randomly
generated. The generator models ordinary Australian card spending habits
(weekly groceries, regular fuel, weekday coffee, occasional dining and online
shopping), plus realistic novelty (new merchants, occasional travel, rare big
purchases) so that "new" alone is not treated as suspicious. A small share of
labelled anomalies is injected purely to *evaluate* the unsupervised model;
the labels are never used for training.
"""
from __future__ import annotations

import csv
import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

from .features import FEATURES, Purchase, compute_features

CITIES = {
    "Brisbane": (-27.47, 153.02),
    "Sydney": (-33.87, 151.21),
    "Melbourne": (-37.81, 144.96),
    "Perth": (-31.95, 115.86),
    "Adelaide": (-34.93, 138.60),
}

# mean $, sd $, purchases per week, (start hour, end hour), online?
CATEGORY_PROFILES = {
    "grocery": (85, 30, 1.2, (8, 20), False),
    "fuel": (70, 15, 0.9, (6, 20), False),
    "cafe": (6, 1.5, 3.0, (6.5, 10), False),
    "dining": (45, 20, 0.8, (17.5, 21.5), False),
    "health": (28, 12, 0.25, (9, 18), False),
    "online": (60, 40, 0.4, (18, 23.5), True),
    "retail": (70, 50, 0.35, (10, 17.5), False),
    "electronics": (350, 300, 0.03, (10, 17.5), False),
}
CATEGORY_ODDS = {
    "grocery": 1.0, "fuel": 0.8, "cafe": 0.6, "dining": 0.85,
    "health": 0.7, "online": 0.8, "retail": 0.8, "electronics": 0.5,
}


def _offset(lat: float, lon: float, km: float, rng: random.Random) -> tuple[float, float]:
    ang = rng.uniform(0, 2 * math.pi)
    dlat = (km * math.cos(ang)) / 111.0
    dlon = (km * math.sin(ang)) / (111.0 * math.cos(math.radians(lat)))
    return lat + dlat, lon + dlon


@dataclass
class SynthCustomer:
    cid: str
    home: tuple[float, float]
    scale: float
    rates: dict[str, float]
    merchants: dict[str, list[tuple[str, float, float | None, float | None]]] = field(default_factory=dict)


def _make_customer(i: int, rng: random.Random) -> SynthCustomer:
    city = rng.choice(list(CITIES))
    home = _offset(*CITIES[city], rng.uniform(2, 25), rng)
    scale = rng.uniform(0.6, 1.6)
    rates: dict[str, float] = {}
    merchants: dict[str, list] = {}
    for cat, (_, _, per_week, _, online) in CATEGORY_PROFILES.items():
        if rng.random() > CATEGORY_ODDS[cat]:
            continue
        rates[cat] = per_week * rng.uniform(0.5, 1.5)
        n = rng.choice([1, 1, 2, 2, 3])
        lst = []
        for j in range(n):
            weight = 1.0 if j == 0 else rng.uniform(0.15, 0.5)
            if online:
                lst.append((f"c{i}-{cat}-{j}", weight, None, None))
            else:
                la, lo = _offset(*home, rng.uniform(1, 15), rng)
                lst.append((f"c{i}-{cat}-{j}", weight, la, lo))
        merchants[cat] = lst
    return SynthCustomer(f"cust{i:04d}", home, scale, rates, merchants)


def _amount(cat: str, scale: float, rng: random.Random) -> int:
    mean, sd, *_ = CATEGORY_PROFILES[cat]
    val = max(2.0, rng.gauss(mean * scale, sd * scale))
    return int(round(val * 100))


def _time_in(day: datetime, hours: tuple[float, float], rng: random.Random) -> datetime:
    h = rng.uniform(*hours)
    return day + timedelta(hours=h)


def generate_customer_events(c: SynthCustomer, start: datetime, days: int, rng: random.Random):
    """Return (purchases with labels, topup times)."""
    events: list[tuple[Purchase, int]] = []
    trip_start = rng.randint(30, days - 10) if rng.random() < 0.15 else None
    trip_loc = _offset(*c.home, rng.uniform(500, 1500), rng) if trip_start else None

    for d in range(days):
        day = start + timedelta(days=d)
        travelling = trip_start is not None and trip_start <= d < trip_start + 4
        for cat, rate in c.rates.items():
            k = _poisson(rate / 7.0, rng)
            for _ in range(k):
                _, _, _, hours, online = CATEGORY_PROFILES[cat]
                ts = _time_in(day, hours, rng)
                amt = _amount(cat, c.scale, rng)
                if travelling and not online:
                    la, lo = _offset(*trip_loc, rng.uniform(0.5, 8), rng)
                    mid = f"{c.cid}-trip-{cat}-{rng.randint(0, 5)}"
                elif rng.random() < 0.12:
                    # realistic novelty: a new merchant nearby
                    if online:
                        la = lo = None
                    else:
                        la, lo = _offset(*c.home, rng.uniform(3, 40), rng)
                    mid = f"{c.cid}-new-{rng.randint(0, 10_000)}"
                else:
                    opts = c.merchants[cat]
                    mid, _, la, lo = rng.choices(opts, weights=[o[1] for o in opts])[0]
                events.append((Purchase(ts, amt, mid, cat, la, lo), 0))

    # inject labelled anomalies (evaluation only)
    if rng.random() < 0.45:
        for _ in range(rng.randint(1, 2)):
            d = rng.randint(25, days - 1)
            day = start + timedelta(days=d)
            kind = rng.choice(["far_big", "burst", "huge_local", "night_big"])
            if kind == "far_big":
                la, lo = _offset(*c.home, rng.uniform(600, 3000), rng)
                cat = rng.choice(["electronics", "retail"])
                events.append((Purchase(_time_in(day, (1, 5), rng), rng.randint(80_000, 300_000),
                                        f"anom-{rng.randint(0, 1_000_000)}", cat, la, lo), 1))
            elif kind == "burst":
                t0 = _time_in(day, (0, 23), rng)
                la, lo = _offset(*c.home, rng.uniform(50, 900), rng)
                for b in range(rng.randint(4, 7)):
                    events.append((Purchase(t0 + timedelta(minutes=4 * b), rng.randint(15_000, 60_000),
                                            f"anom-{rng.randint(0, 1_000_000)}", "retail", la, lo), 1))
            elif kind == "huge_local":
                cat = rng.choice(list(c.rates))
                opts = c.merchants[cat]
                mid, _, la, lo = opts[0]
                events.append((Purchase(_time_in(day, (3, 5), rng), _amount(cat, c.scale, rng) * rng.randint(12, 30),
                                        mid, cat, la, lo), 1))
            else:
                la, lo = _offset(*c.home, rng.uniform(20, 200), rng)
                events.append((Purchase(_time_in(day, (1.5, 4.5), rng), rng.randint(60_000, 250_000),
                                        f"anom-{rng.randint(0, 1_000_000)}", "electronics", la, lo), 1))

    events.sort(key=lambda e: e[0].ts)
    topup_rate = rng.uniform(0, 0.5)
    topups = []
    for d in range(days):
        if rng.random() < topup_rate / 7.0:
            topups.append(start + timedelta(days=d, hours=rng.uniform(8, 20)))
    return events, topups


def _poisson(lam: float, rng: random.Random) -> int:
    l, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= l:
            return k
        k += 1


def build_dataset(n_customers: int = 260, days: int = 120, warmup_days: int = 21, seed: int = 2026):
    """Generate the training population. Returns list of row dicts."""
    rng = random.Random(seed)
    start = datetime(2026, 1, 5)
    rows = []
    for i in range(n_customers):
        c = _make_customer(i, rng)
        events, topups = generate_customer_events(c, start, days, rng)
        history: list[Purchase] = []
        for p, label in events:
            if (p.ts - start).days >= warmup_days:
                feats, _ = compute_features(history, topups, p)
                rows.append({
                    "customer_id": c.cid,
                    "ts": p.ts.isoformat(timespec="minutes"),
                    "merchant_id": p.merchant_id,
                    "category": p.category,
                    "amount_cents": p.amount_cents,
                    "is_injected_anomaly": label,
                    **{f: round(feats[f], 5) for f in FEATURES},
                })
            history.append(p)
    return rows


def write_csv(rows: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
