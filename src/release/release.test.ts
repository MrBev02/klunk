import { describe, expect, it } from 'vitest'
import { emptyIndex, type ContentIndex } from '../folder/storage'
import { emptyLedger, readLedger, recordRelease } from '../folder/ledger'
import { optionLetter, shuffledChoices, shuffledMatching } from '../papers/paper'
import type { Paper, Question } from '../shared/types'
import {
  builtPapers,
  embargo,
  importedExams,
  lastSubject,
  planRelease,
  printedFor,
  releaseHash,
  releaseState,
  sectionsLookLikeBands,
  studentCopy,
  yearFromName,
} from './release'

const TODAY = '2026-11-01'

function question(id: string, extra: Partial<Question> = {}): Question {
  return {
    id,
    questionType: 'short_answer',
    questionText: `Question ${id}`,
    marks: 2,
    source: { origin: 'extracted', paper: 'Year 8 Task 1', year: 2025, questionNumber: id },
    ...extra,
  }
}

function folder(questions: Question[], papers: Paper[] = []): ContentIndex {
  const index = emptyIndex()
  index.banks.push({
    path: 'bank/y8.json',
    data: { formatVersion: '1', type: 'klunk_bank', syllabusId: 'maths', questions },
  })
  index.papers.push(...papers.map((data) => ({ path: `papers/${data.id}.json`, data })))
  index.syllabuses.push({
    path: 'syllabus/maths.json',
    data: {
      formatVersion: '1',
      type: 'klunk_syllabus',
      id: 'maths',
      name: 'Mathematics',
      framework: 'nsw',
      courses: [
        {
          id: 's4',
          name: 'Stage 4',
          topics: [{ id: 'T1', name: 'Fractions', group: 'Number and algebra' }],
        },
      ],
    },
  })
  return index
}

function paper(id: string, ids: string[], date?: string): Paper {
  return {
    formatVersion: '1',
    type: 'klunk_paper',
    id,
    title: `Paper ${id}`,
    ...(date !== undefined ? { school: { date } } : {}),
    sections: [{ refs: ids.map((questionId) => ({ file: 'bank/y8.json', questionId })) }],
  }
}

describe('importedExams', () => {
  it('groups questions by the paper and year they were read from, with bands in order', () => {
    const index = folder([
      question('1', { source: { paper: 'Year 8 Task 1', year: 2025, section: 'Support' } }),
      question('2', { source: { paper: 'Year 8 Task 1', year: 2025, section: 'Standard' } }),
      question('3', { source: { paper: 'Year 8 Task 1', year: 2025, section: 'Support' } }),
      question('4', { source: { paper: 'HSC', year: 2024 } }),
      question('5', { source: { origin: 'authored' } }),
    ])
    const exams = importedExams(index)
    expect(exams.map((e) => [e.paper, e.year, e.questions.length])).toEqual([
      ['Year 8 Task 1', 2025, 3],
      ['HSC', 2024, 1],
    ])
    expect(exams[0]!.bands).toEqual(['Support', 'Standard'])
  })
})

describe('embargo', () => {
  const index = folder([question('1'), question('2')])
  const [exam] = importedExams(index)

  it('holds everything back until the date sat is entered', () => {
    expect(embargo(exam!, undefined, index, TODAY).exam).toMatch(/Enter the date/)
  })

  it('holds everything back while the date sat is today or still to come', () => {
    expect(embargo(exam!, TODAY, index, TODAY).exam).toMatch(/1 November 2026/)
    expect(embargo(exam!, '2026-12-03', index, TODAY).exam).toMatch(/not over yet/)
  })

  it('lets an exam sat in the past through', () => {
    const e = embargo(exam!, '2025-06-10', index, TODAY)
    expect(e.exam).toBeUndefined()
    expect(e.questions.size).toBe(0)
  })

  it('holds back a question also on a paper still to be sat, or with no date', () => {
    const withPapers = folder(
      [question('1'), question('2'), question('3')],
      [
        paper('yearly', ['1'], '2026-12-03'),
        paper('undated', ['2']),
        paper('old', ['3'], '2026-03-01'),
      ],
    )
    const [e] = importedExams(withPapers)
    const held = embargo(e!, '2025-06-10', withPapers, TODAY).questions
    expect(held.get('1')).toMatch(/Paper yearly, which is sat on 3 December 2026/)
    expect(held.get('2')).toMatch(/Paper undated, which has no date/)
    expect(held.has('3')).toBe(false)
  })
})

