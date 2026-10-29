/**
 * Program code printed as a stimulus (#135).
 *
 * A computing paper prints an extract of a program to read, trace or debug, and
 * a question about it says "line 2". So the code keeps every space of its
 * indentation, prints in a fixed-width font, and numbers its lines unless told
 * not to. Before this, the only way to print one was a screenshot, which cannot
 * be edited in the bank or searched.
 *
 * **Why a stimulus and not a fenced block in the prose.** A reply from a model
 * arrives inside a ```json fence, and `extractJson` stops at the first triple
 * backtick it meets, so a fence inside a string would cut the reply in half.
 * `blocksOf` also trims every line, and line numbers need a field to switch
 * them off, which a fence has nowhere to carry.
 *
 * **Whitespace is the whole point, and three things trimmed it.** `text()` in
 * `validate.ts` and `asString` in `ingest.ts` both trim the ends of a string,
 * which takes the indentation off the first line of an extract that starts
 * inside a loop. Both route code through `cleanCode` instead.
 */

/**
 * How many characters of code fit across the narrowest printed column.
 *
 * Measured in Chrome at 9.5pt Consolas: 91 characters fit a question set out
 * under a heading, which has the full 680 px column. A question set out beside
 * its number, as a multiple-choice one is, has 558 px, which is about 73. One
 * more goes to the number column once a program reaches line 10.
 */
export const CODE_LINE_LIMIT = 72

/**
 * Code as it should be stored: indentation kept, and nothing else of the edges.
 *
 * Windows line endings become `\n`, trailing spaces go from every line, and
 * blank lines go from the start and the end. The leading spaces of a line are
 * never touched, the first line's included. `undefined` where nothing is left.
 */
export function cleanCode(text: string | undefined): string | undefined {
  if (typeof text !== 'string') return undefined
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
  while (lines.length > 0 && lines[0] === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.length > 0 ? lines.join('\n') : undefined
}

/** The lines a block prints, after the same cleaning the bank gets. */
export function codeLines(text: string | undefined): string[] {
  return cleanCode(text)?.split('\n') ?? []
}

/** How wide a line prints, a tab counting to the next multiple of four. */
export function printedWidth(line: string): number {
  let width = 0
  for (const ch of line) width = ch === '\t' ? width + 4 - (width % 4) : width + 1
  return width
}

/**
 * One block of code, numbered unless `lineNumbers` is `false`.
 *
 * A table rather than a grid, so every number in the column is as wide as the
 * widest one and a long extract breaks across a page between rows. The number
 * is drawn from `data-n` by CSS, so copying the code off the screen does not
 * copy the numbers with it. A blank line holds a no-break space, without which
 * its row collapses to nothing when the numbers are off.
 */
export function CodeBlock({
  text,
  lineNumbers,
  class: name,
}: {
  text: string | undefined
  lineNumbers?: boolean | undefined
  class?: string
}) {
  const numbered = lineNumbers !== false
  return (
    <table class={name ? `codeblock ${name}` : 'codeblock'}>
      <tbody>
        {codeLines(text).map((line, at) => (
          <tr key={at}>
            {numbered && <td class="codeblock__n" data-n={at + 1} />}
            <td class="codeblock__line">{line === '' ? ' ' : line}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
