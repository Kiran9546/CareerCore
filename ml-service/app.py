"""
CareerCore — ML Service
========================

Flask service exposing model inference to the Express API.

    POST /ml/predict-career    Random Forest, top-3 with confidence
    POST /ml/skill-gap         Cosine similarity + priority-ranked gaps
    POST /ml/rank-candidates   Batch skill scoring for recruiters
    POST /ml/gap-comparison    Weighted vs unweighted ablation (for the report)

─── PROVENANCE ───────────────────────────────────────────────────────
Random Forest: Breiman (2001). Confidence = max(predict_proba), which is
the proportion of trees voting for the winning class — standard practice.

Returning top-3 rather than a single prediction is a project decision:
career prediction from a student profile is genuinely uncertain, and the
confusion matrix shows real overlap between adjacent paths (Cloud/DevOps,
Data Analyst/ML Engineer). Presenting three ranked options with honest
confidence values is more useful to the student and more defensible than
a single confident-looking answer.

MODEL LIMITATION: trained on synthetically generated profiles (see
notebooks/generate_dataset.py). Reported accuracy reflects performance on
that synthetic distribution. Deployment would require retraining on
historical institutional placement records.
─────────────────────────────────────────────────────────────────────────

Internal service. Never expose port 5000 publicly.
"""

import json
import os

import joblib
import numpy as np
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

from models.skill_gap import analyze_gap, analyze_gap_unweighted

load_dotenv()

HERE = os.path.dirname(os.path.abspath(__file__))
ARTIFACTS = os.path.join(HERE, "artifacts")
MODEL_PATH = os.path.join(ARTIFACTS, "career_rf_v1.joblib")
INDEX_PATH = os.path.join(ARTIFACTS, "skill_index.json")

app = Flask(__name__)
CORS(app)

model = None
feature_index = None


def load_artifacts():
    """Load the model and feature index once at startup, not per request."""
    global model, feature_index

    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"Model not found at {MODEL_PATH}. Run notebooks/train_model.py first."
        )
    if not os.path.exists(INDEX_PATH):
        raise FileNotFoundError(
            f"Feature index not found at {INDEX_PATH}. Run notebooks/train_model.py first."
        )

    model = joblib.load(MODEL_PATH)
    with open(INDEX_PATH) as f:
        feature_index = json.load(f)

    print(f"Model loaded: {len(feature_index['classes'])} classes, "
          f"{len(feature_index['feature_order'])} features")


def build_feature_vector(payload):
    """
    Construct model input in the EXACT column order used during training.

    This is why skill_index.json exists. Build the vector in any other
    order and the model receives Python's proficiency where SQL's belongs.
    It will not raise an error — it will return confident nonsense, which
    is far harder to detect than a crash.
    """
    order = feature_index["feature_order"]

    skill_map = {
        s.get("name"): float(s.get("proficiency", 3)) / 5.0
        for s in payload.get("skills", [])
    }

    numeric = {
        "cgpa": float(payload.get("cgpa", 0)),
        "backlogs": float(payload.get("backlogs", 0)),
        "apt_quantitative": float(payload.get("aptQuantitative", 0)),
        "apt_logical": float(payload.get("aptLogical", 0)),
        "apt_verbal": float(payload.get("aptVerbal", 0)),
        "apt_technical": float(payload.get("aptTechnical", 0)),
        "num_projects": float(payload.get("numProjects", 0)),
        "num_certifications": float(payload.get("numCertifications", 0)),
    }

    vec = []
    for col in order:
        if col.startswith("skill_"):
            vec.append(skill_map.get(col.replace("skill_", ""), 0.0))
        else:
            vec.append(numeric.get(col, 0.0))

    return np.array(vec, dtype=float).reshape(1, -1)


# ─── Endpoints ───────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "careercore-ml",
        "modelLoaded": model is not None,
        "classes": feature_index["classes"] if feature_index else [],
    })


@app.route("/ml/predict-career", methods=["POST"])
def predict_career():
    """
    Body: { cgpa, backlogs, aptQuantitative, aptLogical, aptVerbal,
            aptTechnical, numProjects, numCertifications,
            skills: [{ name, proficiency }] }

    Returns top-3 predictions with confidence (Blueprint 5.5).
    """
    try:
        payload = request.get_json(force=True)
        X = build_feature_vector(payload)

        probs = model.predict_proba(X)[0]
        classes = model.classes_

        ranked = sorted(zip(classes, probs), key=lambda t: t[1], reverse=True)
        top3 = [
            {"careerPath": c, "confidence": round(float(p), 4)}
            for c, p in ranked[:3]
        ]

        return jsonify({
            "predictions": top3,
            "topPrediction": top3[0]["careerPath"],
            "confidence": top3[0]["confidence"],
            "note": "Trained on synthetic data; see model limitations.",
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/ml/skill-gap", methods=["POST"])
def skill_gap():
    """
    Body: { studentSkills: [{name, proficiency}],
            requiredSkills: [{name, weight}],
            topN: 10 }

    Returns similarity, skillScore (= S in PRS), and priority-ranked gaps.
    """
    try:
        payload = request.get_json(force=True)

        result = analyze_gap(
            student_skills=payload.get("studentSkills", []),
            required_skills=payload.get("requiredSkills", []),
            skill_names=feature_index["skill_names"],
            top_n=int(payload.get("topN", 10)),
        )
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/ml/gap-comparison", methods=["POST"])
def gap_comparison():
    """
    Ablation endpoint for the Phase 2 report.

    Returns gap rankings computed BOTH ways — weighted by importance and
    by raw deficit — so the report can show whether the weighting actually
    changes the recommendations a student receives.
    """
    try:
        payload = request.get_json(force=True)
        names = feature_index["skill_names"]
        student = payload.get("studentSkills", [])
        required = payload.get("requiredSkills", [])

        weighted = analyze_gap(student, required, names, top_n=10)
        unweighted = analyze_gap_unweighted(student, required, names, top_n=10)

        w_order = [g["skill"] for g in weighted["gaps"]]
        u_order = [g["skill"] for g in unweighted["gaps"]]

        return jsonify({
            "weightedRanking": w_order,
            "unweightedRanking": u_order,
            "rankingsDiffer": w_order != u_order,
            "weightedDetail": weighted["gaps"],
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/ml/rank-candidates", methods=["POST"])
def rank_candidates():
    """
    Body: { candidates: [{ id, skills: [{name, proficiency}] }],
            requiredSkills: [{name, weight}] }

    Batch skill scoring. Express combines these with PRS and CGPA to
    produce the final match score (Blueprint 5.6).
    """
    try:
        payload = request.get_json(force=True)
        required = payload.get("requiredSkills", [])
        names = feature_index["skill_names"]

        scored = []
        for c in payload.get("candidates", []):
            r = analyze_gap(c.get("skills", []), required, names, top_n=5)
            scored.append({
                "id": c.get("id"),
                "skillScore": r["skillScore"],
                "matchedCount": r["matchedCount"],
                "topGaps": [g["skill"] for g in r["gaps"][:3]],
            })

        scored.sort(key=lambda x: x["skillScore"], reverse=True)
        return jsonify({"candidates": scored})

    except Exception as e:
        return jsonify({"error": str(e)}), 400


load_artifacts()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"CareerCore ML service running on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)