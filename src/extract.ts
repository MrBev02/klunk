/**
 * Turning a NESA past paper into questions a teacher can review.
 *
 * This module never sees a PDF. It takes positioned text — pieces with an x and
 * a y — and nothing else, which is what any PDF reader can honestly provide and
 * what makes every rule in here testable without one. `src/pdftext.ts` is the
 * only place pdf.js is mentioned.
 *
 * **Position is not a detail that can be flattened away early.** The marks for a
 * criterion or a part sit alone in the right margin, and where the text they
 * belong to wraps onto two lines, the mark is centred against the cell and lands
 * on its *own line between the two halves*:
 *
 *     • Provides characteristics and features of how technology supports the
 *     3
 *       communication between members of a design team
 *
 * So "the marks are at the end of the line" is wrong, and it is wrong in the PDF
 * rather than in any one reader — `pdftotext -layout` gets it wrong the same
 * way. The rule that does hold is positional: a bare number far enough to the
 * right is a margin mark wherever it lands, and it belongs to the block being
 * read, not to the line it fell on.
 *
 * What this does not do is decide. Everything uncertain is reported on the
 * question it belongs to and shown to the teacher before anything is saved,
 * because a paper printed from a silently mis-parsed question is discovered in
 * the exam room.
 */

import type { QuestionType } from './types'

/* ----------------------------------------------------------------- the input */

/** One run of text with its position on the page, in PDF points. */
export interface TextPiece {
  /** Left edge, from the left of the page. */
  x: number
  /** Baseline, from the bottom of the page. Higher is further up. */
  y: number
  /** Advance width, so the end of the piece is known and gaps can be measured. */
  width: number
  str: string
}

export interface PageText {
  /** 1-based, in reading order. */
  number: number
  /** Page width in points, so the right margin is a fraction rather than a guess. */
  width: number
  pieces: TextPiece[]
}

/* ------------------------------------------------------------------ the output */

/**
 * One row of a marking guide's criteria table.
 *
 * `marksTo` is set only for a band — an extended response is marked `13–15`,
 * `10–12`, `7–9` rather than at a single mark. `bank.schema.json` wants a
 * number, so a band has to be resolved before it can be saved; that is a
 * decision for whoever does the saving, not for the reader.
 */
export interface ExtractedCriterion {
  marks: number
  marksTo?: number
  description: string
}

export interface ExtractedPart {
  label: string
  text: string
  marks: number
  /** From the marking guide, once one has been applied. */
  criteria?: ExtractedCriterion[]
  sampleAnswer?: string
}

export interface ExtractedOption {
  label: string
  text: string
}

export interface ExtractedQuestion {
  number: number
  marks: number
  text: string
  questionType: QuestionType
  section: SectionLabel
  options?: ExtractedOption[]
  parts?: ExtractedPart[]
  /** Figures named in the text. What to say about a missing one is `adopt.ts`'s to decide. */
  figures: string[]
  /** Pages it was found on, which is what a teacher checks a doubtful question against. */
  pages: number[]
  /**
   * How far down each of those pages the question reaches.
   *
   * Only a picture needs this. A band of a page that no text touches is where a
   * photograph or a diagram sits, and it belongs to whichever question's text
   * surrounds it — which cannot be worked out from a page number alone when a
   * page carries the end of one question and the start of the next.
   */
  spans: QuestionSpan[]
  /** Anything the teacher must look at rather than trust. */
  notes: string[]
  /** Filled by `stampSource`, once the year and paper are known. */
  source?: QuestionSource

  /* Everything below comes from the marking guide, via `applyGuide`. */

  /** The correct option's label, for a multiple-choice question. */
  answer?: string
  /** Criteria for the question as a whole. Where it has parts, they hold their own. */
  criteria?: ExtractedCriterion[]
  sampleAnswer?: string
  /** Outcome codes the guide's mapping grid gives, e.g. ['H3.2', 'H6.2']. */
  outcomes?: string[]
  /** The grid's plain-English topic, which helps a teacher choose the syllabus ids. */
  content?: string
}

/** The top and bottom of a question's text on one page, in PDF points. */
export interface QuestionSpan {
  page: number
  /** The highest baseline, so the largest y. */
  top: number
  bottom: number
}

export type SectionLabel = 'I' | 'II' | 'III'

