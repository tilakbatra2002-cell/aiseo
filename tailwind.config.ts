import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0F6DFF',
          50: '#EEF5FF',
          100: '#D9E8FF',
          200: '#B5D2FF',
          300: '#84B4FF',
          400: '#4E93FF',
          500: '#0F6DFF',
          600: '#0057E6',
          700: '#0044B8',
          800: '#00368F',
          900: '#062C6C',
        },
        surface: {
          light: '#FFFFFF',
          'light-2': '#F7F8FA',
          'light-3': '#EFF1F5',
          dark: '#0C0F14',
          'dark-2': '#12161D',
          'dark-3': '#181E28',
        },
      },
      fontFamily: {
        brand: ['var(--font-bricolage)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
