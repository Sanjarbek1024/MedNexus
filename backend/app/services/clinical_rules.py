"""Deterministic clinical rules engine: validated early-warning scores and red flags.

This layer runs before (and independently of) every model. Its output drives triage and sets an
urgency floor that the language models cannot lower, so a hallucinating or unavailable model can
never make a deteriorating patient look routine.

Scores implemented from their published definitions:
- NEWS2 (Royal College of Physicians, 2017), SpO2 scale 1.
- qSOFA (Sepsis-3, Singer et al., JAMA 2016).
- CRB-65 (British Thoracic Society; CURB-65 without urea, for use outside hospital).
- Shock index (heart rate / systolic blood pressure).
"""

from __future__ import annotations

from app.db.models import Priority
from app.schemas import ClinicalData, ClinicalRules, RuleFlag, ScoreResult

# Symptom checklist codes that are red flags on their own (the UI offers these as chips).
RED_FLAG_SYMPTOMS = {
    "hemoptysis": "warning",
    "chest_pain": "warning",
    "syncope": "warning",
    "focal_deficit": "critical",
    "thunderclap_headache": "critical",
    "seizure": "critical",
    "confusion": "critical",
    "severe_dyspnea": "critical",
    "neck_stiffness": "critical",
    "weight_loss": "warning",
    "night_sweats": "warning",
}


def _band(lo: float, hi: float, value: float) -> str:
    return "high" if value >= hi else "medium" if value >= lo else "low"


def news2(data: ClinicalData) -> ScoreResult | None:
    v = data.vitals
    parts: dict[str, int | None] = {
        "resp_rate": None if v.resp_rate is None else (
            3 if v.resp_rate <= 8 else 1 if v.resp_rate <= 11 else 0 if v.resp_rate <= 20 else 2 if v.resp_rate <= 24 else 3
        ),
        "spo2": None if v.spo2 is None else (3 if v.spo2 <= 91 else 2 if v.spo2 <= 93 else 1 if v.spo2 <= 95 else 0),
        "systolic": None if v.systolic is None else (
            3 if v.systolic <= 90 else 2 if v.systolic <= 100 else 1 if v.systolic <= 110 else 0 if v.systolic <= 219 else 3
        ),
        "heart_rate": None if v.heart_rate is None else (
            3 if v.heart_rate <= 40 else 1 if v.heart_rate <= 50 else 0 if v.heart_rate <= 90
            else 1 if v.heart_rate <= 110 else 2 if v.heart_rate <= 130 else 3
        ),
        "temperature": None if v.temperature is None else (
            3 if v.temperature <= 35.0 else 1 if v.temperature <= 36.0 else 0 if v.temperature <= 38.0
            else 1 if v.temperature <= 39.0 else 2
        ),
    }
    known = {k: s for k, s in parts.items() if s is not None}
    if len(known) < 2:
        return None  # too little to score honestly
    total = sum(known.values()) + (2 if v.on_oxygen else 0) + (0 if v.consciousness == "alert" else 3)
    single_three = any(s == 3 for s in known.values()) or v.consciousness != "alert"
    band = "high" if total >= 7 else "medium" if total >= 5 or single_three else "low"
    missing = [k for k, s in parts.items() if s is None]
    return ScoreResult(name="NEWS2", value=total, band=band, partial=bool(missing), missing=missing)


def qsofa(data: ClinicalData) -> ScoreResult | None:
    v = data.vitals
    if v.resp_rate is None and v.systolic is None:
        return None
    score = (v.resp_rate is not None and v.resp_rate >= 22) + (v.systolic is not None and v.systolic <= 100) + (
        v.consciousness != "alert"
    )
    missing = [k for k in ("resp_rate", "systolic") if getattr(v, k) is None]
    return ScoreResult(name="qSOFA", value=score, band="high" if score >= 2 else "low", partial=bool(missing), missing=missing)


