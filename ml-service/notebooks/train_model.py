"""
CareerCore — Career Prediction Model Training
==============================================

Trains a Random Forest classifier on the synthetic dataset and saves:
  artifacts/career_rf_v1.joblib   the trained pipeline
  artifacts/skill_index.json      feature ordering (CRITICAL for inference)
  artifacts/metrics.json          evaluation metrics for the Phase 2 report

Blueprint reference: Sections 5.5 and 10.

Usage:
    python train_model.py
"""

import json
import os
import time

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, classification_report,
                             confusion_matrix, f1_score)
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, "..", "data", "career_dataset.csv"))
ARTIFACTS = os.path.normpath(os.path.join(HERE, "..", "artifacts"))
SEED = 42

# Columns that are metadata, not features
DROP_COLS = ["career_path", "branch", "is_ambiguous", "edge_case"]


def load_data():
    df = pd.read_csv(DATA)
    X = df.drop(columns=DROP_COLS)
    y = df["career_path"]
    print(f"Loaded {len(df)} rows, {X.shape[1]} features, {y.nunique()} classes")
    return X, y


def compare_baselines(X_tr, X_te, y_tr, y_te):
    """Blueprint 10.2 — justifies choosing Random Forest with evidence."""
    models = {
        "Logistic Regression": Pipeline([
            ("scale", StandardScaler()),
            ("clf", LogisticRegression(max_iter=2000, random_state=SEED)),
        ]),
        "Decision Tree": DecisionTreeClassifier(max_depth=18, random_state=SEED),
        "Random Forest": Pipeline([
            ("scale", StandardScaler()),
            ("clf", RandomForestClassifier(
                n_estimators=300, max_depth=18,
                class_weight="balanced", random_state=SEED, n_jobs=-1,
            )),
        ]),
    }

    results = {}
    print(f"\n{'Model':<22}{'Accuracy':>10}{'Macro F1':>10}{'Time(s)':>9}")
    print("-" * 51)

    for name, model in models.items():
        t0 = time.time()
        model.fit(X_tr, y_tr)
        elapsed = time.time() - t0

        pred = model.predict(X_te)
        acc = accuracy_score(y_te, pred)
        f1 = f1_score(y_te, pred, average="macro")

        results[name] = {"accuracy": round(acc, 4),
                         "macro_f1": round(f1, 4),
                         "train_seconds": round(elapsed, 2)}
        print(f"{name:<22}{acc:>10.4f}{f1:>10.4f}{elapsed:>9.2f}")

    return models["Random Forest"], results


def evaluate(model, X, y, X_te, y_te):
    pred = model.predict(X_te)

    print("\n" + "=" * 60)
    print("CLASSIFICATION REPORT")
    print("=" * 60)
    print(classification_report(y_te, pred, digits=3))

    labels = sorted(y.unique())
    cm = confusion_matrix(y_te, pred, labels=labels)
    short = {l: l.split()[0][:6].upper() for l in labels}

    print("CONFUSION MATRIX (rows=true, cols=predicted)")
    print(" " * 8 + "".join(f"{short[l]:>8}" for l in labels))
    for i, l in enumerate(labels):
        print(f"{short[l]:>7} " + "".join(f"{v:>8}" for v in cm[i]))

    cv = cross_val_score(model, X, y, cv=5, n_jobs=-1)
    print(f"\n5-fold CV: {cv.mean():.4f} +/- {cv.std():.4f}")
    print(f"Folds: {[round(s, 4) for s in cv]}")

    rf = model.named_steps["clf"]
    importances = pd.Series(rf.feature_importances_, index=X_te.columns)
    top = importances.sort_values(ascending=False)[:15]

    print("\nTOP 15 FEATURE IMPORTANCES")
    for k, v in top.items():
        bar = "#" * int(v * 400)
        print(f"  {k.replace('skill_', ''):<32}{v:.4f}  {bar}")

    return {
        "report": classification_report(y_te, pred, digits=3, output_dict=True),
        "confusion_matrix": {"labels": labels, "matrix": cm.tolist()},
        "cross_validation": {
            "mean": round(float(cv.mean()), 4),
            "std": round(float(cv.std()), 4),
            "folds": [round(float(s), 4) for s in cv],
        },
        "top_features": {k: round(float(v), 4) for k, v in top.items()},
    }


def main():
    os.makedirs(ARTIFACTS, exist_ok=True)

    X, y = load_data()
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=SEED
    )
    print(f"Train: {len(X_tr)}  Test: {len(X_te)}")

    rf, baselines = compare_baselines(X_tr, X_te, y_tr, y_te)
    metrics = evaluate(rf, X, y, X_te, y_te)
    metrics["baselines"] = baselines
    metrics["classes"] = sorted(y.unique())
    metrics["n_samples"] = len(X)
    metrics["n_features"] = X.shape[1]

    # Save the model
    model_path = os.path.join(ARTIFACTS, "career_rf_v1.joblib")
    joblib.dump(rf, model_path)
    print(f"\nModel saved -> {model_path}")

    # Feature ordering — inference MUST build vectors in this exact order
    feature_order = list(X.columns)
    skill_features = [c for c in feature_order if c.startswith("skill_")]
    index_path = os.path.join(ARTIFACTS, "skill_index.json")
    with open(index_path, "w") as f:
        json.dump({
            "feature_order": feature_order,
            "numeric_features": [c for c in feature_order if not c.startswith("skill_")],
            "skill_features": skill_features,
            "skill_names": [c.replace("skill_", "") for c in skill_features],
            "classes": sorted(y.unique()),
        }, f, indent=2)
    print(f"Feature index saved -> {index_path}")

    metrics_path = os.path.join(ARTIFACTS, "metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"Metrics saved -> {metrics_path}")


if __name__ == "__main__":
    main()