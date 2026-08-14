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
import { AI_MARKED_TAG, CHECK_THE_ANSWER, type Marking, type MarkingEntry } from './marking'
import type { Cutout } from './pdfimage'
import type { Check } from './paper'
import { QUESTION_TYPE_LABELS, type Question, type QuestionConfig, type QuestionPart } from './types'
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
  // `configFor` has to put something in `correctAnswer`, and with no answer key
  // it puts the first option. Without this note that is a wrong answer printed
  // on a marking guide with nothing anywhere saying it was never read — and a
  // paper of thirty objective questions read without its markscheme is thirty of
  // them (#64). The note is here rather than in a reader because it is the
  // adoption that has to invent the answer.
  if (q.questionType === 'multiple_choice' && q.answer === undefined) {
    out.push(
      (q.options?.length ?? 0) > 0
        ? `${NO_ANSWER_KEY}, so ${q.options![0]!.label} is marked correct. Set the right one before saving.`
        : `${NO_ANSWER_KEY}. Set the right answer before saving.`,
    )
  }
  return out
}

/**
 * The opening of the note `describeLosses` writes when nothing answered a
 * question, so `applyMarking` can take it back off when something does.
 *
 * A note saying no answer key was read, standing beside the answer that key
 * gave, is the kind of contradiction a teacher stops reading notes over.
 */
export const NO_ANSWER_KEY = 'No answer key was read for this question'

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

/* ------------------------------------------------- a guide read by something else */

/**
 * Put an AI's reading of a marking guide onto questions already adopted.
 *
 * The counterpart of `applyGuide`, and deliberately a second function rather
 * than a generalisation of it. `applyGuide` works on an `ExtractedPaper`, before
 * adoption, where an answer is still an option letter and criteria still belong
 * to a reader's own shapes. This works after adoption, on questions a bank could
 * hold, which is the only point both routes into this screen have in common: a
 * paper Klunk read and a paper an AI transcribed are the same thing by the time
 * they are `Adopted`, and one merge for both is what stops the transcription
 * route quietly having no marking guide at all (#94).
 *
 * Applying after adoption rather than re-reading is the same choice `applyYear`
 * made on this screen: re-reading would throw away every picture the teacher has
 * already dropped and every question they have already discarded.
 *
 * **Nothing here invents an answer.** An entry that states none leaves the
 * question exactly as it was, letters that name options the paper never printed
 * are reported rather than resolved, and every answer that does land says on the
 * question that a model read it.
 */
export function applyMarking(
  adopted: Adopted[],
  marking: Marking,
  ctx: { inBank: Set<string>; inFolder: Set<string> },
): { adopted: Adopted[]; notes: string[]; marked: number } {
  const notes: string[] = [...marking.notes]
  const covered = new Set<number>()
  let answered = 0
  let marked = 0

  const out = adopted.map((item) => {
    const number = numberOf(item.question)
    if (number === undefined) return item
    const entries = marking.entries.filter((e) => e.number === number)
    if (entries.length === 0) return item
    covered.add(number)

    const own: string[] = [...item.notes]
    const wholes = entries.filter((e) => e.part === undefined)
    const whole = wholes[0]
    let question = { ...item.question }

    // A model that re-reads a page returns the question twice, and the second
    // reading is where a different answer would hide. Taking the first silently
    // is how a contradiction between two entries becomes invisible.
    if (wholes.length > 1) {
      own.push(
        `The reply marks this question ${wholes.length} times. Only the first was used, so check it against the guide.`,
      )
    }

    for (const entry of entries) {
      if (entry.unreadable) {
        own.push(`The AI could not read part of the guide here: ${entry.unreadable}`)
      }
      if (entry.outcomes?.length) {
        question.outcomes = [...new Set([...(question.outcomes ?? []), ...entry.outcomes])]
      }
    }

    if (whole) {
      const set = applyAnswer(question, whole, own)
      question = set.question
      if (set.answered) {
        answered += 1
        if (marking.byAi) own.push(CHECK_THE_ANSWER)
        // The note saying nobody answered this question is now false, and the
        // answer it names is the one this has just replaced.
        for (let i = own.length - 1; i >= 0; i -= 1) {
          if (own[i]!.startsWith(NO_ANSWER_KEY)) own.splice(i, 1)
        }
      }
      question = withGuide(question, whole)
    }

    question = withParts(question, entries, own)

    // The notes above are gone the moment this is saved and the marking is not,
    // so what a model supplied has to be recorded on the question itself.
    if (changed(item.question, question)) {
      marked += 1
      if (marking.byAi) question = { ...question, tags: withTag(question.tags, AI_MARKED_TAG) }
    }

    return {
      ...item,
      question,
      // A second guide can be read over the first, which is the only way out of
      // having pasted the wrong reply, so the same note must not stack up.
      notes: [...new Set(own)],
      faults: validateQuestion(question, { inBank: ctx.inBank, inFolder: ctx.inFolder }),
    }
  })

  for (const number of new Set(marking.entries.map((e) => e.number))) {
    if (!covered.has(number)) {
      notes.push(
        `The reply marks Question ${number}, and no question of that number was read from the paper.`,
      )
    }
  }
  notes.push(
    `${marked} of the ${adopted.length} questions were marked, ${answered} of them with an answer.`,
  )
  return { adopted: out, notes, marked }
}

/**
 * Did anything the guide said actually land on this question?
 *
 * An entry naming a question it cannot answer, or repeating what was already
 * there, leaves it untouched, and tagging that would say a model supplied
 * marking it did not supply.
 */
