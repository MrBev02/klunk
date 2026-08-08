/**
 * TypeScript mirrors of the JSON formats in schemas/.
 *
 * The schemas are the contract; these are the reading of it the app compiles
 * against. When the two disagree the schema wins, because it is what validates
 * a teacher's file.
 *
 * Everything optional here is optional in the schema too. A file written by
 * hand, or by an AI a teacher pasted into, will be missing fields, and the app
 * has to survive that rather than assume its own generator produced it.
 */

export type QuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'short_answer'
  | 'extended_response'
  | 'table'
  | 'drawing'

export const QUESTION_TYPES: readonly QuestionType[] = [
  'multiple_choice',
  'true_false',
  'short_answer',
  'extended_response',
  'table',
  'drawing',
] as const

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple choice',
  true_false: 'True or false',
  short_answer: 'Short answer',
  extended_response: 'Extended response',
  table: 'Table',
  drawing: 'Drawing',
}

/* ------------------------------------------------------------------ syllabus */

export interface SyllabusPoint {
  id: string
  text: string
  ownedBy?: string
}

export interface SyllabusTopic {
  id: string
  name: string
  text?: string
  /** Section or focus area. Textiles and Industrial Technology both use these. */
  group?: string
  outcomes?: string[]
  points?: SyllabusPoint[]
  skills?: string[]
}

export interface SyllabusOutcome {
  code: string
  text: string
}

export interface SyllabusCourse {
  id: string
  name: string
  indicativeHours?: number
  outcomes?: SyllabusOutcome[]
  topics: SyllabusTopic[]
}

export interface Syllabus {
  formatVersion: string
  type: 'klunk_syllabus'
  id: string
  name: string
  framework: string
  authority?: string
  syllabusVersion?: string
  /**
   * What this syllabus calls the division a topic's `group` names. Recorded
   * from the document rather than derived from the framework, because NESA
   * itself uses two words for it and the IB uses a third.
   */
  groupLabel?: string
  source?: {
    title?: string
    url?: string
    retrieved?: string
    licence?: string
    redistributable?: boolean
  }
  courses: SyllabusCourse[]
}

/* -------------------------------------------------------------------- school */

/**
 * One place a student writes who they are.
 *
 * Two shapes, taken from the two real covers rather than invented: a label with
 * writing space under it, which is what an internal exam prints for `Name` and
 * `Class`, and a grid of single-character cells, which is what a student number
 * is printed as.
 */
export interface IdentificationField {
  label: string
  kind: 'write' | 'boxes'
  /** Cells, for `boxes`. Eight is what the 2025 Visual Arts trial prints. */
  boxes?: number
  /**
   * Repeat at the top of every page rather than on the cover alone.
   *
   * A paper is split into piles for marking, so every sheet has to say whose it
   * is. That is why the Visual Arts grid is page furniture and its General
   * Instructions are not.
   */
  onEveryPage?: boolean
}

/**
 * The branding shared by every paper in one folder.
 *
 * A logo is one file and a school is one school, so this is folder-level rather
 * than per profile: a teacher across four year groups has four profiles and
 * would otherwise attach the same logo four times.
 */
export interface School {
  formatVersion: string
  type: 'klunk_school'
  name: string
  /** Relative to this file, so a folder copied elsewhere carries its logo. */
  logoFile?: string
  logoWidthMm?: number
  identification?: IdentificationField[]
}

/* ------------------------------------------------------------------- profile */

export interface ProfileSection {
  id: string
  name: string
  marks: number
  suggestedMinutes?: number
  instructions?: string
  questionTypes?: QuestionType[]
  /** How many questions the section prints. In a choice section, how many are offered. */
  questionCount?: number
  minQuestions?: number
  maxQuestions?: number
  marksPerQuestion?: number
  /**
   * How many of this section's questions a student answers, where they are
   * alternatives.
   *
   * Absent means every one, which is what every section written before this
   * field meant and has to keep meaning. `Attempt ONE question from Questions
   * 4–9` is `chooseCount: 1` over six offered.
   *
   * Every alternative must be worth the same, or the marks a student can earn
   * would depend on which one they picked. `checkPaper` enforces it rather than
   * assuming it.
   */
  chooseCount?: number
}

