import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration: during local dev we also want the /api serverless
// functions to be reachable. The `vercel dev` CLI is the recommended path;
// we expose a simple proxy so the React app can call /api/* against any
// local emulator running on :3000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
