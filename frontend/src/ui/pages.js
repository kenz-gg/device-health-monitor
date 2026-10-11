// ---------------------------------------------------------------------------
// Page registry. Each feature is its own page: render() builds the markup,
// mount() creates charts/listeners, update() refreshes live values, unmount()
// tears everything down. Only the active page lives in the DOM.
// ---------------------------------------------------------------------------

import { createLineChart } from '../charts/chartManager.js';
import {
  isOk, round, formatBytes, formatDuration, escapeHtml,
  statusLabel, statusReason, scoreTone, scoreWord, tweenNumber, clamp,
} from '../lib/util.js';
import { capabilityMatrix } from '../lib/collectors.js';

const esc = escapeHtml;
const setText = (id, text) => { const n = document.getElementById(id); if (n) n.textContent = text; };

// --- Tile definitions -------------------------------------------------------
const TILES = {
  cpu: { label: 'CPU (OS)', kind: 'pct' },
  ram: { label: 'RAM (OS)', kind: 'pct' },
  fps: { label: 'Frame Rate', kind: 'num', unit: 'FPS' },
  frameTime: { label: 'Frame Time', kind: 'num', unit: 'ms' },
  lag: { label: 'Event-Loop Lag', kind: 'num', unit: 'ms' },
  heap: { label: 'JS Heap Used', kind: 'bytes' },
  battery: { label: 'Baterai', kind: 'pct' },
  storage: { label: 'Storage Terpakai', kind: 'pct' },
  latency: { label: 'Latensi Jaringan', kind: 'num', unit: 'ms' },
  rtt: { label: 'Perkiraan RTT', kind: 'num', unit: 'ms' },
  cores: { label: 'Logical Cores', kind: 'plain', unit: 'cores' },
  memory: { label: 'Device Memory', kind: 'plain', unit: 'GB' },
  gpu: { label: 'GPU', kind: 'text' },
  screen: { label: 'Layar', kind: 'text' },
};

function getMetric(state, key) {
  return (state.staticProfile && state.staticProfile.metrics[key])
    || (state.live && state.live[key])
    || (state.agentData && state.agentData[key])
    || null;
}

function tileFormat(def, m) {
  if (!isOk(m)) return { value: 'N/A', unit: '', sub: statusReason(m) };
  switch (def.kind) {
    case 'num': return { value: round(m.value, def.key === 'latency' ? 1 : (def.key === 'fps' ? 0 : 1)), unit: def.unit, sub: statusReason(m) };
    case 'pct': return { value: round(m.value, def.key === 'storage' ? 1 : 0), unit: '%', sub: statusReason(m) };
    case 'bytes': return { value: formatBytes(m.value), unit: '', sub: statusReason(m) };
    case 'plain': return { value: m.value, unit: def.unit || m.unit, sub: statusReason(m) };
    case 'text': return { value: String(m.value), unit: '', sub: statusReason(m), text: true };
    default: return { value: m.value, unit: '', sub: statusReason(m) };
  }
}

function tilesHtml(keys) {
  return keys.map((k) => {
    const def = TILES[k];
    return `<article class="tile" id="tile-${k}">
      <div class="tile-top"><span class="tile-label">${def.label}</span><span class="pill" data-pill>—</span></div>
      <div class="tile-value" data-value>—</div>
      <div class="tile-sub" data-sub>—</div>
    </article>`;
  }).join('');
}

function renderTiles(state, keys) {
  keys.forEach((k) => {
    const el = document.getElementById(`tile-${k}`);
    if (!el) return;
    const def = { ...TILES[k], key: k };
    const m = getMetric(state, k);
    const { value, unit, sub, text } = tileFormat(def, m);
    const valEl = el.querySelector('[data-value]');
    valEl.textContent = value;
    valEl.classList.toggle('as-text', !!text || String(value).length > 12);
    el.querySelector('.tile-unit')?.remove();
    if (unit) {
      const u = document.createElement('span');
      u.className = 'tile-unit'; u.textContent = unit; valEl.appendChild(u);
    }
    const pill = el.querySelector('[data-pill]');
    pill.textContent = statusLabel(m);
    pill.className = `pill ${isOk(m) ? 'ok' : m.status}`;
    el.querySelector('[data-sub]').textContent = sub;
  });
}

