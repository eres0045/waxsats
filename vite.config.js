import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// WaxSats — voice-first Lightning wallet (Bitcoin testnet, NWC)
// Deployed to GitHub Pages at https://eres0045.github.io/waxsats/
export default defineConfig({
  base: '/waxsats/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{js,jsx}'],
    setupFiles: ['./tests/setup.js'],
  },
})
