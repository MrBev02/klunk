/**
 * The prompt that asks a model for a whole examination paper.
 *
 * **Not `paperprompt.ts`.** That one is for a paper Klunk could not read: it
 * asks a model to transcribe an examination that already exists. This one asks
 * for one that does not exist yet, built to the shape of a profile and, where
 * the teacher sends one, to the pattern of a paper of their own. The two names
 * are close enough to be worth saying which is which here, once.
 *
 * It breaks a rule `prompt.ts` holds deliberately, and it is worth being clear
 * about how. Drafting asks for **one type at one mark value**, because a JSON
 * shape conditional on a field the model chooses is the fastest way to get back
 * something that does not parse. A paper cannot be asked for that way: its
 * sections differ in type and in marks.
 *
 * What makes that safe here is that the profile already holds the structure as
 * data. The ask is still exact — twenty multiple choice at one mark, then six
 * short answer, then two extended responses at fifteen — it is only exact per
 * section rather than per prompt. Every other guard is the one that was already
 * there: the reply may name only the ids listed, Klunk assigns the question
 * ids and stamps the syllabus itself, and `checkPaper` measures what comes back
 * against the profile before a teacher can save it.
 */

import { asExamJson } from './exam'
import type { ResolvedPaper } from './paper'
import {
  markupRules,
  marksGuidance,
  outcomesFor,
  syllabusContext,
  typeExample,
  typeShape,
} from './prompt'
import {
  QUESTION_TYPE_LABELS,
  type Profile,
  type ProfileSection,
  type QuestionType,
  type Syllabus,
  type SyllabusCourse,
  type SyllabusTopic,
} from './types'

export interface ExamPromptSpec {
  syllabus: Syllabus
  course: SyllabusCourse
  /** Topics chosen, in syllabus order. */
  topics: SyllabusTopic[]
  /** Content point ids chosen, a subset of those topics' points. */
  pointIds: string[]
  /** What the paper has to look like. Without one, the sample is the shape. */
  profile?: Profile | undefined
  /** What the paper is called, so the model writes for a trial and not a quiz. */
  title: string
  /**
   * One of the school's own papers, written out whole.
   *
   * The strongest thing in the prompt by a distance, and the reason the feature
   * exists: a model shown a real paper of this faculty's writes to its pitch,
   * its house style and the way its marking guides are written, instead of
   * reinterpreting a description of them. Sent only when the teacher says so —
   * it is their material going to somebody else's service.
   */
  sample?: ResolvedPaper | undefined
  /** The teacher's own instruction, passed through verbatim. */
  extra?: string | undefined
}

export function buildExamPrompt(spec: ExamPromptSpec): string {
  const blocks = [
    opening(spec),
    structure(spec),
    syllabusContext(spec),
    conventions(spec),
    sample(spec),
    markupRules("A question's text, a part's text and an option's text"),
    shape(spec),
  ]
  return blocks.filter(Boolean).join('\n\n').trimEnd() + '\n'
}

/* ----------------------------------------------------------------- the ask */

function opening(spec: ExamPromptSpec): string {
  const authority = spec.syllabus.authority ? ` (${spec.syllabus.authority})` : ''
  return [
    `Write a complete examination paper titled "${plain(spec.title)}" for ` +
      `${plain(spec.syllabus.name)}, ${plain(spec.course.name)}${authority}.`,
    '',
    'Every question must be new. Answer with JSON and nothing else: one ```json ' +
      'code block holding one object, with no commentary before or after it. The ' +
      'exact shape is set out at the end.',
  ].join('\n')
}

/* --------------------------------------------------------------- the shape */

/**
 * What the paper has to look like, section by section.
 *
 * From the profile, which is where every rule the old toolchain hardcoded now
 * lives as data. A section that fixes its mark value fixes it here too, and one
 * that does not says so plainly rather than leaving the model to guess whether
 * it may choose — a model that guesses wrong produces a paper that fails the
 * checker for a reason the teacher never stated.
 */
function structure(spec: ExamPromptSpec): string {
  const paper = spec.profile?.paper
  if (!paper) return fromSample(spec)

  const lines = [
    '## The paper',
    '',
    `${paper.totalMarks} marks in total, in ${paper.sections.length} ` +
      `section${paper.sections.length === 1 ? '' : 's'}.`,
    '',
  ]

  for (const section of paper.sections) {
    lines.push(`### ${plain(section.name)} — ${section.marks} marks`)
    for (const line of sectionRules(section)) lines.push(`- ${line}`)
    if (section.instructions) {
      lines.push(`- The paper prints these instructions above it: ${plain(section.instructions)}`)
    }
    lines.push('')
  }

  lines.push(
    'Return the sections in that order and under those names, all of them and no',
    'others. Klunk prints the title, the timing and the cover itself, so write the',
    'questions and nothing around them.',
  )
  return lines.join('\n')
}

