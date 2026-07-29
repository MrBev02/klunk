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
  source?: {
    title?: string
    url?: string
    retrieved?: string
    licence?: string
    redistributable?: boolean
  }
  courses: SyllabusCourse[]
}

/* ------------------------------------------------------------------- profile */

export interface ProfileSection {
  id: string
  name: string
  marks: number
  suggestedMinutes?: number
  instructions?: string
  questionTypes?: QuestionType[]
  questionCount?: number
  minQuestions?: number
  maxQuestions?: number
  marksPerQuestion?: number
}

export interface Profile {
  formatVersion: string
  type: 'klunk_profile'
  id: string
  name: string
  syllabusId?: string
  paper: {
    totalMarks: number
    readingMinutes?: number
    workingMinutes?: number
    instructions?: string[]
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
  marks: number
  description: string
}

export interface QuestionPart {
  label: string
  text: string
  marks: number
  answerLines?: number
  sampleAnswer?: string
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
  rows?: { label: string; answers?: string[]; marks?: number }[]
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
  school?: {
    name?: string
    course?: string
    yearGroup?: string
    assessmentName?: string
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
