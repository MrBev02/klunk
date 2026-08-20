/**
 * Writing the prompt for a paper Klunk cannot read.
 *
 * The sibling of `src/prompt.ts`, and it exists for one document: a photograph
 * or a scan, which carries no positioned text, so every geometric rule in
 * `extract.ts` has nothing to work on and there is no parser to write (#89).
 *
 * **The difference from every other prompt Klunk composes is what it cannot
 * contain.** Drafting fills the prompt with the syllabus and the teacher reads
 * the whole of it before copying, which is what makes "you decide what leaves
 * your machine" true. Here the content is in the document and Klunk cannot see
 * it, so the teacher attaches the file themselves and the claim weakens to "you
 * attach the file". The panel has to say so.
 *
 * Three things are settled by two real runs, over the 2025 and 2024 Year 11
 * Enterprise Computing papers, and are not guesses.
 *
 * **A worked example is not optional.** The first draft of this prompt described
 * the shape in a field list, the way this file's `shape` still does, and said
 * `config:` above the fields that nest under it. Both runs flattened `choices`
 * to the top level, in 9 of 9 multiple-choice questions each time, and `ingest`
 * dropped it as a field it does not store: every multiple-choice question
 * arrived with no options at all. `prompt.ts` had already written down why, and
 * this file ignored it. *A model follows an example far more reliably than a
 * description.* So the shape is now shown as well as told, and the example is
 * the part that must not be trimmed.
 *
 * **A whole paper does not come back in one reply.** The 2024 run stopped mid
 * string inside question 28 of 30, which is an output-length limit rather than
 * anything about the scan. `ingest` already recovers what it can and says the
 * model stopped halfway, but the fix belongs here: `range` asks for a run of
 * questions, so a 30-question paper is two or three replies that merge. The
 * 2025 paper did fit, so this is offered rather than forced.
 *
 * **Tagging is by topic, never by content point.** A course can carry hundreds
 * of points (Computing Technology has 246), and listing them would swamp a
 * prompt whose real job is transcription. Topic ids are few and `ingest` already
 * checks them against what was offered.
 */

import type { Profile, Syllabus, SyllabusCourse, SyllabusTopic } from './types'
import { markupRules, plain } from './prompt'

export interface PaperPromptSpec {
  /** What the teacher says this document is, printed so the reply can be checked. */
  examination: string
  year?: number | undefined
  /**
   * Only this run of question numbers.
   *
   * For a paper too long to come back whole. Absent asks for all of it.
   */
  range?: { from: number; to: number } | undefined
  /** The paper's structure, when the folder has a profile for it. */
  profile?: Profile | undefined
  /** The model to tag against, when the teacher chose a course. */
  syllabus?: Syllabus | undefined
  course?: SyllabusCourse | undefined
  /**
   * Whether the document holds no text at all.
   *
   * #89 opened this route only for a scan, on the argument that a paper of an
   * unknown shape is a reader worth writing rather than a document to send to an
   * AI. #94 widened it to any paper both readers refuse: outside NESA and the
   * IB there is no standard to write that reader against, and a reader has
   * already refused by the time the route is offered. So the opening line has to
   * say which document this is, and telling a teacher their text-bearing paper
   * is a scan is what makes a refusal read as a fault in Klunk.
   */
  scanned: boolean
  /** The teacher's own instruction, passed through verbatim. */
  extra?: string | undefined
}

export function buildPaperPrompt(spec: PaperPromptSpec): string {
  const blocks = [
    opening(spec),
    whatThePaperIs(spec),
    howToTranscribe(spec),
    tagging(spec),
    shape(spec),
    markupRules("A question's text, a part's text and an option's text"),
    example(spec),
    ownInstruction(spec),
  ]
  return blocks.filter(Boolean).join('\n\n').trimEnd() + '\n'
}

/* ----------------------------------------------------------------- the ask */

function opening(spec: PaperPromptSpec): string {
  const which = spec.range
    ? `questions ${spec.range.from} to ${spec.range.to} of the attached examination paper`
    : 'every question in the attached examination paper'
  return [
    `Transcribe ${which} into JSON.`,
    '',
    ...(spec.scanned
      ? [
          'The document is a scan with no text in it, so every page is a picture. Some',
          'pages may be upside down, and one image may hold two pages side by side. Read',
          'them anyway. Do not describe the document, do not summarise it, and do not',
          'comment on the scan quality.',
        ]
      : [
          'Do not describe the document and do not summarise it. Transcribe the questions',
          'it prints.',
        ]),
    '',
    'Answer with JSON and nothing else: one ```json code block holding an array of',
    'objects, with no text before or after it.',
  ].join('\n')
}

