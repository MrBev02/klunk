/**
 * Correcting a parsed syllabus by hand.
 *
 * The cases worth having are the two the readers actually get wrong, since those
 * are what these operations exist for: a content point promoted to a topic by a
 * page break (#26), and a group taken from document furniture and applied to a
 * whole course (#14). The rest guard the rule that makes any of it safe, which is
 * that an id never moves to a different piece of content.
 */

import { describe, expect, it } from 'vitest'
import {
  addPoint,
  clearGroups,
  costOfReplacing,
  deleteOutcome,
  deletePoint,
  deleteSkill,
  deleteTopic,
  editOutcome,
  editPoint,
  editSkill,
  mergeTopicUp,
  nextPointId,
  nextTopicId,
  problemsWith,
  renameCourse,
  renameTopic,
  setOutcomeCode,
  setTopicGroup,
  splitTopic,
  SyllabusEditError,
  tidyCourses,
} from './syllabusedit'
import type { Question, QuestionRef, SyllabusCourse } from './types'

/** The Biology shape from #78: items with sub-items under them, and capabilities. */
function nested(): SyllabusCourse[] {
  return [
    {
      id: 'y11',
      name: 'Year 11',
      outcomes: [{ code: 'BIO11-8', text: 'describes single cells' }],
      topics: [
        {
          id: 'Y11-01',
          name: 'Cell Structure',
          group: 'Module 1: Cells as the Basis of Life',
          outcomes: ['BIO11-8'],
          inquiryQuestion: 'What distinguishes one cell from another?',
          points: [
            { id: 'Y11-01.01', text: 'investigate structures, including:', capabilities: ['Literacy'] },
            { id: 'Y11-01.02', text: 'examining prokaryotic cells', parent: 'Y11-01.01' },
            { id: 'Y11-01.03', text: 'drawing scaled diagrams', parent: 'Y11-01.01' },
            { id: 'Y11-01.04', text: 'describe a range of technologies' },
          ],
        },
        {
          id: 'Y11-02',
          name: 'Cell Function',
          group: 'Module 1: Cells as the Basis of Life',
          outcomes: ['BIO11-8'],
          inquiryQuestion: 'How do cells coordinate activities?',
          points: [
            { id: 'Y11-02.01', text: 'investigate movement, including:' },
            { id: 'Y11-02.02', text: 'modelling diffusion', parent: 'Y11-02.01', capabilities: ['Numeracy'] },
          ],
        },
      ],
    },
  ]
}

/** Every parent on every point names a point of the same topic. */
function dangling(courses: SyllabusCourse[]): string[] {
  return courses.flatMap((c) =>
    c.topics.flatMap((t) => {
      const ids = new Set((t.points ?? []).map((p) => p.id))
      return (t.points ?? [])
        .filter((p) => p.parent && !ids.has(p.parent))
        .map((p) => `${t.id} ${p.id} -> ${p.parent}`)
    }),
  )
}

/** The Textiles HSC shape from #26: a topic, then its tail read as a topic of its own. */
function courses(): SyllabusCourse[] {
  return [
    {
      id: 'hsc',
      name: 'HSC course',
      outcomes: [
        { code: 'H1.1', text: 'explains the impact of design' },
        { code: 'H2.1', text: 'justifies a choice of fabric' },
      ],
      topics: [
        {
          id: 'HSC-01',
          name: 'Design',
          text: 'Design, including:',
          group: 'Design',
          outcomes: ['H1.1'],
          points: [
            { id: 'HSC-01.01', text: 'i) the design process' },
            { id: 'HSC-01.02', text: 'ii) functional requirements' },
            { id: 'HSC-01.03', text: 'iii) aesthetic requirements' },
          ],
          skills: ['analyse a design brief'],
        },
        {
          id: 'HSC-02',
          name: 'iv) end use requirements',
          text: 'iv) end use requirements',
          group: 'Design',
          outcomes: ['H1.1'],
          points: [
            { id: 'HSC-02.01', text: 'v) cost' },
            { id: 'HSC-02.02', text: 'vi) durability' },
          ],
          skills: ['cost a garment'],
        },
        {
          id: 'HSC-03',
          name: 'Properties of textiles',
          text: 'Properties of textiles',
          group: 'Design',
          outcomes: ['H2.1'],
          points: [{ id: 'HSC-03.01', text: 'fibre properties' }],
        },
      ],
    },
  ]
}

