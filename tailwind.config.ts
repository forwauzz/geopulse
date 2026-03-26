import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

/** Stitch “Editorial Intelligence” tokens — see geo_pulse_ivory/DESIGN.md */
export default {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        headline: ['var(--font-newsreader)', 'Georgia', 'serif'],
        body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        label: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        md: '0.375rem',
        lg: '0.25rem',
        xl: '0.5rem',
        '2xl': '0.75rem',
      },
      colors: {
        background: '#f8f9f9',
        surface: '#f8f9f9',
        'surface-container': '#eaefef',
        'surface-container-low': '#f1f4f4',
        'surface-container-high': '#e3e9ea',
        'surface-container-lowest': '#ffffff',
        'on-background': '#2c3435',
        'on-surface': '#2c3435',
        'on-surface-variant': '#586162',
        primary: '#565e74',
        'primary-dim': '#4a5268',
        'on-primary': '#f7f7ff',
        secondary: '#526075',
        'secondary-container': '#d5e3fd',
        tertiary: '#005bc4',
        'tertiary-dim': '#004fad',
        'on-tertiary': '#f9f8ff',
        'tertiary-container': '#4388fd',
        'outline-variant': '#abb4b5',
        error: '#9f403d',
      },
      boxShadow: {
        float: '0 12px 48px rgba(17, 17, 17, 0.04)',
      },
    },
  },
  plugins: [typography],
} satisfies Config;
