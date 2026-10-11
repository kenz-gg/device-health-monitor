import Chart from 'chart.js/auto';

// Apply a colour theme to all Chart.js instances (called on build + theme swap).
export function applyChartTheme(dark = true) {
  Chart.defaults.color = dark ? '#9bb0c7' : '#516173';
  Chart.defaults.borderColor = dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)';
  Chart.defaults.font.family = "Inter, 'Segoe UI', system-ui, sans-serif";
  Chart.defaults.font.size = 11;
}

const PALETTE = ['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa', '#f472b6'];

export function createLineChart(canvasId, labels, series, options = {}) {
  const el = document.getElementById(canvasId);
  if (!el) return null;

  return new Chart(el, {
    type: 'line',
    data: {
      labels,
      datasets: series.map((set, i) => {
        const color = set.color || PALETTE[i % PALETTE.length];
        return {
          label: set.label,
          data: set.data,
          borderColor: color,
          backgroundColor: set.fill ? hexToRgba(color, 0.14) : 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.35,
          fill: !!set.fill,
          spanGaps: true,
        };
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: series.length > 1, labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
        tooltip: { enabled: true },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 6, maxRotation: 0 }, grid: { display: false } },
        y: { beginAtZero: options.beginAtZero ?? true, ticks: { precision: 0 }, grace: '10%' },
      },
      ...options,
    },
  });
}

function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function destroyChart(chart) {
  if (chart) chart.destroy();
}