const hsc = (cs: SyllabusCourse[]) => cs[0] as SyllabusCourse
const topic = (cs: SyllabusCourse[], id: string) => hsc(cs).topics.find((t) => t.id === id)

describe('minting ids', () => {
  it('takes the next topic id from the highest in use, not the count', () => {
    expect(nextTopicId(hsc(courses()))).toBe('HSC-04')
  })

  it('does not reuse an id a deleted topic had', () => {
    const after = deleteTopic(courses(), 'hsc', 'HSC-02')
    expect(hsc(after).topics).toHaveLength(2)
    // The count is two, so a length-based id would be HSC-03, which HSC-03 has.
    expect(nextTopicId(hsc(after))).toBe('HSC-04')
  })

  it('leaves every other id exactly where it was after a delete', () => {
    const after = deleteTopic(courses(), 'hsc', 'HSC-01')
    expect(hsc(after).topics.map((t) => t.id)).toEqual(['HSC-02', 'HSC-03'])
    expect(topic(after, 'HSC-03')?.name).toBe('Properties of textiles')
  })

  it('takes the next point id past the gap a deleted point left', () => {
    const after = deletePoint(courses(), 'hsc', 'HSC-01', 'HSC-01.02')
    const t = topic(after, 'HSC-01')
    expect(t?.points?.map((p) => p.id)).toEqual(['HSC-01.01', 'HSC-01.03'])
    expect(nextPointId(t!)).toBe('HSC-01.04')
  })

  it('builds a topic id from the course when there are no topics to copy from', () => {
    expect(nextTopicId({ id: 'y11', name: 'Year 11', topics: [] })).toBe('Y11-01')
  })
})

describe('merging a topic into the one above', () => {
  it('makes the heading the first of the points that move', () => {
    const after = mergeTopicUp(courses(), 'hsc', 'HSC-02')
    const t = topic(after, 'HSC-01')
    expect(t?.points?.map((p) => p.text)).toEqual([
      'i) the design process',
      'ii) functional requirements',
      'iii) aesthetic requirements',
      'iv) end use requirements',
      'v) cost',
      'vi) durability',
    ])
  })

  it('takes the published heading across rather than the tidied name', () => {
    const messy = courses()
    ;(hsc(messy).topics[1] as { name: string }).name = 'End use requirements'
    const after = mergeTopicUp(messy, 'hsc', 'HSC-02')
    expect(topic(after, 'HSC-01')?.points?.[3]?.text).toBe('iv) end use requirements')
  })

  it('numbers the moved points on from the parent without reusing an id', () => {
    const after = mergeTopicUp(courses(), 'hsc', 'HSC-02')
    expect(topic(after, 'HSC-01')?.points?.map((p) => p.id)).toEqual([
      'HSC-01.01',
      'HSC-01.02',
      'HSC-01.03',
      'HSC-01.04',
      'HSC-01.05',
      'HSC-01.06',
    ])
  })

  it('brings the skills with it and drops the topic', () => {
    const after = mergeTopicUp(courses(), 'hsc', 'HSC-02')
    expect(topic(after, 'HSC-01')?.skills).toEqual(['analyse a design brief', 'cost a garment'])
    expect(topic(after, 'HSC-02')).toBeUndefined()
    expect(hsc(after).topics.map((t) => t.id)).toEqual(['HSC-01', 'HSC-03'])
  })

  it('refuses the first topic, which has nothing above it', () => {
    expect(() => mergeTopicUp(courses(), 'hsc', 'HSC-01')).toThrow(SyllabusEditError)
  })
})

