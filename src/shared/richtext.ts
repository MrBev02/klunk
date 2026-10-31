/**
 * The little bit of markup a question's text is allowed to carry.
 *
 * Blank-line paragraphs, pipe tables, four inline marks and formulas. No lists, no
 * links, no headings — every one of those is a thing to get wrong on a printed
 * examination, and none of them is what was missing. What was missing is that a
 * table printed inside a question arrived as a run of loose words (#88), and
 * that a paper printing `Outline **TWO** benefits` came back with the emphasis
 * gone, which is not a transcription (#101).
 *
 * **Why markup in the text rather than a field on the schema.** A table is
 * printed *between* two paragraphs of the question — `The table shows … / table
 * / Compare the two groups …` — and `stimulus` renders in one fixed place, so a
 * field would mean splitting the stem and deciding where the split falls.
 *
 * **Why it is written by hand.** The app's dependencies are `preact`,
 * `pdfjs-dist` and KaTeX. A markdown library would be a fourth, would bring far more syntax
 * than this wants, and would need a sanitiser behind it. The precedent is
 * `CriterionPoints` in `render.tsx`, which turns newlines into bullets and is
 * the only other markup transform in the app.
 *
 * **Why underline is a tag when the other two are marks.** Markdown has no
 * underline, and the two conventions borrowed for one are both unsafe here.
 * `__x__` means *bold* everywhere else in the world, so a model writing it means
 * bold and Klunk would print an underline; and a fill-in-the-blank line,
 * `The process of ________ is used.`, parses as an underline of nothing. Both
 * print wrongly and quietly on an examination paper, which is the whole of what
 * this file exists to avoid. `<u>…</u>` collides with nothing. It is matched as
 * a token by the parser below — no HTML is ever interpreted.
 *
 * **An unmatched delimiter prints literally.** `5 * 3 = 15` is arithmetic and a
 * lone asterisk is an asterisk. A mark only opens where something closes it and
 * neither end sits against a space, which is markdown's own flanking rule and is
 * what keeps a bare `*` out of trouble.
 *
 * **A code span is the fourth mark, and nothing inside it is markup** (#135).
 * A computing paper names a variable, `gap`, in a fixed-width font, and a
 * formula such as `=B3*C3*D3` inside backticks keeps both of the asterisks the
 * italic rule would otherwise take (#121). It binds tighter than the other
 * three, as it does in markdown: an asterisk inside a span can neither open nor
 * close an italic around it. No escape works inside one, so a span cannot hold
 * a backtick, which no paper has needed.
 *
 * **A formula is `\(…\)` inside a sentence and `\[…\]` on its own line**
 * (#151), set by KaTeX in `richtextview.tsx`. Not `$…$`, because a mathematics
 * paper prints prices: `A jacket costs $80 and a hat costs $25` would set
 * `80 and a hat costs ` as a formula, and nothing on the proof would say why.
 * `\(` collides with nothing a paper prints, it is LaTeX's own inline
 * delimiter, and a model asked for LaTeX produces it untaught. A formula binds
 * tighter than everything else, a code span included: `\(a*b*c\)` keeps its
 * asterisks, and nothing inside one is an escape. It sits on one line, because
 * a line is a paragraph here. Written first in Mimir's copy of this file, which
 * reads what Klunk releases and so has to read it identically.
 */

const SEPARATOR = /^\|(?:\s*:?-{3,}:?\s*\|)+$/

export type Block =
  { kind: 'text'; text: string } | { kind: 'table'; head: string[]; rows: string[][] }

/** A stretch of one paragraph, with whatever emphasis is on it. */
export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  code?: boolean
  /** The run's text is TeX, set within the line or on its own. */
  math?: 'inline' | 'display'
}

/** The characters a backslash may protect, the pipe being `cellsOf`'s. */
const ESCAPABLE = '*<|`\\'

/** Is this line a row of a pipe table? */
function isRow(line: string): boolean {
  const text = line.trim()
  return text.startsWith('|') && text.length > 1
}

/**
 * The cells of one row, honouring an escaped pipe.
 *
 * A cell may genuinely hold a `|`, and the reader writes it as `\|`. Splitting
 * on the character alone would cut such a cell in half and make the row ragged.
 */