/* ------------------------------------------------------- what it is reading */

function whatThePaperIs(spec: PaperPromptSpec): string {
  const lines = ['## What the paper is', '']
  lines.push(spec.year ? `${plain(spec.examination)}, ${spec.year}` : plain(spec.examination))

  const paper = spec.profile?.paper
  if (paper) {
    lines.push(`${paper.totalMarks} marks.`)
    lines.push('')
    for (const section of paper.sections) {
      const count = section.questionCount ? `${section.questionCount} questions, ` : ''
      const per = section.marksPerQuestion
      const each = per ? `, ${per} mark${per === 1 ? '' : 's'} each` : ''
      lines.push(`  ${plain(section.name)}: ${count}${section.marks} marks${each}`)
    }
    lines.push(
      '',
      'Those totals are what the paper prints. If what you read does not add up to',
      'them, transcribe what is printed and say so in "unreadablePages". Do not',
      'adjust a mark to make a total work.',
    )
  }
  return lines.join('\n')
}

/* -------------------------------------------------------------- the rules */

function howToTranscribe(spec: PaperPromptSpec): string {
  const scope = spec.range
    ? `Every question from ${spec.range.from} to ${spec.range.to}`
    : 'Every question in the paper'
  return [
    '## How to transcribe',
    '',
    'Copy what is printed. This is transcription, not authoring.',
    '',
    `- ${scope}, in order, none left out and none added.`,
    "- Keep the paper's own question numbers. If a number is missing from the",
    '  paper, leave it missing rather than renumbering.',
    '- Copy the wording exactly, including any spelling or grammar the paper has.',
    '  Do not correct it, improve it, or shorten it.',
    '- Take the marks from the paper. Never guess a mark you cannot read.',
    '- Where a question is split into (a), (b), (c), keep the split and each',
    "  part's own marks.",
    '- A question continued on a later page is one question, not two.',
    '- Some questions print a screenshot or a diagram. Do not reproduce it.',
    '  Describe it in one sentence in "stimulusNote", and transcribe any words',
    '  printed inside it that the question depends on.',
    '',
    'Where you cannot read something, say so in that question\'s "unreadable"',
    'field rather than filling the gap.',
    '',
    'If a page is missing, blank, or too poor to read, add one final object of the',
    'form { "unreadablePages": "..." } naming what you could not read.',
  ].join('\n')
}

/* ------------------------------------------------------------- the tagging */

function tagging(spec: PaperPromptSpec): string {
  const topics = spec.course?.topics ?? []
  if (!spec.syllabus || !spec.course || topics.length === 0) return ''

  const lines = [
    '## Tagging',
    '',
    `Where a question clearly belongs to one of these topics of ${plain(spec.syllabus.name)}, ` +
      `${plain(spec.course.name)}, name it in "topicIds".`,
    'Leave "topicIds" out where you are unsure. A wrong tag is worse than none.',
    '',
  ]
  for (const topic of topics) lines.push(`  ${topic.id}  ${topicLabel(topic)}`)
  return lines.join('\n')
}

function topicLabel(topic: SyllabusTopic): string {
  return topic.group ? `${plain(topic.group)}: ${plain(topic.name)}` : plain(topic.name)
}

/* --------------------------------------------------------- the field list */

