/**
 * Writing the prompt for a marking guide Klunk cannot read.
 *
 * The sibling of `src/paperprompt.ts`, and the other half of #89. A teacher
 * scanning an exam scans its marking guide in the same pass, and
 * `guideformats.ts` has said so in a comment since the paper half landed: both
 * readers refuse, `hasNoText` is asked, and the refusal opened onto nothing.
 *
 * **Two things make this prompt shorter and safer than the paper's, and both
 * come from Klunk already holding the questions.**
 *
 * *The questions do not go in it.* The paper prompt could state only what the
 * profile declares, because the content was in a document Klunk cannot see.
 * Here the questions are on screen, and the guide prints their numbers itself,
 * so a skeleton is enough to key against: number, part labels, marks, and what
 * a question offers to choose between. No question text leaves the machine,
 * which keeps the claim exactly where the paper route left it, *you attach the
 * file*. It also keeps the prompt short, and #89's 2024 run stopping mid-string
 * inside question 28 is what says that matters.
 *
 * *An answer is a letter, never a position.* The guide prints `B`. Klunk holds
 * the options and can resolve `B` against them, so asking for a position would
 * be asking the model to count options it cannot see.
 *
 * **The answer key is the sharp edge, and it is the whole reason this file is
 * careful.** A model asked what the answer is will work it out from the
 * question when the guide does not print one, and a worked-out answer is
 * indistinguishable from a transcribed one by the time it reaches a bank. #66
 * was a guide that read as empty and published thirty questions all answered A;
 * this would be the same page with more confidence behind it. So the prompt
 * forbids deriving in the same breath as it asks, twice, and `applyMarking`
 * marks every answer that arrives this way for checking.
 *
 * `paperprompt.ts`'s two findings are taken as established rather than
 * rediscovered: a worked example is not optional, because a model follows an
 * example far more reliably than a description; and a long document does not
 * come back in one reply, so `range` asks for a run of questions.
 */

import type { MarkingSkeleton } from './marking'
import type { Syllabus, SyllabusCourse } from './types'
import { plain } from './prompt'

export interface GuidePromptSpec {
  /** What the teacher says the paper is, printed so the reply can be checked. */
  examination: string
  year?: number | undefined
  /** The questions Klunk holds, which is what the reply keys against. */
  questions: MarkingSkeleton[]
  /** Only this run of question numbers, for a guide too long to come back whole. */
  range?: { from: number; to: number } | undefined
  /** The model whose outcome codes may be used, when the teacher chose a course. */
  syllabus?: Syllabus | undefined
  course?: SyllabusCourse | undefined
  /**
   * Whether the document holds no text at all.
   *
   * A scan and a marking guide of a shape no reader knows are both refused and
   * both arrive here, and the opening line is the only place they differ. The
   * teacher can see which it is; being told the wrong one is what makes a
   * refusal read as a fault in Klunk.
   */
  scanned: boolean
  /** The teacher's own instruction, passed through verbatim. */
  extra?: string | undefined
}

export function buildGuidePrompt(spec: GuidePromptSpec): string {
  const blocks = [
    opening(spec),
    whatItMarks(spec),
    howToTranscribe(spec),
    outcomes(spec),
    shape(spec),
    example(spec),
    ownInstruction(spec),
  ]
  return blocks.filter(Boolean).join('\n\n').trimEnd() + '\n'
}

/* ----------------------------------------------------------------- the ask */

function opening(spec: GuidePromptSpec): string {
  const which = spec.range
    ? `questions ${spec.range.from} to ${spec.range.to} of the attached marking guide`
    : 'the attached marking guide'
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
          'Do not describe the document and do not summarise it. Transcribe what it',
          'states about each question.',
        ]),
    '',
    'Answer with JSON and nothing else: one ```json code block holding an array of',
    'objects, with no text before or after it.',
  ].join('\n')
}

/* --------------------------------------------------- the questions it marks */

/**
 * The skeleton: numbers, marks, parts, and what there is to choose between.
 *
 * Deliberately without a word of any question. It is what the reply keys
 * against and what stops a number being invented, and the guide prints the same
 * numbers on its own pages.
 */
