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
        // RSVP focal letter — triplet so opacity utilities (`text-focal/50`) work.
        focal: 'rgb(var(--focal-color) / <alpha-value>)',
        // ── Theme-aware semantic palette ──
        // These map to CSS vars written at runtime by `App.tsx` from the active
        // theme + mode (see src/theme.ts). `espresso`(ink) and `cream`(paper)
        // invert together between modes, so existing usages — body text AND
        // filled buttons — flip correctly with zero per-component changes.
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
        // 'Inter Variable' / 'Fraunces Variable' are the self-hosted @fontsource
        // family names (see main.tsx). Plain names + system fonts stay as
        // fallbacks. Merriweather is no longer bundled (it only ever sat behind
        // Fraunces in the stack); Georgia covers the serif fallback.
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['Fraunces Variable', 'Fraunces', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in-right': 'slideInRight 0.28s cubic-bezier(.2,.8,.25,1)',
        // One-shot confirmation bubble: slide up + fade in, hold, fade back out.
        'toast': 'toastPop 2.4s ease-out forwards',
        // One-shot "I'm here, tap me" nudge for the cover bookmark on load.
        'bookmark-wiggle': 'bookmarkWiggle 1.1s ease-in-out 0.7s 1',
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
        toastPop: {
          '0%': { opacity: '0', transform: 'translateX(-50%) translateY(16px)' },
          '12%': { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
          '85%': { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
          '100%': { opacity: '0', transform: 'translateX(-50%) translateY(8px)' },
        },
        bookmarkWiggle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '25%': { transform: 'translateY(-4px)' },
          '50%': { transform: 'translateY(0)' },
          '75%': { transform: 'translateY(-2px)' },
        },
      }
    },
  },
  plugins: [],
}

