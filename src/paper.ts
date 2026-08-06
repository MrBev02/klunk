/**
 * Turning a paper manifest into something printable, and telling the teacher
 * when it does not add up.
 *
 * A paper stores references, never copies. Editing a question in the bank
 * updates every paper that uses it, and the same question cannot silently
 * diverge between two papers. The cost is that a reference can dangle, so
 * resolution has to report what it could not find rather than skipping it.
 */

import type {
  ContentIndex,
} from './storage'
import { knownIds, unresolvedTags, type ModelIds } from './modelcheck'
import { allQuestions, findQuestion, inCourse, inSyllabus } from './storage'
import type {
  Paper,
  PaperRef,
  Profile,
  ProfileSection,
  Question,
  QuestionRef,
  QuestionType,
  School,
  TableRow,
} from './types'
import { parseRef, refKey } from './types'

export interface ResolvedQuestion {
  question: Question
  file: string
  /** Number printed on the paper. Continuous across sections, as in a real paper. */
  number: number
  marks: number
  /** A heading printed above this question, where the paper starts a new group. */
  group?: string | undefined
  note?: string | undefined
  /** Titles of other papers marked as already sat that also use this question. */
  usedIn?: string[] | undefined
  /** The syllabus it belongs to, which may not be the one the paper assesses. */
  syllabusId?: string | undefined
}

export interface ResolvedSection {
  /** The profile section this fills, when it names one. */
  profileSection?: ProfileSection | undefined
  title: string
  subtitle?: string | undefined
  instructions?: string | undefined
  questions: ResolvedQuestion[]
  /**
   * What a student can earn here, which is not always what is printed here.
   *
   * In a section of alternatives it is the `chooseCount` best of them, because
   * six 25-mark questions of which one is answered is a 25-mark section. This is
   * the number the cover prints, the section heading prints, and the checker
   * holds against the profile, all of which are the student's view.
   */
  marks: number
  /**
   * Every question's marks added up, which in a choice section is larger.
   *
   * Kept apart rather than dropped because it is what a marking guide covers and
   * what a teacher building the section is looking at.
   */
  offeredMarks: number
  /** How many of these a student answers, where they are alternatives. */
  chooseCount?: number | undefined
}

export interface ResolvedPaper {
  paper: Paper
  profile?: Profile | undefined
  /**
   * The folder's branding, for the cover. Absent is ordinary: Klunk writes no
   * `school.json` until a teacher fills one in, and a paper prints without one.
   */
  school?: School | undefined
  /**
   * Where that `school.json` sits, because its `logoFile` is relative to it.
   *
   * Carried rather than assumed to be the folder root: `scanFolder` classifies
   * every file by its `type` and not by where it is, so a teacher who tidies
   * theirs into a subfolder must still get their logo.
   */
  schoolPath?: string | undefined
  /**
   * Where this paper's own file sits, because `school.logoFile` on a paper is
   * relative to it. A paper not yet saved has none and falls back to the path
   * `savePaper` would write it to.
   */
  paperPath?: string | undefined
  sections: ResolvedSection[]
  totalMarks: number
  /** References that pointed at nothing. Shown, never silently dropped. */
  missing: string[]
  /** References recovered from a moved or renamed bank, reported not hidden. */
  relocated: { from: string; to: string }[]
  /** Stimulus images by folder-relative path, so the renderer can print them. */
  images: Map<string, string>
  /**
   * Syllabus names by id, so a check can name a subject rather than an id.
   *
   * A bank may name a syllabus whose model is not in the folder — the model is
   * the teacher's to generate and Klunk ships none — so a lookup that misses is
   * ordinary and falls back to the id.
   */
  syllabusNames: Map<string, string>
  /**
   * What each syllabus model in the folder defines, so a tag that names nothing
   * can be reported rather than printed as though it were live (#44).
   *
   * Keyed the same way as `syllabusNames` and missing for the same reason: the
   * model is the teacher's to generate and a bank may name one they have not
   * made yet.
   */
  syllabusTags: Map<string, ModelIds>
  /**
   * Course names keyed `syllabusId::courseId`, so a check can say "Year 9"
   * rather than "y9".
   *
   * Keyed by both because a course id is only unique inside its own model: the
   * IB model holds `A1-1` under Standard level and Higher level both, and every
   * NESA model numbers a first topic from its own course id. Missing for the
   * same reason the two maps above are.
   */
  courseNames: Map<string, string>
}

export type Severity = 'error' | 'warning'

