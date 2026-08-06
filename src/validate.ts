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
  IdentificationField,
  MarkCriterion,
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

function validateCriterion(c: MarkCriterion, where: string, err: Report): void {
  if (!c.description.trim()) err('A criterion needs a description.', where)
  if (!Number.isFinite(c.marks)) err('A criterion needs a mark value.', where)
  if (c.marksTo !== undefined) {
    if (!Number.isFinite(c.marksTo)) {
      err('The top of a band must be a number.', where)
    } else if (c.marksTo <= c.marks) {
      // Beyond the schema, which can only say both are numbers. A band that runs
      // backwards prints as "15–13" and reads as a typing mistake, because it is.
      err(`A band runs from the lower mark to the higher one, so ${c.marks}–${c.marksTo} is backwards.`, where)
    }
  }
}

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

  // The first column holds the label, so the rest are answer columns.
  const answerColumns = Math.max(columns.length - 1, 0)

  rows.forEach((r, i) => {
    const where = `Row ${i + 1}`
    if (!r.label.trim()) err('This row has no label, so the student sees a blank line.', where)
    if (r.marks !== undefined && r.marks < 0) err('A row cannot be worth less than zero marks.', where)

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
    warn(
      'No row has an expected answer, so the marking guide prints an empty table.',
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
    p.criteria?.forEach((c, j) => validateCriterion(c, `${where}, criterion ${j + 1}`, err))
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
  if (g?.sampleAnswer?.trim() || g?.notes?.trim() || g?.criteria?.length) return true
  // A question split into parts carries its sample answers and criteria on the
  // parts, and then has no `markingGuide` of its own at all.
  return (question.config?.parts ?? []).some((p) => p.sampleAnswer?.trim() || p.criteria?.length)
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
  const err = (message: string, where?: string) =>
    out.push({ severity: 'error', message, where })
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

    const { questionCount, minQuestions, maxQuestions, marksPerQuestion } = section

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

    if (
      minQuestions !== undefined &&
      maxQuestions !== undefined &&
      minQuestions > maxQuestions
    ) {
      err(`The fewest questions (${minQuestions}) is more than the most (${maxQuestions})`, where)
    }

    if (marksPerQuestion !== undefined) {
      if (!(marksPerQuestion > 0)) {
        err('Marks per question has to be more than nothing', where)
      } else if (questionCount !== undefined && section.marks > 0) {
        // Beyond the schema. Both are facts about the same section, so if they
        // disagree the section can never be filled: HSC Section I is 10
        // questions at 1 mark and is worth 10.
        const implied = questionCount * marksPerQuestion
        if (implied !== section.marks) {
          err(
            `${questionCount} questions at ${marksPerQuestion} mark${marksPerQuestion === 1 ? '' : 's'} ` +
              `is ${implied}, but this section is worth ${section.marks}`,
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
    err(
      `The sections add up to ${total} marks, but the paper is set to ${paper.totalMarks}`,
    )
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
  const err = (message: string, where?: string) =>
    out.push({ severity: 'error', message, where })
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
function validateIdentification(
  field: IdentificationField,
  where: string,
  err: Report,
): void {
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
      err(`${field.boxes} boxes is more than fits across the cover. Use ${MAX_BOXES} or fewer.`, where)
    }
  }
}

/** The same beyond-the-schema rules, for the copy a profile may carry. */
export function validateCoverOverride(fields: IdentificationField[]): Check[] {
  const out: Check[] = []
  const err = (message: string, where?: string) =>
    out.push({ severity: 'error', message, where })
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
    criteria: cleanCriteria(draft.markingGuide?.criteria),
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
