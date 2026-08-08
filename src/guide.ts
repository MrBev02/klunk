/**
 * Reading a NESA marking guide, and putting it back on the paper it marks.
 *
 * A guide is worth more than the answers. Every one from 2015 to 2025 ends with
 * a mapping grid giving, per question, the marks, a plain-English content
 * description and the **syllabus outcome codes**. Those outcomes are the tagging
 * a teacher would otherwise do fifteen times by hand, and they come from NESA
 * rather than from a guess.
 *
 * Like `extract.ts` this takes positioned text and never sees a PDF, for the
 * same reason: the rules are then testable without one.
 *
 * **The marks are centred against their criteria, not attached to a line.** For
 * a Section II criterion that wraps, the mark falls between the two halves. For
 * a Section III band it is worse: one band covers three or four bullets and its
 * mark sits at the centre of the whole group, so it lands inside whichever
 * bullet happens to be in the middle. Neither "the mark ends the line" nor "the
 * mark closes the block above it" survives that. What does hold is that a mark
 * is centred against the bullets it governs, so each bullet belongs to the mark
 * nearest its own centre — which is what this does.
 */

import {
  toLines,
  type ExtractedCriterion,
  type ExtractedPaper,
  type ExtractedQuestion,
  type Line,
  type PageText,
} from './extract'

/* ------------------------------------------------------------------ the output */

/**
 * What the guide says about one question, or one part of one.
 *
 * The guides mark parts separately — `Question 11 (a)` — where the paper prints
 * them under one heading, so an entry is keyed by both.
 */
export interface GuideEntry {
  number: number
  /** `a`, `b`, `c` where the guide marks a part on its own. */
  part?: string
  criteria: ExtractedCriterion[]
  /** Printed as `Sample answer:` in Section II and `Answers could include:` in III. */
  sampleAnswer?: string
}

/**
 * One row of the mapping grid at the back of the guide.
 *
 * Kept apart from the criteria because it covers more: the grid has a row for
 * every question in the paper including the ten objective ones, which have an
 * answer in the key and no criteria anywhere. So this is where the outcomes for
 * a multiple-choice question come from, and there is nowhere else to get them.
 */
export interface GuideMapping {
  number: number
  part?: string
  /** The guide's own statement of the marks. Blank in the 2016 grid's last row. */
  marks?: number
  /** Plain English, e.g. 'Evaluation methods'. Not a syllabus id, and not a guess at one. */
  content?: string
  /** Outcome codes, e.g. ['H3.2', 'H6.2']. */
  outcomes: string[]
}

export interface ExtractedGuide {
  /** Question number to the correct option label, from the answer key. */
  answerKey: Record<number, string>
  entries: GuideEntry[]
  mapping: GuideMapping[]
  year?: number
  notes: string[]
}

/* -------------------------------------------------------------- page furniture */

const FURNITURE: RegExp[] = [
  /^NSW Education Standards Authority$/i,
  // The running header, which names the awarding body. It was BOSTES in 2015 and
  // NESA from 2016, so neither name can be the thing that identifies it.
  /^(NESA|BOSTES|NSW Education Standards Authority)\s+\d{4} HSC\s/i,
  /^Page \d+ of \d+$/i,
  /^\d{4} HSC .+$/i,
  /^Marking Guidelines$/i,
  /^Criteria\s+Marks$/i,
  /^Question\s+Answer$/i,
  /^Question\s+Marks\s+Content\s+Syllabus outcomes$/i,
]

/** Digits and no letters: the page number, however it is decorated. */
function isFooter(text: string): boolean {
  return /\d/.test(text) && !/\p{L}/u.test(text)
}

function isFurniture(text: string): boolean {
  return text === '' || isFooter(text) || FURNITURE.some((re) => re.test(text))
}

/* ------------------------------------------------------------------ the shapes */

const YEAR = /\b(20\d{2}) HSC\b/
const SECTION = /^Section (I{1,3})$/
const ANSWER_KEY = /^Multiple-choice Answer Key$/i
const MAPPING_GRID = /^Mapping Grid$/i
/** `Question 11` or `Question 11 (a)`. The guides never go deeper than one level. */
const ENTRY = /^Question (\d{1,2})(?:\s*\(([a-z])\))?$/
/** A row of the answer key: the number, then the letter, with the gap between. */
const KEY_ROW = /^(\d{1,2})\s+([A-D])$/
const PROSE = /^(Sample answer|Answers? could include)s?:?$/i
const BULLET = /^[•▪]\s*/

