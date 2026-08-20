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
 * permits but no teacher meant (a blank column heading).
 *
 * **Not every error blocks a save, and which ones do is decided here** (#105).
 * A bank is a store rather than a paper, and refusing to write a question a
 * teacher has read off a real examination is how an import became
 * all-or-nothing: a paper with no marking guide lost its objective questions
 * outright. Four tests, in order, and the first that answers wins:
 *
 *   1. the schema refuses it, so the file could not be written at all;
 *   2. the schema permits it and the value is actively wrong — it prints
 *      something false, breaks a paper reference, or overwrites another
 *      question;
 *   3. `cleanQuestion` erases it, so after the save there is nothing left to
 *      come back to;
 *   4. otherwise it is `unfinished`: the question is written, marked, and
 *      reported on any paper it reaches.
 *
 * Test 3 is the one that is not obvious and it decides four rules. A fault
 * cleaning removes cannot be represented on the saved question, so marking it
 * unfinished would leave a question flagged with no reason anybody could
 * recover. Blocking is the better trade there.
 */

import type { Check } from './paper'
import { parseRef, sameLines, STIMULUS_ALIGNS } from './types'
import type {
  IdentificationField,
  MarkCriterion,
  Paper,
  PaperRef,
  PaperRefObject,
  Profile,
  ProfileSection,
  Question,
  QuestionConfig,
  QuestionPart,
  QuestionType,
  School,
  Stimulus,
  Syllabus,
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
  // Four reporters over two axes: how bad it is, and whether the question can
  // be saved and finished later. Named for what they mean rather than left to a
  // flag on the call, because the header's four tests are what a reader has to
  // apply to add a rule here.
  const err = (message: string, where?: string) => out.push({ severity: 'error', message, where })
  const warn = (message: string, where?: string) =>
    out.push({ severity: 'warning', message, where })
  /** Wrong, and the file can hold it: saved, marked, and reported on any paper. */
  const errToFinish = (message: string, where?: string) =>
    out.push({ severity: 'error', message, where, unfinished: true })
  /** Not wrong, and not done: no answer recorded, no marking guide. */
  const warnToFinish = (message: string, where?: string) =>
    out.push({ severity: 'warning', message, where, unfinished: true })

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

  // A question may have no stem of its own, but only when its parts do the
  // asking. 2016, 2018 and 2019 each print one that way — the heading is
  // followed straight by (a) — and requiring a stem there would mean inventing
  // words the examination never printed.
  const partsAsk = (question.config?.parts ?? []).some((p) => p.text.trim())
  if (!question.questionText.trim() && !partsAsk) {
    err('A question needs something to ask, either its own text or parts that ask it.', 'Question')
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

  validateStimulus(question.stimulus, 'Stimulus', err, warn)
  // A part's pictures are the same rules under the part's own name, because
  // "Stimulus 2 has no alt text" is no help on a question carrying six of them
  // across three parts.
  ;(question.config?.parts ?? []).forEach((p, i) => {
    validateStimulus(p.stimulus, `Part ${p.label.trim() || i + 1}, stimulus`, err, warn)
  })

  /* ---------------------------------------------------------- marking guide */

  const guide = question.markingGuide
  guide?.criteria?.forEach((c, i) => validateCriterion(c, `Criterion ${i + 1}`, err))

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
    warnToFinish(
      'No sample answer or criteria. Two markers will not agree on this without them.',
      'Marking guide',
    )
  }

  /* ------------------------------------------------------ type-specific rules */

  const cfg = question.config ?? {}
  switch (question.questionType) {
    case 'multiple_choice':
      validateMultipleChoice(cfg, err, warnToFinish)
      break
    case 'multiple_response':
      validateMultipleResponse(cfg, err, warn, warnToFinish)
      break
    case 'matching':
      validateMatching(cfg, err, warn, warnToFinish)
      break
    case 'true_false':
      if (typeof cfg.correctAnswer !== 'boolean')
        err('Choose true or false as the answer.', 'Answer')
      break
    case 'table':
      validateTable(cfg, question.marks, err, errToFinish, warn, warnToFinish)
      break
    case 'drawing':
      validateDrawing(cfg, err, warn)
      break
    case 'short_answer':
    case 'extended_response':
      validateWritten(cfg, question.marks, err, errToFinish)
      break
  }

  return [...out].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
}

type Report = (message: string, where?: string) => void

/**
 * The stimulus rules, wherever a list of them hangs.
 *
 * `prefix` is what the fault is called, so a question's own images read
 * `Stimulus 2` and a part's read `Part (b), stimulus 1`. One function rather than
 * two, because two would come to disagree about which of these is a warning.
 */
function validateStimulus(
  items: Stimulus[] | undefined,
  prefix: string,
  err: Report,
  warn: Report,
): void {
  items?.forEach((s, i) => {
    const where = `${prefix} ${i + 1}`
    if (s.kind === 'image') {
      if (!s.file?.trim()) err('An image stimulus needs a file to point at.', where)
      // Beyond the schema, which only notes that alt text is needed if the paper
      // is ever read by a screen reader. Warned rather than blocked.
      else if (!s.alt?.trim())
        warn('No alt text, so the image is invisible to a screen reader.', where)
    } else if (!s.text?.trim()) {
      err('A text stimulus needs some text.', where)
    }
    if (s.maxHeightMm !== undefined && !(s.maxHeightMm > 0)) {
      err('Printed height must be above zero.', where)
    }
    // Only reachable from a hand-edited file, since the editor offers a list of
    // three. Named rather than ignored: an image that silently refuses to move
    // reads as Klunk not honouring the field at all.
    if (s.align !== undefined && !STIMULUS_ALIGNS.includes(s.align)) {
      err(`"${String(s.align)}" is not left, centre or right.`, where)
    }
  })
}

function validateCriterion(c: MarkCriterion, where: string, err: Report): void {
  if (!c.description.trim()) err('A criterion needs a description.', where)
  if (!Number.isFinite(c.marks)) err('A criterion needs a mark value.', where)
  if (c.marksTo !== undefined) {
    if (!Number.isFinite(c.marksTo)) {
      err('The top of a band must be a number.', where)
    } else if (c.marksTo <= c.marks) {
      // Beyond the schema, which can only say both are numbers. A band that runs
      // backwards prints as "15–13" and reads as a typing mistake, because it is.
      err(
        `A band runs from the lower mark to the higher one, so ${c.marks}–${c.marksTo} is backwards.`,
        where,
      )
    }
  }
}

/**
 * A missing answer key is a warning on all three types that carry one, and it
 * took three issues to get there.
 *
 * `multipleChoiceConfig` used to require `correctAnswer`, so a paper read
 * without its markscheme had to have one invented, and `adopt.ts` put 0 there —
 * thirty questions all answered A, ready to print (#64). #32 refused to repeat
 * that on multiple response and matching, leaving multiple choice the only type
 * where absent was an error rather than a state. The cost was #95: a scanned
 * paper with no guide lost its nine objective questions altogether, because a
 * question that cannot be represented cannot be saved.
 *
 * Absent now means unknown on all three. The student paper is correct either
 * way, which is what makes a warning the honest severity rather than a lenient
 * one, and the guide says in words that nobody recorded an answer.
 */
function validateMultipleChoice(cfg: QuestionConfig, err: Report, warnToFinish: Report): void {
  const choices = cfg.choices ?? []
  if (choices.length < 2) {
    err('A multiple choice question needs at least two options.', 'Options')
  }
  choices.forEach((c, i) => {
    if (!c.text.trim()) err('This option is empty.', `Option ${letter(i)}`)
  })

  const correct = cfg.correctAnswer
  if (correct === undefined) {
    warnToFinish(
      'No answer is marked, so the marking guide will say the answer is not ' +
        'recorded rather than print a letter.',
      'Options',
    )
  } else if (typeof correct !== 'number' || !Number.isInteger(correct) || correct < 0) {
    err('Mark one option as the correct answer.', 'Options')
  } else if (correct >= choices.length) {
    // Beyond the schema, which only requires a non-negative integer: an index
    // past the end prints a marking guide with no answer on it.
    err('The correct option is not one of the options listed.', 'Options')
  }
}
function validateMultipleResponse(
  cfg: QuestionConfig,
  err: Report,
  warn: Report,
  warnToFinish: Report,
): void {
  const choices = cfg.choices ?? []
  if (choices.length < 3) {
    err(
      'A multiple response question needs at least three options. With two, either ' +
        'one is right and it is multiple choice, or both are and it asks nothing.',
      'Options',
    )
  }
  choices.forEach((c, i) => {
    if (!c.text.trim()) err('This option is empty.', `Option ${letter(i)}`)
  })

  const correct = cfg.correctAnswers
  if (correct === undefined) {
    warnToFinish(
      'No answers are marked, so the marking guide will say the answers are not ' +
        'recorded rather than print them.',
      'Options',
    )
    return
  }

  if (correct.length === 0) {
    err('Mark the options that are answers, or leave the answers unrecorded.', 'Options')
  }
  if (new Set(correct).size !== correct.length) {
    err('The same option is marked as an answer more than once.', 'Options')
  }
  correct.forEach((i) => {
    if (!Number.isInteger(i) || i < 0 || i >= choices.length) {
      // Beyond the schema, which only requires a non-negative integer: an index
      // past the end prints a letter on the guide that is on no paper.
      err('An answer is not one of the options listed.', 'Options')
    }
  })
  if (correct.length === 1) {
    warn(
      'Only one option is an answer, so this is a multiple choice question. ' +
        'The paper will still tell the student more than one may be correct.',
      'Options',
    )
  }
}

function validateMatching(
  cfg: QuestionConfig,
  err: Report,
  warn: Report,
  warnToFinish: Report,
): void {
  const items = cfg.items ?? []
  const options = cfg.options ?? []

  if (items.length < 2) err('A matching question needs at least two numbered items.', 'Matching')
  if (options.length < 2)
    err('A matching question needs at least two lettered options.', 'Matching')

  items.forEach((item, i) => {
    if (!item.text.trim()) err('This item is empty.', `Item ${i + 1}`)
    item.matches?.forEach((m) => {
      if (!Number.isInteger(m) || m < 0 || m >= options.length) {
        err('This item is linked to an option that is not listed.', `Item ${i + 1}`)
      }
    })
    if (item.matches && new Set(item.matches).size !== item.matches.length) {
      err('This item is linked to the same option twice.', `Item ${i + 1}`)
    }
  })
  options.forEach((o, i) => {
    if (!o.text.trim()) err('This option is empty.', `Option ${letter(i)}`)
  })

  if (items.every((item) => item.matches === undefined)) {
    warnToFinish(
      'Nothing is linked, so the marking guide will say the answers are not recorded ' +
        'rather than print them.',
      'Matching',
    )
    return
  }

  const unlinked = items.map((item, i) => (item.matches?.length ? 0 : i + 1)).filter((n) => n > 0)
  if (unlinked.length > 0) {
    // Not an error: the 2024 paper's rubric allows an item to link to anything
    // or nothing. But a question where some items are linked and others are not
    // is far more likely to be half-finished than to be deliberate.
    warn(
      `Item${unlinked.length === 1 ? '' : 's'} ${unlinked.join(', ')} ` +
        `${unlinked.length === 1 ? 'is' : 'are'} linked to nothing.`,
      'Matching',
    )
  }
}

function validateTable(
  cfg: QuestionConfig,
  marks: number,
  err: Report,
  errToFinish: Report,
  warn: Report,
  warnToFinish: Report,
): void {
  const columns = cfg.columns ?? []
  const rows = cfg.rows ?? []

  if (columns.length < 1) err('A table needs at least one column.', 'Table')
  columns.forEach((c, i) => {
    if (!c.trim()) errToFinish(`Column ${i + 1} has no heading.`, 'Table')
  })

  if (rows.length < 1) err('A table needs at least one row.', 'Table')

  // The first column holds the label, so the rest are answer columns.
  const answerColumns = Math.max(columns.length - 1, 0)

  rows.forEach((r, i) => {
    const where = `Row ${i + 1}`
    if (!r.label.trim())
      errToFinish('This row has no label, so the student sees a blank line.', where)
    if (r.marks !== undefined && r.marks < 0)
      err('A row cannot be worth less than zero marks.', where)

    // A row carrying more cells than there are columns means answers that will
    // never print, which is silent on the page and wrong in the marking guide.
    if ((r.cells?.length ?? 0) > answerColumns) {
      err(
        `This row has answers for ${r.cells?.length} columns, but the table has ` +
          `${answerColumns} to answer in. The extra ones would not print.`,
        where,
      )
    }
  })

  const blank = rows.filter((r) => !(r.cells ?? []).some((c) => (c.answers ?? []).length > 0))
  if (answerColumns > 0 && blank.length === rows.length && rows.length > 0) {
    warnToFinish(
      'No row has an expected answer, so the marking guide prints an empty table.',
      'Table',
    )
  }

  const marked = rows.filter((r) => r.marks !== undefined)
  if (marked.length === rows.length && rows.length > 0) {
    const sum = marked.reduce((t, r) => t + (r.marks ?? 0), 0)
    if (sum !== marks)
      warn(`The rows total ${sum} marks, but the question is worth ${marks}.`, 'Table')
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
      warn(`${w}mm × ${h}mm is wider or taller than the printable area of an A4 page.`, 'Drawing')
    }
  }
}

