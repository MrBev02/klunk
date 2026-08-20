/**
 * The real documents the corpus suites read, named once.
 *
 * They live in `../klunk-content`, outside this repository and deliberately not
 * in git: a syllabus is copyright and a past paper is NESA's, and this repo is
 * public. So every corpus suite has to cope with the documents being absent, and
 * on a machine without them — CI included — those suites skip.
 *
 * That skipping was silent, and silence is the fault (#65). A suite that tests
 * nothing prints the same green as one that tests everything, and `npm run build`
 * gates the Pages deploy on that green. It bit for real: the heading reader was
 * changed across three commits with its whole corpus skipping, because one absent
 * document took the other five with it through an `every` gate.
 *
 * Two things follow, and this file exists for both.
 *
 * **A path lives in one place.** Six suites each kept their own string, so a
 * typo in one was indistinguishable from a document nobody had — and both read
 * as an ordinary skip.
 *
 * **What is missing can be said out loud.** `src/corpus.test.ts` reports it on
 * every run and, under `npm run test:corpus`, fails instead of skipping.
 *
 * This is imported only by tests. It is not part of the app and nothing in
 * `src/` outside a `*.test.ts` may import it.
 */

/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const CONTENT = '../klunk-content'
const SOURCE = `${CONTENT}/source`

/**
 * Documents kept purely as parser regression tests, for two subjects that are
 * out of scope. They are in the content folder rather than here for the same
 * reason as everything else.
 */
const FIXTURES = `${CONTENT}/fixtures`

/* ------------------------------------------------------- NESA past papers */

/** Every year of the HSC Design and Technology written paper that has been read. */
export const PAPER_YEARS = [
  2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
] as const

const PAPERS = `${SOURCE}/nsw-hsc-dt/papers`

export const dtPaper = (year: number) => `${PAPERS}/dt-${year}-paper.pdf`
export const dtMarkingGuide = (year: number) => `${PAPERS}/dt-${year}-mg.pdf`

/**
 * The 2025 HSC Biology paper and its marking guide.
 *
 * The first document the paper reader was given that was not Design and
 * Technology, and it broke it in four places (#81 to #84) and a fifth (#85).
 * Every one of those findings was established by hand and none of them was
 * pinned by a test, which is the same silence #65 was about: the eleven D&T
 * papers can all pass while the document that actually found the faults goes
 * unread.
 */
export const BIOLOGY_PAPER = `${SOURCE}/2025-hsc-biology.pdf`
export const BIOLOGY_MARKING_GUIDE = `${SOURCE}/2025-hsc-biology-mg.pdf`

/* ------------------------------------------------------------ scanned papers */

/**
 * Two Year 11 Enterprise Computing exams scanned on a school copier, and the
 * only documents anywhere in the corpus with no text layer at all (#89).
 *
 * They are what settled the rule in `src/textlayer.ts`: 34 pages between them
 * and not one text piece, because the copier ran no text recognition and every
 * page is a single full-page image. Every other PDF here sits on the other side
 * of that line, so both halves of the rule have a real document behind them.
 *
 * Worth knowing before either is used for anything beyond that. The 2025 scan is
 * upside down on every page. The 2024 one is **2-up** on A3, two of the paper's
 * 20 pages per image, and its orientation varies sheet by sheet; its first sheet
 * is a failed scan holding no page at all, so the cover is simply missing.
 */
export const EC_2025_SCAN = `${SOURCE}/enterprise-computing-2025-year11-scan.pdf`
export const EC_2024_SCAN = `${SOURCE}/enterprise-computing-2024-year11-scan.pdf`

/**
 * The 2025 paper's marking guide, scanned on the same copier (#94).
 *
 * The first scanned *guide* the corpus has ever held, and until it arrived the
 * guide half of the rule was resting on papers: `readMarkingGuide` was fed the
 * two above, which are the right shape of document to refuse and the wrong kind
 * of file. Ten pages, none with any text.
 *
 * It is also the richest answer key anywhere here, which is the reason it is
 * worth more than a third row in one table. Section I is printed as three
 * separate grids: single letters for questions 1 to 9, several letters each for
 * 10 to 12, and `1C 2F 3A` links for 13 to 15. That is `multiple_choice`,
 * `multiple_response` and `matching` in one document, which is exactly what #32
 * built and what an `ExtractedGuide` cannot hold.
 */
export const EC_2025_SCAN_MG = `${SOURCE}/enterprise-computing-2025-year11-scan_mg.pdf`

/* --------------------------------------------------------- NESA syllabuses */

