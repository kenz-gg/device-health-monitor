from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import Depends, FastAPI, Header, HTTPException

app = FastAPI(title="Device Health Monitor Relay", version="1.0.0")
ALLOWED_TOKEN = os.getenv("RELAY_TOKEN", "replace-with-strong-token")


def require_token(authorization: str | None = Header(default=None)) -> None:
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1]
    if token != ALLOWED_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token")


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "ok", "service": "relay"}


@app.get("/devices")
def devices(_: None = Depends(require_token)) -> Dict[str, Any]:
    return {
        "devices": [
            {"device_id": "WIN-PC-01", "status": "online", "last_seen": None},
        ]
    }


@app.get("/device/{device_id}")
def device(device_id: str, _: None = Depends(require_token)) -> Dict[str, Any]:
    return {
        "device_id": device_id,
        "status": "online",
        "metrics": {},
        "permission": "authorized",
    }
