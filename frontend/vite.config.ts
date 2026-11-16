import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tailwind runs through PostCSS (postcss.config.mjs) as per the official GEL install guide.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
