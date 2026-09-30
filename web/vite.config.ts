import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // MapLibre v6 worker breaks when Vite prebundles the package.
    exclude: ['maplibre-gl'],
  },
})
