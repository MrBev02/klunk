/**
 * Cutting the pictures out of a past paper.
 *
 * A NESA question is often built around a photograph, a product sketch or a
 * chart, and reading only the text leaves a question that asks about something
 * nobody can see. `extract.ts` finds *where* a picture is, from the gaps in the
 * text; this renders the page and cuts that rectangle out.
 *
 * **Rendering, not lifting the image object out.** The papers mix photographs,
 * which are image XObjects, with vector diagrams and charts, which are not
 * images at all and have nothing to lift. Rendering handles both with one code
 * path, at the cost of rasterising a drawing that was vector. For a printed
 * A4 exam that cost is nothing, and the alternative would need to understand
 * tiling and masks to do the easy half of the job.
 *
 * **It has to stay inside the CSP.** Klunk sets `connect-src 'none'`, and
 * rendering is a different code path from reading text — it draws glyphs, so it
 * is the one that might reach for standard font data. Checked before this was
 * built rather than after: every page of all eleven papers renders with no
 * `securitypolicyviolation` and nothing fetched.
 */

import type { PageText } from './extract'
import type { PdfDocumentLike } from './pdftext'

/**
 * A rectangle on a page, in PDF points, with y measured from the bottom as the
 * page's own coordinates are.
 */
export interface Region {
  page: number
  x: number
  /** The bottom edge. */
  y: number
  width: number
  height: number
}

/**
 * How much bigger than the page's own points to render.
 *
 * A4 is 595 points wide and prints at 210 mm, so 72 points to the inch. Three
 * times that is 216 dpi: past what any staffroom photocopier resolves, short of
 * a file size that makes a bank annoying to sync.
 */
const SCALE = 3

/** A cut-out picture, ready to be shown to a teacher and then written to disk. */
export interface Cutout {
  region: Region
  blob: Blob
  /** For showing it in the review grid. The caller revokes it. */
  url: string
}

/**
 * Render the pages that hold pictures, and cut each region out.
 *
 * Takes the open document rather than the bytes, and that is not a convenience:
 * `getDocument` transfers the file to the worker port and detaches the
 * ArrayBuffer, so a second `getDocument` on the same array throws
 * `DataCloneError`. Reading the text and cutting the pictures share one
 * document, which also means the paper is only parsed once.
 *
 * Each page is rendered once however many regions it holds, because rendering is
 * the expensive part and a page can carry four figures.
 */
export async function cutOut(doc: PdfDocumentLike, regions: Region[]): Promise<Cutout[]> {
  if (regions.length === 0) return []

  const out: Cutout[] = []

  const byPage = new Map<number, Region[]>()
  for (const region of regions) {
    const held = byPage.get(region.page)
    if (held) held.push(region)
    else byPage.set(region.page, [region])
  }

  for (const [number, held] of [...byPage].sort((a, b) => a[0] - b[0])) {
    const page = await doc.getPage(number)
    const viewport = page.getViewport({ scale: SCALE })

    const sheet = document.createElement('canvas')
    sheet.width = Math.ceil(viewport.width)
    sheet.height = Math.ceil(viewport.height)
    const context = sheet.getContext('2d')
    if (!context) throw new Error('This browser would not give Klunk a canvas to draw the page on.')
    // White, because a PDF page assumes paper and a canvas starts transparent.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, sheet.width, sheet.height)

    // `intent: 'print'` is not decoration. pdf.js schedules the continuation of
    // a render through `requestAnimationFrame` unless the intent is print, and a
    // background tab never fires one — so a display render in a tab the teacher
    // has switched away from hangs for ever, with no error and no CSP violation.
    // Print is also what these are for: the cut-out ends up on a printed paper.
    await page.render({ canvas: sheet, viewport, intent: 'print' }).promise

    for (const region of held) {
      const cut = document.createElement('canvas')
      cut.width = Math.max(1, Math.round(region.width * SCALE))
      cut.height = Math.max(1, Math.round(region.height * SCALE))
      const into = cut.getContext('2d')
      if (!into) continue
      into.fillStyle = '#ffffff'
      into.fillRect(0, 0, cut.width, cut.height)
      // PDF points run up from the bottom of the page and canvas pixels run down
      // from the top, so the top of the region is the page height less its top edge.
      const top = (viewport.height / SCALE - (region.y + region.height)) * SCALE
      into.drawImage(sheet, region.x * SCALE, top, cut.width, cut.height, 0, 0, cut.width, cut.height)

      // A gap in the text is not always a picture. The foot of a page below the
      // last ruled line is a gap, and so is the space above a section heading,
      // and cropping those produces a blank rectangle. Offering one is worse
      // than useless: the crops are kept by default, so a teacher skimming
      // fifteen questions saves whitespace into the bank unless they notice.
      // Cheaper to ask the pixels than to ask the teacher.
      if (isBlank(into, cut.width, cut.height)) continue

      const blob = await toBlob(cut)
      if (blob) out.push({ region, blob, url: URL.createObjectURL(blob) })
    }
  }

  return out
}

