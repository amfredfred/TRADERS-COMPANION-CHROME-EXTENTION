/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  corePlugins: {
    // Disable global CSS reset — content script shares the DOM with the trading platform.
    // TC overlay uses shadow DOM so platform styles won't bleed in, but we must not
    // bleed out and reset the platform's own styles.
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        tc: {
          bg:      '#0a0c12',
          panel:   '#0f1320',
          surface: '#141928',
          border:  '#1e2538',
          green:   '#22c55e',
          red:     '#ef4444',
          amber:   '#f59e0b',
          blue:    '#3b82f6',
          purple:  '#8b5cf6',
          muted:   '#64748b',
          text:    '#e2e8f0',
          subtext: '#94a3b8',
        },
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        'tc-panel': '0 4px 32px 0 rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
}
