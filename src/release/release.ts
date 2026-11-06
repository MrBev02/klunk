/**
 * Handing an exam's questions to students, as Mimir reads them (#150, #219).
 *
 * Pure: what the release screen offers, what holds a question back, and the
 * file it writes. `folder/storage.ts` does the writing.
 *
 * **The unit is one exam**, of two kinds. An **imported exam** is the bank
 * questions that share a source paper and year. One read in from From a past
 * paper may become a Klunk paper as well (#249), but that paper has no date
 * and is not offered here, so the teacher gives the date it was sat. A **paper built
 * in Klunk** has a date on its cover, but that is the day it is first sat, not
 * the day the last catch-up sits it, so the teacher still gives that date and
 * it may not be earlier. A built paper's release carries what it printed: its
 * marks, its numbers, and its options in their printed order.
 *
 * **Everything here fails closed.** A question that might be in an exam still
 * to be sat is held back, and so is every question of an exam with no date.
 * The cost of a wrong hold is a teacher typing a date; the cost of a wrong
 * release is an exam a student has already seen.
 */

import { joinPath, type ContentIndex } from '../folder/storage'
import { allQuestions } from '../folder/storage'
import { formatDate } from '../papers/cover'
import { printOrder, resolvePaper, type ShuffleVersion } from '../papers/paper'
import {
  parseRef,
  type LedgerExam,
  type Paper,
  type Question,
  type QuestionConfig,
  type QuestionRef,
  type ReleaseLedger,
  type Stimulus,
  type TextbookRef,
  type WorkingMethod,
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
    working?: WorkingMethod[]
    /** This release's, never the bank's: see `LedgerQuestion.markerComment`. */
    markerComment?: string
  }
  textbookRefs?: TextbookRef[]
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export interface ImportedExam {
  kind: 'imported'
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
    const exam = byKey.get(key) ?? {
      kind: 'imported' as const,
      key,
      paper,
      year,
      questions: [],
      bands: [],
    }
    exam.questions.push(ref)
    const band = ref.question.source?.section
    if (band && !exam.bands.includes(band)) exam.bands.push(band)
    byKey.set(key, exam)
  }
  return [...byKey.values()].sort((a, b) => b.year - a.year || a.paper.localeCompare(b.paper))
}

/* ---------------------------------------------------------- papers built here */

/**
 * How a paper built in Klunk printed a question, which is what a student
 * marking their own copy has in front of them.
 */
export interface AsPrinted {
  /** Continuous across sections, as the paper numbers it. */
  number: number
  /** The paper's `marksOverride` where it has one. */
  marks: number
  shuffle: ShuffleVersion
  /** Only where the teacher has said the paper's sections are bands. */
  band?: string | undefined
}

export interface BuiltPaper {
  kind: 'paper'
  /** `paper:` and the paper's id, which no `paper|year` key can be. */
  key: string
  paper: Paper
  /** The date on the paper's cover, where it is a whole date. */
  date: string | undefined
  /** In printed order. */
  questions: QuestionRef[]
  /** By question id, with the title of the section it printed in. */
  printed: Map<string, AsPrinted & { section: string }>
  /** Titles of the sections that hold a question, in printed order. */
  sections: string[]
  /** References that resolve to no question in the folder, so cannot be released. */
  missing: number
}

export type Exam = ImportedExam | BuiltPaper

export function paperKey(id: string): string {
  return `paper:${id}`
}

/**
 * Every paper in the folder, as the release screen offers it: newest first,
 * and those with no date last, since nothing of theirs can go yet.
 *
 * Resolved the way the paper prints, so a number, a mark or an option order
 * here is the one on the student's copy. A question the paper uses twice is
 * offered once, at its first printing.
 */
export function builtPapers(index: ContentIndex): BuiltPaper[] {
  // A paper read in from a past paper is already offered, as the imported exam
  // its questions make (#249). Offered here too, the same questions would go
  // out twice, under two dates, and a ledger that already released them under
  // `paper|year` would see a new exam.
  const built = index.papers.filter(({ data }) => !data.source)
  const out = built.map(({ data: paper }): BuiltPaper => {
    const profile = index.profiles.find((p) => p.data.id === paper.profileId)?.data
    const resolved = resolvePaper(index, paper, profile)
    const questions: QuestionRef[] = []
    const printed = new Map<string, AsPrinted & { section: string }>()
    const sections: string[] = []
    for (const section of resolved.sections) {
      for (const q of section.questions) {
        if (printed.has(q.question.id)) continue
        questions.push({ question: q.question, file: q.file, syllabusId: q.syllabusId })
        printed.set(q.question.id, {
          number: q.number,
          marks: q.marks,
          shuffle: q.shuffle,
          section: section.title,
        })
        if (!sections.includes(section.title)) sections.push(section.title)
      }
    }
    const date = paper.school?.date
    return {
      kind: 'paper',
      key: paperKey(paper.id),
      paper,
      date: date !== undefined && ISO_DATE.test(date) ? date : undefined,
      questions,
      printed,
      sections,
      missing: resolved.missing.length,
    }
  })
  return out.sort(
    (a, b) =>
      (b.date ?? '').localeCompare(a.date ?? '') || a.paper.title.localeCompare(b.paper.title),
  )
}

