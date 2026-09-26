"""Multimodal assessment: image + specialist model outputs + reported symptoms → differential.

Two stages. A vision-language model reads the image and lists what is visible (it does not
diagnose). A reasoning model then combines that reading, the specialist model outputs and what
the person reports into a differential: per diagnosis the evidence for and against, the tests
that would confirm or exclude it and whether it must not be missed, plus red flags and points
that are easy to miss. When the reasoning stage is unavailable the vision model drafts the
differential alone in one call.

The likelihoods are the models' judgement, never a certainty: they are capped below 100 % and
every answer carries a disclaimer written here, not by a model.
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass

from app.languages import LANGUAGES
from app.schemas import AnalysisResult, Assessment, DifferentialItem, PipelineStep
from app.services.clinical_rules import readable
from app.services.hospitals import SPECIALTIES
from app.services.llm import LLM
from app.services.reporting import build_prompt_payload
from app.services.terms import glossary

logger = logging.getLogger(__name__)

MAX_PROBABILITY = 90  # no single diagnosis is ever presented as certain
MAX_ITEMS = 5
# Kept under the provider's per-minute output limit for the vision model; the prompt asks
# for a compact answer so the JSON is never cut off.
MAX_OUTPUT_TOKENS = 1000
OBSERVE_TOKENS = 450  # the vision reading: short, leaves room in the per-minute budget
REASON_TOKENS = 3000  # the reasoning model's answer, including its brief reasoning trace

DISCLAIMER = {
    "uz": "Bu tashxis emas. AI 100% kafolat bermaydi: ehtimolliklar taxminiy. Yakuniy xulosani shifokor beradi.",
    "en": "This is not a diagnosis. The AI gives no 100% guarantee: likelihoods are estimates. "
    "A doctor makes the final decision.",
    "ru": "Это не диагноз. ИИ не даёт 100% гарантии: вероятности приблизительные. "
    "Окончательное заключение даёт врач.",
}

_SCHEMA = """{
  "summary": "2-3 sentences",
  "image_observations": ["what you see on the image, hedged"],
  "differential": [{"name": "condition", "probability": 40, "reasoning": "one sentence"}],
  "causes": ["possible cause or risk factor"],
  "urgency": "routine | soon | urgent",
  "urgency_text": "one sentence: the time frame of urgency and why",
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
- Decide urgency first, then write urgency_text for exactly that level. Each level has one time
  frame, and the app shows it as the heading above urgency_text:
    "urgent" = see a doctor today (same day): findings or symptoms that need care today, e.g. a
      large pneumothorax, a likely fracture after an injury, a new neurological deficit, severe
      breathlessness;
    "soon" = see a doctor within the next few days (this week), not today;
    "routine" = no rush: a planned visit or the next check-up.
  urgency_text states that time frame in your own words and says why, in one sentence. Never
  name a different time frame (an "urgent" text never says "this week" or "within a few days").
- Language: every text value in the JSON (also names, reasoning and urgency_text) is written in
  {language}, even though these instructions and the input are in English. Keys and the values
  of "urgency" and "specialty" stay as listed.
Return only JSON with this shape:
{schema}"""

PATIENT_PROMPT = """\
Answer in {language}. You explain a medical image result to an ordinary person (not a doctor)
who uploaded their own image and described their symptoms.
- Use plain, calm, kind words. Explain medical terms in brackets. Do not frighten: no alarming
  wording, even for serious findings; say what to do next and how soon, calmly and clearly.
- Do not quote model scores or thresholds; say in words how clearly the models flagged something.
- "causes": possible root causes and risk factors in simple words.
- "questions_for_doctor": 3 short questions the person can ask their doctor.
""" + _COMMON_RULES

DOCTOR_PROMPT = """\
Answer in {language}. You assist a physician. Draft a concise clinical differential for this study.
- Clinical terminology, brief reasoning that cites image features, model outputs and symptoms.
- "causes": relevant etiologies or risk factors. "questions_for_doctor": further history,
  examination or imaging that would discriminate between the differential items.
- "urgency_text": the clinical time frame (same day / within days / routine) and the reason.
""" + _COMMON_RULES

OBSERVE_PROMPT = """\
You read one medical image for a physician: {study}. Describe only what is visible; do not
diagnose and do not estimate likelihoods. Give concrete, hedged observations with their location
(for example "patchy opacity in the right upper zone", "no visible pneumothorax", "cortical break
at the distal radius"), including relevant normal findings, and note image quality. The specialist
model outputs (JSON) are context: say where your reading agrees or disagrees with them.
Return only JSON: {{"observations": ["..."], "quality": "one sentence", "agreement": "one sentence"}}
At most 6 observations, each one short sentence, in English."""

_REASON_SCHEMA = """{
  "summary": "2-3 sentences",
  "image_observations": ["the visual reading, rewritten in the answer language (at most 4)"],
  "differential": [{"name": "condition", "probability": 40, "reasoning": "one sentence",
    "evidence_for": ["%(image)s: ...", "%(symptom)s: ..."], "evidence_against": ["%(model)s: ..."],
    "confirm_with": ["test or examination"], "cannot_miss": false}],
  "red_flags": ["..."],
  "watch_out": ["..."],
  "mismatch": "",
  "causes": ["possible cause or risk factor"],
  "urgency": "routine | soon | urgent",
  "urgency_text": "one sentence: the time frame of urgency and why",
  "next_steps": ["..."],
  "questions_for_doctor": ["..."],
  "specialty": "one of: %(specialties)s"
}"""

# Source labels for the evidence lines, in the answer language.
SOURCES = {
    "uz": {"image": "Rasm", "model": "Model", "symptom": "Simptom", "vitals": "Vital", "exam": "Ko‘rik",
           "lab": "Tahlil", "history": "Anamnez"},
    "en": {"image": "Image", "model": "Model", "symptom": "Symptom", "vitals": "Vitals", "exam": "Exam",
           "lab": "Lab", "history": "History"},
    "ru": {"image": "Снимок", "model": "Модель", "symptom": "Симптом", "vitals": "Витальные", "exam": "Осмотр",
           "lab": "Анализ", "history": "Анамнез"},
}

_REASON_RULES = """\
Clinical reasoning rules:
- Reason like a careful physician: start from the image evidence (the visual reading and the
  specialist model findings with their levels and agreement), then weigh the symptoms, age and sex.
  Consider the common causes and the dangerous ones.
- Setting: Uzbekistan, where tuberculosis is common (WHO: about 57 new cases per 100,000 people a
  year). For upper-zone opacities, cavities, a cough longer than 2-3 weeks, weight loss or night
  sweats, consider tuberculosis and mark it cannot_miss unless the evidence excludes it.
- 3-5 differential items. For each item:
  "reasoning": one sentence linking the image and the symptoms;
  "evidence_for": 1-3 short facts that support it, each starting with its source and a colon:
    "{image}:", "{model}:" or "{symptom}:";
  "evidence_against": 0-2 short facts that argue against it, with the same prefixes;
  "confirm_with": 1-2 tests or examinations that would confirm or exclude it;
  "cannot_miss": true only for a diagnosis that is dangerous to miss (for example pneumothorax,
    tuberculosis, a lung mass or cancer, a displaced fracture, a brain tumor or hemorrhage, heart
    failure) and that the evidence cannot yet exclude, even when its likelihood is low.
- Likelihoods: integer percent, no item above 90, the sum at most 100. Add "normal / no
  significant finding" or "another cause" when plausible. They are estimates, never certainties.
- "red_flags": danger signs actually present in the symptoms or on the image that need care today;
  an empty list when there are none. Never invent symptoms.
- "watch_out": {watch_out}
- "mismatch": one sentence when the symptoms and the image point in different directions (for
  example marked symptoms with a normal image), otherwise "".
- Model scores are 0-1 model scores (0.50 = decision threshold), not probabilities. Never invent
  findings or measurements and never state a definitive diagnosis.
- At most 3 causes, 3 next_steps and 3 questions_for_doctor; every list item one short sentence.
- Decide urgency first, then write urgency_text for exactly that level: "urgent" = today (same
  day), "soon" = within the next few days, "routine" = a planned visit. Never name a different time
  frame.
- Language: every text value in the JSON is written in {language} only. Translate English medical
  words from the input (for example "patchy opacity", "lung", "score") instead of copying them, and
  name model findings with the names given in "finding_names" when present. Keys and the values of
  "urgency" and "specialty" stay as listed.
Return only JSON with this shape:
{schema}"""

PATIENT_REASON_PROMPT = """\
Answer in {language}. You explain a medical image result to an ordinary person (not a doctor)
who uploaded their own image and described their symptoms. Use plain, calm, kind words and
explain medical terms in brackets. Do not frighten; say clearly what to do and how soon. Do not
quote model scores or thresholds: describe in words how clearly the models flagged something.
""" + _REASON_RULES

DOCTOR_REASON_PROMPT = """\
Answer in {language}. You assist a physician with a clinical differential for this study. Use
clinical terminology and cite image features, model scores with their levels, and symptoms.
""" + _REASON_RULES

WATCH_OUT = {
    "patient": "1-3 important things the person should tell their doctor or ask to have checked.",
    "doctor": "1-3 points that are easy to miss: an uncertain or single-model finding, a finding the "
    "symptoms do not explain, a cannot-miss item that needs a specific test.",
}


# Written by the app when the model's urgency_text names a time frame that contradicts its urgency.
URGENCY_TEXT = {
    "patient": {
        "uz": {
            "urgent": "Iltimos, bugun shifokorga uchrashing. Ahvolingiz keskin yomonlashsa, 103 ga qo‘ng‘iroq qiling.",
            "soon": "Iltimos, yaqin kunlarda shifokorga uchrashing va natijani ko‘rsating.",
            "routine": "Shoshilish shart emas: natijani navbatdagi rejali ko‘rikda shifokoringiz bilan muhokama qiling.",
        },
        "en": {
            "urgent": "Please see a doctor today. If you feel much worse, call 103 or go to emergency care.",
            "soon": "Please see a doctor within the next few days and show them this result.",
            "routine": "There is no need to hurry: discuss the result with your doctor at a planned visit.",
        },
        "ru": {
            "urgent": "Пожалуйста, обратитесь к врачу сегодня. Если станет значительно хуже, звоните 103.",
            "soon": "Пожалуйста, обратитесь к врачу в ближайшие дни и покажите этот результат.",
            "routine": "Спешить не нужно: обсудите результат с врачом на плановом приёме.",
        },
    },
    "doctor": {
        "uz": {
            "urgent": "Shu kunning o‘zida klinik baholash tavsiya etiladi.",
            "soon": "Bir necha kun ichida klinik baholash tavsiya etiladi.",
            "routine": "Rejali kuzatuv yetarli.",
        },
        "en": {
            "urgent": "Same-day clinical assessment is advised.",
            "soon": "Clinical assessment within the next few days is advised.",
            "routine": "Routine follow-up is sufficient.",
        },
        "ru": {
            "urgent": "Рекомендуется клиническая оценка в тот же день.",
            "soon": "Рекомендуется клиническая оценка в ближайшие дни.",
            "routine": "Достаточно планового наблюдения.",
        },
    },
}

# Time frames named in an urgency text. Only explicit time words: phrases such as "not urgent"
# would otherwise read as their opposite.
_TIME_FRAMES = {
    "today": {
        "en": r"\btoday\b|\bimmediately\b|\bright away\b|\bsame[- ]day\b|\btonight\b",
        "uz": r"\bbugun|\bdarhol\b|\bzudlik bilan\b|\bshu kun|\bhoziroq\b",
        "ru": r"сегодня|немедленно|\bсразу\b|в тот же день",
    },
    "days": {
        "en": r"\bdays?\b|\bthis week\b|\bwithin (?:a|one|the) week\b|\bnext week\b|\bsoon\b",
        "uz": r"\bkun ichida\b|\bkunlar|\bbir necha kun|\d\s*kun\b|\bhafta\b|\bhafta ichida\b|\bshu hafta",
        "ru": r"\bдн(?:ей|я|и)\b|\bнедели\b|на этой неделе|\bв ближайшее время\b",
    },
    "routine": {
        "en": r"\broutine\b|\bplanned\b|\bcheck-?up\b|\bweeks\b|\bmonths?\b|\bno (?:rush|hurry)\b|\bnext visit\b",
        "uz": r"\brejali\b|\brejalashtirilgan\b|\bprofilaktik\b|\bhaftalar|\boylar|\boy ichida\b|\bnavbatdagi\b|shoshilish shart emas",
        "ru": r"\bпланов|\bнедель\b|\bнеделях\b|\bмесяц|без спешки|спешить не нужно|профилактическ|при следующем",
    },
}
_ALLOWED = {"urgent": "today", "soon": "days", "routine": "routine"}


def urgency_text_matches(urgency: str, text: str, language: str) -> bool:
    """False when the text names another time frame than the urgency level and not its own."""
    found = {
        frame
        for frame, patterns in _TIME_FRAMES.items()
        if re.search(patterns[language], text, re.IGNORECASE)
    }
    return _ALLOWED[urgency] in found or not found


# Uzbek is written in Latin script; vision models sometimes slip into Cyrillic letters inside a
# Latin word ("adenoма") or into Turkish letters ("adenoması").
_TURKISH = str.maketrans({"ı": "i", "ş": "sh", "ç": "ch", "ğ": "g‘", "ö": "o‘", "ü": "u",
                          "İ": "I", "Ş": "Sh", "Ç": "Ch", "Ğ": "G‘", "Ö": "O‘", "Ü": "U"})
_CYRILLIC = dict(zip(
    "абвгдеёжзийклмнопрстуфхцчшщъыьэюяўқғҳ",
    ["a", "b", "v", "g", "d", "e", "yo", "j", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s",
     "t", "u", "f", "x", "ts", "ch", "sh", "sh", "’", "i", "", "e", "yu", "ya", "o‘", "q", "g‘", "h"],
    strict=True,
))
_MIXED_WORD = re.compile(r"\w*(?:[a-zA-Z]\w*[а-яёўқғҳА-ЯЁЎҚҒҲ]|[а-яёўқғҳА-ЯЁЎҚҒҲ]\w*[a-zA-Z])\w*")


def _latin_letter(char: str) -> str:
    latin = _CYRILLIC.get(char.lower())
    if latin is None:
        return char
    return latin.capitalize() if char.isupper() else latin


def uzbek_latin(text: str) -> str:
    text = text.translate(_TURKISH)
    return _MIXED_WORD.sub(lambda m: "".join(_latin_letter(c) for c in m.group()), text)


_CYRILLIC_LETTER = re.compile(r"[а-яёўқғҳ]", re.IGNORECASE)
_LATIN_LETTER = re.compile(r"[a-z]", re.IGNORECASE)
_ENGLISH_WORDS = frozenset(
    "the and of with is are to for this that may be on or in a an by from not your which".split()
)
_UZBEK_WORDS = frozenset(
    "va bilan uchun yoki bu ham emas mumkin kerak lekin bor yo‘q yo'q ko‘ra ko'ra holda ushbu esa".split()
)


def written_language(text: str) -> str | None:
    """The language a text is written in (uz, en or ru), or None when unclear."""
    cyrillic, latin = len(_CYRILLIC_LETTER.findall(text)), len(_LATIN_LETTER.findall(text))
    if cyrillic > latin:
        return "ru"
    words = re.findall(r"[a-zA-Z‘'ʻ’]+", text.lower())
    english = sum(w in _ENGLISH_WORDS for w in words)
    uzbek = sum(w in _UZBEK_WORDS for w in words) + sum(("o‘" in w or "g‘" in w or "o'" in w or "g'" in w) for w in words)
    if english >= 3 and english > 2 * uzbek:
        return "en"
    if uzbek >= 2 and uzbek > 2 * english:
        return "uz"
    return None


# The closing instruction, written in the answer language itself: English instructions and input
# otherwise pull the model towards answering in English.
ANSWER_IN = {
    "uz": "Javobning barcha matnlarini faqat o‘zbek tilida (lotin yozuvida) yozing.",
    "en": "Write every text value of the answer in English.",
    "ru": "Пишите все тексты ответа только на русском языке.",
}


class AssessmentUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class PatientContext:
    symptoms: str | None
    age: int | None
    sex: str | None
    clinical: dict | None = None  # ClinicalData: complaint, checklist, vitals, history, exam, labs
    rules: dict | None = None  # ClinicalRules: scores and red flags from the rules engine


def _clinical_payload(context: PatientContext, language: str = "en") -> dict:
    intake, rules = readable(context.clinical, context.rules, language)
    return {
        "history_of_present_illness": context.symptoms or "not provided",
        "age": context.age,
        "sex": context.sex,
        "structured_intake": intake,
        "clinical_rules": rules,
    }


def _payload(result: AnalysisResult, context: PatientContext, language: str = "en") -> dict:
    payload = build_prompt_payload(result)
    payload["symptoms"] = context.symptoms or "not provided"
    payload["age"] = context.age
    payload["sex"] = context.sex
    if context.clinical or context.rules:
        payload["structured_intake"], payload["clinical_rules"] = readable(context.clinical, context.rules, language)
    return payload


def _clean(raw: dict, audience: str, language: str, model: str) -> Assessment:
    # Models occasionally ignore the requested language; label the answer with the one it is in.
    language = written_language(str(raw.get("summary", ""))) or language
    fix = uzbek_latin if language == "uz" else str

    def text(value: object) -> str:
        return fix(str(value).strip())

    def texts(values: object, limit: int) -> list[str]:
        if not isinstance(values, list):
            return []
        return [text(v) for v in values if str(v).strip()][:limit]

    items = []
    for item in raw.get("differential") or []:
        if not isinstance(item, dict):
            continue
        try:  # models sometimes write "40%" instead of 40
            probability = int(round(float(str(item.get("probability", 0)).strip().rstrip("%"))))
        except (TypeError, ValueError):
            continue
        name = text(item.get("name", ""))
        if name:
            items.append(DifferentialItem(
                name=name,
                probability=min(MAX_PROBABILITY, max(1, probability)),
                reasoning=text(item.get("reasoning", "")),
                evidence_for=texts(item.get("evidence_for"), 3),
                evidence_against=texts(item.get("evidence_against"), 2),
                confirm_with=texts(item.get("confirm_with"), 2),
                cannot_miss=item.get("cannot_miss") in (True, "true", "True", 1),
            ))
    items = sorted(items, key=lambda i: i.probability, reverse=True)[:MAX_ITEMS]
    total = sum(i.probability for i in items)
    if total > 100:  # rescale so the estimates never add up to more than certainty
        for item in items:
            item.probability = max(1, int(item.probability * 100 / total))

    def strings(key: str) -> list[str]:
        return texts(raw.get(key), 6)  # a bare string is not split into characters

    urgency = raw.get("urgency") if raw.get("urgency") in ("routine", "soon", "urgent") else "soon"
    urgency_text = text(raw.get("urgency_text", ""))
    if not urgency_text or not urgency_text_matches(urgency, urgency_text, language):
        urgency_text = URGENCY_TEXT[audience][language][urgency]
    specialty = raw.get("specialty") if raw.get("specialty") in SPECIALTIES else "general"
    return Assessment(
        audience=audience,
        language=language,
        model=model,
        summary=text(raw.get("summary", "")),
        image_observations=strings("image_observations"),
        differential=items,
        causes=strings("causes"),
        urgency=urgency,
        urgency_text=urgency_text,
        next_steps=strings("next_steps"),
        questions_for_doctor=strings("questions_for_doctor"),
        specialty=specialty,
        disclaimer=DISCLAIMER[language],
        red_flags=texts(raw.get("red_flags"), 4),
        watch_out=texts(raw.get("watch_out"), 4),
        mismatch=text(raw.get("mismatch") or ""),
    )


def observe(vision: LLM, result: AnalysisResult, image_url: str, payload: dict) -> dict:
    """Stage 1: what the vision-language model sees on the image (no diagnosis)."""
    study = "{modality} / {region} / {view}".format(**result.selection.model_dump())
    raw = json.loads(vision.image_json_completion(
        OBSERVE_PROMPT.format(study=study),
        "Specialist model outputs (JSON):\n" + json.dumps(payload, ensure_ascii=False),
        image_url,
        OBSERVE_TOKENS,
    ))
    if not raw.get("observations"):
        raise ValueError("the vision model returned no observations")
    return raw


def reason(reasoner: LLM, payload: dict, reading: dict | None, audience: str, language: str) -> dict:
    """Stage 2: the clinical differential from the visual reading, model outputs and symptoms."""
    template = PATIENT_REASON_PROMPT if audience == "patient" else DOCTOR_REASON_PROMPT
    sources = SOURCES[language]
    system = template.format(
        language=LANGUAGES[language].prompt_name,
        watch_out=WATCH_OUT[audience],
        schema=_REASON_SCHEMA % {**sources, "specialties": " | ".join(SPECIALTIES)},
        **sources,
    ) + "\n\n" + ANSWER_IN[language]
    names = [f["name"] for f in payload.get("findings", [])] + list(payload.get("not_flagged", []))
    return json.loads(reasoner.json_completion(
        system,
        {
            **payload,
            "finding_names": glossary(names, language),
            "visual_reading": reading or "unavailable: rely on the model outputs",
        },
        REASON_TOKENS,
    ))


def assess(
    vision: LLM,
    result: AnalysisResult,
    image_url: str,
    context: PatientContext,
    audience: str,
    language: str,
    reasoner: LLM | None = None,
) -> Assessment:
    """Image + model outputs + symptoms → differential. Raises when no stage can produce one."""
    if not vision.configured:
        raise AssessmentUnavailableError("GROQ_API_KEY is not configured")
    payload = _payload(result, context, language)
    if reasoner is not None and reasoner.configured:
        try:
            reading = observe(vision, result, image_url, payload)
        except Exception as exc:  # noqa: BLE001 - the reasoning stage can still use the model outputs
            logger.warning("Visual reading failed: %s", exc)
            reading = None
        try:
            models = f"{vision.model} + {reasoner.model}" if reading else reasoner.model
            assessment = _clean(reason(reasoner, payload, reading, audience, language), audience, language, models)
            if assessment.summary and assessment.differential:
                return assessment
            raise ValueError("the reasoning model returned an incomplete assessment")
        except Exception as exc:  # noqa: BLE001 - fall back to the one-call vision assessment
            logger.warning("Reasoning stage failed, using the vision model alone: %s", exc)
    return _single_stage(vision, payload, image_url, audience, language)


def _single_stage(vision: LLM, payload: dict, image_url: str, audience: str, language: str) -> Assessment:
    template = PATIENT_PROMPT if audience == "patient" else DOCTOR_PROMPT
    system = template.format(language=LANGUAGES[language].prompt_name, schema=_SCHEMA)
    text = (
        "Study and model outputs (JSON):\n" + json.dumps(payload, ensure_ascii=False)
        + "\n\n" + ANSWER_IN[language]
    )
    raw = json.loads(vision.image_json_completion(system, text, image_url, MAX_OUTPUT_TOKENS))
    assessment = _clean(raw, audience, language, vision.model)
    if not assessment.summary or not assessment.differential:
        raise ValueError("the model returned an incomplete assessment")
    return assessment


# --- Clinical (symptoms-only) mode, safety critic and guardrails -------------------------------

CLINICAL_REASON_PROMPT = """\
Answer in {language}. You assist a physician with a clinical differential diagnosis. There is NO
image: reason only from the structured intake (chief complaint, onset, duration, severity, symptom
checklist, vital signs, history, medications, allergies, smoking, examination, laboratory results),
the history of present illness, age and sex, and the deterministic clinical rules output
(validated scores such as NEWS2, qSOFA, CRB-65, shock index, and red flags). Treat the rules output
as ground truth; never contradict a computed score.
Clinical reasoning rules:
- Reason like a careful physician: build the differential from the syndrome (complaint + key
  findings), consider the common causes and the dangerous ones, and use age, sex and history.
- Setting: Uzbekistan, where tuberculosis is common (WHO: about 57 new cases per 100,000 people a
  year). With a cough longer than 2-3 weeks, hemoptysis, weight loss or night sweats, consider
  tuberculosis and mark it cannot_miss unless the evidence excludes it.
- 3-5 differential items. For each item:
  "reasoning": one sentence linking the key findings;
  "evidence_for": 1-3 short facts that support it, each starting with its source and a colon:
    "{symptom}:", "{vitals}:", "{exam}:", "{lab}:" or "{history}:";
  "evidence_against": 0-2 short facts against it, with the same prefixes;
  "confirm_with": 1-2 tests that would confirm or exclude it (name imaging such as a chest X-ray
    or MRI when it would help: MedNexus can analyze those images next);
  "cannot_miss": true only for a dangerous diagnosis the evidence cannot yet exclude (for example
    acute coronary syndrome, pulmonary embolism, sepsis, meningitis, stroke, tuberculosis,
    pneumothorax, ectopic pregnancy), even when its likelihood is low.
- Likelihoods: integer percent, no item above 90, the sum at most 100. Add "another cause" when
  plausible. They are estimates, never certainties.
- "red_flags": danger signs actually present in the intake or the rules output; an empty list when
  there are none. Never invent symptoms, vitals or results.
- "watch_out": 1-3 points that are easy to miss (a missing vital sign, a test that separates two
  items, a medication effect).
- "mismatch": one sentence when findings point in different directions, otherwise "".
- "image_observations": an empty list (there is no image).
- At most 3 causes, 3 next_steps and 3 questions_for_doctor ("questions_for_doctor" = further
  history or examination that would discriminate between the items); each one short sentence.
- Decide urgency first, then write urgency_text for exactly that level: "urgent" = today (same
  day), "soon" = within the next few days, "routine" = a planned visit. Never lower the urgency
  below the rules output. Never name a different time frame.
- Language: every text value in the JSON is written in {language} only. Keys and the values of
  "urgency" and "specialty" stay as listed.
Return only JSON with this shape:
{schema}"""

CRITIC_PROMPT = """\
You are a clinical safety reviewer. Check a draft differential diagnosis produced by another model
against the patient data and the deterministic rules output. Look only for safety problems:
- a dangerous diagnosis ("cannot-miss") that the data supports but the draft omits;
- a red flag or abnormal score that the draft ignores;
- an urgency that is too low for the data.
Do not rewrite the draft. Be conservative: add at most 2 items, only when clearly warranted.
Return only JSON: {{"add": [{{"name": "diagnosis", "reason": "one sentence", "confirm_with": ["test"]}}],
"notes": ["one short sentence per problem found"], "urgency": "routine | soon | urgent"}}
Write every text value in {language}. An empty "add" and "notes" means the draft is safe."""

URGENCY_RANK = {"routine": 0, "soon": 1, "urgent": 2}
CRITIC_PROBABILITY = 5  # items added by the critic are "keep in mind", not leading diagnoses
RULES_LABEL = "NEWS2 · qSOFA · CRB-65 · shock index"


def _clinical_schema(language: str) -> str:
    return _REASON_SCHEMA % {**SOURCES[language], "specialties": " | ".join(SPECIALTIES)}


def apply_urgency_floor(assessment: Assessment, floor: str | None) -> bool:
    """Guardrail: the rules engine's urgency is a floor the models cannot lower."""
    if not floor or URGENCY_RANK[assessment.urgency] >= URGENCY_RANK[floor]:
        return False
    assessment.urgency = floor
    assessment.urgency_text = URGENCY_TEXT["doctor"][assessment.language][floor]
    return True


def critique(reasoner: LLM, data: dict, assessment: Assessment, language: str) -> Assessment:
    """Safety critic: a second pass that adds missed cannot-miss items and flags gaps."""
    draft = {
        "differential": [
            {"name": d.name, "probability": d.probability, "cannot_miss": d.cannot_miss}
            for d in assessment.differential
        ],
        "red_flags": assessment.red_flags,
        "urgency": assessment.urgency,
    }
    raw = json.loads(reasoner.json_completion(
        CRITIC_PROMPT.format(language=LANGUAGES[language].prompt_name) + "\n\n" + ANSWER_IN[language],
        {"patient_data": data, "draft": draft},
        900,
    ))
    fix = uzbek_latin if assessment.language == "uz" else str
    existing = {d.name.lower() for d in assessment.differential}
    for item in (raw.get("add") or [])[:2]:
        if not isinstance(item, dict) or not str(item.get("name", "")).strip():
            continue
        name = fix(str(item["name"]).strip())
        if name.lower() in existing:
            continue
        confirm = item.get("confirm_with")
        assessment.differential.append(DifferentialItem(
            name=name, probability=CRITIC_PROBABILITY, reasoning=fix(str(item.get("reason", "")).strip()),
            confirm_with=[fix(str(c)) for c in confirm][:2] if isinstance(confirm, list) else [],
            cannot_miss=True,
        ))
    total = sum(d.probability for d in assessment.differential)
    if total > 100:
        for d in assessment.differential:
            d.probability = max(1, int(d.probability * 100 / total))
    notes = raw.get("notes")
    assessment.critic_notes = (
        [fix(str(n).strip()) for n in notes if str(n).strip()][:4] if isinstance(notes, list) else []
    )
    if raw.get("urgency") in URGENCY_RANK and URGENCY_RANK[raw["urgency"]] > URGENCY_RANK[assessment.urgency]:
        apply_urgency_floor(assessment, raw["urgency"])
    return assessment


class _Trace:
    """Records each executed step of the AI architecture for the case page."""

    def __init__(self) -> None:
        self.steps: list[PipelineStep] = []

    def run(self, step: str, model: str, fn):  # noqa: ANN001, ANN202
        started = time.perf_counter()
        try:
            value = fn()
        except Exception as exc:
            self.add(step, "failed", model, str(exc)[:160], started)
            raise
        self.add(step, "done", model, "", started)
        return value

    def add(self, step: str, status: str, model: str = "", detail: str = "", started: float | None = None) -> None:
        ms = round((time.perf_counter() - started) * 1000) if started else 0
        self.steps.append(PipelineStep(id=step, status=status, model=model, detail=detail, ms=ms))


def _finish(
    assessment: Assessment, trace: _Trace, reasoner: LLM, data: dict, context: PatientContext, language: str
) -> Assessment:
    try:
        trace.run("critic", reasoner.model, lambda: critique(reasoner, data, assessment, language))
    except Exception as exc:  # noqa: BLE001 - the draft stays usable without the critic
        logger.warning("Safety critic failed: %s", exc)
    raised = apply_urgency_floor(assessment, (context.rules or {}).get("urgency_floor"))
    trace.add("guardrails", "done", detail="raised" if raised else "")
    assessment.pipeline = trace.steps
    return assessment


def assess_clinical(reasoner: LLM, context: PatientContext, language: str) -> Assessment:
    """Symptoms-only differential: rules output + structured intake → reasoner → critic → guardrails."""
    if not reasoner.configured:
        raise AssessmentUnavailableError("GROQ_API_KEY is not configured")
    trace = _Trace()
    trace.add("rules", "done", RULES_LABEL)
    trace.add("imaging", "skipped")
    data = _clinical_payload(context, language)
    system = CLINICAL_REASON_PROMPT.format(
        language=LANGUAGES[language].prompt_name, schema=_clinical_schema(language), **SOURCES[language]
    ) + "\n\n" + ANSWER_IN[language]

    def draft() -> Assessment:
        answer = _clean(json.loads(reasoner.json_completion(system, data, REASON_TOKENS)), "doctor", language, reasoner.model)
        if not answer.summary or not answer.differential:
            raise ValueError("the reasoning model returned an incomplete assessment")
        return answer

    assessment = trace.run("reasoner", reasoner.model, draft)
    assessment.image_observations = []
    assessment.mode = "clinical"
    return _finish(assessment, trace, reasoner, data, context, language)


def assess_with_pipeline(
    vision: LLM,
    result: AnalysisResult,
    image_url: str,
    context: PatientContext,
    language: str,
    reasoner: LLM | None = None,
) -> Assessment:
    """Image case: the multimodal assessment followed by the safety critic and guardrails."""
    trace = _Trace()
    trace.add("rules", "done" if context.rules else "skipped", RULES_LABEL)
    trace.add("imaging", "done", ", ".join(sorted({m for v in result.versions.values() for m in v})))
    started = time.perf_counter()
    assessment = assess(vision, result, image_url, context, "doctor", language, reasoner=reasoner)
    used_vision = vision.model in assessment.model
    used_reasoner = reasoner is not None and reasoner.model in assessment.model
    trace.add("vision", "done" if used_vision else "failed", vision.model)
    trace.add("reasoner", "done" if used_reasoner else "skipped", reasoner.model if reasoner else "", started=started)
    assessment.mode = "multimodal"
    if reasoner is not None and reasoner.configured:
        return _finish(assessment, trace, reasoner, _payload(result, context, language), context, language)
    assessment.pipeline = trace.steps
    return assessment
