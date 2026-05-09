/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // ------------------------------------------------------------
        // Primary contract — shadcn-style HSL CSS variables. New code
        // SHOULD use these names directly (`bg-primary`, `text-foreground`,
        // `border-border`, etc.). Source of truth lives in src/index.css.
        // ------------------------------------------------------------
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },

        // ------------------------------------------------------------
        // Legacy aliases — map the old QMS palette names onto the new
        // copper + obsidian tokens so 60+ existing pages keep rendering
        // without page-by-page edits. New code should NOT add to this
        // list; use `bg-primary`, `bg-card`, etc. directly.
        // ------------------------------------------------------------

        // Surface family → background / card / secondary
        surface: {
          DEFAULT: 'hsl(var(--background))',
          elevated: 'hsl(var(--card))',
          overlay: 'hsl(var(--secondary))',
          border: 'hsl(var(--border))',
        },

        // MacTech blue family → copper primary
        mactech: {
          blue: 'hsl(var(--primary))',
          'blue-hover': 'hsl(var(--primary) / 0.9)',
          'blue-muted': 'hsl(var(--primary) / 0.15)',
        },

        // Compliance traffic-light → semantic tokens (less candy, AA-safer)
        compliance: {
          green: 'hsl(var(--success))',
          'green-muted': 'hsl(var(--success) / 0.15)',
          amber: 'hsl(var(--warning))',
          red: 'hsl(var(--destructive))',
        },

        // Slate scale extension (carried over so any leftover usage compiles)
        slate: {
          850: '#1E293B',
          900: '#0F172A',
          950: '#020617',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        // Legacy depth-* aliases mapped onto Tailwind defaults so existing
        // utility usage keeps rendering after the token swap.
        'depth-sm': '0 1px 2px 0 rgb(0 0 0 / 0.4)',
        'depth-md':
          '0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.3)',
        'depth-lg':
          '0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.3)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
