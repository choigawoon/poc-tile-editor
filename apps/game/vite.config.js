import { defineConfig } from 'vite';

// The game is a PixiJS app. In dev it runs with HMR; `vite build` emits a
// minified, tree-shaken bundle in dist/ — the release artifact (Step 5).
// @poc/core resolves via npm workspaces.
export default defineConfig({
  root: '.',
  server: { port: 5175, open: false },
  build: { outDir: 'dist', emptyOutDir: true },
});
