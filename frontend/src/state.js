// ---------------------------------------------------------------------------
// Application state + the real-time monitoring engine (DOM-free).
//
// Owns: live metric collection, transparent health scoring, alerts,
// recommendations, history, the optional OS-agent bridge and settings.
// The UI subscribes via state.refresh / state.onAgent / state.onSettings.
// ---------------------------------------------------------------------------

import {
  isOk, clamp, round, formatBytes, computeHealth,
} from './lib/util.js';
import {
  LiveMonitor, collectStaticProfile, collectTiming, initBattery, initStorage,
  refreshStorage, initNetworkInfo, liveMetrics, agentMetrics, capabilityMatrix,
} from './lib/collectors.js';
import { getApiBase, setApiBase, fetchJson, measureLatency, latencyMetric } from './services/api.js';

const HISTORY_MAX = 60;

export const state = {
  intervalMs: 1000,
  monitor: new LiveMonitor(),
  staticProfile: null,
  timing: null,
  caches: {
    battery: { supported: false, level: null, charging: null, chargingTime: null, dischargingTime: null },
    storage: { supported: false, usage: null, quota: null, persisted: null },
    netInfo: { supported: false, effectiveType: null, downlink: null, rtt: null, saveData: null },
  },
  agent: { base: getApiBase(), userConfigured: false, connected: false, device: null, lastOk: null, reachable: false },
  agentData: null,
  latency: null,
  live: {},
  health: { score: 0, coverage: 0, parts: [], empty: true },
  history: { labels: [], fps: [], lag: [], heap: [], cpu: [], ram: [] },
  alerts: [],
  recs: [],
  log: [],
  prevAlertKeys: new Set(),
  startedAt: performance.now(),
  lastTick: null,
  _timer: null,
  _lastStorageCheck: 0,

  // Injected by the UI layer.
  refresh: () => {},
  onAgent: () => {},
  onSettings: () => {},

  theme: localStorage.getItem('dhm.theme') || 'dark',
  sound: localStorage.getItem('dhm.sound') === '1',
  notify: localStorage.getItem('dhm.notify') === '1',
};

// --- Logging ----------------------------------------------------------------
export function logEvent(sev, msg) {
  state.log.unshift({ t: Date.now(), sev, msg });
  if (state.log.length > 40) state.log.length = 40;
  state.refresh();
}

// --- Boot the collectors ---------------------------------------------------
export function initCore() {
  state.staticProfile = collectStaticProfile();
  state.timing = collectTiming();
  initBattery(state.caches.battery);
  initStorage(state.caches.storage);
  initNetworkInfo(state.caches.netInfo);
}

// --- Settings ---------------------------------------------------------------
export function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem('dhm.theme', theme);
  state.onSettings();
}

export function toggleSound() {
  state.sound = !state.sound;
  localStorage.setItem('dhm.sound', state.sound ? '1' : '0');
  state.onSettings();
  if (state.sound) beep(880, 0.07);
}

export function toggleNotify() {
  if (!('Notification' in window)) { logEvent('warn', 'Browser ini tidak mendukung notifikasi.'); return; }
  if (!state.notify) {
    Notification.requestPermission().then((perm) => {
      state.notify = perm === 'granted';
      localStorage.setItem('dhm.notify', state.notify ? '1' : '0');
      state.onSettings();
      logEvent(state.notify ? 'good' : 'warn', state.notify ? 'Notifikasi desktop aktif.' : 'Izin notifikasi ditolak.');
    });
  } else {
    state.notify = false;
    localStorage.setItem('dhm.notify', '0');
    state.onSettings();
  }
}

let audioCtx = null;
export function beep(freq = 660, dur = 0.12) {
  if (!state.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq; o.type = 'sine'; g.gain.value = 0.05;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch { /* audio blocked until a user gesture */ }
}

function notify(title, body) {
  if (!state.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body }); } catch { /* blocked */ }
}

