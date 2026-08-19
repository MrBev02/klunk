/**
 * The little bit of markup a question's text is allowed to carry.
 *
 * Blank-line paragraphs, pipe tables, and three inline marks. No lists, no
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
 * **Why it is written by hand.** The app's dependencies are `preact` and
 * `pdfjs-dist`. A markdown library would be a third, would bring far more syntax
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
 */

import { Fragment } from 'preact'
import type { ComponentChildren } from 'preact'

const SEPARATOR = /^\|(?:\s*:?-{3,}:?\s*\|)+$/

export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }

/** A stretch of one paragraph, with whatever emphasis is on it. */
export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

/** The characters a backslash may protect, the pipe being `cellsOf`'s. */
const ESCAPABLE = '*<|\\'

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
 * Where the run opened at `from` closes, or -1.
 *
 * The character before a closer is never a space. That one rule is what stops
 * `2 * 3 and 4 * 5` from becoming an italic, and it is markdown's, not an
 * invention here.
 */
function closerOf(text: string, from: number, token: '*' | '**'): number {
  for (let at = from; at < text.length; at += 1) {
    if (text[at] === '\\') {
      at += 1
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
    if (text[at] === '\\') {
      at += 1
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

    if (ch === '\\' && ESCAPABLE.includes(text[at + 1] ?? '')) {
      plain += text[at + 1]
      at += 1
      continue
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
    if (
      last &&
      !!last.bold === !!run.bold &&
      !!last.italic === !!run.italic &&
      !!last.underline === !!run.underline
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
 */
export function hasMarkup(text: string): boolean {
  return blocksOf(text).some((block) => block.kind === 'table')
}

/* ------------------------------------------------------------- the rendering */

/**
 * One string of question prose, with its emphasis.
 *
 * Span-level, so unlike a table it goes anywhere a plain string prints today —
 * a part, an option, a matching cell, a criterion. That breadth is not
 * decoration: once a model is told the marks exist it will use them inside a
 * part, and a call site printing the raw string prints `**TWO**` on an
 * examination paper.
 */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {runsOf(text).map((run, at) => {
        let node: ComponentChildren = run.text
        if (run.italic) node = <em>{node}</em>
        if (run.bold) node = <strong>{node}</strong>
        if (run.underline) node = <u>{node}</u>
        return <Fragment key={at}>{node}</Fragment>
      })}
    </>
  )
}

/**
 * Render question text.
 *
 * The class goes on each paragraph rather than on a wrapper, because a table
 * cannot live inside a `<p>` and the call sites were all `<p class="…">`. Each
 * paragraph also carries `richp`, which is what the spacing between one block
 * and the next is keyed on: the classes it replaces all set `margin: 0`, having
 * only ever had one paragraph to lay out.
 */
export function RichText({ text, class: paragraph }: { text: string; class?: string }) {
  return (
    <>
      {blocksOf(text).map((block, at) =>
        block.kind === 'text' ? (
          <p key={at} class={paragraph ? `richp ${paragraph}` : 'richp'}>
            <Inline text={block.text} />
          </p>
        ) : (
          <table key={at} class="richtable">
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th key={i}>
                    <Inline text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ),
      )}
    </>
  )
}
