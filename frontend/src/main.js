// ---------------------------------------------------------------------------
// Shell + hash router + boot.
// Each feature is a route (page). Navigation shows a slim loader and a
// staggered reveal for a premium feel. Boot shows a real-progress splash.
// ---------------------------------------------------------------------------

import './styles.css';
import {
  state, initCore, startMonitoring, tick, setIntervalMs,
  probeAgent, connectAgent, clearAgent, setTheme, toggleSound, toggleNotify,
  buildReport, logEvent,
} from './state.js';
import { PAGES } from './ui/pages.js';
import { applyChartTheme } from './charts/chartManager.js';
import {
  initLoading, setLoadingStep, hideSplash, showPageLoader, hidePageLoader,
} from './ui/loading.js';
import { prefersReducedMotion } from './lib/util.js';

const NAV = [
  ['overview', 'Overview'],
  ['vitals', 'Vitals'],
  ['performance', 'Performance'],
  ['storage', 'Storage & Battery'],
  ['network', 'Network'],
  ['profile', 'Device Profile'],
  ['diagnostics', 'Diagnostics'],
  ['alerts', 'Alerts'],
];

const BRAND_MARK = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2 5 4-12 2 7h6"/></svg>`;

const byId = (id) => document.getElementById(id);
const setText = (id, text) => { const n = byId(id); if (n) n.textContent = text; };

let current = null;
let currentId = null;
let suppressHash = false;

// ===========================================================================
// Shell markup
// ===========================================================================
function createShell() {
  byId('app').innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">${BRAND_MARK}</div>
          <div>
            <h1>Device Health</h1>
            <small>Real-time · no fake data</small>
          </div>
        </div>

        <nav class="nav" aria-label="Sections">
          ${NAV.map(([id, label], i) => `<a href="#/${id}" data-target="${id}" class="${i === 0 ? 'active' : ''}">${label}</a>`).join('')}
        </nav>

        <div class="side-block">
          <span class="tiny-label">Skor Kesehatan</span>
          <div class="side-score">
            <div class="mini-ring" id="side-ring"><span id="side-score">—</span></div>
            <div><strong id="side-word">Mengukur</strong><small id="side-cover">…</small></div>
          </div>
        </div>

        <div class="side-block">
          <span class="tiny-label">Agent OS (opsional)</span>
          <input id="agent-url" class="input" type="text" spellcheck="false" placeholder="http://127.0.0.1:8000" />
          <div class="side-row">
            <button id="agent-connect" class="ghost sm">Sambung</button>
            <button id="agent-clear" class="ghost sm">Browser saja</button>
          </div>
          <span class="agent-state" id="agent-status">—</span>
        </div>

        <div class="side-block side-toggles">
          <button id="theme-toggle" class="ghost sm">🎨 Tema: <b id="theme-label">Gelap</b></button>
          <button id="sound-toggle" class="ghost sm">🔔 Suara: <b id="sound-label">Off</b></button>
          <button id="notify-toggle" class="ghost sm">🔔 Notifikasi: <b id="notify-label">Off</b></button>
        </div>

        <div class="sidebar-footer">
          <span class="tiny-label">Sumber data</span>
          <strong id="side-source">Browser APIs</strong>
        </div>
      </aside>

      <main class="main">
        <header class="topbar">
          <div>
            <p class="eyebrow">Real-time Device Health</p>
            <h2 id="page-title">Overview</h2>
            <p class="subtitle"><span id="page-sub">…</span></p>
            <p class="subtitle tiny"><span id="live-clock">--:--:--</span> · update terakhir <span id="last-update">belum</span></p>
          </div>
          <div class="topbar-actions">
            <label class="select-wrap">Interval
              <select id="interval-select">
                <option value="1000" selected>1s</option>
                <option value="2000">2s</option>
                <option value="5000">5s</option>
              </select>
            </label>
            <button id="refresh-now" class="primary">Segarkan</button>
            <button id="selftest-btn" class="secondary">Self-test</button>
            <button id="export-btn">Ekspor</button>
          </div>
        </header>

        <div id="view" class="view"></div>

        <footer class="foot">
          <p><strong>Jujur:</strong> setiap angka di dasbor ini diukur langsung di browser kamu (atau dibaca dari agent OS opsional). Nilai yang tidak bisa diukur ditampilkan <em>N/A</em> beserta alasannya — tidak pernah angka simulasi. Skor kesehatan adalah rata-rata dari sinyal yang benar-benar ada, dan cakupannya ditampilkan.</p>
        </footer>
      </main>
    </div>
  `;
}

// ===========================================================================
// Router
// ===========================================================================
function resolveHash() {
  const h = location.hash.replace(/^#\/?/, '');
  return PAGES[h] ? h : 'overview';
}

function navigate(id, { force = false, instant = false } = {}) {
  const page = PAGES[id];
  if (!page) id = 'overview';
  if (currentId === id && !force) return;

  if (!instant) showPageLoader();
  if (current && current.unmount) current.unmount();

  const view = byId('view');
  view.classList.remove('enter');
  view.innerHTML = PAGES[id].render(state);

  setText('page-title', PAGES[id].title);
  setText('page-sub', PAGES[id].subtitle);
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.target === id));

  // Staggered reveal for a premium entrance.
  view.querySelectorAll('.reveal').forEach((el, i) => { el.style.animationDelay = `${Math.min(i * 45, 340)}ms`; });
  void view.offsetWidth; // restart animation
  view.classList.add('enter');

  current = PAGES[id];
  currentId = id;
  if (current.mount) current.mount(state);
  refreshActivePage();

  setTimeout(hidePageLoader, instant ? 0 : 240);
  if (location.hash !== `#/${id}`) { suppressHash = true; location.hash = `#/${id}`; }
}