// --- Shared blocks ----------------------------------------------------------
const panel = (title, badge, body, cls = '') => `
  <article class="panel reveal ${cls}">
    <div class="panel-header"><h3>${title}</h3>${badge ? `<span class="tiny-badge">${badge}</span>` : ''}</div>
    ${body}
  </article>`;

const tilesSection = (keys) => `<section class="tiles reveal">${tilesHtml(keys)}</section>`;

function renderScore(state, p) {
  const h = state.health;
  const ring = document.getElementById(`${p}-ring`);
  if (ring) { ring.style.setProperty('--score', h.empty ? 0 : h.score); ring.setAttribute('data-tone', scoreTone(h.score)); }
  const val = document.getElementById(`${p}-value`);
  if (h.empty) { if (val) { val.textContent = '—'; val.dataset.tween = '0'; } }
  else tweenNumber(val, h.score, { duration: 650 });
  setText(`${p}-word`, h.empty ? 'Mengukur…' : scoreWord(h.score));
  setText(`${p}-cover`, h.empty ? 'Mengumpulkan sinyal nyata…' : `Skor dari ${h.parts.length} sinyal nyata · ${h.coverage}% cakupan`);
  const parts = document.getElementById(`${p}-parts`);
  if (parts) {
    parts.innerHTML = h.parts.map((x) => `
      <li><span class="pl ${x.agent ? 'agent' : ''}">${esc(x.label)}</span><b>${esc(x.display)}</b>
        <i class="pb" style="--s:${round(x.score, 0)}%"></i></li>`).join('');
  }
}

function renderStatusStrip(state, p) {
  setText(`${p}-source`, state.agent.connected ? 'Browser + OS agent' : 'Browser only');
  const on = document.getElementById(`${p}-online`);
  if (on) { on.textContent = navigator.onLine ? 'Online' : 'Offline'; on.setAttribute('data-tone', navigator.onLine ? 'good' : 'critical'); }
  setText(`${p}-uptime`, formatDuration(performance.now() / 1000));
  const sc = document.getElementById(`${p}-score`);
  if (sc) sc.textContent = state.health.empty ? '—' : `${state.health.score}/100 · ${scoreWord(state.health.score)}`;
  const ag = document.getElementById(`${p}-agent`);
  if (ag) ag.textContent = state.agent.connected ? (state.agent.device || 'connected') : 'tidak terhubung';
}

// Chart helpers bound to a page's local `charts` map.
function updChart(charts, id, labels, data) {
  const c = charts[id];
  if (!c) return;
  c.data.labels = labels;
  c.data.datasets[0].data = data;
  c.update('none');
}

// --- ECG / frame-rate canvas ------------------------------------------------
function drawVitals(canvas, state) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = Math.max(120, rect.width);
  const h = Math.max(90, rect.height);
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const dark = state.theme === 'dark';
  const data = state.history.fps;
  const stroke = dark ? '#38bdf8' : '#0284c7';
  const grid = dark ? 'rgba(148,163,184,0.10)' : 'rgba(15,23,42,0.08)';

  ctx.strokeStyle = grid; ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i += 1) { const y = (h / 4) * i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  if (data.length < 2) {
    ctx.fillStyle = dark ? 'rgba(155,176,199,0.6)' : 'rgba(71,85,105,0.75)';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText('Menunggu sampel frame nyata…', 12, h / 2);
    return;
  }

  const maxV = 65;
  const step = w / 59;
  const x = (i) => i * step;
  const y = (v) => h - clamp(v / maxV, 0, 1) * (h - 12) - 6;
  const offset = 59 - data.length;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, dark ? 'rgba(56,189,248,0.30)' : 'rgba(2,132,199,0.22)');
  grad.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.beginPath(); ctx.moveTo(x(offset), h);
  data.forEach((v, i) => ctx.lineTo(x(offset + i), y(v)));
  ctx.lineTo(x(offset + data.length - 1), h); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath();
  data.forEach((v, i) => (i ? ctx.lineTo(x(offset + i), y(v)) : ctx.moveTo(x(offset + i), y(v))));
  ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.shadowColor = stroke; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;

  ctx.beginPath(); ctx.arc(x(offset + data.length - 1), y(data[data.length - 1]), 3.2, 0, Math.PI * 2);
  ctx.fillStyle = stroke; ctx.fill();
}