function validateWritten(
  cfg: QuestionConfig,
  marks: number,
  err: Report,
  errToFinish: Report,
): void {
  if (
    cfg.answerLines !== undefined &&
    (!Number.isInteger(cfg.answerLines) || cfg.answerLines < 0)
  ) {
    err(
      'Answer lines must be a whole number, or left blank to work it out from the marks.',
      'Answer lines',
    )
  }

  const parts = cfg.parts ?? []
  parts.forEach((p, i) => {
    const where = `Part ${p.label.trim() || i + 1}`
    if (!p.label.trim()) errToFinish('A part needs a label, such as (a).', where)
    if (!p.text.trim()) errToFinish('A part needs something to ask.', where)
    if (!Number.isFinite(p.marks) || p.marks <= 0)
      err('A part must be worth more than nothing.', where)
    if (p.answerLines !== undefined && (!Number.isInteger(p.answerLines) || p.answerLines < 0)) {
      err('Answer lines must be a whole number.', where)
    }
    p.criteria?.forEach((c, j) => validateCriterion(c, `${where}, criterion ${j + 1}`, err))
  })

  // Beyond the schema, which can only describe it: the parts print their own
  // marks, so a paper whose parts disagree with its total is wrong on its face.
  if (parts.length > 0) {
    const sum = parts.reduce((t, p) => t + p.marks, 0)
    if (sum !== marks) {
      errToFinish(`The parts total ${sum} marks, but the question is worth ${marks}.`, 'Parts')
    }
  }
}

