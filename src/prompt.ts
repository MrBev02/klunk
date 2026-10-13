/**
 * Writing the prompt, so the teacher does not have to.
 *
 * Klunk holds no API key and talks to no AI service. What it can do is assemble
 * everything the model would otherwise have to be told by hand: which course,
 * which content points and their exact ids, what a mark is worth in this
 * subject, and the precise JSON it has to answer with. The teacher pastes that
 * into whatever their school licenses and pastes the result back.
 *
 * Two rules shape what goes in.
 *
 * The whole prompt is on screen before it is copied. The privacy claim is that
 * the teacher decides exactly what text leaves their machine, and that is only
 * true if there is nothing here they cannot read.
 *
 * The prompt asks for one type at one mark value. Making the JSON shape
 * conditional on a field the model chooses is the fastest way to get back
 * something that does not parse, and a teacher who wants ten multiple choice
 * and two short answer can run this twice.
 */

import { AI_TAG } from './ingest'
import type {
  Profile,
  Question,
  QuestionType,
  Syllabus,
  SyllabusCourse,
  SyllabusTopic,
} from './types'

export interface PromptSpec {
  syllabus: Syllabus
  course: SyllabusCourse
  /** Topics chosen, in syllabus order. */
  topics: SyllabusTopic[]
  /** Content point ids chosen, a subset of those topics' points. */
  pointIds: string[]
  questionType: QuestionType
  marks: number
  count: number
  /** The paper profile for this syllabus, when the folder has one. */
  profile?: Profile | undefined
  /** The teacher's own instruction, passed through verbatim. */
  extra?: string | undefined
  /**
   * Questions already written on these topics, whole.
   *
   * Only when the teacher asks for them: this is their own material going out
   * to somebody else's service, so it is a decision rather than a default.
   *
   * Whole rather than stems, because a stem alone answers neither question the
   * teacher has. Whether a draft is *similar* to one of these turns on what it
   * asks for and how it is marked, and a model can only match the house style
   * of a folder it has seen the inside of.
   */
  avoid?: Question[] | undefined
  /**
   * One of the teacher's own questions, to show the shape with.
   *
   * The opposite decision from `avoid`, and deliberately so. A worked example
   * is the strongest signal in the whole prompt, so an example from another
   * subject is not a neutral placeholder: it is an instruction to write about
   * kettles. One question the teacher can read in full in the prompt box is a
   * different exposure from their whole bank on those topics, so this is
   * offered by default and `avoid` is not. Left undefined, the built-in
   * example returns.
   */
  example?: Question | undefined
}

/** Ruled lines per mark when no profile says otherwise. */
const DEFAULT_LINES_PER_MARK = 2

export function buildPrompt(spec: PromptSpec): string {
  const blocks = [
    opening(spec),
    syllabusContext(spec),
    conventions(spec),
    alreadyWritten(spec),
    shape(spec),
    markupRules("A question's text, a part's text and an option's text"),
    example(spec),
  ]
  return blocks.filter(Boolean).join('\n\n').trimEnd() + '\n'
}

/* ----------------------------------------------------------------- the ask */

function opening(spec: PromptSpec): string {
  const { count, marks, questionType } = spec
  const each = questionType === 'true_false' ? 'statement' : 'question'
  return [
    `Write ${count} original examination ${each}${count === 1 ? '' : 's'} of type ` +
      `"${questionType}", each worth ${marks} mark${marks === 1 ? '' : 's'}, for ` +
      `${courseLabel(spec)}.`,
    '',
    `Answer with JSON and nothing else: one \`\`\`json code block holding an array ` +
      `of ${count} object${count === 1 ? '' : 's'}, with no commentary before or ` +
      `after it. The exact shape is set out at the end.`,
  ].join('\n')
}

function courseLabel(spec: PromptSpec): string {
  const authority = spec.syllabus.authority ? ` (${spec.syllabus.authority})` : ''
  return `${plain(spec.syllabus.name)}, ${plain(spec.course.name)}${authority}`
}

/* ------------------------------------------------------------ syllabus context */

/**
 * The syllabus the reply may name, and nothing outside it.
 *
 * Exported because `examprompt.ts` needs the identical block: a model asked for
 * a whole paper chooses ids the same way and has to be held to the same list,
 * and two lists written two ways would eventually offer ids the reader rejects.
 */
