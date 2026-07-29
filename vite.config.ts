import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * Two build targets from one source.
 *
 *   default  -> dist/         served from https://mrbev02.github.io/klunk/
 *   single   -> dist-single/  one self-contained klunk.html for a shared drive
 *
 * The single-file build exists because some schools block Pages, and because a
 * file on the faculty drive keeps working when the network does not. It must use
 * a relative base: it is opened over file://, where an absolute path resolves
 * against the filesystem root and nothing loads.
 */
export default defineConfig(({ mode }) => {
  const single = mode === 'single'

  return {
    base: single ? './' : '/klunk/',
    plugins: [preact(), ...(single ? [viteSingleFile()] : [])],
    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      target: 'es2022',
      // Chrome and Edge are the supported browsers (File System Access API), so
      // there is no reason to ship transpiled-down output to anyone.
      cssTarget: 'chrome110',
    },
    server: {
      port: 5173,
    },
  }
})