def crb65(data: ClinicalData, age: int | None) -> ScoreResult | None:
    v = data.vitals
    if v.resp_rate is None and v.systolic is None and age is None:
        return None
    low_bp = (v.systolic is not None and v.systolic < 90) or (v.diastolic is not None and v.diastolic <= 60)
    score = (v.consciousness != "alert") + (v.resp_rate is not None and v.resp_rate >= 30) + low_bp + (
        age is not None and age >= 65
    )
    missing = [k for k, val in (("resp_rate", v.resp_rate), ("systolic", v.systolic), ("age", age)) if val is None]
    return ScoreResult(name="CRB-65", value=score, band=_band(1, 3, score), partial=bool(missing), missing=missing)


def shock_index(data: ClinicalData) -> ScoreResult | None:
    v = data.vitals
    if not v.heart_rate or not v.systolic:
        return None
    value = round(v.heart_rate / v.systolic, 2)
    return ScoreResult(name="Shock index", value=value, band=_band(0.9, 1.0, value))


def _vital_flags(data: ClinicalData, age: int | None) -> list[RuleFlag]:
    v, flags = data.vitals, []

    def add(code: str, critical: bool, value: object) -> None:
        flags.append(RuleFlag(code=code, severity="critical" if critical else "warning", value=str(value)))

    if v.spo2 is not None and v.spo2 < 94:
        add("spo2_low", v.spo2 < 90, f"{v.spo2}%")
    if v.resp_rate is not None and v.resp_rate >= 22:
        add("tachypnea", v.resp_rate >= 30, v.resp_rate)
    if v.heart_rate is not None and v.heart_rate > 100:
        add("tachycardia", v.heart_rate >= 130, v.heart_rate)
    if v.heart_rate is not None and v.heart_rate < 50:
        add("bradycardia", v.heart_rate < 40, v.heart_rate)
    if v.systolic is not None and v.systolic < 100:
        add("hypotension", v.systolic < 90, f"{v.systolic}/{v.diastolic or '—'}")
    if (v.systolic is not None and v.systolic >= 180) or (v.diastolic is not None and v.diastolic >= 120):
        add("hypertension_severe", (v.systolic or 0) >= 200 or (v.diastolic or 0) >= 120, f"{v.systolic or '—'}/{v.diastolic or '—'}")
    if v.temperature is not None and v.temperature >= 38.0:
        add("fever", v.temperature >= 40.0, f"{v.temperature:.1f} °C")
    if v.temperature is not None and v.temperature < 35.0:
        add("hypothermia", True, f"{v.temperature:.1f} °C")
    if v.consciousness != "alert":
        add("altered_consciousness", True, v.consciousness)
    if age is not None and age < 1 and v.temperature is not None and v.temperature >= 38.0:
        add("infant_fever", True, f"{v.temperature:.1f} °C")
    return flags


def evaluate(data: ClinicalData | None, age: int | None) -> ClinicalRules:
    """Scores, red flags and the resulting triage level for one intake."""
    if data is None:
        return ClinicalRules()
    scores = [s for s in (news2(data), qsofa(data), crb65(data, age), shock_index(data)) if s is not None]
    flags = _vital_flags(data, age)
    flags += [
        RuleFlag(code=f"symptom_{code}", severity=severity)
        for code, severity in RED_FLAG_SYMPTOMS.items()
        if code in data.symptoms
    ]
    critical = any(f.severity == "critical" for f in flags) or any(s.band == "high" for s in scores)
    warning = bool(flags) or any(s.band == "medium" for s in scores)
    if critical:
        priority, floor = Priority.URGENT, "urgent"
    elif warning:
        priority, floor = Priority.ATTENTION, "soon"
    else:
        priority, floor = Priority.ROUTINE, "routine"
    return ClinicalRules(scores=scores, flags=flags, priority=priority, urgency_floor=floor)