export function cellsOf(row: string): string[] {
  const inner = row.trim().replace(/^\|/, '')
  const out: string[] = []
  let cell = ''
  for (let at = 0; at < inner.length; at += 1) {
    if (inner[at] === '\\' && inner[at + 1] === '|') {
      cell += '|'
      at += 1
      continue
    }
    if (inner[at] === '|') {
      out.push(cell.trim())
      cell = ''
      continue
    }
    cell += inner[at]
  }
  out.push(cell.trim())
  // A row ends with a pipe, so the walk leaves an empty cell after it.
  if (out.length > 1 && out[out.length - 1] === '') out.pop()
  return out
}

/* --------------------------------------------------------- the inline marks */

/**
 * Where the code span opened by the backtick at `at` closes, or -1.
 *
 * An empty pair is not a span, so two backticks together print as themselves.
 */
function codeEnd(text: string, at: number): number {
  const close = text.indexOf('`', at + 1)
  return close > at + 1 ? close : -1
}

/**
 * The formula opened at `at`, if `\(` or `\[` opens one there.
 *
 * `end` is the index of the closer's backslash. An empty formula is not one,
 * for the reason an empty code span is not, and an opener with no closer
 * prints as itself.
 */
function mathAt(text: string, at: number): { end: number; display: boolean } | null {
  if (text[at] !== '\\') return null
  const open = text[at + 1]
  if (open !== '(' && open !== '[') return null
  const end = text.indexOf(open === '(' ? '\\)' : '\\]', at + 2)
  if (end <= at + 2 || text.slice(at + 2, end).trim() === '') return null
  return { end, display: open === '[' }
}

/**
 * Where the run opened at `from` closes, or -1.
 *
 * The character before a closer is never a space. That one rule is what stops
 * `2 * 3 and 4 * 5` from becoming an italic, and it is markdown's, not an
 * invention here.
 */
function closerOf(text: string, from: number, token: '*' | '**'): number {
  for (let at = from; at < text.length; at += 1) {
    // Before the escape, which would otherwise eat the `(` of `\(`.
    const math = mathAt(text, at)
    if (math) {
      at = math.end + 1
      continue
    }
    if (text[at] === '\\') {
      at += 1
      continue
    }
    if (text[at] === '`' && codeEnd(text, at) > -1) {
      at = codeEnd(text, at)
      continue
    }
    if (text[at] !== '*') continue
    const double = text[at + 1] === '*'
    if (token === '**') {
      if (!double) continue
    } else if (double) {
      // A `**` inside an italic is a bold run, not this run's closing mark.
      at += 1
      continue
    }
    if (at === from || /\s/.test(text[at - 1]!)) continue
    return at
  }
  return -1
}

/** Where the `<u>` opened before `from` is closed, or -1. */
function closingTag(text: string, from: number): number {
  for (let at = from; at < text.length; at += 1) {
    const math = mathAt(text, at)
    if (math) {
      at = math.end + 1
      continue
    }
    if (text[at] === '\\') {
      at += 1
      continue
    }
    if (text[at] === '`' && codeEnd(text, at) > -1) {
      at = codeEnd(text, at)
      continue
    }
    if (text.startsWith('</u>', at)) return at
  }
  return -1
}

/**
 * Walk one paragraph, carrying the marks that are already open.
 *
 * Recursive rather than a toggle, so `<u>**both**</u>` nests and so an opener
 * with nothing closing it can be left as the character it is: by the time a run
 * is entered its end is already known.
 */
function collect(text: string, marks: Omit<Run, 'text'>, out: Run[]): void {
  let plain = ''
  const flush = () => {
    if (plain) out.push({ text: plain, ...marks })
    plain = ''
  }

  for (let at = 0; at < text.length; at += 1) {
    const ch = text[at]!

    // Before the escape. `\\(` still escapes the backslash, because `mathAt`
    // only opens on a backslash followed by the bracket itself.
    const math = mathAt(text, at)
    if (math) {
      flush()
      out.push({
        text: text.slice(at + 2, math.end).trim(),
        ...marks,
        math: math.display ? 'display' : 'inline',
      })
      at = math.end + 1
      continue
    }

    if (ch === '\\' && ESCAPABLE.includes(text[at + 1] ?? '')) {
      plain += text[at + 1]
      at += 1
      continue
    }

    if (ch === '`') {
      const close = codeEnd(text, at)
      if (close > -1) {
        flush()
        out.push({ text: text.slice(at + 1, close), ...marks, code: true })
        at = close
        continue
      }
    }

    if (ch === '<' && !marks.underline && text.startsWith('<u>', at)) {
      const close = closingTag(text, at + 3)
      if (close > at + 3) {
        flush()
        collect(text.slice(at + 3, close), { ...marks, underline: true }, out)
        at = close + 3
        continue
      }
    }

    if (ch === '*') {
      const double = text[at + 1] === '*'
      const token = double ? '**' : '*'
      const open = at + token.length
      // An opener is never followed by a space either, so `** ` is two
      // asterisks and a footnote marker stays a footnote marker.
      if (!(double ? marks.bold : marks.italic) && !/\s/.test(text[open] ?? ' ')) {
        const close = closerOf(text, open, token)
        if (close > -1) {
          flush()
          collect(text.slice(open, close), { ...marks, [double ? 'bold' : 'italic']: true }, out)
          at = close + token.length - 1
          continue
        }
      }
    }

    plain += ch
  }
  flush()
}

