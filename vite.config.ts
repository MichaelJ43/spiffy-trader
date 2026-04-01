import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

/**
 * Do not inject secrets (e.g. GEMINI_API_KEY) via `define`. The browser bundle must not
 * contain API keys. Gemini and other server-only code run under Node (`tsx server.ts`) and
 * read `process.env` at runtime from the shell / `.env` — not from Vite.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
