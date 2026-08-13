/**
 * The little bit of markup a question's text is allowed to carry.
 *
 * Blank-line paragraphs and pipe tables. Nothing else — no bold, no lists, no
 * links — because every one of those is a thing to get wrong on a printed
 * examination and none of them is what was missing. What was missing is that a
 * table printed inside a question arrived as a run of loose words (#88).
 *
 * **Why markup in the text rather than a field on the schema.** A table is
 * printed *between* two paragraphs of the question — `The table shows … / table
 * / Compare the two groups …` — and `stimulus` renders in one fixed place, so a
 * field would mean splitting the stem and deciding where the split falls. It is
 * also what an AI draft already comes back as, so `ingest.ts` needs nothing.
 *
 * **Why it is written by hand.** The app's dependencies are `preact` and
 * `pdfjs-dist`. A markdown library would be a third, would bring far more syntax
 * than this wants, and would need a sanitiser behind it. The precedent is
 * `CriterionPoints` in `render.tsx`, which turns newlines into bullets and is
 * the only other markup transform in the app.
 */

const SEPARATOR = /^\|(?:\s*:?-{3,}:?\s*\|)+$/

export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }

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
        ? block.text
        : [block.head, ...block.rows].map((row) => row.filter(Boolean).join(' ')).join(' '),
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
 */
export function hasMarkup(text: string): boolean {
  return blocksOf(text).some((block) => block.kind === 'table')
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
            {block.text}
          </p>
        ) : (
          <table key={at} class="richtable">
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th key={i}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
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