/**
 * Is there anything on this crop?
 *
 * Measured rather than guessed: across the corpus a real picture covers a few
 * per cent of its rectangle at the very least, and an empty strip of page covers
 * none of it. A tenth of a per cent sits far below anything drawn and far above
 * the stray speck a rendering artefact leaves.
 *
 * Every fourth pixel, because this runs on the main thread and a full A4 crop at
 * 216 dpi is four million of them; a picture that only shows up in one pixel in
 * four is not a picture.
 */
function isBlank(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = context.getImageData(0, 0, width, height)
  let ink = 0
  for (let i = 0; i < data.length; i += 16) {
    if ((data[i] ?? 255) < 250 || (data[i + 1] ?? 255) < 250 || (data[i + 2] ?? 255) < 250) ink += 1
  }
  return ink / (data.length / 16) < 0.001
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

/**
 * Where the pictures are, from the holes in the text.
 *
 * A picture is a band of a page that no text piece touches, tall enough not to
 * be the space between two paragraphs. Worked out from the pieces rather than
 * from the lines the extractor keeps, because the extractor throws away the
 * ruled answer lines and the page furniture — and a question with six ruled
 * lines under it would then look like a question with a picture under it.
 *
 * The band is the full width of the text on that page rather than of the
 * picture, since nothing here knows where a picture starts sideways. A crop
 * with white either side of it is a much cheaper mistake than one with the
 * edge of the diagram missing, and the teacher sees it before it is kept.
 */
export function picturesFor(
  question: { spans: { page: number; top: number; bottom: number }[] },
  pages: PageText[],
  minHeight = 40,
): Region[] {
  const out: Region[] = []
  for (const span of question.spans) {
    const page = pages.find((p) => p.number === span.page)
    if (!page) continue
    for (const region of findPictures(page, minHeight)) {
      // The band has to sit inside the question's own text on that page, or it
      // belongs to whatever else shares the page. The midpoint is enough: a band
      // is bounded by the lines above and below it, so if its middle is between
      // this question's first and last line, both of those lines are its.
      const middle = region.y + region.height / 2
      if (middle <= span.top && middle >= span.bottom) out.push(region)
    }
  }
  return out
}

export function findPictures(page: PageText, minHeight = 40): Region[] {
  const rows = [...new Set(page.pieces.filter((p) => p.str.trim()).map((p) => Math.round(p.y)))].sort(
    (a, b) => b - a,
  )
  if (rows.length < 2) return []

  const left = Math.min(...page.pieces.map((p) => p.x))
  const right = Math.max(...page.pieces.map((p) => p.x + p.width))

  const out: Region[] = []
  for (let i = 1; i < rows.length; i += 1) {
    const above = rows[i - 1]!
    const below = rows[i]!
    const gap = above - below
    if (gap < minHeight) continue
    // Just inside the two lines of text, so neither is clipped into the picture.
    // The two edges are not symmetrical: a line of text sits *above* its
    // baseline by most of its height and below it only by its descenders, so the
    // bottom of the band has to clear far more than the top. Six points at the
    // bottom left a sliver of the next line in every crop.
    out.push({
      page: page.number,
      x: Math.max(0, left - 4),
      y: below + 13,
      width: Math.min(page.width, right - left + 8),
      height: gap - 17,
    })
  }
  return out
}
