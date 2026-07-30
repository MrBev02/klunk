/**
 * Reading back whatever the AI actually returned.
 *
 * The model on the other end of the prompt is not controlled, not consistent
 * between vendors, and not consistent with itself between two runs. It wraps
 * JSON in prose, fences it, answers with a single object when asked for a list,
 * writes `"correctAnswer": "B"` when told twice to write a number, and invents
 * syllabus ids that do not exist. None of that should reach a bank.
 *
 * So everything here does one of three things: repairs something unambiguous
 * and says so, drops something it cannot trust and says so, or refuses. What it
 * never does is accept quietly. A repair a teacher cannot see is worse than a
 * rejection, because the paper still prints.
 *
 * Klunk keeps hold of what Klunk knows. Ids are assigned here, never taken from
 * the model. The syllabus and course are stamped from the prompt that was sent.
 * The model may only choose among the topic ids, point ids and outcome codes
 * that prompt listed.
 */

import type { Check } from './paper'
import {
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  type MarkCriterion,
  type Question,
  type QuestionConfig,
  type QuestionPart,
  type QuestionType,
  type Stimulus,
  type TableRow,
} from './types'
import { suggestQuestionId, validateQuestion } from './validate'

/** Stamped on everything read back, because a bank should say what a model wrote. */
export const AI_TAG = 'ai-drafted'

/** A content point the prompt offered, and the topic it belongs to. */
export interface OfferedPoint {
  id: string
  topicId: string
}

export interface IngestContext {
  /** Where the questions will be written, which is what ids are named after. */
  bankPath: string
  /** Question ids anywhere in the folder, which a new id must not collide with. */
  inFolder: Set<string>
  /** Question ids in the bank being written to. */
  inBank: Set<string>
  syllabusId?: string | undefined
  courseId?: string | undefined
  /** Topic ids the prompt listed. */
  topicIds: string[]
  /** Content points the prompt listed. */
  points: OfferedPoint[]
  /** Outcome codes the prompt listed. Empty means do not check. */
  outcomes: string[]
  /** What the prompt asked for, used to fill a gap and to notice a departure. */
  expected: { questionType: QuestionType; marks: number }
}

export interface Draft {
  /**
   * The question as read, not yet cleaned.
   *
   * Cleaning happens on save, exactly as it does in the editor. Doing it here
   * would fill in a multiple choice question's missing `correctAnswer` with
   * zero and hide the error that says nobody chose one.
   */
  question: Question
  /** What Klunk changed or dropped, in the teacher's words. */
  repairs: string[]
  faults: Check[]
}

export interface Ingest {
  drafts: Draft[]
  /** Why nothing could be read at all. Present only when `drafts` is empty. */
  failure?: string
  /** Entries that were not questions, and why. */
  rejected: { at: number; why: string }[]
  /** What it took to find the JSON, when it took anything. */
  notes: string[]
}

/* --------------------------------------------------------------- the entry point */

export function ingestQuestions(pasted: string, ctx: IngestContext): Ingest {
  const notes: string[] = []
  const rejected: { at: number; why: string }[] = []

  const found = extractJson(pasted)
  if ('failure' in found) return { drafts: [], rejected, notes, failure: found.failure }
  if (found.note) notes.push(found.note)

  let value: unknown
  try {
    value = JSON.parse(found.json)
  } catch (err) {
    return {
      drafts: [],
      rejected,
      notes,
      failure:
        `That is not valid JSON: ${(err as Error).message}. Copy the whole reply, ` +
        'code block and all, and paste it again. If the model stopped halfway ' +
        'through, ask it for fewer questions.',
    }
  }

  const list = questionsFrom(value)
  if ('failure' in list) return { drafts: [], rejected, notes, failure: list.failure }
  if (list.note) notes.push(list.note)

  // Ids assigned here have to avoid each other as well as the folder, so the
  // set grows as the batch is read.
  const taken = new Set(ctx.inFolder)
  const drafts: Draft[] = []
  list.items.forEach((raw, at) => {
    const read = readQuestion(raw, ctx, taken)
    if ('why' in read) rejected.push({ at, why: read.why })
    else drafts.push(read)
  })

  if (drafts.length === 0 && rejected.length === 0) {
    return { drafts, rejected, notes, failure: 'That JSON parsed, but holds no questions.' }
  }
  return { drafts, rejected, notes }
}

