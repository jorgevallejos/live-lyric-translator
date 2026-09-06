import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig(({ command }) => ({
  root: '.',
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  /**
   * **Two pages, because there are two products.** `index.html` is Tramoya's shell;
   * `player.html` is Pregonero, framed by the shell and loaded directly by the projection
   * window. Both are served from the app's own origin, which is what lets the frame reach the
   * embedder's bridge and share storage with that window — see `electron/appScheme.cjs`.
   */
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        player: resolve(__dirname, 'player.html'),
      },
    },
  },
  server: { port: 5174, strictPort: true, host: '0.0.0.0' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'electron/**/*.test.ts'],
  },
}))