export interface Profile {
  formatVersion: string
  type: 'klunk_profile'
  id: string
  name: string
  syllabusId?: string
  /**
   * Which course of that syllabus, where the paper is for one of them.
   *
   * A subject runs across several years and each year sets its own papers, so a
   * profile that names only the subject cannot tell a Year 9 question from a
   * Year 10 one. Absent means the whole model, which is what every profile
   * written before this field meant and must keep meaning.
   */
  courseId?: string
  paper: {
    totalMarks: number
    readingMinutes?: number
    workingMinutes?: number
    instructions?: string[]
    /**
     * How this kind of paper's cover differs from the folder's `school.json`.
     *
     * The two covers this was built from share a skeleton and differ in exactly
     * these two ways, so everything else stays in one place rather than being
     * repeated per profile.
     */
    cover?: {
      identification?: IdentificationField[]
      marksAwardedColumn?: boolean
    }
    sections: ProfileSection[]
  }
  questionTypes?: QuestionType[]
  marks?: {
    wholeNumberTotals?: boolean
    partMarkGranularity?: number
  }
  print?: {
    paperSize?: string
    marginsMm?: [number, number, number, number]
    answerLineSpacingMm?: number
    linesPerMark?: number
  }
}

/* ---------------------------------------------------------------------- bank */

export interface Stimulus {
  kind: 'image' | 'text'
  file?: string
  text?: string
  caption?: string
  alt?: string
  maxHeightMm?: number
}

export interface MarkCriterion {
  /** The mark, or the bottom of the band where `marksTo` is present. */
  marks: number
  /**
   * What a response in this band does.
   *
   * A NESA band is two or three separate points rather than one sentence, so a
   * newline separates them and the guide prints the list the guidelines print.
   */
  description: string
  /**
   * The top of a band, so `13–15` is 13 and 15.
   *
   * Every HSC extended response is banded and from 2018 a six-mark short answer
   * is too, so this is ordinary rather than exotic. Collapsing a band to one
   * number prints a marking guide that disagrees with the examination on the
   * page a marker actually reads.
   */
  marksTo?: number
}

export interface QuestionPart {
  label: string
  text: string
  marks: number
  answerLines?: number
  sampleAnswer?: string
  /** A marking guide marks part by part, under its own `Question 11 (a)` heading. */
  criteria?: MarkCriterion[]
}

/** Every wording a marker should accept in one cell of a table. */
export interface TableCell {
  answers?: string[]
}

export interface TableRow {
  label: string
  /**
   * One entry per answer column, in order.
   *
   * The first column holds the label, so a three-column table carries two
   * cells. A row used to hold one flat list of answers for the whole row, which
   * printed the same thing in every answer column once there were more than
   * two; the marking guide was wrong and nothing said so.
   */
  cells?: TableCell[]
  marks?: number
}

export interface QuestionConfig {
  /** multiple_choice */
  choices?: { text: string; feedback?: string }[]
  correctAnswer?: number | boolean
  shuffle?: boolean
  /** true_false */
  feedbackTrue?: string
  feedbackFalse?: string
  /** written */
  answerLines?: number
  parts?: QuestionPart[]
  /** drawing */
  subtype?: string
  instructions?: string
  spaceMm?: [number, number]
  grid?: boolean
  /** table */
  columns?: string[]
  rows?: TableRow[]
  blankCells?: boolean
}

export interface Question {
  id: string
  questionType: QuestionType
  questionText: string
  marks: number
  difficulty?: number
  syllabus?: {
    syllabusId?: string
    courseId?: string
    topicIds?: string[]
    pointIds?: string[]
  }
  outcomes?: string[]
  tags?: string[]
  stimulus?: Stimulus[]
  markingGuide?: {
    sampleAnswer?: string
    criteria?: MarkCriterion[]
    /**
     * What a marker should accept, one point per entry.
     *
     * Every question in a NESA marking guideline ends with an `Answers could
     * include:` list and it is the longest part of it. Apart from `notes`, which
     * is an aside about how to mark: this is the substance being marked against.
     */
    answersCouldInclude?: string[]
    notes?: string
  }
  source?: {
    origin?: 'authored' | 'extracted' | 'adapted'
    paper?: string
    year?: number
    questionNumber?: string
    copyright?: string
  }
  config?: QuestionConfig
}

export interface Bank {
  formatVersion: string
  type: 'klunk_bank'
  name?: string
  syllabusId?: string
  questions: Question[]
}

/* --------------------------------------------------------------------- paper */

export interface PaperRefObject {
  file: string
  questionId: string
  marksOverride?: number
  /**
   * A heading printed above this question, and above every one after it until
   * another group is named.
   *
   * On the paper rather than on the question, because the same question can sit
   * under a different heading on another paper. The Visual Arts trial heads its
   * alternatives `Practice`, `Conceptual Framework` and `Frames`.
   */
  group?: string
  note?: string
}

export type PaperRef = string | PaperRefObject

