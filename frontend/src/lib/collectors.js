// ---------------------------------------------------------------------------
// Real metric collectors.
//
// Everything here reads a genuine browser/OS measurement. There is no random
// number, no simulated value and no silent fallback to 0. If an API does not
// exist on the current device we return STATUS.UNSUPPORTED and the UI shows N/A.
// ---------------------------------------------------------------------------

import { STATUS, metric, round } from './util.js';

// --- Frame rate / responsiveness monitor ------------------------------------
// Measures real frames via requestAnimationFrame and real event-loop lag via
// timer drift. Values only update while the tab is visible.
export class LiveMonitor {
  constructor() {
    this.fps = 0;
    this.frameTime = null; // average ms between frames
    this.lag = 0;          // event-loop lag in ms
    this._frames = 0;
    this._frameTimes = [];
    this._lastTs = performance.now();
    this._running = false;
    this.visible = typeof document === 'undefined' ? true : !document.hidden;
  }

  start() {
    if (this._running) return;
    this._running = true;

    const loop = (ts) => {
      const dt = ts - this._lastTs;
      this._lastTs = ts;
      this._frames += 1;
      if (dt > 0 && dt < 1000) {
        this._frameTimes.push(dt);
        if (this._frameTimes.length > 90) this._frameTimes.shift();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    // Sample FPS once per second.
    setInterval(() => {
      this.fps = this._frames;
      this._frames = 0;
      const arr = this._frameTimes;
      this.frameTime = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    }, 1000);

    // Measure how far a 50ms timer drifts = event-loop lag.
    let expected = performance.now() + 50;
    setInterval(() => {
      const now = performance.now();
      this.lag = Math.max(0, now - expected);
      expected = now + 50;
    }, 50);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.visible = !document.hidden;
        if (this.visible) { this._frames = 0; this._lastTs = performance.now(); }
      });
    }
  }
}

// --- GPU detection ----------------------------------------------------------
export function detectGPU() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return { renderer: null, vendor: null };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    return { renderer: renderer || null, vendor: vendor || null };
  } catch {
    return { renderer: null, vendor: null };
  }
}

// --- Static device profile (measured once) ---------------------------------
export function collectStaticProfile() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const screenInfo = (typeof window !== 'undefined' && window.screen) || {};
  const gpu = detectGPU();

  const metrics = {
    cores: metric({
      key: 'cores', label: 'Logical Cores',
      value: Number.isFinite(nav.hardwareConcurrency) ? nav.hardwareConcurrency : null,
      unit: 'cores',
      status: Number.isFinite(nav.hardwareConcurrency) ? STATUS.OK : STATUS.UNSUPPORTED,
      reason: Number.isFinite(nav.hardwareConcurrency) ? null : 'hardwareConcurrency not exposed',
    }),
    memory: metric({
      key: 'memory', label: 'Device Memory',
      value: Number.isFinite(nav.deviceMemory) ? nav.deviceMemory : null,
      unit: 'GB',
      status: Number.isFinite(nav.deviceMemory) ? STATUS.OK : STATUS.UNSUPPORTED,
      reason: Number.isFinite(nav.deviceMemory) ? null : 'deviceMemory only on Chromium',
    }),
    gpu: metric({
      key: 'gpu', label: 'GPU Renderer',
      value: gpu.renderer,
      unit: '',
      status: gpu.renderer ? STATUS.OK : STATUS.UNSUPPORTED,
      reason: gpu.renderer ? null : 'WebGL not available',
    }),
    screen: metric({
      key: 'screen', label: 'Screen',
      value: screenInfo.width && screenInfo.height ? `${screenInfo.width}×${screenInfo.height} @${round(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)}x` : null,
      unit: 'px',
      status: screenInfo.width ? STATUS.OK : STATUS.UNSUPPORTED,
      reason: screenInfo.width ? null : 'screen API unavailable',
    }),
  };

  // A readable list of genuine facts for the profile panel.
  const facts = [
    { label: 'User Agent', value: nav.userAgent || 'N/A' },
    { label: 'Platform', value: nav.platform || 'N/A' },
    { label: 'Language', value: nav.language || 'N/A' },
    { label: 'Timezone', value: (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'N/A' },
    { label: 'Logical Cores', value: Number.isFinite(nav.hardwareConcurrency) ? nav.hardwareConcurrency : 'N/A' },
    { label: 'Device Memory', value: Number.isFinite(nav.deviceMemory) ? `${nav.deviceMemory} GB (reported)` : 'N/A' },
    { label: 'Max Touch Points', value: Number.isFinite(nav.maxTouchPoints) ? nav.maxTouchPoints : 'N/A' },
    { label: 'Screen', value: screenInfo.width ? `${screenInfo.width}×${screenInfo.height}` : 'N/A' },
    { label: 'Color Depth', value: screenInfo.colorDepth ? `${screenInfo.colorDepth}-bit` : 'N/A' },
    { label: 'Pixel Ratio', value: typeof window !== 'undefined' ? window.devicePixelRatio : 'N/A' },
    { label: 'GPU Vendor', value: gpu.vendor || 'N/A' },
    { label: 'GPU Renderer', value: gpu.renderer || 'N/A' },
    { label: 'Cookies Enabled', value: nav.cookieEnabled === true ? 'Yes' : nav.cookieEnabled === false ? 'No' : 'N/A' },
    { label: 'Do Not Track', value: nav.doNotTrack === '1' ? 'Yes' : 'No' },
  ];

  return { metrics, facts };
}

