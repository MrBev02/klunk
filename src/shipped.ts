/**
 * The paper profiles that ship with Klunk.
 *
 * Bundled at build time rather than fetched. `connect-src 'none'` in index.html
 * forbids the request, and the single-file build has nowhere to fetch from
 * anyway, so a profile that is not compiled in is a profile no teacher can
 * reach. That was the state of things: the Papers tab told teachers to copy a
 * file into `profiles/` by hand, in an app whose whole premise is that they
 * should not have to.
 *
 * Profiles are the one kind of content Klunk is free to ship. A profile records
 * the shape of a public examination — 40 marks, three sections at 10/15/15 —
 * which is fact rather than NESA's expression of its syllabus. Syllabus models
 * are the opposite and are never bundled; a teacher generates their own with
 * `tools/nesa_stage6_syllabus.py`.
 */

import type { Profile } from './types'
import { exists, writeJson } from './storage'

// Validated at runtime rather than trusted: these files sit outside `src`, so
// the typechecker never looks at them, and a profile that lost its sections in
// an edit should be left out rather than offered and then break the builder.
const bundled = import.meta.glob('../profiles/*.json', { eager: true, import: 'default' })

function isProfile(value: unknown): value is Profile {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Profile
  return (
    p.type === 'klunk_profile' &&
    typeof p.id === 'string' &&
    p.id.length > 0 &&
    typeof p.name === 'string' &&
    Array.isArray(p.paper?.sections)
  )
}

export interface ShippedProfile {
  profile: Profile
  /** Where it goes in the teacher's folder, by the same convention the app writes papers by. */
  path: string
}

export const SHIPPED_PROFILES: ShippedProfile[] = Object.values(bundled)
  .filter(isProfile)
  .map((profile) => ({ profile, path: `profiles/${profile.id}.json` }))
  .sort((a, b) => a.profile.name.localeCompare(b.profile.name))

/**
 * Put a shipped profile into the teacher's folder.
 *
 * Refuses rather than overwrites, and says which it did. A teacher who has
 * edited a profile — changed the working time for their school's trial, say —
 * must not lose that to a stray click on a button offering them the original.
 */
export async function installProfile(
  dir: FileSystemDirectoryHandle,
  shipped: ShippedProfile,
): Promise<{ written: boolean; path: string }> {
  if (await exists(dir, shipped.path)) return { written: false, path: shipped.path }
  await writeJson(dir, shipped.path, shipped.profile)
  return { written: true, path: shipped.path }
}