function whatItMarks(spec: GuidePromptSpec): string {
  const wanted = spec.range
    ? spec.questions.filter((q) => q.number >= spec.range!.from && q.number <= spec.range!.to)
    : spec.questions

  const lines = ['## The questions it marks', '']
  lines.push(spec.year ? `${plain(spec.examination)}, ${spec.year}` : plain(spec.examination))
  lines.push('')
  lines.push('Key every entry to one of these numbers. Do not add a number that is not here,')
  lines.push('and do not renumber.')
  lines.push('')
  for (const q of wanted) lines.push(`  ${describe(q)}`)
  return lines.join('\n')
}

function describe(q: MarkingSkeleton): string {
  const number = String(q.number).padEnd(4)
  const marks = `${q.marks} mark${q.marks === 1 ? '' : 's'}`.padEnd(9)
  return `${number}${marks}${shapeOf(q)}`
}

function shapeOf(q: MarkingSkeleton): string {
  const bits: string[] = []
  switch (q.questionType) {
    case 'multiple_choice':
      bits.push(`one answer, options ${letterRange(q.optionCount)}`)
      break
    case 'multiple_response':
      bits.push(`more than one answer, options ${letterRange(q.optionCount)}`)
      break
    case 'matching':
      bits.push(
        `items 1 to ${q.itemCount ?? 0} matched to options ${letterRange(q.optionCount)}`,
      )
      break
    case 'true_false':
      bits.push('true or false')
      break
    default:
      bits.push(q.questionType.replace('_', ' '))
  }
  if (q.parts?.length) {
    bits.push(
      `parts ${q.parts.map((p) => `(${p.label}) ${p.marks}`).join(', ')}`,
    )
  }
  return bits.join(', ')
}

/** `A to D` for four options, and nothing at all for a question with none. */
function letterRange(count: number | undefined): string {
  if (!count || count < 1) return 'as printed'
  if (count === 1) return 'A'
  return `A to ${String.fromCharCode(64 + Math.min(count, 26))}`
}

/* --------------------------------------------------------------- the rules */

function howToTranscribe(spec: GuidePromptSpec): string {
  const scope = spec.range
    ? `every question from ${spec.range.from} to ${spec.range.to}`
    : 'every question the guide covers'
  return [
    '## How to transcribe',
    '',
    'Copy what the guide states. This is transcription, not marking.',
    '',
    `- One entry for ${scope}, and one more for each part the guide marks`,
    '  separately.',
    '- **Give an answer only where the guide prints one.** Do not work out the',
    '  answer yourself, do not reason from the question, and do not fill a gap.',
    '  Leave "answer" out and the teacher will set it.',
    '- Copy an option letter as the guide prints it, so "B" is "B".',
    '- Copy the criteria wording exactly, including any spelling the guide has.',
    '- A band covering a range of marks is one entry with "marks" and "marksTo",',
    '  so 13 to 15 marks is one criterion, not three.',
    '- Where the guide marks a question part by part, give each part its own',
    '  entry with "part". Do not merge them.',
    '- A guide continued on a later page is one entry, not two.',
    '',
    'Where you cannot read something, say so in that entry\'s "unreadable" field',
    'rather than filling the gap.',
    '',
    'If a page is missing, blank, or too poor to read, add one final object of the',
    'form { "unreadablePages": "..." } naming what you could not read.',
  ].join('\n')
}

/* ------------------------------------------------------------- the outcomes */

/**
 * The codes a reply may name.
 *
 * A NESA guide prints a mapping grid giving the syllabus outcomes for every
 * question, the objective ones included, and it is the only place a
 * multiple-choice question's outcomes are written down. So this is worth asking
 * for wherever a course is chosen, and `guideingest.ts` keeps only the codes
 * listed here, as `ingest.ts` already does for a draft.
 */