// --- Page load timing (real Navigation/Paint timing) -----------------------
export function collectTiming() {
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    const paints = performance.getEntriesByType?.('paint') || [];
    const fcp = paints.find((p) => p.name === 'first-contentful-paint');
    const out = {};
    if (nav) {
      out.ttfb = metric({
        key: 'ttfb', label: 'Time to First Byte',
        value: round(nav.responseStart, 0), unit: 'ms', source: 'browser',
      });
      out.load = metric({
        key: 'load', label: 'Page Load',
        value: round(nav.loadEventEnd || nav.domContentLoadedEventEnd, 0), unit: 'ms', source: 'browser',
      });
    } else {
      out.ttfb = metric({ key: 'ttfb', label: 'Time to First Byte', status: STATUS.UNSUPPORTED, reason: 'navigation timing unavailable' });
      out.load = metric({ key: 'load', label: 'Page Load', status: STATUS.UNSUPPORTED, reason: 'navigation timing unavailable' });
    }
    out.fcp = fcp ? metric({ key: 'fcp', label: 'First Contentful Paint', value: round(fcp.startTime, 0), unit: 'ms' })
      : metric({ key: 'fcp', label: 'First Contentful Paint', status: STATUS.UNSUPPORTED, reason: 'paint timing unavailable' });
    return out;
  } catch {
    const u = metric({ key: 'ttfb', label: 'Timing', status: STATUS.ERROR, reason: 'timing read failed' });
    return { ttfb: u, load: u, fcp: u };
  }
}

// --- Battery ---------------------------------------------------------------
export async function initBattery(cache) {
  if (!navigator.getBattery) {
    cache.supported = false;
    return cache;
  }
  try {
    const b = await navigator.getBattery();
    const sync = () => {
      cache.supported = true;
      cache.level = round(b.level * 100, 0);
      cache.charging = b.charging;
      cache.chargingTime = Number.isFinite(b.chargingTime) ? b.chargingTime : null;
      cache.dischargingTime = Number.isFinite(b.dischargingTime) ? b.dischargingTime : null;
    };
    ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'].forEach((e) => b.addEventListener(e, sync));
    sync();
  } catch {
    cache.supported = false;
  }
  return cache;
}

// --- Storage quota ---------------------------------------------------------
export async function initStorage(cache) {
  cache.supported = !!(navigator.storage && navigator.storage.estimate);
  await refreshStorage(cache);
  if (navigator.storage && navigator.storage.addEventListener) {
    navigator.storage.addEventListener('change', () => refreshStorage(cache));
  }
  try {
    cache.persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
  } catch {
    cache.persisted = null;
  }
  return cache;
}

export async function refreshStorage(cache) {
  if (!cache.supported) return cache;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    cache.usage = Number.isFinite(usage) ? usage : null;
    cache.quota = Number.isFinite(quota) ? quota : null;
  } catch {
    cache.usage = null;
    cache.quota = null;
  }
  return cache;
}

