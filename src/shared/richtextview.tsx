/**
 * Question prose on screen and on the printed paper: the two components that
 * draw what `richtext.ts` reads.
 *
 * Split from `richtext.ts` (#176) so the parsing, which `types.ts` and the
 * checks need, is plain logic a `.ts` file can import, and only the screens
 * import this. Named apart from it, as `coversheet.tsx` is from `cover.ts`,
 * so `import './richtext'` cannot mean either one.
 */

import katex from 'katex'
import { Fragment } from 'preact'
import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useRef } from 'preact/hooks'
import { blocksOf, runsOf } from './richtext'

/* ------------------------------------------------------------- the rendering */

/**
 * One formula, set by KaTeX (#151).
 *
 * `throwOnError: false` prints a formula KaTeX cannot read as its source in
 * red, rather than leaving a hole: a teacher can see `\frac{3}{8` on the proof
 * and what to fix. `trust` stays at its default of false, so no `\href` or
 * `\includegraphics` in a pasted reply can reach the page.
 *
 * A layout effect rather than a `useEffect`, so the formula is set before the
 * browser paints and before a print is taken, and in a hidden tab, where a
 * plain effect waits on a throttled timer. The span has no children of its own
 * for Preact to diff against what KaTeX puts in it.
 */
function Formula({ tex, display }: { tex: string; display: boolean }) {
  const at = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (at.current) katex.render(tex, at.current, { displayMode: display, throwOnError: false })
  }, [tex, display])
  return <span class="formula" ref={at} />
}

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
        if (run.math) node = <Formula tex={run.text} display={run.math === 'display'} />
        if (run.code) node = <code>{node}</code>
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
