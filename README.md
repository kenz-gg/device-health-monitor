# Device Health Monitor

Device Health Monitor is a lightweight monitoring platform for Windows PCs. It combines a local Windows agent, browser monitoring, a local dashboard, and an optional authenticated relay for online access.

## Features

- Local Windows agent with Python and psutil
- Real-time CPU, RAM, storage, network, and system metrics
- Browser monitoring for screen, language, online status, and basic platform data
- Validated metric schema with source, timestamp, and validity state
- Minimal dashboard with overview, history, alerts, and exports
- Optional relay for remote access with authentication and per-device authorization

## Project structure

- frontend/: Vite + Chart.js dashboard
- agent/: Windows local monitoring agent
- relay/: authenticated relay for remote access
- tests/: automated validation and API tests
- docs/: installation, deployment, security, and troubleshooting guides

## Quick start

1. Create a virtual environment for the agent
2. Install Python dependencies from agent/requirements.txt
3. Copy agent/config.example.json to agent/config.json and adjust settings
4. Start the agent: python agent/main.py
5. Start the frontend: cd frontend && npm install && npm run dev
6. Open the app in a browser and point it at the local agent URL

## Important constraints

- Local metrics are sourced from the actual Windows host and marked unavailable if not readable.
- Browser metrics are intentionally separated from Windows metrics.
- Remote access requires explicit authentication and device authorization.
- The project is designed for local-first monitoring with optional online access.

## Security note

Never embed secrets or tokens in frontend source, and avoid opening the agent directly to the internet. Prefer a loopback bind and an authenticated relay.

## Documentation

See the docs folder for installation and deployment guidance.
