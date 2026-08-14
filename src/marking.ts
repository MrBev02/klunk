/**
 * What a marking guide says, in the one vocabulary both halves of #94 use.
 *
 * `guideprompt.ts` writes the skeleton into a prompt, `guideingest.ts` reads the
 * reply back into entries, and `applyMarking` in `adopt.ts` puts those entries
 * onto questions. Keeping the types here rather than in either of those is what
 * stops the prompt and the reader disagreeing about what a guide can state.
 *
 * **This is not `ExtractedGuide`, and the reason is #32.** The first design
 * reused it, on the ground that it is the shape both existing guide readers
 * already produce. Its `answerKey` is `Record<number, string>`: one option
 * letter per question, which is a NESA Section I and nobody else's. The two
 * scanned Enterprise Computing papers set **six of their fifteen** objective
 * questions as multiple response or matching, so reusing that shape would have
 * thrown away the answers to 40% of Section I on the very documents this was
 * built for. A guide states what a question needs, and since #32 a question can
 * need several letters or a set of links.
 *
 * Everything here is plain values, so all of it tests without a PDF and without
 * a browser.
 */

import type { MarkCriterion, Question, QuestionType } from './types'

/* ---------------------------------------------------------- what is offered */

/**
 * One question as the prompt describes it: enough to key an answer to, and no
 * more.
 *
 * There is deliberately no question text in here. The guide prints the numbers
 * on its own pages, so the skeleton is all the reply needs, and leaving the
 * words out keeps what leaves the machine to the file the teacher attaches.
 */
export interface MarkingSkeleton {
  number: number
  questionType: QuestionType
  marks: number
  /** How many options there are to choose between, where a question offers any. */
  optionCount?: number | undefined
  /** How many numbered items a matching question sets. */
  itemCount?: number | undefined
  parts?: { label: string; marks: number }[] | undefined
}

/**
 * The skeleton of a question already read or transcribed.
 *
 * Returns nothing for a question whose number is not a number. Every question
 * on this screen came off a paper and carries one, but an id is not a number
 * and a guide cannot be keyed to a question the guide cannot name.
 */
export function skeletonFor(question: Question): MarkingSkeleton | undefined {
  const printed = question.source?.questionNumber
  if (printed === undefined || !/^\d+$/.test(printed.trim())) return undefined

  const config = question.config
  const skeleton: MarkingSkeleton = {
    number: Number(printed.trim()),
    questionType: question.questionType,
    marks: question.marks,
  }

  const options = config?.choices ?? config?.options
  if (options?.length) skeleton.optionCount = options.length
  if (config?.items?.length) skeleton.itemCount = config.items.length
  if (config?.parts?.length) {
    skeleton.parts = config.parts.map((p) => ({ label: p.label, marks: p.marks }))
  }
  return skeleton
}

/* ------------------------------------------------------------ what came back */

/**
 * What the guide says about one question, or one part of one.
 *
 * Every field is optional but `number`, because a guide states what that
 * question needs and nothing else: a criteria table gives no letters, and an
 * answer key gives no criteria.
 */
export interface MarkingEntry {
  number: number
  /** `a`, `b`, `c` where the guide marks a part on its own. */
  part?: string
  /**
   * The option letters the guide gives, in the order printed.
   *
   * One for a multiple-choice question, several for a multiple-response one.
   * **Absent means the guide did not state an answer**, and it is the case this
   * type exists to keep: #32 settled that an absent answer is unknown rather
   * than none, and #66 is what happens when unknown is filled in anyway. A reply
   * offering an empty list has stated nothing, so it arrives here as absent too.
   */
  answers?: string[]
  /** Matching: which lettered options each numbered item links to. */
  links?: { item: number; options: string[] }[]
  /** True or false, where the guide states one. */
  trueFalse?: boolean
  criteria?: MarkCriterion[]
  sampleAnswer?: string
  answersCouldInclude?: string[]
  outcomes?: string[]
  /** What the model could not read here, kept as a warning on the question. */
  unreadable?: string
}