describe('studentCopy', () => {
  const q = question('9', {
    questionType: 'multiple_choice',
    difficulty: 3,
    tags: ['hard'],
    outcomes: ['MA4-1'],
    syllabus: { syllabusId: 'maths', topicIds: ['T1'], pointIds: ['T1.01'] },
    stimulus: [{ kind: 'image', file: 'stimulus/a.png' }],
    markingGuide: { sampleAnswer: 'B', notes: 'Accept b.' },
    source: { paper: 'Year 8 Task 1', year: 2025, questionNumber: '9', copyright: '© NESA' },
    config: { choices: [{ text: 'x' }, { text: 'y' }], correctAnswer: 1, shuffle: false },
  })

  it('leaves behind what is for teachers, and the shuffle', () => {
    const copy = studentCopy(q)
    expect(copy.markingGuide).toEqual({ sampleAnswer: 'B' })
    expect(copy).not.toHaveProperty('difficulty')
    expect(copy).not.toHaveProperty('tags')
    expect(copy).not.toHaveProperty('outcomes')
    expect(copy.config).not.toHaveProperty('shuffle')
    expect(copy.config?.choices?.map((c) => c.text)).toEqual(['x', 'y'])
    expect(copy.syllabus).toEqual({ topicIds: ['T1'] })
    expect(copy.source?.copyright).toBe('© NESA')
  })

  it('points each picture where the release put it, on the parts and the guide too', () => {
    const parts = question('10', {
      config: {
        parts: [
          {
            label: 'a',
            text: 'x',
            marks: 1,
            stimulus: [{ kind: 'image', file: 'stimulus/p.png' }],
            sampleStimulus: [{ kind: 'image', file: 'stimulus/s.png' }],
          },
        ],
      },
    })
    const copy = studentCopy(parts, (p) => `images/${p.split('/').pop()}`)
    expect(copy.config?.parts?.[0]?.stimulus?.[0]?.file).toBe('images/p.png')
    expect(copy.config?.parts?.[0]?.sampleStimulus?.[0]?.file).toBe('images/s.png')
  })
})

describe('releaseHash', () => {
  const q = question('1', { markingGuide: { sampleAnswer: '4', notes: 'one' } })

  it('changes when what students see changes', () => {
    expect(releaseHash({ ...q, questionText: 'Changed' })).not.toBe(releaseHash(q))
  })

  it('does not change for a marker note students never see', () => {
    expect(releaseHash({ ...q, markingGuide: { sampleAnswer: '4', notes: 'two' } })).toBe(
      releaseHash(q),
    )
  })

  it('flags a released question edited since', () => {
    const ledger = recordRelease(emptyLedger(), { key: 'k' }, [
      { id: '1', exam: 'k', approvedBy: 'A', approvedOn: TODAY, hash: releaseHash(q) },
    ])
    expect(releaseState(ledger, 'k', q)).toBe('released')
    expect(releaseState(ledger, 'k', { ...q, marks: 3 })).toBe('changed')
    expect(releaseState(ledger, 'k', question('2'))).toBe('new')
  })
})

describe('planRelease', () => {
  const index = folder([
    question('1', {
      syllabus: { topicIds: ['T1', 'GONE'] },
      stimulus: [{ kind: 'image', file: 'stimulus/q.png' }],
      source: { paper: 'Year 8 Task 1', year: 2025, section: 'Support' },
    }),
    question('2', {
      stimulus: [{ kind: 'image', file: 'stimulus/q.png' }],
      source: { paper: 'Year 8 Task 1', year: 2025, section: 'Standard' },
    }),
    question('3', { source: { paper: 'Year 8 Task 1', year: 2025, section: 'Advanced' } }),
  ])
  const [exam] = importedExams(index)
  const plan = planRelease(
    exam!,
    exam!.questions.slice(0, 2),
    { title: 'Year 8 Task 1', subject: 'Mathematics', yearLevel: 8, releasedOn: TODAY },
    '2025-06-10',
    index,
  )

  it('names the file from the exam, so a re-release replaces it', () => {
    expect(plan.path).toBe('2025/year-8-task-1.json')
    expect(plan.release.id).toBe('year-8-task-1-2025')
    expect(plan.ledger).toMatchObject({ key: exam!.key, dateSat: '2025-06-10', file: plan.path })
  })

  it('copies a picture two questions share once, beside the release', () => {
    expect(plan.images).toEqual([
      { from: 'bank/stimulus/q.png', to: '2025/images/year-8-task-1-q.png' },
    ])
    expect(plan.release.questions.map((q) => q.stimulus?.[0]?.file)).toEqual([
      'images/year-8-task-1-q.png',
      'images/year-8-task-1-q.png',
    ])
  })

  it('names the topics used, from the model, and only the bands released', () => {
    expect(plan.release.topics).toEqual([
      { id: 'T1', name: 'Fractions', area: 'Number and algebra' },
    ])
    expect(plan.release.bands).toEqual(['Support', 'Standard'])
    expect(plan.release.questions.map((q) => q.band)).toEqual(['Support', 'Standard'])
  })
})

