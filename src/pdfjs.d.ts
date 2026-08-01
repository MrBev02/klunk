/**
 * pdf.js ships its worker build without a type declaration.
 *
 * `src/pdftext.ts` imports it not to run a worker but to stop one being needed:
 * assigning it to `globalThis.pdfjsWorker` makes pdf.js keep everything on the
 * main thread, which is what lets the single-file build work over `file://`.
 * Only the presence of `WorkerMessageHandler` matters — pdf.js checks for it and
 * nothing here calls it — so the shape is left deliberately opaque.
 */
declare module 'pdfjs-dist/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}
