from __future__ import annotations

import platform
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import psutil

from agent.security.validation import build_metric, ensure_valid_metric, utc_now


class MetricCollector:
    def __init__(self, device_id: str):
        self.device_id = device_id

    def _now(self) -> datetime:
        return utc_now()

    def cpu(self) -> Dict[str, Any]:
        now = self._now()
        try:
            total_percent = psutil.cpu_percent(interval=1.0)
            per_core = psutil.cpu_percent(interval=None, percpu=True)
            freq = psutil.cpu_freq()
            logical = psutil.cpu_count(logical=True) or 0
            physical = psutil.cpu_count(logical=False) or 0
            data = {
                "total_usage": build_metric(
                    device_id=self.device_id,
                    metric="cpu_usage",
                    value=round(float(total_percent), 2),
                    unit="%",
                    source="windows-agent",
                    timestamp=now,
                    status="available",
                ),
                "per_core": build_metric(
                    device_id=self.device_id,
                    metric="cpu_core_usage",
                    value=[round(float(v), 2) for v in per_core],
                    unit="%",
                    source="windows-agent",
                    timestamp=now,
                    status="available",
                ),
                "logical_cores": build_metric(
                    device_id=self.device_id,
                    metric="cpu_logical_cores",
                    value=logical,
                    unit="count",
                    source="windows-agent",
                    timestamp=now,
                    status="available",
                ),
                "physical_cores": build_metric(
                    device_id=self.device_id,
                    metric="cpu_physical_cores",
                    value=physical,
                    unit="count",
                    source="windows-agent",
                    timestamp=now,
                    status="available",
                ),
                "frequency": build_metric(
                    device_id=self.device_id,
                    metric="cpu_frequency",
                    value={
                        "current_mhz": round(float(freq.current), 2) if freq and freq.current else None,
                        "min_mhz": round(float(freq.min), 2) if freq and freq.min else None,
                        "max_mhz": round(float(freq.max), 2) if freq and freq.max else None,
                    },
                    unit="MHz",
                    source="windows-agent",
                    timestamp=now,
                    status="available" if freq else "unsupported",
                    error=None if freq else "CPU frequency unavailable",
                ),
            }
            return data
        except Exception as exc:  # pragma: no cover - runtime fallback
            return {
                "total_usage": build_metric(
                    device_id=self.device_id,
                    metric="cpu_usage",
                    value=None,
                    unit="%",
                    source="windows-agent",
                    timestamp=now,
                    status="error",
                    error=str(exc),
                )
            }

    def memory(self) -> Dict[str, Any]:
        now = self._now()
        try:
            mem = psutil.virtual_memory()
            swap = psutil.swap_memory()
            return {
                "total_ram": build_metric(
                    device_id=self.device_id,
                    metric="memory_total",
                    value=round(mem.total / (1024 ** 3), 2),
                    unit="GB",
                    source="windows-agent",
                    timestamp=now,
                    status="available",
                ),
                "used_ram": build_metric(
                    device_id=self.device_id,
                    metric="memory_used",
                    value=round(mem.used / (1024 ** 3), 2),
                    unit="GB",
                    source="windows-agent",
                    timestamp=now,
                    status="available",
                ),
                "available_ram": build_metric(
                    device_id=self.device_id,
                    metric="memory_available",
                    value=round(mem.available / (1024 ** 3), 2),
                    unit="GB",
                    source="windows-agent",
                    timestamp=now,
                    status="available",
                ),
                "memory_percent": build_metric(
                    device_id=self.device_id,
                    metric="memory_usage_percent",
                    value=round(mem.percent, 2),
                    unit="%",
                    source="windows-agent",
                    timestamp=now,
                    status="available",
                ),
                "swap_total": build_metric(
                    device_id=self.device_id,
                    metric="swap_total",
                    value=round(swap.total / (1024 ** 3), 2),
                    unit="GB",
                    source="windows-agent",
                    timestamp=now,
                    status="available" if swap.total else "unsupported",
                ),
                "swap_used": build_metric(
                    device_id=self.device_id,
                    metric="swap_used",
                    value=round(swap.used / (1024 ** 3), 2),
                    unit="GB",
                    source="windows-agent",
                    timestamp=now,
                    status="available" if swap.total else "unsupported",
                ),
            }
        except Exception as exc:
            return {
                "memory_percent": build_metric(
                    device_id=self.device_id,
                    metric="memory_usage_percent",
                    value=None,
                    unit="%",
                    source="windows-agent",
                    timestamp=now,
                    status="error",
                    error=str(exc),
                )
            }

    def storage(self) -> Dict[str, Any]:
        now = self._now()
        try:
            partitions = []
            for partition in psutil.disk_partitions(all=False):
                try:
                    usage = psutil.disk_usage(partition.mountpoint)
                    partitions.append({
                        "device": partition.device,
                        "mountpoint": partition.mountpoint,
                        "fstype": partition.fstype,
                        "total_gb": round(usage.total / (1024 ** 3), 2),
                        "used_gb": round(usage.used / (1024 ** 3), 2),
                        "free_gb": round(usage.free / (1024 ** 3), 2),
                        "percent_used": round((usage.used / usage.total) * 100, 2) if usage.total else 0,
                    })
                except Exception:
                    continue
            return {
                "partitions": build_metric(
                    device_id=self.device_id,
                    metric="storage_partitions",
                    value=partitions,
                    unit="list",
                    source="windows-agent",
                    timestamp=now,
                    status="available" if partitions else "unavailable",
                    error=None if partitions else "No accessible partitions found",
                )
            }
        except Exception as exc:
            return {
                "partitions": build_metric(
                    device_id=self.device_id,
                    metric="storage_partitions",
                    value=None,
                    unit="list",
                    source="windows-agent",
                    timestamp=now,
                    status="error",
                    error=str(exc),
                )
            }

    def network(self) -> Dict[str, Any]:
        now = self._now()
        try:
            counters = psutil.net_io_counters(pernic=True)
            adapters = []
            for name, stats in counters.items():
                adapters.append({
                    "name": name,
                    "bytes_sent": stats.bytes_sent,
                    "bytes_recv": stats.bytes_recv,
                    "packets_sent": stats.packets_sent,
                    "packets_recv": stats.packets_recv,
                })
            return {
                "adapters": build_metric(
                    device_id=self.device_id,
                    metric="network_adapters",
                    value=adapters,
                    unit="bytes",
                    source="windows-agent",
                    timestamp=now,
                    status="available" if adapters else "unavailable",
                    error=None if adapters else "No network adapters detected",
                )
            }
        except Exception as exc:
            return {
                "adapters": build_metric(
                    device_id=self.device_id,
                    metric="network_adapters",
                    value=None,
                    unit="bytes",
                    source="windows-agent",
                    timestamp=now,
                    status="error",
                    error=str(exc),
                )
            }

    def system(self) -> Dict[str, Any]:
        now = self._now()
        boot_time = datetime.fromtimestamp(psutil.boot_time(), tz=timezone.utc)
        return {
            "os": build_metric(
                device_id=self.device_id,
                metric="os_version",
                value=f"{platform.system()} {platform.release()}",
                unit="text",
                source="windows-agent",
                timestamp=now,
                status="available",
            ),
            "architecture": build_metric(
                device_id=self.device_id,
                metric="system_architecture",
                value=platform.machine(),
                unit="text",
                source="windows-agent",
                timestamp=now,
                status="available",
            ),
            "uptime_seconds": build_metric(
                device_id=self.device_id,
                metric="uptime_seconds",
                value=round(time.time() - psutil.boot_time(), 2),
                unit="s",
                source="windows-agent",
                timestamp=now,
                status="available",
            ),
            "boot_time": build_metric(
                device_id=self.device_id,
                metric="boot_time",
                value=boot_time.isoformat(),
                unit="iso8601",
                source="windows-agent",
                timestamp=now,
                status="available",
            ),
        }

    def battery(self) -> Dict[str, Any]:
        now = self._now()
        battery = psutil.sensors_battery()
        if battery is None:
            return {
                "status": build_metric(
                    device_id=self.device_id,
                    metric="battery_status",
                    value=None,
                    unit="text",
                    source="windows-agent",
                    timestamp=now,
                    status="unsupported",
                    error="Battery not applied to this device",
                )
            }
        return {
            "percent": build_metric(
                device_id=self.device_id,
                metric="battery_percent",
                value=round(battery.percent, 2),
                unit="%",
                source="windows-agent",
                timestamp=now,
                status="available",
            ),
            "plugged_in": build_metric(
                device_id=self.device_id,
                metric="battery_plugged_in",
                value=bool(battery.power_plugged),
                unit="bool",
                source="windows-agent",
                timestamp=now,
                status="available",
            ),
        }

    def thermal(self) -> Dict[str, Any]:
        now = self._now()
        sensors = getattr(psutil, "sensors_temperatures", lambda: {})()
        if not sensors:
            return {
                "status": build_metric(
                    device_id=self.device_id,
                    metric="thermal_status",
                    value=None,
                    unit="text",
                    source="windows-agent",
                    timestamp=now,
                    status="unsupported",
                    error="No thermal sensors available",
                )
            }
        return {
            "sensors": build_metric(
                device_id=self.device_id,
                metric="thermal_sensors",
                value={k: [{"label": item.label, "current": item.current, "high": item.high, "critical": item.critical} for item in v] for k, v in sensors.items()},
                unit="C",
                source="windows-agent",
                timestamp=now,
                status="available",
            )
        }

    def snapshot(self) -> Dict[str, Any]:
        payload = {
            "device_id": self.device_id,
            "timestamp": utc_now().isoformat(),
            "metrics": {
                **self.cpu(),
                **self.memory(),
                **self.storage(),
                **self.network(),
                **self.system(),
                **self.battery(),
                **self.thermal(),
            },
        }
        return payload


def browser_monitoring_snapshot() -> Dict[str, Any]:
    return {
        "device_id": "browser",
        "timestamp": utc_now().isoformat(),
        "metrics": {
            "screen_resolution": build_metric(
                device_id="browser",
                metric="screen_resolution",
                value={"width": None, "height": None},
                unit="px",
                source="browser-monitoring",
                timestamp=utc_now(),
                status="unavailable",
                error="Browser API not available on server",
            )
        }
    }
