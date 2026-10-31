/**
 * Where the teacher is, as the part of the address after `#`.
 *
 * Everything on screen was component state, so browser Back left Klunk
 * altogether and Reload dropped the teacher on Questions whatever they had
 * open (#159). The app now writes where it is into the hash and reads it back,
 * and this module is the two directions of that, kept apart from the JSX so
 * both can be tested: `routeHash` from a place to an address, `parseRoute` back.
 *
 * A hash rather than a path because Klunk is served from GitHub Pages and as
 * one HTML file on a shared drive: neither can answer a request for
 * `/klunk/papers/trial`, and a `file://` page has no path to change at all.
 *
 * What is recorded is the tab, the open paper on Papers, the full-screen
 * editor if one is open, and help. A paper is named by its id, which is what
 * the folder knows it by. An editor's draft is not recorded: it is not saved
 * anywhere, so after a reload there is nothing to restore, and the app opens
 * the screen the editor was opened from instead.
 */

export type View = 'library' | 'build' | 'draft' | 'paper' | 'syllabus'

/** Each view by the words on its tab, which is how a screen's bar names where it came from. */
export const VIEW_NAMES: Record<View, string> = {
  library: 'Questions',
  build: 'Papers',
  draft: 'Draft with AI',
  paper: 'From a past paper',
  syllabus: 'Syllabus',
}

/** Each view as it appears in the address, in the tab's words rather than the code's. */
const VIEW_SEGMENTS: Record<View, string> = {
  library: 'questions',
  build: 'papers',
  draft: 'draft',
  paper: 'past-paper',
  syllabus: 'syllabus',
}

/** The full-screen editors, which hide the tabs. */
export type Takeover = 'new-question' | 'question' | 'new-structure' | 'structure' | 'cover'

const TAKEOVERS: readonly Takeover[] = [
  'new-question',
  'question',
  'new-structure',
  'structure',
  'cover',
]

export interface Route {
  /** Absent before a folder is open, where help is the only place to be. */
  view?: View
  /** The paper open on Papers. Ignored on every other view. */
  paperId?: string
  takeover?: Takeover
  help: boolean
}

const isTakeover = (segment: string): segment is Takeover =>
  (TAKEOVERS as readonly string[]).includes(segment)

/**
 * The address for a place, `#/papers/trial-hsc-examination/cover`, or the
 * empty string for the welcome screen.
 */
export function routeHash(route: Route): string {
  const parts: string[] = []
  if (route.view) {
    parts.push(VIEW_SEGMENTS[route.view])
    if (route.view === 'build' && route.paperId) parts.push(encodeURIComponent(route.paperId))
    if (route.takeover) parts.push(route.takeover)
  }
  if (route.help) parts.push('help')
  return parts.length > 0 ? `#/${parts.join('/')}` : ''
}

/**
 * Read an address back, or null when it is not one of Klunk's.
 *
 * Null rather than a guess, because help's contents are ordinary `#help-…`
 * anchors and a click on one changes the hash too. Those must leave the screen
 * alone.
 *
 * A paper whose id is itself `help` or an editor's name reads as that word
 * when nothing follows it. Ids are made from titles, so it takes a paper
 * titled "Help" or "Cover" to meet it, and the cost is landing on the Papers
 * list instead of that paper.
 */
export function parseRoute(hash: string): Route | null {
  if (hash === '' || hash === '#' || hash === '#/') return { help: false }
  if (!hash.startsWith('#/')) return null

  const parts = hash.slice(2).split('/').filter(Boolean)
  const route: Route = { help: false }

  if (parts[parts.length - 1] === 'help') {
    route.help = true
    parts.pop()
  }
  if (parts.length === 0) return route

  const first = parts.shift() as string
  const view = (Object.keys(VIEW_SEGMENTS) as View[]).find((v) => VIEW_SEGMENTS[v] === first)
  if (!view) return null
  route.view = view

  if (view === 'build' && parts.length > 0 && !(parts.length === 1 && isTakeover(parts[0]!))) {
    try {
      route.paperId = decodeURIComponent(parts.shift() as string)
    } catch {
      // A hand-edited address with a stray %. Not a paper anybody has.
      return null
    }
  }

  if (parts.length > 0) {
    const takeover = parts.shift() as string
    if (!isTakeover(takeover)) return null
    route.takeover = takeover
  }

  return parts.length > 0 ? null : route
}
