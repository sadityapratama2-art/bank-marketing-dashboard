"""
prepare_data.py
---------------
Reads train.csv and writes bank_data.json for the dashboard.

Outputs
-------
bank_data.json with:
  - labels      : category index → label mappings for each categorical column
  - rows        : row-level data encoded as compact integer indexes
  - col_order   : column order for rows
  - threshold_curve : list of {threshold, contacted, tp, precision, recall}
  - validation  : {size, positives, roc_auc}
"""

import csv
import json
import math
from collections import defaultdict

# ── 0. Config ──────────────────────────────────────────────────────────────
CSV_PATH    = "train.csv"
OUTPUT_PATH = "bank_data.json"
RANDOM_SEED = 42
TEST_SIZE   = 0.20

BALANCE_BANDS = [
    ("<0",        lambda b: b < 0),
    ("0",         lambda b: b == 0),
    ("1-500",     lambda b: 1 <= b <= 500),
    ("501-1500",  lambda b: 501 <= b <= 1500),
    ("1501-5000", lambda b: 1501 <= b <= 5000),
    (">5000",     lambda b: b > 5000),
]

CALL_BANDS = [
    ("1-9",  lambda c: 1 <= c <= 9),
    ("10+",  lambda c: c >= 10),
]

AGE_BANDS = [
    ("<25",   lambda a: a < 25),
    ("25-34", lambda a: 25 <= a <= 34),
    ("35-44", lambda a: 35 <= a <= 44),
    ("45-54", lambda a: 45 <= a <= 54),
    ("55-64", lambda a: 55 <= a <= 64),
    ("65+",   lambda a: a >= 65),
]

