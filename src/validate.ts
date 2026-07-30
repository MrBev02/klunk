/**
 * Checking a question before it is written to a bank, and tidying it on the way.
 *
 * `schemas/bank.schema.json` is the contract, but nothing in the browser reads
 * it: a JSON Schema validator is a dependency, and the app deliberately has one
 * dependency. So the rules are restated here, in the order the schema states
 * them, and the tests are what keep the two honest. When they disagree the
 * schema wins, because it is what validates a teacher's file.
 *
 * A few rules go beyond the schema, and are marked where they appear. They fall
 * into two groups: things JSON Schema cannot express (an id must be unique
 * across the folder, part marks must sum to the question total) and things it
 * permits but no teacher meant (a blank column heading). Both block a save,
 * because writing them produces a paper that prints wrong.
 */

import type { Check } from './paper'
import type {
  MarkCriterion,
  Question,
  QuestionConfig,
  QuestionPart,
  QuestionType,
  Stimulus,
  TableRow,
} from './types'

/** What the folder already contains, which is what uniqueness is judged against. */
export interface IdContext {
  /** Question ids already in the bank being written to. */
  inBank: Set<string>
  /** Question ids anywhere in the folder, the target bank included. */
  inFolder: Set<string>
  /** The id of the question being edited, which is allowed to match itself. */
  originalId?: string | undefined
}

export function emptyIdContext(): IdContext {
  return { inBank: new Set(), inFolder: new Set() }
}

/**
 * Question ids travel inside paper references as `path/to/bank.json#id`, so a
 * `#` in an id makes the reference unparseable and a `/` makes it look like a
 * path. The rest is kept conservative because ids also end up in filenames,
 * URLs and search boxes.
 */
const ID_SHAPE = /^[A-Za-z0-9._-]+$/

const DRAWING_SUBTYPES = ['sketch', 'diagram', 'flowchart', 'orthographic', 'freehand']

/** Roughly the printable area of an A4 page once margins are taken out. */
const A4_PRINTABLE_MM = { width: 180, height: 240 }

export function validateQuestion(question: Question, ids: IdContext): Check[] {
  const out: Check[] = []
  const err = (message: string, where?: string) =>
    out.push({ severity: 'error', message, where })
  const warn = (message: string, where?: string) =>
    out.push({ severity: 'warning', message, where })

  /* ------------------------------------------------------------------- id */

  const id = question.id.trim()
  if (!id) {
    err('Every question needs an id. Papers refer to questions by it.', 'Id')
  } else if (!ID_SHAPE.test(id)) {
    err(
      'An id can only hold letters, numbers, dots, dashes and underscores. ' +
        'Papers store a reference as bank.json#id, and anything else breaks it.',
      'Id',
    )
  } else if (id !== ids.originalId && ids.inBank.has(id)) {
    err('This bank already has a question with that id. Saving would replace it.', 'Id')
  } else if (id !== ids.originalId && ids.inFolder.has(id)) {
    // Beyond the schema: the schema cannot see the rest of the folder. Not fatal,
    // because papers normally reference the bank path as well, but the last-resort
    // recovery for a moved bank is a folder-wide unique id, and this removes it.
    warn(
      'Another bank in this folder already uses that id. A paper that loses its ' +
        'bank path can no longer recover this question from the id alone.',
      'Id',
    )
  }

  /* --------------------------------------------------------------- the stem */

  if (!question.questionText.trim()) {
    err('A question needs something to ask.', 'Question')
  }

  if (!Number.isFinite(question.marks) || question.marks <= 0) {
    err('Marks must be a number above zero.', 'Marks')
  } else if (!Number.isInteger(question.marks)) {
    // The schema allows a half mark; most profiles do not, and the paper checker
    // will reject it later, which is a worse place to find out.
    warn(`${question.marks} is not a whole number, which most papers require.`, 'Marks')
  }

  if (question.difficulty !== undefined) {
    const d = question.difficulty
    if (!Number.isInteger(d) || d < 1 || d > 5) {
      err('Difficulty runs from 1 to 5.', 'Difficulty')
    }
  }

  const tags = question.tags ?? []
  if (tags.length > 20) err('At most 20 tags.', 'Tags')
  for (const tag of tags) {
    if (tag.length > 50) err(`The tag "${tag.slice(0, 20)}…" is longer than 50 characters.`, 'Tags')
  }

  /* --------------------------------------------------------------- stimulus */

  question.stimulus?.forEach((s, i) => {
    const where = `Stimulus ${i + 1}`
    if (s.kind === 'image') {
      if (!s.file?.trim()) err('An image stimulus needs a file to point at.', where)
      // Beyond the schema, which only notes that alt text is needed if the paper
      // is ever read by a screen reader. Warned rather than blocked.
      else if (!s.alt?.trim()) warn('No alt text, so the image is invisible to a screen reader.', where)
    } else if (!s.text?.trim()) {
      err('A text stimulus needs some text.', where)
    }
    if (s.maxHeightMm !== undefined && !(s.maxHeightMm > 0)) {
      err('Printed height must be above zero.', where)
    }
  })

  /* ---------------------------------------------------------- marking guide */

  const guide = question.markingGuide
  guide?.criteria?.forEach((c, i) => {
    const where = `Criterion ${i + 1}`
    if (!c.description.trim()) err('A criterion needs a description.', where)
    if (!Number.isFinite(c.marks)) err('A criterion needs a mark value.', where)
  })

  const criteria = guide?.criteria ?? []
  if (criteria.length > 0 && !looksBanded(criteria)) {
    const sum = criteria.reduce((t, c) => t + c.marks, 0)
    if (sum !== question.marks) {
      warn(
        `The criteria total ${sum}, but the question is worth ${question.marks}.`,
        'Marking guide',
      )
    }
  }

  if (needsGuide(question.questionType) && !hasGuide(question)) {
    warn(
      'No sample answer or criteria. Two markers will not agree on this without them.',
      'Marking guide',
    )
  }

  /* ------------------------------------------------------ type-specific rules */

  const cfg = question.config ?? {}
  switch (question.questionType) {
    case 'multiple_choice':
      validateMultipleChoice(cfg, err)
      break
    case 'true_false':
      if (typeof cfg.correctAnswer !== 'boolean') err('Choose true or false as the answer.', 'Answer')
      break
    case 'table':
      validateTable(cfg, question.marks, err, warn)
      break
    case 'drawing':
      validateDrawing(cfg, err, warn)
      break
    case 'short_answer':
    case 'extended_response':
      validateWritten(cfg, question.marks, err)
      break
  }

  return [...out].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
}