// ===========================================================================
// Pages
// ===========================================================================
export const PAGES = {
  // ---- Overview ----------------------------------------------------------
  overview: {
    title: 'Overview', subtitle: 'Ringkasan kesehatan perangkat secara real-time',
    render: () => `
      <section class="status-strip reveal">
        <div class="status-card"><span class="label">Sumber data</span><strong id="ov-source">—</strong></div>
        <div class="status-card"><span class="label">Koneksi</span><strong id="ov-online">—</strong></div>
        <div class="status-card"><span class="label">Uptime sesi</span><strong id="ov-uptime">0s</strong></div>
        <div class="status-card"><span class="label">Skor kesehatan</span><strong id="ov-score">—</strong></div>
      </section>

      <section class="hero reveal">
        <div class="hero-score">
          <div class="score-ring" id="ov-ring"><span id="ov-value">—</span></div>
          <div class="hero-meta">
            <h3 id="ov-word">Mengukur…</h3>
            <p id="ov-cover">Mengumpulkan sinyal nyata</p>
            <ul id="ov-parts" class="part-list"></ul>
          </div>
        </div>
        ${panel('Sorotan', 'live', `
          <div class="hero-stats">
            <div><small>FPS</small><strong id="ov-fps">—</strong></div>
            <div><small>Lag</small><strong id="ov-lag">—</strong></div>
            <div><small>Latensi</small><strong id="ov-lat">—</strong></div>
            <div><small>Agent OS</small><strong id="ov-agent">—</strong></div>
          </div>
          <div class="panel-header" style="margin-top:.9rem"><h3>Peringatan aktif</h3><span class="tiny-badge" id="ov-alert-n">0</span></div>
          <ul id="ov-alerts" class="list compact"></ul>`)}
      </section>

      ${tilesSection(['cpu', 'ram', 'fps', 'lag', 'battery', 'storage', 'latency', 'rtt'])}
    `,
    update(state) {
      renderStatusStrip(state, 'ov');
      renderScore(state, 'ov');
      setText('ov-fps', isOk(state.live.fps) ? round(state.live.fps.value, 0) : 'N/A');
      setText('ov-lag', isOk(state.live.lag) ? `${round(state.live.lag.value, 0)}ms` : 'N/A');
      setText('ov-lat', isOk(state.live.latency) ? `${round(state.live.latency.value, 1)}ms` : (state.agent.base ? 'unreachable' : 'no endpoint'));
      setText('ov-agent', state.agent.connected ? 'online' : 'off');
      renderTiles(state, ['cpu', 'ram', 'fps', 'lag', 'battery', 'storage', 'latency', 'rtt']);

      const top = state.alerts.slice(0, 3);
      setText('ov-alert-n', String(state.alerts.length));
      const list = document.getElementById('ov-alerts');
      if (list) list.innerHTML = top.length
        ? top.map((a) => `<li class="alert ${a.sev}"><span class="dot"></span>${esc(a.msg)}</li>`).join('')
        : `<li class="alert info"><span class="dot"></span>Tidak ada peringatan aktif.</li>`;
    },
  },

  // ---- Vitals ------------------------------------------------------------
  vitals: {
    title: 'Vitals', subtitle: 'Denyut perangkat: frame rate, responsivitas, memori',
    charts: {},
    render: () => `
      <section class="hero reveal">
        <div class="hero-live">
          <div class="panel-header"><h3>Live Frame Rate</h3><span class="tiny-badge">real · requestAnimationFrame</span></div>
          <div class="vitals-wrap"><canvas id="vitals-canvas"></canvas></div>
          <div class="hero-stats">
            <div><small>FPS</small><strong id="vf-fps">—</strong></div>
            <div><small>Frame time</small><strong id="vf-frame">—</strong></div>
            <div><small>Lag</small><strong id="vf-lag">—</strong></div>
            <div><small>Latensi</small><strong id="vf-net">—</strong></div>
          </div>
        </div>
        ${panel('Riwayat Frame Rate', 'FPS', `<div class="chart-wrap"><canvas id="vf-chart"></canvas></div>`)}
      </section>
      ${tilesSection(['fps', 'frameTime', 'lag', 'heap'])}
    `,
    mount() { this.charts.fps = createLineChart('vf-chart', [], [{ label: 'FPS', data: [], color: '#22c55e', fill: true }]); },
    update(state) {
      setText('vf-fps', isOk(state.live.fps) ? round(state.live.fps.value, 0) : 'N/A');
      setText('vf-frame', isOk(state.live.frameTime) ? `${round(state.live.frameTime.value, 1)}ms` : 'N/A');
      setText('vf-lag', isOk(state.live.lag) ? `${round(state.live.lag.value, 0)}ms` : 'N/A');
      setText('vf-net', isOk(state.live.latency) ? `${round(state.live.latency.value, 1)}ms` : 'N/A');
      renderTiles(state, ['fps', 'frameTime', 'lag', 'heap']);
      updChart(this.charts, 'fps', state.history.labels, state.history.fps);
      drawVitals(document.getElementById('vitals-canvas'), state);
    },
    unmount() { Object.values(this.charts).forEach((c) => c && c.destroy()); this.charts = {}; },
  },

  // ---- Performance -------------------------------------------------------
  performance: {
    title: 'Performance', subtitle: 'Frame rate, responsivitas main thread, dan JS heap',
    charts: {},
    render: () => `
      <section class="grid-2 reveal">
        ${panel('Frame Rate (FPS)', 'live', `<div class="chart-wrap"><canvas id="pr-fps"></canvas></div>`)}
        ${panel('Responsiveness — event-loop lag', 'ms', `<div class="chart-wrap"><canvas id="pr-lag"></canvas></div>`)}
        ${panel('JS Heap (MB)', 'Chromium', `<div class="chart-wrap"><canvas id="pr-heap"></canvas></div>`, 'span2')}
      </section>
      ${tilesSection(['fps', 'frameTime', 'lag', 'heap'])}
    `,
    mount() {
      this.charts.fps = createLineChart('pr-fps', [], [{ label: 'FPS', data: [], color: '#22c55e', fill: true }]);
      this.charts.lag = createLineChart('pr-lag', [], [{ label: 'Lag (ms)', data: [], color: '#f59e0b', fill: true }]);
      this.charts.heap = createLineChart('pr-heap', [], [{ label: 'Heap (MB)', data: [], color: '#a78bfa', fill: true }]);
    },
    update(state) {
      renderTiles(state, ['fps', 'frameTime', 'lag', 'heap']);
      updChart(this.charts, 'fps', state.history.labels, state.history.fps);
      updChart(this.charts, 'lag', state.history.labels, state.history.lag);
      updChart(this.charts, 'heap', state.history.labels, state.history.heap);
    },
    unmount() { Object.values(this.charts).forEach((c) => c && c.destroy()); this.charts = {}; },
  },

  // ---- Storage & Battery -------------------------------------------------
  storage: {
    title: 'Storage & Battery', subtitle: 'Kuota penyimpanan dan daya baterai (terukur langsung)',
    render: () => `
      <section class="grid-2 reveal">
        ${panel('Storage', 'StorageManager', `
          <div class="bar-block">
            <div class="bar" id="st-bar"><span></span></div>
            <div class="bar-legend"><span id="st-used">N/A</span><span id="st-quota"></span></div>
            <p class="panel-hint" id="st-persist"></p>
          </div>`)}
        ${panel('Baterai', 'Battery API', `
          <div class="bar-block">
            <div class="bar" id="bt-bar"><span></span></div>
            <div class="bar-legend"><span id="bt-level">N/A</span><span id="bt-state"></span></div>
            <p class="panel-hint" id="bt-eta"></p>
          </div>`)}
      </section>
      ${tilesSection(['storage', 'battery'])}
    `,
    update(state) {
      const st = state.caches.storage;
      const live = state.live;
      renderTiles(state, ['storage', 'battery']);

      const stBar = document.getElementById('st-bar');
      if (isOk(live.storage)) {
        const pct = Number(live.storage.value);
        stBar?.style.setProperty('--p', `${pct}%`);
        stBar?.setAttribute('data-tone', pct > 85 ? 'critical' : pct > 70 ? 'warn' : 'good');
        setText('st-used', `${round(pct, 1)}% terpakai`);
        setText('st-quota', `${formatBytes(st.usage)} dari ${formatBytes(st.quota)}`);
      } else {
        stBar?.setAttribute('data-tone', 'off'); stBar?.style.setProperty('--p', '0%');
        setText('st-used', 'N/A'); setText('st-quota', 'StorageManager tidak tersedia');
      }
      setText('st-persist', st.persisted === null ? 'Persistent storage: N/A' : `Persistent storage: ${st.persisted ? 'diberikan' : 'belum'}`);

      const bt = state.caches.battery;
      const btBar = document.getElementById('bt-bar');
      if (isOk(live.battery)) {
        const lvl = Number(live.battery.value);
        const charging = bt.charging;
        btBar?.style.setProperty('--p', `${lvl}%`);
        btBar?.setAttribute('data-tone', lvl < 20 && !charging ? 'critical' : lvl < 40 && !charging ? 'warn' : 'good');
        setText('bt-level', `${round(lvl, 0)}%`);
        setText('bt-state', charging ? '⚡ Dicharge' : 'Dicharge (baterai)');
        let eta = 'Estimasi waktu: N/A';
        if (!charging && bt.dischargingTime > 0) eta = `≈ ${formatDuration(bt.dischargingTime)} sampai habis`;
        if (charging && bt.chargingTime > 0) eta = `≈ ${formatDuration(bt.chargingTime)} sampai penuh`;
        setText('bt-eta', eta);
      } else {
        btBar?.setAttribute('data-tone', 'off'); btBar?.style.setProperty('--p', '0%');
        setText('bt-level', 'N/A'); setText('bt-state', 'Battery API tidak tersedia');
        setText('bt-eta', 'Browser ini tidak mengekspos status baterai.');
      }
    },
  },

  // ---- Network -----------------------------------------------------------
  network: {
    title: 'Network', subtitle: 'Konektivitas, tipe koneksi, dan latency terukur',
    render: () => `
      ${panel('Jaringan', 'Network Information + RTT terukur', `
        <div class="net-grid reveal">
          <div><small>Koneksi</small><strong id="nw-type">N/A</strong></div>
          <div><small>Downlink</small><strong id="nw-down">N/A</strong></div>
          <div><small>Browser RTT</small><strong id="nw-rtt">N/A</strong></div>
          <div><small>Save-Data</small><strong id="nw-save">N/A</strong></div>
          <div><small>Latensi terukur</small><strong id="nw-lat">N/A</strong></div>
          <div><small>Online</small><strong id="nw-on">N/A</strong></div>
        </div>`)}
      ${tilesSection(['latency', 'rtt'])}
    `,
    update(state) {
      const net = state.caches.netInfo;
      renderTiles(state, ['latency', 'rtt']);
      setText('nw-type', net.supported && net.effectiveType ? net.effectiveType.toUpperCase() : 'N/A');
      setText('nw-down', net.supported && net.downlink != null ? `${net.downlink} Mbps` : 'N/A');
      setText('nw-rtt', isOk(state.live.rtt) ? `${state.live.rtt.value} ms` : 'N/A');
      setText('nw-save', net.supported && net.saveData != null ? (net.saveData ? 'Aktif' : 'Mati') : 'N/A');
      setText('nw-lat', isOk(state.live.latency) ? `${round(state.live.latency.value, 1)} ms` : (state.agent.base ? 'tidak terjangkau' : 'tanpa endpoint'));
      setText('nw-on', navigator.onLine ? 'Ya' : 'Tidak');
    },
  },

  // ---- Device Profile ----------------------------------------------------
  profile: {
    title: 'Device Profile', subtitle: 'Identitas perangkat: browser + sistem operasi (agent)',
    charts: {},
    render(state) {
      const facts = state.staticProfile.facts.map((f) => `<li><span>${esc(f.label)}</span><strong>${esc(f.value)}</strong></li>`).join('');
      return `
        <section class="grid-2 reveal">
          ${panel('Sistem Operasi', 'dari agent', `<ul id="pf-os" class="detail-list"></ul>`)}
          ${panel('Profil Browser', 'terdeteksi', `<ul class="detail-list">${facts}</ul>`)}
        </section>

        <section class="grid-2 reveal">
          ${panel('Utilisasi CPU', 'real-time', `
            <div class="bar-block">
              <div class="bar" id="pf-cpu-bar"><span></span></div>
              <div class="bar-legend"><span id="pf-cpu-val">N/A</span><span id="pf-cpu-sub"></span></div>
            </div>
            <ul id="pf-cpu-cores" class="core-list"></ul>`)}
          ${panel('Utilisasi RAM', 'real-time', `
            <div class="bar-block">
              <div class="bar" id="pf-ram-bar"><span></span></div>
              <div class="bar-legend"><span id="pf-ram-val">N/A</span><span id="pf-ram-sub"></span></div>
            </div>
            <ul id="pf-ram-detail" class="detail-list compact" style="margin-top:.8rem"></ul>`)}
        </section>

        ${panel('Beban Sistem (OS)', 'CPU % vs RAM %', `<div class="chart-wrap"><canvas id="pf-os-chart"></canvas></div>`)}

        ${tilesSection(['cpu', 'ram', 'cores', 'memory', 'gpu', 'screen'])}
      `;
    },
    mount() {
      this.charts.os = createLineChart('pf-os-chart', [], [
        { label: 'CPU %', data: [], color: '#38bdf8', fill: true },
        { label: 'RAM %', data: [], color: '#f472b6', fill: true },
      ]);
    },
    update(state) {
      renderTiles(state, ['cpu', 'ram', 'cores', 'memory', 'gpu', 'screen']);
      renderOsPanel(state);
      renderOsLoad(state, this.charts);
    },
    unmount() { Object.values(this.charts).forEach((c) => c && c.destroy()); this.charts = {}; },
  },

  // ---- Diagnostics -------------------------------------------------------
  diagnostics: {
    title: 'Diagnostics', subtitle: 'Self-test: kemampuan browser + nilai terukur',
    render: () => `
      ${panel('Kemampuan Browser', '<span id="diag-count">—</span>', `<ul id="cap-matrix" class="cap-list"></ul>`)}
      ${panel('Nilai Terukur', 'self-test', `<ul id="diag-values" class="detail-list compact"></ul>`, 'diag-panel')}
    `,
    mount() { this._caps = capabilityMatrix(); renderCaps(this._caps); },
    update(state) {
      renderMeasured(state);
    },
  },

  // ---- Alerts ------------------------------------------------------------
  alerts: {
    title: 'Alerts', subtitle: 'Peringatan, rekomendasi, dan log aktivitas',
    render: () => `
      <section class="grid-2 reveal">
        ${panel('Peringatan', '<span id="al-count">0</span>', `<ul id="al-list" class="list"></ul>`)}
        ${panel('Rekomendasi', 'dari sinyal nyata', `<ul id="al-recs" class="list compact"></ul>`)}
      </section>
      ${panel('Log Aktivitas', 'live feed', `<ul id="al-log" class="feed-list"></ul>`)}
    `,
    update(state) {
      const count = document.getElementById('al-count');
      if (count) count.textContent = String(state.alerts.length);
      const list = document.getElementById('al-list');
      if (list) list.innerHTML = state.alerts.length
        ? state.alerts.map((a) => `<li class="alert ${a.sev}"><span class="dot"></span><div>${esc(a.msg)}</div></li>`).join('')
        : `<li class="alert info"><span class="dot"></span>Tidak ada peringatan. Semua sinyal dalam batas normal.</li>`;

      const recs = document.getElementById('al-recs');
      if (recs) recs.innerHTML = state.recs.map((r) => `<li>${esc(r)}</li>`).join('');

      const log = document.getElementById('al-log');
      if (log) log.innerHTML = state.log.map((e) => `
        <li class="feed ${e.sev}"><span>${new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span><strong>${esc(e.msg)}</strong></li>`).join('');
    },
  },
};