export function syllabusContext(
  spec: Pick<PromptSpec, 'syllabus' | 'course' | 'topics' | 'pointIds'>,
): string {
  const lines = ['## What these questions assess', '']

  const version = spec.syllabus.syllabusVersion
  lines.push(`Syllabus: ${plain(spec.syllabus.name)}${version ? `, ${plain(version)}` : ''}`)
  lines.push(`Course: ${plain(spec.course.name)}`)
  lines.push('')

  const chosen = new Set(spec.pointIds)
  for (const topic of spec.topics) {
    lines.push(`Topic ${topic.id}: ${plain(topic.name)}`)
    // The question the syllabus frames the topic with. Not a content point and
    // never tagged against, but it is the best statement there is of what the
    // topic is for, which is exactly what is being asked for here.
    if (topic.inquiryQuestion) lines.push(`  Inquiry question: ${plain(topic.inquiryQuestion)}`)

    const all = topic.points ?? []
    const byId = new Map(all.map((p) => [p.id, p]))
    for (const point of all) {
      if (!chosen.has(point.id)) continue
      const parent = point.parent ? byId.get(point.parent) : undefined
      // A sub-item read on its own says nothing — "the cane toad" is a content
      // point of Biology. It is the item above that carries the verb, so where
      // that item was not itself chosen it goes in as context. Without an id,
      // deliberately: it is not something the teacher asked for a question on,
      // and every id printed here is one the reply is allowed to name.
      if (parent && !chosen.has(parent.id)) {
        lines.push(`  Under: ${plain(parent.text)}`)
      }
      lines.push(`  ${parent ? '  ' : ''}${point.id}  ${plain(point.text)}`)
    }
    lines.push('')
  }

  lines.push(
    'Every question must address at least one of those content points, and must',
    'name the ones it addresses in "pointIds". Use no id that is not listed above.',
  )

  const outcomes = outcomesFor(spec)
  if (outcomes.length > 0) {
    lines.push(
      '',
      'Outcomes. Put a code in "outcomes" only where the question genuinely',
      'assesses it, and use no code that is not listed here.',
      '',
    )
    for (const o of outcomes) lines.push(`  ${o.code}  ${plain(o.text)}`)
  }

  return lines.join('\n')
}

/**
 * The outcomes the chosen topics are tagged against, or the whole course when
 * the syllabus does not map outcomes onto topics.
 */
export function outcomesFor(spec: Pick<PromptSpec, 'course' | 'topics'>): {
  code: string
  text: string
}[] {
  const wanted = new Set(spec.topics.flatMap((t) => t.outcomes ?? []))
  const all = spec.course.outcomes ?? []
  const narrowed = all.filter((o) => wanted.has(o.code))
  return narrowed.length > 0 ? narrowed : all
}

/* -------------------------------------------------------------- how to write */

function conventions(spec: PromptSpec): string {
  const lines = ['## How to write them', '']

  const bullets = [
    'Australian English throughout: analyse, organisation, behaviour, colour, ' +
      'visualisation. Never analyze or color.',
    'Metric units, AUD, and Australian products, users and settings wherever a ' +
      'context is needed.',
    'Write original questions. Do not reproduce, translate or lightly reword a ' +
      'question from a past examination paper, and do not lift the wording of the ' +
      'content points above into the question itself.',
    'This subject is assessed through designing and producing, so ask about ' +
      'products, users, materials, processes and their consequences rather than ' +
      'about definitions.',
    marksGuidance(spec),
  ]

  const section = sectionNote(spec)
  if (section) bullets.push(section)

  bullets.push(
    'A question is finished only when a second marker could reach the same mark ' +
      'from the marking guide alone.',
  )

  for (const b of bullets) lines.push(`- ${b}`)

  const extra = spec.extra?.trim()
  if (extra) {
    lines.push('', 'The teacher has also asked for this, and it takes precedence:', '', extra)
  }

  return lines.join('\n')
}

/**
 * What a mark is worth here, which is the thing a model most often gets wrong.
 *
 * A model asked for a four-mark question will happily write one a student could
 * answer in six words. The bands are the ordinary reading of NESA's key words
 * by mark value, and the line count comes from the profile so it matches what
 * the paper will actually print.
 */
export function marksGuidance(
  spec: Pick<PromptSpec, 'questionType' | 'marks' | 'profile'>,
): string {
  const { marks, questionType } = spec

  if (questionType === 'multiple_choice') {
    return (
      `Each question is worth ${marks} mark${marks === 1 ? '' : 's'}: one decision. ` +
      'The stem has to be answerable before the options are read, and every option ' +
      'has to be plausible to a student who holds a particular misconception.'
    )
  }
  if (questionType === 'multiple_response') {
    return (
      `Each question is worth ${marks} mark${marks === 1 ? '' : 's'} for the whole set, ` +
      'so a student who picks two answers of three earns nothing. That is what makes ' +
      'a marginal option fatal here: every one has to be plainly in or plainly out.'
    )
  }
  if (questionType === 'matching') {
    return (
      `Each question is worth ${marks} mark${marks === 1 ? '' : 's'} for the whole ` +
      'grid, so every pairing has to be the only defensible one. Six items is the ' +
      'usual size.'
    )
  }
  if (questionType === 'true_false') {
    return (
      `Each statement is worth ${marks} mark${marks === 1 ? '' : 's'} and must be ` +
      'unambiguously true or unambiguously false. A statement that is true in most ' +
      'cases is a bad question, not a hard one.'
    )
  }

  const linesPerMark = spec.profile?.print?.linesPerMark ?? DEFAULT_LINES_PER_MARK
  const ruled = Math.round(marks * linesPerMark)
  return (
    `Each question is worth ${marks} mark${marks === 1 ? '' : 's'}. ${expectation(marks)} ` +
    `The paper allows about ${ruled} ruled line${ruled === 1 ? '' : 's'}, so pitch the ` +
    'question at an answer that size.'
  )
}

function expectation(marks: number): string {
  if (marks <= 1) return 'At one mark a student identifies or names something, in a phrase.'
  if (marks <= 3)
    return 'At two or three marks a student outlines or describes, and gives a reason.'
  if (marks <= 6) {
    return (
      'At four to six marks a student explains or analyses: a position, and the ' +
      'reasoning that supports it.'
    )
  }
  if (marks <= 11) {
    return (
      'At seven to eleven marks a student sustains several linked points and relates ' +
      'them to each other rather than listing them.'
    )
  }
  return (
    'At twelve marks or more this is an extended response: a sustained argument judged ' +
    'as a whole against bands, not counted point by point.'
  )
}

