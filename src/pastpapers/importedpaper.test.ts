/**
 * The paper an import makes (#249), checked by resolving and checking it as the
 * Papers tab would, since a paper that only looks right in its file is the
 * thing this was built to avoid.
 */

import { describe, expect, it } from 'vitest'
import { importedPaper, importedPaperId, importedTitle, type SavedQuestion } from './importedpaper'
import { checkPaper, resolvePaper } from '../papers/paper'
import { emptyManifest } from '../folder/manifest'
import { emptyLedger } from '../folder/ledger'
import type { ContentIndex } from '../folder/storage'
import type { Bank, Paper, Profile, Question } from '../shared/types'
import { cleanPaper } from '../shared/validate'

// The faculty's Year 8 term task: five bands of 15, each numbering from 1, and
// a student sits three. Named "Support Band" where the reply says "Support".
const BANDS = ['Support', 'Standard', 'Advanced', 'Extension', 'Beyond']
const structure: Profile = {
  formatVersion: '1',
  type: 'klunk_profile',
  id: 'y8-term',
  name: 'Year 8 term task',
  paper: {
    totalMarks: 45,
    numbering: 'bySection',
    sectionsSat: 3,
    sections: BANDS.map((b) => ({ id: b.toLowerCase(), name: `${b} Band`, marks: 15 })),
  },
}

const BANK = 'bank/y8.json'

function question(band: string | undefined, n: number, marks: number): Question {
  return {
    id: `${band ?? 'none'}-${n}`.toLowerCase(),
    questionType: 'short_answer',
    questionText: `${band} question ${n}`,
    marks,
    markingGuide: { sampleAnswer: 'An answer.' },
    source: {
      origin: 'extracted',
      paper: 'Year 8 Task 1',
      year: 2025,
      questionNumber: String(n),
      ...(band ? { section: band } : {}),
    },
  }
}

/** Three questions a band, worth 5 each, in paper order. */
function paperOrder(): Question[] {
  return BANDS.flatMap((b) => [1, 2, 3].map((n) => question(b, n, 5)))
}

function indexWith(questions: Question[], papers: Paper[] = []): ContentIndex {
  const bank: Bank = { formatVersion: '1', type: 'klunk_bank', questions }
  return {
    profiles: [{ path: 'profiles/y8-term.json', data: structure }],
    syllabuses: [],
    banks: [{ path: BANK, data: bank }],
    papers: papers.map((data) => ({ path: `papers/${data.id}.json`, data })),
    problems: [],
    scanned: 2,
    pdfs: [],
    docx: [],
    workbooks: [],
    schools: [],
    settings: null,
    manifest: emptyManifest(),
    ledger: emptyLedger(),
    images: new Map(),
  }
}

const saved = (questions: Question[]): SavedQuestion[] =>
  questions.map((question) => ({ question, file: BANK }))

function make(questions: Question[], s: Profile = structure) {
  return importedPaper({
    structure: s,
    examination: 'Year 8 Task 1',
    year: 2025,
    document: 'source/2025 Year 8 Task1.docx',
    saved: saved(questions),
    id: 'y8-task-1',
  })
}

function paperOf(result: ReturnType<typeof importedPaper>): Paper {
  if ('refused' in result) throw new Error(`refused: ${result.refused}`)
  return result.paper
}

