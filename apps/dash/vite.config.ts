import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Same-domain (2026-09): served at portal.frenchwithjas.ca/analytics/* via
  // a Vercel rewrite, so built <script>/<link> tags must point at
  // /analytics/assets/... not /assets/.... Must match apps/api's basePath.
  base: '/analytics/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
});
