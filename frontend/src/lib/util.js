// ---------------------------------------------------------------------------
// Shared helpers: status model, metric factory, formatters and scoring.
//
// STATUS model is the backbone of the "no fake numbers" rule. Every value we
// show must carry a status. Anything that is not OK is rendered as "N/A" plus
// a human reason, never as a made-up 0.
// ---------------------------------------------------------------------------

export const STATUS = {
  OK: 'ok',
  UNSUPPORTED: 'unsupported',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
};

export function metric({ key, label, value = null, unit = '', status = STATUS.OK, source = 'browser', reason = null }) {
  return { key, label, value, unit, status, source, reason };
}

export function isOk(m) {
  if (!m) return false;
  if (m.status !== STATUS.OK) return false;
  const v = m.value;
  if (v === null || v === undefined) return false;
  if (typeof v === 'number' && Number.isNaN(v)) return false;
  return true;
}

export const clamp = (v, min, max) => Math.min(Math.max(Number(v) || 0, min), max);

export function round(v, d = 1) {
  const f = 10 ** d;
  return Math.round((Number(v) || 0) * f) / f;
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
export function formatBytes(bytes) {
  const b = Number(bytes);
  if (bytes === null || bytes === undefined || Number.isNaN(b)) return 'N/A';
  if (b === 0) return '0 B';
  const i = Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(Math.abs(b)) / Math.log(1024)));
  return `${round(b / 1024 ** i, i === 0 ? 0 : 2)} ${BYTE_UNITS[i]}`;
}

export function formatMs(ms) {
  if (ms === null || ms === undefined || Number.isNaN(Number(ms))) return 'N/A';
  return `${round(ms, 1)} ms`;
}

export function formatPercent(v, d = 1) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return 'N/A';
  return `${round(v, d)}%`;
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function statusLabel(m) {
  if (!m) return 'No Data';
  switch (m.status) {
    case STATUS.OK: return 'Live';
    case STATUS.UNSUPPORTED: return 'Not Supported';
    case STATUS.UNAVAILABLE: return 'No Data';
    case STATUS.ERROR: return 'Error';
    default: return 'Unknown';
  }
}

// Short human reason shown under an N/A tile.
export function statusReason(m) {
  if (!m) return 'No measurement';
  if (m.status === STATUS.OK) return m.source === 'agent' ? 'from OS agent' : 'measured live';
  return m.reason || 'not available on this device';
}

export function agoLabel(ts) {
  if (!ts) return 'never';
  const diff = Math.max(0, (Date.now() - ts) / 1000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function clockLabel(d = new Date()) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---------------------------------------------------------------------------
// Transparent health scoring.
//
// Only signals that actually exist are averaged in. The returned `coverage`
// tells the UI how many signal categories we managed to measure, so we never
// present a confident score built on missing (fake-zero) inputs.
// ---------------------------------------------------------------------------
export const SIGNAL_CATEGORIES = 8; // fps, responsiveness, heap, battery, storage, connectivity, cpu, ram

export function computeHealth(parts) {
  if (!parts.length) {
    return { score: 0, coverage: 0, parts, empty: true };
  }
  let num = 0;
  let den = 0;
  parts.forEach((p) => {
    num += p.score * p.weight;
    den += p.weight;
  });
  const score = den ? Math.round(clamp(num / den, 0, 100)) : 0;
  const coverage = Math.round((parts.length / SIGNAL_CATEGORIES) * 100);
  return { score, coverage, parts, empty: false };
}

export function scoreTone(score) {
  if (score >= 80) return 'good';
  if (score >= 60) return 'warn';
  return 'critical';
}

export function scoreWord(score) {
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'Watch';
  return 'Critical';
}

// Respect the user's motion preferences (accessibility + performance).
export const prefersReducedMotion = () => (
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
);

// Animate a number in an element for a premium "count-up" feel.
export function tweenNumber(el, to, { decimals = 0, suffix = '', prefix = '', duration = 550 } = {}) {
  if (!el) return;
  const target = Number(to);
  if (Number.isNaN(target)) { el.textContent = 'N/A'; return; }
  if (prefersReducedMotion() || duration <= 0) {
    el.textContent = `${prefix}${target.toFixed(decimals)}${suffix}`;
    el.dataset.tween = String(target);
    return;
  }
  const from = Number(el.dataset.tween || '0') || 0;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = `${prefix}${(from + (target - from) * eased).toFixed(decimals)}${suffix}`;
    if (t < 1) requestAnimationFrame(step);
    else el.dataset.tween = String(target);
  };
  requestAnimationFrame(step);
}
