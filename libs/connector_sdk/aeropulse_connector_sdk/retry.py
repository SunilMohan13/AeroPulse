"""HTTP retry policy with exponential backoff."""

from collections.abc import Callable
from typing import TypeVar

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

T = TypeVar("T")


def retry_http(fn: Callable[..., T]) -> Callable[..., T]:
    """Retry an HTTP callable on timeout and 5xx/429 transport errors.

    Args:
        fn: Callable that may raise ``httpx.HTTPError``.

    Returns:
        Wrapped callable with exponential backoff (max 5 attempts).
    """
    return retry(
        reraise=True,
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=16),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
    )(fn)
