/**
 * Handing an imported exam's questions to students, as Mimir reads them (#150).
 *
 * Pure: what the release screen offers, what holds a question back, and the
 * file it writes. `folder/storage.ts` does the writing.
 *
 * **The unit is one imported exam**, the bank questions that share a source
 * paper and year. An exam read in from From a past paper never becomes a Klunk
 * paper, so a paper's date and year group are not there to lean on; the
 * teacher gives the date it was sat instead, and Klunk refuses one still to
 * come. A paper built in Klunk is #219.
 *
 * **Everything here fails closed.** A question that might be in an exam still
 * to be sat is held back, and so is every question of an exam with no date.
 * The cost of a wrong hold is a teacher typing a date; the cost of a wrong
 * release is an exam a student has already seen.
 */

import { joinPath, type ContentIndex } from '../folder/storage'
import { allQuestions } from '../folder/storage'
import { formatDate } from '../papers/cover'
import {
  parseRef,
  type LedgerExam,
  type Question,
  type QuestionConfig,
  type QuestionRef,
  type ReleaseLedger,
  type Stimulus,
} from '../shared/types'

/* ------------------------------------------------------------ what Mimir reads */

/**
 * A question as students are given it. Mimir's `release.schema.json` is the
 * contract; this is the part of it Klunk has anything to put in.
 */
export interface StudentQuestion {
  id: string
  questionType: Question['questionType']
  questionText: string
  marks: number
  syllabus?: { topicIds: string[] }
  band?: string
  stimulus?: Stimulus[]
  markingGuide?: {
    sampleAnswer?: string
    sampleStimulus?: Stimulus[]
    criteria?: NonNullable<Question['markingGuide']>['criteria']
    answersCouldInclude?: string[]
  }
  source?: { paper?: string; year?: number; questionNumber?: string; copyright?: string }
  config?: QuestionConfig
}

export interface StudentTopic {
  id: string
  name: string
  area?: string
}

export interface MimirRelease {
  formatVersion: '1'
  type: 'mimir_release'
  id: string
  subject: string
  title: string
  yearLevel: number
  examYear: number
  releasedOn: string
  topics: StudentTopic[]
  bands?: string[]
  questions: StudentQuestion[]
}

/* -------------------------------------------------------------- imported exams */

export interface ImportedExam {
  /** `paper|year`, as the ledger records it. */
  key: string
  paper: string
  year: number
  /** In bank order, which is the order the paper was read in. */
  questions: QuestionRef[]
  /** The paper's bands in printed order, where it numbers each from 1 (#208). */
  bands: string[]
}

export function examKey(paper: string, year: number): string {
  return `${paper}|${year}`
}

/**
 * Every exam read into the folder's banks, newest first.
 *
 * Found by the source a question carries rather than by bank, because one exam
 * is one bank in practice but nothing makes it so, and a question moved to
 * another bank is still a question from that exam.
 */
export function importedExams(index: ContentIndex): ImportedExam[] {
  const byKey = new Map<string, ImportedExam>()
  for (const ref of allQuestions(index)) {
    const { paper, year } = ref.question.source ?? {}
    if (!paper || typeof year !== 'number') continue
    const key = examKey(paper, year)
    const exam = byKey.get(key) ?? { key, paper, year, questions: [], bands: [] }
    exam.questions.push(ref)
    const band = ref.question.source?.section
    if (band && !exam.bands.includes(band)) exam.bands.push(band)
    byKey.set(key, exam)
  }
  return [...byKey.values()].sort((a, b) => b.year - a.year || a.paper.localeCompare(b.paper))
}

/* -------------------------------------------------------------------- embargo */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export interface Embargo {
  /** Holds back every question in the exam. */
  exam?: string
  /** Holds back one question, by id. */
  questions: Map<string, string>
}

/**
 * What stops each question of an exam going to students today.
 *
 * Two checks. The exam must have a date sat that is behind us: strictly before
 * today, because an exam sat this afternoon is still being sat this morning.
 * And every paper built in Klunk that uses the question must have been sat as
 * well. That second check is #150's rule for papers, "every paper, not the
 * first": a question picked again for this year's yearly stays held back until
 * this year's is sat, whenever the paper it was read from was.
 *
 * Papers are matched on question id alone, as `satQuestionIds` matches them,
 * for the same reason: a bank renamed or moved since should not quietly let a
 * question through. Two banks reusing an id gives a false hold, which is the
 * right way round.
 */