/* -------------------------------------------------------------- finding the JSON */

/**
 * Pull the JSON out of whatever surrounds it.
 *
 * When nothing parses, the most likely candidate is returned anyway rather than
 * a failure, so the JSON error the caller reports names the real problem
 * instead of complaining about the word "Here".
 */
export function extractJson(pasted: string): { json: string; note?: string } | { failure: string } {
  const text = pasted.trim()
  if (!text) return { failure: 'Nothing pasted yet.' }

  if (parses(text)) return { json: text }

  const fenced = /```(?:json)?[ \t]*\r?\n([\s\S]*?)```/i.exec(text)?.[1]
  if (fenced !== undefined && parses(fenced)) {
    return { json: fenced, note: 'Read the JSON out of a code block and ignored the rest.' }
  }

  const carved = carve(text)
  if (carved !== null && parses(carved)) {
    return { json: carved, note: 'Ignored the writing around the JSON.' }
  }

  return { json: fenced ?? carved ?? text }
}

/** From the first bracket to the last matching one, prose either side discarded. */
function carve(text: string): string | null {
  const opens = [text.indexOf('['), text.indexOf('{')].filter((i) => i >= 0)
  if (opens.length === 0) return null
  const from = Math.min(...opens)
  const to = text.lastIndexOf(text[from] === '[' ? ']' : '}')
  return to > from ? text.slice(from, to + 1) : null
}

function parses(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    // The only recovery there is: try the next way of finding the JSON.
    return false
  }
}

function questionsFrom(
  value: unknown,
): { items: unknown[]; note?: string } | { failure: string } {
  if (Array.isArray(value)) return { items: value }

  if (typeof value !== 'object' || value === null) {
    return { failure: `Expected an array of questions, but that JSON is a ${typeof value}.` }
  }

  const obj = value as Record<string, unknown>
  if (Array.isArray(obj.questions)) {
    return {
      items: obj.questions,
      note:
        obj.type === 'klunk_bank'
          ? 'That was a whole bank file. Only the questions in it were read.'
          : 'Read the questions out of the object wrapped around them.',
    }
  }
  if (typeof obj.questionText === 'string') {
    return { items: [obj], note: 'That was a single question rather than a list.' }
  }

  const keys = Object.keys(obj)
  return {
    failure:
      'Expected an array of questions. That JSON is an object with ' +
      (keys.length === 0 ? 'no keys at all' : `the keys ${keys.slice(0, 8).join(', ')}`) +
      ', and none of them holds a list of questions.',
  }
}

/* ------------------------------------------------------------ one question */

/** Fields Klunk stores, plus the ones it will accept under another name. */
const KNOWN_FIELDS = new Set([
  'id',
  'questionType',
  'questionText',
  'marks',
  'difficulty',
  'syllabus',
  'outcomes',
  'tags',
  'stimulus',
  'markingGuide',
  'source',
  'config',
  // tolerated aliases, consumed below
  'question',
  'text',
  'stem',
  'type',
  'topicIds',
  'pointIds',
])

