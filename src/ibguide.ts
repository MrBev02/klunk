/**
 * Reading the IB DP Design Technology subject guide into a model (#58).
 *
 * `src/ibdt.ts` reads the old-to-new syllabus map, which is a spreadsheet and is
 * easy to read — but it is **not the IB's document**. It is a third party's
 * transcription, a teacher may simply not have it, and nothing obliges one to
 * exist for the next revision. The guide is the source of truth and is what
 * every DP teacher holds, so it has to be a route in rather than merely the
 * thing the map was checked against.
 *
 * Like `src/extract.ts`, this takes positioned text and no PDF, so every rule in
 * it is testable without one. `src/pdftext.ts` stays the only place pdf.js is
 * named.
 *
 * **What the document promises, and what it does not.** The guide prints its
 * syllabus as a run of topics, and the reliable thing about a topic heading is
 * not that it looks like one — `A2.2 Prototyping techniques` also appears in the
 * planning prose and in the Overview table, where two columns interleave into
 * lines that match any pattern a heading would. What identifies it is the line
 * *underneath*: every one of the twenty-four topics is followed by
 * `Guiding question`, and nothing else in the document is. That is the same
 * lesson as the NESA papers — a heading is known by what closes and opens around
 * it — and it needs no font metric, so it survives pdf.js discarding one.
 *
 * **A page break reprints an understanding.** Where a topic runs over, the
 * statement is printed again at the top of the next page and the paragraph under
 * it continues mid-sentence. Counting distinct numbers gets the right total and
 * a **truncated content point**, which is #26 and #43 arriving in a third
 * document: the count was right while the content was wrong. So the repeat is
 * merged rather than deduplicated — the reprinted statement is dropped and what
 * follows is appended to the paragraph already open.
 *
 * **Nothing here carries more than the map does**, though the guide prints more:
 * the guiding question, the topic's teaching hours and the linking questions all
 * go past. That is deliberate for now. The two readers producing one identical
 * model is what makes either of them trustworthy rather than merely plausible —
 * `ibguide.corpus.test.ts` asserts it topic for topic — and a field on one side
 * only would spend that check. Carrying them is a schema question, not a
 * parsing one.
 */

import { toLines, type PageText } from './extract'
import { ibCourses, nameFor, pointText, type IbTopicRead } from './ibdt'
import { NotASyllabusError } from './syllabus'
import type { SyllabusCourse } from './types'

/**
 * The running head and foot of the syllabus pages.
 *
 * Dropped before anything is read, for the reason `src/extract.ts` drops the
 * NESA papers': they land *inside* a content point that spans a page break, so
 * leaving them in ends an understanding with "…usable, functional, effective and
 * safe. Design technology guide Syllabus content". Matched whole so that no
 * sentence containing the words can be mistaken for one.
 *
 * The page number is joined to the foot on even pages and set in the right
 * margin on odd ones, where `toLines` has already lifted it off as a margin
 * mark. Both are covered.
 */
const FURNITURE: RegExp[] = [
  /^Syllabus content$/,
  /^(?:\d+\s+)?Design technology guide(?:\s+\d+)?$/,
]

/** `A1.1 Ergonomics`, or `A3.2 Introduction to structural systems (HL only)`. */
const TOPIC = /^([A-C][1-4]\.\d+)\s+(\S.*)$/

/** The line under every topic heading in the syllabus, and under nothing else. */
const GUIDING = 'Guiding question'

/** `A. Design in theory`, printed once above the first topic of its theme. */
const THEME = /^([A-C])\.\s+(\S.*)$/

/**
 * `1. People` out of the Overview table.
 *
 * The four rows of the table are the levels of organization, and the table sets
 * each one beside its three topics, so the row reads
 * `1. People A1.1 Ergonomics B1.1 User-centred design C1.1 Responsibility of the`.
 * The conjunction with a topic code is what makes this safe: the document has
 * five other runs of `1.` to `4.`, in the aims, the assessment objectives and
 * the planning prose, and not one of them is followed by a topic code.
 */
const LEVEL = /^([1-4])\.\s+(.+?)\s+[A-C][1-4]\.\d+\b/

/**
 * `Standard level (SL) and higher level (HL): 10 hours`, or `Higher level (HL): 20 hours`.
 *
 * The second signal for whether a topic is HL only, the first being `(HL only)`
 * in its heading. Both are printed for all twenty-four topics and they agree, so
 * this is checked rather than assumed — the same posture `src/ibdt.ts` takes
 * towards a topic that is half HL.
 */
const HOURS = /^(Standard level \(SL\) and higher level \(HL\)|Higher level \(HL\)):\s*\d+\s*hours?$/

/** `1.1.5 In design, consideration must be given to work envelopes…`. */
const UNDERSTANDING = /^(\d+\.\d+\.\d+)\s+(\S.*)$/

