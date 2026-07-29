/**
 * What this browser can do, decided once at startup.
 *
 * Klunk's storage model is "point at a folder and work in place", which needs the
 * File System Access API. That is Chrome and Edge only. Everywhere else the app
 * still works, but the teacher has to open and download files by hand, so the UI
 * needs to know which of the two experiences it is offering before it draws
 * anything.
 *
 * Deliberately feature-detected rather than sniffed from the user agent: a
 * managed school browser can be an old build of the right browser, and that is
 * exactly the case a UA string gets wrong.
 */

export type StorageMode = 'folder' | 'manual'

export interface Capabilities {
  /** Can we open a directory and read and write inside it? */
  directoryPicker: boolean
  /** Can we write back to a file the user opened, rather than re-downloading it? */
  fileWrite: boolean
  /** Is there somewhere private to cache state between visits? */
  originPrivateFs: boolean
  storageMode: StorageMode
  /** Set when the page is opened from a file:// URL, i.e. the shared-drive build. */
  offlineFileBuild: boolean
}

export function detectCapabilities(): Capabilities {
  const directoryPicker = typeof window.showDirectoryPicker === 'function'
  const fileWrite =
    typeof window.showSaveFilePicker === 'function' &&
    typeof FileSystemFileHandle !== 'undefined' &&
    'createWritable' in FileSystemFileHandle.prototype

  const originPrivateFs =
    typeof navigator.storage?.getDirectory === 'function'

  return {
    directoryPicker,
    fileWrite,
    originPrivateFs,
    storageMode: directoryPicker ? 'folder' : 'manual',
    offlineFileBuild: window.location.protocol === 'file:',
  }
}

/**
 * The File System Access API is gated on a secure context. Opening the
 * single-file build over file:// counts as secure in Chrome, but a copy served
 * from a plain http:// share does not, and the failure looks like "the button
 * does nothing". Worth naming explicitly in the UI.
 */
export function insecureContextWarning(caps: Capabilities): string | null {
  if (caps.directoryPicker) return null
  if (window.isSecureContext) return null
  return (
    'This page was loaded over an insecure connection, so the browser will not ' +
    'allow Klunk to open a folder. Open it over https, or from the ' +
    'single-file build on your drive.'
  )
}
