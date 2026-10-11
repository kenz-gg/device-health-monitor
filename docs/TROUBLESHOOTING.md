# Troubleshooting

## Agent not reachable

- Confirm the agent is running.
- Check config.json and ensure bind_host and port are correct.
- Confirm no firewall is blocking loopback or local network access.

## Data appears stale

- Verify the timestamp on the last successful sample.
- Review the agent log or health endpoint.
- Check the local agent refresh interval.

## Browser monitoring unavailable

- Browser APIs are limited by the user device and browser.
- Some values may be missing even when the browser is online.

## Remote access failed

- Validate the relay token.
- Confirm device authorization and any date/time issues.
- Check TLS and certificate chain.