export function embargo(
  exam: ImportedExam,
  dateSat: string | undefined,
  index: ContentIndex,
  today: string,
): Embargo {
  const out: Embargo = { questions: new Map() }

  if (!dateSat || !ISO_DATE.test(dateSat)) {
    out.exam = 'Enter the date the last class sat this exam, catch-ups included.'
  } else if (dateSat >= today) {
    out.exam = `The date sat, ${formatDate(dateSat)}, is not over yet. Release it after then.`
  }

  const ids = new Set(exam.questions.map((r) => r.question.id))
  for (const { data: paper } of index.papers) {
    const date = paper.school?.date
    const sat = date !== undefined && ISO_DATE.test(date) && date < today
    if (sat) continue
    for (const section of paper.sections) {
      for (const ref of section.refs) {
        const id = parseRef(ref)?.questionId
        if (!id || !ids.has(id) || out.questions.has(id)) continue
        out.questions.set(
          id,
          date && ISO_DATE.test(date)
            ? `Also on ${paper.title}, which is sat on ${formatDate(date)}.`
            : `Also on ${paper.title}, which has no date. Give it one on Papers.`,
        )
      }
    }
  }
  return out
}

/* --------------------------------------------------------- the student's copy */

/**
 * A bank question as students are given it.
 *
 * A copy of what students may see and nothing else. Left behind: the marker's
 * notes, difficulty, tags, outcome codes, and `shuffle`, because an imported
 * question's choices are already in the order the paper printed them and that
 * is the order a student marking their own paper needs.
 *
 * @param image Where a picture's bank-relative path goes in the release.
 */
export function studentCopy(
  question: Question,
  image: (path: string) => string = (p) => p,
): StudentQuestion {
  const pictures = (list: Stimulus[] | undefined) =>
    list?.map((s) => (s.kind === 'image' && s.file ? { ...s, file: image(s.file) } : { ...s }))

  const out: StudentQuestion = {
    id: question.id,
    questionType: question.questionType,
    questionText: question.questionText,
    marks: question.marks,
  }
  const topicIds = question.syllabus?.topicIds ?? []
  if (topicIds.length > 0) out.syllabus = { topicIds: [...topicIds] }
  if (question.source?.section) out.band = question.source.section
  const stimulus = pictures(question.stimulus)
  if (stimulus?.length) out.stimulus = stimulus

  const guide = question.markingGuide
  if (guide) {
    const mg: NonNullable<StudentQuestion['markingGuide']> = {}
    if (guide.sampleAnswer) mg.sampleAnswer = guide.sampleAnswer
    const sample = pictures(guide.sampleStimulus)
    if (sample?.length) mg.sampleStimulus = sample
    if (guide.criteria?.length) mg.criteria = guide.criteria.map((c) => ({ ...c }))
    if (guide.answersCouldInclude?.length) mg.answersCouldInclude = [...guide.answersCouldInclude]
    if (Object.keys(mg).length > 0) out.markingGuide = mg
  }

  const { paper, year, questionNumber, copyright } = question.source ?? {}
  const source = {
    ...(paper ? { paper } : {}),
    ...(typeof year === 'number' ? { year } : {}),
    ...(questionNumber ? { questionNumber } : {}),
    ...(copyright ? { copyright } : {}),
  }
  if (Object.keys(source).length > 0) out.source = source

  if (question.config) {
    const config: QuestionConfig = structuredClone(question.config)
    delete config.shuffle
    if (config.parts) {
      config.parts = config.parts.map((part) => {
        const next = { ...part }
        const own = pictures(part.stimulus)
        const model = pictures(part.sampleStimulus)
        if (own) next.stimulus = own
        if (model) next.sampleStimulus = model
        return next
      })
    }
    if (Object.keys(config).length > 0) out.config = config
  }
  return out
}

/**
 * A fingerprint of what students are given of a question.
 *
 * Only to notice an edit since release, never to prove anything, so a short
 * non-cryptographic hash is enough and keeps this synchronous. Taken over the
 * copy with its pictures at their bank paths, so where a release put them
 * does not count as a change.
 */
export function releaseHash(question: Question): string {
  const text = canonical(studentCopy(question))
  // FNV-1a, 32 bits, twice with different offsets for 64 bits of spread.
  let a = 0x811c9dc5
  let b = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c, 0x01000193)
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}

/** JSON with its keys sorted, so the same question always hashes the same. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)))
      : v,
  )
}

/* ------------------------------------------------------------ question status */

export type ReleaseState = 'new' | 'released' | 'changed'

/** Whether a question has gone to students, and whether it has changed since. */
export function releaseState(
  ledger: ReleaseLedger,
  exam: string,
  question: Question,
): ReleaseState {
  const entry = ledger.questions.find((q) => q.exam === exam && q.id === question.id)
  if (!entry) return 'new'
  return entry.hash === releaseHash(question) ? 'released' : 'changed'
}

/* ---------------------------------------------------------- what is written */