/** A question as the exam printed it, for a paper built here; nothing for an imported one. */
export function printedFor(
  exam: Exam,
  id: string,
  sectionsAreBands: boolean,
): AsPrinted | undefined {
  if (exam.kind !== 'paper') return undefined
  const p = exam.printed.get(id)
  if (!p) return undefined
  return {
    number: p.number,
    marks: p.marks,
    shuffle: p.shuffle,
    ...(sectionsAreBands ? { band: p.section } : {}),
  }
}

/**
 * The bands Mimir knows by colour, from its `src/bands.ts`. A faculty may name
 * its own and Mimir shows those too; this list only decides what to suggest.
 */
const MIMIR_BANDS = ['support', 'standard', 'advanced', 'extension', 'beyond']

/**
 * Whether to suggest that a paper's sections are bands.
 *
 * Only a suggestion, because it matters which way it goes wrong. Mimir shows a
 * student the questions of the one band they chose, and remembers the choice
 * across papers, so a paper whose `Section I` and `Section II` went as bands
 * would vanish for a student who chose `Standard` on another. So it is
 * suggested only when every section is named the way a band is.
 */
export function sectionsLookLikeBands(exam: BuiltPaper): boolean {
  const band = (title: string) =>
    MIMIR_BANDS.includes(
      title
        .trim()
        .toLowerCase()
        .replace(/\s+band$/, ''),
    )
  return exam.sections.length > 0 && exam.sections.every(band)
}

/* -------------------------------------------------------------------- embargo */

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
 * A paper built here must also have a date of its own, and the date sat cannot
 * be before it. And every other paper built in Klunk that uses the question
 * must have been sat as well. That second check is #150's rule for papers, "every paper, not the
 * first": a question picked again for this year's yearly stays held back until
 * this year's is sat, whenever the paper it was read from was.
 *
 * Papers are matched on question id alone, as `satQuestionIds` matches them,
 * for the same reason: a bank renamed or moved since should not quietly let a
 * question through. Two banks reusing an id gives a false hold, which is the
 * right way round.
 */