describe('splitting a topic at a content point', () => {
  it('makes the point a topic of its own, directly after', () => {
    const after = splitTopic(courses(), 'hsc', 'HSC-01', 'HSC-01.02')
    expect(hsc(after).topics.map((t) => t.id)).toEqual(['HSC-01', 'HSC-04', 'HSC-02', 'HSC-03'])
    expect(topic(after, 'HSC-04')?.name).toBe('ii) functional requirements')
  })

  it('moves the points below it across and leaves the ones above', () => {
    const after = splitTopic(courses(), 'hsc', 'HSC-01', 'HSC-01.02')
    expect(topic(after, 'HSC-01')?.points?.map((p) => p.text)).toEqual(['i) the design process'])
    expect(topic(after, 'HSC-04')?.points).toEqual([
      { id: 'HSC-04.01', text: 'iii) aesthetic requirements' },
    ])
  })

  it('copies the group and outcomes, and leaves the skills where they are', () => {
    const after = splitTopic(courses(), 'hsc', 'HSC-01', 'HSC-01.02')
    expect(topic(after, 'HSC-04')?.group).toBe('Design')
    expect(topic(after, 'HSC-04')?.outcomes).toEqual(['H1.1'])
    expect(topic(after, 'HSC-04')?.skills).toBeUndefined()
    expect(topic(after, 'HSC-01')?.skills).toEqual(['analyse a design brief'])
  })

  it('undoes a merge that should not have happened', () => {
    const merged = mergeTopicUp(courses(), 'hsc', 'HSC-02')
    const back = splitTopic(merged, 'hsc', 'HSC-01', 'HSC-01.04')
    expect(topic(back, 'HSC-01')?.points?.map((p) => p.text)).toEqual([
      'i) the design process',
      'ii) functional requirements',
      'iii) aesthetic requirements',
    ])
    expect(topic(back, 'HSC-04')?.name).toBe('iv) end use requirements')
    expect(topic(back, 'HSC-04')?.points?.map((p) => p.text)).toEqual(['v) cost', 'vi) durability'])
  })

  it('refuses the first point, which would leave the topic above it empty', () => {
    expect(() => splitTopic(courses(), 'hsc', 'HSC-01', 'HSC-01.01')).toThrow(SyllabusEditError)
  })

  it('refuses a point that is not in that topic', () => {
    expect(() => splitTopic(courses(), 'hsc', 'HSC-01', 'HSC-03.01')).toThrow(SyllabusEditError)
  })
})

describe('groups', () => {
  it('takes the group off every topic in the course at once', () => {
    const after = clearGroups(courses(), 'hsc')
    expect(hsc(after).topics.every((t) => !('group' in t))).toBe(true)
  })

  it('removes the group rather than setting it empty, which the schema tells apart', () => {
    const after = setTopicGroup(courses(), 'hsc', 'HSC-01', '   ')
    expect('group' in (topic(after, 'HSC-01') as object)).toBe(false)
  })

  it('sets one topic and leaves its neighbours alone', () => {
    const after = setTopicGroup(courses(), 'hsc', 'HSC-01', 'Properties and Performance')
    expect(topic(after, 'HSC-01')?.group).toBe('Properties and Performance')
    expect(topic(after, 'HSC-03')?.group).toBe('Design')
  })
})

describe('deleting a topic', () => {
  it('refuses when it is the only one the course has', () => {
    const one: SyllabusCourse[] = [
      { id: 'hsc', name: 'HSC course', topics: [{ id: 'HSC-01', name: 'Design', points: [] }] },
    ]
    expect(() => deleteTopic(one, 'hsc', 'HSC-01')).toThrow(SyllabusEditError)
  })

  it('refuses a topic that is not there rather than doing nothing quietly', () => {
    expect(() => deleteTopic(courses(), 'hsc', 'HSC-09')).toThrow(SyllabusEditError)
    expect(() => renameTopic(courses(), 'pre', 'HSC-01', 'x')).toThrow(SyllabusEditError)
  })
})