/** The rules of one section, in the order they matter to whoever writes it. */
function sectionRules(section: ProfileSection): string[] {
  const lines: string[] = []

  const count =
    section.questionCount !== undefined
      ? `Exactly ${section.questionCount} question${section.questionCount === 1 ? '' : 's'}.`
      : section.minQuestions !== undefined || section.maxQuestions !== undefined
        ? `Between ${section.minQuestions ?? 1} and ${section.maxQuestions ?? '?'} questions.`
        : null
  if (count) lines.push(count)

  const types = section.questionTypes ?? []
  if (types.length === 1 && types[0]) {
    lines.push(`Every question is of type "${types[0]}" (${QUESTION_TYPE_LABELS[types[0]]}).`)
  } else if (types.length > 1) {
    lines.push(`Each question is one of these types: ${types.map((t) => `"${t}"`).join(', ')}.`)
  }

  if (section.marksPerQuestion !== undefined) {
    lines.push(
      `Every question is worth exactly ${section.marksPerQuestion} ` +
        `mark${section.marksPerQuestion === 1 ? '' : 's'}.`,
    )
  } else if (section.questionCount === 1) {
    // One question and no per-question value is not a choice: the section's
    // marks are its marks. Telling a model to choose them and then telling it
    // the total is two instructions where there is one fact.
    lines.push(`The question is worth the section's ${section.marks} marks.`)
  } else if (section.chooseCount === undefined) {
    lines.push(
      `Choose the marks for each question yourself, so that the section totals ` +
        `${section.marks} marks.`,
    )
  }

  if (section.chooseCount !== undefined) {
    // Alternatives, so the arithmetic is not the arithmetic of the sections
    // above it: what a student earns is one of them, and the checker enforces
    // that they are all worth the same.
    lines.push(
      `These are alternatives: the student answers ${section.chooseCount} of them, so ` +
        `every one is worth the same ${section.marks} marks and covers different ` +
        'content from the others.',
    )
  }

  const type = types.length === 1 ? types[0] : undefined
  if (type) {
    lines.push(
      marksGuidance({
        questionType: type,
        marks: section.marksPerQuestion ?? section.marks,
        profile: undefined,
      }),
    )
  }

  return lines
}

/** The shape of the sample, where the folder has no profile for this course. */
function fromSample(spec: ExamPromptSpec): string {
  const paper = spec.sample
  if (!paper) return ''

  const lines = [
    '## The paper',
    '',
    'There is no stored description of this examination, so follow the paper below:',
    'the same sections, in the same order, with the same number of questions in each',
    'and the same marks.',
    '',
  ]
  for (const section of paper.sections) {
    const n = section.questions.length
    lines.push(
      `- ${plain(section.title)}: ${n} question${n === 1 ? '' : 's'}, ${section.marks} marks.`,
    )
  }
  return lines.join('\n')
}

/* -------------------------------------------------------------- how to write */

function conventions(spec: ExamPromptSpec): string {
  const lines = ['## How to write them', '']

  const bullets = [
    'Australian English throughout: analyse, organisation, behaviour, colour, ' +
      'visualisation. Never analyze or color.',
    'Metric units, AUD, and Australian products, users and settings wherever a ' +
      'context is needed.',
    'Write original questions. Do not reproduce, translate or lightly reword a ' +
      'question from a past examination paper, and do not lift the wording of the ' +
      'content points above into the question itself.',
    'Spread the paper across the content listed above rather than asking several ' +
      'questions on one point, and do not ask the same thing twice in two sections.',
    'A question is finished only when a second marker could reach the same mark ' +
      'from the marking guide alone.',
  ]
  for (const b of bullets) lines.push(`- ${b}`)

  const extra = spec.extra?.trim()
  if (extra) {
    lines.push('', 'The teacher has also asked for this, and it takes precedence:', '', extra)
  }
  return lines.join('\n')
}

/* --------------------------------------------------------------- the sample */

function sample(spec: ExamPromptSpec): string {
  const paper = spec.sample
  if (!paper) return ''

  return [
    `### One of this school's own papers, ${plain(paper.paper.title)}`,
    '',
    '```json',
    asExamJson(paper, `${plain(spec.syllabus.name)}, ${plain(spec.course.name)}`),
    '```',
    '',
    'Copy the pitch of those questions, the way they are worded and the way their',
    'marking guides are written. Do not reuse, reword or answer any of them: every',
    'question you write is a new one, on the content listed further up, and a paper',
    'that could sit beside that one rather than replace it.',
  ].join('\n')
}