/* ----------------------------------------------------------------- shared tests */

/**
 * Band descriptors are alternatives, not components: a 15-mark extended
 * response might list 15/11/7/3. Summing those and complaining they exceed the
 * total would be wrong.
 *
 * A recorded band says so outright. The descending-marks test stays for the
 * criteria that predate `marksTo` and for the ones a teacher types by hand,
 * where a band is still only implied by its shape.
 */
export function looksBanded(criteria: MarkCriterion[]): boolean {
  if (criteria.some((c) => c.marksTo !== undefined)) return true
  if (criteria.length < 2) return false
  return criteria.every((c, i) => i === 0 || c.marks < (criteria[i - 1]?.marks ?? 0))
}

/** Types where a marker has to exercise judgement, so a guide is not optional. */
export function needsGuide(type: QuestionType): boolean {
  return type === 'short_answer' || type === 'extended_response' || type === 'drawing'
}

export function hasGuide(question: Question): boolean {
  const g = question.markingGuide
  if (
    g?.sampleAnswer?.trim() ||
    g?.notes?.trim() ||
    g?.criteria?.length ||
    g?.answersCouldInclude?.length
  ) {
    return true
  }
  // A question split into parts carries its sample answers and criteria on the
  // parts, and then has no `markingGuide` of its own at all.
  return (question.config?.parts ?? []).some((p) => p.sampleAnswer?.trim() || p.criteria?.length)
}

/* ------------------------------------------------------------------ unfinished */

/**
 * Written into `tags` where a question is saved with work outstanding (#105).
 *
 * `needs-finishing` rather than `unfinished`, and the difference from the
 * `Check` field is deliberate: this is a string a teacher reads in a bank file
 * and on a chip, so it says what to do rather than only what it is.
 *
 * Klunk's own tag, like `ai-drafted` and `ai-marked`. It exists for the reason
 * `ai-marked` does: a note is gone the moment the question is saved, and a
 * teacher coming back to a bank in September has nothing else to read.
 */
export const UNFINISHED_TAG = 'needs-finishing'

/**
 * What a teacher still has to come back to on this question, in their words.
 *
 * The reasons are the checks' own messages and nothing else. A second list of
 * sentences saying the same things is how the two come to disagree, which is
 * the lesson `markupRules` records.
 *
 * Judged on the question alone. `emptyIdContext` is safe here because no id
 * rule can fire against empty sets, and none of them is unfinished anyway: an
 * id clash is a fact about the folder rather than about the question.
 */