describe('text edits', () => {
  it('renames a topic and keeps the published heading to check it against', () => {
    const after = renameTopic(courses(), 'hsc', 'HSC-01', 'Design processes')
    expect(topic(after, 'HSC-01')?.name).toBe('Design processes')
    expect(topic(after, 'HSC-01')?.text).toBe('Design, including:')
  })

  it('renames the course, for a wide table with no heading above it', () => {
    const unnamed: SyllabusCourse[] = [{ id: 'course', name: 'Course', topics: [] }]
    expect(renameCourse(unnamed, 'course', 'HSC course')[0]?.name).toBe('HSC course')
  })

  it('rewrites a content point that came back mangled', () => {
    const after = editPoint(courses(), 'hsc', 'HSC-01', 'HSC-01.01', 'y = ax² + bx + c')
    expect(topic(after, 'HSC-01')?.points?.[0]).toEqual({
      id: 'HSC-01.01',
      text: 'y = ax² + bx + c',
    })
  })

  it('adds a point the reader dropped', () => {
    const after = addPoint(courses(), 'hsc', 'HSC-03', 'yarn construction')
    expect(topic(after, 'HSC-03')?.points).toEqual([
      { id: 'HSC-03.01', text: 'fibre properties' },
      { id: 'HSC-03.02', text: 'yarn construction' },
    ])
  })

  it('edits and deletes a skill by position', () => {
    const edited = editSkill(courses(), 'hsc', 'HSC-01', 0, 'analyse a brief')
    expect(topic(edited, 'HSC-01')?.skills).toEqual(['analyse a brief'])
    expect(topic(deleteSkill(courses(), 'hsc', 'HSC-01', 0), 'HSC-01')?.skills).toEqual([])
  })

  it('leaves the original untouched, so undoing everything is going back to it', () => {
    const before = courses()
    renameTopic(before, 'hsc', 'HSC-01', 'Changed')
    deleteTopic(before, 'hsc', 'HSC-02')
    mergeTopicUp(before, 'hsc', 'HSC-02')
    expect(before).toEqual(courses())
  })
})

describe('outcomes', () => {
  it('rewrites the wording', () => {
    const after = editOutcome(courses(), 'hsc', 'H1.1', 'explains the impact of design on society')
    expect(hsc(after).outcomes?.[0]?.text).toBe('explains the impact of design on society')
  })

  it('carries a changed code through to every topic that cites it', () => {
    const after = setOutcomeCode(courses(), 'hsc', 'H1.1', 'H1.2')
    expect(hsc(after).outcomes?.map((o) => o.code)).toEqual(['H1.2', 'H2.1'])
    expect(topic(after, 'HSC-01')?.outcomes).toEqual(['H1.2'])
    expect(topic(after, 'HSC-02')?.outcomes).toEqual(['H1.2'])
    expect(topic(after, 'HSC-03')?.outcomes).toEqual(['H2.1'])
  })

  it('stops the topics citing an outcome that has been deleted', () => {
    const after = deleteOutcome(courses(), 'hsc', 'H1.1')
    expect(hsc(after).outcomes?.map((o) => o.code)).toEqual(['H2.1'])
    expect(topic(after, 'HSC-01')?.outcomes).toEqual([])
  })
})

