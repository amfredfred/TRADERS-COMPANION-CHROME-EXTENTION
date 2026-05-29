/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}', './index.html'],
  corePlugins: {
    // Must stay false — content script shares the page DOM with the trading platform.
    // TC UI runs in shadow DOM so platform styles won't bleed in, but we cannot
    // bleed out and reset the platform's own typographic/form styles.
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        tc: {
          // ── Backgrounds ────────────────────────────────────────
          bg:       '#080b12',  // deepest app background
          panel:    '#0d1117',  // cards, panels
          surface:  '#111827',  // inputs, secondary surfaces
          elevated: '#1a2235',  // hover states, tertiary
          // ── Borders ────────────────────────────────────────────
          border:   '#1e293b',  // default border
          // ── Accent — emerald (fintech-cool) ───────────────────
          green:    '#10b981',  // primary accent
          // ── Status ────────────────────────────────────────────
          amber:    '#f59e0b',  // warning
          red:      '#ef4444',  // danger / lock
          blue:     '#3b82f6',  // info / neutral
          purple:   '#8b5cf6',  // AI features
          // ── Text ──────────────────────────────────────────────
          text:     '#f1f5f9',  // primary (near-white, cool-tinted)
          sub:      '#94a3b8',  // secondary
          muted:    '#64748b',  // muted / metadata
          faint:    '#334155',  // disabled / placeholders
        },
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        'tc-sm':      '0 2px 8px rgba(0,0,0,0.35)',
        'tc-md':      '0 4px 24px rgba(0,0,0,0.5)',
        'tc-lg':      '0 8px 48px rgba(0,0,0,0.6)',
        'tc-overlay': '0 24px 80px rgba(0,0,0,0.7)',
        'tc-side':    '-20px 0 60px rgba(0,0,0,0.45)',
      },
    },
  },
  plugins: [],
}
