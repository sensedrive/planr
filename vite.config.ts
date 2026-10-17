import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

// `npm run dev` serves plain HTTP on localhost (WebXR works there, also via `adb reverse`).
// `npm run dev:quest` serves HTTPS on the LAN so the Quest browser can open it directly.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'quest' ? [basicSsl()] : [],
  server: {
    host: mode === 'quest',
    port: 5173,
    // same path the production nginx proxies: current METAR for LaGuardia
    proxy: {
      '/api/metar': {
        target: 'https://aviationweather.gov',
        changeOrigin: true,
        rewrite: () => '/api/data/metar?ids=KLGA&format=json',
      },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: { main: 'index.html', next: 'next.html' } },
  },
}));
