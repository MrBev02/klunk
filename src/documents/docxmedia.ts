/**
 * The pictures in a Word document's table rows, and where each one is kept.
 *
 * A `.docx` holds every picture whole, as its own file under `word/media/`, so
 * nothing has to be cut out of a page the way `pdfimage.ts` does (#207). What
 * says where a picture sits is the markup around it: a `<w:drawing>` inside a
 * table row, naming its file by a relationship id that
 * `word/_rels/document.xml.rels` resolves.
 *
 * Rows rather than paragraphs because the one school paper looked at sets each
 * question as one table row, its number in the first cell and its pictures in
 * the row. Which row is a question is the reader's business, not this file's.
 *
 * Only `<w:drawing>`. An equation from the old equation editor or MathType is a
 * `<w:object>`, an embedded object drawn from a Windows metafile that no
 * browser shows, and it is a formula and never a diagram.
 */

import { paraText, unescapeXml } from './ooxml'

const PARA_RE = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>|<w:p(?: [^>]*)?\/>/g
const DRAWING_RE = /<w:drawing>[\s\S]*?<\/w:drawing>/g
// `a:blip` is the picture itself. An SVG is carried as an extension inside it,
// with this `r:embed` naming the PNG Word keeps beside it for whatever cannot
// draw SVG, which is the one wanted here.
const BLIP_RE = /<a:blip\b[^>]*\br:embed="([^"]+)"/
const DESCR_RE = /<wp:docPr\b[^>]*\bdescr="([^"]*)"/
const RELATIONSHIP_RE = /<Relationship\b[^>]*>/g

/** One picture in a row, as the document names it. */
export interface RowPicture {
  /** The zip member holding it, such as `word/media/image8.png`. */
  member: string
  /** The alt text Word holds for it, which is empty more often than not. */
  alt: string
}

/** One table row: what each cell says, and the pictures anywhere in it. */
export interface PictureRow {
  /** Which table it is in, counting from 0, so a reader can tell where one ends. */
  table: number
  cells: string[]
  pictures: RowPicture[]
}

/** Every table row in the document, in order, whether or not it holds a picture. */
export function pictureRows(documentXml: string, relsXml: string): PictureRow[] {
  const targets = relationships(relsXml)
  const out: PictureRow[] = []
  for (const [table, tableXml] of outermost(documentXml, 'w:tbl').entries()) {
    for (const row of outermost(tableXml, 'w:tr')) {
      const cells = outermost(row, 'w:tc').map((cell) =>
        [...cell.matchAll(PARA_RE)]
          .map((p) => paraText(p[0]))
          .filter((t) => t !== '')
          .join(' '),
      )
      const pictures: RowPicture[] = []
      for (const drawing of row.matchAll(DRAWING_RE)) {
        const id = drawing[0].match(BLIP_RE)?.[1]
        const target = id === undefined ? undefined : targets.get(id)
        // A drawing with no blip is a shape or a chart, which has no picture
        // file to take.
        if (target === undefined) continue
        pictures.push({
          member: target,
          alt: unescapeXml(drawing[0].match(DESCR_RE)?.[1] ?? '').trim(),
        })
      }
      out.push({ table, cells, pictures })
    }
  }
  return out
}

/**
 * Every `tag` element not inside another, as its whole markup.
 *
 * Not a lazy regex, which stops at the first closing tag and so ends a table
 * at the end of any table nested in it. The Year 8 paper sets the
 * sub-questions of its first question as a table inside that question's row,
 * and a lazy match lost the eight questions after it (#207). `ooxml.ts` still
 * matches lazily (#236).
 *
 * Counting depth on the one tag is enough: a nested table's rows sit inside one
 * of the outer rows, and its cells inside one of the outer cells.
 */
function outermost(xml: string, tag: string): string[] {
  // The lookahead keeps `<w:tblPr>` from being a `<w:tbl>`, and `<w:trPr>` a `<w:tr>`.
  const re = new RegExp(`<${tag}(?=[\\s>])[^>]*>|</${tag}>`, 'g')
  const out: string[] = []
  let depth = 0
  let start = 0
  for (const m of xml.matchAll(re)) {
    if (m[0].startsWith('</')) {
      depth--
      if (depth === 0) out.push(xml.slice(start, m.index + m[0].length))
    } else {
      if (depth === 0) start = m.index
      depth++
    }
  }
  return out
}

/**
 * Relationship ids to zip members.
 *
 * A target is relative to `word/`, where the document is. A linked picture is
 * `TargetMode="External"`, a file on the author's own disk, and is not in the
 * zip to be taken.
 */
function relationships(relsXml: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of relsXml.matchAll(RELATIONSHIP_RE)) {
    const tag = m[0]
    if (/\bTargetMode="External"/.test(tag)) continue
    const id = tag.match(/\bId="([^"]+)"/)?.[1]
    const target = tag.match(/\bTarget="([^"]+)"/)?.[1]
    if (id === undefined || target === undefined) continue
    const path = unescapeXml(target)
    out.set(id, path.startsWith('/') ? path.slice(1) : `word/${path}`)
  }
  return out
}

/**
 * The type a browser draws a member as, or `undefined` for one it cannot.
 *
 * A Windows metafile (`.emf`, `.wmf`) is what Word keeps for a picture pasted
 * from older Office programs, and a TIFF is a scanner's. None of the three shows
 * in an `<img>`, so offering one would put a broken picture on the card.
 */
export function imageType(member: string): string | undefined {
  const ext = member.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    case 'webp':
      return 'image/webp'
    default:
      return undefined
  }
}
