"""AI trust-scoring engine.

An Isolation Forest is trained (unsupervised) on the synthetic population of
ordinary card spending. For a live purchase it returns:

* the raw anomaly score (Isolation Forest decision function; lower = more unusual)
* an illustrative 0-100 trust score (a calibrated squash of the anomaly score)
* per-feature contributions, computed by a model-based perturbation test:
  each feature is reset to a "typical" reference value and the change in the
  model's score is measured. Features whose typical value would raise the
  score are what made this purchase look unusual, and vice versa.

The trust score is a prototype signal for choosing an authorisation workflow.
It is NOT a fraud probability and is never allowed to override the
deterministic policy engine.
"""
from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest

from .features import FEATURE_GROUP, FEATURE_LABELS, FEATURES
from .synthetic import build_dataset, write_csv

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
MODEL_PATH = DATA_DIR / "trust_model.joblib"
DATASET_PATH = DATA_DIR / "synthetic_transactions.csv"
META_PATH = DATA_DIR / "model_meta.json"
MODEL_VERSION = "iforest-v1"


def trust_band(score: float) -> str:
    if score >= 85:
        return "HIGH"
    if score >= 60:
        return "MEDIUM"
    return "LOW"


class TrustModel:
    def __init__(self, model: IsolationForest, center: float, width: float,
                 reference: dict[str, float], meta: dict):
        self.model = model
        self.center = center
        self.width = width
        self.reference = reference
        self.meta = meta

    # ---------- scoring ----------
    def _vec(self, feats: dict[str, float]) -> np.ndarray:
        return np.array([[feats[f] for f in FEATURES]], dtype=float)

    def anomaly_score(self, feats: dict[str, float]) -> float:
        return float(self.model.decision_function(self._vec(feats))[0])

    def to_trust(self, s: float) -> float:
        z = (s - self.center) / self.width
        z = max(min(z, 50), -50)
        return 100.0 / (1.0 + math.exp(-z))

    def assess(self, feats: dict[str, float]) -> dict:
        s = self.anomaly_score(feats)
        trust = self.to_trust(s)
        # perturbation attribution: batch all "what if this feature were typical" variants
        base = self._vec(feats)
        variants = np.repeat(base, len(FEATURES), axis=0)
        for i, f in enumerate(FEATURES):
            variants[i, i] = self.reference[f]
        alt_scores = self.model.decision_function(variants)
        contributions = []
        for i, f in enumerate(FEATURES):
            alt_trust = self.to_trust(float(alt_scores[i]))
            impact = trust - alt_trust  # negative => this feature lowered trust
            contributions.append({
                "feature": f,
                "label": FEATURE_LABELS[f],
                "group": FEATURE_GROUP[f],
                "value": round(feats[f], 4),
                "typical_value": round(self.reference[f], 4),
                "impact": round(impact, 1),
            })
        contributions.sort(key=lambda c: c["impact"])
        return {
            "model_version": MODEL_VERSION,
            "anomaly_score": round(s, 4),
            "trust_score": int(round(trust)),
            "trust_band": trust_band(trust),
            "contributions": contributions,
        }


def train(n_customers: int = 260, seed: int = 2026, write_dataset: bool = True) -> TrustModel:
    t0 = time.time()
    rows = build_dataset(n_customers=n_customers, seed=seed)
    if write_dataset:
        write_csv(rows, DATASET_PATH)
    X = np.array([[r[f] for f in FEATURES] for r in rows], dtype=float)
    y = np.array([r["is_injected_anomaly"] for r in rows])

    rng = np.random.default_rng(seed)
    idx = rng.permutation(len(X))
    split = int(len(X) * 0.8)
    tr, te = idx[:split], idx[split:]

    model = IsolationForest(n_estimators=300, max_samples=512, contamination="auto",
                            random_state=seed)
    model.fit(X[tr])  # unsupervised: labels are not used

    tr_scores = model.decision_function(X[tr])
    normal_tr = tr_scores[y[tr] == 0]
    # Calibration (illustrative): the 3rd-percentile score of ordinary spending
    # maps to trust 50, the median ordinary score maps to trust 93.
    center = float(np.quantile(normal_tr, 0.03))
    med = float(np.median(normal_tr))
    width = (med - center) / math.log(93 / 7)

    normal_X = X[tr][y[tr] == 0]
    reference = {f: float(np.median(normal_X[:, i])) for i, f in enumerate(FEATURES)}

    tm = TrustModel(model, center, width, reference, {})
    te_trust = np.array([tm.to_trust(s) for s in model.decision_function(X[te])])
    y_te = y[te]
    flagged = te_trust < 60
    meta = {
        "model_version": MODEL_VERSION,
        "algorithm": "IsolationForest (scikit-learn)",
        "n_estimators": 300,
        "features": FEATURES,
        "training_rows": int(len(tr)),
        "test_rows": int(len(te)),
        "synthetic_customers": n_customers,
        "injected_anomaly_share": round(float(y.mean()), 4),
        "calibration": {"center": center, "width": width},
        "evaluation_on_synthetic_holdout": {
            "note": "Illustrative only: measured on synthetic data with injected anomalies.",
            "anomalies_flagged_low_trust": round(float(flagged[y_te == 1].mean()), 3) if (y_te == 1).any() else None,
            "ordinary_flagged_low_trust": round(float(flagged[y_te == 0].mean()), 3),
            "ordinary_high_trust_share": round(float((te_trust[y_te == 0] >= 85).mean()), 3),
        },
        "trained_in_seconds": round(time.time() - t0, 2),
    }
    tm.meta = meta
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "center": center, "width": width,
                 "reference": reference, "meta": meta}, MODEL_PATH)
    META_PATH.write_text(json.dumps(meta, indent=2))
    return tm


_cached: Optional[TrustModel] = None


def get_model() -> TrustModel:
    global _cached
    if _cached is None:
        try:
            b = joblib.load(MODEL_PATH)
            if b["meta"].get("features") != FEATURES:
                raise ValueError("feature set changed")
            _cached = TrustModel(b["model"], b["center"], b["width"], b["reference"], b["meta"])
        except Exception:
            # missing file, incompatible scikit-learn version or stale features: retrain (~5s)
            _cached = train()
    return _cached


if __name__ == "__main__":
    m = train()
    print(json.dumps(m.meta, indent=2))
