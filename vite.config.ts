import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  define: {
    'import.meta.env.GTM_ID': JSON.stringify(loadEnv(mode, process.cwd(), 'GTM_ID').GTM_ID?.trim() ?? ''),
  },
  plugins: [react()],
  server: {
    port: 5173,
  },
}));
