import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { cpSync, existsSync } from 'node:fs'

/**
 * **Puts the vendored Pregonero into the build's output, unchanged.**
 *
 * A copy and nothing else: the page was built in its own repository, at the tag
 * `vendor/pregonero.source.json` names, and `vendorPregonero.test.ts` asserts the bytes on disk are
 * still that tag's. **Nothing here may rewrite them** — a build step that edited a vendored file
 * would make the digest a record of what this repo did to it rather than of what Pregonero shipped.
 */
function copyVendoredPlayer(): Plugin {
  return {
    name: 'copy-vendored-pregonero',
    apply: 'build',
    closeBundle() {
      const from = resolve(__dirname, 'vendor/pregonero')
      if (!existsSync(from)) throw new Error('vendor/pregonero is missing: the player is not vendored')
      cpSync(from, resolve(__dirname, 'dist'), { recursive: true })
    },
  }
}

export default defineConfig(({ command }) => ({
  root: '.',
  base: command === 'build' ? './' : '/',
  plugins: [react(), copyVendoredPlayer()],
  /**
   * **One page, because this repo is one product now.** `index.html` is Tramoya's shell.
   *
   * **Pregonero is vendored, not compiled here.** Its built page comes from its own repository at
   * the tag `vendor/pregonero.source.json` records, and `copyVendoredPlayer` below drops it into
   * `dist/` beside the shell's own output. Both are then served from the app's own origin, which
   * is what lets the framed page reach the embedder's bridge and share storage with the projection
   * window — see `electron/appScheme.cjs`.
   *
   * **The same origin is the whole arrangement.** Chromium partitions storage by top-level site,
   * so a player served from anywhere else would have no `localStorage` in common with the window
   * it paints. Vendoring it into `dist/` is what keeps it same-origin without compiling it.
   */
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: { port: 5174, strictPort: true, host: '0.0.0.0' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'electron/**/*.test.ts'],
  },
}))