describe('tidying on the way to the file', () => {
  it('trims every piece of text', () => {
    const messy = courses()
    ;(hsc(messy).topics[0] as { name: string }).name = '  Design  '
    ;(hsc(messy).topics[0]?.points?.[0] as { text: string }).text = ' the design process '
    ;(hsc(messy).outcomes?.[0] as { text: string }).text = ' explains '
    const after = tidyCourses(messy)
    expect(topic(after, 'HSC-01')?.name).toBe('Design')
    expect(topic(after, 'HSC-01')?.points?.[0]?.text).toBe('the design process')
    expect(hsc(after).outcomes?.[0]?.text).toBe('explains')
  })

  it('keeps an empty content point rather than dropping it quietly', () => {
    const after = tidyCourses(editPoint(courses(), 'hsc', 'HSC-03', 'HSC-03.01', '   '))
    expect(topic(after, 'HSC-03')?.points).toHaveLength(1)
    expect(problemsWith(after)).toHaveLength(1)
  })

  it('drops a group left blank, and an empty skill, which nothing references', () => {
    const blanked = setTopicGroup(courses(), 'hsc', 'HSC-01', '  x  ')
    expect(tidyCourses(blanked)[0]?.topics[0]?.group).toBe('x')
    const empty = editSkill(courses(), 'hsc', 'HSC-01', 0, '   ')
    expect(tidyCourses(empty)[0]?.topics[0]?.skills).toEqual([])
  })
})

