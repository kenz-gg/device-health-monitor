// ---------------------------------------------------------------------------
// Network layer: configurable endpoint, timeout-guarded fetch and a REAL
// latency measurement (actual round-trip of a live request). Returns null on
// failure so the UI can honestly show N/A instead of guessing.
// ---------------------------------------------------------------------------

import { STATUS, metric } from '../lib/util.js';

export const DEFAULT_API_BASE = 'http://127.0.0.1:8000';
const LS_BASE = 'dhm.apiBase';

export function getApiBase() {
  if (typeof window !== 'undefined') {
    const cfg = window.__APP_CONFIG__ || {};
    if (cfg.apiBase) return cfg.apiBase;
    const saved = localStorage.getItem(LS_BASE);
    if (saved !== null) return saved; // '' means browser-only mode
  }
  // Auto-detect a locally running agent. If it isn't there the dashboard just
  // falls back to browser-only metrics — the agent is never required.
  return DEFAULT_API_BASE;
}

export function setApiBase(base) {
  try { localStorage.setItem(LS_BASE, base ?? ''); } catch { /* storage blocked */ }
}

export async function fetchWithTimeout(url, { timeout = 3000, ...opts } = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { cache: 'no-store', ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function fetchJson(path, options = {}) {
  const res = await fetchWithTimeout(`${getApiBase()}${path}`, options);
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

// Measure a genuine round-trip. Reads the response body so the timing covers a
// real transfer, not just headers. Returns milliseconds or null when unreachable.
export async function measureLatency(path = '/health', { timeout = 2500, samples = 2 } = {}) {
  const base = getApiBase();
  if (!base) return null;
  const times = [];
  for (let i = 0; i < samples; i += 1) {
    const t0 = performance.now();
    try {
      const res = await fetchWithTimeout(`${base}${path}`, { timeout });
      if (!res.ok) return null;
      await res.text();
      times.push(performance.now() - t0);
    } catch {
      return null;
    }
  }
  return times.reduce((a, b) => a + b, 0) / times.length;
}

// Build a real latency metric from the measurement above.
export function latencyMetric(ms, reachable) {
  if (ms === null || ms === undefined) {
    return metric({
      key: 'latency', label: 'Network Latency', value: null, unit: 'ms',
      status: reachable === false ? STATUS.UNAVAILABLE : STATUS.UNAVAILABLE,
      source: 'browser',
      reason: reachable === false
        ? 'endpoint unreachable — no live request possible'
        : 'no endpoint configured (browser-only mode)',
    });
  }
  return metric({
    key: 'latency', label: 'Network Latency', value: ms, unit: 'ms',
    status: STATUS.OK, source: 'browser',
  });
}
