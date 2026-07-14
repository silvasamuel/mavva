/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // growth green — manna, life
        leaf: {
          50: '#f1faf1',
          100: '#ddf3de',
          200: '#bce6c0',
          300: '#8dd295',
          400: '#57b663',
          500: '#329a40',
          600: '#237d31',
          700: '#1e6329',
          800: '#1c4f25',
          900: '#184220',
        },
        // amber — XP, streak, celebration
        grain: {
          50: '#fefaec',
          100: '#fbf1ca',
          200: '#f7e191',
          300: '#f3cb57',
          400: '#efb62f',
          500: '#e89617',
          600: '#cd7211',
          700: '#aa5012',
          800: '#8a3e15',
          900: '#723315',
        },
        // warm neutrals — parchment, not gray
        sand: {
          25: '#fdfcf9',
          50: '#faf8f2',
          100: '#f3efe4',
          200: '#e5dfcd',
          300: '#d1c8ad',
          400: '#b3a684',
          500: '#9c8d67',
          600: '#84754f',
          700: '#6b5e41',
          800: '#584d38',
          900: '#4a4131',
        },
        ink: '#2b3229',
      },
      fontFamily: {
        sans: ['"Nunito Variable"', 'ui-rounded', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(43, 50, 41, 0.05), 0 0 0 1px rgba(43, 50, 41, 0.06)',
        'card-hover': '0 4px 12px rgba(43, 50, 41, 0.08), 0 0 0 1px rgba(43, 50, 41, 0.06)',
      },
      keyframes: {
        'float-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'float-up': 'float-up 0.35s ease-out both',
      },
    },
  },
  plugins: [],
}
