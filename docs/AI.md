# How AutoTopUp AI uses artificial intelligence

## Two separate jobs, deliberately kept apart

| Component | Question it answers | Can it move money on its own? |
|---|---|---|
| **AI trust engine** (`app/ml/`) | *How normal is this purchase for this customer?* | No |
| **Policy engine** (`app/policy.py`) | *Is a transfer allowed at all, and how must the customer authorise it?* | Only via the workflow it selects, after every mandatory check passes |

The AI picks how much friction to add. It never decides *whether* a transfer is permitted.

## 1. Synthetic training data (`app/ml/synthetic.py`)

There is no real customer data, so the project generates a fictional population. The generated data is saved to `data/synthetic_transactions.csv`.

**Population**
- 260 customers across five Australian capital cities.
- Each customer has a home location, a spending "scale" and their own mix of categories: groceries, fuel, cafés, dining, pharmacy, online, retail and electronics.
- Each customer has 1–3 regular merchants per category, placed near home.

**Normal behaviour**
- Poisson-distributed weekly purchase rates.
- Each category has its own amount distribution and typical hours of the day.

**Realistic novelty (so "new" alone isn't suspicious)**
- About 12% of purchases are at a new nearby merchant.
- About 15% of customers take a 4-day interstate trip.
- Large electronics purchases are rare but possible.
- Occasional AutoTopUps.

**Injected anomalies (≈2%, labelled, used for evaluation only)**
- A large purchase far away in the early hours.
- Rapid bursts of purchases.
- A huge amount at a regular merchant.
- A large electronics purchase at night.

The first 21 days of each customer are history-only warm-up. That leaves **18,950 scored rows**: 15,160 for training and 3,790 held out.

## 2. Features (`app/ml/features.py`)

One function, `compute_features(history, topups, candidate)`, is used both to build training rows and to score a live card tap. Using the same code avoids train/serve skew. Every feature is relative to *this customer's* previous 90 days.

| Feature | Intelligence area | Meaning |
|---|---|---|
| `log_amount_ratio` | Spending | log(amount ÷ median spend in this category, or overall if fewer than 3 category purchases) |
| `amount_deviation` | Spending | Robust z-score (median absolute deviation) against the spread of that spend, signed log |
| `merchant_visits_log` | Merchant | log(1 + previous visits to this merchant) |
| `category_share` | Merchant | Share of history in this merchant category |
| `log_distance_km` | Location | Distance from the median location of past spending (online = neutral) |
| `hour_density` | Spending | Share of past purchases within ±2 h of this time of day |
| `txn_count_1h`, `txn_count_24h` | Spending | Unusual sequences and bursts |
| `spend_7d_ratio` | Spending | Last 7 days of spend, including this purchase, vs. a typical week |
| `topups_7d` | Account behaviour | AutoTopUps in the last 7 days |

**Financial health is handled separately, as a deterministic outlook.** It looks at:
- bills due before the next payday
- expected income
- the minimum savings reserve
- the projected 14-day position

It is kept out of the model on purpose, because "can the customer afford it" is a different question from "is this purchase unusual". A cash-flow risk rules out one-tap approval through the policy engine.

## 3. Model and calibration (`app/ml/trust_engine.py`)

**Model:** `IsolationForest(n_estimators=300, max_samples=512, contamination="auto")`. It is trained unsupervised, so the anomaly labels are never used for training.

**Calibration to an illustrative 0–100 trust score:**
- `trust = 100 / (1 + exp(-(s - c) / w))`, where `s` is the anomaly score.
- `c` is set so that the 3rd-percentile score of ordinary training purchases maps to 50.
- `w` is set so that the median ordinary purchase maps to 93.

**Bands (prototype thresholds, not validated risk thresholds):**
- 85–100: high
- 60–84: medium
- 0–59: low

**Synthetic hold-out results (illustrative only):**

| Metric | Value |
|---|---|
| Injected anomalies scored low-trust | 98.5% |
| Ordinary purchases scored low-trust | 5.5% |
| Ordinary purchases scored high-trust | 77.4% |

These numbers describe the model's behaviour on data we generated ourselves. They say nothing about real-world fraud detection.

### Live scenario outputs

| Scenario | Trust | Main drivers |
|---|---|---|
| 1 · $1,000 iPhone, Volt Electronics, Sydney | ≈ 10 (low) | ≈730 km from usual area, 28× typical purchase, amount far outside normal range, 7-day spend spike |
| 2 · $80 groceries, usual supermarket | ≈ 97 (high) | ≈20 visits in 90 days, amount at the category median, usual time and place |
| 3 · $75 fuel, usual station | ≈ 96 (high) | Weekly visits, normal amount, nearby |
| Custom · $290 fuel at the same familiar station | ≈ 73 (medium) | ≈4× normal fuel spend: needs biometrics or PIN despite the familiar merchant |

The automated test `test_scenarios_stable_across_dates` replays all three scenarios on 14 consecutive dates. It checks that each scenario always lands in the right workflow, whatever day you present.

## 4. Explainability

`TrustModel.assess` runs a **model-based perturbation attribution**:
1. Each feature in turn is replaced by its typical value (the median across ordinary training purchases).
2. The model is re-scored with that one change.
3. The difference in trust points is that feature's contribution.

This is the same idea as an occlusion test. The UI shows these as signed bars ("What moved the model's score") and sums them per area (merchant / spending / location / account).

`explain.py` then builds:
- **Five area summaries** (status, headline, detail) from the raw facts, e.g. "13 visits in the last 90 days" or "28.0× your typical purchase overall of $35.77".
- **A plain-English paragraph**, from a deterministic template that always works offline.
- Everything is generated locally from the model's output. No external AI service or API key is used, so the demo works offline and no spending data leaves the app.

## 5. What the AI is *not* allowed to do

- Override any mandatory check: enabled, accounts, funds, reserve, per-transfer limit, daily total, daily count, security hold, or consent.
- Make a first-time merchant skip enhanced verification when the customer has asked for it.
- Move money without the customer's approval. Every workflow asks; the lightest one is a single tap.
- Offer one-tap approval outside the one-tap hours, for a merchant it doesn't recognise from history, or when bills before payday wouldn't be covered.
- Be presented as a fraud probability.
