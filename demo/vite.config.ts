import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'demo/',
  base: '/rae-noise/',
  plugins: [glsl()],
  resolve: {
    alias: {
      'rae-noise': resolve(__dirname, '../src/index.ts'),
    }
  },
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  }
});