import { describe, expect, it } from 'vitest'
import { emptyManifest, entryFor, groupFor, historyOf, note, prune, readManifest } from './manifest'
import type { Manifest } from './types'

const DAY = '2026-08-08'

function withEntries(...notes: Parameters<typeof note>[1][]): Manifest {
  return notes.reduce((m, n) => note(m, n), emptyManifest())
}

describe('readManifest', () => {
  it('takes a manifest as written', () => {
    const manifest = readManifest({
      formatVersion: '1',
      type: 'klunk_manifest',
      documents: [{ path: 'a.pdf', readAs: 'paper', into: 'bank/q.json', when: DAY }],
    })
    expect(manifest.documents).toEqual([
      { path: 'a.pdf', readAs: 'paper', into: 'bank/q.json', when: DAY },
    ])
  })

  // The file is derived, so anything that does not fit is dropped rather than
  // reported: a manifest cannot be allowed to put a fault on a teacher's screen.
  it.each([
    ['not an object', 42],
    ['null', null],
    ['no documents', { formatVersion: '1', type: 'klunk_manifest' }],
    ['documents not an array', { documents: 'a.pdf' }],
  ])('gives an empty manifest for %s', (_what, data) => {
    expect(readManifest(data).documents).toEqual([])
  })

  it('drops entries with no path, and purposes it does not know', () => {
    const manifest = readManifest({
      documents: [
        { readAs: 'paper' },
        { path: '' },
        { path: 'a.pdf', readAs: 'timetable', refusedAs: ['syllabus', 'nonsense'] },
      ],
    })
    expect(manifest.documents).toEqual([{ path: 'a.pdf', refusedAs: ['syllabus'] }])
  })
})

describe('note', () => {
  it('records what a document was read as, and where its content went', () => {
    const manifest = withEntries({
      path: 'papers/2019.pdf',
      read: 'paper',
      into: 'bank/dt.json',
      when: DAY,
    })
    expect(entryFor(manifest, 'papers/2019.pdf')).toEqual({
      path: 'papers/2019.pdf',
      readAs: 'paper',
      into: 'bank/dt.json',
      when: DAY,
    })
  })

  it('accumulates refusals from different slots', () => {
    const manifest = withEntries(
      { path: 'guide.pdf', refused: 'paper', when: DAY },
      { path: 'guide.pdf', refused: 'marking guide', when: DAY },
    )
    expect(entryFor(manifest, 'guide.pdf')?.refusedAs).toEqual(['marking guide', 'paper'])
  })

  // The subject guide reads as a syllabus and is refused as a markscheme, and
  // both of those are true at once.
  it('keeps a successful read when another slot refuses the same document', () => {
    const manifest = withEntries(
      { path: 'guide.pdf', read: 'syllabus', into: 'syllabus/ib.json', when: DAY },
      { path: 'guide.pdf', refused: 'marking guide', when: DAY },
    )
    expect(entryFor(manifest, 'guide.pdf')).toEqual({
      path: 'guide.pdf',
      readAs: 'syllabus',
      into: 'syllabus/ib.json',
      refusedAs: ['marking guide'],
      when: DAY,
    })
  })

  // A file replaced under the same name is the case this protects: the refusal
  // was about the document that used to be there.
  it('clears a refusal when the same slot later reads the document', () => {
    const manifest = withEntries(
      { path: 'syl.docx', refused: 'syllabus', when: '2026-08-01' },
      { path: 'syl.docx', read: 'syllabus', when: DAY },
    )
    expect(entryFor(manifest, 'syl.docx')).toEqual({
      path: 'syl.docx',
      readAs: 'syllabus',
      when: DAY,
    })
  })

  it('remembers where a paper went when it is read again without being saved', () => {
    const manifest = withEntries(
      { path: 'p.pdf', read: 'paper', into: 'bank/one.json', when: '2026-08-01' },
      { path: 'p.pdf', read: 'paper', when: DAY },
    )
    expect(entryFor(manifest, 'p.pdf')?.into).toBe('bank/one.json')
  })

  it('replaces the destination when the content goes somewhere new', () => {
    const manifest = withEntries(
      { path: 'p.pdf', read: 'paper', into: 'bank/one.json', when: '2026-08-01' },
      { path: 'p.pdf', read: 'paper', into: 'bank/two.json', when: DAY },
    )
    expect(entryFor(manifest, 'p.pdf')?.into).toBe('bank/two.json')
  })

  it('keeps one entry per path, in path order', () => {
    const manifest = withEntries(
      { path: 'b.pdf', read: 'paper', when: DAY },
      { path: 'a.pdf', read: 'syllabus', when: DAY },
      { path: 'b.pdf', read: 'marking guide', when: DAY },
    )
    expect(manifest.documents.map((d) => d.path)).toEqual(['a.pdf', 'b.pdf'])
    expect(entryFor(manifest, 'b.pdf')?.readAs).toBe('marking guide')
  })
})

