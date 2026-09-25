"""Multimodal assessment: image + specialist model outputs + reported symptoms → differential.

A vision-language model sees the image, the structured outputs of the specialist models and
what the person reports, and drafts a differential with estimated likelihoods. The estimates
are the model's judgement, never a certainty: they are capped below 100 % and every answer
carries a disclaimer written here, not by the model.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from app.languages import LANGUAGES
from app.schemas import AnalysisResult, Assessment, DifferentialItem
from app.services.hospitals import SPECIALTIES
from app.services.llm import LLM
from app.services.reporting import build_prompt_payload

MAX_PROBABILITY = 90  # no single diagnosis is ever presented as certain
MAX_ITEMS = 5
# Kept under the provider's per-minute output limit for the vision model; the prompt asks
# for a compact answer so the JSON is never cut off.
MAX_OUTPUT_TOKENS = 1000

DISCLAIMER = {
    "uz": "Bu tashxis emas. AI 100% kafolat bermaydi: ehtimolliklar taxminiy. Yakuniy xulosani shifokor beradi.",
    "en": "This is not a diagnosis. The AI gives no 100% guarantee: likelihoods are estimates. "
    "A doctor makes the final decision.",
    "ru": "Это не диагноз. ИИ не даёт 100% гарантии: вероятности приблизительные. "
    "Окончательное заключение даёт врач.",
}

_SCHEMA = """{
  "summary": "2-4 sentences",
  "image_observations": ["what you see on the image, hedged"],
  "differential": [{"name": "condition", "probability": 40, "reasoning": "one sentence"}],
  "causes": ["possible cause or risk factor"],
  "urgency": "routine | soon | urgent",
  "urgency_text": "one sentence about how soon to see a doctor",
  "next_steps": ["..."],
  "questions_for_doctor": ["..."],
  "specialty": "one of: %s"
}""" % " | ".join(SPECIALTIES)

_COMMON_RULES = """\
Rules:
- Combine three sources: the image you see, the specialist model outputs (JSON) and the symptoms.
  Specialist model scores are model scores (0.50 = decision threshold), not probabilities.
- Give 2-4 differential items with an estimated likelihood as an integer percent. No item above
  90, the sum at most 100. Include "normal / no significant finding" as an item when that is
  plausible. These are estimates, never certainties.
- Never state a definitive diagnosis. Do not invent measurements.
- If the image does not match the stated study or is unreadable, say so in the summary and keep
  likelihoods low.
- Be brief: summary at most 3 sentences; at most 3 image_observations, 4 differential items,
  3 causes, 3 next_steps and 3 questions_for_doctor; every list item one short sentence.
- urgency: "urgent" only for findings or symptoms that need care today (e.g. a large pneumothorax,
  a new neurological deficit, severe breathlessness); "soon" = see a doctor within days;
  otherwise "routine".
- Write every text field in {language}. Return only JSON with this shape:
{schema}"""

PATIENT_PROMPT = """\
You explain a medical image result to an ordinary person (not a doctor) who uploaded their own
image and described their symptoms.
- Use plain, calm, kind words. Explain medical terms in brackets. Do not frighten: no alarming
  wording, even for serious findings; say what to do next and how soon, calmly and clearly.
- "causes": possible root causes and risk factors in simple words.
- "questions_for_doctor": 3-4 short questions the person can ask their doctor.
""" + _COMMON_RULES

DOCTOR_PROMPT = """\
You assist a physician. Draft a concise clinical differential for this study.
- Clinical terminology, brief reasoning that cites image features, model outputs and symptoms.
- "causes": relevant etiologies or risk factors. "questions_for_doctor": further history,
  examination or imaging that would discriminate between the differential items.
""" + _COMMON_RULES


class AssessmentUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class PatientContext:
    symptoms: str | None
    age: int | None
    sex: str | None


def _payload(result: AnalysisResult, context: PatientContext) -> dict:
    payload = build_prompt_payload(result)
    payload["symptoms"] = context.symptoms or "not provided"
    payload["age"] = context.age
    payload["sex"] = context.sex
    return payload


def _clean(raw: dict, audience: str, language: str, model: str) -> Assessment:
    items = []
    for item in raw.get("differential") or []:
        try:
            probability = int(round(float(item.get("probability", 0))))
        except (TypeError, ValueError):
            continue
        name = str(item.get("name", "")).strip()
        if name:
            items.append(DifferentialItem(
                name=name,
                probability=min(MAX_PROBABILITY, max(1, probability)),
                reasoning=str(item.get("reasoning", "")).strip(),
            ))
    items = sorted(items, key=lambda i: i.probability, reverse=True)[:MAX_ITEMS]
    total = sum(i.probability for i in items)
    if total > 100:  # rescale so the estimates never add up to more than certainty
        for item in items:
            item.probability = max(1, int(item.probability * 100 / total))

    def strings(key: str) -> list[str]:
        return [str(v).strip() for v in raw.get(key) or [] if str(v).strip()][:6]

    urgency = raw.get("urgency") if raw.get("urgency") in ("routine", "soon", "urgent") else "soon"
    specialty = raw.get("specialty") if raw.get("specialty") in SPECIALTIES else "general"
    return Assessment(
        audience=audience,
        language=language,
        model=model,
        summary=str(raw.get("summary", "")).strip(),
        image_observations=strings("image_observations"),
        differential=items,
        causes=strings("causes"),
        urgency=urgency,
        urgency_text=str(raw.get("urgency_text", "")).strip(),
        next_steps=strings("next_steps"),
        questions_for_doctor=strings("questions_for_doctor"),
        specialty=specialty,
        disclaimer=DISCLAIMER[language],
    )


def assess(
    vision: LLM,
    result: AnalysisResult,
    image_url: str,
    context: PatientContext,
    audience: str,
    language: str,
) -> Assessment:
    """Ask the vision-language model for a differential. Raises on LLM or format errors."""
    if not vision.configured:
        raise AssessmentUnavailableError("GROQ_API_KEY is not configured")
    template = PATIENT_PROMPT if audience == "patient" else DOCTOR_PROMPT
    system = template.format(language=LANGUAGES[language].prompt_name, schema=_SCHEMA)
    text = "Study and model outputs (JSON):\n" + json.dumps(_payload(result, context), ensure_ascii=False)
    raw = json.loads(vision.image_json_completion(system, text, image_url, MAX_OUTPUT_TOKENS))
    assessment = _clean(raw, audience, language, vision.model)
    if not assessment.summary or not assessment.differential:
        raise ValueError("the model returned an incomplete assessment")
    return assessment