/** Where this type of question actually sits on the paper, when a profile says. */
function sectionNote(spec: PromptSpec): string | null {
  const paper = spec.profile?.paper
  if (!paper) return null

  const section = paper.sections.find((s) => (s.questionTypes ?? []).includes(spec.questionType))
  if (!section) return null

  const count =
    section.questionCount !== undefined
      ? `${section.questionCount} question${section.questionCount === 1 ? '' : 's'}`
      : section.minQuestions !== undefined || section.maxQuestions !== undefined
        ? `${section.minQuestions ?? 1} to ${section.maxQuestions ?? '?'} questions`
        : null

  return (
    `On the real paper this type sits in ${plain(section.name)}, worth ` +
    `${section.marks} of ${paper.totalMarks} marks${count ? ` over ${count}` : ''}.`
  )
}

/* ----------------------------------------------------------- what not to repeat */

/**
 * How many of the teacher's questions go out, at most.
 *
 * Stems were cheap and this is not: a whole question carries its options, its
 * feedback and its marking guide. A course with two hundred questions tagged to
 * the chosen topics would otherwise build a prompt no chat box will accept, and
 * the teacher would find that out by pasting it.
 *
 * The number is a judgement rather than a measurement. Forty whole questions is
 * already a long read and well past the point where another one changes what
 * the model writes.
 */
const AVOID_LIMIT = 40

function alreadyWritten(spec: PromptSpec): string {
  const all = (spec.avoid ?? []).filter((q) => plain(q.questionText))
  if (all.length === 0) return ''

  // Most like what is being asked for first, so the ones the cap drops are the
  // ones least likely to be duplicated anyway.
  const sorted = nearestFirst(all, spec)
  const shown = sorted.slice(0, AVOID_LIMIT)

  const lines = [
    '## Questions this course already has',
    '',
    'Write nothing that duplicates one of these, in substance or in wording, and ' +
      'nothing close enough to sit beside one on the same paper. They are here to ' +
      'be avoided rather than copied: where the example further down is one of ' +
      'them, that is the only one to write like.',
    '',
  ]

  for (const q of shown) {
    lines.push('```json', asPromptJson(q), '```', '')
  }

  if (all.length > shown.length) {
    // Never a silent cap. A truncated list with nothing said reads as "these
    // are all of them", which is a worse instruction than a short list.
    lines.push(
      `Those are the ${shown.length} of ${all.length} questions on these topics ` +
        `closest to what is being asked for. Another ${all.length - shown.length} ` +
        'are not listed, so treat this as a sample rather than the whole bank.',
    )
  }

  return lines.join('\n').trimEnd()
}

/**
 * The questions nearest to what is being asked for, first.
 *
 * The same preferences `pickExample` ranks by, minus the ones that are about
 * being a good example rather than about being a likely duplicate: whether an
 * AI drafted it and whether it carries a marking guide say nothing about the
 * risk of writing it twice.
 */
function nearestFirst(questions: Question[], spec: PromptSpec): Question[] {
  const points = new Set(spec.pointIds)
  return questions
    .map((q) => ({
      question: q,
      sameType: q.questionType === spec.questionType ? 0 : 1,
      onPoint: (q.syllabus?.pointIds ?? []).some((id) => points.has(id)) ? 0 : 1,
      distance: Math.abs(q.marks - spec.marks),
    }))
    .sort(
      (a, b) =>
        a.onPoint - b.onPoint ||
        a.sameType - b.sameType ||
        a.distance - b.distance ||
        a.question.id.localeCompare(b.question.id),
    )
    .map((r) => r.question)
}

/* ------------------------------------------------------------- the JSON shape */

function shape(spec: PromptSpec): string {
  const { count, marks, questionType } = spec
  const lines = [
    '## The JSON to return',
    '',
    `An array of exactly ${count} object${count === 1 ? '' : 's'}. Each object uses ` +
      'these fields and no others.',
    '',
    `  questionType   "${questionType}"`,
    '  questionText   the question exactly as a student reads it',
    `  marks          ${marks}`,
    '  difficulty     a whole number 1 to 5, 1 easiest (optional)',
    '  syllabus       { "pointIds": [...] } using the ids listed above',
    '  outcomes       [...] using the codes listed above',
    '  tags           up to five short words of your own (optional)',
  ]

  lines.push(...typeShape(questionType, marks))

  lines.push(
    '',
    'Leave out "id": Klunk assigns ids itself, and one you invent is discarded.',
    'Leave out "syllabusId" and "courseId": Klunk fills those in.',
    'Leave out "stimulus" unless it is a short piece of text the student reads, ' +
      'or program code the question refers to. Klunk cannot fetch an image you name.',
    'Program code is a stimulus of the form { "kind": "code", "text": "..." }, with ' +
      'every space of its indentation kept and \\n between lines. Klunk numbers ' +
      'the lines itself, so do not write numbers into the code.',
    'Any field not listed above is dropped when the question is read back in.',
  )

  return lines.join('\n')
}