// --- Diagnostics helpers ---------------------------------------------------
function renderCaps(caps) {
  const supported = caps.filter((c) => c.supported).length;
  setText('diag-count', `${supported}/${caps.length} supported`);
  const el = document.getElementById('cap-matrix');
  if (el) {
    el.innerHTML = caps.map((c) => `
      <li class="${c.supported ? 'yes' : 'no'}"><span class="dot"></span>${esc(c.name)}
        <b>${c.supported ? 'Supported' : 'Not supported'}</b></li>`).join('');
  }
}

function renderMeasured(state) {
  const el = document.getElementById('diag-values');
  if (!el) return;
  const live = state.live || {};
  const t = state.timing || {};
  const rows = [
    ['Frame rate', isOk(live.fps) ? `${live.fps.value} FPS` : 'N/A'],
    ['Frame time', isOk(live.frameTime) ? `${round(live.frameTime.value, 1)} ms` : 'N/A'],
    ['Event-loop lag', isOk(live.lag) ? `${round(live.lag.value, 1)} ms` : 'N/A'],
    ['JS heap', isOk(live.heap) ? `${formatBytes(live.heap.value)}${live.heap.extra ? ` (${round(live.heap.extra.ratio * 100, 1)}% dari batas)` : ''}` : 'N/A'],
    ['Baterai', isOk(live.battery) ? `${live.battery.value}%` : 'N/A'],
    ['Storage terpakai', isOk(live.storage) ? `${round(live.storage.value, 1)}%` : 'N/A'],
    ['Latensi (terukur)', isOk(live.latency) ? `${round(live.latency.value, 1)} ms` : 'N/A'],
    ['Page load', isOk(t.load) ? `${t.load.value} ms` : 'N/A'],
    ['First paint (FCP)', isOk(t.fcp) ? `${t.fcp.value} ms` : 'N/A'],
    ['Time to first byte', isOk(t.ttfb) ? `${t.ttfb.value} ms` : 'N/A'],
    ['OS agent', state.agent.connected ? `tersambung (${state.agent.device})` : 'tidak terhubung'],
  ];
  el.innerHTML = rows.map(([k, v]) => `<li><span>${esc(k)}</span><strong>${esc(v)}</strong></li>`).join('');
}