function readQuestion(
  raw: unknown,
  ctx: IngestContext,
  taken: Set<string>,
): Draft | { why: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { why: `expected a question object, got ${Array.isArray(raw) ? 'an array' : typeof raw}` }
  }
  const src = raw as Record<string, unknown>
  const repairs: string[] = []

  const questionText =
    asString(src.questionText) ?? asString(src.question) ?? asString(src.text) ?? asString(src.stem)
  if (questionText === undefined) {
    return { why: 'no question text, so there is nothing here to ask' }
  }
  if (asString(src.questionText) === undefined) {
    repairs.push('Took the question text from a field not called "questionText".')
  }

  const questionType = readType(src.questionType ?? src.type, ctx.expected.questionType, repairs)
  const marks = readMarks(src.marks, ctx.expected.marks, repairs)

  const id = suggestQuestionId(ctx.bankPath, questionType, taken)
  taken.add(id)
  const claimedId = asString(src.id)
  if (claimedId !== undefined) {
    repairs.push(`Replaced the id "${claimedId}" with ${id}, which nothing in your folder uses.`)
  }

  const question: Question = { id, questionType, questionText, marks }

  const difficulty = readDifficulty(src.difficulty, repairs)
  if (difficulty !== undefined) question.difficulty = difficulty

  const syllabus = readSyllabus(src, ctx, repairs)
  if (syllabus) question.syllabus = syllabus

  const outcomes = readOutcomes(src.outcomes, ctx, repairs)
  if (outcomes.length > 0) question.outcomes = outcomes

  question.tags = readTags(src.tags)

  const stimulus = readStimulus(src.stimulus, repairs)
  if (stimulus.length > 0) question.stimulus = stimulus

  const guide = readGuide(src.markingGuide, repairs)
  if (guide) question.markingGuide = guide

  if (src.source !== undefined) {
    repairs.push(
      'Dropped the source it gave. Where a question came from is yours to record, ' +
        'and a model cannot know it.',
    )
  }

  question.config = readConfig(questionType, src.config, repairs)

  const ignored = Object.keys(src).filter((k) => !KNOWN_FIELDS.has(k))
  if (ignored.length > 0) {
    repairs.push(`Ignored ${ignored.length === 1 ? 'a field' : 'fields'} Klunk does not store: ${ignored.join(', ')}.`)
  }

  const faults = validateQuestion(question, {
    inBank: ctx.inBank,
    inFolder: taken,
    // Its own id is already in `taken`, and matching itself is not a collision.
    originalId: id,
  })

  return { question, repairs, faults }
}

/* ----------------------------------------------------------------- the stem */

const TYPE_ALIASES: Record<string, QuestionType> = {
  mc: 'multiple_choice',
  mcq: 'multiple_choice',
  multiplechoice: 'multiple_choice',
  choice: 'multiple_choice',
  truefalse: 'true_false',
  tf: 'true_false',
  short: 'short_answer',
  shortanswer: 'short_answer',
  shortresponse: 'short_answer',
  extended: 'extended_response',
  extendedresponse: 'extended_response',
  extendedwriting: 'extended_response',
  longanswer: 'extended_response',
  longresponse: 'extended_response',
  essay: 'extended_response',
  sketch: 'drawing',
  diagram: 'drawing',
  matrix: 'table',
  grid: 'table',
}

function readType(value: unknown, fallback: QuestionType, repairs: string[]): QuestionType {
  const raw = asString(value)
  const named = QUESTION_TYPE_LABELS[fallback].toLowerCase()

  if (raw === undefined) {
    repairs.push(`No question type given, so it was read as ${named}.`)
    return fallback
  }

  const key = raw.toLowerCase().replace(/[\s\-/]+/g, '_').replace(/[^a-z_]/g, '')
  if ((QUESTION_TYPES as readonly string[]).includes(key)) return key as QuestionType

  const alias = TYPE_ALIASES[key.replace(/_/g, '')]
  if (alias) {
    repairs.push(`Read the type "${raw}" as ${QUESTION_TYPE_LABELS[alias].toLowerCase()}.`)
    return alias
  }

  repairs.push(`"${raw}" is not a question type Klunk has, so it was read as ${named}.`)
  return fallback
}

function readMarks(value: unknown, expected: number, repairs: string[]): number {
  const n = asNumber(value)
  if (n === undefined) {
    repairs.push(`No marks given, so it was set to the ${expected} the prompt asked for.`)
    return expected
  }
  if (typeof value === 'string') repairs.push(`Read the marks "${value}" as the number ${n}.`)
  if (n !== expected) {
    repairs.push(`This came back worth ${n} marks, not the ${expected} that were asked for.`)
  }
  return n
}