/* ------------------------------------------------------------- the JSON shape */

/**
 * The fields, and then a worked question of every type the paper uses.
 *
 * The example is not decoration and it is not the sample paper's job. A model
 * follows an example far more reliably than a description, which `prompt.ts`
 * established at the cost of two runs, and this prompt set out as many as eight
 * types with an example of none of them. #108 is what that costs: `table` was
 * described and never shown, so a described table came back written into
 * "questionText" with no "columns" at all and could not be saved. A sample
 * paper does not cover it — the teacher may send none, and one they do send
 * need not contain the type in question.
 */
function shape(spec: ExamPromptSpec): string {
  const lines = [
    '## The JSON to return',
    '',
    'One object. Its "sections" hold the sections of the paper, in order.',
    '',
    '  { "sections": [ { "name": "…", "questions": [ … ] } ] }',
    '',
    '  name        the section name exactly as written above',
    "  questions   that section's questions, in the order they are printed",
    '',
    'Each question object uses these fields and no others.',
    '',
    `  questionType   ${typesUsed(spec)
      .map((t) => `"${t}"`)
      .join(', ')}`,
    '  questionText   the question exactly as a student reads it',
    '  marks          what the question is worth, as a number',
    '  difficulty     a whole number 1 to 5, 1 easiest (optional)',
    '  syllabus       { "pointIds": [...] } using the ids listed above',
    '  outcomes       [...] using the codes listed above',
    '  tags           up to five short words of your own (optional)',
  ]

  lines.push(
    '',
    'Each type the paper uses is set out below as its fields and then as one',
    'filled-in question. Copy the structure of those examples. Their subject',
    'matter is not a hint and their marks are not the ask: write to the content',
    'listed further up and to the section the question belongs to.',
  )

  const point = spec.pointIds[0]
  const outcome = outcomesFor(spec)[0]?.code
  for (const type of typesUsed(spec)) {
    lines.push(
      '',
      `### A "${type}" question`,
      ...typeShape(type, marksFor(spec, type)),
      '',
      '```json',
      typeExample(type, point, outcome),
      '```',
    )
  }

  lines.push(
    '',
    'Leave out "id": Klunk assigns ids itself, and one you invent is discarded.',
    'Leave out "syllabusId" and "courseId": Klunk fills those in.',
    'Leave out "title": Klunk uses the title the teacher typed.',
    'Leave out "stimulus" unless it is a short piece of text the student reads. ' +
      'Klunk cannot fetch an image you name.',
    'Any field not listed above is dropped when the paper is read back in.',
  )
  return lines.join('\n')
}

/**
 * The types this paper can hold, so the shape sets out those and not all eight.
 *
 * From the profile, which is the thing that decides. A profile whose sections
 * name no types falls back to what the sample paper actually used, and then to
 * the three every examination has, because a shape block listing every type
 * Klunk knows is an invitation to use one the paper has no room for.
 */
export function typesUsed(spec: Pick<ExamPromptSpec, 'profile' | 'sample'>): QuestionType[] {
  const seen = new Set<QuestionType>()
  for (const section of spec.profile?.paper.sections ?? []) {
    for (const type of section.questionTypes ?? []) seen.add(type)
  }
  if (seen.size === 0) {
    for (const section of spec.sample?.sections ?? []) {
      for (const q of section.questions) seen.add(q.question.questionType)
    }
  }
  if (seen.size === 0) return ['multiple_choice', 'short_answer', 'extended_response']
  return [...seen]
}

/**
 * The mark value to describe this type at, where the paper fixes one.
 *
 * Undefined where it does not, and `typeShape` then phrases the two lines that
 * would name a number in terms of the question instead. Asserting "their marks
 * must total 7" over a section that fixes no such thing is a rule the teacher
 * never wrote and the checker will not enforce.
 */
function marksFor(spec: ExamPromptSpec, type: QuestionType): number | undefined {
  const fixed = new Set<number>()
  for (const section of spec.profile?.paper.sections ?? []) {
    if (!(section.questionTypes ?? []).includes(type)) continue
    if (section.marksPerQuestion === undefined) return undefined
    fixed.add(section.marksPerQuestion)
  }
  return fixed.size === 1 ? [...fixed][0] : undefined
}

/** Whatever a document gave us, on one line, so a prompt cannot be broken by it. */
function plain(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
