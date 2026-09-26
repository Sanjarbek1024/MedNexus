"""Multimodal assessment: image + specialist model outputs + reported symptoms → differential.

A vision-language model sees the image, the structured outputs of the specialist models and
what the person reports, and drafts a differential with estimated likelihoods. The estimates
are the model's judgement, never a certainty: they are capped below 100 % and every answer
carries a disclaimer written here, not by the model.
"""

from __future__ import annotations

import json
import re
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


def _payload(result: AnalysisResult, context: PatientContext) -> dict:
    payload = build_prompt_payload(result)
    payload["symptoms"] = context.symptoms or "not provided"
    payload["age"] = context.age
    payload["sex"] = context.sex
    return payload


def _clean(raw: dict, audience: str, language: str, model: str) -> Assessment:
    # Models occasionally ignore the requested language; label the answer with the one it is in.
    language = written_language(str(raw.get("summary", ""))) or language
    fix = uzbek_latin if language == "uz" else str

    def text(value: object) -> str:
        return fix(str(value).strip())

    items = []
    for item in raw.get("differential") or []:
        try:
            probability = int(round(float(item.get("probability", 0))))
        except (TypeError, ValueError):
            continue
        name = text(item.get("name", ""))
        if name:
            items.append(DifferentialItem(
                name=name,
                probability=min(MAX_PROBABILITY, max(1, probability)),
                reasoning=text(item.get("reasoning", "")),
            ))
    items = sorted(items, key=lambda i: i.probability, reverse=True)[:MAX_ITEMS]
    total = sum(i.probability for i in items)
    if total > 100:  # rescale so the estimates never add up to more than certainty
        for item in items:
            item.probability = max(1, int(item.probability * 100 / total))

    def strings(key: str) -> list[str]:
        return [text(v) for v in raw.get(key) or [] if str(v).strip()][:6]

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
    text = (
        "Study and model outputs (JSON):\n" + json.dumps(_payload(result, context), ensure_ascii=False)
        + "\n\n" + ANSWER_IN[language]
    )
    raw = json.loads(vision.image_json_completion(system, text, image_url, MAX_OUTPUT_TOKENS))
    assessment = _clean(raw, audience, language, vision.model)
    if not assessment.summary or not assessment.differential:
        raise ValueError("the model returned an incomplete assessment")
    return assessment
