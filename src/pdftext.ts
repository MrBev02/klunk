/**
 * The only place pdf.js is mentioned.
 *
 * Everything that decides what a question *is* lives in `src/extract.ts` and
 * takes positioned text, so it can be tested without a PDF. This module does the
 * one thing that genuinely needs the library: turn bytes into pieces with an x
 * and a y.
 *
 * **It runs with no worker, and that is deliberate.** The single-file build is
 * one HTML file opened over `file://`, where there is no worker script to fetch
 * and Chrome blocks workers regardless. pdf.js checks
 * `globalThis.pdfjsWorker?.WorkerMessageHandler` before it tries `new Worker` or
 * a dynamic import, so registering the worker module here means neither ever
 * happens and nothing is left to load. Measured on the real corpus: eleven
 * papers in 682 ms on the main thread, and 112 ms for a twelve-page paper
 * straight off disk over `file://`. A worker would buy a second code path and
 * no time worth having.
 *
 * **Nothing is fetched.** `cMapUrl`, `standardFontDataUrl`, `wasmUrl` and
 * `iccUrl` are all left unset. Klunk's CSP sets `connect-src 'none'`, so a
 * request would fail rather than quietly succeed, and the whole 2015–2025 corpus
 * extracts without needing one — confirmed by listening on
 * `securitypolicyviolation` while reading every paper.
 *
 * **Nothing is evaluated either.** Earlier pdf.js versions took an
 * `isEvalSupported` option because they built glyph accessors with `new
 * Function`, which Klunk's CSP forbids. Version 6 removed both the option and the
 * practice — neither build contains a single `eval` or `new Function` — so there
 * is nothing to switch off and no `unsafe-eval` to grant.
 */

import type { PageText, TextPiece } from './extract'

/**
 * The shape of a pdf.js document, narrowed to what Klunk actually uses.
 *
 * Exported because the document has to be *shared*: `getDocument` transfers the
 * bytes to the worker port and detaches the ArrayBuffer, so opening the same
 * `Uint8Array` a second time throws `DataCloneError`. Reading the text and
 * cutting the pictures out therefore work from one open document rather than
 * each opening their own.
 */
export interface PdfDocumentLike {
  numPages: number
  getPage(n: number): Promise<PdfPageLike>
}

export interface PdfPageLike {
  /** [x0, y0, x1, y1] in points. */
  view: number[]
  getTextContent(): Promise<{ items: unknown[] }>
  getViewport(options: { scale: number }): { width: number; height: number }
  render(options: { canvas: HTMLCanvasElement; viewport: unknown; intent?: string }): {
    promise: Promise<void>
  }
}

/**
 * Is this run set sideways?
 *
 * A text matrix is `[a, b, c, d, e, f]`, and horizontal text has b and c at
 * zero. Anything else has been turned, and on a NESA paper what gets turned is
 * furniture: "Do NOT write in this area." runs up the margin of 59 pages of the
 * corpus, one word per baseline. Those baselines collide with the ruled answer
 * lines beside them, so the words were being read into the middle of the
 * question — which is how a question came out as "…in this…area. Of…".
 *
 * The whole corpus holds exactly three distinct rotated strings: that notice,
 * and two axis labels inside figures. The labels are a real loss, but they
 * belong to a picture that cannot be lifted out of the PDF either, and every
 * question that refers to a figure already says so. A stray axis label dropped
 * into the middle of a stem would be the worse outcome.
 */
function isRotated(transform: number[]): boolean {
  return Math.abs(transform[1] ?? 0) > 0.01 || Math.abs(transform[2] ?? 0) > 0.01
}

/**
 * Convert an open pdf.js document to positioned text.
 *
 * Kept separate from loading so it can be driven from Node against the real
 * corpus, which is how the extractor is checked against papers that cannot live
 * in this repo. The document is passed in rather than the bytes because Node and
 * the browser need different pdf.js builds, and the conversion is the part worth
 * testing either way.
 */
export async function pagesFromDocument(doc: PdfDocumentLike): Promise<PageText[]> {
  const pages: PageText[] = []
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n)
    const width = (page.view[2] ?? 595) - (page.view[0] ?? 0)
    const content = await page.getTextContent()
    const pieces: TextPiece[] = []
    for (const raw of content.items) {
      const item = raw as { str?: string; width?: number; transform?: number[] }
      // Marked content and other non-text items have no `str` at all.
      if (typeof item.str !== 'string' || item.str === '' || !item.transform) continue
      if (isRotated(item.transform)) continue
      pieces.push({
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
        width: item.width ?? 0,
        str: item.str,
      })
    }
    pages.push({ number: n, width, pieces })
  }
  return pages
}

/**
 * Read a PDF in the browser.
 *
 * Dynamically imported so that a teacher who never opens the extractor does not
 * pay for pdf.js on load. That helps the hosted build, where it becomes a
 * separate chunk; it cannot help the single-file build, which inlines everything
 * by definition and grows by about 1.4 MB for this feature.
 */
export async function openPdf(bytes: Uint8Array): Promise<PdfDocumentLike> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs')

  // Registering the handler on the main thread. This has to happen before
  // getDocument, or pdf.js will go looking for a worker file that is not there.
  ;(globalThis as Record<string, unknown>).pdfjsWorker = worker

  // This detaches `bytes`. Whatever else needs the file must use the document
  // returned here, not the array that was passed in.
  const doc = await pdfjs.getDocument({ data: bytes }).promise
  return doc as unknown as PdfDocumentLike
}

/** Open a PDF and read its text, for a caller that wants nothing else from it. */
export async function readPdf(bytes: Uint8Array): Promise<PageText[]> {
  return pagesFromDocument(await openPdf(bytes))
}