describe('a paper built in Klunk', () => {
  const choices = ['w', 'x', 'y', 'z'].map((text) => ({ text }))
  const mc = question('mc', {
    questionType: 'multiple_choice',
    marks: 1,
    source: { origin: 'authored' },
    config: { choices, correctAnswer: 2 },
  })
  const match = question('match', {
    questionType: 'matching',
    marks: 3,
    source: { origin: 'authored' },
    config: {
      items: [
        { text: 'one', matches: [0] },
        { text: 'two', matches: [3] },
      ],
      options: ['p', 'q', 'r', 's'].map((text) => ({ text })),
    },
  })
  const written = question('w1', { source: { paper: 'HSC', year: 2023, questionNumber: '21' } })

  function built(date?: string, extra: Partial<Paper> = {}): Paper {
    return {
      formatVersion: '1',
      type: 'klunk_paper',
      id: 'y9-yearly',
      title: 'Year 9 Yearly',
      shuffleVersion: 2,
      school: { yearGroup: 'Year 9', ...(date ? { date } : {}) },
      sections: [
        {
          title: 'Support',
          refs: [
            { file: 'bank/y8.json', questionId: 'mc' },
            { file: 'bank/y8.json', questionId: 'match' },
          ],
        },
        {
          title: 'Standard',
          refs: [
            { file: 'bank/y8.json', questionId: 'w1', marksOverride: 5 },
            { file: 'bank/y8.json', questionId: 'gone' },
          ],
        },
      ],
      ...extra,
    }
  }
  const index = folder([mc, match, written], [built('2026-06-10')])
  const [exam] = builtPapers(index)

  it('offers its questions as it printed them, and counts what it cannot find', () => {
    expect(exam!.key).toBe('paper:y9-yearly')
    expect(exam!.questions.map((r) => r.question.id)).toEqual(['mc', 'match', 'w1'])
    expect(exam!.sections).toEqual(['Support', 'Standard'])
    expect(exam!.missing).toBe(1)
    expect(sectionsLookLikeBands(exam!)).toBe(true)
  })

  it('writes the options in the order the paper printed them, and the answer with them', () => {
    const p = printedFor(exam!, 'mc', false)!
    const printedPaper = shuffledChoices(mc, 2)
    const copy = studentCopy(mc, undefined, p)
    expect(copy.config?.choices).toEqual(printedPaper.choices)
    expect(copy.config?.correctAnswer).toBe(printedPaper.correctIndex)
    expect(copy.config).not.toHaveProperty('shuffle')
    // The test is worth nothing if this question happens to print unshuffled.
    expect(printedPaper.choices.map((c) => c.text)).not.toEqual(['w', 'x', 'y', 'z'])
  })

  it('moves a matching question’s lettered column and the matches with it', () => {
    const copy = studentCopy(match, undefined, printedFor(exam!, 'match', false))
    const printedPaper = shuffledMatching(match, 2)
    expect(copy.config?.options).toEqual(printedPaper.options)
    expect(copy.config?.items?.map((i) => i.matches?.map(optionLetter))).toEqual(
      printedPaper.items.map((i) => i.letters),
    )
  })

  it('carries the printed number and marks, and no band unless asked', () => {
    const copy = studentCopy(written, undefined, printedFor(exam!, 'w1', false))
    expect(copy.marks).toBe(5)
    expect(copy.source).toEqual({ questionNumber: '3' })
    expect(copy).not.toHaveProperty('band')
    expect(studentCopy(written, undefined, printedFor(exam!, 'w1', true)).band).toBe('Standard')
  })

  it('holds everything back without a date, or with a date sat before the paper', () => {
    const undated = builtPapers(folder([mc], [built()]))[0]!
    expect(embargo(undated, '2026-06-10', index, TODAY).exam).toMatch(/no date/)
    expect(embargo(exam!, '2026-06-01', index, TODAY).exam).toMatch(/on or after 10 June 2026/)
    expect(embargo(exam!, '2026-06-12', index, TODAY).exam).toBeUndefined()
  })

  it('holds back a question also on another paper still to come, but not for itself', () => {
    const both = folder(
      [mc, match, written],
      [built('2026-06-10'), { ...paper('trial', ['w1'], '2026-12-03') }],
    )
    const e = builtPapers(both).find((x) => x.paper.id === 'y9-yearly')!
    const held = embargo(e, '2026-06-12', both, TODAY).questions
    expect(held.get('w1')).toMatch(/Paper trial, which is sat on 3 December 2026/)
    expect(held.has('mc')).toBe(false)
  })

  it('is filed under its own id, and writes bands only when asked', () => {
    const details = {
      title: 'Year 9 Yearly',
      subject: 'Mathematics',
      yearLevel: 9,
      releasedOn: TODAY,
    }
    const plan = planRelease(exam!, exam!.questions, details, '2026-06-12', index)
    expect(plan.path).toBe('2026/y9-yearly.json')
    expect(plan.release.id).toBe('y9-yearly')
    expect(plan.release.examYear).toBe(2026)
    expect(plan.release).not.toHaveProperty('bands')
    expect(plan.ledger).toMatchObject({ key: 'paper:y9-yearly', sectionsAreBands: false })

    const banded = planRelease(
      exam!,
      exam!.questions,
      { ...details, sectionsAreBands: true },
      '2026-06-12',
      index,
    )
    expect(banded.release.bands).toEqual(['Support', 'Standard'])
  })

  it('notices a change in what the paper printed, such as its marks', () => {
    const ledger = recordRelease(emptyLedger(), { key: exam!.key }, [
      {
        id: 'w1',
        exam: exam!.key,
        approvedBy: 'A',
        approvedOn: TODAY,
        hash: releaseHash(written, printedFor(exam!, 'w1', false)),
      },
    ])
    expect(releaseState(ledger, exam!.key, written, printedFor(exam!, 'w1', false))).toBe(
      'released',
    )
    const regraded = builtPapers(
      folder(
        [mc, match, written],
        [built('2026-06-10')].map((p) => {
          const refs = p.sections[1]!.refs
          refs[0] = { file: 'bank/y8.json', questionId: 'w1', marksOverride: 4 }
          return p
        }),
      ),
    )[0]!
    expect(releaseState(ledger, exam!.key, written, printedFor(regraded, 'w1', false))).toBe(
      'changed',
    )
  })

  it('does not suggest bands for a paper in sections', () => {
    const nesa = builtPapers(
      folder(
        [mc],
        [
          built('2026-06-10', {
            sections: [{ title: 'Section I', refs: [{ file: 'bank/y8.json', questionId: 'mc' }] }],
          }),
        ],
      ),
    )[0]!
    expect(sectionsLookLikeBands(nesa)).toBe(false)
  })
})