/**
 * The fields one question type needs, as every prompt sets them out.
 *
 * Shared with `examprompt.ts`, which asks for a whole paper and so has to set
 * out several types at once. One copy, for the reason `asPromptJson` is one
 * copy: two descriptions of the same JSON drift, and the reader only measures
 * the reply against one of them.
 *
 * `marks` is undefined where the paper leaves the mark value of a question to
 * the model, which a section worth 40 over six questions does. The two lines
 * that name a number then name the question instead, rather than asserting a
 * total that is not true of it.
 */
export function typeShape(type: QuestionType, marks: number | undefined): string[] {
  const lines = [...guideFields(type), '', '  config:', ...configFields(type, marks)]
  const extras = guideNotes(type, marks)
  if (extras.length > 0) lines.push('', ...extras)
  return lines
}

function guideFields(type: QuestionType): string[] {
  if (type === 'multiple_choice' || type === 'multiple_response' || type === 'true_false') {
    return ['  markingGuide   not needed; the option feedback below does that work']
  }
  if (type === 'matching') {
    return ['  markingGuide   not needed; the links below are the whole answer']
  }
  return [
    '  markingGuide   { "sampleAnswer": "...",',
    '                   "criteria": [ { "marks": 2, "description": "..." } ],',
    '                   "notes": "..." }',
    '                 A criterion covering a range of marks carries "marksTo" as',
    '                 well, so a band of 13 to 15 is { "marks": 13, "marksTo": 15,',
    '                 "description": "..." }.',
  ]
}

function configFields(type: QuestionType, marks: number | undefined): string[] {
  switch (type) {
    case 'multiple_choice':
      return [
        '    choices        exactly four, as',
        '                   [ { "text": "...", "feedback": "..." } ]',
        '    correctAnswer  a number: the position of the correct option in',
        '                   "choices", counting from zero. 0 is the first option,',
        '                   3 is the fourth. Not a letter, not the option text.',
      ]
    case 'multiple_response':
      return [
        '    choices        six or seven, as',
        '                   [ { "text": "...", "feedback": "..." } ]',
        '    correctAnswers an array of numbers: the positions in "choices" of every',
        '                   option that is an answer, counting from zero. Two or',
        '                   three of them. Not letters, not the option text.',
      ]
    case 'matching':
      return [
        '    items          the numbered column, as',
        '                   [ { "text": "...", "matches": [2] } ]',
        '                   "matches" holds the positions in "options" this item',
        '                   links to, counting from zero. Usually one.',
        '    options        the lettered column, as [ { "text": "..." } ]',
        '                   Same length as "items" unless you mean to leave spare',
        '                   options nothing links to.',
      ]
    case 'true_false':
      return [
        '    correctAnswer  true or false',
        '    feedbackTrue   why a student answering true is right or wrong',
        '    feedbackFalse  why a student answering false is right or wrong',
      ]
    case 'short_answer':
    case 'extended_response': {
      const total = marks === undefined ? 'the marks for the question' : String(marks)
      return [
        '    answerLines    whole number of ruled lines (optional; Klunk works it',
        '                   out from the marks if you leave it out)',
        '    parts          optional (a), (b), (c) breakdown, as',
        '                   [ { "label": "(a)", "text": "...", "marks": 2,',
        '                       "sampleAnswer": "..." } ]',
        `                   If you use parts, their marks must total ${total}.`,
      ]
    }
    case 'table':
      return [
        '    columns        every column heading, in the order printed, as',
        '                   ["Production run", "Process", "Reason"]. The first is',
        '                   what the student is given; the rest are what they',
        '                   complete.',
        '    rows           [ { "label": "...", "marks": 1,',
        '                       "cells": [ { "answers": ["...", "..."] } ] } ]',
        '                   "label" prints in the first column. "cells" holds one',
        '                   entry per column after the first, in order, and its',
        '                   "answers" is every wording a marker should accept in',
        '                   that one cell, listed separately.',
      ]
    case 'drawing':
      return [
        '    subtype        one of sketch, diagram, flowchart, orthographic, freehand',
        '    instructions   what the student must draw, label or annotate',
        '    spaceMm        [width, height] of the blank area in millimetres. The',
        '                   printable area of an A4 page is about 180 by 240.',
        '    grid           true to print a faint grid in that area',
      ]
  }
}

function guideNotes(type: QuestionType, marks: number | undefined): string[] {
  switch (type) {
    case 'multiple_choice':
      return [
        'Every option carries "feedback", the correct one included. On a wrong option',
        'it names the specific misconception a student who chose it holds. "Incorrect"',
        'is not feedback.',
      ]
    case 'extended_response':
      return [
        'The criteria for an extended response are bands, not components. List four or',
        'five, highest marks first, each one describing a whole response at that',
        `standard, and reach ${marks === undefined ? "the question's marks" : marks} at the top.`,
        'They are alternatives, so they do not add up.',
        'A band covers a range of marks, so give each one "marks" and "marksTo",',
        'and leave no mark between 1 and the top uncovered.',
      ]
    case 'table':
      return [
        'The headings and the row labels are "columns" and "rows". Never write the',
        'table into "questionText" as a pipe table: that prints as a table the',
        'student only reads, where this type prints the empty cells they write in.',
        'Row marks should total the marks for the question.',
        'Every row needs one cell for every column after the first, in the same',
        'order as the headings. A cell with nothing to accept is still an entry,',
        'written as {}, because the cells are matched to columns by position.',
      ]
    case 'drawing':
      return [
        'The criteria say what has to be visible in the drawing to earn each mark.',
        'A drawing question a marker cannot mark from the criteria alone is not one.',
      ]
    case 'multiple_response':
      return [
        'More than one option is an answer, and the student is told so but not told how',
        'many. So every option has to be decidable on its own: an option that is',
        'arguably right makes the whole question unmarkable, where in multiple choice it',
        'would only be a weak distractor.',
        'Every option carries "feedback", saying why it is or is not one of the answers.',
      ]
    case 'matching':
      return [
        'Each numbered item must match exactly one lettered option, and no option may',
        'fit two items. The commonest fault is a pair of options a student could argue',
        'either way round, which makes both items unmarkable.',
        'Write the two columns so that reading down them in order does not give the',
        'answer away — Klunk shuffles the lettered column when it prints, but a teacher',
        'reading your reply should not see 1-A, 2-B, 3-C either.',
      ]
    case 'short_answer':
    case 'true_false':
      return []
  }
}