// --- Agent bridge -----------------------------------------------------------
export async function probeAgent(userInitiated = false) {
  const base = state.agent.base;
  if (!base) {
    Object.assign(state.agent, { connected: false, reachable: false });
    state.agentData = null;
    state.onAgent();
    if (userInitiated) logEvent('info', 'Mode browser-only aktif (tanpa agent OS).');
    return;
  }
  try {
    const health = await fetchJson('/health');
    Object.assign(state.agent, { connected: true, reachable: true, device: health.device_id || 'Agent', lastOk: Date.now() });
    state.onAgent();
    if (userInitiated) logEvent('good', `Agent tersambung: ${state.agent.device}.`);
  } catch {
    Object.assign(state.agent, { connected: false, reachable: false });
    state.agentData = null;
    state.onAgent();
    logEvent('info', userInitiated
      ? `Agent tidak terjangkau di ${base}. Dasbor tetap jalan dengan metrik browser.`
      : 'Agent OS tidak terdeteksi — memakai metrik browser (tanpa agent).');
  }
}

export function connectAgent(url) {
  state.agent.base = (url || '').trim();
  state.agent.userConfigured = true;
  setApiBase(state.agent.base);
  probeAgent(true);
}

export function clearAgent() {
  state.agent.base = '';
  state.agent.userConfigured = true;
  setApiBase('');
  state.agent.connected = false;
  state.agent.reachable = false;
  state.agentData = null;
  state.onAgent();
  logEvent('info', 'Beralih ke mode browser-only.');
}

function refreshLatency() {
  if (!state.agent.base) { state.latency = null; return; }
  measureLatency('/health', { samples: 1 }).then((ms) => { state.latency = ms; }).catch(() => { state.latency = null; });
}

// --- Health scoring ---------------------------------------------------------
function buildHealthParts(live, agent) {
  const parts = [];
  const mon = state.monitor;

  if (mon.visible && isOk(live.fps)) {
    const fps = Number(live.fps.value);
    parts.push({ label: 'Frame Rate', weight: 1.5, score: clamp((fps - 20) / 50 * 100, 0, 100), display: `${round(fps, 0)} FPS` });
  }
  if (isOk(live.lag)) {
    const lag = Number(live.lag.value);
    parts.push({ label: 'Responsiveness', weight: 1.2, score: clamp(100 - (lag / 250) * 100, 0, 100), display: `${round(lag, 0)} ms` });
  }
  if (isOk(live.heap) && live.heap.extra) {
    parts.push({ label: 'JS Heap', weight: 1, score: clamp(100 - (live.heap.extra.ratio / 0.7) * 100, 0, 100), display: formatBytes(live.heap.value) });
  }
  if (isOk(live.battery)) {
    const lvl = Number(live.battery.value);
    const charging = live.battery.extra?.charging;
    let s = clamp((lvl - 10) / 90 * 100, 0, 100);
    if (charging) s = Math.max(s, 85);
    parts.push({ label: 'Battery', weight: 1, score: s, display: `${round(lvl, 0)}%${charging ? ' ⚡' : ''}` });
  }
  if (isOk(live.storage)) {
    const pct = Number(live.storage.value);
    parts.push({ label: 'Storage', weight: 1, score: clamp(100 - ((pct - 40) / 60) * 100, 0, 100), display: `${round(pct, 1)}% used` });
  }
  parts.push({ label: 'Connectivity', weight: 1.2, score: navigator.onLine ? 100 : 0, display: navigator.onLine ? 'Online' : 'Offline' });

  if (agent && isOk(agent.cpu)) {
    const cpu = Number(agent.cpu.value);
    parts.push({ label: 'CPU (OS)', weight: 1.3, score: clamp(100 - Math.max(cpu - 55, 0) / 45 * 100, 0, 100), display: `${round(cpu, 1)}%`, agent: true });
  }
  if (agent && isOk(agent.ram)) {
    const ram = Number(agent.ram.value);
    parts.push({ label: 'RAM (OS)', weight: 1.3, score: clamp(100 - Math.max(ram - 60, 0) / 40 * 100, 0, 100), display: `${round(ram, 1)}%`, agent: true });
  }
  return parts;
}