/**
 * A row of the mapping grid.
 *
 * Anchored on the outcome codes rather than on column positions, because the
 * grid's headings are centred over left-aligned data and so do not say where a
 * column starts. `H3.2, H6.2` has a shape nothing else in the row has, and every
 * row ends with one.
 *
 * Two cells are optional, and both are optional because a real guide leaves them
 * out. Content lifts onto lines of its own where it wraps, leaving a row of just
 * the number, the marks and the outcomes. And the 2016 grid leaves the marks
 * blank for its Section III question, so requiring them dropped that row
 * entirely and the grid then read as a 25-mark paper.
 */
const GRID_ROW =
  /^(\d{1,2})(?:\s*\(([a-z])\))?\s+(?:(\d{1,2})\s+)?(.*?)\s*((?:[A-Z]+\d+\.\d+)(?:\s*,\s*[A-Z]+\d+\.\d+)*)$/

/* -------------------------------------------------------------------- the walk */

type Mode = 'head' | 'key' | 'criteria' | 'grid'

interface Building {
  number: number
  part?: string
  /** Criteria lines, before the marks are shared out between them. */
  lines: Line[]
  prose: string[]
  inProse: boolean
}

/** A mapping-grid row, kept with its y so wrapped content can find it again. */
interface GridRow {
  y: number
  number: number
  part?: string
  marks?: number
  content: string[]
  outcomes: string[]
}

/**
 * A guide reader's refusal to claim a document.
 *
 * The sibling of `NotAPaperError`, and it exists for the same reason: with more
 * than one reader, trying them in order is only safe if each refuses what it
 * does not recognise instead of returning an empty guide that silently marks
 * every question wrong.
 */
export class NotAGuideError extends Error {}

/**
 * Read a NESA marking guide.
 *
 * @throws NotAGuideError when it recognised nothing at all: no answer key, no
 *   criteria, no mapping grid and nothing to say. It returned all four empty
 *   until #66, and the cost was not an empty guide but a wrong one — `adopt.ts`
 *   has to put something in `correctAnswer`, so thirty questions came through
 *   answered A with the marking guide sitting right there unread.
 */
export function extractGuide(pages: PageText[]): ExtractedGuide {
  const answerKey: Record<number, string> = {}
  const built: Building[] = []
  const grid: GridRow[] = []
  /** Rows of the table currently being read, so one table cannot claim another's. */
  let table: GridRow[] = []
  const notes: string[] = []
  let year: number | undefined
  let mode: Mode = 'head'
  let open: Building | null = null

  /** Content that wrapped onto its own line, waiting for the row it belongs to. */
  let loose: { y: number; text: string }[] = []

  const settle = () => {
    // A wrapped content cell puts its row's number and marks on a line of their
    // own, vertically centred against the cell, exactly as the criteria marks
    // are. So a loose line belongs to the row nearest it, and the tables are
    // settled per section so that the last row of one cannot claim the first
    // line of the next.
    for (const line of loose) {
      let best: GridRow | null = null
      for (const row of table) {
        if (best === null || Math.abs(row.y - line.y) < Math.abs(best.y - line.y)) best = row
      }
      if (best) best.content.push(line.text)
    }
    loose = []
    table = []
  }

  const close = () => {
    if (open) built.push(open)
    open = null
  }

  for (const page of pages) {
    for (const line of toLines(page, { bands: true })) {
      const stamped = YEAR.exec(line.text)
      if (stamped && year === undefined) year = Number(stamped[1])

      if (isFurniture(line.text)) {
        // A mark centred against wrapped criteria lands on a line of its own,
        // which is an empty line and so furniture by every other measure.
        // Dropping it loses the mark, and in 2015 that lost four of the eight
        // criteria on one page without anything looking wrong.
        if (open && line.marginMark !== undefined) open.lines.push({ ...line, text: '' })
        continue
      }

      if (MAPPING_GRID.test(line.text)) {
        close()
        mode = 'grid'
        continue
      }

      if (mode === 'grid') {
        const row = GRID_ROW.exec(line.text)
        if (row) {
          const built: GridRow = {
            y: line.y,
            number: Number(row[1]),
            ...(row[2] ? { part: row[2] } : {}),
            ...(row[3] ? { marks: Number(row[3]) } : {}),
            content: row[4] ? [row[4]] : [],
            outcomes: row[5]!.split(',').map((code) => code.trim()),
          }
          grid.push(built)
          table.push(built)
        } else if (SECTION.test(line.text)) {
          settle()
        } else {
          loose.push({ y: line.y, text: line.text })
        }
        continue
      }

      if (ANSWER_KEY.test(line.text)) {
        close()
        mode = 'key'
        continue
      }

      const entry = ENTRY.exec(line.text)
      if (entry) {
        close()
        mode = 'criteria'
        open = {
          number: Number(entry[1]),
          ...(entry[2] ? { part: entry[2] } : {}),
          lines: [],
          prose: [],
          inProse: false,
        }
        continue
      }

      if (SECTION.test(line.text)) {
        close()
        if (mode === 'key') mode = 'head'
        continue
      }

      if (mode === 'key') {
        const row = KEY_ROW.exec(line.text)
        if (row) answerKey[Number(row[1])] = row[2]!
        continue
      }

      if (open) {
        if (PROSE.test(line.text)) {
          open.inProse = true
          continue
        }
        if (open.inProse) open.prose.push(line.text)
        else open.lines.push(line)
      }
    }
  }
  close()
  settle()

  const entries = built.map((building) => finish(building, notes))

  const mapping = grid.map((row): GuideMapping => {
    const content = row.content.join(' ').trim()
    return {
      number: row.number,
      ...(row.part ? { part: row.part } : {}),
      ...(row.marks === undefined ? {} : { marks: row.marks }),
      ...(content ? { content } : {}),
      outcomes: row.outcomes,
    }
  })

  const key = Object.keys(answerKey).length
  if (key > 0 && key !== 10) {
    notes.push(
      `The answer key holds ${key} ${key === 1 ? 'answer' : 'answers'} rather than ten. Check it against the guide.`,
    )
  }

  // Silence rather than emptiness, the rule `extractPaper` takes: a guide that
  // found nothing but had something to say has recognised the document, and the
  // note is its output.
  //
  // A year counts as recognition too, and a test caught that it had been left
  // out. It is read off `2021 HSC Design and Technology`, which nothing but a
  // NESA guide prints, and `applyGuide` uses it to say when the paper and the
  // guide are from different years — the one thing a guide holding nothing else
  // is still good for.
  if (
    key === 0 &&
    entries.length === 0 &&
    mapping.length === 0 &&
    notes.length === 0 &&
    year === undefined
  ) {
    throw new NotAGuideError(
      'Klunk read no answers and no criteria in this document. It reads a NSW HSC ' +
        'marking guide, which prints a "Question Answer" key for Section I and a ' +
        'criteria table for every other question.',
    )
  }

  return { answerKey, entries, mapping, ...(year === undefined ? {} : { year }), notes }
}

