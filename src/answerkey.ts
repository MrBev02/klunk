/**
 * Reading a markscheme that is nothing but a grid of answers.
 *
 * `src/guide.ts` reads NESA's marking guide, and every rule in it is NESA's: a
 * `Question Answer` heading has to have been seen before an answer row counts,
 * and everything else is criteria tables and a mapping grid carrying marks, a
 * plain-English topic and syllabus outcome codes. Handed the RevisionDojo
 * markscheme it returned `{ answerKey: {}, entries: [], mapping: [], notes: [] }`
 * and said nothing (#66).
 *
 * **An empty guide is worse than no guide**, which is what made this the more
 * serious half of #64. `adopt.ts` put the first option in `correctAnswer`, so a
 * thirty-question paper read *with* its markscheme came out identical to one
 * read without: every question answered A. The teacher had supplied the answers
 * and Klunk had thrown them away quietly. Since #105 an answer nobody read is
 * left absent and the guide prints that it was never recorded, so the two cases
 * no longer look alike, and reading this document properly still matters.
 *
 * The whole document is one page and three columns wide, which `toLines`
 * interleaves into a row at a time:
 *
 *     1. D 11. B 21. B
 *     2. B 12. B 22. D
 *
 * So the pairs are read from wherever they fall on a line rather than from a
 * column, which costs nothing and means a one-column or six-column markscheme
 * reads the same way.
 */

import type { PageText } from './extract'
import { toLines } from './extract'
import { type ExtractedGuide, NotAGuideError } from './guide'

/**
 * `1. D`, wherever it sits on the line.
 *
 * The letters are `A` to `D` because that is what a four-option paper prints and
 * what `objective.ts` requires of a question. Widening the range would be an
 * untested path added for a paper nobody has published; widening it *and* the
 * question reader is the change to make when one turns up.
 *
 * NESA's own key rows are `1 D` with no full stop (`KEY_ROW` in `guide.ts`), so
 * the two readers cannot claim each other's documents even before the order they
 * are tried in is taken into account.
 */
const PAIR = /(\d{1,3})\.\s*([A-Da-d])\b/g

/**
 * How many answers make a markscheme.
 *
 * With the contiguity rule below this is barely load-bearing, but a two-answer
 * document is not a markscheme whatever else is true of it.
 */
const MINIMUM = 5

/**
 * Read a markscheme that is a grid of question numbers and answer letters.
 *
 * @throws NotAGuideError when the document is not one.
 */
export function readAnswerKey(pages: PageText[]): ExtractedGuide {
  const answerKey: Record<number, string> = {}
  const notes: string[] = []
  const conflicts: number[] = []

  for (const page of pages) {
    for (const line of toLines(page)) {
      for (const [, number, letter] of line.text.matchAll(PAIR)) {
        const n = Number(number)
        const answer = letter!.toUpperCase()
        const held = answerKey[n]
        // Two different answers for one question means this is not a grid of
        // answers, or it has been misread. Either way it cannot be resolved
        // here, so it is counted and refused below rather than picked between.
        if (held !== undefined && held !== answer) conflicts.push(n)
        else answerKey[n] = answer
      }
    }
  }

  const numbers = Object.keys(answerKey)
    .map(Number)
    .sort((a, b) => a - b)

  if (numbers.length < MINIMUM || conflicts.length > 0) {
    throw new NotAGuideError(
      'Klunk read no answer key in this document. It reads a markscheme that lists ' +
        'each question number against its answer, such as "1. D".',
    )
  }

  // The contract, and the reason a stray `3. B` in somebody's prose cannot claim
  // a document: the numbers have to be every question from one to however many
  // there are, with none missing and none extra.
  const contiguous = numbers.every((n, i) => n === i + 1)
  if (!contiguous) {
    throw new NotAGuideError(
      `Klunk found ${numbers.length} answers in this document but they are not ` +
        'numbered one to ' +
        `${numbers.length}, so it is not a markscheme.`,
    )
  }

  return { answerKey, entries: [], mapping: [], notes }
}