// --- Device Profile: OS/agent panel + CPU & RAM utilization ----------------
function renderOsPanel(state) {
  const ul = document.getElementById('pf-os');
  if (!ul) return;
  const ad = state.agentData;
  const na = `<span class="muted">N/A</span>`;
  const val = (m, fmt) => {
    if (!m) return na;
    if (!isOk(m)) return `<span class="muted" title="${esc(m.reason || '')}">N/A</span>`;
    return esc(fmt ? fmt(m.value) : m.value);
  };

  if (!state.agent.connected || !ad) {
    ul.innerHTML = `
      <li><span>Status</span><strong>Agent tidak terhubung</strong></li>
      <li><span>Sistem</span>${na}</li>
      <li><span>Arsitektur</span>${na}</li>
      <li><span>CPU / RAM (OS)</span>${na}</li>
      <li><span>Petunjuk</span><strong>Sambungkan agent OS untuk data sistem</strong></li>`;
    return;
  }

  const freq = ad.cpuFreq && isOk(ad.cpuFreq) && ad.cpuFreq.value && Number(ad.cpuFreq.value.current_mhz)
    ? `${round(ad.cpuFreq.value.current_mhz, 0)} MHz` : null;

  const rows = [
    ['Device ID', esc(state.agent.device || 'N/A')],
    ['Sistem Operasi', val(ad.os)],
    ['Arsitektur', val(ad.arch)],
    ['Uptime sistem', val(ad.uptime, (v) => formatDuration(v))],
    ['CPU logik', val(ad.cpuCores)],
    ['CPU fisik', val(ad.cpuPhysical)],
    ['Frekuensi CPU', freq ? esc(freq) : na],
    ['RAM total', val(ad.ramTotal, (v) => `${round(v, 2)} GB`)],
    ['RAM terpakai', val(ad.ramUsed, (v) => `${round(v, 2)} GB`)],
    ['RAM tersedia', val(ad.ramAvailable, (v) => `${round(v, 2)} GB`)],
    ['Baterai (agent)', val(ad.battery, (v) => `${round(v, 0)}%`)],
  ];
  ul.innerHTML = rows.map(([k, v]) => `<li><span>${esc(k)}</span><strong>${v}</strong></li>`).join('');
}

