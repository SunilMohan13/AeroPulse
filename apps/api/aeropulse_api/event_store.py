"""Process-local event store used by tests and as a DB fallback."""

from __future__ import annotations

from aeropulse_intelligence.engine import EventStore

EVENT_STORE = EventStore()


def reset_event_store() -> EventStore:
    """Replace the process store (tests)."""
    global EVENT_STORE
    EVENT_STORE = EventStore()
    return EVENT_STORE
