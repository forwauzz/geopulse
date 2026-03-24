import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

export default {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
      },
      colors: {
        geo: {
          ink: '#0f172a',
          mist: '#64748b',
          accent: '#0ea5e9',
          surface: '#f8fafc',
        },
      },
    },
  },
  plugins: [typography],
} satisfies Config;
