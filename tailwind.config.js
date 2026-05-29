/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}', './index.html'],
  corePlugins: {
    // Must stay false: content scripts share the page DOM with trading platforms.
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        tc: {
          bg: '#090b10',
          panel: '#0f1218',
          surface: '#151922',
          elevated: '#1c222d',
          border: '#262c35',
          green: '#2bbf89',
          amber: '#d6a35d',
          red: '#d97979',
          blue: '#6aa8ff',
          purple: '#9b8cff',
          text: '#f4f7fb',
          sub: '#a4adba',
          muted: '#737d8c',
          faint: '#4a5260',
        },
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        'tc-sm': 'none',
        'tc-md': 'none',
        'tc-overlay': 'none',
        'tc-side': 'none',
      },
    },
  },
  plugins: [],
}