/* ------------------------------------------------------------- the markup */

/**
 * The markup a reply may carry, shared by all three prompts.
 *
 * One copy, because two would drift and the whole point is that the vocabulary
 * a model is told matches the one `richtext.tsx` reads. Nothing had ever told a
 * model any of it: a paper printing a table of readings came back as a
 * paragraph of loose values, which is exactly the fault #88 built the pipe
 * table to fix, arriving through the one route that route never covered (#101).
 *
 * `where` names the fields, because they differ: a marking guide's markup lives
 * on a criterion and a sample answer, not on a question stem.
 */
export function markupRules(where: string): string {
  return [
    '## Markup',
    '',
    `${where} may carry a little markup, and no other markup is read.`,
    '',
    '- A line break is written \\n inside a JSON string, so text of several',
    '  paragraphs is still one string. A blank line starts a new paragraph.',
    '- A table is written as a pipe table, with the row of dashes under the',
    '  headings:',
    '',
    '      | Time | Temperature (\u00b0C) |',
    '      | --- | --- |',
    '      | 4 am | 18.8 |',
    '      | 8 am | 21.4 |',
    '',
    '  Keep every column and every row. Never flatten a table into a sentence or',
    '  a run of values.',
    '- **bold**, *italic* and <u>underline</u>, where the text is printed that',
    '  way.',
    '- `code` in backticks, only where the paper prints it in a fixed-width font,',
    '  such as a variable name or a formula. Nothing inside backticks is markup.',
    '- Write \\*, \\|, \\< or \\` for one of those characters where it is not markup.',
    '',
    'No headings, no bullet lists, no links, no images.',
  ].join('\n')
}

/* ----------------------------------------------------------------- an example */

/**
 * The example: one of the teacher's own questions, or the built-in one.
 *
 * Their own is the better example by a distance. It is in their subject, at
 * their school's pitch, tagged against ids that exist, and it shows the model
 * how questions in this folder are actually written rather than how questions
 * in general are. The built-in is the fallback for an empty bank and for a
 * teacher who would rather send nothing of theirs.
 *
 * The built-in keeps the id substitution it always had: an example carrying ids
 * from some other topic is an invitation to copy them, and a model that does
 * gets its tagging dropped on the way back in. Its marks are left alone,
 * because rewriting them would leave the criteria beneath adding up to
 * something else, so the caveat says so instead. Neither problem arises for the
 * teacher's own question, whose ids and marks are already true of it.
 */
function example(spec: PromptSpec): string {
  const own = spec.example
  const json = own ? asPromptJson(own) : filledIn(spec)

  const marks = `worth ${spec.marks} mark${spec.marks === 1 ? '' : 's'} each`
  const yours = spec.count === 1 ? 'question is' : 'questions are'

  return [
    own ? `### One of your own questions, ${own.id}` : '### One object, filled in',
    '',
    '```json',
    json,
    '```',
    '',
    own
      ? // Named in the heading rather than merely shown. A teacher who did not
        // expect one of their own questions in the prompt has to be able to
        // find which one it was, and the checkbox that turns it off.
        `Copy the shape and the pitch of that question. Do not reuse, reword or ` +
        `answer it. Your ${yours} ${marks} and use only the ids listed further up.`
      : // Said plainly, because the built-in is Design and Technology whatever
        // subject is loaded (#116) and the example is the strongest signal in
        // the prompt. Without this line there is nothing to tell a Textiles
        // teacher's model that the kettle is not a hint. Phrased as "not a hint"
        // rather than "another subject" because it has to stay true for the one
        // teacher the built-in does fit.
        `Copy the structure of that example only. Its subject matter is not a ` +
        `hint: write about the content points listed above. Your ${yours} ${marks} ` +
        'and use only the ids listed further up.',
  ].join('\n')
}

/** The built-in example for this type, with the teacher's own ids in it. */
function filledIn(spec: PromptSpec): string {
  return typeExample(spec.questionType, spec.pointIds[0], outcomesFor(spec)[0]?.code)
}

/**
 * One worked question of this type, carrying ids the teacher's own model holds.
 *
 * Exported for `examprompt.ts`, which sets out several types at once and needs
 * the same demonstration for each. It is the same reason `typeShape` is shared:
 * a second set of examples would drift from the first, and the example is the
 * part a model actually copies. The substitution matters as much as the
 * example — an id from the built-in D&T question is one `ingest` drops, and a
 * model copying the shape copies the ids in it.
 */