// --- Network information ---------------------------------------------------
export function initNetworkInfo(cache) {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) {
    cache.supported = false;
    return cache;
  }
  const sync = () => {
    cache.supported = true;
    cache.effectiveType = conn.effectiveType || null;
    cache.downlink = Number.isFinite(conn.downlink) ? conn.downlink : null;
    cache.rtt = Number.isFinite(conn.rtt) ? conn.rtt : null;
    cache.saveData = typeof conn.saveData === 'boolean' ? conn.saveData : null;
  };
  conn.addEventListener?.('change', sync);
  sync();
  return cache;
}

// --- Live per-tick metrics -------------------------------------------------
export function liveMetrics(monitor, caches, latency) {
  const online = navigator.onLine;
  const m = {
    online: metric({
      key: 'online', label: 'Connectivity',
      value: online ? 'Online' : 'Offline', unit: '',
      status: STATUS.OK, source: 'browser',
    }),
    fps: metric({
      key: 'fps', label: 'Frame Rate',
      value: monitor.visible && monitor.fps > 0 ? monitor.fps : null, unit: 'FPS',
      status: monitor.visible ? (monitor.fps > 0 ? STATUS.OK : STATUS.UNAVAILABLE) : STATUS.UNAVAILABLE,
      reason: monitor.visible ? 'waiting for first frames' : 'tab hidden (frames paused)',
    }),
    frameTime: metric({
      key: 'frameTime', label: 'Frame Time',
      value: monitor.visible ? monitor.frameTime : null, unit: 'ms',
      status: monitor.visible && monitor.frameTime != null ? STATUS.OK : STATUS.UNAVAILABLE,
      reason: monitor.visible ? 'waiting for samples' : 'tab hidden',
    }),
    lag: metric({
      key: 'lag', label: 'Event-Loop Lag',
      value: monitor.lag, unit: 'ms',
      status: monitor.lag != null ? STATUS.OK : STATUS.UNAVAILABLE,
      reason: 'measuring timer drift',
    }),
    heap: readHeap(),
    battery: readBattery(caches.battery),
    storage: readStorage(caches.storage),
    rtt: readNetInfo(caches.netInfo),
    latency: latency,
  };
  return m;
}

function readHeap() {
  const mem = performance.memory;
  if (!mem || !Number.isFinite(mem.usedJSHeapSize)) {
    return metric({ key: 'heap', label: 'JS Heap Used', status: STATUS.UNSUPPORTED, reason: 'performance.memory only on Chromium' });
  }
  const used = mem.usedJSHeapSize;
  const total = Number.isFinite(mem.jsHeapSizeLimit) ? mem.jsHeapSizeLimit : null;
  return metric({
    key: 'heap', label: 'JS Heap Used', value: used, unit: 'bytes',
    status: STATUS.OK, source: 'browser',
    extra: total ? { total, ratio: used / total } : null,
  });
}

function readBattery(c) {
  if (!c.supported || c.level === null) {
    return metric({ key: 'battery', label: 'Battery Level', status: STATUS.UNSUPPORTED, reason: 'Battery API not available (Firefox/Safari)' });
  }
  return metric({
    key: 'battery', label: 'Battery Level', value: c.level, unit: '%',
    status: STATUS.OK, source: 'browser',
    extra: { charging: c.charging, dischargingTime: c.dischargingTime, chargingTime: c.chargingTime },
  });
}

function readStorage(c) {
  if (!c.supported || c.usage === null || c.quota === null || !c.quota) {
    return metric({ key: 'storage', label: 'Storage Used', status: STATUS.UNSUPPORTED, reason: 'StorageManager not available' });
  }
  return metric({
    key: 'storage', label: 'Storage Used', value: (c.usage / c.quota) * 100, unit: '%',
    status: STATUS.OK, source: 'browser',
    extra: { usage: c.usage, quota: c.quota, persisted: c.persisted },
  });
}

function readNetInfo(c) {
  if (!c.supported) {
    return metric({ key: 'rtt', label: 'Browser RTT Estimate', status: STATUS.UNSUPPORTED, reason: 'Network Information API not on this browser' });
  }
  return metric({
    key: 'rtt', label: 'Browser RTT Estimate', value: c.rtt, unit: 'ms',
    status: Number.isFinite(c.rtt) ? STATUS.OK : STATUS.UNAVAILABLE,
    source: 'browser',
    reason: Number.isFinite(c.rtt) ? null : 'rtt not reported',
    extra: { effectiveType: c.effectiveType, downlink: c.downlink, saveData: c.saveData },
  });
}

