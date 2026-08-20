/**
 * Prettier's job here is to stop layout being something anyone thinks about,
 * not to impose a house style on code that already had one.
 *
 * So none of the settings below is a preference. Each is what `src/` was
 * already written in, measured off the 41,556 lines of it before this file
 * existed (#103): six lines ended in a semicolon and every one of those six was
 * inside a prose comment, single quotes outran double better than three to one,
 * and everything else Prettier defaults to already matched — two-space indent,
 * trailing commas, parentheses on a single arrow parameter (911 of them, none
 * bare), double-quoted JSX attributes (1,028, none single). What already agreed
 * is left unstated rather than restated.
 *
 * `printWidth` is the one Prettier's default gets wrong for this code, and the
 * evidence is the size of the reformat at each setting:
 *
 *     80   93 files   +7,542 / -2,872      Prettier's default
 *     90   85 files   +3,788 / -1,739
 *    100   78 files   +1,656 / -1,479      this
 *    110   77 files   +1,291 / -2,166
 *
 * At 100 the insertions and the deletions nearly balance, which is what it
 * looks like when a formatter agrees with the hand that wrote the code: the
 * reformat is a tidy rather than a rewrite. At 80 it pushes some 4,700 lines
 * outward, breaking two-argument calls that read perfectly well at 89
 * characters. At 110 the deletions overtake the insertions, meaning it has
 * started joining lines that were wrapped on purpose.
 *
 * This does not touch the prose. Prettier never reflows a comment, so the
 * 80-column prose the repository is written in stays exactly where it is, and
 * `*.md` is ignored outright.
 */

/** @type {import('prettier').Config} */
export default {
  printWidth: 100,
  semi: false,
  singleQuote: true,
}
