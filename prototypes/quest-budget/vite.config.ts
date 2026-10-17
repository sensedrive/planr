import { defineConfig } from 'vite';

// eigener Build nur für den Prototyp; landet nicht im Produktions-Build
export default defineConfig({
  root: __dirname,
  base: './',
  build: {
    target: 'es2022',
    outDir: '/tmp/claude-0/budgetout',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
