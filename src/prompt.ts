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
   * Questions already written on these topics.
   *
   * Only their stems, and only when the teacher asks for them: this is their
   * own material going out to somebody else's service, so it is a decision
   * rather than a default.
   */
  avoid?: Question[] | undefined
}

/** Ruled lines per mark when no profile says otherwise. */
const DEFAULT_LINES_PER_MARK = 2

export function buildPrompt(spec: PromptSpec): string {
  const blocks = [
    opening(spec),
    assesses(spec),
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

function assesses(spec: PromptSpec): string {
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

function alreadyWritten(spec: PromptSpec): string {
  const stems = (spec.avoid ?? []).map((q) => plain(q.questionText)).filter(Boolean)
  if (stems.length === 0) return ''

  return [
    '## Questions this course already has',
    '',
    'Write nothing that duplicates one of these, in substance or in wording.',
    '',
    ...stems.map((s) => `- ${s}`),
  ].join('\n')
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

  lines.push(...guideFields(questionType))
  lines.push('', '  config:', ...configFields(questionType, marks))

  const extras = guideNotes(questionType, marks)
  if (extras.length > 0) lines.push('', ...extras)

  lines.push(
    '',
    'Leave out "id": Klunk assigns ids itself, and one you invent is discarded.',
    'Leave out "syllabusId" and "courseId": Klunk fills those in.',
    'Leave out "stimulus" unless it is a short piece of text the student reads. ' +
      'Klunk cannot fetch an image you name.',
    'Any field not listed above is dropped when the question is read back in.',
  )

  return lines.join('\n')
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

function configFields(type: QuestionType, marks: number): string[] {
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
    case 'extended_response':
      return [
        '    answerLines    whole number of ruled lines (optional; Klunk works it',
        '                   out from the marks if you leave it out)',
        '    parts          optional (a), (b), (c) breakdown, as',
        '                   [ { "label": "(a)", "text": "...", "marks": 2,',
        '                       "sampleAnswer": "..." } ]',
        `                   If you use parts, their marks must total ${marks}.`,
      ]
    case 'table':
      return [
        '    columns        the column headings. The first is what the student is',
        '                   given; the rest are what they complete.',
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

function guideNotes(type: QuestionType, marks: number): string[] {
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
        `standard, and reach ${marks} at the top.`,
        'They are alternatives, so they do not add up.',
        'A band covers a range of marks, so give each one "marks" and "marksTo",',
        'and leave no mark between 1 and the top uncovered.',
      ]
    case 'table':
      return [
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
    '- Write \\*, \\| or \\< for one of those characters where it is not markup.',
    '',
    'No headings, no bullet lists, no links, no images.',
  ].join('\n')
}

/* ----------------------------------------------------------------- an example */

/**
 * The example, with the teacher's own ids substituted into it.
 *
 * An example carrying ids from some other topic is an invitation to copy them,
 * and a model that does gets its tagging dropped on the way back in. The marks
 * are left alone, because rewriting them would leave the criteria beneath
 * adding up to something else, so the caveat says so instead.
 */
function example(spec: PromptSpec): string {
  let json = EXAMPLES[spec.questionType]

  const point = spec.pointIds[0]
  if (point) json = json.replace(/"pointIds": \[[^\]]*\]/, `"pointIds": ["${point}"]`)

  const outcome = outcomesFor(spec)[0]?.code
  if (outcome) json = json.replace(/"outcomes": \[[^\]]*\]/, `"outcomes": ["${outcome}"]`)

  return [
    '### One object, filled in',
    '',
    '```json',
    json,
    '```',
    '',
    `That example shows the shape. Your ${spec.count === 1 ? 'question is' : 'questions are'} ` +
      `worth ${spec.marks} mark${spec.marks === 1 ? '' : 's'} each and use only the ids listed ` +
      'further up.',
  ].join('\n')
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
