/**
 * Reading a paper that is nothing but numbered multiple-choice questions.
 *
 * `src/extract.ts` reads a NSW HSC paper, and every rule in it is NESA's: a
 * `Section I` heading has to have been seen before a numbered question counts,
 * and a question outside Section I needs a `Question 11 (5 marks)` heading. A
 * paper that prints `1.` and four options and nothing else matched none of it
 * and produced nothing at all (#64).
 *
 * This takes positioned text and no PDF, for the reason `extract.ts` does: every
 * rule in here is testable without one, and `src/pdftext.ts` stays the only
 * place pdf.js is named. It shares `toLines` and the `Line` shape rather than
 * rebuilding either, because the reading-order problem is the same problem.
 *
 * **What it will not do is guess.** A document is claimed only when a run of
 * questions numbered from 1 is found, ascending by one, most of them carrying
 * exactly four options labelled A to D in order. Anything less is refused, so
 * that a numbered list in a syllabus or a contents page cannot be read as an
 * examination. That is the `formats.ts` contract applied to papers: a reader
 * that refuses what it does not recognise is what makes trying readers in order
 * safe.
 *
 * **Every question is taken as one mark.** `extract.ts` makes the same
 * assumption about Section I and for the same reason — an objective paper marks
 * each question at one and prints no mark against any of them, because there is
 * nothing to vary. Where the paper states a total, it is checked against the
 * count rather than trusted, and a disagreement is reported. That is the one
 * check worth making here: a count that is right while the content is wrong is
 * this repository's oldest lesson, and the total is the only independent
 * statement of the count the paper makes.
 */

import {
  type ExtractedOption,
  type ExtractedPaper,
  type ExtractedQuestion,
  type Line,
  NotAPaperError,
  type PageText,
  type QuestionSpan,
  toLines,
} from './extract'

/** `1. A library self-service kiosk has been designed…` */
const STEM = /^(\d{1,3})[.)]\s+(\S.*)$/

/**
 * `A. 99th percentile`, and `A)` because both are printed.
 *
 * `extract.ts` has its own copy of this, which allows an opening bracket because
 * NESA printed `(A)` until 2017. Kept separate rather than shared: that rule is
 * a fact about NESA's papers between two known years, and widening it to serve
 * both documents would make it a fact about neither.
 *
 * Lower case is taken too, and the label upper-cased where it is read, because
 * `a)` and `A)` cannot mean two different things. The separator is deliberately
 * *not* widened past `.` and `)`: those two are observed and anything else would
 * be an untested path added for a format nobody has published.
 */
const OPTION = /^([A-Da-d])[.)]\s+(\S.*)$/

/** `The maximum mark for the examination paper is [30 marks].` */
const TOTAL = /maximum mark[^.]*?\[?\s*(\d{1,3})\s*marks?\s*\]?/i

/**
 * How many questions make a paper.
 *
 * Below this it is a list that happens to be numbered. Five is low enough that
 * no real objective paper is refused and high enough that a contents page or a
 * set of instructions cannot reach it.
 */
const MINIMUM = 5

/**
 * Read a paper of numbered multiple-choice questions.
 *
 * @throws NotAPaperError when the document is not one.
 */
export function readObjectivePaper(pages: PageText[]): ExtractedPaper {
  const lines = withoutFurniture(pages)

  const built: Building[] = []
  let open: Building | null = null

  for (const line of lines) {
    const stem = STEM.exec(line.text)
    // Only the next number in sequence opens a question. A wrapped line starting
    // with a digit is far likelier than the numbering jumping, which is the rule
    // `extract.ts` already takes for Section I.
    if (stem && Number(stem[1]) === (open ? open.number + 1 : 1)) {
      if (open) built.push(open)
      open = {
        number: Number(stem[1]),
        pages: new Set([line.page]),
        body: [{ ...line, text: stem[2]! }],
        all: [line],
      }
      continue
    }
    if (open) {
      open.pages.add(line.page)
      open.body.push(line)
      open.all.push(line)
    }
  }
  if (open) built.push(open)

  const questions = built.map(finish)
  refuseUnlessObjective(questions)

  return { questions, notes: totalNotes(lines, questions.length) }
}

/* ------------------------------------------------------------------ the walk */

interface Building {
  number: number
  pages: Set<number>
  /** Body lines in order, before the stem and the options are told apart. */
  body: Line[]
  /** Every line the question owns, kept only to work out how far down a page it reaches. */
  all: Line[]
}

function finish(building: Building): ExtractedQuestion {
  const notes: string[] = []
  const { stem, options } = splitOptions(building.body)

  if (options.length !== 4) {
    notes.push(
      `Read ${options.length} options rather than four. Check this question against the paper.`,
    )
  }
  if (stem === '') {
    notes.push('No text was read for this question at all. Check it against the paper.')
  }

  return {
    number: building.number,
    marks: 1,
    text: stem,
    questionType: 'multiple_choice',
    // The schema `extract.ts` established has three sections and an objective
    // paper has none. Section I is where an objective question belongs in it,
    // and it is what makes the question type right everywhere downstream.
    section: 'I',
    options,
    figures: [],
    pages: [...building.pages].sort((a, b) => a - b),
    spans: spansOf(building.all),
    notes,
  }
}