export interface PaperSection {
  profileSectionId?: string
  title?: string
  subtitle?: string
  instructions?: string
  refs: PaperRef[]
}

export interface Paper {
  formatVersion: string
  type: 'klunk_paper'
  id: string
  title: string
  subtitle?: string
  profileId?: string
  /**
   * The per-paper half of the cover.
   *
   * `name` and `logoFile` override the folder's `school.json` for this paper
   * alone; the rest is only ever a fact about this paper. `logoFile` is relative
   * to the paper file rather than to `school.json`, because that is where it
   * sits.
   */
  school?: {
    name?: string
    course?: string
    yearGroup?: string
    date?: string
    logoFile?: string
  }
  readingMinutes?: number
  workingMinutes?: number
  instructions?: string[]
  status?: 'draft' | 'final' | 'used'
  sections: PaperSection[]
  notes?: string
}

/* ------------------------------------------------------------------ manifest */

/**
 * What a document turned out to be.
 *
 * Deliberately the three things a teacher hands Klunk, and not a taxonomy of
 * documents. `marking guide` covers a NESA marking guide and a grid-of-answers
 * markscheme alike, because the two are one slot on screen.
 */
export type DocumentPurpose = 'syllabus' | 'paper' | 'marking guide'

/** One document Klunk has opened, and what came of it. */
export interface DocumentEntry {
  /** Folder-relative, as the scan reports it. */
  path: string
  /** What a reader made of it. Set only on success. */
  readAs?: DocumentPurpose
  /** The slots that have refused it, which is knowledge too. */
  refusedAs?: DocumentPurpose[]
  /** The bank or model its content ended up in, most recent only. */
  into?: string
  /** ISO date, local, of the last thing that happened to it. */
  when?: string
}

/**
 * A cache of what each document in the folder is, and nothing more.
 *
 * It holds no content, decides nothing, and every fact in it can be worked out
 * again by opening the document. Deleting it costs a stale sort order until it
 * refills. That is what licenses the loose handling everywhere else in this
 * file's neighbourhood: a manifest that will not parse is ignored rather than
 * reported, and an entry whose file has gone is dropped rather than mourned.
 */
export interface Manifest {
  formatVersion: string
  type: 'klunk_manifest'
  documents: DocumentEntry[]
}

/* ------------------------------------------------------------------ in-memory */

/** A loaded file, kept with its path so it can be written back to the same place. */
export interface Loaded<T> {
  path: string
  data: T
}

/** A question plus where it came from, which is what a paper ref needs. */
export interface QuestionRef {
  question: Question
  /** Path of the bank file, relative to the content folder. */
  file: string
  /**
   * Explicitly `| undefined` rather than plain optional: a bank need not be
   * named, and under exactOptionalPropertyTypes "absent" and "present but
   * undefined" are different things.
   */
  bankName?: string | undefined
  /**
   * Which syllabus this question belongs to: its own if it says, otherwise its
   * bank's default. Undefined when neither says, which is a real state — the
   * two untagged questions in the development bank are in it.
   *
   * Needed because a topic id is only unique inside its own model. Design and
   * Technology and Textiles both number their HSC topics `HSC-01` upwards, so
   * `topicIds.includes('HSC-01')` alone matches questions from either subject.
   */
  syllabusId?: string | undefined
}

/**
 * What to call a question in a list.
 *
 * Normally its own text. A question that is entirely its parts has none — the
 * 2016, 2018 and 2019 HSC papers each print one that way — and every list in the
 * app would otherwise show a blank row for it. Falling back to the parts is what
 * the paper itself does: the reader's first sight of the question is `(a)`.
 */
export function questionLabel(q: Question): string {
  const own = q.questionText.trim()
  if (own) return own
  const parts = (q.config?.parts ?? []).filter((p) => p.text.trim())
  if (parts.length === 0) return '(no question text)'
  return parts.map((p) => `(${p.label}) ${p.text.trim()}`).join('  ')
}

/** Everything a search over question text should look at, parts included. */
export function questionHaystack(q: Question): string {
  return [q.questionText, ...(q.config?.parts ?? []).map((p) => p.text)].join(' ').toLowerCase()
}

export function refKey(ref: PaperRef): string {
  return typeof ref === 'string' ? ref : `${ref.file}#${ref.questionId}`
}

export function parseRef(ref: PaperRef): { file: string; questionId: string } | null {
  if (typeof ref !== 'string') return { file: ref.file, questionId: ref.questionId }
  const hash = ref.lastIndexOf('#')
  if (hash < 1 || hash === ref.length - 1) return null
  return { file: ref.slice(0, hash), questionId: ref.slice(hash + 1) }
}
