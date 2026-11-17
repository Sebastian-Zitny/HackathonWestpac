"""Feature engineering shared by model training and live assessment.

The exact same function turns a candidate purchase plus the customer's prior
history into a feature vector, both when building the synthetic training set
and when scoring a live card tap. Keeping one code path avoids train/serve skew.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from statistics import median
from typing import Iterable, Optional, Sequence

LOOKBACK_DAYS = 90

FEATURES: list[str] = [
    "log_amount_ratio",     # purchase vs typical spend in this category
    "amount_deviation",     # robust z-score vs the spread of your spend in this category
    "merchant_visits_log",  # how often the customer has used this merchant
    "category_share",       # share of history in this merchant category
    "log_distance_km",      # distance from usual spending area
    "hour_density",         # share of history within +/-2h of this time of day
    "txn_count_1h",         # purchases in the last hour (rapid sequences)
    "txn_count_24h",        # purchases in the last 24 hours
    "spend_7d_ratio",       # last 7 days of spend (incl. this) vs typical week
    "topups_7d",            # AutoTopUps in the last 7 days
]

FEATURE_LABELS: dict[str, str] = {
    "log_amount_ratio": "Purchase amount vs your usual spend",
    "amount_deviation": "Amount vs your normal range",
    "merchant_visits_log": "Merchant familiarity",
    "category_share": "Merchant category familiarity",
    "log_distance_km": "Distance from your usual spending area",
    "hour_density": "Time-of-day pattern",
    "txn_count_1h": "Rapid transaction sequence",
    "txn_count_24h": "Transactions in the last 24 hours",
    "spend_7d_ratio": "Recent spending vs your typical week",
    "topups_7d": "Recent AutoTopUp usage",
}

FEATURE_GROUP: dict[str, str] = {
    "log_amount_ratio": "spending",
    "amount_deviation": "spending",
    "merchant_visits_log": "merchant",
    "category_share": "merchant",
    "log_distance_km": "location",
    "hour_density": "spending",
    "txn_count_1h": "spending",
    "txn_count_24h": "spending",
    "spend_7d_ratio": "spending",
    "topups_7d": "account",
}


@dataclass
class Purchase:
    ts: datetime
    amount_cents: int
    merchant_id: str
    category: str
    lat: Optional[float] = None
    lon: Optional[float] = None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _hour(ts: datetime) -> float:
    return ts.hour + ts.minute / 60.0


def _circ_hour_diff(a: float, b: float) -> float:
    d = abs(a - b) % 24
    return min(d, 24 - d)


def compute_features(
    history: Sequence[Purchase],
    topup_times: Iterable[datetime],
    cand: Purchase,
) -> tuple[dict[str, float], dict]:
    """Return (feature_vector, raw_context) for a candidate purchase.

    `raw_context` holds the human-readable facts behind each feature so the
    explanation layer can describe *why* without re-deriving anything.
    """
    ts = cand.ts
    start = ts - timedelta(days=LOOKBACK_DAYS)
    hist = [h for h in history if start <= h.ts < ts]

    all_amounts = [h.amount_cents for h in hist]
    cat_amounts = [h.amount_cents for h in hist if h.category == cand.category]

    if len(cat_amounts) >= 3:
        ref_amount = median(cat_amounts)
        ref_basis = "category"
    elif all_amounts:
        ref_amount = median(all_amounts)
        ref_basis = "overall"
    else:
        ref_amount = cand.amount_cents
        ref_basis = "none"
    ref_amount = max(ref_amount, 100)  # floor at $1 to avoid divide-by-tiny
    amount_ratio = cand.amount_cents / ref_amount

    # robust spread (median absolute deviation) of the same reference set
    ref_set = cat_amounts if ref_basis == "category" else all_amounts
    if len(ref_set) >= 3:
        mad = median(abs(a - ref_amount) for a in ref_set) * 1.4826
    else:
        mad = 0.0
    spread = max(mad, 0.15 * ref_amount, 500)  # floor: 15% of typical, or $5
    z = (cand.amount_cents - ref_amount) / spread
    amount_deviation = math.copysign(math.log1p(min(abs(z), 200.0)), z)

    merchant_visits = sum(1 for h in hist if h.merchant_id == cand.merchant_id)
    category_share = (len(cat_amounts) / len(hist)) if hist else 0.0

    located = [h for h in hist if h.lat is not None and h.lon is not None]
    if cand.lat is not None and cand.lon is not None and located:
        c_lat = median(h.lat for h in located)
        c_lon = median(h.lon for h in located)
        distance_km = haversine_km(c_lat, c_lon, cand.lat, cand.lon)
    else:
        distance_km = 0.0  # online / unknown location: treated as neutral

    ch = _hour(ts)
    hour_density = (
        sum(1 for h in hist if _circ_hour_diff(_hour(h.ts), ch) <= 2.0) / len(hist)
        if hist
        else 0.0
    )

    txn_1h = sum(1 for h in hist if ts - h.ts <= timedelta(hours=1))
    txn_24h = sum(1 for h in hist if ts - h.ts <= timedelta(hours=24))

    spend_7d = sum(h.amount_cents for h in hist if ts - h.ts <= timedelta(days=7))
    if hist:
        span_days = max(7.0, (ts - min(h.ts for h in hist)).total_seconds() / 86400)
        avg_week = sum(all_amounts) / (span_days / 7.0)
    else:
        avg_week = 0.0
    spend_7d_ratio = (spend_7d + cand.amount_cents) / max(avg_week, 1000)

    topups_7d = sum(1 for t in topup_times if timedelta(0) <= ts - t <= timedelta(days=7))

    feats = {
        "log_amount_ratio": math.log(amount_ratio),
        "amount_deviation": amount_deviation,
        "merchant_visits_log": math.log1p(merchant_visits),
        "category_share": category_share,
        "log_distance_km": math.log1p(distance_km),
        "hour_density": hour_density,
        "txn_count_1h": float(txn_1h),
        "txn_count_24h": float(txn_24h),
        "spend_7d_ratio": spend_7d_ratio,
        "topups_7d": float(topups_7d),
    }
    raw = {
        "history_count": len(hist),
        "amount_cents": cand.amount_cents,
        "reference_amount_cents": int(ref_amount),
        "reference_basis": ref_basis,
        "amount_ratio": round(amount_ratio, 2),
        "amount_zscore": round(z, 1),
        "merchant_visits": merchant_visits,
        "category": cand.category,
        "category_txns": len(cat_amounts),
        "category_share": round(category_share, 3),
        "distance_km": round(distance_km, 1),
        "has_location": cand.lat is not None,
        "hour": round(ch, 2),
        "hour_density": round(hour_density, 3),
        "txn_count_1h": txn_1h,
        "txn_count_24h": txn_24h,
        "spend_7d_cents": int(spend_7d),
        "avg_week_cents": int(avg_week),
        "spend_7d_ratio": round(spend_7d_ratio, 2),
        "topups_7d": topups_7d,
    }
    return feats, raw
