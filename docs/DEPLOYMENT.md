# Deployment Guide

## Local deployment

Use the local agent and frontend on the same machine. This is the recommended option for privacy and low overhead.

- Agent URL: http://127.0.0.1:8000
- Frontend URL: http://127.0.0.1:5173

## Remote deployment

A safer default is to keep the agent on the Windows host and send data through a relay that requires authentication. The relay should not execute arbitrary commands and should only relay authorized metrics.

### Recommended pattern

- Agent connects outbound to relay using an API token
- Relay validates the token and only accepts authorized devices
- Browser dashboard fetches from a remote relay only after user login
- Device access is restricted to authorized users

## Free-tier considerations

Before selecting a hosting service, verify:

- TLS requirements
- free-plan limits
- idle sleep behavior
- data transfer caps
- domain and custom certificate needs

The project does not assume a free remote hosting service is always available or unlimited.