export interface Marking {
  entries: MarkingEntry[]
  /**
   * Whether a model produced these, or one of Klunk's own readers did.
   *
   * `applyMarking` serves both and cannot tell them apart from the entries,
   * which are identical by design. Without this it said *This answer was
   * transcribed by an AI* over a guide `guide.ts` had read perfectly well, which
   * is a false statement in the direction that matters least but is still one
   * Klunk made about its own work.
   */
  byAi: boolean
  /** What it took to find the JSON, and what was repaired or dropped. */
  notes: string[]
  /** Entries that were not entries, and why. */
  rejected: { at: number; why: string }[]
  /** Why nothing could be read at all. Present only when `entries` is empty. */
  failure?: string
}

/**
 * Said on every question an AI answered, and it is not decoration.
 *
 * #66 was a marking guide that read as empty, leaving thirty questions all
 * answered A and ready to print. Nothing on the page said the answers had never
 * been read. An answer transcribed by a model is a better guess than that and is
 * still a guess, so it says so beside the question it marks.
 */
export const CHECK_THE_ANSWER =
  'This answer was transcribed by an AI from the marking guide. Check it against the guide.'

/**
 * Stamped where a model supplied the marking, and it outlives the review panel.
 *
 * `CHECK_THE_ANSWER` is a note, and a note is gone the moment the question is
 * saved. The answers and criteria are not: they print on a marking guide months
 * later, and a teacher asking where a criterion came from has nothing else to
 * read. The question itself may be Klunk's own reading of a paper, so this says
 * only what it says.
 */
export const AI_MARKED_TAG = 'ai-marked'

/* ------------------------------------------- a guide Klunk read for itself */

/**
 * What `guide.ts` or `answerkey.ts` read, in the shape `applyMarking` takes.
 *
 * This exists for the pairing #94 found unhandled: a **scanned paper whose
 * marking guide reads perfectly**. The paper comes back through `ingest.ts` as
 * questions rather than as an `ExtractedPaper`, so `applyGuide` has nothing to
 * work on and the guide was dropped without a word. Converting the other way is
 * a dozen lines and needs no second reader.
 *
 * `ExtractedGuide.answerKey` gives one letter per question, which is a NESA
 * Section I: a question needing several letters or a set of links has none
 * there, and that is the document rather than a loss here.
 */
export function markingFromGuide(guide: {
  answerKey: Record<number, string>
  entries: { number: number; part?: string; criteria: MarkCriterion[]; sampleAnswer?: string }[]
  mapping: { number: number; part?: string; outcomes: string[] }[]
}): Marking {
  const byKey = new Map<string, MarkingEntry>()
  const at = (number: number, part?: string): MarkingEntry => {
    const key = `${number}/${part ?? ''}`
    const found = byKey.get(key)
    if (found) return found
    const made: MarkingEntry = part === undefined ? { number } : { number, part }
    byKey.set(key, made)
    return made
  }

  for (const [number, letter] of Object.entries(guide.answerKey)) {
    at(Number(number)).answers = [letter]
  }
  for (const entry of guide.entries) {
    const made = at(entry.number, entry.part)
    if (entry.criteria.length > 0) made.criteria = entry.criteria.map((c) => ({ ...c }))
    if (entry.sampleAnswer) made.sampleAnswer = entry.sampleAnswer
  }
  // The mapping grid covers every question in the paper, the objective ones
  // included, and is the only place a multiple-choice question's outcomes are
  // written. It is keyed by question rather than by part for that reason.
  for (const row of guide.mapping) {
    if (row.outcomes.length === 0) continue
    const made = at(row.number)
    made.outcomes = [...new Set([...(made.outcomes ?? []), ...row.outcomes])]
  }

  // Klunk's own reading, so nothing here is an AI's claim.
  return { entries: [...byKey.values()], byAi: false, notes: [], rejected: [] }
}
