import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envPrefix: 'REACT_APP_',
  server: {
    port: 3000,
  },
  build: {
    outDir: 'build',
    sourcemap: true,
    // lightningcss rejects an invalid selector in semantic-ui-css
    cssMinify: 'esbuild',
  },
});
