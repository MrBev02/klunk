/**
 * What this browser can do, decided once at startup.
 *
 * Klunk's storage model is "point at a folder and work in place", which needs the
 * File System Access API: Chrome and Edge only. There is no second-class mode for
 * the others, so this decides one thing, whether the app can run at all, and the
 * welcome screen says so plainly when it cannot.
 *
 * A manual open-and-download fallback was considered and dropped, because a folder
 * picked through a file input cannot be written back to. See the browser support
 * section of the README.
 *
 * Deliberately feature-detected rather than sniffed from the user agent: a
 * managed school browser can be an old build of the right browser, and that is
 * exactly the case a UA string gets wrong.
 */

export type StorageMode = 'folder' | 'unsupported'

export interface Capabilities {
  /** Can we open a directory and read and write inside it? */
  directoryPicker: boolean
  storageMode: StorageMode
  /** Set when the page is opened from a file:// URL, i.e. the shared-drive build. */
  offlineFileBuild: boolean
}

export function detectCapabilities(): Capabilities {
  // A separate showSaveFilePicker check and an origin-private-filesystem check
  // used to live here. Both existed only to drive the manual fallback, so they
  // went with it: nothing read them, and leaving them would have implied the
  // fallback was still coming.
  const directoryPicker = typeof window.showDirectoryPicker === 'function'

  return {
    directoryPicker,
    storageMode: directoryPicker ? 'folder' : 'unsupported',
    offlineFileBuild: window.location.protocol === 'file:',
  }
}

/**
 * Whether an insecure context is a possible reason the picker is missing.
 *
 * The File System Access API is gated on a secure context. Opening the
 * single-file build over file:// counts as secure in Chrome, but a copy served
 * from a plain http:// share does not, and the failure looks like "the button
 * does nothing".
 *
 * Feature detection cannot tell that case apart from "this browser has never had
 * the API", because the picker is simply absent either way. So this reports a
 * possibility, not a diagnosis, and the wording it feeds has to stay hedged.
 * Shown on the welcome screen next to the unsupported-browser message rather
 * than as a second panel of its own, since the two can only ever appear together.
 */
export function insecureContextWarning(caps: Capabilities): string | null {
  if (caps.directoryPicker) return null
  if (window.isSecureContext) return null
  return (
    'This page was also loaded over an insecure connection. If you are already in ' +
    'Chrome or Edge, that is the reason. Open Klunk over https, or open the ' +
    'single-file copy from your own drive.'
  )
}
