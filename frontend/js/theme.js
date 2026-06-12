/**
 * theme.js — Dark / Light / System theme switcher
 * Cycles through: dark ➜ light ➜ system (auto)
 */
(function () {
  const STORAGE_KEY = 'gtc_theme';
  const CYCLE = ['dark', 'light', 'system'];

  const SVG_MOON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const SVG_SUN  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  const SVG_MON  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/></svg>`;
  const META = {
    dark:   { icon: SVG_MOON, label: 'Dark' },
    light:  { icon: SVG_SUN,  label: 'Light' },
    system: { icon: SVG_MON,  label: 'Auto' },
  };

  /* ── Read stored preference ─────────────────────── */
  function getStored() {
    return localStorage.getItem(STORAGE_KEY) || 'dark';
  }

  /* ── Apply theme to <html> ─────────────────────── */
  function applyTheme(pref) {
    const root = document.documentElement;
    if (pref === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', pref);
    }
  }

  /* ── Update all toggle buttons ─────────────────── */
  function syncButtons(pref) {
    const m = META[pref];
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.innerHTML = `<span>${m.icon}</span><span>${m.label}</span>`;
      btn.title = `Theme: ${m.label} — click to cycle`;
    });
  }

  /* ── Cycle to next preference ──────────────────── */
  function cycle() {
    const current = getStored();
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    syncButtons(next);
  }

  /* ── Listen for system preference changes ──────── */
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStored() === 'system') applyTheme('system');
  });

  /* ── Init: apply before first paint ───────────── */
  const stored = getStored();
  applyTheme(stored);

  /* ── Wire up buttons after DOM is ready ───────── */
  document.addEventListener('DOMContentLoaded', () => {
    syncButtons(stored);
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', cycle);
    });
  });

  /* ── Public API ────────────────────────────────── */
  window.ThemeManager = { cycle, get: getStored, apply: applyTheme };
})();
