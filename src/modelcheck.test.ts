/**
 * Tags that name nothing, and two models of one document.
 *
 * The cases worth having are the ones where staying quiet is right, because a
 * warning that fires on an ordinary folder is one a teacher learns to ignore: a
 * question naming no syllabus, a bank naming a model the teacher has not
 * generated, and two editions of one subject running at once, which is #29 and is
 * normal rather than a fault.
 */

import { describe, expect, it } from 'vitest'
import { duplicateModels, knownIds, taggedIds, unresolvedAgainst, unresolvedTags } from './modelcheck'
import type { Loaded, Question, QuestionRef, Syllabus, SyllabusCourse } from './types'

const courses: SyllabusCourse[] = [
  {
    id: 'hsc',
    name: 'HSC course',
    outcomes: [{ code: 'H1.1', text: 'explains the impact of design' }],
    topics: [
      {
        id: 'HSC-01',
        name: 'Design',
        points: [
          { id: 'HSC-01.01', text: 'the design process' },
          { id: 'HSC-01.02', text: 'functional requirements' },
        ],
      },
    ],
  },
]

const model = (over: Partial<Syllabus> = {}, path = 'syllabus/dt.json'): Loaded<Syllabus> => ({
  path,
  data: {
    formatVersion: '1',
    type: 'klunk_syllabus',
    id: 'dt',
    name: 'Design and Technology',
    framework: 'NESA',
    courses,
    ...over,
  },
})

/**
 * `null` rather than `undefined` for "names no syllabus".
 *
 * An explicit `undefined` argument falls back to the default parameter, so a
 * test written that way silently checks the default instead of the case it
 * names. This one did, until it failed for the right reason.
 */
const asked = (
  tags: { topicIds?: string[]; pointIds?: string[]; outcomes?: string[]; courseId?: string },
  syllabusId: string | null = 'dt',
): QuestionRef => {
  const question: Question = {
    id: 'q1',
    questionType: 'short_answer',
    questionText: 'Explain one thing',
    marks: 3,
    syllabus: {
      topicIds: tags.topicIds ?? [],
      pointIds: tags.pointIds ?? [],
      ...(tags.courseId ? { courseId: tags.courseId } : {}),
    },
    ...(tags.outcomes ? { outcomes: tags.outcomes } : {}),
  }
  return { question, file: 'bank/b.json', syllabusId: syllabusId ?? undefined }
}

/**
 * Two courses holding one id, which is the IB arrangement (#47).
 *
 * Higher level is the whole syllabus rather than the extra topics, so `A1-1` is
 * in both. Every NESA model mints its ids from the course id and cannot produce
 * this, which is why it went unnoticed until an IB model existed.
 */
const shared: SyllabusCourse[] = [
  {
    id: 'sl',
    name: 'Standard level',
    topics: [{ id: 'A1-1', name: 'Ergonomics', points: [{ id: 'A1-1.1', text: 'percentiles' }] }],
  },
  {
    id: 'hl',
    name: 'Higher level',
    topics: [
      { id: 'A1-1', name: 'Ergonomics', points: [{ id: 'A1-1.1', text: 'percentiles' }] },
      { id: 'A3-2', name: 'Structures', points: [{ id: 'A3-2.1', text: 'beams' }] },
    ],
  },
]

describe('what a model defines', () => {
  it('is its topics, its content points and its outcome codes', () => {
    expect([...taggedIds(courses).all].sort()).toEqual([
      'H1.1',
      'HSC-01',
      'HSC-01.01',
      'HSC-01.02',
    ])
  })

  it('keeps each course separately, so a shared id is not one id', () => {
    const ids = taggedIds(shared)

    expect([...ids.byCourse.get('sl')!].sort()).toEqual(['A1-1', 'A1-1.1'])
    expect([...ids.byCourse.get('hl')!].sort()).toEqual(['A1-1', 'A1-1.1', 'A3-2', 'A3-2.1'])
    expect([...ids.all].sort()).toEqual(['A1-1', 'A1-1.1', 'A3-2', 'A3-2.1'])
  })
})

describe('which ids a question may cite', () => {
  const ids = taggedIds(shared)

  it('holds a question naming a course to that course', () => {
    expect(unresolvedAgainst(asked({ topicIds: ['A3-2'], courseId: 'sl' }).question, ids)).toEqual([
      'A3-2',
    ])
    expect(unresolvedAgainst(asked({ topicIds: ['A3-2'], courseId: 'hl' }).question, ids)).toEqual(
      [],
    )
  })

  it('holds a question naming no course to the whole model', () => {
    // The bare id could belong to any course in it, so ruling it out would be a
    // guess, and a warning raised on a guess is noise.
    expect(unresolvedAgainst(asked({ topicIds: ['A3-2'] }).question, ids)).toEqual([])
  })

  it('falls back to the whole model when the course named is not in it', () => {
    expect(
      unresolvedAgainst(asked({ topicIds: ['A3-2'], courseId: 'diploma' }).question, ids),
    ).toEqual([])
  })
})