/** Adjacent runs wearing the same marks are one run. */
function merged(runs: Run[]): Run[] {
  const out: Run[] = []
  for (const run of runs) {
    const last = out[out.length - 1]
    // Two formulas side by side are two formulas, never one.
    if (
      last &&
      !last.math &&
      !run.math &&
      !!last.bold === !!run.bold &&
      !!last.italic === !!run.italic &&
      !!last.underline === !!run.underline &&
      !!last.code === !!run.code
    ) {
      last.text += run.text
      continue
    }
    out.push({ ...run })
  }
  return out
}

/** One paragraph, or one cell, as the runs it is made of. */
export function runsOf(text: string): Run[] {
  const out: Run[] = []
  collect(text, {}, out)
  return merged(out)
}

/** The same text with the inline marks taken off it. */
export function stripInline(text: string): string {
  return runsOf(text)
    .map((run) => run.text)
    .join('')
}

/* -------------------------------------------------------------- the blocks */

/**
 * Break text into the paragraphs and tables it is made of.
 *
 * A table is a run of rows whose *second* line is the `| --- | --- |`
 * separator, which is what stops a sentence that happens to contain a pipe from
 * being read as one. Everything else is a paragraph, one per line, so a teacher
 * pressing Enter in the editor gets what they expect and a blank line costs
 * nothing.
 */
export function blocksOf(text: string): Block[] {
  const lines = text.split('\n')
  const out: Block[] = []
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at]!
    if (isRow(line) && lines[at + 1] !== undefined && SEPARATOR.test(lines[at + 1]!.trim())) {
      const head = cellsOf(line)
      const rows: string[][] = []
      let to = at + 2
      while (to < lines.length && isRow(lines[to]!)) {
        const cells = cellsOf(lines[to]!)
        // Short rows are padded rather than dropped, so a table stays a
        // rectangle whatever was typed into it.
        rows.push(head.map((_, i) => cells[i] ?? ''))
        to += 1
      }
      out.push({ kind: 'table', head, rows })
      at = to - 1
      continue
    }
    if (line.trim() !== '') out.push({ kind: 'text', text: line.trim() })
  }
  return out
}

/**
 * The same text with its markup taken out.
 *
 * For the three list views that clamp a stem to two lines, for the search
 * haystack, and for anywhere else a stem has to be a plain string. A table
 * becomes its cells in reading order, which is what it was before #88 and is
 * the right thing for a search: a teacher looking for `41.3` should find the
 * question that prints it.
 */
export function plainText(text: string): string {
  return blocksOf(text)
    .map((block) =>
      block.kind === 'text'
        ? stripInline(block.text)
        : [block.head, ...block.rows]
            .map((row) => row.filter(Boolean).map(stripInline).join(' '))
            .join(' '),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Does this text hold anything a one-line summary cannot show?
 *
 * The extractor and the prompt factory both put a stem in a two-line clamped
 * heading and then hide it from the detail below, on the ground that the heading
 * has already said it. That holds for prose and does not hold for a table: the
 * heading shows `Time Body temperature (°C) 4 am 41.3 …`, which is the run of
 * words the table was supposed to stop being.
 *
 * Inline marks are deliberately not counted. `plainText` takes them off, so the
 * summary still reads as the sentence it summarises — only the emphasis is
 * missing, where a flattened table is nonsense. Counting them would print the
 * whole stem twice for every question carrying one bold word.
 *
 * A formula is counted, though it is inline, because it is the table's case
 * and not the bold word's (#151): the summary shows `3x^2 \times 4x^5`, which
 * is the source of the thing rather than the thing.
 */
export function hasMarkup(text: string): boolean {
  return blocksOf(text).some((block) =>
    block.kind === 'table' ? true : runsOf(block.text).some((run) => run.math !== undefined),
  )
}