describe('what replacing the model in the folder would cost', () => {
  const asked = (
    id: string,
    tags: { topicIds?: string[]; pointIds?: string[]; outcomes?: string[]; courseId?: string },
    // `null`, not `undefined`: an explicit undefined falls back to the default
    // parameter, so "names no syllabus" would quietly test the default instead.
    syllabusId: string | null = 'textiles',
  ): QuestionRef => {
    const question: Question = {
      id,
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

  it('says nothing is lost when the document is simply read again', () => {
    expect(costOfReplacing(courses(), courses(), [asked('q1', { topicIds: ['HSC-02'] })], 'textiles'))
      .toEqual({ lost: [], questions: 0, inUse: [] })
  })

  /**
   * The IB arrangement (#47): Higher level is the whole syllabus, so both
   * courses hold `A1-1`. Taking the model as one heap made a point deleted from
   * Standard level look present, because Higher level still had it, and the
   * screen told a teacher their questions were safe while they were not.
   */
  describe('when two courses share an id', () => {
    const shared = (): SyllabusCourse[] => [
      {
        id: 'sl',
        name: 'Standard level',
        topics: [
          { id: 'A1-1', name: 'Ergonomics', points: [{ id: 'A1-1.1', text: 'percentiles' }] },
        ],
      },
      {
        id: 'hl',
        name: 'Higher level',
        topics: [
          { id: 'A1-1', name: 'Ergonomics', points: [{ id: 'A1-1.1', text: 'percentiles' }] },
        ],
      },
    ]

    /** The same model with `A1-1.1` deleted from Standard level only. */
    const goneFromSl = (): SyllabusCourse[] => {
      const after = shared()
      after[0]!.topics[0]!.points = []
      return after
    }

    it('counts a point deleted from one course against that course', () => {
      const cost = costOfReplacing(
        shared(),
        goneFromSl(),
        [asked('q1', { pointIds: ['A1-1.1'], courseId: 'sl' }, 'ib')],
        'ib',
      )

      expect(cost.lost).toEqual(['A1-1.1'])
      expect(cost.questions).toBe(1)
      expect(cost.inUse).toEqual(['A1-1.1'])
    })

    it('leaves the other course alone', () => {
      const cost = costOfReplacing(
        shared(),
        goneFromSl(),
        [asked('q1', { pointIds: ['A1-1.1'], courseId: 'hl' }, 'ib')],
        'ib',
      )

      expect(cost.questions).toBe(0)
    })

    it('spares a question that names no course while the id survives somewhere', () => {
      // It never said which course it was looking at, so nothing has been taken
      // away from it that it can be shown to have been relying on.
      const cost = costOfReplacing(
        shared(),
        goneFromSl(),
        [asked('q1', { pointIds: ['A1-1.1'] }, 'ib')],
        'ib',
      )

      expect(cost.questions).toBe(0)
    })

    it('counts a question naming no course once the id is gone from every course', () => {
      const nowhere = shared().map((c) => ({ ...c, topics: [{ ...c.topics[0]!, points: [] }] }))
      const cost = costOfReplacing(
        shared(),
        nowhere,
        [asked('q1', { pointIds: ['A1-1.1'] }, 'ib')],
        'ib',
      )

      expect(cost.questions).toBe(1)
    })
  })

  it('counts the questions a merge would leave pointing at nothing', () => {
    const merged = mergeTopicUp(courses(), 'hsc', 'HSC-02')
    const cost = costOfReplacing(
      courses(),
      merged,
      [
        asked('q1', { topicIds: ['HSC-02'] }),
        asked('q2', { pointIds: ['HSC-02.01', 'HSC-02.02'] }),
        asked('q3', { topicIds: ['HSC-01'] }),
      ],
      'textiles',
    )
    expect(cost.lost).toEqual(['HSC-02', 'HSC-02.01', 'HSC-02.02'])
    expect(cost.questions).toBe(2)
    expect(cost.inUse).toEqual(['HSC-02', 'HSC-02.01', 'HSC-02.02'])
  })

  it('counts a question once however many of its tags are lost', () => {
    const merged = mergeTopicUp(courses(), 'hsc', 'HSC-02')
    const cost = costOfReplacing(
      courses(),
      merged,
      [asked('q1', { topicIds: ['HSC-02'], pointIds: ['HSC-02.01', 'HSC-02.02'] })],
      'textiles',
    )
    expect(cost.questions).toBe(1)
  })

  it('counts an outcome a question cites, not only its topics', () => {
    const after = deleteOutcome(courses(), 'hsc', 'H2.1')
    const cost = costOfReplacing(courses(), after, [asked('q1', {}, 'textiles')], 'textiles')
    expect(cost.lost).toEqual(['H2.1'])
    expect(cost.questions).toBe(0)

    const cited = costOfReplacing(
      courses(),
      after,
      [asked('q1', { outcomes: ['H2.1'] })],
      'textiles',
    )
    expect(cited.questions).toBe(1)
    expect(cited.inUse).toEqual(['H2.1'])
  })

  it('reports an id nothing uses as lost, and no questions with it', () => {
    const after = deleteTopic(courses(), 'hsc', 'HSC-03')
    const cost = costOfReplacing(courses(), after, [asked('q1', { topicIds: ['HSC-01'] })], 'textiles')
    expect(cost.lost).toEqual(['HSC-03', 'HSC-03.01'])
    expect(cost.questions).toBe(0)
    expect(cost.inUse).toEqual([])
  })

  it('leaves another subject alone, and keeps a question that names no syllabus', () => {
    const merged = mergeTopicUp(courses(), 'hsc', 'HSC-02')
    const cost = costOfReplacing(
      courses(),
      merged,
      [
        asked('q1', { topicIds: ['HSC-02'] }, 'design-technology'),
        asked('q2', { topicIds: ['HSC-02'] }, null),
      ],
      'textiles',
    )
    // The first names a different syllabus and is out of scope. The second names
    // none, and all that is known about it is the bare id it carries.
    expect(cost.questions).toBe(1)
  })

  it('ignores an id neither model has, which replacing does not change', () => {
    const cost = costOfReplacing(
      courses(),
      courses(),
      [asked('q1', { topicIds: ['PRE-99'] })],
      'textiles',
    )
    expect(cost.questions).toBe(0)
  })
})

describe('what would stop it being saved', () => {
  it('says nothing about a model that is fine', () => {
    expect(problemsWith(courses())).toEqual([])
  })

  it('names the topic with no name by its position, since it has nothing else', () => {
    const after = renameTopic(courses(), 'hsc', 'HSC-02', '')
    expect(problemsWith(after)).toEqual([
      'Topic 2 of HSC course has no name. Type its heading in, or delete the topic.',
    ])
  })

  it('names the content point by the topic it is in', () => {
    const after = editPoint(courses(), 'hsc', 'HSC-01', 'HSC-01.02', '')
    expect(problemsWith(after)).toEqual([
      'Content point 2 of "Design" is empty. Type it in, or delete it.',
    ])
  })

  it('catches a course emptied of topics and an outcome with no code', () => {
    const empty: SyllabusCourse[] = [
      { id: 'hsc', name: 'HSC course', outcomes: [{ code: '', text: 'x' }], topics: [] },
    ]
    expect(problemsWith(empty)).toEqual([
      'HSC course has no topics left. Every course needs at least one.',
      'Outcome 1 of HSC course has no code, such as H1.1.',
    ])
  })
})

describe('editing a syllabus that nests its content (#78)', () => {
  it('promotes a sub-item when the item above it is deleted', () => {
    // The reference would otherwise point at an id the topic no longer has, and
    // the model would still validate: the schema checks the shape of an id, not
    // that anything answers to it.
    const after = deletePoint(nested(), 'y11', 'Y11-01', 'Y11-01.01')
    expect(dangling(after)).toEqual([])
    const points = after[0]?.topics[0]?.points ?? []
    expect(points.map((p) => [p.id, p.parent ?? null])).toEqual([
      ['Y11-01.02', null],
      ['Y11-01.03', null],
      ['Y11-01.04', null],
    ])
  })

  it('leaves the other sub-item alone when one sub-item is deleted', () => {
    const after = deletePoint(nested(), 'y11', 'Y11-01', 'Y11-01.02')
    expect(after[0]?.topics[0]?.points?.map((p) => [p.id, p.parent ?? null])).toEqual([
      ['Y11-01.01', null],
      ['Y11-01.03', 'Y11-01.01'],
      ['Y11-01.04', null],
    ])
  })

  it('carries a parent across a split, and promotes one left behind', () => {
    // Split at the second sub-item: it moves to a new topic while the item it
    // hangs off stays behind, so it cannot keep pointing at it.
    const after = splitTopic(nested(), 'y11', 'Y11-01', 'Y11-01.03')
    expect(dangling(after)).toEqual([])
    const [kept, fresh] = after[0]?.topics ?? []
    expect(kept?.points?.map((p) => [p.text, p.parent ?? null])).toEqual([
      ['investigate structures, including:', null],
      ['examining prokaryotic cells', 'Y11-01.01'],
    ])
    expect(fresh?.name).toBe('drawing scaled diagrams')
    expect(fresh?.points?.map((p) => [p.text, p.parent ?? null])).toEqual([
      ['describe a range of technologies', null],
    ])
  })

  it('keeps parents and capabilities when a topic is merged upwards', () => {
    // The merge used to rebuild every moved point from its text alone, which
    // silently dropped both.
    //
    // The points that move are renumbered into the depth-carrying scheme (#93),
    // so `modelling diffusion` becomes `.06.01` rather than the `.07` that made
    // it look like its parent's next sibling. `nested()` is deliberately left in
    // the flat scheme, being a model written before that: the ones the parent
    // topic keeps are untouched, because ids never renumber under a teacher.
    const after = mergeTopicUp(nested(), 'y11', 'Y11-02')
    expect(dangling(after)).toEqual([])
    const topic = after[0]?.topics[0]
    expect(topic?.points?.map((p) => [p.id, p.text, p.parent ?? null])).toEqual([
      ['Y11-01.01', 'investigate structures, including:', null],
      ['Y11-01.02', 'examining prokaryotic cells', 'Y11-01.01'],
      ['Y11-01.03', 'drawing scaled diagrams', 'Y11-01.01'],
      ['Y11-01.04', 'describe a range of technologies', null],
      ['Y11-01.05', 'Cell Function', null],
      ['Y11-01.06', 'investigate movement, including:', null],
      ['Y11-01.06.01', 'modelling diffusion', 'Y11-01.06'],
      ['Y11-01.07', 'Inquiry question: How do cells coordinate activities?', null],
    ])
    expect(topic?.points?.find((p) => p.text === 'modelling diffusion')?.capabilities).toEqual([
      'Numeracy',
    ])
    // The topic merged into already had one, so the child's becomes a point
    // rather than being overwritten out of existence.
    expect(topic?.inquiryQuestion).toBe('What distinguishes one cell from another?')
  })

  it('takes the inquiry question up when the topic above has none', () => {
    const start = nested()
    delete start[0]!.topics[0]!.inquiryQuestion
    const topic = mergeTopicUp(start, 'y11', 'Y11-02')[0]?.topics[0]
    expect(topic?.inquiryQuestion).toBe('How do cells coordinate activities?')
    expect(topic?.points?.some((p) => p.text.startsWith('Inquiry question'))).toBe(false)
  })
})

describe('editing a syllabus whose ids carry their depth (#93)', () => {
  /** What a reader now produces: a sub-item numbered under its own parent. */
  function boxed(): SyllabusCourse[] {
    return [
      {
        id: 'y11',
        name: 'Year 11',
        outcomes: [{ code: 'EC-11-01', text: 'does the first thing' }],
        topics: [
          {
            id: 'Y11-01',
            name: 'Ubiquity of interactive media',
            outcomes: ['EC-11-01'],
            points: [
              { id: 'Y11-01.01', text: 'Investigate how it is used' },
              { id: 'Y11-01.02', text: 'Research the evolution' },
              { id: 'Y11-01.02.01', text: 'prevalence of blogs', parent: 'Y11-01.02' },
              { id: 'Y11-01.02.02', text: 'privacy issues', parent: 'Y11-01.02' },
              { id: 'Y11-01.03', text: 'Evaluate the performance' },
            ],
          },
          {
            id: 'Y11-02',
            name: 'Capture, store and integrate data',
            outcomes: ['EC-11-01'],
            points: [
              { id: 'Y11-02.01', text: 'Explore data capture' },
              { id: 'Y11-02.01.01', text: 'sensors', parent: 'Y11-02.01' },
            ],
          },
        ],
      },
    ]
  }

  it('numbers a new point past the top-level ones, not past the sub-items', () => {
    // Counting every point would give `.06` on a topic whose last point is
    // `.03`, and the gap widens with every box the syllabus prints.
    expect(nextPointId(boxed()[0]!.topics[0]!)).toBe('Y11-01.04')
  })

  it('keeps the depth in the ids when a topic is merged upwards', () => {
    const after = mergeTopicUp(boxed(), 'y11', 'Y11-02')
    expect(dangling(after)).toEqual([])
    expect(after[0]?.topics[0]?.points?.map((p) => [p.id, p.parent ?? null])).toEqual([
      ['Y11-01.01', null],
      ['Y11-01.02', null],
      ['Y11-01.02.01', 'Y11-01.02'],
      ['Y11-01.02.02', 'Y11-01.02'],
      ['Y11-01.03', null],
      // The merged topic's heading becomes a point, and the run continues from
      // the last top-level ordinal rather than from the number of points.
      ['Y11-01.04', null],
      ['Y11-01.05', null],
      ['Y11-01.05.01', 'Y11-01.05'],
    ])
  })

  it('gives a promoted sub-item a top-level id, so no id describes a nesting it lost', () => {
    // Splitting between a parent and its sub-items strands them. They are
    // promoted, and renumbering them flat is what keeps `Y11-01.02.01` from
    // surviving as an id whose parent is not there any more.
    const after = splitTopic(boxed(), 'y11', 'Y11-01', 'Y11-01.02.01')
    expect(dangling(after)).toEqual([])
    const [kept, fresh] = after[0]?.topics ?? []
    expect(kept?.points?.map((p) => [p.id, p.parent ?? null])).toEqual([
      ['Y11-01.01', null],
      ['Y11-01.02', null],
    ])
    expect(fresh?.name).toBe('prevalence of blogs')
    expect(fresh?.points?.map((p) => [p.id, p.parent ?? null])).toEqual([
      ['Y11-03.01', null],
      ['Y11-03.02', null],
    ])
  })
})
