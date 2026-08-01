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
import { findQuestion } from './storage'
import type {
  Paper,
  PaperRef,
  Profile,
  ProfileSection,
  Question,
  QuestionType,
  TableRow,
} from './types'
import { parseRef } from './types'

export interface ResolvedQuestion {
  question: Question
  file: string
  /** Number printed on the paper. Continuous across sections, as in a real paper. */
  number: number
  marks: number
  note?: string | undefined
  /** Titles of other papers marked as already sat that also use this question. */
  usedIn?: string[] | undefined
}

export interface ResolvedSection {
  /** The profile section this fills, when it names one. */
  profileSection?: ProfileSection | undefined
  title: string
  subtitle?: string | undefined
  instructions?: string | undefined
  questions: ResolvedQuestion[]
  marks: number
}

export interface ResolvedPaper {
  paper: Paper
  profile?: Profile | undefined
  sections: ResolvedSection[]
  totalMarks: number
  /** References that pointed at nothing. Shown, never silently dropped. */
  missing: string[]
  /** References recovered from a moved or renamed bank, reported not hidden. */
  relocated: { from: string; to: string }[]
  /** Stimulus images by folder-relative path, so the renderer can print them. */
  images: Map<string, string>
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
        note: typeof ref === 'object' ? ref.note : undefined,
        usedIn: sat.get(found.question.id),
      })
    }

    return {
      profileSection,
      title: section.title ?? profileSection?.name ?? 'Section',
      subtitle: section.subtitle,
      instructions: section.instructions ?? profileSection?.instructions,
      questions,
      marks: questions.reduce((sum, q) => sum + q.marks, 0),
    }
  })

  return {
    paper,
    profile,
    sections,
    totalMarks: sections.reduce((sum, s) => sum + s.marks, 0),
    missing,
    relocated,
    images: index.images,
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
  for (const section of resolved.sections) {
    for (const q of section.questions) {
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

export function newPaper(profile: Profile, id: string, title: string): Paper {
  return {
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