function refreshActivePage() {
  if (!current || !current.update) return;
  try { current.update(state); } catch { /* keep the loop alive */ }
}

// ===========================================================================
// Settings / theme
// ===========================================================================
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  applyChartTheme(theme === 'dark');
  setText('theme-label', theme === 'dark' ? 'Gelap' : 'Terang');
}

function onSettingsChanged() {
  applyTheme(state.theme);
  setText('sound-label', state.sound ? 'On' : 'Off');
  setText('notify-label', state.notify ? 'On' : 'Off');
  refreshActivePage();
}

function syncAgentUI() {
  const a = state.agent;
  setText('agent-status', a.connected ? `Tersambung · ${a.device || ''}` : a.base ? 'Endpoint diatur · tak terjangkau' : 'Browser-only');
  byId('agent-status')?.classList.toggle('ok', a.connected);
  setText('side-source', a.connected ? 'Browser + agent' : 'Browser APIs');
  // Reflect the mini health ring in the sidebar too.
  const h = state.health;
  const ring = byId('side-ring');
  if (ring) { ring.style.setProperty('--score', h.empty ? 0 : h.score); }
  setText('side-score', h.empty ? '—' : String(h.score));
  setText('side-word', h.empty ? 'Mengukur' : (h.score >= 80 ? 'Sehat' : h.score >= 60 ? 'Waspada' : 'Kritis'));
  setText('side-cover', h.empty ? '…' : `${h.coverage}% cakupan`);
  refreshActivePage();
}

// ===========================================================================
// Controls
// ===========================================================================
function wireControls() {
  byId('refresh-now').addEventListener('click', () => tick());
  byId('selftest-btn').addEventListener('click', () => navigate('diagnostics', { force: true }));
  byId('export-btn').addEventListener('click', exportReport);
  byId('interval-select').addEventListener('change', (e) => {
    setIntervalMs(Number(e.target.value) || 1000);
    logEvent('info', `Interval disetel ${(Number(e.target.value) || 1000) / 1000}s.`);
  });
  byId('theme-toggle').addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
  byId('sound-toggle').addEventListener('click', () => toggleSound());
  byId('notify-toggle').addEventListener('click', () => toggleNotify());
  byId('agent-connect').addEventListener('click', () => connectAgent(byId('agent-url').value));
  byId('agent-clear').addEventListener('click', () => { byId('agent-url').value = ''; clearAgent(); });

  document.querySelectorAll('.nav a').forEach((link) => {
    link.addEventListener('click', (e) => { e.preventDefault(); navigate(link.dataset.target); });
  });

  window.addEventListener('hashchange', () => {
    if (suppressHash) { suppressHash = false; return; }
    navigate(resolveHash());
  });
  window.addEventListener('resize', () => refreshActivePage());
}

function exportReport() {
  const blob = new Blob([JSON.stringify(buildReport(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `device-health-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  logEvent('good', 'Laporan kesehatan diekspor sebagai JSON.');
}

function runClock() {
  const update = () => {
    setText('live-clock', new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const lt = byId('last-update');
    if (lt && state.lastTick) {
      const s = Math.max(0, Math.floor((Date.now() - state.lastTick) / 1000));
      lt.textContent = s < 1 ? 'baru saja' : `${s}s lalu`;
    }
  };
  update();
  setInterval(update, 1000);
}

// ===========================================================================
// Boot
// ===========================================================================
async function boot() {
  initLoading();
  setLoadingStep(8, 'Menyiapkan antarmuka…');
  createShell();
  applyTheme(state.theme);
  wireControls();

  // Wire state -> UI.
  state.refresh = refreshActivePage;
  state.onAgent = syncAgentUI;
  state.onSettings = onSettingsChanged;

  setLoadingStep(28, 'Mengumpulkan profil perangkat…');
  initCore();

  setLoadingStep(48, 'Menyiapkan chart…');
  applyChartTheme(state.theme === 'dark');

  setLoadingStep(66, 'Menyiapkan halaman…');
  navigate(resolveHash(), { instant: true });

  setLoadingStep(82, 'Pengukuran pertama…');
  startMonitoring();
  await tick();
  // Let async battery/storage collectors settle, then sample again.
  await new Promise((r) => setTimeout(r, prefersReducedMotion() ? 60 : 450));
  await tick();

  probeAgent(false); // auto-detect a local agent (never required)
  runClock();

  setLoadingStep(100, 'Selesai');
  setTimeout(hideSplash, prefersReducedMotion() ? 0 : 350);
}

boot();
