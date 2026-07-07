import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// WalletContext.jsx / NXDContext.jsx export both a provider component and a hook,
// which React Fast Refresh can't hot-swap ("useWallet export is incompatible").
// Vite's fallback re-runs the module in place, recreating the context object and
// splitting already-rendered components between old and new context — hero stats
// and charts silently dash out until the tab is manually reloaded. Force a full
// page reload for these files instead so open tabs can never zombie.
const fullReloadContexts = {
  name: 'full-reload-context-files',
  handleHotUpdate({ file, server }) {
    if (/(WalletContext|NXDContext)\.jsx$/.test(file)) {
      server.ws.send({ type: 'full-reload' });
      return [];
    }
  },
};

export default defineConfig({
  // Relative base so the build works from any IPFS path (ipfs://<cid>/ or
  // https://gateway/ipfs/<cid>/). Absolute '/assets/...' paths 404 on gateways.
  base: './',
  plugins: [react(), fullReloadContexts],
  build: {
    target: 'es2020',
  },
});