function outcomes(spec: GuidePromptSpec): string {
  const codes = spec.course?.outcomes ?? []
  if (!spec.syllabus || codes.length === 0) return ''

  const lines = [
    '## Outcomes',
    '',
    `Where the guide names the syllabus outcomes for a question, copy them into`,
    `"outcomes" using these codes from ${plain(spec.syllabus.name)}, ` +
      `${plain(spec.course!.name)}.`,
    'Use no other code, and leave "outcomes" out where the guide names none.',
    '',
  ]
  for (const outcome of codes) lines.push(`  ${outcome.code}  ${plain(outcome.text)}`)
  return lines.join('\n')
}

/* --------------------------------------------------------- the field list */

function shape(spec: GuidePromptSpec): string {
  return [
    '## The JSON to return',
    '',
    'An array of objects. Each object uses these fields and no others.',
    '',
    '  number          the question number, from the list above',
    '  part            "a", "b", "c" where the guide marks a part on its own',
    '',
    '  answer          the option letter the guide gives, as printed',
    '  answers         several letters, where the guide gives more than one',
    '  links           matching: which option each numbered item links to, as',
    '                  [ { "item": 1, "options": ["D"] } ]',
    '',
    '  criteria        [ { "marks": 2, "description": "..." } ], one entry per',
    '                  row of the criteria table. Add "marksTo" for a band.',
    '  sampleAnswer    the sample or suggested answer, printed as one block',
    '  answersCouldInclude   the "Answers could include" list, one point per entry',
    '  outcomes        the syllabus outcome codes, where the guide gives them',
    '  unreadable      what you could not read in this entry (optional)',
    '',
    'Every one of them is optional except "number". An entry the guide says',
    'nothing about is left out altogether.',
    '',
    'Three rules about answers:',
    '',
    '- A question marked "one answer" takes "answer". A question marked "more',
    '  than one answer" takes "answers". A question marked "items 1 to N" takes',
    '  "links".',
    '- Never give an answer the guide does not print. A guide that lists only',
    '  criteria gives no letters, and that is a complete reply.',
    '- Never give a letter the question does not offer. Question 1 offering',
    '  options A to D cannot be answered E.',
  ].join('\n')
}

/* ------------------------------------------------------------- the example */

/**
 * Four entries showing the shape, invented for the purpose.
 *
 * The awkward parts are demonstrated rather than asserted, which is the lesson
 * `prompt.ts` wrote down and `paperprompt.ts` learned the hard way: a band
 * carrying `marksTo`, a part keyed by `number` and `part` together, a matching
 * question answered by links, and an entry with criteria and no answer at all.
 */
const EXAMPLE = `[
  {
    "number": 1,
    "answer": "B",
    "outcomes": ["H1.1"]
  },
  {
    "number": 13,
    "links": [
      { "item": 1, "options": ["D"] },
      { "item": 2, "options": ["A"] }
    ]
  },
  {
    "number": 21,
    "part": "a",
    "criteria": [
      { "marks": 2, "description": "Identifies two costs and relates each to the scale of production." },
      { "marks": 1, "description": "Identifies one cost." }
    ],
    "sampleAnswer": "Tooling is paid once and spread over the run, so unit cost falls as volume rises."
  },
  {
    "number": 25,
    "criteria": [
      { "marks": 13, "marksTo": 15, "description": "Makes a judgement supported by evidence from a named field.\\nUses the language of the syllabus throughout." },
      { "marks": 9, "marksTo": 12, "description": "Describes the field and gives some supporting evidence." }
    ],
    "answersCouldInclude": [
      "Cost of retooling against the life of the product",
      "Effect on the workforce already employed"
    ]
  }
]`

function example(spec: GuidePromptSpec): string {
  return [
    '### The shape, filled in',
    '',
    '```json',
    EXAMPLE,
    '```',
    '',
    'Note that question 21 is keyed by "number" and "part" together, that a band',
    'is one criterion with "marks" and "marksTo", and that question 25 carries no',
    'answer because a criteria table gives none.',
    spec.range
      ? `Return only questions ${spec.range.from} to ${spec.range.to}, in one array.`
      : 'Return every question the guide covers, in one array.',
  ].join('\n')
}

function ownInstruction(spec: GuidePromptSpec): string {
  const extra = spec.extra?.trim()
  return extra ? ['## Also', '', extra].join('\n') : ''
}