export const DT_SYLLABUS = `${SOURCE}/nsw-hsc-dt/design-technology-st6-syl.docx`
export const TEXTILES = `${SOURCE}/other-syllabuses/textiles-design-st6-syl.docx`
export const DRAMA = `${SOURCE}/nsw-hsc-drama/drama-st6-syl-from2010.docx`
export const VISUAL_ARTS = `${SOURCE}/nsw-hsc-visual-arts/visual-arts-st6-syl-amended-2016.docx`
export const ENGLISH = `${SOURCE}/nsw-hsc-english/NESA - english_advanced_11_12_2024 (S6).docx`
export const MATHS = `${SOURCE}/nsw-hsc-maths/NESA - mathematics_advanced_11_12_2024 (S6).docx`
export const BIOLOGY = `${SOURCE}/nsw-hsc-biology/biology-stage-6-syllabus-2017.docx`
export const COMPUTING = `${SOURCE}/nsw-computing-technology-7-10/NESA - computing_technology_7_10_2022 (S4, S5, LS).docx`

/**
 * The only document that states content inside a box rather than in a list (#93).
 *
 * 73 one-cell shaded tables headed `Including:`, holding 297 content points
 * between them — more than twice what the bullets outside them hold. Every one
 * was discarded in silence until the reader learned the shape, and the model
 * that came out was 140 points of real syllabus with nothing to say it was a
 * third of the document.
 */
export const ENTERPRISE = `${SOURCE}/nsw-enterprise-computing-11-12/NESA - enterprise_computing_11_12_2022 (S6).docx`

export const INDUSTRIAL = `${FIXTURES}/industrial-technology-st6-syl.docx`
export const FOOD = `${FIXTURES}/food-technology-st6-syl.docx`

/* ------------------------------------------------------------------ the IB */

const IB = `${SOURCE}/ib-dt`

export const IB_GUIDE = `${IB}/design-technology-guide-2027.pdf`
export const IB_MAP = `${IB}/ib-dt-syllabus-map-old-vs-new.xlsx`

// RevisionDojo's practice paper, not the IB's own. No IB specimen is in the
// folder (#45), and this must never be described as IB extraction.
export const IB_PAPER = `${IB}/Design Technology SL Paper 1 (Set 1) (1).pdf`
export const IB_MARKSCHEME = `${IB}/Design Technology SL Paper 1 (Set 1) - Markscheme (1).pdf`

/* ------------------------------------------------------------- asking about */

/** Whether every one of these documents is on this machine. */
export function have(...paths: string[]): boolean {
  return paths.every((path) => existsSync(path))
}

/** Which of these documents are not, in the order given. */
export function missing(paths: string[]): string[] {
  return paths.filter((path) => !existsSync(path))
}

/**
 * Whether the port comparison can run at all.
 *
 * `python3` is not a dependency of the app, only of `syllabus.corpus`, which
 * checks `src/syllabus.ts` against the tool it was ported from. Reported beside
 * the documents because a machine without it loses that suite just as completely
 * as a machine without the `.docx`.
 */
export function havePython(): boolean {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/* ----------------------------------------------------------- the whole list */

export interface CorpusSuite {
  /** What this suite is evidence of, in a teacher-free sentence fragment. */
  what: string
  docs: string[]
  /** Set where the suite needs something beyond documents. */
  needs?: { what: string; met: () => boolean }
}

/**
 * Every corpus suite and what it reads.
 *
 * Keyed by file so a report names the thing to go and look at. `headings.corpus`
 * also reads the Design and Technology syllabus, to check the 2013 documents go
 * to the table reader rather than to it, which is why that one document appears
 * against two suites.
 */
export const SUITES: Record<string, CorpusSuite> = {
  'extract.corpus': {
    what: 'the NESA past paper and marking guide readers, over eleven years and two subjects',
    docs: [
      ...PAPER_YEARS.flatMap((year) => [dtPaper(year), dtMarkingGuide(year)]),
      BIOLOGY_PAPER,
      BIOLOGY_MARKING_GUIDE,
    ],
  },
  'objective.corpus': {
    what: 'the numbered multiple-choice paper and answer-key readers',
    docs: [IB_PAPER, IB_MARKSCHEME],
  },
  'syllabus.corpus': {
    what: 'the 2013 content-table reader, and its agreement with the Python generator',
    docs: [DT_SYLLABUS, TEXTILES, INDUSTRIAL, FOOD],
    needs: { what: 'python3 on the path', met: havePython },
  },
  'headings.corpus': {
    what: 'the Outcomes/Content and prose readers, over seven syllabuses',
    docs: [DRAMA, ENGLISH, MATHS, COMPUTING, BIOLOGY, ENTERPRISE, VISUAL_ARTS, DT_SYLLABUS],
  },
  'textlayer.corpus': {
    what: 'refusing a scan for holding no text, over three documents that have none',
    docs: [EC_2025_SCAN, EC_2024_SCAN, EC_2025_SCAN_MG],
  },
  'ibdt.corpus': {
    what: 'the IB syllabus map reader',
    docs: [IB_MAP],
  },
  'ibguide.corpus': {
    what: 'the IB subject guide reader, and its agreement with the map',
    docs: [IB_GUIDE, IB_MAP],
  },
}

/** Every document any suite reads, each once. */
export function allDocuments(): string[] {
  return [...new Set(Object.values(SUITES).flatMap((s) => s.docs))]
}