function readDifficulty(value: unknown, repairs: string[]): number | undefined {
  const n = asNumber(value)
  if (n === undefined) return undefined
  const rounded = Math.round(n)
  if (rounded < 1 || rounded > 5) {
    repairs.push(`Dropped a difficulty of ${n}; difficulty runs from 1 to 5.`)
    return undefined
  }
  return rounded
}

/* -------------------------------------------------------------- what it assesses */

function readSyllabus(
  src: Record<string, unknown>,
  ctx: IngestContext,
  repairs: string[],
): Question['syllabus'] | undefined {
  const nested =
    typeof src.syllabus === 'object' && src.syllabus !== null && !Array.isArray(src.syllabus)
      ? (src.syllabus as Record<string, unknown>)
      : {}

  const offeredPoints = new Map(ctx.points.map((p) => [p.id, p.topicId]))
  const offeredTopics = new Set(ctx.topicIds)

  const givenPoints = strings(nested.pointIds ?? src.pointIds)
  const givenTopics = strings(nested.topicIds ?? src.topicIds)

  const points = givenPoints.filter((id) => offeredPoints.has(id))
  reportDropped(givenPoints, points, 'content point id', repairs)

  const topics = new Set(givenTopics.filter((id) => offeredTopics.has(id)))
  reportDropped(givenTopics, [...topics], 'topic id', repairs)

  // A content point belongs to a topic, so naming the point tags the topic too.
  for (const id of points) {
    const topicId = offeredPoints.get(id)
    if (topicId) topics.add(topicId)
  }

  const onlyPoint = ctx.points.length === 1 ? ctx.points[0] : undefined
  if (points.length === 0 && onlyPoint) {
    points.push(onlyPoint.id)
    topics.add(onlyPoint.topicId)
    repairs.push('Tagged it against the only content point the prompt offered.')
  } else if (points.length === 0) {
    repairs.push(
      'Named no content point Klunk recognised, so it is untagged. It will show ' +
        'under "Only untagged" in the library until you fix that.',
    )
  }

  const onlyTopic = ctx.topicIds.length === 1 ? ctx.topicIds[0] : undefined
  if (topics.size === 0 && onlyTopic) topics.add(onlyTopic)

  const out: NonNullable<Question['syllabus']> = {}
  if (ctx.syllabusId) out.syllabusId = ctx.syllabusId
  if (ctx.courseId) out.courseId = ctx.courseId
  if (topics.size > 0) out.topicIds = [...topics]
  if (points.length > 0) out.pointIds = points
  return Object.keys(out).length > 0 ? out : undefined
}

function readOutcomes(value: unknown, ctx: IngestContext, repairs: string[]): string[] {
  const given = strings(value)
  if (ctx.outcomes.length === 0) return given
  const kept = given.filter((code) => ctx.outcomes.includes(code))
  reportDropped(given, kept, 'outcome code', repairs)
  return kept
}

function reportDropped(given: string[], kept: string[], what: string, repairs: string[]): void {
  const dropped = given.filter((id) => !kept.includes(id))
  if (dropped.length === 0) return
  const article = /^[aeiou]/i.test(what) ? 'an' : 'a'
  repairs.push(
    `Dropped ${dropped.length === 1 ? `${article} ${what}` : `${dropped.length} ${what}s`} the ` +
      `prompt did not offer: ${dropped.join(', ')}.`,
  )
}

function readTags(value: unknown): string[] {
  const tags = strings(value).map((t) => t.slice(0, 50))
  const out = [...new Set(tags)]
  if (!out.includes(AI_TAG)) out.push(AI_TAG)
  return out.slice(0, 20)
}

/* --------------------------------------------------------------------- extras */