/** The year level a paper's name gives, where it names one Mimir can use. */
export function yearFromName(name: string): number | undefined {
  // The HSC is sat in Year 12 by definition, and its papers never say so.
  if (/\bHSC\b/.test(name)) return 12
  const m = name.match(/\b(?:year|yr|y)\s*(\d{1,2})\b/i)
  const year = m ? Number(m[1]) : NaN
  return year >= 7 && year <= 12 ? year : undefined
}

/**
 * The subject to offer for an exam not released before: the one last released
 * from this folder.
 *
 * A faculty folder is one subject's, so that is almost always right. Not the
 * syllabus model's name, which is what this first offered: that reads
 * "NESA mathematics k 10 2022 (S4, S5)", and students saw it.
 */
export function lastSubject(ledger: ReleaseLedger): string | undefined {
  const released = ledger.exams.filter((e) => e.subject && e.releasedOn)
  released.sort((a, b) => (b.releasedOn ?? '').localeCompare(a.releasedOn ?? ''))
  return released[0]?.subject
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'exam'
  )
}

export interface ReleaseDetails {
  title: string
  subject: string
  yearLevel: number
  releasedOn: string
}

export interface ReleasePlan {
  /** Relative to the student folder. */
  path: string
  release: MimirRelease
  /** Each picture to copy: from the faculty folder, to the student folder. */
  images: { from: string; to: string }[]
  ledger: LedgerExam
}

/**
 * The file one release writes, and the pictures that go beside it.
 *
 * Named from the exam, not from the title the teacher types, so a re-release
 * under a corrected title replaces the file rather than adding a second copy
 * of the exam to every student's list. Pictures go in an `images` folder beside
 * it with the paths rewritten: the student folder must never point into the
 * faculty folder, which students cannot open.
 */
export function planRelease(
  exam: ImportedExam,
  chosen: QuestionRef[],
  details: ReleaseDetails,
  dateSat: string,
  index: ContentIndex,
): ReleasePlan {
  const dir = String(exam.year)
  const name = slug(exam.paper)
  const images: { from: string; to: string }[] = []
  const taken = new Map<string, string>()

  const place = (bankFile: string) => (file: string) => {
    const from = joinPath(bankFile, file)
    const known = taken.get(from)
    if (known) return known
    const base = from.split('/').pop() ?? 'picture'
    const dot = base.lastIndexOf('.')
    const stem = dot > 0 ? base.slice(0, dot) : base
    const ext = dot > 0 ? base.slice(dot) : ''
    let pick = `images/${name}-${stem}${ext}`
    for (let n = 1; [...taken.values()].includes(pick); n += 1) {
      pick = `images/${name}-${stem}-${n}${ext}`
    }
    taken.set(from, pick)
    images.push({ from, to: `${dir}/${pick}` })
    return pick
  }

  const questions = chosen.map((ref) => studentCopy(ref.question, place(ref.file)))
  const topics = topicsFor(chosen, index)
  const bands = exam.bands.filter((b) => questions.some((q) => q.band === b))

  const release: MimirRelease = {
    formatVersion: '1',
    type: 'mimir_release',
    id: `${name}-${exam.year}`,
    subject: details.subject,
    title: details.title,
    yearLevel: details.yearLevel,
    examYear: exam.year,
    releasedOn: details.releasedOn,
    topics,
    ...(bands.length > 0 ? { bands } : {}),
    questions,
  }
  const path = `${dir}/${name}.json`
  return {
    path,
    release,
    images,
    ledger: {
      key: exam.key,
      dateSat,
      title: details.title,
      subject: details.subject,
      yearLevel: details.yearLevel,
      file: path,
      releasedOn: details.releasedOn,
    },
  }
}

/**
 * Every topic the questions use, by name, from the model each names.
 *
 * Ids are looked up in the question's own syllabus first, because a topic id is
 * only unique within one model. A topic no model in the folder defines is left
 * out: Mimir would show its id, which tells a student nothing.
 */
function topicsFor(chosen: QuestionRef[], index: ContentIndex): StudentTopic[] {
  const out = new Map<string, StudentTopic>()
  for (const ref of chosen) {
    const models = [
      ...index.syllabuses.filter((s) => s.data.id === ref.syllabusId),
      ...index.syllabuses.filter((s) => s.data.id !== ref.syllabusId),
    ]
    for (const id of ref.question.syllabus?.topicIds ?? []) {
      if (out.has(id)) continue
      for (const model of models) {
        const topic = model.data.courses.flatMap((c) => c.topics).find((t) => t.id === id)
        if (!topic) continue
        out.set(id, { id, name: topic.name, ...(topic.group ? { area: topic.group } : {}) })
        break
      }
    }
  }
  return [...out.values()]
}
