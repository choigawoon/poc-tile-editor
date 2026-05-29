import { defineConfig } from 'vite';

// The editor is a plain multi-asset static app; Vite gives us HMR in dev and a
// minified build in `dist/`. @poc/core resolves via npm workspaces (no alias
// needed) so its source is picked up directly and hot-reloads too.
export default defineConfig({
  root: '.',
  server: { port: 5173, open: false },
  build: { outDir: 'dist', emptyOutDir: true },
});