function buildAlerts(live, agent) {
  const out = [];
  const push = (key, sev, msg) => out.push({ key, sev, msg });

  if (!navigator.onLine) push('offline', 'critical', 'Perangkat offline — tidak ada koneksi jaringan.');
  if (state.monitor.visible && isOk(live.fps) && Number(live.fps.value) < 30) push('fps', 'warn', `Frame rate rendah (${round(live.fps.value, 0)} FPS) — tampilan bisa patah-patah.`);
  if (isOk(live.lag) && Number(live.lag.value) > 100) push('lag', 'warn', `Main thread melambat (event-loop lag ${round(live.lag.value, 0)} ms).`);
  if (isOk(live.heap) && live.heap.extra && live.heap.extra.ratio > 0.75) push('heap', 'warn', `JS heap terpakai ${round(live.heap.extra.ratio * 100, 0)}% dari batas — tekanan memori.`);
  if (isOk(live.battery) && !live.battery.extra?.charging && Number(live.battery.value) < 20) push('battery', 'critical', `Baterai rendah (${round(live.battery.value, 0)}%) dan tidak dicharge.`);
  if (isOk(live.storage) && Number(live.storage.value) > 85) push('storage', 'warn', `Storage quota ${round(live.storage.value, 1)}% terpakai — hampir penuh.`);
  if (state.agent.userConfigured && state.agent.base && !state.agent.connected) push('agent', 'info', 'Agent OS yang dikonfigurasi tidak terjangkau (metrik browser ditampilkan).');
  if (agent && isOk(agent.cpu) && Number(agent.cpu.value) > 85) push('cpu', 'warn', `Utilisasi CPU OS tinggi (${round(agent.cpu.value, 1)}%).`);
  if (agent && isOk(agent.ram) && Number(agent.ram.value) > 85) push('ram', 'warn', `Penggunaan memori OS tinggi (${round(agent.ram.value, 1)}%).`);
  if (agent && isOk(agent.storage) && Number(agent.storage.value) > 90) push('disk', 'critical', `Volume disk ${round(agent.storage.value, 1)}% penuh.`);

  return out;
}

function applyAlerts(alerts) {
  alerts.forEach((a) => {
    if (!state.prevAlertKeys.has(a.key)) {
      logEventSilent(a.sev === 'critical' ? 'warn' : a.sev, a.msg);
      if (a.sev === 'critical') { beep(520, 0.18); notify('Peringatan Kesehatan Device', a.msg); }
      else if (a.sev === 'warn') beep(720, 0.08);
    }
  });
  state.prevAlertKeys = new Set(alerts.map((a) => a.key));
}

// logEvent triggers a refresh; during alert evaluation we only push to the buffer.
function logEventSilent(sev, msg) {
  state.log.unshift({ t: Date.now(), sev, msg });
  if (state.log.length > 40) state.log.length = 40;
}

function buildRecommendations(live, agent) {
  const rec = [];
  if (state.monitor.visible && isOk(live.fps) && Number(live.fps.value) < 40) rec.push('Frame rate rendah. Tutup tab/aplikasi berat di latar belakang agar gerakan lebih halus.');
  if (isOk(live.lag) && Number(live.lag.value) > 60) rec.push('Event-loop lag tinggi — JavaScript berat sedang memblokir UI thread.');
  if (isOk(live.heap) && live.heap.extra && live.heap.extra.ratio > 0.6) rec.push('Penggunaan JS heap tinggi. Muat ulang halaman untuk membebaskan memori.');
  if (isOk(live.battery) && !live.battery.extra?.charging && Number(live.battery.value) < 30) rec.push('Baterai sedang terkuras. Colokkan perangkat agar tetap menyala.');
  if (isOk(live.storage) && Number(live.storage.value) > 80) rec.push('Storage quota hampir penuh. Bersihkan data situs atau kosongkan ruang.');
  if (agent && isOk(agent.cpu) && Number(agent.cpu.value) > 75) rec.push('CPU OS sedang sibuk. Periksa Task Manager untuk proses berat.');
  if (agent && isOk(agent.ram) && Number(agent.ram.value) > 80) rec.push('RAM sistem ketat. Tutup aplikasi yang tidak dipakai.');
  if (!navigator.onLine) rec.push('Anda sedang offline. Sambungkan kembali untuk mengukur latency dan data agent.');
  if (!rec.length) rec.push('Semua sinyal terukur sehat. Tidak ada tindakan yang diperlukan.');
  return rec;
}

