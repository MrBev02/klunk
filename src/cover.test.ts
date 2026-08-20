/**
 * The cover sheet's resolution rules.
 *
 * Three layers hold the answer and each absence means "use the one above", so
 * what is worth testing is the falling back rather than the drawing. Nothing
 * here renders anything: `cover.ts` takes a resolved paper and returns a model,
 * which is what makes every rule below reachable without a component renderer.
 *
 * The last case in each group is the regression the module exists to guarantee:
 * a folder with no `school.json` and a paper with no `school` block prints the
 * cover it printed before any of this.
 */

import { describe, expect, it } from 'vitest'
import { coverModel, formatDate, questionRange, DEFAULT_LOGO_WIDTH_MM } from './cover'
import type { ResolvedPaper, ResolvedSection } from './paper'
import type { Paper, Profile, School } from './types'

function section(title: string, marks: number, numbers: number[]): ResolvedSection {
  return {
    title,
    marks,
    offeredMarks: marks,
    questions: numbers.map((n) => ({
      question: {
        id: `q${n}`,
        questionType: 'short_answer' as const,
        questionText: 'Explain.',
        marks: 1,
      },
      file: 'bank/b.json',
      number: n,
      marks: 1,
    })),
  }
}

function resolved(over: Partial<ResolvedPaper> = {}): ResolvedPaper {
  const paper: Paper = {
    formatVersion: '1',
    type: 'klunk_paper',
    id: 'trial',
    title: '2026 Year 10 Half-Yearly Examination',
    sections: [],
  }
  return {
    paper,
    sections: [section('Section I', 30, [1, 2, 3])],
    totalMarks: 30,
    missing: [],
    relocated: [],
    images: new Map(),
    syllabusNames: new Map(),
    syllabusTags: new Map(),
    courseNames: new Map(),
    ...over,
  }
}

function school(over: Partial<School> = {}): School {
  return { formatVersion: '1', type: 'klunk_school', name: 'Redlands', ...over }
}

/**
 * A profile with only the fields a cover reads.
 *
 * `null` rather than an optional default for anything a case might deliberately
 * leave out: a parameter defaulted to a value swallows an explicit `undefined`
 * and quietly checks the default instead, which is the test bug #44 and #49 both
 * turned up and which is worth not making a third time.
 */
function profile(over: Partial<Profile['paper']> = {}): Profile {
  return {
    formatVersion: '1',
    type: 'klunk_profile',
    id: 'p',
    name: 'Profile',
    paper: { totalMarks: 30, sections: [], ...over },
  }
}

/* ------------------------------------------------------------------- branding */

describe('the school name', () => {
  it('comes from school.json when the paper does not say', () => {
    const model = coverModel(resolved({ school: school(), schoolPath: 'school.json' }))
    expect(model.schoolName).toBe('Redlands')
  })

  it('is overridden by the paper, so one campus can print its own', () => {
    const paper = { ...resolved().paper, school: { name: 'Redlands Cremorne' } }
    const model = coverModel(resolved({ paper, school: school(), schoolPath: 'school.json' }))
    expect(model.schoolName).toBe('Redlands Cremorne')
  })

  it('is absent when neither says, rather than an empty string', () => {
    expect(coverModel(resolved()).schoolName).toBeUndefined()
  })
})

describe('the logo', () => {
  it("resolves the school's path against school.json, not against the paper", () => {
    const model = coverModel(
      resolved({
        school: school({ logoFile: 'brand/logo.png' }),
        schoolPath: 'school.json',
        images: new Map([['brand/logo.png', 'blob:one']]),
      }),
    )
    expect(model.logoPath).toBe('brand/logo.png')
    expect(model.logoSrc).toBe('blob:one')
  })

  it("resolves a paper's own logo against the paper file", () => {
    const paper = { ...resolved().paper, school: { logoFile: 'logo.png' } }
    const model = coverModel(
      resolved({
        paper,
        paperPath: 'papers/trial.json',
        images: new Map([['papers/logo.png', 'blob:two']]),
      }),
    )
    expect(model.logoPath).toBe('papers/logo.png')
    expect(model.logoSrc).toBe('blob:two')
  })

  it('falls back to where the paper would be saved when it is not saved yet', () => {
    const paper = { ...resolved().paper, school: { logoFile: 'logo.png' } }
    expect(coverModel(resolved({ paper })).logoPath).toBe('papers/logo.png')
  })

  it("prefers the paper's logo over the school's", () => {
    const paper = { ...resolved().paper, school: { logoFile: 'special.png' } }
    const model = coverModel(
      resolved({
        paper,
        paperPath: 'papers/trial.json',
        school: school({ logoFile: 'logo.png' }),
        schoolPath: 'school.json',
      }),
    )
    expect(model.logoPath).toBe('papers/special.png')
  })

  it('names a logo the folder does not hold, so it prints as a placeholder', () => {
    const model = coverModel(
      resolved({ school: school({ logoFile: 'logo.png' }), schoolPath: 'school.json' }),
    )
    expect(model.logoPath).toBe('logo.png')
    expect(model.logoSrc).toBeUndefined()
  })

  it('has no path at all when nothing names one', () => {
    expect(coverModel(resolved()).logoPath).toBeUndefined()
  })

  it('takes its width from the school, or the default', () => {
    expect(coverModel(resolved()).logoWidthMm).toBe(DEFAULT_LOGO_WIDTH_MM)
    expect(
      coverModel(resolved({ school: school({ logoWidthMm: 110 }), schoolPath: 'school.json' }))
        .logoWidthMm,
    ).toBe(110)
  })
})