/**
 * Share the marks out between the bullets they were centred against.
 *
 * A bullet may wrap, and a line that is not a bullet continues the one before
 * it — which is how `OR` between two bullets ends up inside the criterion it
 * qualifies, where it belongs.
 */
function finish(building: Building, notes: string[]): GuideEntry {
  const where = building.part
    ? `Question ${building.number} (${building.part})`
    : `Question ${building.number}`

  interface Bullet {
    text: string
    top: number
    bottom: number
  }
  const bullets: Bullet[] = []
  const marks: { y: number; from: number; to: number }[] = []

  for (const line of building.lines) {
    if (line.marginMark !== undefined) {
      marks.push({ y: line.y, from: line.marginMark, to: line.marginTo ?? line.marginMark })
    }
    if (line.text === '') continue
    if (BULLET.test(line.text)) {
      bullets.push({ text: line.text.replace(BULLET, ''), top: line.y, bottom: line.y })
      continue
    }
    const last = bullets[bullets.length - 1]
    if (last) {
      last.text = `${last.text} ${line.text}`.trim()
      last.bottom = line.y
    }
  }

  const criteria: ExtractedCriterion[] = []
  if (bullets.length > 0 && marks.length === 0) {
    notes.push(`No marks were found beside the criteria for ${where}.`)
  } else if (bullets.length > 0) {
    // Each mark keeps the bullets that are nearer to it than to any other, which
    // is what "centred against its own cell" means once it is measured rather
    // than assumed. A band's three bullets all land on the one mark.
    const held = new Map<number, string[]>()
    for (const bullet of bullets) {
      const centre = (bullet.top + bullet.bottom) / 2
      let best = 0
      for (let i = 1; i < marks.length; i += 1) {
        if (Math.abs(marks[i]!.y - centre) < Math.abs(marks[best]!.y - centre)) best = i
      }
      const group = held.get(best)
      if (group) group.push(bullet.text)
      else held.set(best, [bullet.text])
    }
    for (let i = 0; i < marks.length; i += 1) {
      const group = held.get(i)
      const mark = marks[i]!
      if (!group) {
        notes.push(`${where} has a mark of ${mark.from} with no criterion beside it.`)
        continue
      }
      criteria.push({
        marks: mark.from,
        ...(mark.to === mark.from ? {} : { marksTo: mark.to }),
        description: group.join('\n'),
      })
    }
  }

  const sampleAnswer = joinProse(building.prose)
  return {
    number: building.number,
    ...(building.part ? { part: building.part } : {}),
    criteria,
    ...(sampleAnswer ? { sampleAnswer } : {}),
  }
}