function readStimulus(value: unknown, repairs: string[]): Stimulus[] {
  const out: Stimulus[] = []
  let images = 0

  for (const entry of asArray(value)) {
    if (typeof entry === 'string') {
      const text = asString(entry)
      if (text) out.push({ kind: 'text', text })
      continue
    }
    if (typeof entry !== 'object' || entry === null) continue

    const s = entry as Record<string, unknown>
    const text = asString(s.text)
    if (s.kind === 'image' || (text === undefined && asString(s.file) !== undefined)) {
      images += 1
      continue
    }
    if (text === undefined) continue

    const item: Stimulus = { kind: 'text', text }
    const caption = asString(s.caption)
    if (caption) item.caption = caption
    out.push(item)
  }

  if (images > 0) {
    repairs.push(
      `Dropped ${images === 1 ? 'an image stimulus' : `${images} image stimulus entries`}. ` +
        'Klunk cannot fetch a picture a model names; attach one in the editor instead.',
    )
  }
  return out
}

function readGuide(value: unknown, repairs: string[]): Question['markingGuide'] | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const g = value as Record<string, unknown>

  const out: NonNullable<Question['markingGuide']> = {}
  const sample = asString(g.sampleAnswer) ?? asString(g.answer) ?? asString(g.modelAnswer)
  if (sample) out.sampleAnswer = sample

  const criteria: MarkCriterion[] = []
  let malformed = 0
  for (const entry of asArray(g.criteria ?? g.bands)) {
    if (typeof entry !== 'object' || entry === null) {
      malformed += 1
      continue
    }
    const c = entry as Record<string, unknown>
    const marks = asNumber(c.marks ?? c.mark)
    const description = asString(c.description) ?? asString(c.text) ?? asString(c.criterion)
    if (marks === undefined || description === undefined) {
      malformed += 1
      continue
    }
    criteria.push({ marks, description })
  }
  if (malformed > 0) {
    repairs.push(
      `Dropped ${malformed === 1 ? 'a marking criterion' : `${malformed} marking criteria`} ` +
        'with no marks or no description.',
    )
  }
  if (criteria.length > 0) out.criteria = criteria

  const notes = asString(g.notes)
  if (notes) out.notes = notes

  return Object.keys(out).length > 0 ? out : undefined
}

/* --------------------------------------------------------------------- config */

const DRAWING_SUBTYPES = ['sketch', 'diagram', 'flowchart', 'orthographic', 'freehand']

/** Everything each type's config accepts, tolerated aliases included. */
const CONFIG_FIELDS: Record<QuestionType, string[]> = {
  multiple_choice: ['choices', 'options', 'answers', 'correctAnswer', 'correct', 'answer', 'shuffle'],
  true_false: ['correctAnswer', 'correct', 'answer', 'feedbackTrue', 'feedbackFalse'],
  short_answer: ['answerLines', 'lines', 'parts', 'subQuestions'],
  extended_response: ['answerLines', 'lines', 'parts', 'subQuestions'],
  table: ['columns', 'headings', 'headers', 'rows', 'blankCells'],
  drawing: ['subtype', 'kind', 'instructions', 'spaceMm', 'space', 'grid'],
}

function readConfig(type: QuestionType, value: unknown, repairs: string[]): QuestionConfig {
  const cfg =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}

  const ignored = Object.keys(cfg).filter((k) => !CONFIG_FIELDS[type].includes(k))
  if (ignored.length > 0) {
    repairs.push(
      `Ignored ${ignored.length === 1 ? 'a setting' : 'settings'} a ` +
        `${QUESTION_TYPE_LABELS[type].toLowerCase()} question does not have: ${ignored.join(', ')}.`,
    )
  }

  switch (type) {
    case 'multiple_choice':
      return readChoices(cfg, repairs)
    case 'true_false':
      return readTrueFalse(cfg, repairs)
    case 'table':
      return readTable(cfg, repairs)
    case 'drawing':
      return readDrawing(cfg, repairs)
    case 'short_answer':
    case 'extended_response':
      return readWritten(cfg, repairs)
  }
}

