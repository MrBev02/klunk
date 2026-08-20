/**
 * Reading back whatever the AI made of a marking guide.
 *
 * `ingest.ts`'s job on the guide side, and its three rules unchanged: repair
 * something unambiguous and say so, drop something it cannot trust and say so,
 * or refuse. What it never does is accept quietly.
 *
 * **What it will not do is invent an answer, and that is the whole point of the
 * file.** #66 was a markscheme Klunk could not read, which left thirty
 * questions all answered A and ready to print with nothing on the page saying
 * the answers had never been read. A model handed the same document answers
 * every question confidently. So an entry that states no answer produces an
 * entry with no answer here: absent stays absent, and `[]` is refused rather
 * than read as "none of these", which is the distinction #32 settled on the
 * question side.
 *
 * The letters are kept as letters. Resolving `B` against the options a question
 * actually holds belongs to `applyMarking`, which has the question; here `B` is
 * normalised and nothing more, so a guide naming an option the paper never
 * printed is reported against that question rather than turned into a number
 * somewhere it cannot be checked.
 */

import { asArray, asNumber, asString, extractJson, readCriteria, strings } from './ingest'
import type { Marking, MarkingEntry } from './marking'

export interface MarkingContext {
  /**
   * Outcome codes the prompt listed. Empty means do not check.
   *
   * The same rule as a draft: a model may only choose among the codes it was
   * offered, so a guide read against the wrong course cannot tag a question
   * with an outcome that does not exist.
   */
  outcomes: string[]
}

/** Fields Klunk stores, plus the ones it will accept under another name. */
const KNOWN_FIELDS = new Set([
  'number',
  'part',
  'answer',
  'answers',
  'links',
  'criteria',
  'sampleAnswer',
  'answersCouldInclude',
  'outcomes',
  'unreadable',
  // tolerated aliases, consumed below
  'question',
  'questionNumber',
  'correctAnswer',
  'correctAnswers',
  'matches',
  'bands',
  'label',
  'marks',
])

export function readMarking(pasted: string, ctx: MarkingContext): Marking {
  const notes: string[] = []
  const rejected: { at: number; why: string }[] = []

  const found = extractJson(pasted)
  if ('failure' in found)
    return { entries: [], byAi: true, rejected, notes, failure: found.failure }
  if (found.note) notes.push(found.note)

  let value: unknown
  try {
    value = JSON.parse(found.json)
  } catch (err) {
    return {
      entries: [],
      byAi: true,
      rejected,
      notes,
      failure:
        `That is not valid JSON: ${(err as Error).message}. Copy the whole reply, ` +
        'code block and all, and paste it again. If the model stopped halfway ' +
        'through, ask it for fewer questions.',
    }
  }

  const list = entriesFrom(value)
  if ('failure' in list) return { entries: [], byAi: true, rejected, notes, failure: list.failure }
  if (list.note) notes.push(list.note)

  const entries: MarkingEntry[] = []
  list.items.forEach((raw, at) => {
    // The last object of a long reply is the model saying what it could not
    // read, which the paper prompt asks for in the same words. It is not an
    // entry and it is the most important thing in the reply.
    const pages = unreadablePages(raw)
    if (pages !== undefined) {
      notes.push(`The AI could not read part of the guide: ${pages}`)
      return
    }
    const read = readEntry(raw, ctx, notes)
    if ('why' in read) rejected.push({ at, why: read.why })
    else entries.push(read)
  })

  if (entries.length === 0 && rejected.length === 0) {
    return {
      entries,
      byAi: true,
      rejected,
      notes,
      failure: 'That JSON parsed, but holds no answers.',
    }
  }
  return { entries, byAi: true, rejected, notes }
}

function unreadablePages(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const obj = raw as Record<string, unknown>
  if (obj.number !== undefined) return undefined
  return asString(obj.unreadablePages) ?? asString(obj.unreadable)
}