/**
 * Put a sample answer back together without running its bullets into one another.
 *
 * The guides write these as lists as often as prose — a fifteen-mark answer can
 * be twenty bullets — and joining every line with a space produced one wall of
 * text with `•` scattered through it, which is unreadable and not what NESA
 * printed. A line that starts a bullet starts a new line here; anything else
 * continues the one before it, because a bullet wraps.
 */
function joinProse(lines: string[]): string {
  const out: string[] = []
  for (const line of lines) {
    if (BULLET.test(line) || out.length === 0) out.push(line.trim())
    else out[out.length - 1] = `${out[out.length - 1]} ${line.trim()}`.trim()
  }
  return out.join('\n').trim()
}

/* --------------------------------------------------------------- putting it back */

/**
 * Put a guide onto the paper it marks.
 *
 * Matched by number, and by part where the guide marks parts separately. Nothing
 * is discarded quietly: a guide entry with no question, or a question with no
 * guide entry, is reported on the thing it is missing from.
 */
export function applyGuide(paper: ExtractedPaper, guide: ExtractedGuide): ExtractedPaper {
  const notes = [...paper.notes]
  const seen = new Set<number>()

  if (paper.year !== undefined && guide.year !== undefined && paper.year !== guide.year) {
    notes.push(
      `The paper is from ${paper.year} and the marking guide from ${guide.year}. Check that these two files belong together.`,
    )
  }

  const questions = paper.questions.map((question): ExtractedQuestion => {
    const own = [...question.notes]
    seen.add(question.number)

    // The mapping grid covers every question in the paper, objective ones
    // included, which is the only place a multiple-choice question's outcomes
    // are written down.
    const rows = guide.mapping.filter((m) => m.number === question.number)
    const outcomes = [...new Set(rows.flatMap((m) => m.outcomes))]
    const content = [...new Set(rows.map((m) => m.content).filter(Boolean))].join('; ')

    // Two independent readings of what the question is worth. Where they
    // disagree, one of the two files was misread and only the teacher can say
    // which, so this is said rather than resolved.
    const priced = rows.filter((m) => m.marks !== undefined)
    const stated = priced.reduce((sum, m) => sum + (m.marks ?? 0), 0)
    if (priced.length > 0 && stated !== question.marks) {
      own.push(
        `The paper gives this question ${question.marks} marks and the marking guide gives it ${stated}.`,
      )
    }

    const tagged: ExtractedQuestion = {
      ...question,
      ...(outcomes.length ? { outcomes } : {}),
      ...(content ? { content } : {}),
      notes: own,
    }

    if (question.section === 'I') {
      const answer = guide.answerKey[question.number]
      if (answer === undefined) {
        own.push('The answer key does not give an answer for this question.')
        return tagged
      }
      if (!question.options?.some((o) => o.label === answer)) {
        own.push(
          `The answer key says ${answer}, which is not one of the options read for this question.`,
        )
        return tagged
      }
      return { ...tagged, answer }
    }

    const forQuestion = guide.entries.filter((e) => e.number === question.number)
    if (forQuestion.length === 0) {
      own.push('No criteria for this question were found in the marking guide.')
      return tagged
    }

    const whole = forQuestion.find((e) => e.part === undefined)
    const parts = question.parts?.map((part) => {
      const entry = forQuestion.find((e) => e.part === part.label)
      if (!entry) {
        own.push(`The marking guide has no criteria for part (${part.label}).`)
        return part
      }
      return {
        ...part,
        criteria: entry.criteria,
        ...(entry.sampleAnswer ? { sampleAnswer: entry.sampleAnswer } : {}),
      }
    })

    for (const entry of forQuestion) {
      if (entry.part && !question.parts?.some((p) => p.label === entry.part)) {
        own.push(
          `The marking guide marks a part (${entry.part}) that was not read on the paper. Check this question.`,
        )
      }
    }

    // A question with parts is marked part by part, so criteria on the question
    // itself belong only to one that has none.
    return {
      ...tagged,
      ...(parts ? { parts } : {}),
      ...(whole?.criteria.length ? { criteria: whole.criteria } : {}),
      ...(whole?.sampleAnswer ? { sampleAnswer: whole.sampleAnswer } : {}),
    }
  })

  for (const number of new Set([
    ...guide.entries.map((e) => e.number),
    ...guide.mapping.map((m) => m.number),
  ])) {
    if (!seen.has(number)) {
      notes.push(
        `The marking guide covers Question ${number}, but no such question was read from the paper.`,
      )
    }
  }

  return { ...paper, questions, notes: [...notes, ...guide.notes] }
}