function shape(spec: PaperPromptSpec): string {
  return [
    '## The JSON to return',
    '',
    'An array of objects. Each object uses these fields and no others.',
    '',
    '  number         the question number printed on the paper',
    '  questionType   one of: multiple_choice, multiple_response, matching,',
    '                 short_answer, extended_response, true_false, table,',
    '                 drawing',
    '  questionText   the question exactly as a student reads it',
    '  marks          a whole number, as printed',
    '  section        the section it falls in, as the paper labels it',
    '  topicIds       optional, from the list above',
    '  stimulusNote   one sentence describing any picture (optional)',
    '  unreadable     what you could not read in this question (optional)',
    '',
    '  config         everything that depends on the question type, nested inside',
    '                 this one field. See the example below.',
    '',
    '    choices        multiple_choice and multiple_response: the options in',
    '                   order, as [ { "text": "..." } ]',
    '    correctAnswer  multiple_choice: the position of the correct option',
    '                   counting from zero, 0 being the first.',
    '                   **Include this only if the paper states the answer.**',
    '                   A question paper on its own does not. Do not work the',
    '                   answer out yourself, and do not guess: a wrong answer key',
    '                   prints on a marking guide as though it were right.',
    '    correctAnswers multiple_response: the same, as an array of positions.',
    '                   The same rule applies. Leave it out unless the paper',
    '                   states the answers.',
    '    items          matching: the numbered column, as',
    '                   [ { "text": "..." } ]',
    '    options        matching: the lettered column, same shape.',
    '                   Add "matches": [0] to an item only if the paper states',
    '                   which option it links to.',
    '    parts          short_answer and extended_response, as',
    '                   [ { "label": "(a)", "text": "...", "marks": 2 } ]',
    "                   Their marks must total the question's marks.",
    '',
    'Four rules about types:',
    '',
    '- Use "multiple_choice" where exactly one option is correct.',
    '- Use "multiple_response" where the paper says more than one may be',
    '  selected. The instruction is often printed once above a run of questions,',
    '  as "place an X next to each alternative that answers the question", so',
    '  check what is printed above the question as well as the question itself.',
    '- Use "matching" where the student links two columns, whether the paper says',
    '  to draw lines between them or to write a letter beside each number. Put',
    '  the numbered column in "items" and the lettered one in "options", each in',
    '  the order printed. Do not put either column in "questionText".',
    '- Use "table" where the student completes a table, and put the column',
    '  headings in "questionText". A table the student only reads is not this',
    '  type: transcribe it into "questionText" as a pipe table and give the',
    '  question whatever type it would have without it.',
    '',
    'Leave out "id", "syllabusId" and "courseId".',
  ].join('\n')
}

/* ------------------------------------------------------------- the example */

/**
 * Three objects showing the shape, invented for the purpose.
 *
 * Not shared with `prompt.ts`'s examples, which carry option feedback and
 * content-point ids that a question paper does not print. What both sets have in
 * common is the job: demonstrate the awkward parts rather than assert them.
 * Here that is `config` being a real nested object, `correctAnswer` being absent
 * because the paper does not state it, and `parts` carrying their own marks.
 */
const EXAMPLE = `[
  {
    "number": 1,
    "questionType": "multiple_choice",
    "questionText": "Which storage medium has no moving parts?",
    "marks": 1,
    "section": "I",
    "config": {
      "choices": [
        { "text": "Hard disk drive" },
        { "text": "Solid state drive" },
        { "text": "Optical disc" },
        { "text": "Magnetic tape" }
      ]
    }
  },
  {
    "number": 2,
    "questionType": "short_answer",
    "questionText": "Outline TWO (2) benefits of automated backups for a small business.",
    "marks": 4,
    "section": "II",
    "config": {
      "parts": [
        { "label": "(a)", "text": "Outline one benefit for data recovery.", "marks": 2 },
        { "label": "(b)", "text": "Outline one benefit for staff time.", "marks": 2 }
      ]
    }
  },
  {
    "number": 3,
    "questionType": "extended_response",
    "questionText": "The diagram shows a small office network.\\nDiscuss the security risks of the arrangement shown.",
    "marks": 5,
    "section": "II",
    "stimulusNote": "The stimulus is a network diagram showing a router, a switch and four workstations.",
    "unreadable": "The labels on two of the workstations could not be read."
  },
  {
    "number": 4,
    "questionType": "short_answer",
    "questionText": "The table shows the temperature recorded in the workshop.\\n\\n| Time | Temperature (\u00b0C) |\\n| --- | --- |\\n| 8 am | 18.8 |\\n| 12 noon | 27.1 |\\n| 4 pm | 24.6 |\\n\\nIdentify the **greatest** change between two readings.",
    "marks": 2,
    "section": "II"
  }
]`

function example(spec: PaperPromptSpec): string {
  return [
    '### The shape, filled in',
    '',
    '```json',
    EXAMPLE,
    '```',
    '',
    'Note where "choices" and "parts" sit: inside "config", not beside it. Note',
    'that no question carries "correctAnswer", because a question paper does not',
    'print the answers. Note that question 4 keeps its table as a table, in',
    '"questionText", between the two paragraphs it is printed between.',
    spec.range
      ? `Return only questions ${spec.range.from} to ${spec.range.to}, in one array.`
      : 'Return every question of the paper in one array.',
  ].join('\n')
}

function ownInstruction(spec: PaperPromptSpec): string {
  const extra = spec.extra?.trim()
  return extra ? ['## Also', '', extra].join('\n') : ''
}