export function unfinishedReasons(question: Question): string[] {
  return validateQuestion(question, emptyIdContext())
    .filter((c) => c.unfinished)
    .map((c) => c.message)
}

export function isUnfinished(question: Question): boolean {
  return validateQuestion(question, emptyIdContext()).some((c) => c.unfinished)
}

/**
 * Whether these checks stop the question being written at all.
 *
 * The one rule, in one place, for all three save screens. Before #105 each of
 * them tested `severity === 'error'` for itself, which is why relaxing the gate
 * meant finding three copies of it.
 */
export function blocksSaving(checks: Check[]): boolean {
  return checks.some((c) => c.severity === 'error' && !c.unfinished)
}

/* -------------------------------------------------------------------- profiles */

/** `^[a-z0-9]+(-[a-z0-9]+)*$` from the schema, and also what the filename becomes. */
const PROFILE_ID_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Checking a profile before it is written, on the same terms as a question.
 *
 * `schemas/profile.schema.json` is the contract and nothing in the browser reads
 * it, so the rules are restated here in the order the schema states them.
 *
 * The rules that go beyond the schema are the ones that matter most, because a
 * profile is only useful if it describes a paper that can actually be built.
 * JSON Schema cannot say that sections add up to the total, and a profile whose
 * sections do not is one the paper checker will reject every paper against —
 * with the profile, not the paper, being what is wrong. That is a miserable
 * thing to debug from the far end, so it is caught here.
 */
export function validateProfile(
  profile: Profile,
  takenIds: Set<string>,
  /**
   * The syllabus models in the folder, so a course id can be checked against
   * the one it names.
   *
   * Optional, and absent means the check does not run. A profile may name a
   * model the teacher has not generated — Klunk ships none, so that is ordinary
   * rather than a fault — and the same reading `modelcheck.ts` takes applies
   * here: a model that is not in the folder is left alone rather than reported.
   */
  syllabuses?: Syllabus[],
): Check[] {
  const out: Check[] = []
  const err = (message: string, where?: string) => out.push({ severity: 'error', message, where })
  const warn = (message: string, where?: string) =>
    out.push({ severity: 'warning', message, where })

  if (!profile.name?.trim()) err('The profile needs a name')

  if (!profile.id?.trim()) {
    err('The profile needs an id')
  } else if (!PROFILE_ID_SHAPE.test(profile.id)) {
    err(
      `"${profile.id}" cannot be an id. Lower-case letters, digits and single ` +
        'hyphens only, because it is also the filename.',
    )
  } else if (takenIds.has(profile.id)) {
    err(`This folder already has a profile with the id "${profile.id}"`)
  }

  // Beyond the schema, and the reason is #47's: a course id is only unique
  // inside its own model, so one that names nothing filters every question away
  // and the builder shows an empty list with no explanation. Silent, and it
  // looks like the bank is empty rather than like the profile is wrong.
  const courseId = profile.courseId?.trim()
  if (courseId) {
    if (!profile.syllabusId?.trim()) {
      err(
        `This profile names the course "${courseId}" but no syllabus, so Klunk ` +
          'cannot tell which subject that course belongs to. Choose a syllabus as well.',
      )
    } else {
      const model = syllabuses?.find((s) => s.id === profile.syllabusId)
      // A model that is not in the folder is left alone. Klunk ships none and a
      // profile naming one the teacher has yet to generate is ordinary.
      if (model && !model.courses.some((c) => c.id === courseId)) {
        const names = model.courses.map((c) => `"${c.name}"`).join(' or ')
        err(`${model.name} has no course called "${courseId}". Choose ${names}.`)
      }
    }
  }

  const paper = profile.paper
  if (!(paper.totalMarks > 0)) err('The paper has to be worth more than nothing')

  for (const [field, value] of [
    ['Reading time', paper.readingMinutes],
    ['Working time', paper.workingMinutes],
  ] as const) {
    if (value !== undefined && value < 0) err(`${field} cannot be negative`)
  }

  // Where the profile overrides the folder's identification fields it writes the
  // same shape, so it is held to the same rules rather than to a looser copy.
  out.push(...validateCoverOverride(paper.cover?.identification ?? []))

  const sections = paper.sections ?? []
  if (sections.length === 0) err('A paper needs at least one section')

  const seenIds = new Set<string>()
  let total = 0

  sections.forEach((section, i) => {
    const where = section.name?.trim() || `Section ${i + 1}`

    if (!section.name?.trim()) err('This section needs a name', where)

    if (!section.id?.trim()) {
      err('This section needs an id', where)
    } else if (seenIds.has(section.id)) {
      // Beyond the schema. A paper stores `profileSectionId`, so two sections
      // sharing an id means a saved paper cannot say which one it filled.
      err(`Two sections share the id "${section.id}"`, where)
    } else {
      seenIds.add(section.id)
    }

    if (!(section.marks > 0)) {
      err('A section has to be worth more than nothing', where)
    } else {
      total += section.marks
    }

    const { questionCount, minQuestions, maxQuestions, marksPerQuestion, chooseCount } = section

    if (chooseCount !== undefined) {
      if (!isWholeAtLeastOne(chooseCount)) {
        err('How many a student answers has to be a whole number, one or more', where)
      } else {
        // Beyond the schema, and each of these produces a section that looks
        // fine and cannot be filled.
        const offered = questionCount ?? maxQuestions
        if (offered !== undefined && chooseCount > offered) {
          err(`A student answers ${chooseCount} of these and only ${offered} are printed`, where)
        }
        if (offered !== undefined && chooseCount === offered) {
          warn(
            'A student answers every question in this section, so there is no choice to make. ' +
              'Leave the choice off unless some of these are alternatives.',
            where,
          )
        }
      }
    }

    if (questionCount !== undefined && !isWholeAtLeastOne(questionCount)) {
      err('A number of questions has to be a whole number, one or more', where)
    }
    for (const [field, value] of [
      ['fewest', minQuestions],
      ['most', maxQuestions],
    ] as const) {
      if (value !== undefined && !isWholeAtLeastOne(value)) {
        err(`The ${field} questions has to be a whole number, one or more`, where)
      }
    }

    if (questionCount !== undefined && (minQuestions !== undefined || maxQuestions !== undefined)) {
      // Beyond the schema, which permits both. They contradict each other, and
      // `checkPaper` reads questionCount first, so the range would be ignored
      // in silence.
      err(
        'This section fixes a number of questions and also gives a range. Use one or the other.',
        where,
      )
    }

    if (minQuestions !== undefined && maxQuestions !== undefined && minQuestions > maxQuestions) {
      err(`The fewest questions (${minQuestions}) is more than the most (${maxQuestions})`, where)
    }

    if (marksPerQuestion !== undefined) {
      if (!(marksPerQuestion > 0)) {
        err('Marks per question has to be more than nothing', where)
      } else if (questionCount !== undefined && section.marks > 0) {
        // Beyond the schema. Both are facts about the same section, so if they
        // disagree the section can never be filled: HSC Section I is 10
        // questions at 1 mark and is worth 10.
        //
        // Counted against what a student answers rather than what is printed.
        // The Visual Arts trial offers six 25-mark questions and is worth 25,
        // because a student answers one of them, and reading the printed count
        // here would reject a section that is perfectly correct.
        const answered = chooseCount ?? questionCount
        const implied = answered * marksPerQuestion
        if (implied !== section.marks) {
          err(
            `${answered} question${answered === 1 ? '' : 's'} at ${marksPerQuestion} ` +
              `mark${marksPerQuestion === 1 ? '' : 's'} is ${implied}, but this section is ` +
              `worth ${section.marks}`,
            where,
          )
        }
      }
    }

    if (section.questionTypes?.length === 0) {
      // Beyond the schema. An empty array is not the same as an absent one:
      // `isTypeAllowed` treats both as "anything goes", so a teacher who
      // deliberately unticked every type would get the opposite of what they meant.
      warn('No question type is ticked, so this section will accept any of them', where)
    }

    if (section.suggestedMinutes !== undefined && section.suggestedMinutes < 0) {
      err('Suggested time cannot be negative', where)
    }
  })

  if (sections.length > 0 && paper.totalMarks > 0 && total !== paper.totalMarks) {
    err(`The sections add up to ${total} marks, but the paper is set to ${paper.totalMarks}`)
  }

  const margins = profile.print?.marginsMm
  if (margins !== undefined) {
    if (margins.length !== 4) {
      err('Margins are four numbers: top, right, bottom, left')
    } else if (margins.some((m) => !(m >= 0))) {
      err('A margin cannot be negative')
    }
  }

  for (const [field, value] of [
    ['Lines per mark', profile.print?.linesPerMark],
    ['Answer line spacing', profile.print?.answerLineSpacingMm],
    ['Part-mark granularity', profile.marks?.partMarkGranularity],
  ] as const) {
    if (value !== undefined && !(value > 0)) err(`${field} has to be more than nothing`)
  }

  return out
}