function changed(before: Question, after: Question): boolean {
  return JSON.stringify(before) !== JSON.stringify(after)
}

/** One tag added once, within the twenty a bank allows. */
function withTag(tags: string[] | undefined, tag: string): string[] {
  const out = [...(tags ?? [])]
  if (!out.includes(tag)) out.push(tag)
  return out.slice(0, 20)
}

/** The number printed on the paper, which is what a guide keys against. */
function numberOf(question: Question): number | undefined {
  const printed = question.source?.questionNumber
  if (printed === undefined || !/^\d+$/.test(printed.trim())) return undefined
  return Number(printed.trim())
}

/**
 * The answer, resolved against the options this question actually holds.
 *
 * A letter is only ever a letter until here. `B` on a question with three
 * options is the reply having read a different question, and saying so is worth
 * more than the fourth option it would otherwise invent.
 */
function applyAnswer(
  question: Question,
  entry: MarkingEntry,
  notes: string[],
): { question: Question; answered: boolean } {
  const config = { ...(question.config ?? {}) }
  const type = question.questionType

  if (entry.trueFalse !== undefined) {
    if (type !== 'true_false') {
      notes.push('The guide gives true or false for a question that does not ask for one.')
      return { question, answered: false }
    }
    return { question: { ...question, config: { ...config, correctAnswer: entry.trueFalse } }, answered: true }
  }

  if (entry.links?.length) {
    if (type !== 'matching') {
      notes.push('The guide links two columns on a question that has none.')
      return { question, answered: false }
    }
    const items = [...(config.items ?? [])]
    const options = config.options ?? []
    let landed = 0
    for (const link of entry.links) {
      const at = link.item - 1
      const item = items[at]
      if (item === undefined) {
        notes.push(`The guide links item ${link.item}, and this question has ${items.length}.`)
        continue
      }
      const matches = indicesOf(link.options, options.length, notes)
      if (matches.length === 0) continue
      items[at] = { ...item, matches }
      landed += 1
    }
    if (landed === 0) return { question, answered: false }
    return { question: { ...question, config: { ...config, items } }, answered: true }
  }

  const letters = entry.answers ?? []
  if (letters.length === 0) return { question, answered: false }

  if (type === 'multiple_choice') {
    if (letters.length > 1) {
      notes.push(
        `The guide gives ${letters.join(', ')} for a question with one answer. Klunk has not chosen between them.`,
      )
      return { question, answered: false }
    }
    const index = indicesOf(letters, (config.choices ?? []).length, notes)[0]
    if (index === undefined) return { question, answered: false }
    return { question: { ...question, config: { ...config, correctAnswer: index } }, answered: true }
  }

  if (type === 'multiple_response') {
    const indices = indicesOf(letters, (config.choices ?? []).length, notes)
    if (indices.length === 0) return { question, answered: false }
    return {
      question: { ...question, config: { ...config, correctAnswers: indices } },
      answered: true,
    }
  }

  notes.push(
    `The guide answers this with ${letters.join(', ')}, and ${QUESTION_TYPE_LABELS[type].toLowerCase()} has no options to choose between.`,
  )
  return { question, answered: false }
}

/** Letters to positions, refusing any that names an option this question lacks. */
function indicesOf(letters: string[], available: number, notes: string[]): number[] {
  const out: number[] = []
  for (const letter of letters) {
    const index = letter.toUpperCase().charCodeAt(0) - 65
    if (index < 0 || index >= available) {
      notes.push(
        available === 0
          ? `The guide answers ${letter}, and no options were read for this question.`
          : `The guide answers ${letter}, which is not one of the ${available} options read for this question.`,
      )
      continue
    }
    out.push(index)
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

/** The criteria, the sample answer and the list of what a marker may accept. */
function withGuide(question: Question, entry: MarkingEntry): Question {
  const guide = { ...(question.markingGuide ?? {}) }
  if (entry.criteria?.length) guide.criteria = entry.criteria.map((c) => ({ ...c }))
  if (entry.sampleAnswer) guide.sampleAnswer = entry.sampleAnswer
  if (entry.answersCouldInclude?.length) guide.answersCouldInclude = [...entry.answersCouldInclude]
  return Object.keys(guide).length > 0 ? { ...question, markingGuide: guide } : question
}

/**
 * A guide marks part by part under its own `Question 11 (a)` heading.
 *
 * The part labels are compared with their brackets taken off, because the paper
 * readers write `a` and a transcription writes `(a)`, and a guide keyed to the
 * one that does not match would silently mark nothing.
 */
function withParts(question: Question, entries: MarkingEntry[], notes: string[]): Question {
  const marked = entries.filter((e) => e.part !== undefined)
  if (marked.length === 0) return question

  const parts = question.config?.parts
  if (!parts?.length) {
    notes.push(
      `The guide marks ${marked.map((e) => `(${e.part})`).join(', ')}, and this question has no parts.`,
    )
    return question
  }

  const next = parts.map((part) => {
    const entry = marked.find((e) => e.part === bare(part.label))
    if (!entry) return part
    const out: QuestionPart = { ...part }
    if (entry.criteria?.length) out.criteria = entry.criteria.map((c) => ({ ...c }))
    if (entry.sampleAnswer) out.sampleAnswer = entry.sampleAnswer
    return out
  })

  for (const entry of marked) {
    if (!parts.some((p) => bare(p.label) === entry.part)) {
      notes.push(`The guide marks a part (${entry.part}) that is not on this question.`)
    }
  }
  return { ...question, config: { ...(question.config ?? {}), parts: next } }
}

function bare(label: string): string {
  return label.replace(/[()\s.]/g, '').toLowerCase()
}
