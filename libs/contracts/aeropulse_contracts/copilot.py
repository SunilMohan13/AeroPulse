"""Copilot response contract (LLD section 24.2). Numbers must be evidence-grounded."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class CopilotConfidence(BaseModel):
    """Split confidence copied from the event, never invented."""

    model_config = {"extra": "forbid"}

    detection: float | None = None
    source: float | None = None
    forecast: float | None = None
    overall: float | None = None


class CopilotResponse(BaseModel):
    """Structured copilot answer. Empty lists mean no retrieved evidence."""

    model_config = {"extra": "forbid"}

    schema_version: Literal["copilot.v1"] = "copilot.v1"
    answer: str
    observed_facts: list[str] = Field(default_factory=list)
    predicted_conditions: list[str] = Field(default_factory=list)
    likely_sources: list[dict[str, Any]] = Field(default_factory=list)
    confidence: CopilotConfidence = Field(default_factory=CopilotConfidence)
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    llm_used: bool = False
