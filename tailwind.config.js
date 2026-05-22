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
        focal: '#ef4444', // Red focal letter
        surface: {
          dark: '#0f0f0f',
          light: '#fafafa',
        },
        // Cozy 90s coffeeshop palette
        warm: {
          beige: '#F3E9D8', // warm oat background
          oat: '#EADBC4',   // deeper warm tone
        },
        cream: '#FBF5EA',     // card / surface cream
        espresso: '#3A2A1E',  // primary text, deep roast
        mocha: '#6B5544',     // secondary text
        coral: {
          accent: '#C2674B',  // terracotta accent
        },
        mustard: '#D49A3F',   // warm highlight
        sage: '#7E8F6E',      // muted green accent
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Merriweather', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}