// --- The tick ---------------------------------------------------------------
export async function tick() {
  state.lastTick = Date.now();

  if (Date.now() - state._lastStorageCheck > 4000) {
    state._lastStorageCheck = Date.now();
    refreshStorage(state.caches.storage);
  }

  if (state.agent.connected) {
    try {
      const snap = await fetchJson('/snapshot');
      state.agentData = agentMetrics(snap);
      state.agent.lastOk = Date.now();
    } catch {
      state.agent.connected = false;
      state.agentData = null;
      state.onAgent();
      logEventSilent('warn', 'Koneksi ke agent OS terputus. Lanjut dengan data browser.');
    }
  }

  const live = liveMetrics(state.monitor, state.caches, latencyMetric(state.latency, state.agent.reachable));
  state.live = live;

  state.health = computeHealth(buildHealthParts(live, state.agentData));
  state.recs = buildRecommendations(live, state.agentData);

  const alerts = buildAlerts(live, state.agentData);
  state.alerts = alerts;
  applyAlerts(alerts);

  pushHistory(live);
  refreshLatency();
  state.refresh();
}

function pushHistory(live) {
  const h = state.history;
  h.labels.push(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  h.fps.push(isOk(live.fps) ? round(live.fps.value, 0) : null);
  h.lag.push(isOk(live.lag) ? round(live.lag.value, 1) : null);
  h.heap.push(isOk(live.heap) && live.heap.extra ? round(live.heap.value / 1048576, 1) : null);
  h.cpu.push(state.agentData && isOk(state.agentData.cpu) ? round(state.agentData.cpu.value, 1) : null);
  h.ram.push(state.agentData && isOk(state.agentData.ram) ? round(state.agentData.ram.value, 1) : null);
  Object.keys(h).forEach((k) => { while (h[k].length > HISTORY_MAX) h[k].shift(); });
}

export function setIntervalMs(ms) {
  state.intervalMs = ms;
  startTimer();
}

function startTimer() {
  if (state._timer) clearInterval(state._timer);
  state._timer = setInterval(() => tick().catch(() => {}), state.intervalMs);
}

export function startMonitoring() {
  state.monitor.start();
  window.addEventListener('online', () => { logEvent('good', 'Perangkat kembali online.'); refreshLatency(); });
  window.addEventListener('offline', () => logEvent('warn', 'Perangkat kehilangan koneksi.'));
  startTimer();
}

// --- Export -----------------------------------------------------------------
export function buildReport() {
  return {
    generatedAt: new Date().toISOString(),
    device: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      profile: state.staticProfile.facts,
      capabilities: capabilityMatrix(),
    },
    health: {
      score: state.health.score,
      coveragePercent: state.health.coverage,
      signals: state.health.parts.map((p) => ({ label: p.label, display: p.display, score: round(p.score, 1), fromAgent: !!p.agent })),
    },
    liveMetrics: state.live || {},
    pageTiming: state.timing,
    agent: { connected: state.agent.connected, device: state.agent.device, base: state.agent.base, userConfigured: state.agent.userConfigured },
    osMetrics: state.agentData ? state.agentData._raw : null,
    history: state.history,
    activeAlerts: state.alerts,
    recommendations: state.recs,
    note: 'Semua nilai adalah pengukuran nyata; nilai yang tidak didukung bernilai null dan ditampilkan sebagai N/A.',
  };
}
