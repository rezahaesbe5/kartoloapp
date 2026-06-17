import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import appEnvPlugin from './vite-plugin-app-env.ts';

export default defineConfig({
  plugins: [
    react(),
    // Inject window.__APP_ENV__ ke index.html.
    // Dev: {} kosong → FE fallback ke import.meta.env (vite HMR, cara dev tidak berubah).
    // Prod build: placeholder dibiarkan → micro-server GANTI dari .env.frontend saat container start.
    appEnvPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@modules': path.resolve(__dirname, './reza/modules'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: {
      // WSL + bind mount /mnt/d: native fs events tidak reliable untuk file
      // yang di-edit dari sisi Windows. Polling ~1s = HMR jalan dengan stabil.
      usePolling: true,
      interval: 1000,
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