/**
 * The paragraph under a statement, where the command term lives.
 *
 * Not `Students must be able to`, which is what 160 of the 161 openers say:
 * C1.1's 1.1.1 reads `Students must outline how…` and A4.1's 4.1.2 reads
 * `Students must be aware of…`. Requiring the full phrase would fold both of
 * those into the statement above them.
 */
const CONTENT = /^Students must\b/

/** Closes a topic body. Printed once per topic, after the last understanding. */
const LINKING = 'Linking questions'

/** The heading says it, and the hours line says it again. */
const HL_MARKER = /\s*\(HL only\)\s*$/i

/**
 * Read the subject guide into an SL course and an HL course.
 *
 * @param pages The whole PDF as positioned text, from `pagesFromDocument`.
 * @throws NotASyllabusError when the document holds no topic followed by
 *   `Guiding question`, or when a topic's two HL markers disagree.
 */
export function readIbGuide(pages: PageText[]): { courses: SyllabusCourse[] } {
  const lines = readable(pages)
  const heads = headingsIn(lines)

  if (heads.size === 0) {
    // Three documents get here and each needs a different answer, so all three
    // are given. The folder holds past papers and a NESA syllabus PDF beside
    // the guide, and every one of them is offered in the same list.
    throw new NotASyllabusError(
      'Klunk could not find the IB Design Technology syllabus in this PDF. It looks for ' +
        'topic headings numbered like A1.1, B2.2 and C4.1, each with Guiding question ' +
        'printed underneath, and this document has none. The subject guide is the only ' +
        'syllabus Klunk reads as a PDF: a NESA syllabus has to be the Word download rather ' +
        'than the PDF one, and a past paper belongs on the From a past paper tab.',
    )
  }

  const themes = themesIn(lines, heads)
  const levels = levelsIn(lines)
  const topics = readTopics(lines, heads, themes, levels).filter((t) => t.points.length > 0)

  if (topics.length === 0) {
    throw new NotASyllabusError(
      'Klunk found topic headings in this PDF but no understandings under any of them. A ' +
        'topic sets out its content as numbered statements such as 1.1.1, each followed by ' +
        'a paragraph beginning "Students must", and this document has none.',
    )
  }

  return { courses: ibCourses(topics, 'heading and the hours line under it') }
}

/* ------------------------------------------------------------------- reading */

/** Every page in reading order, as text, with the furniture taken out. */
function readable(pages: PageText[]): string[] {
  const out: string[] = []
  for (const page of pages) {
    for (const line of toLines(page)) {
      const text = line.text.trim()
      if (text === '' || FURNITURE.some((rule) => rule.test(text))) continue
      out.push(text)
    }
  }
  return out
}

/**
 * Which lines are topic headings.
 *
 * Thirty-six lines in the guide match `TOPIC`; twenty-four of them are the
 * syllabus. The other twelve are the Overview table, whose three columns
 * interleave into one line each — `B2.2 Modelling and C2.2 Design for a
 * circular` — and three sentences of planning prose. None of the twelve is
 * followed by `Guiding question`, and all twenty-four of the real ones are.
 */
function headingsIn(lines: string[]): Set<number> {
  const out = new Set<number>()
  for (const [index, line] of lines.entries()) {
    if (TOPIC.test(line) && lines[index + 1]?.trim() === GUIDING) out.add(index)
  }
  return out
}

/**
 * The theme for each of `A`, `B` and `C`.
 *
 * Printed once per theme, immediately above the theme's first topic. Read from
 * there rather than from the contents page or the Overview table, both of which
 * also carry the three names — the contents page joins a page number onto each
 * and the table runs all three together on one line.
 */
function themesIn(lines: string[], heads: Set<number>): Map<string, string> {
  const out = new Map<string, string>()
  for (const index of heads) {
    const above = (lines[index - 1] ?? '').trim()
    const theme = THEME.exec(above)
    if (theme && theme[1] === lines[index]![0]) out.set(theme[1]!, above)
  }
  return out
}

/**
 * The four levels of organization, keyed by the digit that names them.
 *
 * First match wins, which is the Overview table. If a later edition sets the
 * table out differently and none is found, the topic names come out as
 * `A1.1 Ergonomics` rather than `A1.1 People: Ergonomics` — a visible
 * difference in one line of a name, with the published heading still verbatim in
 * `text` and every id unchanged. That is not worth refusing a syllabus over,
 * which is what a required rule would do.
 */
function levelsIn(lines: string[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of lines) {
    const level = LEVEL.exec(line)
    if (level && !out.has(level[1]!)) out.set(level[1]!, level[2]!.trim())
  }
  return out
}

interface OpenPoint {
  number: string
  statement: string[]
  content: string[]
}

