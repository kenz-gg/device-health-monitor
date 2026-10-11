from __future__ import annotations

import json
import socket
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from agent.collectors.metrics import MetricCollector, browser_monitoring_snapshot


BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
def resolve_device_id() -> str:
    hostname = socket.gethostname().strip()
    return hostname or "Local Device"


DEFAULT_CONFIG = {
    "device_id": resolve_device_id(),
    "host": "127.0.0.1",
    "port": 8000,
    "bind_host": "127.0.0.1",
    "refresh_interval_seconds": 2,
    "history_limit": 1800,
    "allow_browser_monitoring": True,
    "enable_relay": False,
    "relay_url": "https://relay.example.com",
    "relay_token": "replace-with-strong-token",
    "log_level": "INFO",
}


def load_config() -> Dict[str, Any]:
    merged = DEFAULT_CONFIG.copy()
    if CONFIG_PATH.exists():
        with CONFIG_PATH.open("r", encoding="utf-8") as f:
            config = json.load(f)
        merged.update(config)

    static_placeholders = {"win-pc-01", "local-device", "device-health-monitor", ""}
    if not merged.get("device_id") or str(merged["device_id"]).lower().strip() in static_placeholders:
        merged["device_id"] = resolve_device_id()

    return merged


config = load_config()
app = FastAPI(title="Device Health Monitor Agent", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
collector = MetricCollector(config["device_id"])


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "device_id": config["device_id"],
        "agent_version": "1.0.0",
        "service": "windows-agent",
        "timestamp": collector._now().isoformat(),
    }


@app.get("/snapshot")
def snapshot() -> Dict[str, Any]:
    return collector.snapshot()


@app.get("/browser")
def browser() -> Dict[str, Any]:
    if not config.get("allow_browser_monitoring", False):
        raise HTTPException(status_code=403, detail="Browser monitoring disabled")
    return browser_monitoring_snapshot()


@app.get("/metrics/{metric_name}")
def metric_detail(metric_name: str) -> Dict[str, Any]:
    snapshot = collector.snapshot()
    metrics = snapshot.get("metrics", {})
    for key, item in metrics.items():
        if key == metric_name or item.get("metric") == metric_name:
            return item
    raise HTTPException(status_code=404, detail=f"Metric '{metric_name}' not found")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "agent.main:app",
        host=config["bind_host"],
        port=int(config["port"]),
        reload=False,
    )
