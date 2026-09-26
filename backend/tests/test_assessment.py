import json
from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.db.models import Role
from app.main import app
from app.services.assessment import (
    ANSWER_IN,
    DOCTOR_PROMPT,
    MAX_OUTPUT_TOKENS,
    MAX_PROBABILITY,
    PATIENT_PROMPT,
    URGENCY_TEXT,
    _clean,
    urgency_text_matches,
    uzbek_latin,
    written_language,
)
from app.services.hospitals import recommend, specialty_for
from tests.conftest import upload

ANSWER = {
    "summary": "The image and the cough suggest a lung infection.",
    "image_observations": ["Hazy area in the right upper lung"],
    "differential": [
        {"name": "Pneumonia", "probability": 70, "reasoning": "Consolidation with fever"},
        {"name": "Normal variant", "probability": 20, "reasoning": "Low scores elsewhere"},
    ],
    "causes": ["Bacterial infection"],
    "urgency": "soon",
    "urgency_text": "See a doctor within a few days.",
    "next_steps": ["Visit a pulmonologist"],
    "questions_for_doctor": ["Do I need antibiotics?"],
    "specialty": "pulmonology",
}
# The same summary in each language (answers are labelled with the language they are written in).
SUMMARY = {
    "en": ANSWER["summary"],
    "uz": "Rasm va yo‘tal o‘pka yallig‘lanishi bo‘lishi mumkinligini ko‘rsatadi, lekin bu tashxis emas.",
    "ru": "Снимок и кашель могут указывать на воспаление лёгких, но это не диагноз.",
}


class FakeVision:
    """Stands in for the Groq client of the vision-language model and records the request."""

    def __init__(self, answer: dict | Exception) -> None:
        self.answer = answer
        self.calls: list[dict] = []
        self.chat = SimpleNamespace(completions=self)

    def create(self, **kwargs: object):
        self.calls.append(kwargs)
        if isinstance(self.answer, Exception):
            raise self.answer
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(self.answer)))])


def with_vision(fake: FakeVision, action: Callable[[], object]) -> object:
    vision = app.state.service.vision
    vision._client = fake
    try:
        return action()
    finally:
        vision._client = None


def test_estimates_are_never_certain() -> None:
    raw = {
        **ANSWER,
        "differential": [
            {"name": "A", "probability": 100},
            {"name": "B", "probability": 60},
            {"name": "C", "probability": "n/a"},
            {"name": "", "probability": 10},
        ],
        "urgency": "panic",
        "specialty": "astrology",
    }
    assessment = _clean(raw, "patient", "uz", "vision-model")
    probabilities = [d.probability for d in assessment.differential]
    assert [d.name for d in assessment.differential] == ["A", "B"]
    assert max(probabilities) <= MAX_PROBABILITY and sum(probabilities) <= 100
    assert (assessment.urgency, assessment.specialty) == ("soon", "general")
    assert "100%" in assessment.disclaimer  # written by the app, not the model


@pytest.mark.parametrize(
    ("urgency", "language", "text"),
    [
        ("urgent", "en", "Please see a doctor this week to discuss the result."),
        ("urgent", "uz", "Bir hafta ichida shifokorga uchrashing."),
        ("urgent", "ru", "Обратитесь к врачу в ближайшие дни."),
        ("soon", "en", "Go to the emergency department today."),
        ("routine", "ru", "Покажитесь врачу в течение 2-3 дней."),
    ],
)
def test_urgency_text_never_contradicts_the_urgency(urgency: str, language: str, text: str) -> None:
    raw = {**ANSWER, "summary": SUMMARY[language], "urgency": urgency, "urgency_text": text}
    patient = _clean(raw, "patient", language, "vision-model")
    assert patient.urgency == urgency
    assert patient.urgency_text == URGENCY_TEXT["patient"][language][urgency]
    assert _clean(raw, "doctor", language, "vision-model").urgency_text == URGENCY_TEXT["doctor"][language][urgency]


@pytest.mark.parametrize(
    ("urgency", "language", "text"),
    [
        ("urgent", "en", "Please see a doctor today: the fever and breathlessness need a same-day check."),
        ("soon", "uz", "Shoshilinch emas, lekin bir necha kun ichida pulmonologga uchrashing."),
        ("soon", "ru", "Обратитесь к пульмонологу в ближайшие дни из-за кашля и температуры."),
        ("routine", "en", "No rush: discuss it at your next check-up."),
        ("routine", "uz", "Natijani navbatdagi ko‘rikda muhokama qiling."),
        ("soon", "en", "The cough and fever should be checked by a lung specialist."),  # no time frame: kept
    ],
)
def test_consistent_urgency_text_is_kept(urgency: str, language: str, text: str) -> None:
    raw = {**ANSWER, "summary": SUMMARY[language], "urgency": urgency, "urgency_text": text}
    assert _clean(raw, "patient", language, "vision-model").urgency_text == text


def test_every_urgency_has_an_app_written_text() -> None:
    for audience in ("patient", "doctor"):
        for language in ("uz", "en", "ru"):
            for urgency in ("routine", "soon", "urgent"):
                text = URGENCY_TEXT[audience][language][urgency]
                assert urgency_text_matches(urgency, text, language), (audience, language, urgency)
    assert _clean({**ANSWER, "urgency_text": ""}, "patient", "en", "m").urgency_text == URGENCY_TEXT["patient"]["en"]["soon"]


