# Security and Privacy

## Local agent

- Bind to loopback by default
- Validate request inputs and size constraints
- Do not expose arbitrary shell access or filesystem endpoints
- Limit collection to monitoring-related data

## Browser and frontend

- Validate API responses before rendering
- Avoid storing tokens in source or bundle files
- Use HTTPS for remote deployments
- Validate CORS and Private Network Access assumptions
- Treat localhost as a trust boundary, not a guarantee of safety

## Remote access

- Require user authentication
- Require per-device authorization
- Enforce TLS and short-lived tokens
- Rate-limit endpoints
- Log security events without storing secrets

## Data minimization

Only send the metrics required for monitoring. The app does not need to transmit full directory contents, credentials, or arbitrary process data.
