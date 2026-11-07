/**
 * The Klunk paper a past paper becomes once its questions are saved (#249).
 *
 * Until this, importing a paper put its questions in a bank and kept nothing of
 * the paper itself, so a teacher wanting it back had to pick 43 questions out
 * again, band by band, in order. Everything needed is already known by then:
 * the order is the order they were read in, each question's section is in its
 * provenance (#208), and the structure is the one the transcription panel asked
 * for (#247).
 *
 * **No paper rather than a wrong one.** A question whose section names none of
 * the structure's, or a structure with several sections and questions that name
 * none, is a paper the checker would reject on sight. That is refused with the
 * reason, and the questions are saved either way.
 *
 * Pure, so the placement can be tested without a folder. `extractor.tsx` writes.
 */

import { newPaper } from '../papers/paper'
import type { Paper, Profile, ProfileSection, Question } from '../shared/types'

export interface SavedQuestion {
  question: Question
  /** The bank it was written to. */
  file: string
}

export type ImportedPaper = { paper: Paper } | { refused: string }

/** `2025 Year 8 Task 1`, unless the examination already names its year. */
export function importedTitle(examination: string, year: number | undefined): string {
  const name = examination.trim() || 'Past paper'
  if (year === undefined || name.includes(String(year))) return name
  return `${year} ${name}`
}

/**
 * The paper's id, made from its title as the builder makes one, and moved on
 * past any the folder already holds.
 *
 * Importing the same paper twice is ordinary: the first try is abandoned, or a
 * second teacher on the shared drive does it too. `savePaper` refuses to write
 * over a different paper, so the second import gets `-2` rather than an error
 * after its questions are already in a bank.
 */
export function importedPaperId(title: string, taken: ReadonlySet<string>): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'paper'
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The structure's section a question's section names, or why there is none.
 *
 * As loose as `sameSection` in `adopt.ts`, for the same reason: the reply says
 * "Support", the structure "Support Band", and both are the band. An exact
 * match is tried first, so "Standard" is not taken for "Standard Plus" when a
 * structure has both.
 */
function sectionFor(
  name: string,
  sections: readonly ProfileSection[],
): ProfileSection | { why: string } {
  const want = norm(name)
  if (want === '') return { why: 'an empty section name' }
  const exact = sections.filter((s) => norm(s.name) === want)
  if (exact.length === 1) return exact[0]!
  const loose = sections.filter((s) => {
    const have = norm(s.name)
    return have !== '' && (have.startsWith(want) || want.startsWith(have))
  })
  if (loose.length === 1) return loose[0]!
  return loose.length === 0
    ? { why: `has no section called "${name}"` }
    : {
        why: `has more than one section "${name}" could be: ${loose.map((s) => s.name).join(', ')}`,
      }
}

const BUILD_IT = 'Build the paper from the bank on Papers.'

/**
 * The paper the saved questions make under this structure.
 *
 * @param saved Every question saved from the paper so far, in the order the
 *   paper printed them, each with the id it was actually written under. A
 *   question discarded at review is simply not here: the paper holds what was
 *   saved, and the checker says what is missing rather than this renumbering.
 */
export function importedPaper(input: {
  structure: Profile
  examination: string
  year?: number | undefined
  /** Folder-relative. */
  document: string
  saved: readonly SavedQuestion[]
  id: string
  /** What the structure's syllabus and course are called, for the cover. */
  about?: { subject?: string | undefined; course?: string | undefined }
}): ImportedPaper {
  const { structure, saved } = input
  const sections = structure.paper.sections
  if (saved.length === 0) return { refused: 'No paper was made: no question was saved.' }
  if (sections.length === 0) {
    return { refused: `No paper was made: ${structure.name} has no sections. ${BUILD_IT}` }
  }

  const placed = new Map<string, string[]>(sections.map((s) => [s.id, []]))
  const unnamed: string[] = []
  const unplaced: string[] = []
  for (const { question, file } of saved) {
    const ref = `${file}#${question.id}`
    // One section takes everything: a paper with no bands has nothing to match.
    if (sections.length === 1) {
      placed.get(sections[0]!.id)!.push(ref)
      continue
    }
    const named = question.source?.section
    const number = question.source?.questionNumber ?? '?'
    if (!named) {
      unnamed.push(number)
      continue
    }
    const found = sectionFor(named, sections)
    if ('why' in found) {
      if (!unplaced.includes(found.why)) unplaced.push(found.why)
      continue
    }
    placed.get(found.id)!.push(ref)
  }

  if (unplaced.length > 0) {
    return {
      refused:
        `No paper was made: ${structure.name} ${unplaced.join(', and ')}. ` +
        `Its sections are ${sections.map((s) => s.name).join(', ')}. ${BUILD_IT}`,
    }
  }
  if (unnamed.length > 0) {
    const n = unnamed.length
    return {
      refused:
        `No paper was made: ${n === 1 ? 'one question names' : `${n} questions name`} no section ` +
        `of ${structure.name}. ${BUILD_IT}`,
    }
  }

  const paper = newPaper(
    structure,
    input.id,
    importedTitle(input.examination, input.year),
    input.about,
  )
  for (const section of paper.sections) {
    section.refs = placed.get(section.profileSectionId ?? '') ?? []
  }
  // It has been sat: that is what a past paper is. `used` is what makes the
  // builder warn before one of these questions goes on another paper.
  paper.status = 'used'
  paper.source = {
    paper: input.examination.trim() || 'Past paper',
    ...(input.year === undefined ? {} : { year: input.year }),
    document: input.document,
  }
  return { paper }
}