function entriesFrom(value: unknown): { items: unknown[]; note?: string } | { failure: string } {
  if (Array.isArray(value)) return { items: value }

  if (typeof value !== 'object' || value === null) {
    return { failure: `Expected an array of answers, but that JSON is a ${typeof value}.` }
  }

  const obj = value as Record<string, unknown>
  for (const key of ['entries', 'questions', 'answers', 'markingGuide']) {
    if (Array.isArray(obj[key])) {
      return { items: obj[key], note: 'Read the answers out of the object wrapped around them.' }
    }
  }
  if (obj.number !== undefined) {
    return { items: [obj], note: 'That was a single question rather than a list.' }
  }

  // An answer key written as { "1": "D", "2": "B" }, which is what a model
  // reaches for when the guide is a bare grid of numbers and letters. It is
  // unambiguous, so it is repaired rather than refused.
  const pairs = Object.entries(obj).filter(([k]) => /^\d+$/.test(k))
  if (pairs.length > 0 && pairs.length === Object.keys(obj).length) {
    return {
      items: pairs.map(([k, v]) => ({ number: Number(k), answer: v })),
      note: 'Read the answers out of a list of question numbers.',
    }
  }

  const keys = Object.keys(obj)
  return {
    failure:
      'Expected an array of answers. That JSON is an object with ' +
      (keys.length === 0 ? 'no keys at all' : `the keys ${keys.slice(0, 8).join(', ')}`) +
      ', and none of them holds a list of answers.',
  }
}

/* ------------------------------------------------------------------ one entry */

function readEntry(
  raw: unknown,
  ctx: MarkingContext,
  notes: string[],
): MarkingEntry | { why: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { why: `expected an answer object, got ${Array.isArray(raw) ? 'an array' : typeof raw}` }
  }
  const src = raw as Record<string, unknown>

  const number = asNumber(src.number ?? src.question ?? src.questionNumber)
  if (number === undefined || !Number.isInteger(number) || number < 1) {
    return { why: 'no question number, so there is nothing here to mark' }
  }

  const entry: MarkingEntry = { number }

  const part = readPart(src.part ?? src.label)
  if (part !== undefined) entry.part = part

  const stated = src.answer ?? src.correctAnswer
  const several = src.answers ?? src.correctAnswers
  const trueFalse = readTrueFalse(stated)
  if (trueFalse !== undefined) entry.trueFalse = trueFalse
  else {
    const letters = readLetters(several ?? stated, number, notes)
    if (letters.length > 0) entry.answers = letters
  }

  const links = readLinks(src.links ?? src.matches, number, notes)
  if (links.length > 0) entry.links = links

  const criteria = readCriteria(src.criteria ?? src.bands, notes)
  if (criteria.length > 0) entry.criteria = criteria

  const sample = asString(src.sampleAnswer)
  if (sample !== undefined) entry.sampleAnswer = sample

  const could = strings(src.answersCouldInclude)
  if (could.length > 0) entry.answersCouldInclude = could

  const outcomes = readOutcomes(src.outcomes, ctx, number, notes)
  if (outcomes.length > 0) entry.outcomes = outcomes

  const unreadable = asString(src.unreadable)
  if (unreadable !== undefined) entry.unreadable = unreadable

  // An entry that names a question and says nothing about it is not an entry.
  // The prompt asks for exactly that: "An entry the guide says nothing about is
  // left out altogether." Accepting them is how a reply that is not a marking
  // guide at all reads as a success: the paper's own transcription pasted into
  // this box has a `number` on all 30 of its questions, so all 30 arrived,
  // nothing landed on anything, and the panel closed reporting no error (#94).
  if (!saysSomething(entry)) {
    return { why: `named Question ${number} and said nothing about it` }
  }

  const unknown = Object.keys(src).filter((k) => !KNOWN_FIELDS.has(k))
  if (unknown.length > 0) {
    notes.push(
      `Question ${number}: ignored ${unknown.length === 1 ? 'a field' : 'fields'} Klunk does ` +
        `not store (${unknown.join(', ')}).`,
    )
  }

  return entry
}

