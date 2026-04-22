import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Poppins — matches the Spik reference dashboard.
        sans:    ['Poppins', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Poppins', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        // Professional dashboard scale. Body copy is 14px — readable yet dense.
        '2xs':  ['11px',   { lineHeight: '1.4'  }],
        'xs':   ['12px',   { lineHeight: '1.45' }],
        'sm':   ['13px',   { lineHeight: '1.5'  }],
        'base': ['14px',   { lineHeight: '1.55' }],
        'md':   ['15px',   { lineHeight: '1.5'  }],
        'lg':   ['17px',   { lineHeight: '1.45' }],
        'xl':   ['19px',   { lineHeight: '1.4'  }],
        '2xl':  ['23px',   { lineHeight: '1.3'  }],
        '3xl':  ['28px',   { lineHeight: '1.25' }],
        '4xl':  ['34px',   { lineHeight: '1.2'  }],
      },
      colors: {
        /** CUR Deep Navy — official brand (#0A2A5E).
         *  Scale derived from the official CUR brand guide:
         *   - 400 ≈ Accent Blue   #4A7FC1 (links, subtle highlights)
         *   - 500 ≈ Mid Blue      #2B5FA8 (hover states, secondary sections)
         *   - 600 ≈ Banner Blue   #1A4A8C (banner strips, section bgs)
         *   - 700 ≈ Deep Navy     #0A2A5E (main brand — nav, headings)
         */
        primary: {
          50:  '#F0F4FA',   /* official Light Background */
          100: '#D9E3F1',
          200: '#B5C7E3',
          300: '#8FAAD5',
          400: '#4A7FC1',   /* official Accent Blue */
          500: '#2B5FA8',   /* official Mid Blue */
          600: '#1A4A8C',   /* official Banner Blue */
          700: '#0A2A5E',   /* official Deep Navy — BRAND */
          800: '#061E46',
          900: '#04142F',
          950: '#02091A',
        },
        /** Semantic brand token — light mode uses Banner Blue (#1A4A8C),
         *  dark mode uses Deep Navy (#0A2A5E). Resolved via CSS variables
         *  so every `bg-brand` / `text-brand` swaps automatically. */
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          soft:    'rgb(var(--brand-soft) / <alpha-value>)',
          hover:   'rgb(var(--brand-hover) / <alpha-value>)',
          active:  'rgb(var(--brand-active) / <alpha-value>)',
          ink:     'rgb(var(--brand-ink) / <alpha-value>)',
        },
        /** CUR Gold Accent — official brand (#F5C400).
         *  Used for taglines, key highlights, and CTA treatments. */
        gold: {
          50:  '#FEF9E0',
          100: '#FDEFB3',
          200: '#FBE485',
          300: '#F9D958',
          400: '#F7CE2C',
          500: '#F5C400',   /* brand */
          600: '#D4A800',
          700: '#A38100',
          800: '#725A00',
          900: '#413300',
        },
        /** Pastel accents used by dashboard stat cards. */
        accent: {
          sky:    '#D4E9FF',
          peach:  '#FCE1D0',
          mint:   '#D6F4E1',
          lilac:  '#D6E0F4',
          sun:    '#FFF2C6',
        },
        /** Neutrals — body copy / page chrome.
         *  Dark-mode levels (600+) sit on a cohesive navy-slate ramp so
         *  `dark:bg-ink-800` (cards) and `dark:bg-ink-900` (page) feel
         *  intentionally stacked rather than clashing.
         */
        ink: {
          50:  '#F7F8FB',
          100: '#EEF0F6',
          200: '#DADFEB',
          300: '#B5BDCE',
          400: '#8690A8',
          500: '#5D6782',
          600: '#3E4760',
          700: '#2A3654',   /* border / divider in dark */
          800: '#151C30',   /* card surface in dark */
          900: '#0B1121',   /* page background in dark */
        },
      },
      boxShadow: {
        // Flat, professional — no glows, no heavy drop shadows.
        'soft': '0 1px 2px rgba(10, 42, 94, 0.04)',
        'card': '0 1px 2px rgba(10, 42, 94, 0.04), 0 2px 6px -2px rgba(10, 42, 94, 0.06)',
        'ring': '0 0 0 3px rgba(10, 42, 94, 0.15)',
        'gold': '0 0 0 3px rgba(245, 196, 0, 0.25)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      keyframes: {
        'fade-up':    { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'pulse-soft': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        'shimmer':    { '100%': { backgroundPosition: '-200% 0' } },
      },
      animation: {
        'fade-up':    'fade-up 0.3s ease-out both',
        'pulse-soft': 'pulse-soft 2.5s ease-in-out infinite',
        'shimmer':    'shimmer 1.8s linear infinite',
      },
      backgroundImage: {
        /* Navy primary ramp: adapts by theme — brand → brand-active. */
        'gradient-primary': 'linear-gradient(135deg, rgb(var(--brand)) 0%, rgb(var(--brand-active)) 100%)',
        /* Soft page-hero wash */
        'gradient-soft':    'linear-gradient(135deg, #F0F4FA 0%, #D9E3F1 100%)',
        /* Gold accent gradient — for CTAs */
        'gradient-gold':    'linear-gradient(135deg, #F7CE2C 0%, #F5C400 100%)',
      },
    },
  },
  plugins: [],
}

export default config