function isWholeAtLeastOne(value: number): boolean {
  return Number.isInteger(value) && value >= 1
}

/** Drop the empty strings and empty lists a half-filled form leaves behind. */
export function cleanProfile(draft: Profile): Profile {
  const out: Profile = {
    formatVersion: '1',
    type: 'klunk_profile',
    id: draft.id.trim(),
    name: draft.name.trim(),
    paper: {
      totalMarks: draft.paper.totalMarks,
      sections: (draft.paper.sections ?? []).map(cleanSection),
    },
  }

  const syllabusId = text(draft.syllabusId)
  if (syllabusId !== undefined) out.syllabusId = syllabusId

  // Dropped along with the syllabus rather than kept on its own. A course id is
  // only meaningful inside a model — `y9` names a course in every 7-10 syllabus
  // in the folder — so one left behind after the syllabus was cleared would be
  // filtering against a course nothing could resolve.
  const courseId = syllabusId === undefined ? undefined : text(draft.courseId)
  if (courseId !== undefined) out.courseId = courseId

  if (draft.paper.readingMinutes !== undefined) {
    out.paper.readingMinutes = draft.paper.readingMinutes
  }
  if (draft.paper.workingMinutes !== undefined) {
    out.paper.workingMinutes = draft.paper.workingMinutes
  }
  const instructions = list(draft.paper.instructions)
  if (instructions) out.paper.instructions = instructions

  const cover = compact({
    identification: cleanIdentification(draft.paper.cover?.identification),
    // Only where it is on. `false` is what the absent case already means, and
    // writing it would put a line in every profile file saying nothing.
    marksAwardedColumn: draft.paper.cover?.marksAwardedColumn ? true : undefined,
  })
  if (cover) out.paper.cover = cover

  const questionTypes = nonEmpty(draft.questionTypes)
  if (questionTypes) out.questionTypes = questionTypes

  const marks = compact(draft.marks ?? {})
  if (marks) out.marks = marks

  const print = compact({
    paperSize: text(draft.print?.paperSize),
    marginsMm: draft.print?.marginsMm,
    answerLineSpacingMm: draft.print?.answerLineSpacingMm,
    linesPerMark: draft.print?.linesPerMark,
  })
  if (print) out.print = print

  return out
}

