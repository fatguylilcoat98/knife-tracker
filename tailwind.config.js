/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        classic: {
          bg: '#f5f6f8',
          surface: '#ffffff',
          border: '#d8dde5',
          text: '#1f2937',
          muted: '#6b7280',
          primary: '#1e3a8a',
          primaryHover: '#1e40af',
          accent: '#0f4c81'
        },
        modern: {
          bg: '#0a0c0f',
          surface: '#13161c',
          surface2: '#1c2029',
          border: '#2a2f3a',
          text: '#e5e7eb',
          muted: '#6b7280',
          steel: '#9ca3af',
          silver: '#c0c8d4',
          accent: '#00e5ff',
          danger: '#ff3d5a'
        }
      },
      fontFamily: {
        sharp: ['Rajdhani', 'sans-serif'],
        mono: ['Share Tech Mono', 'monospace'],
        body: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        glow: '0 0 20px rgba(0, 229, 255, 0.25)'
      }
    }
  },
  plugins: []
}
