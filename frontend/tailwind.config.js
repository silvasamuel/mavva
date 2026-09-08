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
        'streak-pulse': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.12)' },
        },
        'soft-glow': {
          '0%, 100%': { opacity: '0.25' },
          '50%': { opacity: '0.55' },
        },
        'icon-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'icon-slash': {
          '0%, 100%': { transform: 'rotate(0deg) translate(0, 0)' },
          '30%': { transform: 'rotate(-22deg) translate(-2px, 2px)' },
          '60%': { transform: 'rotate(18deg) translate(2px, -1px)' },
        },
        'icon-shine': {
          '0%, 100%': { filter: 'brightness(1) drop-shadow(0 0 0 transparent)', transform: 'scale(1)' },
          '45%': { filter: 'brightness(1.4) drop-shadow(0 0 8px #f3cb57)', transform: 'scale(1.12)' },
        },
        'shine-sweep': {
          '0%': { transform: 'translateX(-120%)', opacity: '0' },
          '25%': { opacity: '0.9' },
          '100%': { transform: 'translateX(180%)', opacity: '0' },
        },
        'icon-bob': {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '40%': { transform: 'translateY(-3px) rotate(-8deg)' },
        },
      },
      animation: {
        'float-up': 'float-up 0.35s ease-out both',
        'streak-pulse': 'streak-pulse 1.6s ease-in-out infinite',
        'soft-glow': 'soft-glow 3s ease-in-out infinite',
        'icon-spin': 'icon-spin 0.7s ease-in-out',
        'icon-slash': 'icon-slash 0.55s ease-in-out',
        'icon-shine': 'icon-shine 0.8s ease-in-out',
        'shine-sweep': 'shine-sweep 0.85s ease-in-out',
        'icon-bob': 'icon-bob 0.6s ease-in-out',
      },
    },
  },
  plugins: [],
}