describe('yearFromName', () => {
  it.each([
    ['2025 Year 8 Task1', 8],
    ['Yr 9 Maths Assessment', 9],
    ['Y10 Half Yearly', 10],
    ['NSW HSC Design and Technology', 12],
    ['Mathematics Advanced trial', undefined],
    ['Year 3 NAPLAN', undefined],
  ])('reads %j as %j', (name, year) => {
    expect(yearFromName(name)).toBe(year)
  })
})

describe('readLedger', () => {
  it('keeps what fits and drops the rest', () => {
    const ledger = readLedger({
      exams: [{ key: 'k', dateSat: '2025-06-10', yearLevel: 8 }, { dateSat: 'x' }],
      questions: [{ id: '1', exam: 'k', hash: 'h', approvedBy: 'A' }, { id: '2' }],
    })
    expect(ledger.exams).toEqual([{ key: 'k', dateSat: '2025-06-10', yearLevel: 8 }])
    expect(ledger.questions).toEqual([
      { id: '1', exam: 'k', hash: 'h', approvedBy: 'A', approvedOn: '' },
    ])
  })

  it('replaces one exam on a release and leaves the others', () => {
    const before = recordRelease(
      recordRelease(emptyLedger(), { key: 'a' }, [
        { id: '1', exam: 'a', approvedBy: '', approvedOn: '', hash: 'h' },
      ]),
      { key: 'b' },
      [{ id: '1', exam: 'b', approvedBy: '', approvedOn: '', hash: 'h' }],
    )
    const after = recordRelease(before, { key: 'a', title: 'New' }, [])
    expect(after.exams.map((e) => e.key).sort()).toEqual(['a', 'b'])
    expect(after.questions.map((q) => q.exam)).toEqual(['b'])
  })
})

describe('lastSubject', () => {
  it('offers the subject last released from this folder', () => {
    const ledger = recordRelease(
      recordRelease(emptyLedger(), { key: 'a', subject: 'Maths', releasedOn: '2026-10-01' }, []),
      { key: 'b', subject: 'Mathematics', releasedOn: '2026-11-01' },
      [],
    )
    expect(lastSubject(ledger)).toBe('Mathematics')
    expect(lastSubject(emptyLedger())).toBeUndefined()
  })
})
