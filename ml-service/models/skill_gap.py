"""
CareerCore — Skill Gap Analysis
================================

Implements Blueprint Section 5.4.

─── PROVENANCE ───────────────────────────────────────────────────────

ESTABLISHED METHOD:
    Cosine similarity between a student skill vector and a target skill
    vector. Salton, Wong & Yang (1975), "A Vector Space Model for
    Automatic Indexing". Standard practice in skill-matching and
    recommender systems. Specified in Phase 1 Section 4.2.2.

        similarity = (V_s . V_t) / (||V_s|| ||V_t||)

PROJECT DESIGN DECISIONS (not from published research):

    1. Vector construction. Phase 1 specifies cosine similarity but does
       not define the vectors. This project defines:
           V_s[i] = proficiency_i / 5      (0 if not held)
           V_t[i] = omega_i                (importance weight, 0 if not required)
       The 1-5 proficiency scale and its linear mapping to [0,1] are
       team decisions.

    2. Weighted gap ranking. Cosine similarity alone yields a single
       scalar. Phase 1 promises a "required skills list" but gives no
       ranking method. This project ranks by:

           priority(i) = omega_i * (V_t[i] - V_s[i])

       Multiplying deficit by importance is the contribution here.
       Ranking by raw deficit alone would place a large gap in a
       peripheral skill above a small gap in a critical one, producing
       advice that is confidently wrong. This weighting is a reasoned
       design choice, not a validated formula.

    3. The importance weights (omega) themselves are assigned by the team
       in careerPaths.json, informed by common job descriptions. They are
       not derived from labour market data.

VALIDATION STATUS: the similarity computation is mathematically standard.
The gap ranking has not been validated against expert human judgement.
─────────────────────────────────────────────────────────────────────────
"""

import numpy as np


def build_student_vector(student_skills, skill_names):
    """
    student_skills: [{"name": "React", "proficiency": 4}, ...]
    skill_names:    ordered list of all canonical skill names (length 112)

    Returns V_s, a vector in [0, 1] aligned to skill_names.

    Note: the proficiency/5 mapping assumes the 1-5 scale is linear in
    skill value. This is a simplifying assumption, not an established
    psychometric result.
    """
    index = {name: i for i, name in enumerate(skill_names)}
    vec = np.zeros(len(skill_names), dtype=float)

    for s in student_skills:
        i = index.get(s.get("name"))
        if i is not None:
            prof = float(s.get("proficiency", 3))
            vec[i] = max(0.0, min(1.0, prof / 5.0))

    return vec


def build_target_vector(required_skills, skill_names):
    """
    required_skills: [{"name": "SQL", "weight": 1.0}, ...] from careerPaths
    Returns V_t, the importance-weighted target vector.
    """
    index = {name: i for i, name in enumerate(skill_names)}
    vec = np.zeros(len(skill_names), dtype=float)

    for s in required_skills:
        i = index.get(s.get("name"))
        if i is not None:
            vec[i] = max(0.0, min(1.0, float(s.get("weight", 0))))

    return vec


def cosine_similarity(a, b):
    """
    Standard cosine similarity (Salton et al., 1975), guarded against
    zero vectors — a student with no skills yields 0, not a division error.
    """
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def analyze_gap(student_skills, required_skills, skill_names, top_n=10):
    """
    Returns similarity, match percentage, priority-ranked gaps, and
    matched skills.

    skillScore feeds the PRS skill component S (Blueprint 5.1). Reusing
    the same similarity for both gap analysis and the PRS component is a
    deliberate design choice: it gives one consistent definition of
    "skill readiness" rather than two competing ones.
    """
    v_s = build_student_vector(student_skills, skill_names)
    v_t = build_target_vector(required_skills, skill_names)

    similarity = cosine_similarity(v_s, v_t)

    weight_map = {s["name"]: float(s.get("weight", 0)) for s in required_skills}

    gaps = []
    matched = []

    for i, name in enumerate(skill_names):
        target, current = v_t[i], v_s[i]
        if target <= 0:
            continue                      # not required for this career path

        if target > current:
            deficit = target - current
            importance = weight_map.get(name, target)
            gaps.append({
                "skill": name,
                "importance": round(importance, 2),
                "currentLevel": round(current * 5, 1),   # back to 1-5 for the UI
                "targetLevel": round(target * 5, 1),
                "deficit": round(deficit, 3),
                # priority = omega * deficit  <- the weighting decision
                "priority": round(importance * deficit, 4),
            })
        else:
            matched.append({
                "skill": name,
                "importance": round(weight_map.get(name, target), 2),
                "level": round(current * 5, 1),
            })

    gaps.sort(key=lambda g: g["priority"], reverse=True)
    matched.sort(key=lambda m: m["importance"], reverse=True)

    return {
        "similarity": round(similarity, 4),
        "matchPercent": round(similarity * 100, 2),
        "skillScore": round(similarity * 100, 2),   # this is S in the PRS formula
        "gaps": gaps[:top_n],
        "totalGaps": len(gaps),
        "matched": matched,
        "matchedCount": len(matched),
        "requiredCount": len(required_skills),
    }


def analyze_gap_unweighted(student_skills, required_skills, skill_names, top_n=10):
    """
    Ablation variant: ranks gaps by RAW DEFICIT, ignoring importance.

    Retained so the Phase 2 report can demonstrate what the importance
    weighting actually buys. Comparing the two orderings for the same
    student shows whether the weighting changes the advice given — which
    is the empirical case for including it.
    """
    v_s = build_student_vector(student_skills, skill_names)
    v_t = build_target_vector(required_skills, skill_names)

    gaps = []
    for i, name in enumerate(skill_names):
        if v_t[i] > v_s[i] > -1 and v_t[i] > 0:
            gaps.append({
                "skill": name,
                "deficit": round(v_t[i] - v_s[i], 3),
            })

    gaps.sort(key=lambda g: g["deficit"], reverse=True)
    return {"gaps": gaps[:top_n], "method": "unweighted_deficit"}