import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    // three.js (landing hero), recharts (owner) and html5-qrcode (scanner) are
    // each lazy-loaded on the one route that needs them, so big chunks are expected.
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    open: true,
  },
});
