/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        focal: 'var(--focal-color)', // RSVP focal letter (red, softens on dark)
        // ── Theme-aware semantic palette ──
        // These map to CSS vars set by [data-mode] (light/dark) in index.css.
        // `espresso`(ink) and `cream`(paper) invert together between modes, so
        // existing usages — body text AND filled buttons — flip correctly with
        // zero per-component changes.
        cream: 'rgb(var(--surface) / <alpha-value>)',     // card / surface
        espresso: 'rgb(var(--text) / <alpha-value>)',     // primary ink
        mocha: 'rgb(var(--text-muted) / <alpha-value>)',  // secondary ink
        warm: {
          beige: 'rgb(var(--bg) / <alpha-value>)',          // page background
          oat: 'rgb(var(--surface-sunken) / <alpha-value>)',// deeper surface
        },
        coral: {
          // Accent — driven by `--coral-accent-rgb` (set by the theme picker).
          accent: 'rgb(var(--coral-accent-rgb) / <alpha-value>)',
          'accent-text': 'rgb(var(--coral-accent-text) / <alpha-value>)',
        },
        // Fixed brand hues (used for specific decorative accents).
        mustard: '#D49A3F',
        sage: '#7E8F6E',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Merriweather', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in-right': 'slideInRight 0.28s cubic-bezier(.2,.8,.25,1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      }
    },
  },
  plugins: [],
}