function renderOsLoad(state, charts) {
  const ad = state.agentData;
  const cpuOk = ad && isOk(ad.cpu);
  const ramOk = ad && isOk(ad.ram);
  const hint = state.agent.connected ? 'terukur via psutil' : 'butuh agent OS';

  // CPU bar + per-core
  const cpuBar = document.getElementById('pf-cpu-bar');
  if (cpuOk) {
    const pct = clamp(Number(ad.cpu.value), 0, 100);
    cpuBar?.style.setProperty('--p', `${pct}%`);
    cpuBar?.setAttribute('data-tone', pct > 85 ? 'critical' : pct > 70 ? 'warn' : 'good');
    setText('pf-cpu-val', `${round(ad.cpu.value, 1)}%`);
  } else {
    cpuBar?.style.setProperty('--p', '0%');
    cpuBar?.setAttribute('data-tone', 'off');
    setText('pf-cpu-val', 'N/A');
  }
  setText('pf-cpu-sub', hint);

  const coresEl = document.getElementById('pf-cpu-cores');
  if (coresEl) {
    const perCore = ad && isOk(ad.cpuPerCore) && Array.isArray(ad.cpuPerCore.value) ? ad.cpuPerCore.value : null;
    if (perCore && perCore.length) {
      coresEl.innerHTML = perCore.map((v, i) => `
        <li class="core-row"><span>Core ${i}</span><div class="core-bar"><i style="width:${clamp(v, 0, 100)}%"></i></div><b>${round(v, 0)}%</b></li>`).join('');
    } else {
      coresEl.innerHTML = `<li class="core-row muted-row"><span>Per-core</span><strong class="muted">N/A</strong></li>`;
    }
  }

  // RAM bar + detail
  const ramBar = document.getElementById('pf-ram-bar');
  if (ramOk) {
    const pct = clamp(Number(ad.ram.value), 0, 100);
    ramBar?.style.setProperty('--p', `${pct}%`);
    ramBar?.setAttribute('data-tone', pct > 90 ? 'critical' : pct > 80 ? 'warn' : 'good');
    setText('pf-ram-val', `${round(ad.ram.value, 1)}%`);
  } else {
    ramBar?.style.setProperty('--p', '0%');
    ramBar?.setAttribute('data-tone', 'off');
    setText('pf-ram-val', 'N/A');
  }
  setText('pf-ram-sub', hint);

  const ramDetail = document.getElementById('pf-ram-detail');
  if (ramDetail) {
    if (ramOk && ad.ramUsed && isOk(ad.ramUsed) && ad.ramTotal && isOk(ad.ramTotal)) {
      const used = Number(ad.ramUsed.value);
      const total = Number(ad.ramTotal.value);
      const avail = ad.ramAvailable && isOk(ad.ramAvailable) ? Number(ad.ramAvailable.value) : null;
      ramDetail.innerHTML = `
        <li><span>Terpakai</span><strong>${round(used, 2)} GB</strong></li>
        <li><span>Total</span><strong>${round(total, 2)} GB</strong></li>
        <li><span>Tersedia</span><strong>${avail === null ? 'N/A' : `${round(avail, 2)} GB`}</strong></li>`;
    } else {
      ramDetail.innerHTML = `<li><span>Rincian</span><strong class="muted">N/A</strong></li>`;
    }
  }

  // OS load chart (CPU % vs RAM %)
  const c = charts && charts.os;
  if (c) {
    c.data.labels = state.history.labels;
    c.data.datasets[0].data = state.history.cpu;
    c.data.datasets[1].data = state.history.ram;
    c.update('none');
  }
}