function splitOptions(body: Line[]): { stem: string; options: ExtractedOption[] } {
  const stem: string[] = []
  const options: ExtractedOption[] = []
  for (const line of body) {
    const option = OPTION.exec(line.text)
    if (option) {
      // Upper-cased here so `refuseUnlessObjective` and everything downstream
      // see one alphabet, whichever the paper printed.
      options.push({ label: option[1]!.toUpperCase(), text: option[2]!.trim() })
      continue
    }
    // A wrapped option continues the one above it, never the stem: the stem is
    // finished by the time the first option is printed.
    if (options.length > 0) {
      const last = options[options.length - 1]!
      last.text = `${last.text} ${line.text}`.trim()
      continue
    }
    if (line.text) stem.push(line.text)
  }
  return { stem: stem.join(' ').trim(), options }
}

/** How far down each page a question's own lines reach, for cutting pictures out. */
function spansOf(lines: Line[]): QuestionSpan[] {
  const byPage = new Map<number, QuestionSpan>()
  for (const line of lines) {
    const held = byPage.get(line.page)
    if (!held) byPage.set(line.page, { page: line.page, top: line.y, bottom: line.y })
    else {
      held.top = Math.max(held.top, line.y)
      held.bottom = Math.min(held.bottom, line.y)
    }
  }
  return [...byPage.values()].sort((a, b) => a.page - b.page)
}

/* --------------------------------------------------------------- the contract */

/**
 * Refuse a document that is not an objective paper.
 *
 * Two conditions, and both are needed. A run of questions numbered from 1 with
 * no options is a numbered list; four options under something that is not a
 * numbered run is a fragment of one. Only the conjunction is an examination.
 *
 * The majority rather than all of them, because a real paper prints the odd
 * question with three options or five, and `finish` has already said so on the
 * question it belongs to. Refusing the whole document over one of those would
 * throw away the other twenty-nine.
 */
function refuseUnlessObjective(questions: ExtractedQuestion[]): void {
  if (questions.length < MINIMUM) {
    throw new NotAPaperError(
      'Klunk read no questions in this document. It reads a paper of numbered ' +
        'multiple-choice questions, printed as "1." with four options labelled A to D.',
    )
  }

  const proper = questions.filter(
    (q) => (q.options ?? []).map((o) => o.label).join('') === 'ABCD',
  ).length
  if (proper * 2 <= questions.length) {
    throw new NotAPaperError(
      `Klunk found ${questions.length} numbered items in this document and only ` +
        `${proper} of them have four options labelled A to D, so it is not a ` +
        'multiple-choice paper.',
    )
  }
}

/**
 * Check the stated total against the count, and report a disagreement.
 *
 * Not enforced, because the paper is the record and Klunk is the one that may
 * have misread it. Saying so is what lets a teacher find the missing question
 * before the bank has it.
 */
function totalNotes(lines: Line[], found: number): string[] {
  for (const line of lines) {
    const stated = TOTAL.exec(line.text)
    if (!stated) continue
    const total = Number(stated[1])
    if (total === found) return []
    return [
      `This paper says it is worth ${total} marks and Klunk read ${found} questions. ` +
        'Every question was taken as one mark, so one of them is wrong.',
    ]
  }
  return []
}

/* -------------------------------------------------------------- page furniture */

/**
 * Drop the running head and foot, whatever this document's happen to be.
 *
 * `extract.ts` and `ibguide.ts` each name theirs in a list of patterns, which
 * they can because each serves one publisher. This reader serves any paper of
 * the shape, so it cannot know in advance that the words are `revisiondojo.com`
 * or a download stamp. What it can use is the thing that makes them furniture:
 * they are printed on every page, and nothing a question says is.
 *
 * It has to happen before anything is read, because the foot lands *after* the
 * last option on a page and would otherwise be welded onto it as a wrapped line.
 *
 * **Repetition alone is not enough, and getting this wrong is expensive.** A
 * paper whose questions all offer `A. True` and `B. False` prints those on every
 * page, and dropping them would take the options off every question while
 * leaving the count intact — this repository's oldest fault arriving in a new
 * reader. So the rule is a conjunction, as the guide reader's topic rule is: a
 * line is furniture when it repeats on most pages *and* is neither a numbered
 * stem nor an option. A running head has never been either.
 *
 * Only where there are enough pages for "on most of them" to mean anything. On
 * two pages a repeated line is as likely to be a coincidence as a footer, and
 * the cost of being wrong is a dropped line of a question.
 */
const ENOUGH_PAGES = 3

function withoutFurniture(pages: PageText[]): Line[] {
  const all = pages.flatMap((page) => toLines(page))

  const onPages = new Map<string, Set<number>>()
  for (const line of all) {
    const text = line.text.trim()
    if (!text || STEM.test(text) || OPTION.test(text)) continue
    const seen = onPages.get(text)
    if (seen) seen.add(line.page)
    else onPages.set(text, new Set([line.page]))
  }

  const repeated = new Set<string>()
  if (pages.length >= ENOUGH_PAGES) {
    for (const [text, seen] of onPages) {
      if (seen.size * 2 > pages.length) repeated.add(text)
    }
  }

  return all.filter((line) => line.text.trim() !== '' && !repeated.has(line.text.trim()))
}
