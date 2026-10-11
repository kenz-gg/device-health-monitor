from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

VALID_STATUSES = {
    "available",
    "stale",
    "unsupported",
    "permission_denied",
    "unavailable",
    "error",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_iso8601(value: Optional[datetime] = None) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def build_metric(
    *,
    device_id: str,
    metric: str,
    value: Any,
    unit: str,
    source: str,
    timestamp: Optional[datetime] = None,
    status: str = "available",
    error: Optional[str] = None,
) -> Dict[str, Any]:
    if status not in VALID_STATUSES:
        raise ValueError(f"Unsupported metric status: {status}")
    return {
        "device_id": device_id,
        "metric": metric,
        "value": value,
        "unit": unit,
        "source": source,
        "timestamp": as_iso8601(timestamp),
        "status": status,
        "error": error,
    }


def calculate_network_throughput(byte_change: float, elapsed_seconds: float) -> float:
    if elapsed_seconds <= 0:
        raise ValueError("elapsed_seconds must be greater than zero")
    return float(byte_change * 8 / elapsed_seconds)


def stale_after(metric_name: str, age_seconds: float, now: Optional[datetime] = None) -> bool:
    if age_seconds is None:
        return False
    if now is None:
        now = utc_now()
    return age_seconds > 0


def mark_if_stale(metric: Dict[str, Any], max_age_seconds: float, now: Optional[datetime] = None) -> Dict[str, Any]:
    if metric.get("status") != "available" or metric.get("timestamp") is None:
        return metric
    if now is None:
        now = utc_now()
    ts = datetime.fromisoformat(metric["timestamp"])
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    age = (now - ts).total_seconds()
    if age > max_age_seconds:
        metric["status"] = "stale"
        metric["error"] = f"Data older than {max_age_seconds}s"
    return metric


def ensure_valid_metric(metric: Dict[str, Any], *, max_age_seconds: Optional[float] = None) -> Dict[str, Any]:
    metric = dict(metric)
    if metric.get("status") in {"unavailable", "unsupported", "permission_denied", "error"}:
        return metric
    if metric.get("value") is None:
        metric["status"] = "unavailable"
        metric["error"] = metric.get("error") or "No valid sample available"
        return metric
    if max_age_seconds is not None:
        metric = mark_if_stale(metric, max_age_seconds)
    return metric