/* ------------------------------------------------------------ identification */

describe('identification fields', () => {
  const folderFields = school({
    identification: [
      { label: 'Name', kind: 'write' },
      { label: 'Science class', kind: 'write' },
    ],
  })

  it('come from school.json when the profile does not override them', () => {
    const model = coverModel(resolved({ school: folderFields, schoolPath: 'school.json' }))
    expect(model.identification.map((f) => f.label)).toEqual(['Name', 'Science class'])
    expect(model.everyPage).toEqual([])
  })

  it('are replaced whole by the profile, never merged field by field', () => {
    const model = coverModel(
      resolved({
        school: folderFields,
        schoolPath: 'school.json',
        profile: profile({
          cover: { identification: [{ label: 'Student number', kind: 'boxes' }] },
        }),
      }),
    )
    expect(model.identification.map((f) => f.label)).toEqual(['Student number'])
  })

  it('split the every-page ones out from the cover ones', () => {
    const model = coverModel(
      resolved({
        school: school({
          identification: [
            { label: 'Student number', kind: 'boxes', boxes: 8, onEveryPage: true },
            { label: 'Name', kind: 'write' },
          ],
        }),
        schoolPath: 'school.json',
      }),
    )
    expect(model.everyPage.map((f) => f.label)).toEqual(['Student number'])
    expect(model.identification.map((f) => f.label)).toEqual(['Name'])
  })

  it('resolve the box count, so the renderer never has to know the default', () => {
    const model = coverModel(
      resolved({
        school: school({ identification: [{ label: 'Student number', kind: 'boxes' }] }),
        schoolPath: 'school.json',
      }),
    )
    expect(model.identification[0]?.boxes).toBe(8)
  })

  it('drop a field with no label, which is what an unfilled row is', () => {
    const model = coverModel(
      resolved({
        school: school({
          identification: [
            { label: 'Name', kind: 'write' },
            { label: '  ', kind: 'write' },
          ],
        }),
        schoolPath: 'school.json',
      }),
    )
    expect(model.identification).toHaveLength(1)
  })

  it('are empty when the folder has no school.json', () => {
    const model = coverModel(resolved())
    expect(model.identification).toEqual([])
    expect(model.everyPage).toEqual([])
  })
})

/* -------------------------------------------------------------------- timing */

describe('reading and working time', () => {
  it("come from the paper's own numbers first", () => {
    const paper = { ...resolved().paper, readingMinutes: 10, workingMinutes: 120 }
    const model = coverModel(
      resolved({ paper, profile: profile({ readingMinutes: 5, workingMinutes: 90 }) }),
    )
    expect(model.readingMinutes).toBe(10)
    expect(model.workingMinutes).toBe(120)
  })

  it('fall back to the profile', () => {
    const model = coverModel(resolved({ profile: profile({ readingMinutes: 5 }) }))
    expect(model.readingMinutes).toBe(5)
    expect(model.workingMinutes).toBeUndefined()
  })

  it('survive being zero, which is a real answer and not a missing one', () => {
    const paper = { ...resolved().paper, readingMinutes: 0 }
    const model = coverModel(resolved({ paper, profile: profile({ readingMinutes: 5 }) }))
    expect(model.readingMinutes).toBe(0)
  })
})

describe('instructions', () => {
  it("use the paper's, falling back to the profile's", () => {
    expect(
      coverModel(resolved({ profile: profile({ instructions: ['Use black pen'] }) })).instructions,
    ).toEqual(['Use black pen'])

    const paper = { ...resolved().paper, instructions: ['Answer all questions'] }
    expect(
      coverModel(resolved({ paper, profile: profile({ instructions: ['Use black pen'] }) }))
        .instructions,
    ).toEqual(['Answer all questions'])
  })

  it('drop the blank lines a textarea leaves behind', () => {
    const paper = { ...resolved().paper, instructions: ['Use black pen', '', '   '] }
    expect(coverModel(resolved({ paper })).instructions).toEqual(['Use black pen'])
  })
})

/* ------------------------------------------------------------ marks breakdown */

