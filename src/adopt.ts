/**
 * Turning what was read off a past paper into questions a bank can hold.
 *
 * `extract.ts` and `guide.ts` are faithful to the PDF and decide nothing.
 * `bank.schema.json` is what a bank can hold. This is the one place the two
 * meet, and it is deliberately a separate module because the mapping is where
 * the judgements are, and a judgement should be somewhere a person can find it.
 *
 * The same rule as `ingest.ts`: Klunk keeps hold of what Klunk knows. Ids are
 * assigned here and never taken from the document. Provenance is stamped rather
 * than inferred, because a NESA question in a school trial is only safe to
 * reuse if the year and number came with it.
 *
 * Nothing here is quietly dropped. What the readers noticed travels through as
 * a note, and everything a teacher has to look at is a note or a fault on the
 * question it belongs to — the review grid shows both before anything is
 * written.
 */

import type { ExtractedPaper, ExtractedQuestion } from './extract'
import type { Cutout } from './pdfimage'
import type { Check } from './paper'
import type { Question, QuestionConfig, QuestionPart } from './types'
import { suggestQuestionId, validateQuestion } from './validate'

export interface AdoptContext {
  /** Where the questions will be written, which is what ids are named after. */
  bankPath: string
  /** Question ids anywhere in the folder, which a new id must not collide with. */
  inFolder: Set<string>
  /** Question ids in the bank being written to. */
  inBank: Set<string>
  /** The syllabus these are tagged against, stamped by Klunk rather than read. */
  syllabusId?: string | undefined
  courseId?: string | undefined
}

export interface Adopted {
  question: Question
  /**
   * Pictures cut out of the page for this question, none of them kept yet.
   *
   * A crop is a proposal: it was worked out from where the text is not, which is
   * a good guess and not a fact. The teacher keeps or drops each one before
   * anything is written, the same as everything else here.
   */
  pictures: { cutout: Cutout; keep: boolean }[]
  /** Where it came from in the PDF, so a doubtful one can be checked against the paper. */
  pages: number[]
  /** What the readers noticed, in the teacher's words. */
  notes: string[]
  faults: Check[]
}

/**
 * Adopt a whole paper.
 *
 * Ids are handed out against a set that grows as it goes, so two questions in
 * one paper cannot be given the same one.
 */
export function adoptPaper(
  paper: ExtractedPaper,
  ctx: AdoptContext,
  cutouts: Map<ExtractedQuestion, Cutout[]> = new Map(),
): Adopted[] {
  const taken = new Set([...ctx.inFolder, ...ctx.inBank])
  return paper.questions.map((extracted) => {
    const question = toQuestion(extracted, ctx, taken)
    taken.add(question.id)
    return {
      question,
      // Kept by default. A question that had a picture on the page almost always
      // needs it, and a teacher scanning fifteen of these should be undoing the
      // rare wrong one rather than ticking every right one.
      pictures: (cutouts.get(extracted) ?? []).map((cutout) => ({ cutout, keep: true })),
      pages: extracted.pages,
      notes: [...extracted.notes, ...describeLosses(extracted, (cutouts.get(extracted) ?? []).length)],
      faults: validateQuestion(question, {
        inBank: ctx.inBank,
        inFolder: ctx.inFolder,
      }),
    }
  })
}

/**
 * What the PDF held and a bank cannot.
 *
 * Said plainly rather than left for the teacher to notice on the proof. A figure
 * is the case that matters: the question still reads sensibly with the words
 * "Figure 1" in it and prints as a question about a picture nobody can see.
 */
/** Wording the papers use for a picture that is never called a Figure. */
const SHOWS_A_PICTURE =
  /\b(shown|shown below|the images?\b|images? (represent|show|illustrate)|diagram|photograph|illustrat|graph)/i

function describeLosses(q: ExtractedQuestion, kept: number): string[] {
  const out: string[] = []
  const words = [q.text, ...(q.parts ?? []).map((p) => p.text), ...(q.options ?? []).map((o) => o.text)].join(' ')

  // The figure warning used to hang off the words "Figure N", which exactly one
  // question in eleven years uses. Twelve others say "the images show two
  // chairs" or "as shown in the graph" and got nothing at all, and none of it
  // reached Section I, which returns early. Both of those are fixed here rather
  // than in the reader, because it is the adoption that loses the picture.
  if (kept === 0 && (q.figures.length > 0 || SHOWS_A_PICTURE.test(words))) {
    out.push(
      q.figures.length > 0
        ? `Refers to ${q.figures.join(', ')}, and no picture was cut out for it. Add one yourself or reword the question.`
        : 'This question seems to be about a picture, and none was cut out for it. Check it against the paper.',
    )
  }
  if (q.content) {
    out.push(
      `The marking guide files this under "${q.content}". Klunk has not guessed which syllabus topic that is, so tag it yourself.`,
    )
  }
  return out
}

function toQuestion(
  extracted: ExtractedQuestion,
  ctx: AdoptContext,
  taken: Set<string>,
): Question {
  const question: Question = {
    id: suggestQuestionId(ctx.bankPath, extracted.questionType, taken),
    questionType: extracted.questionType,
    // Kept empty where the paper printed no stem. `bank.schema.json` allows that
    // only when the parts do the asking, which is exactly the case it arises in.
    questionText: extracted.text,
    marks: extracted.marks,
  }

  const syllabus: NonNullable<Question['syllabus']> = {}
  if (ctx.syllabusId) syllabus.syllabusId = ctx.syllabusId
  if (ctx.courseId) syllabus.courseId = ctx.courseId
  if (Object.keys(syllabus).length > 0) question.syllabus = syllabus

  // Straight from the guide's mapping grid, which is NESA's own statement of
  // what the question assesses. The topic and point ids are left alone: the grid
  // gives prose, and matching prose to an id is a guess.
  if (extracted.outcomes?.length) question.outcomes = [...extracted.outcomes]

  if (extracted.source) question.source = { ...extracted.source }

  const guide: NonNullable<Question['markingGuide']> = {}
  if (extracted.sampleAnswer) guide.sampleAnswer = extracted.sampleAnswer
  if (extracted.criteria?.length) guide.criteria = extracted.criteria.map((c) => ({ ...c }))
  if (Object.keys(guide).length > 0) question.markingGuide = guide

  const config = configFor(extracted)
  if (config) question.config = config

  return question
}

function configFor(q: ExtractedQuestion): QuestionConfig | undefined {
  if (q.questionType === 'multiple_choice') {
    const options = q.options ?? []
    // The answer key gives a letter; `choices` has no labels because they are
    // positional, so the letter has to be resolved against the options actually
    // read. An answer that names an option nobody read leaves this at zero, and
    // the note the reader already wrote is what says so.
    const answer = options.findIndex((o) => o.label === q.answer)
    return {
      choices: options.map((o) => ({ text: o.text })),
      correctAnswer: answer >= 0 ? answer : 0,
      // Off, deliberately. These are printed papers whose option order is part
      // of the record, and a teacher comparing a trial against the original
      // should see the same paper.
      shuffle: false,
    }
  }

  const parts = q.parts ?? []
  if (parts.length === 0) return undefined
  return {
    parts: parts.map((p): QuestionPart => {
      const part: QuestionPart = { label: p.label, text: p.text, marks: p.marks }
      if (p.sampleAnswer) part.sampleAnswer = p.sampleAnswer
      if (p.criteria?.length) part.criteria = p.criteria.map((c) => ({ ...c }))
      return part
    }),
  }
}
