/**
 * Reading the markup inside a Word document, without deciding what it means.
 *
 * `src/docx.ts` gets `word/document.xml` out of the zip; this turns that XML
 * into paragraphs and tables in document order, with the few properties a
 * syllabus reader needs in order to tell a heading from a sentence.
 *
 * It exists because there is more than one shape of NESA syllabus and they
 * disagree about everything except the markup:
 *
 * - the 2013 Stage 6 syllabuses put their content in tables (`src/syllabus.ts`)
 * - Drama Stage 6 (2009) and the NSW Curriculum Reform exports put it under
 *   headings, with `Outcomes` and `Content` naming the blocks (`src/headings.ts`)
 * - Visual Arts Stage 6 (2016) puts it in prose under headings that carry no
 *   style at all, only bold and a section number (`src/headings.ts`)
 *
 * Each of those is a different reading of the same few facts. So this reports
 * the facts — the text, what Word calls the paragraph, whether it is bold,
 * whether it is in a list — and lets each reader decide.
 */

/* ---------------------------------------------------------------- the markup */

// Field instructions and deleted runs carry text that is never visible in Word.
// Table-of-contents entries are where a naive extractor picks them up and emits
// a line of raw markup.
const DROP_RE = /<w:instrText[\s\S]*?<\/w:instrText>|<w:delText[\s\S]*?<\/w:delText>/g
const TAG_RE = /<[^>]+>/g
const PARA_RE = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>|<w:p(?: [^>]*)?\/>/g
const ROW_RE = /<w:tr(?: [^>]*)?>[\s\S]*?<\/w:tr>/g
const CELL_RE = /<w:tc(?: [^>]*)?>[\s\S]*?<\/w:tc>/g
const TABLE_RE = /<w:tbl(?: [^>]*)?>[\s\S]*?<\/w:tbl>/g

// A paragraph's visible text, in document order: the runs themselves, and the
// two things between runs that are a space on the page.
//
// Replacing those two in the XML before reading the runs looked like it worked
// and did nothing at all, because only <w:t> contents are collected: the space
// landed between elements and was thrown away with the rest of the markup. So
// "Design inspiration<tab>including:" arrived as "Design inspirationincluding:",
// and the syllabus is full of them.
//
// `<w:tab/>` only, never `<w:tab w:val="left" w:pos="999"/>`: the second is a
// tab stop in the paragraph's properties, not a tab in its text.
//
// `<m:t>` is a run inside an equation, and reading it is not optional. Word
// keeps mathematics in its own namespace, so a reader that collects `<w:t>`
// alone turns "Identify a conjugate of a+√b, and rationalise the denominators of
// expressions of the form …" into "Identify a conjugate of , and rationalise the
// denominators of expressions of the form and , where". That happens to 159 of
// the 359 content points in Mathematics Advanced 11–12, and the damage is
// invisible: the point still reads as a sentence and still counts as a point.
//
// What comes back is linear and lossy — a fraction arrives as its numerator
// followed by its denominator, an exponent as an ordinary digit — because OOXML
// puts the structure in the elements and this reads only the leaves. It is the
// difference between a content point that is incomplete and one that is wrong.
// Mathematics Advanced is the only document of the six that carries any.
const TEXT_RE =
  /<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<m:t(?: [^>]*)?>([\s\S]*?)<\/m:t>|<w:tab\/>|<w:br(?: [^>]*)?\/>/g

// The paragraph's own properties, which have to come off before the runs are
// inspected: the `<w:rPr>` inside `<w:pPr>` is the formatting of the paragraph
// mark, not of any text, and a bold paragraph mark on an ordinary sentence is
// commonplace.
const PPR_RE = /<w:pPr>[\s\S]*?<\/w:pPr>/
const RUN_RE = /<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>/g

// `<w:b/>`, `<w:b />` and `<w:b w:val="0"/>` all appear across the four
// documents, and the third means bold is *off*. Reading the element's presence
// alone marks half a document bold.
const BOLD_RE = /<w:b(?: w:val="([^"]*)")?\s*\/>/
const BOLD_OFF = new Set(['0', 'false', 'off'])

// Word concatenates a heading's automatic number onto its text, so the
// paragraph reads "8.3Practice in Artmaking". The depth of that number is the
// depth of the heading, and in Visual Arts it is a better signal than
// `w:outlineLvl`, which "8.5 The Frames" does not carry at all.
const SECTION_NUMBER_RE = /^\s*(\d+(?:\.\d+)*)\s*/

// `Heading1` is Word's own; `Head5`, `Head6` and `Head1b-titlepage` are Drama's,
// which names its heading styles itself. Both state a depth, and the depth is
// worth having even where it cannot be trusted to be consistent: Drama gives one
// topic `Head5` and the next two `Heading3`, so a reader that ranks headings by
// this number gets Drama wrong. What it is reliably good for is telling a
// heading from a sentence, and telling when a section has ended.
const HEADING_STYLE_RE = /^head(?:ing)?[ _-]?(\d)/i

/* ------------------------------------------------------------------- reading */