describe('the marks breakdown', () => {
  it('is a list unless the profile asks for the awarded column', () => {
    expect(coverModel(resolved()).marksAwardedColumn).toBe(false)
    expect(
      coverModel(resolved({ profile: profile({ cover: { marksAwardedColumn: true } }) }))
        .marksAwardedColumn,
    ).toBe(true)
  })

  it('carries a row per section with its question range and suggested time', () => {
    const model = coverModel(
      resolved({
        sections: [
          {
            ...section('Section I', 10, [1, 2, 3]),
            profileSection: { id: 'I', name: 'Section I', marks: 10, suggestedMinutes: 15 },
          },
          section('Section II', 20, [4, 5]),
        ],
        totalMarks: 30,
      }),
    )
    expect(model.sections).toEqual([
      {
        title: 'Section I',
        marks: 10,
        questions: 'Questions 1–3',
        attempt: undefined,
        suggestedMinutes: 15,
      },
      {
        title: 'Section II',
        marks: 20,
        questions: 'Questions 4–5',
        attempt: undefined,
        suggestedMinutes: undefined,
      },
    ])
    expect(model.totalMarks).toBe(30)
  })

  it('carries only the first line of a section instruction, which is the attempt line', () => {
    // The rest is the section's preamble, which a real paper prints over the
    // questions rather than on the cover: on the Visual Arts trial it runs to
    // six lines including the list a response is assessed against.
    const s = section('Section II', 25, [4, 5])
    s.instructions =
      'Attempt ONE question from Questions 4–9\n' +
      'Answer the question in the Section II Writing Booklet.\n' +
      'Your answer will be assessed on how well you:'
    const model = coverModel(resolved({ sections: [s], totalMarks: 25 }))
    expect(model.sections[0]?.attempt).toBe('Attempt ONE question from Questions 4–9')
  })
})

describe('questionRange', () => {
  it('says nothing for a section with no questions in it yet', () => {
    expect(questionRange([])).toBe('')
  })

  it('says Question, singular, for one', () => {
    expect(questionRange([7])).toBe('Question 7')
  })

  it('uses an en dash for a run, as the printed papers do', () => {
    expect(questionRange([1, 2, 3, 4])).toBe('Questions 1–4')
  })

  it('lists them rather than printing a range that skips one', () => {
    // Numbers are assigned across the paper in order, so a section's are always
    // a run. Reading them rather than assuming it means a paper that somehow is
    // not still prints a cover that matches the questions under it.
    expect(questionRange([1, 2, 5])).toBe('Questions 1, 2, 5')
  })
})

describe('the date', () => {
  it('prints the way a cover prints it, not the way the date box stores it', () => {
    expect(formatDate('2026-08-10')).toBe('10 August 2026')
    expect(formatDate('2026-01-01')).toBe('1 January 2026')
    expect(formatDate('2026-12-31')).toBe('31 December 2026')
  })

  it('does not shift a day, which is what going through Date would do', () => {
    // `new Date('2026-08-10')` is read as UTC and printed in local time, so
    // anywhere west of Greenwich it is the 9th.
    expect(formatDate('2026-08-10')).toContain('10 ')
  })

  it('leaves anything that is not an ISO date exactly as typed', () => {
    expect(formatDate('Week 3, Term 3')).toBe('Week 3, Term 3')
    expect(formatDate('Monday 10 August')).toBe('Monday 10 August')
    expect(formatDate('2026-13-01')).toBe('2026-13-01')
    expect(formatDate(undefined)).toBeUndefined()
  })

  it('reaches the cover model formatted', () => {
    const paper = { ...resolved().paper, school: { date: '2026-08-10' } }
    expect(coverModel(resolved({ paper })).date).toBe('10 August 2026')
  })
})

/* --------------------------------------------------------------- the fallback */

describe('a paper with no branding anywhere', () => {
  it('prints the cover it printed before any of this existed', () => {
    const model = coverModel(resolved())

    expect(model.schoolName).toBeUndefined()
    expect(model.logoPath).toBeUndefined()
    expect(model.logoSrc).toBeUndefined()
    expect(model.identification).toEqual([])
    expect(model.everyPage).toEqual([])
    expect(model.marksAwardedColumn).toBe(false)
    expect(model.course).toBeUndefined()
    expect(model.yearGroup).toBeUndefined()
    expect(model.date).toBeUndefined()

    // What it always had: the title, the total and the sections.
    expect(model.title).toBe('2026 Year 10 Half-Yearly Examination')
    expect(model.totalMarks).toBe(30)
    expect(model.sections).toHaveLength(1)
  })

  it('carries the marking guide stamp only when asked for the guide', () => {
    expect(coverModel(resolved()).guide).toBe(false)
    expect(coverModel(resolved(), true).guide).toBe(true)
  })
})