function cleanSection(draft: ProfileSection): ProfileSection {
  const out: ProfileSection = {
    id: draft.id.trim(),
    name: draft.name.trim(),
    marks: draft.marks,
  }

  const instructions = text(draft.instructions)
  if (instructions !== undefined) out.instructions = instructions

  const types = nonEmpty(draft.questionTypes)
  if (types) out.questionTypes = types

  for (const key of [
    'suggestedMinutes',
    'questionCount',
    'minQuestions',
    'maxQuestions',
    'marksPerQuestion',
    'chooseCount',
  ] as const) {
    const value = draft[key]
    if (value !== undefined) out[key] = value
  }

  return out
}

/* --------------------------------------------------------------------- school */

/** The largest grid worth printing, and what `school.schema.json` allows. */
const MAX_BOXES = 20

/**
 * Checking the folder's cover branding before it is written.
 *
 * `schemas/school.schema.json` is the contract, restated here in the order it
 * states things, as the two validators above are.
 *
 * The rules beyond the schema are the ones where a file the schema accepts
 * produces a cover nobody meant. A field with no label prints an anonymous box
 * for a student to write their name in, and a logo width of nothing prints a
 * logo of nothing: both are silent on screen until somebody looks at a printed
 * page, which is too late.
 */
export function validateSchool(school: School): Check[] {
  const out: Check[] = []
  const err = (message: string, where?: string) => out.push({ severity: 'error', message, where })
  const warn = (message: string, where?: string) =>
    out.push({ severity: 'warning', message, where })

  if (!school.name?.trim()) err('The school needs a name')

  if (school.logoWidthMm !== undefined && !(school.logoWidthMm > 0)) {
    err('The logo has to be wider than nothing')
  }
  if (school.logoWidthMm !== undefined && school.logoWidthMm > 180) {
    // Beyond the schema. 180 mm is the printable width of A4 once the margins
    // in @page are taken out, so a wider logo runs off the edge of the paper.
    err('A logo wider than 180 mm runs off the edge of an A4 page')
  }

  const fields = school.identification ?? []
  fields.forEach((field, i) => {
    const where = field.label?.trim() || `Box ${i + 1}`
    validateIdentification(field, where, err)
  })

  const labels = fields.map((f) => f.label?.trim()).filter(Boolean)
  const twice = labels.filter((label, i) => labels.indexOf(label) !== i)
  for (const label of new Set(twice)) {
    // Beyond the schema. Two boxes both labelled Name is not wrong to print, so
    // it does not block a save, but it is far more often a half-finished edit
    // than something a teacher meant.
    warn(`Two of these are labelled "${label}", so the cover prints it twice`)
  }

  return out
}

/**
 * One identification field, shared by the school form and the profile's
 * override of it. Both write the same shape and a rule enforced in one place
 * only is how the second copy quietly loses it.
 */
function validateIdentification(field: IdentificationField, where: string, err: Report): void {
  if (!field.label?.trim()) {
    err('This needs a label, because it prints as the words above the writing space', where)
  }

  if (field.kind !== 'write' && field.kind !== 'boxes') {
    err('Choose whether this is writing space or a row of boxes', where)
    return
  }

  if (field.kind === 'boxes' && field.boxes !== undefined) {
    if (!isWholeAtLeastOne(field.boxes)) {
      err('A row of boxes has to be a whole number of boxes, one or more', where)
    } else if (field.boxes > MAX_BOXES) {
      err(
        `${field.boxes} boxes is more than fits across the cover. Use ${MAX_BOXES} or fewer.`,
        where,
      )
    }
  }
}

/** The same beyond-the-schema rules, for the copy a profile may carry. */
export function validateCoverOverride(fields: IdentificationField[]): Check[] {
  const out: Check[] = []
  const err = (message: string, where?: string) => out.push({ severity: 'error', message, where })
  fields.forEach((field, i) => {
    validateIdentification(field, field.label?.trim() || `Box ${i + 1}`, err)
  })
  return out
}

/** Drop the empty strings and empty lists a half-filled form leaves behind. */
export function cleanSchool(draft: School): School {
  const out: School = {
    formatVersion: '1',
    type: 'klunk_school',
    name: draft.name.trim(),
  }

  const logoFile = text(draft.logoFile)
  if (logoFile !== undefined) out.logoFile = logoFile
  // Kept only alongside a logo. A width left behind after the picture was
  // removed is a number that means nothing and would come back into force if a
  // different logo were chosen later.
  if (logoFile !== undefined && draft.logoWidthMm !== undefined) {
    out.logoWidthMm = draft.logoWidthMm
  }

  const identification = cleanIdentification(draft.identification)
  if (identification) out.identification = identification

  return out
}

/**
 * Tidy a list of identification fields, dropping the ones with nothing in them.
 *
 * An unlabelled field is dropped rather than reported, unlike an empty content
 * point in the syllabus reader: a row added by a stray click on "Add a box" and
 * never filled in is the ordinary way one of these appears, and there is nothing
 * in it to lose.
 */
export function cleanIdentification(
  fields: IdentificationField[] | undefined,
): IdentificationField[] | undefined {
  const out = (fields ?? [])
    .filter((f) => f.label?.trim())
    .map((f): IdentificationField => {
      const field: IdentificationField = { label: f.label.trim(), kind: f.kind }
      // Only where it is the shape that has them, so a field switched from
      // boxes to writing space does not carry a count nothing reads.
      if (f.kind === 'boxes' && f.boxes !== undefined) field.boxes = f.boxes
      if (f.onEveryPage) field.onEveryPage = true
      return field
    })
  return out.length > 0 ? out : undefined
}

/* ---------------------------------------------------------------------- paper */