describe('the paper an import makes', () => {
  it('puts each band in its section, in printed order, and passes the checker', () => {
    const questions = paperOrder()
    const paper = paperOf(make(questions))
    expect(paper.sections.map((s) => s.profileSectionId)).toEqual(BANDS.map((b) => b.toLowerCase()))
    expect(paper.sections[1]!.refs).toEqual([1, 2, 3].map((n) => `${BANK}#standard-${n}`))

    const resolved = resolvePaper(indexWith(questions), paper, structure)
    expect(resolved.sections.map((s) => s.questions.map((q) => q.number))).toEqual(
      BANDS.map(() => [1, 2, 3]),
    )
    expect(resolved.totalMarks).toBe(45)
    // Two warnings, both about this paper being the one students sat, and
    // nothing about any of its questions having been on it.
    expect(checkPaper(resolved).map((c) => c.message)).toEqual([
      ...BANDS.flatMap(() =>
        [1, 2, 3].map(
          (n) => `Question ${n} is not tagged to the syllabus, so it will not show in coverage`,
        ),
      ),
      'This paper is marked as already sat, so Klunk will warn any other paper that reuses its questions',
    ])
  })

  it('still warns about a question from that exam on any other paper', () => {
    const questions = paperOrder()
    const { source: _, ...built } = paperOf(make(questions))
    const checks = checkPaper(resolvePaper(indexWith(questions), built, structure))
    expect(checks.filter((c) => c.message.includes('students may have seen it'))).toHaveLength(15)
  })

  it('records where it came from, and that it has been sat', () => {
    const paper = paperOf(make(paperOrder()))
    expect(paper.title).toBe('2025 Year 8 Task 1')
    expect(paper.profileId).toBe('y8-term')
    expect(paper.status).toBe('used')
    expect(paper.source).toEqual({
      paper: 'Year 8 Task 1',
      year: 2025,
      document: 'source/2025 Year 8 Task1.docx',
    })
  })

  it('keeps its source through the clean every save in the builder runs', () => {
    const paper = paperOf(make(paperOrder()))
    expect(cleanPaper(paper, structure).source).toEqual(paper.source)
  })

  it('holds what was saved and says what was discarded, rather than renumbering', () => {
    const questions = paperOrder().filter((q) => q.id !== 'advanced-2')
    const resolved = resolvePaper(indexWith(questions), paperOf(make(questions)), structure)
    const checks = checkPaper(resolved)
    const gap = checks.find((c) => c.message.includes('not on this paper'))
    expect(gap).toMatchObject({ severity: 'warning', where: 'Advanced Band' })
    expect(gap!.message).toContain('Question 2 of the 2025 Year 8 Task 1')
    // The band is short, which the marks already say; the gap says why.
    expect(checks.some((c) => c.severity === 'error' && c.where === 'Advanced Band')).toBe(true)
  })

  it('names nothing missing on a paper not read in from one', () => {
    const questions = paperOrder().filter((q) => q.id !== 'advanced-2')
    const { source: _, ...built } = paperOf(make(questions))
    const checks = checkPaper(resolvePaper(indexWith(questions), built, structure))
    expect(checks.some((c) => c.message.includes('not on this paper'))).toBe(false)
  })

  it('puts everything in the one section of a structure with no bands', () => {
    const one: Profile = {
      ...structure,
      paper: { totalMarks: 75, sections: [{ id: 'all', name: 'Section I', marks: 75 }] },
    }
    const paper = paperOf(make([question(undefined, 1, 5), question(undefined, 2, 5)], one))
    expect(paper.sections[0]!.refs).toEqual([`${BANK}#none-1`, `${BANK}#none-2`])
  })
})

describe('no paper rather than one the checker rejects', () => {
  it('refuses a question whose section the structure does not have', () => {
    const result = make([...paperOrder(), question('Bonus', 1, 5)])
    expect(result).toEqual({ refused: expect.stringContaining('no section called "Bonus"') })
  })

  it('refuses questions that name no section when there are several', () => {
    const result = make([question(undefined, 1, 5), question(undefined, 2, 5)])
    expect(result).toEqual({ refused: expect.stringContaining('2 questions name no section') })
  })

  it('takes an exact name over a longer one that starts the same', () => {
    const two: Profile = {
      ...structure,
      paper: {
        totalMarks: 30,
        sections: [
          { id: 'std', name: 'Standard', marks: 15 },
          { id: 'plus', name: 'Standard Plus', marks: 15 },
        ],
      },
    }
    const paper = paperOf(
      make([question('Standard', 1, 15), question('Standard Plus', 1, 15)], two),
    )
    expect(paper.sections.map((s) => s.refs.length)).toEqual([1, 1])
  })

  it('refuses a name that could be either of two sections', () => {
    const two: Profile = {
      ...structure,
      paper: {
        totalMarks: 30,
        sections: [
          { id: 'a', name: 'Standard A', marks: 15 },
          { id: 'b', name: 'Standard B', marks: 15 },
        ],
      },
    }
    expect(make([question('Standard', 1, 15)], two)).toEqual({
      refused: expect.stringContaining('Standard A, Standard B'),
    })
  })

  it('refuses when nothing was saved', () => {
    expect('refused' in make([])).toBe(true)
  })
})

describe('naming it', () => {
  it('puts the year in front, unless the examination already names it', () => {
    expect(importedTitle('Year 8 Task 1', 2025)).toBe('2025 Year 8 Task 1')
    expect(importedTitle('2025 Year 8 Task 1', 2025)).toBe('2025 Year 8 Task 1')
    expect(importedTitle('Year 8 Task 1', undefined)).toBe('Year 8 Task 1')
  })

  it('moves past a paper the folder already holds, so a second import is a second paper', () => {
    expect(importedPaperId('2025 Year 8 Task 1', new Set())).toBe('2025-year-8-task-1')
    expect(importedPaperId('2025 Year 8 Task 1', new Set(['2025-year-8-task-1']))).toBe(
      '2025-year-8-task-1-2',
    )
    expect(
      importedPaperId(
        '2025 Year 8 Task 1',
        new Set(['2025-year-8-task-1', '2025-year-8-task-1-2']),
      ),
    ).toBe('2025-year-8-task-1-3')
  })
})
