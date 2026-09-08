"""Optional LLM rewrite of a grounded copilot answer.

The model may only rephrase ``answer``. Numeric fields must remain unchanged.
"""

from __future__ import annotations

from aeropulse_common.settings import get_settings
from aeropulse_contracts.copilot import CopilotResponse


def maybe_rewrite_answer(response: CopilotResponse) -> CopilotResponse:
    """Return the grounded response, or a locally rewritten answer if a key is set.

    No network call is made. If ``AEROPULSE_OPENAI_API_KEY`` is present, the
    prose ``answer`` is prefixed so callers can tell a rewrite path ran.
    Observed facts, confidence, and evidence are never modified.
    """
    settings = get_settings()
    key = settings.openai_api_key
    if key is None or not key.get_secret_value():
        return response
    rewritten = response.model_copy(
        update={
            "answer": f"[llm-rewrite-pending] {response.answer}",
            "llm_used": True,
            "limitations": [
                *response.limitations,
                "LLM rewrite is a local stub; numbers were not regenerated.",
            ],
        }
    )
    return rewritten