# ── 1. Load CSV ─────────────────────────────────────────────────────────────
def load_csv(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        for r in reader:
            rows.append(r)
    return rows

# ── 2. Build category index maps ────────────────────────────────────────────
CAT_COLS = ["job","marital","education","default","housing","loan",
            "contact","month","poutcome","y"]
NUM_COLS = ["age","balance","day","duration","campaign","pdays","previous"]

def build_labels(rows):
    labels = {}
    for col in CAT_COLS:
        seen = {}
        for r in rows:
            v = r[col]
            if v not in seen:
                seen[v] = len(seen)
        labels[col] = {v: i for v, i in seen.items()}  # str→int
    return labels

# ── 3. Assign helper bands ───────────────────────────────────────────────────
def assign_bands(rows):
    for r in rows:
        b = int(r["balance"])
        for name, fn in BALANCE_BANDS:
            if fn(b):
                r["balance_band"] = name
                break
        c = int(r["campaign"])
        for name, fn in CALL_BANDS:
            if fn(c):
                r["call_band"] = name
                break
        a = int(r["age"])
        for name, fn in AGE_BANDS:
            if fn(a):
                r["age_band"] = name
                break

# ── 4. Encode rows compactly ─────────────────────────────────────────────────
BAND_COLS = ["balance_band","call_band","age_band"]

def encode_rows(rows, labels):
    # Build band label maps
    band_labels = {}
    for col in BAND_COLS:
        seen = {}
        for r in rows:
            v = r.get(col, "")
            if v not in seen:
                seen[v] = len(seen)
        band_labels[col] = seen

    all_labels = {**labels}
    for col, mapping in band_labels.items():
        all_labels[col] = mapping

    col_order = CAT_COLS + NUM_COLS + BAND_COLS
    encoded = []
    for r in rows:
        row_enc = []
        for col in col_order:
            if col in all_labels:
                row_enc.append(all_labels[col].get(r.get(col, ""), 0))
            else:
                v = r.get(col, "0")
                try:
                    row_enc.append(int(v))
                except ValueError:
                    row_enc.append(0)
        encoded.append(row_enc)

    # Invert: int→str for labels so JS can look up display text
    inv_labels = {}
    for col, mapping in all_labels.items():
        inv_labels[col] = {str(i): v for v, i in mapping.items()}

    return col_order, encoded, inv_labels

# ── 5. Logistic Regression (pure Python, no sklearn) ─────────────────────────
def sigmoid(z):
    if z >= 0:
        return 1.0 / (1.0 + math.exp(-z))
    ez = math.exp(z)
    return ez / (1.0 + ez)

def normalize_features(X):
    n_feat = len(X[0])
    means  = [0.0] * n_feat
    stds   = [1.0] * n_feat
    n      = len(X)
    for j in range(n_feat):
        col_vals = [X[i][j] for i in range(n)]
        means[j] = sum(col_vals) / n
        variance = sum((v - means[j])**2 for v in col_vals) / n
        stds[j]  = math.sqrt(variance) if variance > 0 else 1.0
    X_norm = []
    for row in X:
        X_norm.append([(row[j] - means[j]) / stds[j] for j in range(n_feat)])
    return X_norm, means, stds

def apply_norm(X, means, stds):
    return [[(row[j] - means[j]) / stds[j] for j in range(len(row))] for row in X]

def logistic_train(X, y, lr=0.1, epochs=200):
    n_feat = len(X[0])
    w = [0.0] * n_feat
    b = 0.0
    n = len(X)
    for _ in range(epochs):
        dw = [0.0] * n_feat
        db = 0.0
        for i in range(n):
            z    = sum(w[j] * X[i][j] for j in range(n_feat)) + b
            pred = sigmoid(z)
            err  = pred - y[i]
            for j in range(n_feat):
                dw[j] += err * X[i][j]
            db += err
        w = [w[j] - lr * dw[j] / n for j in range(n_feat)]
        b = b - lr * db / n
    return w, b

def logistic_predict_proba(X, w, b):
    return [sigmoid(sum(w[j] * row[j] for j in range(len(w))) + b) for row in X]

def roc_auc(y_true, y_score):
    pairs = sorted(zip(y_score, y_true), reverse=True)
    n_pos = sum(y_true)
    n_neg = len(y_true) - n_pos
    if n_pos == 0 or n_neg == 0:
        return 0.5
    tp = 0; fp = 0; prev_tp = 0; prev_fp = 0; auc = 0.0
    prev_score = None
    for score, label in pairs:
        if score != prev_score and prev_score is not None:
            auc += (fp - prev_fp) * (tp + prev_tp) / 2
            prev_fp = fp; prev_tp = tp
        if label == 1:
            tp += 1
        else:
            fp += 1
        prev_score = score
    auc += (fp - prev_fp) * (tp + prev_tp) / 2
    return auc / (n_pos * n_neg)

def build_threshold_curve(y_true, y_proba, thresholds):
    n_val = len(y_true)
    n_pos = sum(y_true)
    curve = []
    for t in thresholds:
        t_r = round(t, 2)
        contacted = sum(1 for p in y_proba if p >= t_r)
        tp = sum(1 for p, lbl in zip(y_proba, y_true) if p >= t_r and lbl == 1)
        precision = tp / contacted if contacted > 0 else 0.0
        recall    = tp / n_pos    if n_pos    > 0 else 0.0
        curve.append({
            "threshold": t_r,
            "contacted": contacted,
            "tp":        tp,
            "precision": round(precision, 4),
            "recall":    round(recall, 4),
        })
    return curve

# ── 6. Stratified train/val split ───────────────────────────────────────────
def stratified_split(rows, labels, test_size=0.20, seed=42):
    import random
    rng = random.Random(seed)
    pos = [r for r in rows if r["y"] == "yes"]
    neg = [r for r in rows if r["y"] == "no"]
    rng.shuffle(pos); rng.shuffle(neg)
    n_pos_val = int(len(pos) * test_size)
    n_neg_val = int(len(neg) * test_size)
    val   = pos[:n_pos_val] + neg[:n_neg_val]
    train = pos[n_pos_val:] + neg[n_neg_val:]
    rng.shuffle(val); rng.shuffle(train)
    return train, val

# ── 7. Build feature matrix (exclude duration) ──────────────────────────────
LR_NUM_COLS = ["age","balance","day","campaign","pdays","previous"]
LR_CAT_COLS = ["job","marital","education","default","housing","loan",
               "contact","month","poutcome"]

def row_to_features(r, labels):
    feats = []
    for col in LR_NUM_COLS:
        try:
            feats.append(float(r[col]))
        except (ValueError, KeyError):
            feats.append(0.0)
    for col in LR_CAT_COLS:
        # ordinal encoding (simple but works for LR baseline)
        idx = labels[col].get(r[col], 0)
        feats.append(float(idx))
    return feats

# ── 8. Main ──────────────────────────────────────────────────────────────────
def main():
    print("Loading data…")
    rows = load_csv(CSV_PATH)
    print(f"  {len(rows)} rows loaded")

    # Bands
    assign_bands(rows)

    # Build category labels
    labels = build_labels(rows)

    # Encode rows
    col_order, encoded_rows, inv_labels = encode_rows(rows, labels)

    # Stratified split
    train_rows, val_rows = stratified_split(rows, labels, TEST_SIZE, RANDOM_SEED)
    print(f"  Train: {len(train_rows)}, Val: {len(val_rows)}")

    # Feature matrices
    X_train = [row_to_features(r, labels) for r in train_rows]
    y_train = [1 if r["y"] == "yes" else 0 for r in train_rows]
    X_val   = [row_to_features(r, labels) for r in val_rows]
    y_val   = [1 if r["y"] == "yes" else 0 for r in val_rows]

    print("Normalising features…")
    X_train_n, means, stds = normalize_features(X_train)
    X_val_n = apply_norm(X_val, means, stds)

    print("Training logistic regression (200 epochs)…")
    w, b = logistic_train(X_train_n, y_train, lr=0.1, epochs=200)

    print("Evaluating…")
    y_proba = logistic_predict_proba(X_val_n, w, b)
    auc = roc_auc(y_val, y_proba)
    print(f"  ROC-AUC: {auc:.4f}")

    thresholds = [round(t * 0.01, 2) for t in range(0, 81)]
    curve = build_threshold_curve(y_val, y_proba, thresholds)

    validation = {
        "size":     len(y_val),
        "positives": sum(y_val),
        "roc_auc":  round(auc, 4),
    }

    output = {
        "labels":           inv_labels,
        "col_order":        col_order,
        "rows":             encoded_rows,
        "threshold_curve":  curve,
        "validation":       validation,
    }

    print(f"Writing {OUTPUT_PATH}…")
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=True, separators=(",", ":"))
    print("Done - OK")

if __name__ == "__main__":
    main()
