/**
 * A code stimulus drawn as the numbered block it prints as (#135).
 *
 * Split from `code.ts` (#176), which keeps the cleaning and measuring that
 * `validate.ts` and `ingest.ts` need, so they import logic and not a screen.
 */

import { codeLines } from './code'

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
