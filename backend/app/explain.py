"""Turns the AI model's output + raw facts into plain-English explanations.

Everything runs locally: the explanation is generated from the Isolation Forest
results and the customer's own data. No external AI service or API key is used.
"""
from __future__ import annotations

from .policy import WORKFLOW_LABELS, fmt

CATEGORY_NAMES = {
    "grocery": "groceries", "fuel": "fuel", "cafe": "cafés", "dining": "dining",
    "health": "pharmacy", "online": "online shopping", "retail": "retail",
    "electronics": "electronics",
}


def _hour_label(h: float) -> str:
    hh = int(h) % 24
    mm = int(round((h - int(h)) * 60))
    suffix = "am" if hh < 12 else "pm"
    return f"{(hh % 12) or 12}:{mm:02d}{suffix}"


def group_summaries(raw: dict, contributions: list[dict], merchant: dict, finance: dict, account: dict) -> list[dict]:
    impact = {}
    for c in contributions:
        impact[c["group"]] = impact.get(c["group"], 0.0) + c["impact"]
    cat = CATEGORY_NAMES.get(raw["category"], raw["category"])
    groups = []

    # Merchant intelligence
    v = raw["merchant_visits"]
    if v >= 5:
        st, head = "good", f"Familiar merchant — {v} visits in the last 90 days"
    elif v >= 1:
        st, head = "neutral", f"Occasional merchant — {v} visit{'s' if v != 1 else ''} in 90 days"
    else:
        st, head = "concern", "First purchase with this merchant"
    detail = (f"{raw['category_txns']} {cat} purchases in your history"
              if raw["category_txns"] else f"No previous {cat} purchases in your history")
    groups.append({"id": "merchant", "title": "Merchant familiarity", "status": st, "headline": head,
                   "detail": detail, "model_impact": round(impact.get("merchant", 0), 1)})

    # Spending intelligence
    r = raw["amount_ratio"]
    ref = fmt(raw["reference_amount_cents"])
    basis = f"typical {cat} purchase" if raw["reference_basis"] == "category" else "typical purchase overall"
    if r <= 1.6:
        st, head = "good", f"Normal amount — close to your {basis} of {ref}"
    elif r <= 3.5:
        st, head = "neutral", f"Higher than usual — {r:.1f}× your {basis} of {ref}"
    else:
        st, head = "concern", f"Unusually large — {r:.1f}× your {basis} of {ref}"
    bits = []
    if raw["hour_density"] < 0.04:
        bits.append(f"{_hour_label(raw['hour'])} is an unusual time for you")
        st = "concern" if st != "good" else "neutral"
    else:
        bits.append(f"{_hour_label(raw['hour'])} fits your usual spending times")
    if raw["txn_count_1h"] >= 3:
        bits.append(f"{raw['txn_count_1h']} purchases in the last hour")
        st = "concern"
    bits.append(f"{fmt(raw['spend_7d_cents'])} spent in the last 7 days (typical week {fmt(raw['avg_week_cents'])})")
    groups.append({"id": "spending", "title": "Spending pattern", "status": st, "headline": head,
                   "detail": "; ".join(bits), "model_impact": round(impact.get("spending", 0), 1)})

    # Location intelligence
    d = raw["distance_km"]
    if not raw["has_location"]:
        st, head, det = "neutral", "Online purchase — no location", "Location is not used for online merchants"
    elif d < 25:
        st, head, det = "good", "Within your usual spending area", f"{d:.0f} km from where you usually shop ({merchant['suburb']})"
    elif d < 150:
        st, head, det = "neutral", "Outside your usual area", f"{d:.0f} km from where you usually shop ({merchant['suburb']})"
    else:
        st, head, det = "concern", "Far from your usual spending area", f"{d:,.0f} km away in {merchant['suburb']}"
    groups.append({"id": "location", "title": "Location", "status": st, "headline": head, "detail": det,
                   "model_impact": round(impact.get("location", 0), 1)})

    # Account behaviour
    t7 = raw["topups_7d"]
    req = account["requests_24h"]
    if t7 <= 1 and req < 2:
        st = "good"
        head = "Normal AutoTopUp usage"
    elif req >= 3 or t7 >= 3:
        st, head = "concern", "Repeated top-up requests"
    else:
        st, head = "neutral", "Several recent top-ups"
    det = (f"{t7} AutoTopUp{'s' if t7 != 1 else ''} in the last 7 days, {account['topups_90d']} in 90 days; "
           f"{req} request{'s' if req != 1 else ''} in the last 24 hours")
    groups.append({"id": "account", "title": "Account behaviour", "status": st, "headline": head, "detail": det,
                   "model_impact": round(impact.get("account", 0), 1)})

    # Financial health (deterministic cash-flow outlook)
    st = {"HEALTHY": "good", "CAUTION": "neutral", "AT_RISK": "concern"}[finance["status"]]
    groups.append({"id": "financial", "title": "Financial health", "status": st, "headline": finance["headline"],
                   "detail": finance["detail"], "model_impact": None})
    return groups


def template_explanation(merchant: dict, amount_cents: int, shortfall_cents: int, trust: dict,
                         groups: list[dict], policy: dict) -> str:
    good = [(lambda h: h[0].lower() + h[1:])(g["headline"].split(" — ")[0]) for g in groups if g["status"] == "good" and g["id"] != "financial"]
    concern = [g["headline"] for g in groups if g["status"] == "concern"]
    band = trust["trust_band"]
    opener = {
        "HIGH": f"This {fmt(amount_cents)} purchase at {merchant['name']} looks routine for you.",
        "MEDIUM": f"This {fmt(amount_cents)} purchase at {merchant['name']} is a little different from your usual pattern.",
        "LOW": f"This {fmt(amount_cents)} purchase at {merchant['name']} looks unusual compared with your history.",
    }[band]
    parts = [opener]
    if good:
        parts.append("Supporting signals: " + ", ".join(good) + ".")
    if concern:
        parts.append("What stood out: " + "; ".join(h[0].lower() + h[1:] for h in concern) + ".")
    wf = policy["workflow"]
    if wf == "BLOCKED":
        parts.append("A mandatory rule stopped the top-up: " + "; ".join(policy["workflow_reasons"]) + ". No money was moved.")
    else:
        action = {
            "QUICK_APPROVE": f"Nothing moves until you say yes: approve the {fmt(shortfall_cents)} transfer with a single tap, or decline.",
            "STANDARD_AUTH": f"Please approve the {fmt(shortfall_cents)} transfer and confirm it's you.",
            "ENHANCED_AUTH": f"To protect you, the {fmt(shortfall_cents)} transfer needs your PIN and confirmation that you recognise this purchase.",
        }[wf]
        parts.append(action)
    return " ".join(parts)


def explain(merchant, amount_cents, shortfall_cents, trust, groups, policy) -> dict:
    text = template_explanation(merchant, amount_cents, shortfall_cents, trust, groups, policy)
    return {"text": text, "source": "local", "template_text": text}
