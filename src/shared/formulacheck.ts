/**
 * Whether KaTeX can set a formula, and why not in a teacher's words (#210).
 *
 * `richtextview.tsx` sets a formula with `throwOnError: false`, which prints
 * one KaTeX cannot read as its source in red and throws the reason away. This
 * asks the same question with `throwOnError: true` and keeps the reason, for
 * the preview under the box being typed in and for the checker, so a red
 * formula cannot reach a printed paper unnoticed.
 *
 * A `.ts` rather than beside the renderer, because `validate.ts` needs it and
 * a `.ts` never imports a `.tsx` (#176).
 */

import katex from 'katex'
import { blocksOf, runsOf } from './richtext'

/**
 * KaTeX's reasons a teacher meets, in the order they are tried, each turned
 * into what to do. Matched on `rawMessage`, which is the reason without the
 * `KaTeX parse error:` prefix and the excerpt of the source after it.
 *
 * Collected by feeding KaTeX 0.19 the typos a teacher makes, not from its
 * source, so a reason missing here falls through to KaTeX's own words.
 */
const REASONS: [RegExp, (m: RegExpMatchArray, tex: string) => string][] = [
  [
    /^Undefined control sequence: (\\\S+)/,
    (m) => `Check the spelling of ${m[1]}. It is not a command that can be drawn.`,
  ],
  [
    // Both "Expected '}', got 'EOF'" and KaTeX's "Unexpected end of input in a
    // macro argument, expected '}'", which `\frac{1}` also gives with its
    // braces balanced. Counting them tells the two apart.
    /expected '\}'/i,
    (_m, tex) =>
      opens(tex, '{') > opens(tex, '}')
        ? 'Add a } to close each {.'
        : 'Add the missing part in braces. \\frac needs two, as in \\frac{1}{2}.',
  ],
  [/expected '\]'/i, () => 'Add a ] to close the [.'],
  [/^Expected 'EOF', got '\}'/, () => 'Remove the extra }, or add the { it closes.'],
  [/^Expected 'EOF', got '&'/, () => 'Use & only inside a matrix or cases.'],
  [
    /^Expected 'EOF', got '\\right'/,
    () => 'Add a \\left before the \\right, or remove the \\right.',
  ],
  [/^Expected '\\right', got 'EOF'/, () => 'Add a \\right to close the \\left.'],
  [/^Expected group after '\^'/, () => 'Put the power after the ^, as in x^2 or x^{10}.'],
  [/^Expected group after '_'/, () => 'Put something after the _, as in x_1 or x_{10}.'],
  [
    /^Expected group as argument to '(\\[^']+)'/,
    (m) => `Add what ${m[1]} applies to in braces, as in ${m[1]}{x}.`,
  ],
  [
    /^Double superscript/,
    () => 'Put the whole power in braces, as in x^{2^3}. One letter can take only one ^.',
  ],
  [
    /^Double subscript/,
    () => 'Put the whole subscript in braces, as in x_{12}. One letter can take only one _.',
  ],
  [
    /^Mismatch: (\\begin\{[^}]*\}) matched by (\\end\{[^}]*\})/,
    (m) => `Make the names match: ${m[1]} is closed by ${m[2]}.`,
  ],
  [/^Expected & or \\\\ or \\cr or \\end/, () => 'Add an \\end to close the \\begin.'],
  [
    /^Can't use function '(\\[^']+)' in math mode/,
    (m) => `Remove the ${m[1]}. It cannot go inside a formula.`,
  ],
]

/** How many times `brace` appears unescaped. */
function opens(tex: string, brace: '{' | '}'): number {
  let count = 0
  for (let at = 0; at < tex.length; at += 1) {
    if (tex[at] === '\\') at += 1
    else if (tex[at] === brace) count += 1
  }
  return count
}

const seen = new Map<string, string | null>()

/**
 * What is wrong with a formula, as an instruction, or null when it sets.
 *
 * Remembered by its source, because `isUnfinished` runs every check on every
 * question each time the library is filtered.
 */
export function formulaFault(tex: string, display: boolean): string | null {
  const key = `${display ? '[' : '('}${tex}`
  const known = seen.get(key)
  if (known !== undefined) return known
  let fault: string | null = null
  try {
    // The renderer's options, so a formula that sets here sets on the paper.
    // `strict` only ever warns in the console, and is quietened here because
    // this runs on every formula in the bank.
    katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'ignore' })
  } catch (e) {
    if (!(e instanceof katex.ParseError)) throw e
    const raw = (e as { rawMessage?: string }).rawMessage ?? e.message
    const reason = REASONS.find(([pattern]) => pattern.test(raw))
    fault = reason ? reason[1](raw.match(reason[0])!, tex) : `KaTeX says: ${raw}.`
  }
  seen.set(key, fault)
  return fault
}

/** One formula in some prose that will print as red source. */
export interface BadFormula {
  tex: string
  display: boolean
  fault: string
}

/** Every formula in a string of question prose that KaTeX cannot set. */
export function badFormulas(text: string): BadFormula[] {
  if (!text.includes('\\(') && !text.includes('\\[')) return []
  const out: BadFormula[] = []
  for (const block of blocksOf(text)) {
    const cells = block.kind === 'text' ? [block.text] : [...block.head, ...block.rows.flat()]
    for (const cell of cells) {
      for (const run of runsOf(cell)) {
        if (!run.math) continue
        const display = run.math === 'display'
        const fault = formulaFault(run.text, display)
        if (fault) out.push({ tex: run.text, display, fault })
      }
    }
  }
  return out
}