export function typeExample(
  type: QuestionType,
  pointId: string | undefined,
  outcome: string | undefined,
): string {
  let json = EXAMPLES[type]
  if (pointId) json = json.replace(/"pointIds": \[[^\]]*\]/, `"pointIds": ["${pointId}"]`)
  if (outcome) json = json.replace(/"outcomes": \[[^\]]*\]/, `"outcomes": ["${outcome}"]`)
  return json
}

/**
 * A question as the prompt asks for it back.
 *
 * The same function serves the example and the questions not to write again,
 * which is the point: an example produced by anything other than the shape the
 * reply is measured against will eventually disagree with it, and the example
 * is what a model actually copies.
 *
 * So the fields here are the fields `shape` lists, in that order, and the ones
 * it explicitly tells a model to leave out are the ones dropped: `id`, because
 * Klunk assigns them; `syllabusId` and `courseId`, because Klunk fills them in;
 * an image stimulus, because Klunk cannot fetch an image a model names and an
 * example carrying one teaches it to try. `source` goes too. It is provenance
 * rather than content, and a model shown "2019 HSC question 24" has been handed
 * the one thing the conventions above forbid it to reproduce.
 */
export function asPromptJson(question: Question): string {
  return pretty(promptFields(question), '')
}

/**
 * The same question as fields rather than as text, for an envelope around it.
 *
 * `examprompt.ts` writes a whole paper out at once and cannot paste strings
 * into it: the questions sit inside sections, and the layout below indents by
 * depth. Splitting it here rather than there is what keeps one description of
 * what a question looks like to a model.
 */
export function promptFields(question: Question): Record<string, unknown> {
  const out: Record<string, unknown> = {
    questionType: question.questionType,
    questionText: question.questionText,
    marks: question.marks,
  }

  if (question.difficulty !== undefined) out.difficulty = question.difficulty
  if (question.syllabus?.pointIds?.length) {
    out.syllabus = { pointIds: question.syllabus.pointIds }
  }
  if (question.outcomes?.length) out.outcomes = question.outcomes
  if (question.tags?.length) out.tags = question.tags

  const stimulus = (question.stimulus ?? []).filter((s) => s.kind !== 'image' && s.text)
  if (stimulus.length > 0) {
    out.stimulus = stimulus.map((s) =>
      compactly({
        kind: s.kind,
        text: s.text,
        lineNumbers: s.lineNumbers === false ? false : undefined,
        caption: s.caption,
      }),
    )
  }

  if (question.markingGuide) {
    const guide = compactly({
      sampleAnswer: question.markingGuide.sampleAnswer,
      criteria: question.markingGuide.criteria?.length ? question.markingGuide.criteria : undefined,
      answersCouldInclude: question.markingGuide.answersCouldInclude?.length
        ? question.markingGuide.answersCouldInclude
        : undefined,
      notes: question.markingGuide.notes,
    })
    if (Object.keys(guide).length > 0) out.markingGuide = guide
  }

  if (question.config && Object.keys(question.config).length > 0) out.config = question.config

  return out
}

/**
 * JSON laid out the way the built-in examples are laid out.
 *
 * `JSON.stringify(x, null, 2)` puts every element of every array on its own
 * line, so a four-option question runs to thirty lines and a `pointIds` holding
 * one id runs to four. The built-in examples keep anything short on one line,
 * and they are what a model has always been shown, so the questions beside them
 * should not look like a different format. It matters more than tidiness in the
 * avoid block, where forty questions are printed at once.
 */
export function pretty(value: unknown, indent: string): string {
  const flat = flatten(value)
  if (indent.length + flat.length <= PRETTY_WIDTH) return flat

  const inner = indent + '  '
  if (Array.isArray(value)) {
    const items = value.map((v) => inner + pretty(v, inner))
    return `[\n${items.join(',\n')}\n${indent}]`
  }
  if (value && typeof value === 'object') {
    const items = Object.entries(value as Record<string, unknown>).map(
      ([key, v]) => `${inner}${JSON.stringify(key)}: ${pretty(v, inner)}`,
    )
    return `{\n${items.join(',\n')}\n${indent}}`
  }
  // A long string stays on its line. Nothing can be done about it, and the
  // built-in examples carry 378-character sample answers the same way.
  return flat
}

/** Wide enough for an option and its feedback, which is the line that decides. */
const PRETTY_WIDTH = 100

