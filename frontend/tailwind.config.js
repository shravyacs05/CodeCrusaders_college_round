/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          50: '#eff5ff',
          100: '#dbe8fe',
          200: '#bfd7fe',
          300: '#93bffd',
          400: '#609ffa',
          500: '#2b66ff',
          600: '#1d4ed8',
          700: '#1e40af',
          800: '#1e3a8a',
          900: '#172554',
          950: '#09122c',
        },
        navy: {
          800: '#0d1a3a',
          850: '#0a1530',
          900: '#070f24',
          950: '#040916',
        }
      },
      boxShadow: {
        'glow': '0 0 35px -5px rgba(43, 102, 255, 0.35)',
        'glow-lg': '0 0 60px -10px rgba(43, 102, 255, 0.45)',
        'card': '0 20px 40px -15px rgba(15, 23, 42, 0.08)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(180deg, #060b1c 0%, #0a1738 50%, #0f245a 100%)',
        'radial-glow': 'radial-gradient(circle at 50% 30%, rgba(43, 102, 255, 0.25) 0%, rgba(6, 11, 28, 0) 70%)',
      }
    },
  },
  plugins: [],
}