export interface ExtractedPaper {
  questions: ExtractedQuestion[]
  /** Read off the front matter, so the teacher confirms a year rather than typing one. */
  year?: number
  /** Problems with the paper as a whole, as against with one question. */
  notes: string[]
}

/**
 * Where a question came from, which an extracted one must carry.
 *
 * Reusing a recent HSC question in a school trial is a mistake that actually
 * happens, and Klunk can only warn about it if the year and number were
 * recorded. This is `source` in `bank.schema.json`, restated here so the
 * extractor does not depend on the storage layer.
 */
export interface QuestionSource {
  origin: 'authored' | 'extracted' | 'adapted'
  paper: string
  questionNumber: string
  /**
   * Absent when the paper does not print one, which is ordinary rather than a
   * failure: a practice paper is from no year at all.
   */
  year?: number
  /**
   * Absent unless Klunk knows who owns the paper, which it only does for NESA.
   *
   * `bank.schema.json` says this "constrains where the paper holding the
   * question may go", so a wrong one is not cosmetic. Guessing NESA for a
   * document read by any other reader would put a false owner on every question
   * of it (#70).
   */
  copyright?: string
}

/* ------------------------------------------------------------------ into lines */

export interface Line {
  page: number
  y: number
  /**
   * The left edge of the row's text, which is what tells a question from a table
   * cell that merely begins with a number.
   *
   * `8 am 41.1 18.8` is a row of a table of hourly temperatures, and it opened a
   * Question 8 that does not exist on the 2025 Biology paper. The text alone
   * cannot say otherwise; the position can, because a question number sits in
   * the left margin and a table sits inside it. Infinity where the row held
   * nothing but a margin mark.
   */
  x: number
  text: string
  /** A bare number alone in the right margin: marks for the block being read. */
  marginMark?: number
  /**
   * The top of a band, where the margin held a range rather than a number.
   *
   * Only the marking guides do this, and only for an extended response, whose
   * criteria are bands: `13–15`, `10–12`, `7–9`. A paper never has one.
   */
  marginTo?: number
}

export interface LineOptions {
  /** Baselines this far apart are the same row. */
  tolerance?: number
  /** Accept `13–15` in the margin as well as `3`. Marking guides only. */
  bands?: boolean
}

/**
 * Where the marks column starts, as a fraction of page width.
 *
 * Measured across all 22 files of the 2015–2025 corpus rather than guessed. The
 * papers put their marks at x=518 of 595 (0.871) and the marking guides put
 * theirs at x=485 (0.815) — two different columns, so one number has to clear
 * both. Body text is no guide to it: prose runs to x=524 and beyond, past the
 * papers' own marks column, so "furthest right" would read prose as marks.
 *
 * What makes the rule safe is the conjunction with a bare one- or two-digit
 * number. In the whole corpus the *only* such pieces beyond 0.6 of the width are
 * the marks themselves — no page number, figure label or measurement competes,
 * because page numbers carry dashes and the papers' own code is four digits. So
 * this sits below both columns and above anything that could be mistaken for
 * them, and it is a fraction because nothing promises every paper is A4.
 */
const MARGIN_FROM = 0.75

/** Two pieces further apart than this have a space between them. */
const SPACE_GAP = 1

/**
 * A ruled line for the student to write on, printed as a run of dots.
 *
 * Dropped per piece rather than per line. A whole row of them is easy to spot,
 * but a row also holding something else is not, and the papers produce exactly
 * that: the sideways margin notice puts one word on each ruled line's baseline,
 * so the row read as `............... Do`. Taking the rule out of the row leaves
 * whatever genuinely shares it.
 *
 * Four is well past an ellipsis and well short of any real line.
 */
function isRule(str: string): boolean {
  const text = str.trim()
  return /^[.…_\s]+$/.test(text) && (text.match(/[.…_]/g) ?? []).length >= 4
}

/** The geometry half of the rule, shared by the papers and the marking guides. */
export function isInMargin(x: number, pageWidth: number): boolean {
  return x >= pageWidth * MARGIN_FROM
}

/** An en dash in the guides, but a hyphen costs nothing to accept. */
const BAND = /^(\d{1,2})\s*[–-]\s*(\d{1,2})$/

function marginMark(piece: TextPiece, pageWidth: number, bands: boolean): [number, number] | null {
  const text = piece.str.trim()
  if (!isInMargin(piece.x, pageWidth)) return null
  if (/^\d{1,2}$/.test(text)) return [Number(text), Number(text)]
  if (!bands) return null
  const band = BAND.exec(text)
  return band ? [Number(band[1]), Number(band[2])] : null
}

