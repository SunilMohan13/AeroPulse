"""Low-cardinality Prometheus metrics for AeroPulse HTTP services."""

from prometheus_client import Counter, Gauge, Histogram

HTTP_REQUESTS = Counter(
    "aeropulse_http_requests_total",
    "HTTP requests completed",
    ("method", "route", "status"),
)
HTTP_DURATION = Histogram(
    "aeropulse_http_request_duration_seconds",
    "HTTP request duration",
    ("method", "route"),
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
)
HTTP_IN_FLIGHT = Gauge(
    "aeropulse_http_requests_in_flight",
    "HTTP requests currently executing",
)
CACHE_REQUESTS = Counter(
    "aeropulse_api_cache_requests_total",
    "API response cache outcomes",
    ("route", "outcome"),
)


def route_label(request: object) -> str:
    """Return the matched route template, avoiding IDs in metric labels."""
    scope = getattr(request, "scope", {})
    route = scope.get("route")
    return getattr(route, "path", None) or scope.get("path", "unknown")