function readChoices(cfg: Record<string, unknown>, repairs: string[]): QuestionConfig {
  const choices: { text: string; feedback?: string }[] = []
  /** Set when the model marked the right option on the option itself. */
  let flagged: number | undefined

  asArray(cfg.choices ?? cfg.options ?? cfg.answers).forEach((entry) => {
    if (typeof entry === 'string') {
      const text = asString(entry)
      if (text) choices.push({ text })
      return
    }
    if (typeof entry !== 'object' || entry === null) return

    const c = entry as Record<string, unknown>
    const text = asString(c.text) ?? asString(c.option) ?? asString(c.label) ?? asString(c.answer)
    if (text === undefined) return

    const feedback = asString(c.feedback) ?? asString(c.why) ?? asString(c.explanation)
    if (c.correct === true || c.isCorrect === true) flagged = choices.length
    choices.push(feedback === undefined ? { text } : { text, feedback })
  })

  const out: QuestionConfig = { choices }
  const correct = readCorrectIndex(cfg.correctAnswer ?? cfg.correct ?? cfg.answer, choices, repairs)

  if (correct !== undefined) {
    out.correctAnswer = correct
  } else if (flagged !== undefined) {
    out.correctAnswer = flagged
    repairs.push(
      `Took the correct option from the "correct" flag on option ${letter(flagged)}, ` +
        'because no correctAnswer was given.',
    )
  }

  if (typeof cfg.shuffle === 'boolean') out.shuffle = cfg.shuffle
  return out
}

/**
 * Work out which option is the right one, whatever form the model said it in.
 *
 * A letter and the text of the option are both unambiguous and are converted. A
 * bare number is taken at face value, because that is what the prompt asked
 * for, but a one-based list would look identical, so it is called out.
 */
function readCorrectIndex(
  value: unknown,
  choices: { text: string }[],
  repairs: string[],
): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value

  const raw = asString(value)
  if (raw === undefined) return undefined

  if (/^[A-Za-z]$/.test(raw)) {
    const index = raw.toUpperCase().charCodeAt(0) - 65
    repairs.push(`Read the correct answer "${raw}" as ${name(index, choices)}.`)
    return index
  }

  const matched = choices.findIndex((c) => c.text.toLowerCase() === raw.toLowerCase())
  if (matched >= 0) {
    repairs.push(`Matched the correct answer to ${name(matched, choices)} by its wording.`)
    return matched
  }

  const n = asNumber(raw)
  if (n !== undefined && Number.isInteger(n)) {
    repairs.push(
      `Read the correct answer "${raw}" as ${name(n, choices)}, counting from zero as ` +
        'the prompt asked. Check that is the one it meant.',
    )
    return n
  }

  repairs.push(`Could not tell which option "${raw}" means, so no answer is marked.`)
  return undefined
}

function readTrueFalse(cfg: Record<string, unknown>, repairs: string[]): QuestionConfig {
  const out: QuestionConfig = {}
  const raw = cfg.correctAnswer ?? cfg.correct ?? cfg.answer

  if (typeof raw === 'boolean') {
    out.correctAnswer = raw
  } else {
    const word = asString(raw)?.toLowerCase()
    if (word === 'true' || word === 't' || word === 'yes' || raw === 1) {
      out.correctAnswer = true
      repairs.push(`Read the answer "${String(raw)}" as true.`)
    } else if (word === 'false' || word === 'f' || word === 'no' || raw === 0) {
      out.correctAnswer = false
      repairs.push(`Read the answer "${String(raw)}" as false.`)
    }
  }

  const yes = asString(cfg.feedbackTrue)
  const no = asString(cfg.feedbackFalse)
  if (yes) out.feedbackTrue = yes
  if (no) out.feedbackFalse = no
  return out
}