describe('prune', () => {
  it('drops entries for documents that are no longer there', () => {
    const manifest = withEntries(
      { path: 'here.pdf', read: 'paper', when: DAY },
      { path: 'renamed.pdf', read: 'paper', when: DAY },
    )
    expect(prune(manifest, ['here.pdf']).documents.map((d) => d.path)).toEqual(['here.pdf'])
  })

  // An unscanned folder is not an empty one, and this is the only way this file
  // could ever destroy something.
  it('prunes nothing when the folder listing is empty', () => {
    const manifest = withEntries({ path: 'here.pdf', read: 'paper', when: DAY })
    expect(prune(manifest, []).documents).toHaveLength(1)
  })
})

describe('groupFor', () => {
  const manifest = withEntries(
    { path: 'guide.pdf', read: 'syllabus', when: DAY },
    { path: '2019-paper.pdf', read: 'paper', when: DAY },
    { path: '2019-mg.pdf', read: 'marking guide', when: DAY },
    { path: 'biology.pdf', refused: 'syllabus', when: DAY },
  )
  const paths = ['2019-mg.pdf', '2019-paper.pdf', 'biology.pdf', 'guide.pdf', 'unopened.pdf']

  it('puts what the slot wants first and what it does not last', () => {
    expect(groupFor(paths, manifest, 'syllabus')).toEqual({
      matching: ['guide.pdf'],
      unknown: ['unopened.pdf'],
      other: ['2019-mg.pdf', '2019-paper.pdf', 'biology.pdf'],
    })
  })

  it('groups the same documents differently for another slot', () => {
    expect(groupFor(paths, manifest, 'paper')).toEqual({
      matching: ['2019-paper.pdf'],
      // Refused as a syllabus says nothing about whether it is a paper.
      unknown: ['biology.pdf', 'unopened.pdf'],
      other: ['2019-mg.pdf', 'guide.pdf'],
    })
  })

  // #58's fault must not come back through this door: not offering a syllabus
  // at all was worse than offering thirty-six documents.
  it('never drops a document', () => {
    const grouped = groupFor(paths, manifest, 'marking guide')
    expect([...grouped.matching, ...grouped.unknown, ...grouped.other].sort()).toEqual(
      [...paths].sort(),
    )
  })

  it('leaves everything unknown when the manifest is empty', () => {
    expect(groupFor(paths, emptyManifest(), 'syllabus')).toEqual({
      matching: [],
      unknown: paths,
      other: [],
    })
  })
})

describe('historyOf', () => {
  it('names the bank a paper has already been read into', () => {
    const manifest = withEntries({
      path: 'p.pdf',
      read: 'paper',
      into: 'bank/dt.json',
      when: DAY,
    })
    expect(historyOf(manifest, 'p.pdf')).toBe(`Already read into bank/dt.json on ${DAY}.`)
  })

  it('names the model a syllabus document has already been read into', () => {
    const manifest = withEntries({
      path: 's.docx',
      read: 'syllabus',
      into: 'syllabus/dt.json',
      when: DAY,
    })
    expect(historyOf(manifest, 's.docx')).toBe(`Already read into syllabus/dt.json on ${DAY}.`)
  })

  it('leaves the date off when nothing recorded one', () => {
    const manifest = readManifest({ documents: [{ path: 'p.pdf', into: 'bank/dt.json' }] })
    expect(historyOf(manifest, 'p.pdf')).toBe('Already read into bank/dt.json.')
  })

  // Reading a document and getting nowhere is not worth a line: the teacher is
  // about to read it again, which is what the button says.
  it('says nothing about a document whose content went nowhere', () => {
    const manifest = withEntries({ path: 'p.pdf', read: 'paper', when: DAY })
    expect(historyOf(manifest, 'p.pdf')).toBe('')
    expect(historyOf(manifest, 'never-seen.pdf')).toBe('')
  })
})
