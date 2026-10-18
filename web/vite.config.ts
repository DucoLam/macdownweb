import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2500 },
  optimizeDeps: {
    // MathJax is CommonJS and imported lazily (render/mathjax.ts). Listing it
    // here makes the dev server pre-bundle it at start-up instead of
    // re-optimising (and reloading the page) the first time math appears.
    include: [
      'mathjax-full/js/adaptors/HTMLAdaptor.js',
      'mathjax-full/js/handlers/html/HTMLHandler.js',
      'mathjax-full/js/input/tex.js',
      'mathjax-full/js/input/mathml.js',
      'mathjax-full/js/output/svg.js',
      'mathjax-full/js/input/tex/AllPackages.js',
      'markdown-it-footnote',
      'markdown-it-mark',
      'yaml',
    ],
  },
  test: {
    environment: 'jsdom',
    // Preview styles and Prism/extension CSS are imported with ?raw; let Vitest load their content.
    css: { include: [/src\/render\/(styles|assets)\/.*\.css/] },
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
  },
});