function readWritten(cfg: Record<string, unknown>, repairs: string[]): QuestionConfig {
  const out: QuestionConfig = {}

  const lines = asNumber(cfg.answerLines ?? cfg.lines)
  if (lines !== undefined && lines >= 0) out.answerLines = Math.round(lines)

  const parts: QuestionPart[] = []
  let unlabelled = 0
  asArray(cfg.parts ?? cfg.subQuestions).forEach((entry, i) => {
    if (typeof entry !== 'object' || entry === null) return
    const p = entry as Record<string, unknown>
    const text = asString(p.text) ?? asString(p.question) ?? asString(p.prompt)
    if (text === undefined) return

    let label = asString(p.label) ?? asString(p.part)
    if (label === undefined) {
      label = `(${String.fromCharCode(97 + i)})`
      unlabelled += 1
    }

    const part: QuestionPart = { label, text, marks: asNumber(p.marks) ?? 0 }
    const partLines = asNumber(p.answerLines)
    if (partLines !== undefined && partLines >= 0) part.answerLines = Math.round(partLines)
    const sample = asString(p.sampleAnswer) ?? asString(p.answer)
    if (sample) part.sampleAnswer = sample
    parts.push(part)
  })

  if (unlabelled > 0) {
    repairs.push(
      `Labelled ${unlabelled === 1 ? 'a part' : `${unlabelled} parts`} (a), (b), (c) in the ` +
        'order they came back, because none was given.',
    )
  }
  if (parts.length > 0) out.parts = parts
  return out
}

function readTable(cfg: Record<string, unknown>, repairs: string[]): QuestionConfig {
  const columns = strings(cfg.columns ?? cfg.headings ?? cfg.headers)

  const rows: TableRow[] = []
  for (const entry of asArray(cfg.rows)) {
    if (typeof entry === 'string') {
      const label = asString(entry)
      if (label) rows.push({ label })
      continue
    }
    if (typeof entry !== 'object' || entry === null) continue

    const r = entry as Record<string, unknown>
    const label = asString(r.label) ?? asString(r.prompt) ?? asString(r.item) ?? asString(r.cell)
    if (label === undefined) continue

    const row: TableRow = { label }
    const answers = strings(r.answers ?? r.answer)
    if (answers.length > 0) row.answers = answers
    const marks = asNumber(r.marks)
    if (marks !== undefined) row.marks = marks
    rows.push(row)
  }

  if (columns.length > 2) {
    repairs.push(
      `It returned ${columns.length} columns. Klunk prints the same expected answers ` +
        'in every answer column beyond the second, so check the marking guide.',
    )
  }

  return { columns, rows }
}

function readDrawing(cfg: Record<string, unknown>, repairs: string[]): QuestionConfig {
  const out: QuestionConfig = {}

  const subtype = asString(cfg.subtype ?? cfg.kind)?.toLowerCase()
  if (subtype !== undefined) {
    if (DRAWING_SUBTYPES.includes(subtype)) out.subtype = subtype
    else repairs.push(`Dropped the drawing kind "${subtype}", which Klunk cannot print.`)
  }

  const instructions = asString(cfg.instructions)
  if (instructions) out.instructions = instructions

  const space = readSpace(cfg.spaceMm ?? cfg.space)
  if (space) out.spaceMm = space
  if (cfg.grid === true) out.grid = true

  return out
}

function readSpace(value: unknown): [number, number] | undefined {
  if (Array.isArray(value) && value.length >= 2) {
    const w = asNumber(value[0])
    const h = asNumber(value[1])
    if (w !== undefined && h !== undefined) return [w, h]
    return undefined
  }
  if (typeof value === 'object' && value !== null) {
    const o = value as Record<string, unknown>
    const w = asNumber(o.width ?? o.widthMm)
    const h = asNumber(o.height ?? o.heightMm)
    if (w !== undefined && h !== undefined) return [w, h]
  }
  return undefined
}

/* ---------------------------------------------------------------- coercions */

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  // "3 marks" is a number with a word after it, not a number.
  const match = /^-?\d+(\.\d+)?/.exec(value.trim())
  if (!match) return undefined
  const n = Number(match[0])
  return Number.isFinite(n) ? n : undefined
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  return value === undefined || value === null ? [] : [value]
}

function strings(value: unknown): string[] {
  const out: string[] = []
  for (const entry of asArray(value)) {
    const text = asString(entry)
    if (text !== undefined) out.push(text)
  }
  return out
}

function letter(i: number): string {
  return String.fromCharCode(65 + i)
}

/** An option named the way a teacher checking the repair would look for it. */
function name(index: number, choices: { text: string }[]): string {
  const text = choices[index]?.text
  return text === undefined
    ? `option ${index + 1}, which is not one of the options given`
    : `option ${letter(index)}, "${text}"`
}