export interface Check {
  severity: Severity
  message: string
  /** Section title, when the check belongs to one. */
  where?: string | undefined
}

/* ----------------------------------------------------------------- resolving */

/**
 * Which questions are on a paper students have already sat, and on which paper.
 *
 * Matched on question id alone, not on `file#id`. What the warning is really
 * saying is "this cohort has seen this question", and that stays true whichever
 * bank file the sat paper happened to reference it through, including one since
 * renamed or moved. Matching on the path would go quiet exactly when the folder
 * has been reorganised, which is not when a safeguard should go quiet.
 *
 * The cost is a false positive if two banks reuse one id for different
 * questions. That is a warning a teacher reads and dismisses, not an error that
 * blocks a paper, so the trade runs the right way.
 */
function satQuestionIds(index: ContentIndex, exceptPaperId: string): Map<string, string[]> {
  const out = new Map<string, string[]>()

  for (const { data } of index.papers) {
    if (data.status !== 'used') continue
    // The paper being edited is in the folder too, once saved. Its own status is
    // reported separately; it must not warn about reusing its own questions.
    if (data.id === exceptPaperId) continue

    for (const section of data.sections) {
      for (const ref of section.refs) {
        const parsed = parseRef(ref)
        if (!parsed) continue
        const papers = out.get(parsed.questionId) ?? []
        if (!papers.includes(data.title)) papers.push(data.title)
        out.set(parsed.questionId, papers)
      }
    }
  }

  return out
}

/**
 * The most a student can earn from a section.
 *
 * Every question, unless the section is a set of alternatives, in which case the
 * best `chooseCount` of them. Taking the best rather than the first means the
 * number is right when the alternatives are equal, which every real examination
 * makes them, and is still defensible when a hand-edited paper has made them
 * unequal: a student would pick the one worth most. `checkPaper` reports that
 * inequality separately rather than this quietly papering over it.
 */
function earnableMarks(questions: ResolvedQuestion[], chooseCount?: number): number {
  const all = questions.map((q) => q.marks)
  if (chooseCount === undefined) return all.reduce((sum, m) => sum + m, 0)
  return [...all]
    .sort((a, b) => b - a)
    .slice(0, chooseCount)
    .reduce((sum, m) => sum + m, 0)
}

export function resolvePaper(
  index: ContentIndex,
  paper: Paper,
  profile?: Profile,
): ResolvedPaper {
  const missing: string[] = []
  const relocated: { from: string; to: string }[] = []
  const sat = satQuestionIds(index, paper.id)
  let number = 0

  const sections = paper.sections.map((section): ResolvedSection => {
    const profileSection = profile?.paper.sections.find(
      (s) => s.id === section.profileSectionId,
    )

    const questions: ResolvedQuestion[] = []
    for (const ref of section.refs) {
      const parsed = parseRef(ref)
      if (!parsed) {
        missing.push(String(ref))
        continue
      }
      const found = findQuestion(index, parsed.file, parsed.questionId)
      if (!found) {
        missing.push(`${parsed.file}#${parsed.questionId}`)
        continue
      }
      if (found.relocated) {
        relocated.push({ from: `${parsed.file}#${parsed.questionId}`, to: found.file })
      }
      number += 1
      const override = typeof ref === 'object' ? ref.marksOverride : undefined
      questions.push({
        question: found.question,
        file: found.file,
        number,
        marks: override ?? found.question.marks,
        group: typeof ref === 'object' ? ref.group : undefined,
        note: typeof ref === 'object' ? ref.note : undefined,
        usedIn: sat.get(found.question.id),
        syllabusId: found.syllabusId,
      })
    }

    const chooseCount = profileSection?.chooseCount
    return {
      profileSection,
      title: section.title ?? profileSection?.name ?? 'Section',
      subtitle: section.subtitle,
      instructions: section.instructions ?? profileSection?.instructions,
      questions,
      marks: earnableMarks(questions, chooseCount),
      offeredMarks: questions.reduce((sum, q) => sum + q.marks, 0),
      chooseCount,
    }
  })

  // The first, deliberately, rather than a merge. Two school files in one folder
  // is a fault the folder listing reports by name; picking one here and printing
  // it is better than printing no branding at all while the notice explains why.
  const school = index.schools[0]

  return {
    paper,
    profile,
    school: school?.data,
    schoolPath: school?.path,
    paperPath: index.papers.find((p) => p.data.id === paper.id)?.path,
    sections,
    totalMarks: sections.reduce((sum, s) => sum + s.marks, 0),
    missing,
    relocated,
    images: index.images,
    syllabusNames: new Map(index.syllabuses.map(({ data }) => [data.id, data.name])),
    syllabusTags: knownIds(index.syllabuses),
    courseNames: new Map(
      index.syllabuses.flatMap(({ data }) =>
        data.courses.map((c) => [`${data.id}::${c.id}`, c.name] as const),
      ),
    ),
  }
}

