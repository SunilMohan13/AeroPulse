"""Test helpers for connector contract tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

from aeropulse_connector_sdk.contracts import ConnectorMetadata


def load_fixture(path: str | Path) -> Any:
    """Load a JSON fixture file.

    Args:
        path: Path to a JSON document.

    Returns:
        Parsed JSON (dict or list).
    """
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_yaml_metadata(path: str | Path) -> ConnectorMetadata:
    """Load connector metadata.yaml into a typed model."""
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return ConnectorMetadata.model_validate(data)
