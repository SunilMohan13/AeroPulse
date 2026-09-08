"""Optional LLM rewrite stub: prose only, numbers unchanged."""

from aeropulse_common.settings import Settings, get_settings
from aeropulse_contracts.copilot import CopilotConfidence, CopilotResponse
from aeropulse_intelligence.llm import maybe_rewrite_answer
from pydantic import SecretStr


def test_no_key_leaves_response() -> None:
    get_settings.cache_clear()
    original = CopilotResponse(
        answer="Event x is ACTIVE.",
        confidence=CopilotConfidence(overall=0.5),
        llm_used=False,
    )
    out = maybe_rewrite_answer(original)
    assert out.answer == original.answer
    assert out.llm_used is False


def test_key_prefixes_answer_without_changing_confidence() -> None:
    get_settings.cache_clear()
    settings = Settings(openai_api_key=SecretStr("sk-test-not-a-real-key"))
    original = CopilotResponse(
        answer="Event x is ACTIVE.",
        confidence=CopilotConfidence(overall=0.81, detection=0.8),
        llm_used=False,
    )
    from unittest.mock import patch

    with patch("aeropulse_intelligence.llm.get_settings", return_value=settings):
        out = maybe_rewrite_answer(original)
    assert out.answer.startswith("[llm-rewrite-pending]")
    assert out.confidence.overall == 0.81
    assert out.llm_used is True
    get_settings.cache_clear()