/* ------------------------------------------------------------------ checking */

/**
 * Check a paper against its profile.
 *
 * Errors are things that make the paper wrong to sit: the marks do not add up,
 * a section has the wrong number of questions, a question appears twice.
 * Warnings are things a teacher might mean: an untagged question, a recent
 * past-paper question that students may have seen.
 */
export function checkPaper(resolved: ResolvedPaper): Check[] {
  const checks: Check[] = []
  const { profile, paper } = resolved

  for (const ref of resolved.missing) {
    checks.push({
      severity: 'error',
      message:
        `Question not found: ${ref}. The bank may have been renamed, moved out ` +
        `of this folder, or the question deleted.`,
    })
  }

  // Recovered, so the paper still works, but the teacher should know the paper
  // and the folder no longer agree. Saving the paper writes the new path back.
  for (const move of resolved.relocated) {
    checks.push({
      severity: 'warning',
      message: `${move.from} was found at ${move.to} instead. Save the paper to record the new location.`,
    })
  }

  // The same question twice is always a mistake, profile or no profile.
  const seen = new Map<string, number>()
  for (const section of resolved.sections) {
    for (const q of section.questions) {
      const key = `${q.file}#${q.question.id}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
  }
  for (const [key, count] of seen) {
    if (count > 1) {
      checks.push({ severity: 'error', message: `${key} appears ${count} times` })
    }
  }

  if (!profile) {
    checks.push({
      severity: 'warning',
      message: 'No profile set, so marks and structure cannot be checked',
    })
    return sortChecks(checks)
  }

  if (resolved.totalMarks !== profile.paper.totalMarks) {
    checks.push({
      severity: 'error',
      message: `Paper totals ${resolved.totalMarks} marks, profile expects ${profile.paper.totalMarks}`,
    })
  }

  for (const section of resolved.sections) {
    const spec = section.profileSection
    if (!spec) continue
    const where = section.title
    const n = section.questions.length

    if (section.marks !== spec.marks) {
      checks.push({
        severity: 'error',
        where,
        message: `${section.marks} marks, profile expects ${spec.marks}`,
      })
    }

    // Alternatives have to be worth the same, or what a student can earn depends
    // on which one they pick. No examination does that, and a paper built by
    // hand is where it would come from. Reported against the section rather than
    // the odd question, because which one is wrong is the teacher's call.
    if (spec.chooseCount !== undefined && section.questions.length > 0) {
      const values = [...new Set(section.questions.map((q) => q.marks))].sort((a, b) => a - b)
      if (values.length > 1) {
        checks.push({
          severity: 'error',
          where,
          message:
            `A student answers ${spec.chooseCount} of these, so they all have to be worth the ` +
            `same. These are worth ${values.join(', ')}.`,
        })
      }
      if (section.questions.length < spec.chooseCount) {
        checks.push({
          severity: 'error',
          where,
          message:
            `A student answers ${spec.chooseCount} of these, and there ` +
            `${section.questions.length === 1 ? 'is' : 'are'} only ${section.questions.length}.`,
        })
      }
    }

    if (spec.questionCount !== undefined && n !== spec.questionCount) {
      checks.push({
        severity: 'error',
        where,
        message: `${n} question${n === 1 ? '' : 's'}, profile expects exactly ${spec.questionCount}`,
      })
    }
    if (spec.minQuestions !== undefined && n < spec.minQuestions) {
      checks.push({
        severity: 'error',
        where,
        message: `${n} question${n === 1 ? '' : 's'}, profile expects at least ${spec.minQuestions}`,
      })
    }
    if (spec.maxQuestions !== undefined && n > spec.maxQuestions) {
      checks.push({
        severity: 'error',
        where,
        message: `${n} questions, profile allows at most ${spec.maxQuestions}`,
      })
    }

    for (const q of section.questions) {
      if (spec.marksPerQuestion !== undefined && q.marks !== spec.marksPerQuestion) {
        checks.push({
          severity: 'error',
          where,
          message: `Question ${q.number} is ${q.marks} marks, this section is ${spec.marksPerQuestion} per question`,
        })
      }
      if (spec.questionTypes?.length && !spec.questionTypes.includes(q.question.questionType)) {
        checks.push({
          severity: 'error',
          where,
          message: `Question ${q.number} is ${q.question.questionType}, not allowed in this section`,
        })
      }
    }
  }

  const wholeNumbers = profile.marks?.wholeNumberTotals ?? true
  if (wholeNumbers) {
    for (const section of resolved.sections) {
      for (const q of section.questions) {
        if (!Number.isInteger(q.marks)) {
          checks.push({
            severity: 'error',
            where: section.title,
            message: `Question ${q.number} is worth ${q.marks}, which is not a whole number`,
          })
        }
      }
    }
  }

  // Warnings: recoverable, but a teacher would want to know.
  const subject = (id: string) => resolved.syllabusNames.get(id) ?? id
  for (const section of resolved.sections) {
    for (const q of section.questions) {
      // A folder is meant to hold one subject, and nothing enforces it. The
      // builder no longer offers another subject's questions, but that cannot
      // help a paper built before it stopped, or one whose file was edited by
      // hand, and this is the last point before printing where anything looks.
      // A warning rather than an error: a teacher who means it — two editions
      // of one syllabus live at once during a transition — must still be able
      // to print.
      if (profile.syllabusId && q.syllabusId && q.syllabusId !== profile.syllabusId) {
        checks.push({
          severity: 'warning',
          where: section.title,
          message:
            `Question ${q.number} belongs to ${subject(q.syllabusId)}, ` +
            `not ${subject(profile.syllabusId)}`,
        })
      }

      // The same check one level down, and the ordinary case rather than the
      // exotic one: a subject runs across several years, so a Year 8 question
      // reaching a Year 9 paper is the mistake that actually happens. Only
      // where the two agree on the subject, since a question from another
      // subject is already reported above and saying it twice helps nobody.
      const asked = q.question.syllabus?.courseId
      if (
        profile.courseId &&
        asked &&
        asked !== profile.courseId &&
        (!q.syllabusId || !profile.syllabusId || q.syllabusId === profile.syllabusId)
      ) {
        const named = (id: string) =>
          resolved.courseNames.get(`${profile.syllabusId ?? q.syllabusId ?? ''}::${id}`) ?? id
        checks.push({
          severity: 'warning',
          where: section.title,
          message:
            `Question ${q.number} is for ${named(asked)}, ` +
            `and this paper is for ${named(profile.courseId)}`,
        })
      }

      const src = q.question.source
      if (src?.origin === 'extracted' && src.year) {
        checks.push({
          severity: 'warning',
          where: section.title,
          message: `Question ${q.number} is taken from the ${src.year} ${src.paper ?? 'paper'}; students may have seen it`,
        })
      }
      // The same risk as the line above, but from this faculty's own papers
      // rather than a public one, which is the version that actually happens.
      if (q.usedIn?.length) {
        const list = q.usedIn.map((title) => `"${title}"`).join(', ')
        checks.push({
          severity: 'warning',
          where: section.title,
          message: `Question ${q.number} is also on ${list}, which students have already sat`,
        })
      }
      if (!q.question.syllabus?.topicIds?.length && !q.question.syllabus?.pointIds?.length) {
        checks.push({
          severity: 'warning',
          where: section.title,
          message: `Question ${q.number} is not tagged to the syllabus, so it will not show in coverage`,
        })
      }
      // A tag that names nothing is worse than no tag: the question looks
      // covered and is not. It happens when a syllabus model is re-read over one
      // that had been corrected by hand, which takes ids away (#44).
      const dead = unresolvedTags(
        { question: q.question, file: q.file, syllabusId: q.syllabusId },
        resolved.syllabusTags,
      )
      if (dead.length > 0) {
        const subject = resolved.syllabusNames.get(q.syllabusId ?? '') ?? q.syllabusId
        checks.push({
          severity: 'warning',
          where: section.title,
          message: `Question ${q.number} is tagged ${dead.join(', ')}, which is not in ${subject} any more, so it will not show in coverage`,
        })
      }
    }
  }

  if (paper.status === 'used') {
    checks.push({
      severity: 'warning',
      message:
        'This paper is marked as already sat, so Klunk will warn any other paper ' +
        'that reuses its questions',
    })
  }

  return sortChecks(checks)
}

function sortChecks(checks: Check[]): Check[] {
  return [...checks].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1,
  )
}

/* ------------------------------------------------------------------ ordering */

/**
 * Deterministic hash. Same input, same number, in every browser and every run.
 *
 * `Math.random()` would reshuffle options on every render, so the letter that
 * is correct would differ between the student paper and the marking guide
 * printed a minute later. FNV-1a is not cryptographic and does not need to be:
 * it needs to be stable and cheap.
 */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

export interface ShuffledChoices {
  choices: { text: string; feedback?: string | undefined }[]
  /** Index of the correct option after shuffling. */
  correctIndex: number
  letters: string[]
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/**
 * Order a question's options the same way every time it is rendered.
 *
 * Seeded by the question's own id, so adding a question to a paper does not
 * renumber the letters of any other question.
 */
export function shuffledChoices(question: Question, seed = ''): ShuffledChoices {
  const choices = question.config?.choices ?? []
  const correct = typeof question.config?.correctAnswer === 'number'
    ? question.config.correctAnswer
    : 0

  const order = choices.map((_, i) => i)
  if (question.config?.shuffle !== false) {
    // Fisher-Yates driven by the seeded hash, so the permutation is a pure
    // function of the question id.
    let state = hash(`${question.id}${seed}`)
    for (let i = order.length - 1; i > 0; i -= 1) {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0
      const j = state % (i + 1)
      const a = order[i]
      const b = order[j]
      if (a !== undefined && b !== undefined) {
        order[i] = b
        order[j] = a
      }
    }
  }

  return {
    choices: order.map((i) => choices[i]).filter((c): c is { text: string; feedback?: string } => !!c),
    correctIndex: order.indexOf(correct),
    letters: LETTERS,
  }
}

/* ------------------------------------------------------------------ creating */

export function newPaper(
  profile: Profile,
  id: string,
  title: string,
  /**
   * What the profile's syllabus and course are called, for the cover.
   *
   * Names rather than ids, because these are printed. Passed in rather than
   * looked up because this function takes a profile and no folder, which is what
   * makes it testable; the builder has the models and resolves them there.
   */
  about?: { subject?: string | undefined; course?: string | undefined },
): Paper {
  const paper: Paper = {
    formatVersion: '1',
    type: 'klunk_paper',
    id,
    title,
    profileId: profile.id,
    readingMinutes: profile.paper.readingMinutes ?? 0,
    workingMinutes: profile.paper.workingMinutes ?? 0,
    instructions: profile.paper.instructions ?? [],
    status: 'draft',
    sections: profile.paper.sections.map((s) => ({
      profileSectionId: s.id,
      refs: [],
    })),
  }

  // The cover prints `course · yearGroup · date`, and until now nothing in the
  // app wrote any of it: the fields existed and only a hand-edited file ever
  // filled them. The profile already knows both, so a paper for Year 9 Science
  // can say so on the page without anybody typing it twice.
  //
  // Written field by field, and only where there is something to write. An
  // empty `school: {}` would be a difference against a paper on disk that has
  // none, and `paperIsDirty` would report unsaved changes nobody made.
  const school: NonNullable<Paper['school']> = {}
  const subject = about?.subject?.trim()
  const course = about?.course?.trim()
  if (subject) school.course = subject
  if (course) school.yearGroup = course
  if (subject || course) paper.school = school

  return paper
}

/* ------------------------------------------------------- saved or not saved */

/**
 * JSON with object keys in a fixed order, so two objects that hold the same
 * thing produce the same string.
 *
 * A plain `JSON.stringify` compare would work for a paper Klunk itself wrote
 * and read back, because the same code writes the keys in the same order every
 * time. It would not survive a teacher hand-editing `papers/x.json` and moving
 * a key, which would then read as unsaved changes for ever with nothing a teacher
 * could do to clear it. An indicator that cries wolf is worse than no indicator,
 * since the whole point of this one is that it can be trusted before a discard.
 *
 * Array order is preserved: the order of sections, and of the questions in
 * them, is the paper.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    // `undefined` is what an absent optional field looks like in memory and it
    // is not written to the file at all, so it must not count as a difference.
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}

/**
 * Whether the paper being edited differs from the one in the folder.
 *
 * A paper is edited in memory and only written on Save, and nothing said so: a
 * teacher could set the status to "already sat" — which is what makes Klunk warn
 * other papers off its questions — navigate away, and lose the safeguard while
 * the screen still showed it set.
 *
 * A paper that has never been saved counts as changed, because everything about
 * it is unwritten.
 */
export function paperIsDirty(index: ContentIndex, paper: Paper): boolean {
  const onDisk = index.papers.find((p) => p.data.id === paper.id)?.data
  return onDisk === undefined || canonical(onDisk) !== canonical(paper)
}

/** Whether this paper exists in the folder at all, which changes what a discard costs. */
export function paperIsSaved(index: ContentIndex, paper: Paper): boolean {
  return index.papers.some((p) => p.data.id === paper.id)
}

export function addRef(paper: Paper, sectionIndex: number, ref: PaperRef): Paper {
  return {
    ...paper,
    sections: paper.sections.map((s, i) =>
      i === sectionIndex ? { ...s, refs: [...s.refs, ref] } : s,
    ),
  }
}

export function removeRef(paper: Paper, sectionIndex: number, refIndex: number): Paper {
  return {
    ...paper,
    sections: paper.sections.map((s, i) =>
      i === sectionIndex ? { ...s, refs: s.refs.filter((_, j) => j !== refIndex) } : s,
    ),
  }
}

export function moveRef(
  paper: Paper,
  sectionIndex: number,
  refIndex: number,
  delta: number,
): Paper {
  const section = paper.sections[sectionIndex]
  if (!section) return paper
  const target = refIndex + delta
  if (target < 0 || target >= section.refs.length) return paper

  const refs = [...section.refs]
  const a = refs[refIndex]
  const b = refs[target]
  if (a === undefined || b === undefined) return paper
  refs[refIndex] = b
  refs[target] = a

  return {
    ...paper,
    sections: paper.sections.map((s, i) => (i === sectionIndex ? { ...s, refs } : s)),
  }
}

/**
 * What a marker should accept in one answer cell of a table row.
 *
 * `at` counts answer columns, not table columns: the first table column holds
 * the row label, so column 2 is `at` 0. Keeping that offset in one place is the
 * point of this function — every caller that worked it out for itself printed
 * the row's whole answer list into every column instead.
 */
export function rowAnswers(row: TableRow, at: number): string[] {
  return row.cells?.[at]?.answers ?? []
}

/** How many ruled lines a question gets when it does not say. */
export function answerLinesFor(
  question: Question,
  marks: number,
  profile?: Profile,
): number {
  if (question.config?.answerLines !== undefined) return question.config.answerLines
  if (question.questionType === 'multiple_choice' || question.questionType === 'true_false') {
    return 0
  }
  if (question.questionType === 'drawing' || question.questionType === 'table') return 0
  const perMark = profile?.print?.linesPerMark ?? 2
  return Math.max(2, Math.round(marks * perMark))
}

export function isTypeAllowed(
  type: QuestionType,
  section: ProfileSection | undefined,
): boolean {
  if (!section?.questionTypes?.length) return true
  return section.questionTypes.includes(type)
}

/**
 * The questions that may be offered into one section of a paper.
 *
 * Four rules: the question belongs to the syllabus this paper assesses, and to
 * the course of it the paper is for, its type is allowed in the section, and it
 * is not already somewhere on the paper.
 *
 * The syllabus rule is the reason this is a function rather than a filter in
 * the builder. One folder per subject is the intention and nothing enforces it,
 * so a folder holding Design and Technology and Textiles and Design — which
 * `../klunk-content` does — offered both in one list, indistinguishable, and
 * Klunk would print whichever was picked. `inSyllabus` decides it, so a
 * question naming no syllabus still shows, for the reason set out there.
 *
 * The course rule is the same fault one level down, and it is the ordinary case
 * rather than the exotic one: a subject runs across several years, every year
 * sets its own papers, and a profile naming only the subject builds the Year 9
 * mid-year from a list holding Years 7 to 10 together. `inCourse` decides it on
 * the same terms.
 *
 * Either absent means the profile does not say and nothing can be decided, so
 * everything is offered and the builder says why on screen.
 */
export function pickableQuestions(
  index: ContentIndex,
  paper: Paper,
  section: ProfileSection | undefined,
  syllabusId: string | undefined,
  courseId?: string | undefined,
): QuestionRef[] {
  const used = new Set(paper.sections.flatMap((s) => s.refs.map(refKey)))
  return allQuestions(index).filter(
    (ref) =>
      (syllabusId === undefined || inSyllabus(ref, syllabusId)) &&
      (courseId === undefined || inCourse(ref, courseId)) &&
      isTypeAllowed(ref.question.questionType, section) &&
      !used.has(`${ref.file}#${ref.question.id}`),
  )
}
