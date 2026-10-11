# Installation Guide

## Prerequisites

- Windows 10 or 11
- Python 3.11+
- Optional: Node.js 18+ for the frontend
- Administrator rights only for optional service setup

## Agent setup

1. Create a virtual environment:
   python -m venv .venv
2. Activate it:
   .venv\Scripts\activate
3. Install dependencies:
   python -m pip install -r agent/requirements.txt
4. Copy config.example.json to config.json:
   copy agent\config.example.json agent\config.json
5. Edit config.json and set device_id, bind_host, and port.
6. Run the agent:
   python agent\main.py

## Frontend setup

1. Open a terminal in frontend/
2. Install dependencies:
   npm install
3. Start dev server:
   npm run dev -- --host 0.0.0.0

## Local access

Open http://127.0.0.1:5173 (or the chosen frontend port) and set the API base to http://127.0.0.1:8000.

## Security

- Bind the agent to loopback by default.
- Avoid exposing the agent to the internet.
- Keep tokens and secrets in environment files, not in source code.
