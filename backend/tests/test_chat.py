import json
from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import upload


class FakeGroq:
    """Stands in for the Groq client: streams canned tokens and records the request."""

    def __init__(self, tokens: list[str] | Exception) -> None:
        self.tokens = tokens
        self.calls: list[dict] = []
        self.chat = SimpleNamespace(completions=self)

    def create(self, **kwargs: object):
        self.calls.append(kwargs)
        if isinstance(self.tokens, Exception):
            raise self.tokens
        return iter(
            SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=t))]) for t in self.tokens
        )


def events(text: str) -> list[tuple[str, dict]]:
    return [
        (block.split("\n")[0].removeprefix("event: "), json.loads(block.split("\n")[1][6:]))
        for block in text.strip().split("\n\n")
    ]


def ask(client: TestClient, case_id: int, message: str, fake: FakeGroq) -> list[tuple[str, dict]]:
    llm = app.state.llm
    llm._client = fake
    try:
        response = client.post(f"/api/cases/{case_id}/chat", json={"message": message, "language": "en"})
        assert response.status_code == 200, response.text
        return events(response.text)
    finally:
        llm._client = None


def test_chat_streams_and_saves_history(client: TestClient, sample: Callable[[str], Path]) -> None:
    case = upload(client, sample("chest_pa_pneumonia.jpg")).json()
    fake = FakeGroq(["The heatmap ", "highlights the right upper zone."])
    received = ask(client, case["case_id"], "Explain the heatmap", fake)

    assert [name for name, _ in received] == ["token", "token", "done"]
    assert "".join(data["text"] for name, data in received if name == "token").startswith("The heatmap")

    request = fake.calls[0]
    assert request["stream"] is True
    system = request["messages"][0]["content"]
    assert "Never invent findings" in system and "Answer in English" in system
    assert '"Consolidation"' in system and "data:image" not in system  # case data, never the image
    assert request["messages"][-1] == {"role": "user", "content": "Explain the heatmap"}

    history = client.get(f"/api/cases/{case['case_id']}/chat").json()
    assert [(m["role"], m["content"]) for m in history] == [
        ("user", "Explain the heatmap"), ("assistant", "The heatmap highlights the right upper zone."),
    ]

    follow_up = FakeGroq(["Consolidation, pneumonia."])
    ask(client, case["case_id"], "Summarize", follow_up)
    roles = [m["role"] for m in follow_up.calls[0]["messages"]]
    assert roles == ["system", "user", "assistant", "user"]  # earlier turns are included


def test_chat_failure_is_reported_and_not_saved(client: TestClient, sample: Callable[[str], Path]) -> None:
    case = upload(client, sample("chest_pa_heart_failure.jpg")).json()
    received = ask(client, case["case_id"], "Draft the impression", FakeGroq(TimeoutError("slow")))
    assert received[-1][0] == "error"
    assert [m["role"] for m in client.get(f"/api/cases/{case['case_id']}/chat").json()] == ["user"]


def test_chat_needs_an_analyzed_case(client: TestClient, sample: Callable[[str], Path]) -> None:
    case_id = upload(client, sample("photo_kitten.jpg")).json()["case_id"]
    response = client.post(f"/api/cases/{case_id}/chat", json={"message": "Hi", "language": "en"})
    assert response.status_code == 409
