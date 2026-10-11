import { defineConfig } from 'vite';

// base: './' makes the built assets use relative paths, so the compiled
// dashboard can be opened from ANY device, host, sub-folder or even file://.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    target: 'es2020',
  },
});
