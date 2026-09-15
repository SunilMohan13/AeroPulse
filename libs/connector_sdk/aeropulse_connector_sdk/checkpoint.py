"""Cursor helpers for incremental replay fetches.

The project defines ``FetchRequest.cursor`` but had no connector semantics for it.
This module adds the smallest real behavior: the cursor is treated as a
zero-based record offset for replay-mode fetches. That makes incremental pulls
possible without inventing a separate storage layer or a provider-specific API.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TypeVar

T = TypeVar("T")


def apply_cursor(items: Sequence[T], cursor: str | None) -> list[T]:
    """Return the subsequence starting after the cursor offset.

    Args:
        items: Sequence to slice.
        cursor: Optional zero-based index. ``None`` or empty means start at the
            beginning. Negative values are clamped to zero.

    Returns:
        A new list representing the remaining records after the cursor.
    """
    if cursor is None or cursor == "":
        return list(items)
    try:
        start = int(cursor)
    except ValueError:
        return list(items)
    if start < 0:
        start = 0
    return list(items)[start:]