/**
 * Reduce a paper to exactly what belongs in the file, and let it inherit.
 *
 * A profile is the template and a paper is an instance of it. A paper states a
 * field only where it means to differ; `cover.ts` resolves each one as
 * `paper.x ?? profile.paper.x`, and an absent field is how a paper says "take
 * the profile's" (#106).
 *
 * Two jobs beyond tidying.
 *
 * **An override identical to the profile's is taken off.** It changes nothing
 * that prints, because both sides resolve to the same value, and it is the one
 * thing stopping a later profile edit reaching this paper. Every paper made
 * before #106 carries three of them, written by `newPaper` rather than by a
 * teacher. Taking them off is invisible on the page and restores inheritance.
 *
 * **A cleared instructions box means inherit.** The textarea writes
 * `value.split('\n')`, so clearing it gives `['']`, which is not nullish and so
 * shadows the profile for ever. An all-blank list becomes absent.
 *
 * **A stored `0` is kept.** Removing it would make "this paper has no reading
 * time" impossible to say, which is a legitimate use of the layer, and would
 * reinterpret what a saved file means. `cover.test.ts` already records the same
 * decision on the other side: zero is a real answer and not a missing one.
 *
 * `sections` is passed through by reference rather than rebuilt, unlike
 * `cleanProfile`, and that is deliberate. A ref carries `marksOverride`, `group`
 * and `note`, and a section carries `title`, `subtitle` and `instructions`.
 * Rebuilding a structure this function does not own is how a field disappears on
 * the next save with no history to recover it from. `cleanProfile` may rebuild
 * its sections because the profile editor owns every field of one.
 */
export function cleanPaper(draft: Paper, profile?: Profile): Paper {
  const out: Paper = {
    formatVersion: draft.formatVersion,
    type: draft.type,
    id: draft.id.trim(),
    title: draft.title.trim(),
    sections: draft.sections,
  }

  const subtitle = text(draft.subtitle)
  if (subtitle !== undefined) out.subtitle = subtitle

  const profileId = text(draft.profileId)
  if (profileId !== undefined) out.profileId = profileId

  const notes = text(draft.notes)
  if (notes !== undefined) out.notes = notes

  // Kept as given, `'draft'` included, unlike `cleanProfile` dropping a false
  // `marksAwardedColumn`. A status is set deliberately and cycled through, and a
  // paper that has been final and come back to draft should say so.
  if (draft.status !== undefined) out.status = draft.status

  const school = compact({
    name: text(draft.school?.name),
    course: text(draft.school?.course),
    yearGroup: text(draft.school?.yearGroup),
    date: text(draft.school?.date),
    logoFile: text(draft.school?.logoFile),
  })
  if (school) out.school = school

  for (const field of ['readingMinutes', 'workingMinutes'] as const) {
    const value = draft[field]
    // A negative cannot be written to a valid file at all (`minimum: 0`) and the
    // box will not produce one, so the only route in is a hand-edited file.
    // Dropped rather than reported: the profile's value then prints instead of a
    // nonsense one, and nothing else needs a `validatePaper` to exist.
    if (value === undefined || !Number.isFinite(value) || value < 0) continue
    if (profile !== undefined && value === profile.paper[field]) continue
    out[field] = value
  }

  const lines = (draft.instructions ?? []).map((line: string) => line.trim()).filter(Boolean)
  if (
    lines.length > 0 &&
    !(profile !== undefined && sameLines(lines, profile.paper.instructions))
  ) {
    out.instructions = lines
  }

  return out
}

/**
 * Set what a paper says about one question, and keep the file tidy.
 *
 * A ref is a plain `bank.json#id` string until it needs to carry something.
 * `marksOverride`, `group` and `note` need the object form, so this upgrades on
 * the way in and drops back to a string the moment nothing is left, rather than
 * leaving `{"file":…,"questionId":…}` behind to say what a string already said.
 */
export function setRefOptions(
  ref: PaperRef,
  // Written out rather than `Partial<Omit<…>>`, because `exactOptionalPropertyTypes`
  // refuses an explicit `undefined` there, and passing `undefined` is how a
  // caller clears a field.
  patch: {
    marksOverride?: number | undefined
    group?: string | undefined
    note?: string | undefined
  },
): PaperRef {
  const parsed = parseRef(ref)
  if (!parsed) return ref
  const before: PaperRefObject =
    typeof ref === 'object' ? ref : { file: parsed.file, questionId: parsed.questionId }

  const after: PaperRefObject = { file: before.file, questionId: before.questionId }
  const marksOverride = 'marksOverride' in patch ? patch.marksOverride : before.marksOverride
  const group = text('group' in patch ? patch.group : before.group)
  const note = text('note' in patch ? patch.note : before.note)

  if (marksOverride !== undefined && Number.isFinite(marksOverride) && marksOverride > 0) {
    after.marksOverride = marksOverride
  }
  if (group !== undefined) after.group = group
  if (note !== undefined) after.note = note

  const bare =
    after.marksOverride === undefined && after.group === undefined && after.note === undefined
  return bare ? `${after.file}#${after.questionId}` : after
}

/* ------------------------------------------------------------------------ ids */