function join(pieces: TextPiece[]): string {
  let out = ''
  let end = -Infinity
  for (const piece of pieces) {
    if (out !== '' && piece.x - end > SPACE_GAP) out += ' '
    out += piece.str
    end = piece.x + piece.width
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * Rebuild reading order from positions.
 *
 * Pieces arrive in content-stream order, which is the order the PDF was written
 * and not the order it is read. Grouping by baseline and sorting across fixes
 * that. Page coordinates run bottom-up, so descending y is top-down.
 */
export function toLines(page: PageText, options: LineOptions = {}): Line[] {
  const { tolerance = 2, bands = false } = options
  const rows: { y: number; pieces: TextPiece[] }[] = []
  for (const piece of page.pieces) {
    if (!piece.str.trim() || isRule(piece.str)) continue
    const row = rows.find((r) => Math.abs(r.y - piece.y) <= tolerance)
    if (row) row.pieces.push(piece)
    else rows.push({ y: piece.y, pieces: [piece] })
  }

  rows.sort((a, b) => b.y - a.y)

  return rows.map((row) => {
    row.pieces.sort((a, b) => a.x - b.x)
    const marks: [number, number][] = []
    const rest: TextPiece[] = []
    for (const piece of row.pieces) {
      const mark = marginMark(piece, page.width, bands)
      if (mark) marks.push(mark)
      else rest.push(piece)
    }
    const line: Line = {
      page: page.number,
      y: row.y,
      x: rest.length > 0 ? Math.min(...rest.map((p) => p.x)) : Number.POSITIVE_INFINITY,
      text: join(rest),
    }
    // Only when it is the sole mark on the row. Two numbers in the margin of one
    // row is not something this understands, and guessing would be worse.
    if (marks.length === 1) {
      const [from, to] = marks[0]!
      line.marginMark = from
      if (to !== from) line.marginTo = to
    }
    return line
  })
}

/* -------------------------------------------------------------- page furniture */

/**
 * Lines that are the paper rather than the questions.
 *
 * Every one of these was observed in the 2015–2025 corpus. They are dropped
 * before segmentation so that a heading is never missed because a footer landed
 * between it and its text.
 */
const FURNITURE: RegExp[] = [
  /^Question \d+ continues on page \d+$/i,
  /^Question \d+ continued on page \d+$/i,
  /^Please turn over$/i,
  /^End of paper$/i,
  /^End of Question \d+$/i,
  // The strip along the foot of every answer-space page from 2019. It is
  // horizontal, unlike the notice up the margin, so nothing else removes it.
  /^Office Use Only/i,
  /^Section [IV]+ – \d+ marks/i, // the front-matter contents list
  /^Section [IV]+\s+Pages? \d/i, // the other front-matter layout
  /^Sections? [IV]+ and [IV]+$/i, // a divider page between sections
  /^\d+ marks$/i, // the section cover block
  /^Attempt Questions? \d+([–\-]\d+)?$/i,
  /^Allow about \d+ minutes? for this section$/i,
  /^Answer the questions? in the spaces provided/i,
  /^These spaces provide guidance/i,
  /^Use the multiple-choice answer sheet/i,
  /^In your answer you will be assessed on/i,
  /^Please turn over$/i,
  /^[.…_\s]{10,}$/, // ruled answer lines
  /Used by permission\.?$/i,
]

/**
 * Furniture that also ends whatever question was being read.
 *
 * These only ever appear on a cover page, so meeting one means a new part of the
 * document has begun and anything still open finished on the page before.
 *
 * It matters from 2019, when the answer booklet started being bound into the
 * same PDF. Its cover falls immediately after Question 10, and reads: the
 * examination line, `Centre Number`, `Design and Technology`, `Student Number`,
 * `Sections II and III`, `Answer Booklet`. Dropping those lines one by one was
 * not enough — the course title is not furniture by any general rule, so it was
 * appended to Question 10's last option, and the booklet's instructions followed
 * it. Closing at the boundary drops all of it, because nothing is open to
 * absorb it.
 */
const BOUNDARY: RegExp[] = [
  /^Centre Number$/i,
  // The pages bound after the last question. Biology's carry
  // `Section II extra writing space`, sometimes with the first word printed
  // twice by two overlapping runs, which is why this is not anchored at the
  // start. Without it the last question claims four pages of ruled lines and
  // the heading is appended to its text.
  /Section [IV]+ extra writing space$/i,
  /^Student Number$/i,
  /^Answer Booklet$/i,
  /^\d{4} HIGHER SCHOOL CERTIFICATE EXAMINATION$/i,
]

function isBoundary(text: string): boolean {
  return BOUNDARY.some((re) => re.test(text))
}

/**
 * A footer row, which is where the paper's own code and the page number live.
 *
 * They share a baseline, so they arrive as one line — `2221 – 5 –` — and matching
 * them separately misses it. That mattered more than it looks: the line survived
 * into the body of the question heading printed on a section cover page, which
 * stopped that heading looking empty, which stopped it being recognised as the
 * teaser it is. 2016 and 2018 then reported a question twice.
 *
 * Any line with digits and no letters is taken as furniture. Nothing in a
 * question reads that way — even a table of figures carries a word somewhere.
 */
function isFooter(text: string): boolean {
  return /\d/.test(text) && !/\p{L}/u.test(text)
}

/**
 * Is this row at the left edge of its page's text?
 *
 * The one thing that tells a question from a table. A paper's data table is
 * indented inside the text block, so a row reading `8 am 41.1 18.8` looks
 * exactly like the eighth question of Section I and is 116 points to the right
 * of one. That was enough to invent a Question 8 on the 2025 Biology paper,
 * swallow the real one, and leave Question 7 with no options.
 *
 * Checked across thirteen documents — eleven years of D&T, 2025 Biology and the
 * practice paper — rather than assumed: every real numbered question sits at
 * its page's leftmost column, every line that merely looks like one is indented
 * past it, and nothing sits left of a question number.
 */
function atLeftEdge(line: Line, leftOf: Map<number, number>): boolean {
  const left = leftOf.get(line.page)
  return left === undefined || line.x <= left + 2
}

/**
 * The line without its copyright notice.
 *
 * A credit belongs to the figure or to the paper and never to the question, so
 * it goes — but it goes by itself. This used to drop the whole line on which a
 * `©` appeared anywhere, which was right for the two shapes the D&T corpus
 * prints (`© 2019 NSW Education Standards Authority` alone, and the same
 * sharing the last page's baseline with `– 12 –`) and wrong for the third:
 * 2025 Biology puts the credit for a picture on the same baseline as
 * `(b) 'Genetic technologies are beneficial for society.'`, and dropping the
 * line took part (b) with it — seven marks of an eleven-mark question, leaving
 * a question whose parts did not add up.
 *
 * Cutting from the mark to the end of the line is enough for all three: what
 * precedes it is either nothing, or a page number that is furniture in its own
 * right, or the question.
 *
 * Every line carrying a `©` in the eleven papers, their guides, the 2025
 * Biology paper and its guide was read before this was changed: 41 of them, of
 * which 33 are the credit alone, seven are the page number and the notice, and
 * one is Biology's part (b).
 */
function withoutCredit(text: string): string {
  const at = text.indexOf('©')
  return at === -1 ? text : text.slice(0, at).trim()
}

function isFurniture(text: string): boolean {
  return text === '' || isFooter(text) || FURNITURE.some((re) => re.test(text))
}

/** Kept out of the furniture filter so the walk can see it and close on it. */
function isDroppable(text: string): boolean {
  return isFurniture(text) && !isBoundary(text)
}

/* ------------------------------------------------------------------ the shapes */

/**
 * The one line that says which year this is.
 *
 * It is front matter and dropped as furniture, so the year is taken as it goes
 * past. Provenance needs it, and asking a teacher to type a year that is printed
 * on page one is a way of getting it wrong.
 */
const YEAR = /^(\d{4}) HIGHER SCHOOL CERTIFICATE EXAMINATION$/i

/*
 * Case-insensitive, as `YEAR` and `CONTINUED` beside them always were. These
 * two were not, which was an oversight rather than a decision: `Question 11
 * (5 Marks)` was refused by a reader that accepts `Question 11 (Continued)`.
 * Nothing in the corpus prints either that way, so this buys tolerance of a
 * change nobody has made rather than fixing an observed fault — the one thing
 * it is worth doing speculatively, because a capital letter cannot be a
 * different meaning.
 *
 * `SECTION`'s capture is used as a `SectionLabel`, so it has to be upper-cased
 * where it is read: `section ii` would otherwise set the label to `ii`, and
 * `SECTION_TYPE['ii']` is undefined, which is a question with no type and no
 * complaint.
 */
/*
 * `Section II`, and `Section II Answer Booklet` where the booklet is bound into
 * the same PDF and its cover carries the section's name.
 *
 * 2025 Biology prints the second, on one baseline, and it cost the whole of
 * Section II: the section never changed, so all fourteen written questions were
 * typed as multiple choice, lost their parts and their per-part marks, and each
 * arrived in the review panel as a question with no options that cannot be
 * saved. D&T's own booklet cover says `Answer Booklet` alone, which `BOUNDARY`
 * already closes on, so nothing in the corpus ever showed this.
 */
const SECTION = /^Section (I{1,3})(?: Answer Booklet)?$/i
const HEADING = /^Question (\d+) \((\d+) marks?\)$/i
const CONTINUED = /^Question (\d+) \(continued\)$/i
/** `(A) text` up to 2016, `A. text` from 2017. Both appear in the corpus. */
const OPTION = /^\(?([A-D])[.)]\s+(.+)$/
const PART = /^\(([a-z])\)\s*(.*)$/
const FIGURE = /\bFigure\s+(\d+)\b/g

/** What each section of this paper holds, from the profile that ships with Klunk. */
const SECTION_TYPE: Record<SectionLabel, QuestionType> = {
  I: 'multiple_choice',
  II: 'short_answer',
  III: 'extended_response',
}

/* -------------------------------------------------------------------- the walk */

interface Building {
  number: number
  marks: number
  section: SectionLabel
  pages: Set<number>
  /** Body lines in order, before they are split into stem, options and parts. */
  body: Line[]
  /**
   * Every line the question owns, headings included, kept only to work out how
   * far down each page it reaches. `body` cannot serve: a picture printed
   * between the heading and the first line of text would fall outside it.
   */
  all: Line[]
  notes: string[]
}

/**
 * A reader's refusal to claim a document.
 *
 * The sibling of `NotASyllabusError`, and it exists for the same reason: with
 * more than one reader, trying them in order is only safe if each one refuses
 * what it does not recognise instead of producing half a paper.
 */
export class NotAPaperError extends Error {}

/**
 * Read a whole paper.
 *
 * The shape is fixed — Sections I, II and III at 10, 15 and 15 marks — but
 * almost everything else moved between 2015 and 2025, so nothing here counts
 * questions or assumes how many a section holds.
 *
 * @throws NotAPaperError when it recognised nothing at all, which is neither the
 *   same as reading no questions nor as good as it sounds. This returned
 *   `{ questions: [], notes: [] }` until #64: every `notes.push` below sits
 *   inside a branch that first requires a question to have been recognised, so a
 *   document matching none of the rules could not say one word about why, and
 *   the panel above it then reported a successful run of nothing.
 */
export function extractPaper(pages: PageText[]): ExtractedPaper {
  const lines: Line[] = []
  /**
   * The left edge of each page's text, once its furniture has gone.
   *
   * Only the Section I rule uses it, and only to refuse a table row. It is
   * measured per page rather than fixed, because nothing promises every paper
   * uses NESA's margins, and after the furniture has gone because the papers'
   * own code sits further left than the text does (`2202 – 9 –` at x=48).
   */
  const leftOf = new Map<number, number>()
  let year: number | undefined
  for (const page of pages) {
    for (const found of toLines(page)) {
      const line = { ...found, text: withoutCredit(found.text) }
      // Taken on the way past, from a line that is furniture and is dropped a
      // moment later. It is the only place the paper says which year it is.
      const stamped = YEAR.exec(line.text)
      if (stamped && year === undefined) year = Number(stamped[1])

      if (!isDroppable(line.text)) {
        lines.push(line)
        if (line.text !== '') {
          leftOf.set(line.page, Math.min(leftOf.get(line.page) ?? Infinity, line.x))
        }
      } else if (line.marginMark !== undefined) {
        // The text is furniture but the marks are not. A mark centred against
        // wrapped text lands on a line of its own, which is an empty line and
        // so furniture by every other measure; dropping it loses the mark and
        // the part it belongs to then fails to add up.
        lines.push({ ...line, text: '' })
      }
    }
  }

  const notes: string[] = []
  const built: Building[] = []
  let section: SectionLabel | null = null
  let open: Building | null = null

  const close = () => {
    if (!open) return
    // A heading with nothing under it is the teaser printed at the foot of a
    // section cover page, which 2016 and 2018 both do. The real heading follows
    // on the next page. Dropping the empty one is what stops it being counted
    // as a question of its own.
    if (open.body.length === 0) {
      notes.push(
        `Question ${open.number} appeared as a heading with no text, which is how a section cover page announces the question overleaf. It was not counted twice.`,
      )
    } else {
      built.push(open)
    }
    open = null
  }

  for (const line of lines) {
    // A cover page has begun, so whatever was open ended on the page before.
    if (isBoundary(line.text)) {
      close()
      continue
    }

    const sectionAt = SECTION.exec(line.text)
    if (sectionAt) {
      close()
      section = sectionAt[1]!.toUpperCase() as SectionLabel
      continue
    }

    const continued = CONTINUED.exec(line.text)
    if (continued) {
      const number = Number(continued[1])
      // A continuation belongs to the question already open. Meeting one with
      // nothing open, or with a different question open, means the reading order
      // is not what it looks like, and that is worth saying rather than guessing.
      if (open && open.number === number) {
        open.pages.add(line.page)
        open.all.push(line)
        continue
      }
      const earlier = built.find((q) => q.number === number)
      if (earlier) {
        close()
        open = earlier
        built.splice(built.indexOf(earlier), 1)
        open.pages.add(line.page)
        open.all.push(line)
        continue
      }
      notes.push(
        `Page ${line.page} continues Question ${number}, but no Question ${number} had been read yet. Check that question.`,
      )
      continue
    }

    const heading = HEADING.exec(line.text)
    if (heading) {
      const number = Number(heading[1])
      const marks = Number(heading[2])
      // The cover-page teaser again: same question, no body yet. Replace rather
      // than close, so the pages of both are kept.
      if (open && open.number === number && open.body.length === 0) {
        open.marks = marks
        open.pages.add(line.page)
        open.all.push(line)
        continue
      }
      close()
      if (!section) {
        notes.push(`Question ${number} was found before any section heading. It was put in Section I.`)
      }
      open = {
        number,
        marks,
        section: section ?? 'I',
        pages: new Set([line.page]),
        body: [],
        all: [line],
        notes: [],
      }
      continue
    }

    // Section I questions are numbered bare — `1   Which term refers to…` — and
    // carry no marks, because every one of them is worth one.
    const objective = /^(\d{1,2})\s+(\S.*)$/.exec(line.text)
    if (section === 'I' && objective && atLeftEdge(line, leftOf)) {
      const number = Number(objective[1])
      // Only the next number in sequence starts a question. A wrapped line that
      // happens to begin with a digit is far more likely than Section I jumping.
      if (number === (open ? open.number + 1 : 1) && number <= 20) {
        close()
        open = {
          number,
          marks: 1,
          section: 'I',
          pages: new Set([line.page]),
          body: [{ ...line, text: objective[2]! }],
          all: [line],
          notes: [],
        }
        continue
      }
    }

    if (open) {
      open.pages.add(line.page)
      open.body.push(line)
      open.all.push(line)
    }
  }
  close()

  const questions = built.map(finish)

  // Numbering is the one global check worth making here: a gap means a question
  // was missed, and that is invisible on any single question.
  const numbers = questions.map((q) => q.number)
  for (let i = 1; i < numbers.length; i += 1) {
    const previous = numbers[i - 1]!
    const current = numbers[i]!
    if (current !== previous + 1) {
      notes.push(`Question ${previous} is followed by Question ${current}. A question may be missing.`)
    }
  }

  // Nothing read *and* nothing to say, which is not the same as no questions. A
  // single page carrying `Question 11 (continued)` yields no question and a note
  // naming the parent it never saw: the reader has recognised the document and
  // the note is its output. Refusing there would throw away the one useful thing
  // it found, so the condition is silence rather than emptiness.
  if (questions.length === 0 && notes.length === 0) {
    throw new NotAPaperError(
      'Klunk read no questions in this document. It reads a NSW HSC paper, which ' +
        'prints Section I, II and III headings and a heading like ' +
        '"Question 11 (5 marks)" above each question.',
    )
  }

  return year === undefined ? { questions, notes } : { questions, year, notes }
}

/**
 * Record where every question came from.
 *
 * Separate from extraction because the year is the only part of it the PDF
 * knows. Which examination this is and who owns it are things the teacher is
 * choosing when they pick the file, and a wrong guess about copyright is worse
 * than no guess: it is the field that decides where a paper containing the
 * question may go.
 */
export function stampSource(
  paper: ExtractedPaper,
  details: Omit<QuestionSource, 'questionNumber' | 'origin'> & { origin?: QuestionSource['origin'] },
): ExtractedPaper {
  const { origin = 'extracted', ...rest } = details
  return {
    ...paper,
    questions: paper.questions.map((question) => ({
      ...question,
      source: { ...rest, origin, questionNumber: String(question.number) },
    })),
  }
}

/* ------------------------------------------------------- one question's insides */

function finish(building: Building): ExtractedQuestion {
  const { number, marks, section } = building
  const notes = [...building.notes]

  const figures = new Set<string>()
  for (const line of building.body) {
    for (const match of line.text.matchAll(FIGURE)) figures.add(`Figure ${match[1]}`)
  }

  const question: ExtractedQuestion = {
    number,
    marks,
    text: '',
    questionType: SECTION_TYPE[section],
    section,
    figures: [...figures],
    pages: [...building.pages].sort((a, b) => a - b),
    spans: spansOf(building.all),
    notes,
  }

  if (section === 'I') {
    const { stem, options } = splitOptions(building.body)
    question.text = stem
    question.options = options
    if (options.length !== 4) {
      notes.push(`Read ${options.length} options rather than four. Check this question against the paper.`)
    }
    return question
  }

  const { stem, parts } = splitParts(building.body)
  question.text = stem
  if (parts.length > 0) {
    question.parts = parts
    const total = parts.reduce((sum, p) => sum + p.marks, 0)
    // The schema requires parts to sum to the question total, and a part whose
    // mark was never found sums low, so this catches both at once.
    if (total !== marks) {
      notes.push(
        `Parts add up to ${total} marks but the question is worth ${marks}. A mark in the margin was probably missed.`,
      )
    }
  }
  // Three of the eleven papers print a Section II question with no stem at all:
  // the heading is followed straight by `(a)`. That is the paper rather than a
  // misread, so it is not an error — but `bank.schema.json` requires question
  // text, so the question cannot be saved as it stands and the teacher is the
  // one who has to write it. Saying so here is what stops it being discovered by
  // a save that fails for no visible reason.
  if (stem === '') {
    notes.push(
      parts.length > 0
        ? 'This question has no text of its own and is only its parts, which is how some years print it. Give it a stem before saving, because a saved question must have text.'
        : 'No text was read for this question at all. Check it against the paper.',
    )
  }
  return question
}

/** How far down each page a question's own lines reach. */
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

function splitOptions(body: Line[]): { stem: string; options: ExtractedOption[] } {
  const stem: string[] = []
  const options: ExtractedOption[] = []
  for (const line of body) {
    const option = OPTION.exec(line.text)
    if (option) {
      options.push({ label: option[1]!, text: option[2]!.trim() })
      continue
    }
    // A wrapped option continues the one before it, not the stem.
    if (options.length > 0) {
      const last = options[options.length - 1]!
      last.text = `${last.text} ${line.text}`.trim()
      continue
    }
    stem.push(line.text)
  }
  return { stem: stem.join(' ').trim(), options }
}

function splitParts(body: Line[]): { stem: string; parts: ExtractedPart[] } {
  const stem: string[] = []
  const parts: ExtractedPart[] = []

  for (const line of body) {
    const start = PART.exec(line.text)
    if (start) {
      parts.push({ label: start[1]!, text: start[2]!.trim(), marks: line.marginMark ?? 0 })
      continue
    }
    if (parts.length > 0) {
      const last = parts[parts.length - 1]!
      if (line.text) last.text = `${last.text} ${line.text}`.trim()
      // The mark for a part can land on any of its lines, including one of its
      // own with nothing else on it, so it is taken wherever it turns up.
      if (line.marginMark !== undefined && last.marks === 0) last.marks = line.marginMark
      continue
    }
    if (line.text) stem.push(line.text)
  }

  return { stem: stem.join(' ').trim(), parts }
}