export function embargo(
  exam: Exam,
  dateSat: string | undefined,
  index: ContentIndex,
  today: string,
): Embargo {
  const out: Embargo = { questions: new Map() }
  const printedOn = exam.kind === 'paper' ? exam.date : undefined

  if (exam.kind === 'paper' && !printedOn) {
    out.exam = 'This paper has no date. Add one on Papers.'
  } else if (!dateSat || !ISO_DATE.test(dateSat)) {
    out.exam = 'Enter the date the last class sat this exam, catch-ups included.'
  } else if (printedOn && dateSat < printedOn) {
    out.exam = `Enter a date sat on or after ${formatDate(printedOn)}, the date on the paper.`
  } else if (dateSat >= today) {
    out.exam = `The date sat, ${formatDate(dateSat)}, is not over yet. Release it after then.`
  }

  const own = exam.kind === 'paper' ? exam.paper.id : undefined
  const ids = new Set(exam.questions.map((r) => r.question.id))
  for (const { data: paper } of index.papers) {
    // The paper being released is checked above, against the date sat.
    if (paper.id === own) continue
    // A paper read in from a past paper has been sat, and has no date to say
    // so: it is the exam being released, under its year (#249).
    if (paper.source) continue
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
 * notes, difficulty, tags, outcome codes, and `shuffle`, because Mimir never
 * shuffles and a student marking their own paper needs the printed order. An
 * imported question's choices are already in it; a paper built here puts them
 * in it, by `printed`.
 *
 * @param image Where a picture's bank-relative path goes in the release.
 * @param printed How a paper built here printed it. Its number replaces the
 *   question's source, because the paper the student sat is this one.
 */
export function studentCopy(
  question: Question,
  image: (path: string) => string = (p) => p,
  printed?: AsPrinted,
): StudentQuestion {
  const pictures = (list: Stimulus[] | undefined) =>
    list?.map((s) => (s.kind === 'image' && s.file ? { ...s, file: image(s.file) } : { ...s }))

  const out: StudentQuestion = {
    id: question.id,
    questionType: question.questionType,
    questionText: question.questionText,
    marks: printed?.marks ?? question.marks,
  }
  const topicIds = question.syllabus?.topicIds ?? []
  if (topicIds.length > 0) out.syllabus = { topicIds: [...topicIds] }
  // A built paper's band is its section, and only where the teacher says so: the
  // section of an exam the question was once read from is not this paper's.
  const band = printed ? printed.band : question.source?.section
  if (band) out.band = band
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
    if (guide.working?.length) mg.working = structuredClone(guide.working)
    if (Object.keys(mg).length > 0) out.markingGuide = mg
  }
  if (question.textbookRefs?.length) out.textbookRefs = question.textbookRefs.map((r) => ({ ...r }))

  const { paper, year, questionNumber, copyright } = question.source ?? {}
  const source = printed
    ? { questionNumber: String(printed.number), ...(copyright ? { copyright } : {}) }
    : {
        ...(paper ? { paper } : {}),
        ...(typeof year === 'number' ? { year } : {}),
        ...(questionNumber ? { questionNumber } : {}),
        ...(copyright ? { copyright } : {}),
      }
  if (Object.keys(source).length > 0) out.source = source

  if (question.config) {
    const config: QuestionConfig = structuredClone(question.config)
    if (printed) inPrintedOrder(question, config, printed.shuffle)
    delete config.shuffle
    // After the reorder, so each picture is still beside its own words. Missed
    // when options could first be pictures (#238): the release named files in
    // the bank that it never copied, and students saw no options at all.
    if (config.choices) {
      config.choices = config.choices.map((c) => {
        if (!c.image) return c
        const [picture] = pictures([c.image])!
        return { ...c, image: picture! }
      })
    }
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
 * Put a question's options in the order a paper printed them, and move its
 * answers with them, so the letters in Mimir are the letters on the paper.
 *
 * The same lists `shuffledChoices`, `shuffledResponses` and `shuffledMatching`
 * move, by the same `printOrder`: of a matching question, the lettered column.
 */
function inPrintedOrder(question: Question, config: QuestionConfig, shuffle: ShuffleVersion): void {
  const follow = (order: number[], at: number[]) =>
    at
      .map((i) => order.indexOf(i))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)

  if (
    question.questionType === 'multiple_choice' ||
    question.questionType === 'multiple_response'
  ) {
    const choices = config.choices
    if (!choices) return
    const order = printOrder(question, choices.length, shuffle)
    config.choices = order.map((i) => choices[i]).filter((c) => c !== undefined)
    if (typeof config.correctAnswer === 'number') {
      const at = order.indexOf(config.correctAnswer)
      if (at >= 0) config.correctAnswer = at
      else delete config.correctAnswer
    }
    if (config.correctAnswers) config.correctAnswers = follow(order, config.correctAnswers)
  } else if (question.questionType === 'matching') {
    const options = config.options
    if (!options) return
    const order = printOrder(question, options.length, shuffle)
    config.options = order.map((i) => options[i]).filter((o) => o !== undefined)
    if (config.items) {
      config.items = config.items.map((item) =>
        item.matches ? { ...item, matches: follow(order, item.matches) } : item,
      )
    }
  }
}

/**
 * A fingerprint of what students are given of a question.
 *
 * Only to notice an edit since release, never to prove anything, so a short
 * non-cryptographic hash is enough and keeps this synchronous. Taken over the
 * copy with its pictures at their bank paths, so where a release put them
 * does not count as a change.
 */
export function releaseHash(question: Question, printed?: AsPrinted): string {
  const text = canonical(studentCopy(question, undefined, printed))
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
  printed?: AsPrinted,
): ReleaseState {
  const entry = ledger.questions.find((q) => q.exam === exam && q.id === question.id)
  if (!entry) return 'new'
  return entry.hash === releaseHash(question, printed) ? 'released' : 'changed'
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
  /** A built paper's sections go to Mimir as bands. Ignored for an imported exam. */
  sectionsAreBands?: boolean
  /** The marker's comment on each question for this cohort, by question id (#224). */
  comments?: Map<string, string>
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
 * of the exam to every student's list. A built paper is named from its id,
 * which is also the release's id. Pictures go in an `images` folder beside
 * it with the paths rewritten: the student folder must never point into the
 * faculty folder, which students cannot open.
 */
export function planRelease(
  exam: Exam,
  chosen: QuestionRef[],
  details: ReleaseDetails,
  dateSat: string,
  index: ContentIndex,
): ReleasePlan {
  const built = exam.kind === 'paper'
  const examYear = built ? Number(dateSat.slice(0, 4)) : exam.year
  const dir = String(examYear)
  const name = slug(built ? exam.paper.id : exam.paper)
  const asBands = built && details.sectionsAreBands === true
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

  const questions = chosen.map((ref) => {
    const copy = studentCopy(
      ref.question,
      place(ref.file),
      printedFor(exam, ref.question.id, asBands),
    )
    const comment = details.comments?.get(ref.question.id)?.trim()
    if (comment) copy.markingGuide = { ...copy.markingGuide, markerComment: comment }
    return copy
  })
  const topics = topicsFor(chosen, index)
  const bands = (built ? exam.sections : exam.bands).filter((b) =>
    questions.some((q) => q.band === b),
  )

  const release: MimirRelease = {
    formatVersion: '1',
    type: 'mimir_release',
    id: built ? exam.paper.id : `${name}-${exam.year}`,
    subject: details.subject,
    title: details.title,
    yearLevel: details.yearLevel,
    examYear,
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
      ...(built ? { sectionsAreBands: asBands } : {}),
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