function readTopics(
  lines: string[],
  heads: Set<number>,
  themes: Map<string, string>,
  levels: Map<string, string>,
): IbTopicRead[] {
  const topics: IbTopicRead[] = []
  let topic: IbTopicRead | null = null
  let hlOnly = false
  let point: OpenPoint | null = null

  const close = () => {
    if (topic && point) {
      topic.points.push({
        text: pointText(joinLines(point.statement), joinLines(point.content)),
        hlOnly,
      })
    }
    point = null
  }

  let index = 0
  while (index < lines.length) {
    const line = lines[index]!

    if (heads.has(index)) {
      close()
      const heading = TOPIC.exec(line)!
      const number = heading[1]!
      topic = {
        id: number.replace(/\./g, '-'),
        name: nameFor(number, levels.get(number[1]!) ?? '', line),
        text: line,
        // Every topic of a theme takes the theme, not only the first, which is
        // the only one the heading is printed above.
        group: themes.get(number[0]!) ?? '',
        points: [],
      }
      hlOnly = HL_MARKER.test(line)
      topics.push(topic)
      index += 1
      continue
    }

    // Nothing outside a topic is content. The guide's appendices carry a
    // sentence opening `Students must`, and the assessment section carries
    // numbered lists; both fall here, after the last topic has been closed.
    if (!topic) {
      index += 1
      continue
    }

    if (line === LINKING) {
      close()
      topic = null
      index += 1
      continue
    }

    const hours = HOURS.exec(line)
    if (hours && !point) {
      checkLevel(topic, hlOnly, !hours[1]!.startsWith('Standard level'))
      index += 1
      continue
    }

    const understanding = UNDERSTANDING.exec(line)
    if (understanding) {
      // A page break reprints the open statement before continuing the
      // paragraph under it. Merged rather than counted: dropping the repeat by
      // its number alone would leave the paragraph cut off mid-sentence.
      if (point && understanding[1] === point.number) {
        const after = skipReprint(lines, index, point.statement.join(' '))
        if (after > index) {
          index = after
          continue
        }
      }
      close()
      point = { number: understanding[1]!, statement: [line], content: [] }
      index += 1
      continue
    }

    if (point) {
      if (point.content.length > 0 || CONTENT.test(line)) point.content.push(line)
      else point.statement.push(line)
    }
    index += 1
  }

  close()
  return topics
}

/**
 * One paragraph back out of the lines it was printed on.
 *
 * A line ending in a hyphen is joined to the next with **no space**, because a
 * line break is not a space and the hyphen is on the page. Two content points
 * turn on this: without it they read `multi- meters` and `decision- making`,
 * which is not a rendering anything intends.
 *
 * The trade is real and is worth stating. A suspended compound —
 * `compare open- and closed-loop systems` — would be welded into `open-and` if
 * it ever fell at a line end. It does not, in this guide: five lines in the
 * syllabus section end in a hyphen and all five are hyphens inside a word. The
 * alternative rule, dropping the hyphen instead, is what the syllabus map's
 * transcriber did, and it produced `decisionmaking`.
 */
function joinLines(lines: string[]): string {
  let out = ''
  for (const line of lines) {
    if (out === '') out = line
    else if (out.endsWith('-')) out += line
    else out += ` ${line}`
  }
  return out
}

/**
 * How far the reprinted statement runs, or `from` if this is not a reprint.
 *
 * The repeat is the statement verbatim, so it ends where the accumulated text
 * stops being a prefix of the statement already read. That gives a definite stop
 * without knowing anything about the page: the first line that is not part of
 * the repeat is the paragraph continuing, and it is handed back unread.
 */
function skipReprint(lines: string[], from: number, statement: string): number {
  let seen = ''
  let index = from
  while (index < lines.length) {
    const next = seen === '' ? lines[index]! : `${seen} ${lines[index]!}`
    if (!statement.startsWith(next)) break
    seen = next
    index += 1
  }
  return index
}

/**
 * The heading's `(HL only)` against the hours line's `Standard level (SL)`.
 *
 * Two independent statements of the same fact, printed for all twenty-four
 * topics. A topic in the wrong course is invisible on screen — it looks like a
 * topic — and would quietly offer HL content to an SL paper, so this is checked
 * rather than trusted to one of them.
 */
function checkLevel(topic: IbTopicRead, byHeading: boolean, byHours: boolean): void {
  if (byHeading === byHours) return
  throw new NotASyllabusError(
    `${topic.text} disagrees with itself about whether it is HL only: the heading ` +
      `${byHeading ? 'says it is' : 'does not say so'} and the hours line under it ` +
      `${byHours ? 'says it is' : 'does not'}. Klunk will not guess which is right, ` +
      'because the wrong answer puts a whole topic in the wrong course without looking ' +
      'like a fault.',
  )
}
