import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the build works from any IPFS path (ipfs://<cid>/ or
  // https://gateway/ipfs/<cid>/). Absolute '/assets/...' paths 404 on gateways.
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
  },
});
