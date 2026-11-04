import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envPrefix: 'REACT_APP_',
  server: {
    port: 3000,
  },
  build: {
    outDir: 'build',
    sourcemap: true,
  },
});
