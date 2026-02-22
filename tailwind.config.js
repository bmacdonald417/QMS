/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // MacTech Dark Palette
        surface: {
          DEFAULT: '#0A0A0A',
          elevated: '#121212',
          overlay: '#1A1A1A',
          border: '#2A2A2A',
        },
        mactech: {
          blue: '#007AFF',
          'blue-hover': '#0056B3',
          'blue-muted': 'rgba(0, 122, 255, 0.15)',
        },
        compliance: {
          green: '#28CD41',
          'green-muted': 'rgba(40, 205, 65, 0.15)',
          amber: '#FF9F0A',
          red: '#FF3B30',
        },
        slate: {
          850: '#1E293B',
          900: '#0F172A',
          950: '#020617',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'depth-sm': '0 1px 2px rgba(0, 0, 0, 0.4)',
        'depth-md': '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3)',
        'depth-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.3)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
