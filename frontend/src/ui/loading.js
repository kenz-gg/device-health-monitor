// ---------------------------------------------------------------------------
// Loading experiences.
//   * Splash: a full-screen intro shown while we really measure the device.
//     Its progress is driven by genuine init steps, not a fake timer.
//   * Page loader: a slim indeterminate bar shown during page transitions.
// ---------------------------------------------------------------------------

import { prefersReducedMotion } from '../lib/util.js';

let splash;
let fill;
let stepLabel;
let progressBar;
let logo;

const BRAND_MARK = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2 5 4-12 2 7h6"/></svg>`;

export function initLoading() {
  if (document.getElementById('splash')) return;

  splash = document.createElement('div');
  splash.className = 'splash';
  splash.setAttribute('role', 'status');
  splash.setAttribute('aria-live', 'polite');
  splash.innerHTML = `
    <div class="splash-grid" aria-hidden="true"></div>
    <div class="splash-inner">
      <div class="splash-ecg" aria-hidden="true">
        <svg viewBox="0 0 600 120" preserveAspectRatio="none">
          <path class="ecg-base" d="M0,60 L120,60 L150,60 L170,20 L190,100 L210,60 L250,60 L270,45 L290,75 L310,60 L600,60"/>
          <path class="ecg-run" d="M0,60 L120,60 L150,60 L170,20 L190,100 L210,60 L250,60 L270,45 L290,75 L310,60 L600,60"/>
        </svg>
      </div>
      <div class="splash-brand">
        <div class="brand-mark">${BRAND_MARK}</div>
        <div class="splash-title">
          <h1>Device Health</h1>
          <small>Real-time · no fake data</small>
        </div>
      </div>
      <div class="splash-bar"><span id="splash-fill"></span></div>
      <p class="splash-step" id="splash-step">Menyiapkan…</p>
    </div>
  `;
  document.body.appendChild(splash);
  fill = splash.querySelector('#splash-fill');
  stepLabel = splash.querySelector('#splash-step');
  logo = splash.querySelector('.brand-mark');

  // Slim top bar used for in-app page transitions.
  progressBar = document.createElement('div');
  progressBar.className = 'top-progress';
  progressBar.innerHTML = '<span></span>';
  document.body.appendChild(progressBar);
}

// Update the splash with a genuine step (0..100).
export function setLoadingStep(pct, text) {
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (stepLabel && text) stepLabel.textContent = text;
  if (logo) logo.classList.toggle('spin', !prefersReducedMotion());
}

export function hideSplash() {
  if (!splash) return;
  splash.classList.add('hide');
  const node = splash;
  splash = null;
  setTimeout(() => node.remove(), prefersReducedMotion() ? 0 : 650);
}

// ---- Page-transition loader ------------------------------------------------
export function showPageLoader() {
  if (progressBar) progressBar.classList.add('active');
}

export function hidePageLoader() {
  if (!progressBar) progressBar.classList.remove('active');
}