type Report = (message: string, where?: string) => void

function validateMultipleChoice(cfg: QuestionConfig, err: Report): void {
  const choices = cfg.choices ?? []
  if (choices.length < 2) {
    err('A multiple choice question needs at least two options.', 'Options')
  }
  choices.forEach((c, i) => {
    if (!c.text.trim()) err('This option is empty.', `Option ${letter(i)}`)
  })

  const correct = cfg.correctAnswer
  if (typeof correct !== 'number' || !Number.isInteger(correct)) {
    err('Mark one option as the correct answer.', 'Options')
  } else if (correct < 0 || correct >= choices.length) {
    // Beyond the schema, which only requires a non-negative integer: an index
    // past the end prints a marking guide with no answer on it.
    err('The correct option is not one of the options listed.', 'Options')
  }
}

function validateTable(cfg: QuestionConfig, marks: number, err: Report, warn: Report): void {
  const columns = cfg.columns ?? []
  const rows = cfg.rows ?? []

  if (columns.length < 1) err('A table needs at least one column.', 'Table')
  columns.forEach((c, i) => {
    if (!c.trim()) err(`Column ${i + 1} has no heading.`, 'Table')
  })

  if (rows.length < 1) err('A table needs at least one row.', 'Table')
  rows.forEach((r, i) => {
    const where = `Row ${i + 1}`
    if (!r.label.trim()) err('This row has no label, so the student sees a blank line.', where)
    if (r.marks !== undefined && r.marks < 0) err('A row cannot be worth less than nothing.', where)
  })

  // Known limitation, worth saying before the paper is printed rather than after.
  if (columns.length > 2) {
    warn(
      'A table with more than two columns prints the same expected answers in ' +
        'every answer column, because a row holds one list of answers rather than ' +
        'one per column.',
      'Table',
    )
  }

  const marked = rows.filter((r) => r.marks !== undefined)
  if (marked.length === rows.length && rows.length > 0) {
    const sum = marked.reduce((t, r) => t + (r.marks ?? 0), 0)
    if (sum !== marks) warn(`The rows total ${sum} marks, but the question is worth ${marks}.`, 'Table')
  }
}

function validateDrawing(cfg: QuestionConfig, err: Report, warn: Report): void {
  if (cfg.subtype !== undefined && !DRAWING_SUBTYPES.includes(cfg.subtype)) {
    err(`"${cfg.subtype}" is not a kind of drawing Klunk knows how to print.`, 'Drawing')
  }

  const space = cfg.spaceMm
  if (space !== undefined) {
    const [w, h] = space
    if (space.length !== 2 || !(w > 0) || !(h > 0)) {
      err('The drawing space needs a width and a height, both above zero.', 'Drawing')
      return
    }
    if (w > A4_PRINTABLE_MM.width || h > A4_PRINTABLE_MM.height) {
      warn(
        `${w}mm × ${h}mm is wider or taller than the printable area of an A4 page.`,
        'Drawing',
      )
    }
  }
}

