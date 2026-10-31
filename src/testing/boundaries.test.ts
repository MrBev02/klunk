/**
 * Which folders of src/ may import which (#173).
 *
 * src/ is a folder per area of the app. That only means something if the
 * dependencies between them hold, and nothing about a folder stops a file
 * importing across it, so this reads every import and checks them, the way the
 * CSP is checked rather than promised.
 *
 * The rules are the few that the structure stands on:
 *
 *   - Nothing outside app/ imports app/. It is the top: the shell, the address
 *     and help, built from everything else.
 *   - documents/ imports only documents/. It turns a file into text and
 *     decides nothing, so it can know nothing about papers or syllabuses.
 *   - shared/ imports only shared/. It is what every other folder builds on.
 *   - folder/ imports only folder/ and shared/.
 *   - Nothing but a test imports testing/.
 *
 * Tests are not held to them. A test of the text-layer reader in documents/
 * runs the whole past-paper pipeline on purpose, and that is the point of it.
 *
 * A breach that has to stay for a while is listed by name in KNOWN, with the
 * issue that removes it. A new breach fails, and so does a listed one that has
 * gone, so the list cannot quietly outlive its reasons. It started with three
 * (#173) and is empty since #175 and #182 removed them; keep it that way where
 * the fix is small enough to make instead.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const KNOWN: Record<string, string> = {}

/** Every source file under src/, as a path relative to it with forward slashes. */
function sources(): string[] {
  return (readdirSync('src', { recursive: true }) as string[])
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.d.ts'))
}

/** `../papers/paper` from `shared/fields.tsx` is `papers/paper`. */
function resolve(from: string, spec: string): string {
  const parts = from.split('/').slice(0, -1)
  for (const step of spec.split('/')) {
    if (step === '..') parts.pop()
    else if (step !== '.') parts.push(step)
  }
  return parts.join('/')
}

function breaks(from: string, to: string): boolean {
  const here = from.split('/')[0]
  const there = to.split('/')[0]
  if (there === 'app') return here !== 'app'
  if (there === 'testing') return true
  if (here === 'documents') return there !== 'documents'
  if (here === 'shared') return there !== 'shared'
  if (here === 'folder') return there !== 'folder' && there !== 'shared'
  return false
}

describe('src/ folder boundaries', () => {
  const files = sources()
  const found: string[] = []

  for (const file of files) {
    if (file.includes('.test.') || file.startsWith('testing/')) continue
    const text = readFileSync(`src/${file}`, 'utf8')
    // `from '…'` for imports and re-exports, `import '…'` for one done for its
    // side effect, which carries no `from` at all.
    for (const [, spec] of text.matchAll(/\b(?:from|import)\s+'(\.{1,2}\/[^']+)'/g)) {
      const to = resolve(file, spec!)
      if (breaks(file, to)) found.push(`${file} -> ${to}`)
    }
  }

  it('finds the source files', () => {
    // Without this, a path change that made `sources()` find nothing would
    // check no imports and pass.
    expect(files.length).toBeGreaterThan(50)
  })

  it('has no breach beyond the known ones', () => {
    expect(found.filter((b) => !(b in KNOWN))).toEqual([])
  })

  it('lists no known breach that has gone', () => {
    expect(Object.keys(KNOWN).filter((b) => !found.includes(b))).toEqual([])
  })
})
