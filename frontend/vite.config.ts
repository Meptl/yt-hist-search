import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const frontendPort = Number(process.env.FRONTEND_PORT || 5173);
const backendPort = Number(process.env.BACKEND_PORT || 8000);
const backendTarget = `http://127.0.0.1:${backendPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: frontendPort,
    proxy: {
      '/api': backendTarget,
      '/health': backendTarget,
      '/search': backendTarget
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
