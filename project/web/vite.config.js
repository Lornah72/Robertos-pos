import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// If you don't want the plugin, you can remove it; React 18 works fine without.
// I’m including it for fast refresh niceness.
export default defineConfig({
  server: { port: 5173 },
  plugins: [react()],
})
