/**
 * What this run did not test, said out loud.
 *
 * The corpus suites read documents that are not in this repository and cannot
 * be, so on a machine without them they skip — and skipping was silent (#65).
 * `npm test` printed the same green whether every reader had been checked
 * against eleven years of real papers or none of them had, and `npm run build`
 * gates the Pages deploy on that green.
 *
 * This file always runs. It has no documents of its own.
 *
 * **The report is written to `process.stderr` and not through `console`**,
 * because vitest captures `console.log` and `console.warn` here and prints
 * neither. Checked rather than assumed.
 *
 * **It reports the good case too.** A warning that only appears when something
 * is wrong teaches nobody what right looks like, and the line that matters most
 * before a push is the one confirming the corpus did run.
 *
 * What it deliberately does not do is fail. A missing document and a mistyped
 * path look identical from here, and a teacher's machine legitimately holds only
 * some of these — Computing Technology was absent from this one for weeks. So
 * the default is loud and permissive, and `npm run test:corpus` is the strict
 * pass that fails instead: that is the one that catches a typo, run when it
 * matters rather than nagging every time.
 */

/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { SUITES, allDocuments, missing } from './corpus'

/** `npm run test:corpus` — `vitest run --mode corpus`. */
const STRICT = import.meta.env.MODE === 'corpus'

interface Absent {
  suite: string
  what: string
  gone: string[]
  unmet?: string | undefined
}

function survey(): Absent[] {
  const out: Absent[] = []
  for (const [suite, spec] of Object.entries(SUITES)) {
    const gone = missing(spec.docs)
    const unmet = spec.needs && !spec.needs.met() ? spec.needs.what : undefined
    if (gone.length > 0 || unmet) out.push({ suite, what: spec.what, gone, unmet })
  }
  return out
}

function report(absent: Absent[]): string {
  const docs = allDocuments()
  const lines: string[] = ['']

  if (absent.length === 0) {
    lines.push(
      `Corpus: all ${Object.keys(SUITES).length} suites ran against ${docs.length} real documents.`,
      '',
    )
    return lines.join('\n')
  }

  const gone = missing(docs).length
  lines.push(
    `Corpus: ${absent.length} of ${Object.keys(SUITES).length} suites did not run in full.`,
    `${gone} of ${docs.length} documents are not on this machine.`,
    '',
  )
  for (const { suite, what, gone: files, unmet } of absent) {
    const why = [
      files.length > 0 ? `${files.length} document${files.length === 1 ? '' : 's'} missing` : '',
      unmet ? `no ${unmet}` : '',
    ]
      .filter(Boolean)
      .join(', ')
    lines.push(`  ${suite.padEnd(18)} ${why}`)
    lines.push(`  ${' '.repeat(18)} ${what}`)
    // Named, because "a document is missing" is not something anyone can act on.
    for (const file of files.slice(0, 3)) lines.push(`  ${' '.repeat(18)}   ${file}`)
    if (files.length > 3) lines.push(`  ${' '.repeat(18)}   … and ${files.length - 3} more`)
  }
  lines.push(
    '',
    'Every reader is still covered by its synthetic suite, which runs everywhere.',
    'What is unverified is the counts against the real documents.',
    'Run `npm run test:corpus` to fail on this rather than skip it.',
    '',
  )
  return lines.join('\n')
}

// At module scope, so it prints whether or not any test below runs.
const absent = survey()
process.stderr.write(report(absent))

describe('the corpus', () => {
  // Skipped rather than absent, so the run says the strict pass exists and did
  // not happen. A test nobody knows about is the fault this file is fixing.
  it.skipIf(!STRICT)('has every document each suite reads', () => {
    expect(
      // Deduplicated: two suites read the IB map and two read the Design and
      // Technology syllabus, and a count that says 38 where the report above
      // says 36 sends whoever reads it looking for two documents that do not
      // exist.
      [...new Set(absent.flatMap((a) => a.gone))],
      'Documents named in src/corpus.ts that are not on this machine. Either the ' +
        'content folder is short of them, or a path in the manifest is wrong — and ' +
        'without this pass those two look exactly alike.',
    ).toEqual([])
  })

  it.skipIf(!STRICT)('can run everything those suites need besides documents', () => {
    expect(absent.filter((a) => a.unmet).map((a) => `${a.suite}: ${a.unmet}`)).toEqual([])
  })

  it('names a real file for every document it lists', () => {
    // Not that they exist — that they are paths into the content folder rather
    // than into this repository, which is what stops a corpus document ever
    // being committed here by way of a wrong path.
    for (const path of allDocuments()) {
      expect(path.startsWith('../klunk-content/'), path).toBe(true)
    }
  })

  it('lists every corpus suite in the repository', async () => {
    // A suite added without a manifest entry would skip silently again, which is
    // the whole of #65 coming back by the same door.
    const files = await import('node:fs').then((fs) =>
      fs.readdirSync('src').filter((f) => f.endsWith('.corpus.test.ts')),
    )
    expect(files.map((f) => f.replace('.test.ts', '')).sort()).toEqual(
      Object.keys(SUITES).sort(),
    )
  })
})