// --- Optional OS agent ------------------------------------------------------
// Convert the Windows agent's /snapshot payload into metric objects. Values are
// taken verbatim from the agent (real psutil readings), never invented.
export function agentMetrics(snapshot) {
  const m = snapshot?.metrics || {};
  // The agent nests each reading under an arbitrary dict key (e.g. "total_usage")
  // while the real metric name lives inside the object (metric: "cpu_usage").
  // Match by dict key first, then fall back to the inner metric name.
  const find = (k) => {
    const direct = m[k];
    if (direct && typeof direct === 'object' && 'value' in direct) return direct;
    for (const key of Object.keys(m)) {
      const item = m[key];
      if (item && typeof item === 'object' && item.metric === k) return item;
    }
    return null;
  };
  const from = (k, label, unit, map = (v) => v) => {
    const item = find(k);
    if (!item) return metric({ key: k, label, status: STATUS.UNAVAILABLE, source: 'agent', reason: 'not returned by agent' });
    const ok = item.status === 'available' && item.value !== null && item.value !== undefined;
    return metric({
      key: k, label,
      value: ok ? map(item.value) : null, unit,
      status: ok ? STATUS.OK : (item.status === 'unsupported' ? STATUS.UNSUPPORTED : STATUS.UNAVAILABLE),
      source: 'agent', reason: ok ? null : item.error || 'agent reported no value',
    });
  };

  const storage = from('storage_partitions', 'Disk Usage', '%', (parts) => {
    const list = Array.isArray(parts) ? parts : [];
    if (!list.length) return null;
    return Math.max(...list.map((p) => Number(p.percent_used) || 0));
  });

  return {
    cpu: from('cpu_usage', 'CPU Usage', '%', (v) => round(v, 1)),
    cpuPerCore: from('cpu_core_usage', 'Per-Core Usage', '%'),
    cpuCores: from('cpu_logical_cores', 'CPU Logical Cores', 'count'),
    cpuPhysical: from('cpu_physical_cores', 'CPU Physical Cores', 'count'),
    cpuFreq: from('cpu_frequency', 'CPU Frequency', 'MHz'),
    ram: from('memory_usage_percent', 'RAM Usage', '%', (v) => round(v, 1)),
    ramUsed: from('memory_used', 'RAM Used', 'GB'),
    ramTotal: from('memory_total', 'RAM Total', 'GB'),
    ramAvailable: from('memory_available', 'RAM Available', 'GB'),
    storage,
    partitions: from('storage_partitions', 'Partitions', 'list'),
    uptime: from('uptime_seconds', 'System Uptime', 's'),
    os: from('os_version', 'Operating System', 'text'),
    arch: from('system_architecture', 'Architecture', 'text'),
    battery: from('battery_percent', 'Agent Battery', '%'),
    _raw: m,
  };
}

// --- Capability self-test ---------------------------------------------------
// Pure feature detection + honest reporting. Used by the "Self Test" panel.
export function capabilityMatrix() {
  const nav = navigator;
  const hasWebGL = (() => { try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; } })();
  return [
    { name: 'Battery Status API', supported: !!nav.getBattery },
    { name: 'Storage Estimate API', supported: !!(nav.storage && nav.storage.estimate) },
    { name: 'Network Information API', supported: !!nav.connection },
    { name: 'JS Heap Metrics', supported: !!performance.memory },
    { name: 'WebGL (GPU info)', supported: hasWebGL },
    { name: 'Hardware Concurrency', supported: Number.isFinite(nav.hardwareConcurrency) },
    { name: 'Device Memory (reported)', supported: Number.isFinite(nav.deviceMemory) },
    { name: 'Page Visibility API', supported: typeof document !== 'undefined' && 'hidden' in document },
    { name: 'Notification API', supported: 'Notification' in window },
    { name: 'Service Worker', supported: 'serviceWorker' in navigator },
    { name: 'Secure Context (HTTPS)', supported: window.isSecureContext },
    { name: 'Online / Offline Events', supported: 'onLine' in nav },
    { name: 'Touch Support', supported: (nav.maxTouchPoints || 0) > 0 },
  ];
}