function validateWritten(cfg: QuestionConfig, marks: number, err: Report): void {
  if (cfg.answerLines !== undefined && (!Number.isInteger(cfg.answerLines) || cfg.answerLines < 0)) {
    err('Answer lines must be a whole number, or left blank to work it out from the marks.', 'Answer lines')
  }

  const parts = cfg.parts ?? []
  parts.forEach((p, i) => {
    const where = `Part ${p.label.trim() || i + 1}`
    if (!p.label.trim()) err('A part needs a label, such as (a).', where)
    if (!p.text.trim()) err('A part needs something to ask.', where)
    if (!Number.isFinite(p.marks) || p.marks <= 0) err('A part must be worth more than nothing.', where)
    if (p.answerLines !== undefined && (!Number.isInteger(p.answerLines) || p.answerLines < 0)) {
      err('Answer lines must be a whole number.', where)
    }
  })

  // Beyond the schema, which can only describe it: the parts print their own
  // marks, so a paper whose parts disagree with its total is wrong on its face.
  if (parts.length > 0) {
    const sum = parts.reduce((t, p) => t + p.marks, 0)
    if (sum !== marks) {
      err(`The parts total ${sum} marks, but the question is worth ${marks}.`, 'Parts')
    }
  }
}

/* ----------------------------------------------------------------- shared tests */

/**
 * Band descriptors are alternatives, not components: a 15-mark extended
 * response might list 15/11/7/3. Summing those and complaining they exceed the
 * total would be wrong, so treat strictly descending marks as bands.
 */
export function looksBanded(criteria: MarkCriterion[]): boolean {
  if (criteria.length < 2) return false
  return criteria.every((c, i) => i === 0 || c.marks < (criteria[i - 1]?.marks ?? 0))
}

/** Types where a marker has to exercise judgement, so a guide is not optional. */
export function needsGuide(type: QuestionType): boolean {
  return type === 'short_answer' || type === 'extended_response' || type === 'drawing'
}

export function hasGuide(question: Question): boolean {
  const g = question.markingGuide
  if (g?.sampleAnswer?.trim() || g?.notes?.trim() || g?.criteria?.length) return true
  // A question split into parts carries its sample answers on the parts, and
  // then has no `markingGuide` of its own at all.
  return (question.config?.parts ?? []).some((p) => p.sampleAnswer?.trim())
}

/* ------------------------------------------------------------------------ ids */

const TYPE_ABBREVIATION: Record<QuestionType, string> = {
  multiple_choice: 'mc',
  true_false: 'tf',
  short_answer: 'sa',
  extended_response: 'er',
  table: 'tbl',
  drawing: 'drw',
}

/**
 * Propose an id nobody has used, of the shape `design-mc-03`.
 *
 * Named after the bank and the type because a teacher does read these: they
 * turn up in the paper file, in a "question not found" message, and in the row
 * under every question in the library. A random string would be unique and
 * useless. The number is the first free one rather than one past the highest,
 * so deleting a question and adding another does not leave gaps forever.
 */