describe('tags that name nothing', () => {
  const known = knownIds([model()])

  it('says nothing about a question whose tags all resolve', () => {
    expect(unresolvedTags(asked({ topicIds: ['HSC-01'], pointIds: ['HSC-01.02'] }), known)).toEqual(
      [],
    )
  })

  it('names the tags that do not, topics, points and outcomes alike', () => {
    expect(
      unresolvedTags(
        asked({ topicIds: ['HSC-02'], pointIds: ['HSC-01.09'], outcomes: ['H1.1', 'H9.9'] }),
        known,
      ),
    ).toEqual(['HSC-02', 'HSC-01.09', 'H9.9'])
  })

  it('stays quiet when the question names no syllabus', () => {
    // All that is known is the bare id, which could belong to any model in the
    // folder. The same reading inSyllabus takes.
    expect(unresolvedTags(asked({ topicIds: ['HSC-99'] }, null), known)).toEqual([])
  })

  it('stays quiet when that model is not in this folder', () => {
    // Klunk ships no syllabus models, so a bank naming one the teacher has not
    // generated yet is ordinary rather than a fault in the question.
    expect(unresolvedTags(asked({ topicIds: ['HSC-99'] }, 'textiles'), known)).toEqual([])
  })

  it('checks against a model already in hand too', () => {
    const ids = taggedIds(courses)
    expect(unresolvedAgainst(asked({ topicIds: ['HSC-01', 'HSC-02'] }).question, ids)).toEqual([
      'HSC-02',
    ])
  })

  it('marks a tag dead when the course it names does not have it', () => {
    // The id is real and is in the other course, which is exactly the case a
    // flattened model could not see (#47).
    const known = knownIds([model({ id: 'ib', courses: shared }, 'syllabus/ib.json')])
    expect(
      unresolvedTags(asked({ topicIds: ['A3-2'], courseId: 'sl' }, 'ib'), known),
    ).toEqual(['A3-2'])
  })
})

describe('two models from one document', () => {
  const from = (title: string, id: string, path: string, edition?: string) =>
    model(
      {
        id,
        source: { title },
        ...(edition ? { syllabusVersion: edition } : {}),
      },
      path,
    )

  it('reports two ids built from the same document', () => {
    const found = duplicateModels([
      from('textiles-design-st6-syl.docx', 'nsw-hsc-textiles', 'syllabus/a.json'),
      from('textiles-design-st6-syl.docx', 'textiles-corrected', 'syllabus/b.json'),
    ])
    expect(found).toHaveLength(1)
    expect(found[0]?.source).toBe('textiles-design-st6-syl.docx')
    expect(found[0]?.models.map((m) => m.path)).toEqual(['syllabus/a.json', 'syllabus/b.json'])
  })

  it('leaves two editions of one subject alone, which is the normal state', () => {
    // #29: Year 11 starts the new syllabus while Year 12 finishes the old one.
    // Two editions are two different documents, so they do not share a title.
    expect(
      duplicateModels([
        from('biology-st6-syl-2017.docx', 'nsw-hsc-biology-2017', 'syllabus/a.json', '2017'),
        from('biology-11-12-2025.docx', 'nsw-hsc-biology-2025', 'syllabus/b.json', '2025'),
      ]),
    ).toEqual([])
  })

  it('leaves two subjects alone', () => {
    expect(
      duplicateModels([
        from('design-technology-st6-syl.docx', 'dt', 'syllabus/a.json'),
        from('textiles-design-st6-syl.docx', 'textiles', 'syllabus/b.json'),
      ]),
    ).toEqual([])
  })

  it('does not group models that merely have no document recorded', () => {
    // A hand-written model has no source title, and a folder of them is not a
    // folder of duplicates.
    expect(
      duplicateModels([
        model({ id: 'a' }, 'syllabus/a.json'),
        model({ id: 'b' }, 'syllabus/b.json'),
      ]),
    ).toEqual([])
  })

  it('reports the same document under three ids once, with all three', () => {
    const found = duplicateModels([
      from('x.docx', 'a', 'syllabus/a.json'),
      from('x.docx', 'b', 'syllabus/b.json'),
      from('x.docx', 'c', 'syllabus/c.json'),
    ])
    expect(found).toHaveLength(1)
    expect(found[0]?.models).toHaveLength(3)
  })
})
