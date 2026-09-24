"""Thin wrapper around the Groq chat API (JSON completions and token streaming)."""

from __future__ import annotations

import json
from collections.abc import Iterator

from groq import Groq


class LLMUnavailableError(RuntimeError):
    pass


class LLM:
    def __init__(self, api_key: str | None, model: str, timeout_s: float) -> None:
        self.model = model
        self._client = Groq(api_key=api_key, timeout=timeout_s, max_retries=1) if api_key else None

    @property
    def configured(self) -> bool:
        return self._client is not None

    def _options(self) -> dict:
        return {"reasoning_effort": "low"} if self.model.startswith("openai/gpt-oss") else {}

    def _require_client(self) -> Groq:
        if self._client is None:
            raise LLMUnavailableError("GROQ_API_KEY is not configured")
        return self._client

    def json_completion(self, system: str, payload: dict, max_tokens: int = 2048) -> str:
        completion = self._require_client().chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_completion_tokens=max_tokens,
            **self._options(),
        )
        return completion.choices[0].message.content or ""

    def stream(self, messages: list[dict], max_tokens: int = 1200) -> Iterator[str]:
        chunks = self._require_client().chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.3,
            max_completion_tokens=max_tokens,
            stream=True,
            **self._options(),
        )
        for chunk in chunks:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