/**
 * Does this entry carry anything a marking guide states?
 *
 * `unreadable` counts: an entry saying only that the criteria for question 5
 * could not be made out is the model doing what it was asked to do. A `part` on
 * its own does not, being a key rather than a claim.
 */
function saysSomething(entry: MarkingEntry): boolean {
  return (
    entry.answers !== undefined ||
    entry.links !== undefined ||
    entry.trueFalse !== undefined ||
    entry.criteria !== undefined ||
    entry.sampleAnswer !== undefined ||
    entry.answersCouldInclude !== undefined ||
    entry.outcomes !== undefined ||
    entry.unreadable !== undefined
  )
}

/** `(a)`, `a)` and `A` are all the part a guide calls `a`. */
function readPart(value: unknown): string | undefined {
  const raw = asString(value)
  if (raw === undefined) return undefined
  const cleaned = raw.replace(/[()\s.]/g, '').toLowerCase()
  return cleaned ? cleaned : undefined
}

function readTrueFalse(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  const raw = asString(value)?.toLowerCase()
  if (raw === 'true') return true
  if (raw === 'false') return false
  return undefined
}

/**
 * The option letters, as letters.
 *
 * A number is taken as a position and turned back into a letter, because a
 * model told twice to write a letter sometimes writes a zero-based index and
 * the two cannot be told apart later. Anything else is dropped and said.
 */
function readLetters(value: unknown, number: number, notes: string[]): string[] {
  const out: string[] = []
  let dropped = 0
  for (const entry of asArray(value)) {
    if (typeof entry === 'number' && Number.isInteger(entry) && entry >= 0 && entry < 26) {
      const as = String.fromCharCode(65 + entry)
      notes.push(`Question ${number}: read the answer ${entry} as option ${as}.`)
      out.push(as)
      continue
    }
    const raw = asString(entry)
    if (raw === undefined) {
      dropped += 1
      continue
    }
    // "B.", "(B)" and "Option B" are all B. Two letters together are two
    // answers, which is what a guide prints for a multiple-response question.
    const letters = raw.toUpperCase().match(/\b[A-Z]\b/g)
    if (letters === null) {
      dropped += 1
      continue
    }
    out.push(...letters)
  }
  if (dropped > 0) {
    notes.push(
      `Question ${number}: dropped ${dropped === 1 ? 'an answer' : `${dropped} answers`} that ` +
        'named no option.',
    )
  }
  return [...new Set(out)]
}

function readLinks(
  value: unknown,
  number: number,
  notes: string[],
): { item: number; options: string[] }[] {
  const out: { item: number; options: string[] }[] = []
  let dropped = 0
  for (const entry of asArray(value)) {
    if (typeof entry !== 'object' || entry === null) {
      dropped += 1
      continue
    }
    const link = entry as Record<string, unknown>
    const item = asNumber(link.item ?? link.number)
    const options = readLetters(link.options ?? link.option ?? link.answer, number, notes)
    if (item === undefined || !Number.isInteger(item) || item < 1 || options.length === 0) {
      dropped += 1
      continue
    }
    out.push({ item, options })
  }
  if (dropped > 0) {
    notes.push(
      `Question ${number}: dropped ${dropped === 1 ? 'a link' : `${dropped} links`} with no item ` +
        'number or no option.',
    )
  }
  return out
}

function readOutcomes(
  value: unknown,
  ctx: MarkingContext,
  number: number,
  notes: string[],
): string[] {
  const given = strings(value)
  if (given.length === 0 || ctx.outcomes.length === 0) return given

  const kept = given.filter((code) => ctx.outcomes.includes(code))
  const lost = given.filter((code) => !ctx.outcomes.includes(code))
  if (lost.length > 0) {
    notes.push(
      `Question ${number}: dropped the outcome ${lost.join(', ')}, which is not in this course.`,
    )
  }
  return kept
}
