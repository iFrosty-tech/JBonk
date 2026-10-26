import { defineConfig } from 'vite';

// Un unico file IIFE (game.js): gira sia da `vite preview` sia come pagina statica/Artifact,
// senza moduli ES né richieste CORS.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'game.js',
      },
    },
  },
});
