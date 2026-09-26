/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gxeon: {
          bg: '#0B1220',
          surface: '#111C30',
          card: '#152238',
          cardHover: '#1B2C47',
          border: '#1E314F',
          borderHighlight: '#2A4368',
          orange: '#FF7A00',
          orangeGlow: 'rgba(255, 122, 0, 0.25)',
          cyan: '#00D4FF',
          cyanGlow: 'rgba(0, 212, 255, 0.25)',
          muted: '#8B9BB4',
          subtle: '#4A5B75',
          green: '#10B981',
          amber: '#F59E0B',
          red: '#EF4444',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'glow-orange': '0 0 20px -3px rgba(255, 122, 0, 0.35)',
        'glow-cyan': '0 0 20px -3px rgba(0, 212, 255, 0.35)',
        'cyber-card': '0 4px 20px -2px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      }
    },
  },
  plugins: [],
}