/** One line, still valid JSON: whitespace inside is what makes it readable. */
function flatten(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(flatten).join(', ')}]`
  if (value && typeof value === 'object') {
    const parts = Object.entries(value as Record<string, unknown>).map(
      ([key, v]) => `${JSON.stringify(key)}: ${flatten(v)}`,
    )
    return parts.length > 0 ? `{ ${parts.join(', ')} }` : '{}'
  }
  return JSON.stringify(value) ?? 'null'
}

/** The keys that hold something, in the order they were given. */
function compactly(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== '') out[key] = value
  }
  return out
}

/**
 * Which of the teacher's questions to show, out of the ones that could be shown.
 *
 * Ranked rather than picked, because every rule here is a preference and none
 * of them is a requirement except the type: an example of the wrong type
 * teaches the wrong JSON, and there is no partial credit for that.
 *
 * The order the preferences are applied in is the order they matter in, and the
 * last one is `id` so that a teacher who reads the prompt, changes nothing and
 * looks again sees the same question. A pick that moves on every render reads
 * as a fault whether or not it is one.
 */
export function pickExample(
  pool: Question[],
  want: { questionType: QuestionType; marks: number; pointIds?: string[]; topicIds?: string[] },
): Question | undefined {
  const points = new Set(want.pointIds ?? [])
  const topics = new Set(want.topicIds ?? [])

  const ranked = pool
    .filter((q) => q.questionType === want.questionType)
    .map((q) => ({
      question: q,
      // A model shown its own prior output compounds its own drift, so a
      // question read off a real paper or written by the teacher outranks one
      // an AI drafted. The tag is a record of where it came from (#2), which is
      // exactly what makes it usable here.
      ai: (q.tags ?? []).includes(AI_TAG) ? 1 : 0,
      onPoint: (q.syllabus?.pointIds ?? []).some((id) => points.has(id)) ? 0 : 1,
      onTopic: (q.syllabus?.topicIds ?? []).some((id) => topics.has(id)) ? 0 : 1,
      // The example exists to demonstrate criteria and bands, which is the part
      // models get wrong. One with no guide at all demonstrates nothing.
      unguided: needsGuide(q.questionType) && !hasGuide(q) ? 1 : 0,
      distance: Math.abs(q.marks - want.marks),
    }))
    .sort(
      (a, b) =>
        a.ai - b.ai ||
        a.onPoint - b.onPoint ||
        a.onTopic - b.onTopic ||
        a.unguided - b.unguided ||
        a.distance - b.distance ||
        a.question.id.localeCompare(b.question.id),
    )

  return ranked[0]?.question
}

/** Whether this type carries its marking in a guide rather than in its options. */
function needsGuide(type: QuestionType): boolean {
  return !(
    type === 'multiple_choice' ||
    type === 'multiple_response' ||
    type === 'true_false' ||
    type === 'matching'
  )
}

function hasGuide(q: Question): boolean {
  const guide = q.markingGuide
  if (!guide) return false
  return Boolean(guide.sampleAnswer || guide.criteria?.length || guide.answersCouldInclude?.length)
}

/**
 * A worked example per type, invented for the purpose.
 *
 * A model follows an example far more reliably than a description, and these
 * exist so the awkward parts are demonstrated rather than asserted:
 * `correctAnswer` as a zero-based index, criteria that descend as bands, table
 * answers as alternatives.
 */
const EXAMPLES: Record<QuestionType, string> = {
  multiple_choice: `{
  "questionType": "multiple_choice",
  "questionText": "A designer is choosing the handle material for an electric kettle. Which property of the material matters most to the safety of the user?",
  "marks": 1,
  "difficulty": 2,
  "syllabus": { "pointIds": ["HSC-01.07"] },
  "outcomes": ["H1.1"],
  "tags": ["materials", "safety"],
  "config": {
    "choices": [
      { "text": "Thermal conductivity", "feedback": "Correct. A handle that conducts heat from the body of the kettle burns the hand pouring it." },
      { "text": "Density", "feedback": "Density decides how heavy the kettle feels, which is comfort rather than safety." },
      { "text": "Surface finish", "feedback": "Finish affects grip and appearance. A poor grip is a nuisance where a hot handle is an injury." },
      { "text": "Recyclability", "feedback": "Recyclability matters at the end of the product's life, not while it is being used." }
    ],
    "correctAnswer": 0
  }
}`,

  multiple_response: `{
  "questionType": "multiple_response",
  "questionText": "Which of the following are properties of a thermosetting polymer?",
  "marks": 1,
  "difficulty": 3,
  "syllabus": { "pointIds": ["HSC-01.07"] },
  "outcomes": ["H1.1"],
  "tags": ["materials"],
  "config": {
    "choices": [
      { "text": "It cannot be softened and reshaped once cured", "feedback": "An answer. Curing forms cross-links between the chains, and they do not break with heat." },
      { "text": "It chars or burns rather than melting", "feedback": "An answer, and the same fact seen from the workshop: there is no melting point to work to." },
      { "text": "It holds its shape at temperatures that would soften a thermoplastic", "feedback": "An answer. This is why thermosets are used for saucepan handles and electrical fittings." },
      { "text": "It can be reground and moulded again", "feedback": "Not an answer. This is a thermoplastic, and it is why thermoplastics are the recyclable ones." },
      { "text": "It softens each time it is heated", "feedback": "Not an answer. This is the defining property of a thermoplastic." },
      { "text": "It is always transparent", "feedback": "Not an answer, and not true of either family: transparency depends on the polymer and its fillers." }
    ],
    "correctAnswers": [0, 1, 2]
  }
}`,

  matching: `{
  "questionType": "matching",
  "questionText": "Match each joining method with the situation it suits.",
  "marks": 1,
  "difficulty": 2,
  "syllabus": { "pointIds": ["HSC-01.07"] },
  "outcomes": ["H1.1"],
  "tags": ["manufacturing"],
  "config": {
    "items": [
      { "text": "A joint that must be taken apart for servicing", "matches": [2] },
      { "text": "A continuous seal between two steel plates", "matches": [0] },
      { "text": "Two acrylic sheets joined with no visible fastener", "matches": [3] },
      { "text": "A frame corner carrying load in two directions", "matches": [1] }
    ],
    "options": [
      { "text": "Welding" },
      { "text": "Mortise and tenon" },
      { "text": "Machine screw and captive nut" },
      { "text": "Solvent cement" }
    ]
  }
}`,

  true_false: `{
  "questionType": "true_false",
  "questionText": "A Gantt chart shows both the order of the tasks in a project and how long each one takes.",
  "marks": 1,
  "difficulty": 2,
  "syllabus": { "pointIds": ["HSC-03.02"] },
  "config": {
    "correctAnswer": true,
    "feedbackTrue": "Correct. The bars carry duration and their positions carry sequence, which is what separates a Gantt chart from a task list.",
    "feedbackFalse": "A Gantt chart does show duration: the length of each bar is the time the task takes."
  }
}`,

  short_answer: `{
  "questionType": "short_answer",
  "questionText": "A furniture manufacturer is replacing solid hardwood with a bamboo laminate in a range of school chairs. Explain ONE consequence of this change for the environment and ONE consequence for the student using the chair.",
  "marks": 4,
  "difficulty": 3,
  "syllabus": { "pointIds": ["HSC-13.01"] },
  "outcomes": ["H4.2"],
  "tags": ["materials", "sustainability"],
  "markingGuide": {
    "sampleAnswer": "Bamboo is ready to harvest in three to five years where a hardwood takes decades, so the stock is renewed within the life of the chair range rather than drawn down. For the student, the laminate is harder at the surface than most hardwoods and resists the denting a school chair takes, though a damaged edge cannot be sanded back the way solid timber can.",
    "criteria": [
      { "marks": 2, "description": "Explains one environmental consequence and names the property of bamboo that causes it." },
      { "marks": 2, "description": "Explains one consequence for the user, such as surface hardness, weight or repairability." }
    ]
  },
  "config": { "answerLines": 8 }
}`,

  extended_response: `{
  "questionType": "extended_response",
  "questionText": "Evaluate the influence of emerging technologies on the work of designers in ONE field of design you have studied.",
  "marks": 15,
  "difficulty": 4,
  "syllabus": { "pointIds": ["HSC-05.03"] },
  "outcomes": ["H2.1"],
  "markingGuide": {
    "criteria": [
      { "marks": 13, "marksTo": 15, "description": "Sustains a judgement about the influence of emerging technologies, supported throughout by specific evidence from a named field of design." },
      { "marks": 9, "marksTo": 12, "description": "Makes a judgement supported by evidence from a named field, with some points developed further than others." },
      { "marks": 5, "marksTo": 8, "description": "Describes the influence of emerging technologies with some reference to a field of design." },
      { "marks": 1, "marksTo": 4, "description": "Makes general statements about technology and design with little reference to any field." }
    ],
    "notes": "Any field of design is acceptable provided the evidence is specific to it."
  },
  "config": { "answerLines": 30 }
}`,

  table: `{
  "questionType": "table",
  "questionText": "Complete the table by naming the manufacturing process best suited to each production run.",
  "marks": 3,
  "difficulty": 2,
  "syllabus": { "pointIds": ["HSC-17.02"] },
  "outcomes": ["H5.2"],
  "config": {
    "columns": ["Production run", "Process", "Reason it suits the run"],
    "rows": [
      { "label": "One prototype enclosure made overnight in a studio", "cells": [ { "answers": ["3D printing", "Additive manufacturing"] }, { "answers": ["No tooling is needed, so a single part is quick and cheap"] } ], "marks": 1 },
      { "label": "Two hundred identical polymer bottle caps", "cells": [ { "answers": ["Injection moulding"] }, { "answers": ["The tooling cost is spread across a long run"] } ], "marks": 1 },
      { "label": "Fifty steel brackets cut from one sheet", "cells": [ { "answers": ["Laser cutting", "Plasma cutting"] }, { "answers": ["Sheet is cut to shape with no mould to make"] } ], "marks": 1 }
    ]
  }
}`,

  drawing: `{
  "questionType": "drawing",
  "questionText": "Sketch a bracket that carries a 2 kg planter box from a balcony rail 40 mm wide, without drilling the rail.",
  "marks": 4,
  "difficulty": 3,
  "syllabus": { "pointIds": ["HSC-11.02"] },
  "outcomes": ["H4.1"],
  "markingGuide": {
    "criteria": [
      { "marks": 2, "description": "The sketch shows a workable means of gripping a 40 mm rail without fixings through it." },
      { "marks": 1, "description": "The material is named and suits the load and an outdoor location." },
      { "marks": 1, "description": "The load path from the planter box to the rail can be followed in the drawing." }
    ]
  },
  "config": {
    "subtype": "sketch",
    "instructions": "Label the material and show how the bracket grips the rail.",
    "spaceMm": [160, 110],
    "grid": false
  }
}`,
}

/* ---------------------------------------------------------------------- tidy */

/**
 * Flatten the whitespace a syllabus document brings with it.
 *
 * The NESA .docx is full of non-breaking spaces, and they survive extraction
 * into the syllabus model. They are invisible on screen, so a teacher checking
 * the prompt before copying it cannot see what they are pasting, and some chat
 * boxes mangle them.
 */
export function plain(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
