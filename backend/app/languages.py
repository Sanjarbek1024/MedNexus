"""Languages the physician-facing report can be written in."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Language:
    code: str
    label: str  # native name, shown in the UI
    prompt_name: str  # how the language is named in LLM instructions


LANGUAGES: dict[str, Language] = {
    language.code: language
    for language in (
        Language("uz", "O‘zbekcha", "Uzbek (Latin script)"),
        Language("en", "English", "English"),
        Language("ru", "Русский", "Russian"),
    )
}
DEFAULT_LANGUAGE = "uz"