def test_uzbek_answers_stay_in_latin_script() -> None:
    assert uzbek_latin("Gipofiz adenoması va adenoма (o‘sma)") == "Gipofiz adenomasi va adenoma (o‘sma)"
    assert uzbek_latin("Yuqori ehtimol: Şish, qo‘ldagi og‘riq") == "Yuqori ehtimol: Shish, qo‘ldagi og‘riq"
    assert uzbek_latin("Bosh miya MRT tasviri") == "Bosh miya MRT tasviri"  # untouched
    raw = {**ANSWER, "summary": "Gipofiz adenoması ehtimoli bor.", "differential": [{"name": "Adenoма", "probability": 60}]}
    cleaned = _clean(raw, "patient", "uz", "vision-model")
    assert cleaned.summary == "Gipofiz adenomasi ehtimoli bor." and cleaned.differential[0].name == "Adenoma"
    # Other languages are left as written.
    assert _clean(raw, "patient", "ru", "vision-model").summary == "Gipofiz adenoması ehtimoli bor."


def test_an_answer_in_another_language_is_labelled_with_it() -> None:
    # Asked for Uzbek, answered in English: labelled English, so the app offers to rewrite it.
    assert _clean(ANSWER, "patient", "uz", "vision-model").language == "en"
    assert _clean({**ANSWER, "summary": SUMMARY["ru"]}, "patient", "uz", "vision-model").language == "ru"
    assert _clean({**ANSWER, "summary": SUMMARY["uz"]}, "patient", "uz", "vision-model").language == "uz"
    # Short or ambiguous text keeps the requested language.
    assert written_language("Pnevmoniya ehtimoli.") is None
    assert _clean({**ANSWER, "summary": "Pnevmoniya ehtimoli."}, "doctor", "uz", "vision-model").language == "uz"


def test_prompts_tie_urgency_text_to_the_urgency_and_stay_compact() -> None:
    for prompt in (PATIENT_PROMPT, DOCTOR_PROMPT):
        assert '"urgent" = see a doctor today' in prompt and '"soon" = see a doctor within the next few days' in prompt
        assert "No item above\n  90, the sum at most 100" in prompt
        assert prompt.startswith("Answer in {language}.")
    assert MAX_OUTPUT_TOKENS <= 1000


def test_partner_hospitals_come_first_and_emergency_when_urgent() -> None:
    routine = recommend("neurosurgery")
    assert routine[0].partner and "neurosurgery" in routine[1].specialties
    assert recommend("pulmonology", "urgent")[1].emergency
    assert recommend("unknown-specialty")[0].partner
    # Keys match the models' finding names exactly.
    assert specialty_for(["Lung lesion"]) == "oncology"
    assert specialty_for(["Enlarged cardiomediastinum"]) == "cardiology"


def test_users_get_a_plain_language_assessment(make_user: Callable[[str], TestClient], sample: Callable[[str], Path]) -> None:
    person = make_user(Role.USER)
    fake = FakeVision(ANSWER)
    body = with_vision(fake, lambda: upload(
        person, sample("chest_pa_pneumonia.jpg"), symptoms="Cough and fever", age="40", sex="female"
    ).json())

    assessment = body["assessment"]
    assert assessment["audience"] == "patient" and assessment["differential"][0]["name"] == "Pneumonia"
    assert body["hospitals"][0]["partner"] and "pulmonology" in body["hospitals"][1]["specialties"]

    request = fake.calls[0]
    system, content = request["messages"][0]["content"], request["messages"][1]["content"]
    assert "ordinary person" in system and "English" in system
    assert content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")  # the model sees the image
    assert "Cough and fever" in content[0]["text"] and '"Consolidation"' in content[0]["text"]


def test_doctors_get_a_clinical_assessment_and_can_regenerate(client: TestClient, sample: Callable[[str], Path]) -> None:
    fake = FakeVision(ANSWER)
    case_id = with_vision(fake, lambda: upload(client, sample("chest_pa_pneumonia.jpg")).json())["case_id"]
    assert "physician" in fake.calls[0]["messages"][0]["content"]

    fake.answer = {**ANSWER, "summary": SUMMARY["ru"]}
    again = with_vision(fake, lambda: client.post(f"/api/cases/{case_id}/assessment", json={"language": "ru"}))
    assert again.status_code == 200 and again.json()["assessment"]["language"] == "ru"
    assert "Russian" in fake.calls[1]["messages"][0]["content"]
    # The request closes with the instruction written in the answer language itself.
    assert fake.calls[1]["messages"][1]["content"][0]["text"].endswith(ANSWER_IN["ru"])


def test_assessment_failure_keeps_the_case_usable(client: TestClient, sample: Callable[[str], Path]) -> None:
    body = with_vision(FakeVision(RuntimeError("upstream down")), lambda: upload(client, sample("chest_pa_pneumonia.jpg")).json())
    assert body["status"] == "ai_ready" and body["findings"]
    assert body["assessment"] is None and body["assessment_error"]
