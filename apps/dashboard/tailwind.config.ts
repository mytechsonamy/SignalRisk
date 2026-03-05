import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#1A56DB',
          'primary-hover': '#1E40AF',
          secondary: '#0E9F6E',
          accent: '#9061F9',
        },
        risk: {
          critical: '#E02424',
          'critical-bg': '#FDE8E8',
          high: '#FF5A1F',
          'high-bg': '#FFF4E5',
          medium: '#FACA15',
          'medium-bg': '#FDF6B2',
          low: '#0E9F6E',
          'low-bg': '#DEF7EC',
          neutral: '#6B7280',
          'neutral-bg': '#F3F4F6',
        },
        decision: {
          block: '#E02424',
          review: '#FF5A1F',
          allow: '#0E9F6E',
        },
        surface: {
          background: '#F9FAFB',
          card: '#FFFFFF',
          sidebar: '#111827',
          'sidebar-text': '#D1D5DB',
          'sidebar-active': '#1F2937',
          border: '#E5E7EB',
          hover: '#F3F4F6',
          overlay: 'rgba(17, 24, 39, 0.5)',
          'selected-row': '#EBF5FF',
        },
        text: {
          primary: '#111827',
          secondary: '#6B7280',
          muted: '#9CA3AF',
          inverse: '#FFFFFF',
          link: '#1A56DB',
          'link-hover': '#1E40AF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '3xl': '2rem',
      },
      spacing: {
        sidebar: '240px',
        'sidebar-collapsed': '64px',
        header: '56px',
      },
      borderRadius: {
        sm: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        focus: '0 0 0 3px rgba(26, 86, 219, 0.3)',
      },
      transitionDuration: {
        fast: '150ms',
        normal: '300ms',
        slow: '500ms',
      },
      maxWidth: {
        content: '1440px',
      },
    },
  },
  plugins: [],
};

export default config;