export function suggestQuestionId(
  bankPath: string,
  type: QuestionType,
  taken: Set<string>,
): string {
  const file = bankPath.split('/').pop() ?? bankPath
  const stem =
    file
      .replace(/\.json$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'bank'

  const prefix = `${stem}-${TYPE_ABBREVIATION[type]}`
  for (let n = 1; n < 1000; n += 1) {
    const id = `${prefix}-${String(n).padStart(2, '0')}`
    if (!taken.has(id)) return id
  }
  return `${prefix}-${taken.size + 1}`
}

/* ------------------------------------------------------------------- cleaning */

/**
 * Reduce a draft to exactly what belongs in the file.
 *
 * Two things make this necessary rather than tidy. Each type's config is
 * `additionalProperties: false` in the schema, so the choices left behind when
 * a teacher switches a question from multiple choice to short answer would make
 * the saved file fail validation. And a form produces empty strings for every
 * field nobody filled in, which would litter the bank with `"caption": ""` and
 * make a diff of two banks unreadable.
 */
export function cleanQuestion(draft: Question): Question {
  const out: Question = {
    id: draft.id.trim(),
    questionType: draft.questionType,
    questionText: draft.questionText.trim(),
    marks: draft.marks,
  }

  if (draft.difficulty !== undefined) out.difficulty = draft.difficulty

  const syllabus = compact({
    syllabusId: text(draft.syllabus?.syllabusId),
    courseId: text(draft.syllabus?.courseId),
    topicIds: list(draft.syllabus?.topicIds),
    pointIds: list(draft.syllabus?.pointIds),
  })
  if (syllabus) out.syllabus = syllabus

  const outcomes = list(draft.outcomes)
  if (outcomes) out.outcomes = outcomes

  const tags = list(draft.tags)
  if (tags) out.tags = tags

  const stimulus = (draft.stimulus ?? [])
    .map(cleanStimulus)
    .filter((s) => s.file !== undefined || s.text !== undefined)
  if (stimulus.length) out.stimulus = stimulus

  const guide = compact({
    sampleAnswer: text(draft.markingGuide?.sampleAnswer),
    criteria: nonEmpty(
      (draft.markingGuide?.criteria ?? [])
        .filter((c) => c.description.trim())
        .map((c) => ({ marks: c.marks, description: c.description.trim() })),
    ),
    notes: text(draft.markingGuide?.notes),
  })
  if (guide) out.markingGuide = guide

  const source = compact({
    origin: draft.source?.origin,
    paper: text(draft.source?.paper),
    year: draft.source?.year,
    questionNumber: text(draft.source?.questionNumber),
    copyright: text(draft.source?.copyright),
  })
  if (source) out.source = source

  const config = cleanConfig(draft.questionType, draft.config ?? {})
  if (config) out.config = config

  return out
}

/** Keep only the config keys the schema allows for this question type. */
function cleanConfig(type: QuestionType, cfg: QuestionConfig): QuestionConfig | undefined {
  switch (type) {
    case 'multiple_choice':
      // Always written, even when empty: the schema requires config on a
      // multiple choice question, and validation has already refused to save an
      // empty one.
      return {
        choices: (cfg.choices ?? [])
          .filter((c) => c.text.trim())
          .map((c) => {
            const feedback = text(c.feedback)
            return feedback === undefined
              ? { text: c.text.trim() }
              : { text: c.text.trim(), feedback }
          }),
        correctAnswer: typeof cfg.correctAnswer === 'number' ? cfg.correctAnswer : 0,
        shuffle: cfg.shuffle !== false,
      }

    case 'true_false':
      return compact({
        correctAnswer: typeof cfg.correctAnswer === 'boolean' ? cfg.correctAnswer : false,
        feedbackTrue: text(cfg.feedbackTrue),
        feedbackFalse: text(cfg.feedbackFalse),
      })

    case 'table':
      return {
        columns: (cfg.columns ?? []).map((c) => c.trim()),
        rows: (cfg.rows ?? []).map(cleanRow),
        ...(cfg.blankCells === false ? { blankCells: false } : {}),
      }

    case 'drawing':
      return compact({
        subtype: text(cfg.subtype),
        instructions: text(cfg.instructions),
        spaceMm: cfg.spaceMm,
        grid: cfg.grid === true ? true : undefined,
      })

    case 'short_answer':
    case 'extended_response':
      return compact({
        answerLines: cfg.answerLines,
        parts: nonEmpty(
          (cfg.parts ?? []).filter((p) => p.text.trim() || p.label.trim()).map(cleanPart),
        ),
      })
  }
}

function cleanStimulus(s: Stimulus): Stimulus {
  const out: Stimulus = { kind: s.kind }
  if (s.kind === 'image') {
    const file = text(s.file)
    const alt = text(s.alt)
    if (file) out.file = file
    if (alt) out.alt = alt
  } else {
    const body = text(s.text)
    if (body) out.text = body
  }
  const caption = text(s.caption)
  if (caption) out.caption = caption
  if (s.maxHeightMm !== undefined) out.maxHeightMm = s.maxHeightMm
  return out
}

function cleanRow(r: TableRow): TableRow {
  const out: TableRow = { label: r.label.trim() }
  const answers = list(r.answers)
  if (answers) out.answers = answers
  if (r.marks !== undefined) out.marks = r.marks
  return out
}

function cleanPart(p: QuestionPart): QuestionPart {
  const out: QuestionPart = { label: p.label.trim(), text: p.text.trim(), marks: p.marks }
  if (p.answerLines !== undefined) out.answerLines = p.answerLines
  const sample = text(p.sampleAnswer)
  if (sample) out.sampleAnswer = sample
  return out
}

/* ----------------------------------------------------------------- small tools */

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function list(values: string[] | undefined): string[] | undefined {
  return nonEmpty((values ?? []).map((v) => v.trim()).filter(Boolean))
}

function nonEmpty<T>(values: T[] | undefined): T[] | undefined {
  return values && values.length > 0 ? values : undefined
}

/**
 * Drop the undefined entries, and the whole object if nothing is left.
 *
 * The result type is all-optional rather than all-required, which is what the
 * runtime object actually is: a key whose value was undefined is not there.
 */
function compact<T extends object>(value: T): Compacted<T> | undefined {
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (v !== undefined) out[key] = v
  }
  return Object.keys(out).length > 0 ? (out as Compacted<T>) : undefined
}

type Compacted<T> = { [K in keyof T]?: Exclude<T[K], undefined> }

function letter(i: number): string {
  return String.fromCharCode(65 + i)
}