const TYPE_ABBREVIATION: Record<QuestionType, string> = {
  multiple_choice: 'mc',
  multiple_response: 'mr',
  matching: 'mat',
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

  const stimulus = cleanStimuli(draft.stimulus)
  if (stimulus) out.stimulus = stimulus

  const guide = compact({
    sampleAnswer: text(draft.markingGuide?.sampleAnswer),
    criteria: cleanCriteria(draft.markingGuide?.criteria),
    answersCouldInclude: list(draft.markingGuide?.answersCouldInclude),
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

  // Last, because it is judged on `out` rather than on `draft`. Cleaning drops
  // empty options, half-blank parts and blank stimulus rows, and leaves an
  // absent answer absent, so the draft and the file can disagree about whether
  // the question is finished. What gets written has to be true of what is
  // written.
  const tags = finishTags(list(draft.tags), out)
  if (tags) out.tags = tags

  return out
}

/**
 * The teacher's own tags, with Klunk's mark on whether the question is done.
 *
 * Stamped and cleared on every save rather than left for a teacher to manage,
 * because a mark that only ever goes on is one the library lies with: a
 * question finished in the editor would keep saying it was not.
 *
 * The teacher's list is cut to nineteen before Klunk's tag is added, not to
 * twenty afterwards. `withTag` in `adopt.ts` and `readTags` in `ingest.ts` both
 * push and then slice, which silently drops Klunk's own tag on a question
 * already carrying twenty.
 */
function finishTags(tags: string[] | undefined, question: Question): string[] | undefined {
  const mine = (tags ?? []).filter((t) => t !== UNFINISHED_TAG)
  if (!isUnfinished(question)) return mine.length > 0 ? mine : undefined
  return [...mine.slice(0, 19), UNFINISHED_TAG]
}

/** Keep only the config keys the schema allows for this question type. */
function cleanConfig(type: QuestionType, cfg: QuestionConfig): QuestionConfig | undefined {
  switch (type) {
    case 'multiple_choice': {
      // Always written, even when empty: the schema requires config on a
      // multiple choice question, and validation has already refused to save an
      // empty one.
      const out: QuestionConfig = {
        choices: (cfg.choices ?? [])
          .filter((c) => c.text.trim())
          .map((c) => {
            const feedback = text(c.feedback)
            return feedback === undefined
              ? { text: c.text.trim() }
              : { text: c.text.trim(), feedback }
          }),
        shuffle: cfg.shuffle !== false,
      }
      // Written only when the question states it. This line used to put 0 in
      // when it did not, which is #64 surviving in the save path: the note the
      // reader wrote saying nobody chose an answer is gone the moment the
      // question is saved, and A is left standing on the marking guide.
      if (typeof cfg.correctAnswer === 'number') out.correctAnswer = cfg.correctAnswer
      return out
    }

    case 'multiple_response': {
      const out: QuestionConfig = {
        choices: (cfg.choices ?? [])
          .filter((c) => c.text.trim())
          .map((c) => {
            const feedback = text(c.feedback)
            return feedback === undefined
              ? { text: c.text.trim() }
              : { text: c.text.trim(), feedback }
          }),
        shuffle: cfg.shuffle !== false,
      }
      // Written only when the question states it. Defaulting to `[]` here would
      // turn "nobody said" into "none of them are answers", which is the whole
      // distinction this type was built to keep.
      if (cfg.correctAnswers !== undefined) {
        out.correctAnswers = [...cfg.correctAnswers].sort((a, b) => a - b)
      }
      return out
    }

    case 'matching':
      return {
        items: (cfg.items ?? [])
          .filter((item) => item.text.trim())
          .map((item) =>
            item.matches === undefined
              ? { text: item.text.trim() }
              : { text: item.text.trim(), matches: [...item.matches].sort((a, b) => a - b) },
          ),
        options: (cfg.options ?? [])
          .filter((o) => o.text.trim())
          .map((o) => ({ text: o.text.trim() })),
        ...(cfg.shuffle === false ? { shuffle: false } : {}),
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

/**
 * A list of stimulus entries, or nothing where none of them says anything.
 *
 * An entry with neither a file nor any text is a row the teacher opened and left
 * blank, and writing it would put `{"kind":"image"}` in the bank. Shared with the
 * parts, so a part's pictures are trimmed exactly as the question's are.
 */
function cleanStimuli(items: Stimulus[] | undefined): Stimulus[] | undefined {
  const out = (items ?? [])
    .map(cleanStimulus)
    .filter((s) => s.file !== undefined || s.text !== undefined)
  return out.length > 0 ? out : undefined
}

function cleanStimulus(s: Stimulus): Stimulus {
  const out: Stimulus = { kind: s.kind }
  if (s.kind === 'image') {
    const file = text(s.file)
    const alt = text(s.alt)
    if (file) out.file = file
    if (alt) out.alt = alt
    // Centre is the default, so writing it would put a field in every bank that
    // says what absence already says. Dropped off a text stimulus entirely, the
    // way `file` and `alt` are, since a block quote does not move.
    if (s.align !== undefined && s.align !== 'centre') out.align = s.align
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
  // Kept positionally: cell 2 of 3 being empty is meaningful, so an empty cell
  // is dropped only when every cell after it is empty too.
  const cells = (r.cells ?? []).map((c) => {
    const answers = list(c.answers)
    return answers ? { answers } : {}
  })
  while (cells.length > 0 && (cells[cells.length - 1]?.answers ?? []).length === 0) cells.pop()
  if (cells.length > 0) out.cells = cells
  if (r.marks !== undefined) out.marks = r.marks
  return out
}

function cleanPart(p: QuestionPart): QuestionPart {
  const out: QuestionPart = { label: p.label.trim(), text: p.text.trim(), marks: p.marks }
  if (p.answerLines !== undefined) out.answerLines = p.answerLines
  const sample = text(p.sampleAnswer)
  if (sample) out.sampleAnswer = sample
  const criteria = cleanCriteria(p.criteria)
  if (criteria) out.criteria = criteria
  const stimulus = cleanStimuli(p.stimulus)
  if (stimulus) out.stimulus = stimulus
  return out
}

/** `marksTo` is written only when it is a band, so an ordinary criterion stays two fields. */
function cleanCriteria(criteria: MarkCriterion[] | undefined): MarkCriterion[] | undefined {
  return nonEmpty(
    (criteria ?? [])
      .filter((c) => c.description.trim())
      .map((c) => ({
        marks: c.marks,
        ...(c.marksTo !== undefined && c.marksTo > c.marks ? { marksTo: c.marksTo } : {}),
        description: c.description.trim(),
      })),
  )
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