/** The visible text of one paragraph: runs joined, tabs and breaks flattened to spaces. */
export function paraText(xml: string): string {
  const cleaned = xml.replace(DROP_RE, '')
  let out = ''
  for (const m of cleaned.matchAll(TEXT_RE)) {
    const run = m[1] ?? m[2]
    out += run === undefined ? ' ' : run.replace(TAG_RE, '')
  }
  // A tab beside a typed space is one gap on the page, not two. Only runs of
  // ordinary spaces: a non-breaking space is published punctuation and stays
  // exactly where NESA put it.
  return unescapeXml(out).replace(/[ \t]{2,}/g, ' ').trim()
}

/**
 * XML entities, which is all a `.docx` uses.
 *
 * Not `DOMParser`: this runs in tests as well as in the browser, and the five
 * named entities plus numeric references are the whole of what OOXML escapes.
 */
export function unescapeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Last, or an escaped "&amp;lt;" would decode twice.
    .replace(/&amp;/g, '&')
}

/**
 * One entry per non-empty paragraph in a table cell.
 *
 * Paragraph boundaries are the content structure. The first paragraph of a
 * "Students learn about" cell is the topic heading and the rest are its content
 * points, so joining them into one string discards the only signal that says
 * which is which.
 */
export function cellLines(xml: string): string[] {
  return [...xml.matchAll(PARA_RE)].map((m) => paraText(m[0])).filter((t) => t !== '')
}

/** Whether every run that carries text in this paragraph is bold. */
function allRunsBold(xml: string): boolean {
  const body = xml.replace(PPR_RE, '')
  let sawText = false
  for (const run of body.matchAll(RUN_RE)) {
    if (paraText(run[0]) === '') continue
    sawText = true
    const bold = BOLD_RE.exec(run[0])
    if (!bold || (bold[1] !== undefined && BOLD_OFF.has(bold[1].toLowerCase()))) return false
  }
  return sawText
}

/** One paragraph, with the properties a reader needs to classify it. */
export interface Para {
  kind: 'para'
  text: string
  /**
   * What Word itself says the heading depth is: a style named `Heading3` or
   * `Head5` gives 3 and 5, and `w:outlineLvl` plus one is the fallback. Absent
   * when the document says nothing, which for Visual Arts is every heading.
   */
  headingLevel?: number
  /** The `w:pStyle`, so a reader can skip a table of contents by name. */
  style?: string
  /** Every text-bearing run is bold. In some documents this is the only heading signal. */
  bold: boolean
  /** In a numbered or bulleted list. */
  listed: boolean
}

/** One table, as rows of cells, each cell a list of its paragraphs. */
export interface Table {
  kind: 'table'
  rows: string[][][]
}

export type Block = Para | Table

/** Paragraphs outside tables, and tables as rows of cells, in document order. */
export function blocks(xml: string): Block[] {
  const spans: { at: number; block: Block }[] = []
  const covered: [number, number][] = []

  for (const m of xml.matchAll(TABLE_RE)) {
    const at = m.index
    covered.push([at, at + m[0].length])
    const rows: string[][][] = []
    for (const r of m[0].matchAll(ROW_RE)) {
      const cells = [...r[0].matchAll(CELL_RE)].map((c) => cellLines(c[0]))
      if (cells.length > 0) rows.push(cells)
    }
    if (rows.length > 0) spans.push({ at, block: { kind: 'table', rows } })
  }

  for (const m of xml.matchAll(PARA_RE)) {
    const at = m.index
    if (covered.some(([s, e]) => s <= at && at < e)) continue
    const text = paraText(m[0])
    if (!text) continue

    const style = /<w:pStyle w:val="([^"]+)"/.exec(m[0])?.[1]
    const styled = style ? HEADING_STYLE_RE.exec(style) : null
    const outlined = /<w:outlineLvl w:val="(\d+)"/.exec(m[0])
    const level = styled ? Number(styled[1]) : outlined ? Number(outlined[1]) + 1 : undefined

    const para: Para = {
      kind: 'para',
      text,
      bold: allRunsBold(m[0]),
      listed: /<w:numPr>/.test(m[0]),
    }
    if (level !== undefined) para.headingLevel = level
    if (style !== undefined) para.style = style
    spans.push({ at, block: para })
  }

  return spans.sort((a, b) => a.at - b.at).map(({ block }) => block)
}

/* --------------------------------------------------------------- the helpers */

/**
 * A heading's automatic number, and the text without it.
 *
 * Returns `null` when the paragraph does not open with one, which is how a
 * sub-heading is told from a section heading in a document that styles neither.
 */
export function sectionNumber(text: string): { number: string; depth: number; rest: string } | null {
  const m = SECTION_NUMBER_RE.exec(text)
  const number = m?.[1]
  // A content point may open with a figure — "12 expressive forms are…" — so a
  // bare number with no dot and no bold is not enough on its own. The caller
  // decides; this only reports what is there.
  if (!m || !number) return null
  return { number, depth: number.split('.').length, rest: text.slice(m[0].length).trim() }
}

/**
 * A heading as a label: one document space between words, no trailing
 * punctuation.
 *
 * The `.docx` files are full of non-breaking spaces. They are invisible on
 * screen, so a name carrying one looks identical to a name without and does not
 * match it.
 */
export function tidyHeading(text: string): string {
  return text.split(/\s+/).join(' ').trim().replace(/[:;.,]+$/, '').trim()
}
