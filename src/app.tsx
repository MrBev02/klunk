import { useMemo } from 'preact/hooks'
import { detectCapabilities, insecureContextWarning } from './capabilities'

export function App() {
  const caps = useMemo(detectCapabilities, [])
  const warning = useMemo(() => insecureContextWarning(caps), [caps])

  return (
    <main class="shell">
      <header class="shell__head">
        <h1 class="shell__title">Klunk</h1>
        <p class="shell__tagline">
          Build exam papers from questions you already have.
        </p>
      </header>

      <section class="card">
        <h2>Not ready yet</h2>
        <p>
          Klunk is still being built. Nothing here saves or loads anything, and no
          content of yours is stored.
        </p>
      </section>

      {warning && (
        <section class="card card--warn">
          <h2>Folder access unavailable</h2>
          <p>{warning}</p>
        </section>
      )}

      <section class="card">
        <h2>This browser</h2>
        <dl class="facts">
          <dt>Open a folder and work in place</dt>
          <dd>{caps.directoryPicker ? 'Supported' : 'Not supported'}</dd>

          <dt>Save changes back to a file</dt>
          <dd>{caps.fileWrite ? 'Supported' : 'Not supported'}</dd>

          <dt>How your content will be stored</dt>
          <dd>
            {caps.storageMode === 'folder'
              ? 'A folder you choose, read and written in place'
              : 'Manual open and download, one file at a time'}
          </dd>
        </dl>

        {caps.storageMode === 'manual' && (
          <p class="note">
            Chrome or Edge will give you the smoother version of this, where Klunk
            opens your faculty folder directly instead of asking you to find each
            file.
          </p>
        )}
      </section>

      <footer class="shell__foot">
        <p>
          Runs entirely in your browser. No server, no account, no API key, and no
          network requests after this page loads.
        </p>
      </footer>
    </main>
  )
}