_ORDER = {Priority.ROUTINE: 0, Priority.ATTENTION: 1, Priority.URGENT: 2}


def higher(a: Priority, b: Priority) -> Priority:
    return a if _ORDER[Priority(a)] >= _ORDER[Priority(b)] else b


def _flag_text(flag: RuleFlag) -> str:
    if flag.code.startswith("symptom_"):
        return SYMPTOM_NAMES.get(flag.code[8:], flag.code[8:])
    return f"{FLAG_NAMES.get(flag.code, flag.code)} {flag.value}".strip()


def rules_reason(rules: ClinicalRules) -> str | None:
    """Short human-readable triage reason for the worklist."""
    parts = [f"{s.name} {s.value:g}" for s in rules.scores if s.band == "high"]
    parts += [_flag_text(f) for f in rules.flags if f.severity == "critical"]
    if not parts:
        parts = [f"{s.name} {s.value:g}" for s in rules.scores if s.band == "medium"] + [_flag_text(f) for f in rules.flags]
    return ", ".join(parts)[:255] or None


# Plain English names for the checklist codes, so the models never see (or echo) raw codes.
SYMPTOM_NAMES = {
    "fever": "fever", "chills": "chills", "fatigue": "fatigue", "weight_loss": "weight loss", "night_sweats": "night sweats",
    "sweating": "cold sweat", "cough": "cough", "sputum": "sputum", "hemoptysis": "hemoptysis",
    "dyspnea": "shortness of breath", "severe_dyspnea": "severe breathlessness", "wheezing": "wheezing",
    "sore_throat": "sore throat", "chest_pain": "chest pain", "palpitations": "palpitations", "syncope": "syncope",
    "edema_legs": "leg swelling", "headache": "headache", "thunderclap_headache": "sudden severe (thunderclap) headache",
    "dizziness": "dizziness", "confusion": "confusion", "seizure": "seizure",
    "focal_deficit": "one-sided weakness or numbness", "vision_change": "vision change", "neck_stiffness": "neck stiffness",
    "nausea": "nausea", "vomiting": "vomiting", "abdominal_pain": "abdominal pain", "diarrhea": "diarrhea",
    "pain": "localized pain", "swelling": "swelling", "trauma": "recent injury", "limited_motion": "limited movement",
}
HISTORY_NAMES = {
    "hypertension": "hypertension", "diabetes": "diabetes", "copd_asthma": "COPD or asthma", "heart_disease": "heart disease",
    "ckd": "chronic kidney disease", "cancer": "cancer", "immunosuppression": "immunosuppression or HIV",
    "tb_history": "past tuberculosis", "pregnancy": "pregnancy", "anticoagulants": "on anticoagulants",
}
FLAG_NAMES = {
    "spo2_low": "low oxygen saturation", "tachypnea": "tachypnea", "tachycardia": "tachycardia",
    "bradycardia": "bradycardia", "hypotension": "hypotension", "hypertension_severe": "severe hypertension",
    "fever": "fever", "hypothermia": "hypothermia", "altered_consciousness": "altered consciousness",
    "infant_fever": "fever in an infant",
}


def readable(intake: dict | None, rules: dict | None) -> tuple[dict, dict]:
    """The intake and the rules output with checklist codes replaced by plain names."""
    intake = dict(intake or {})
    if intake:
        intake["symptoms"] = [SYMPTOM_NAMES.get(s, s) for s in intake.get("symptoms", [])]
        intake["history"] = [HISTORY_NAMES.get(h, h) for h in intake.get("history", [])]
    rules = dict(rules or {})
    if rules:
        rules["flags"] = [
            {**flag, "code": f"red-flag symptom: {SYMPTOM_NAMES.get(flag['code'][8:], flag['code'][8:])}"
             if flag["code"].startswith("symptom_") else FLAG_NAMES.get(flag["code"], flag["code"])}
            for flag in rules.get("flags", [])
        ]
    return intake, rules
