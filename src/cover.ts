/**
 * Working out what goes on the cover sheet, without drawing any of it.
 *
 * Three layers hold the answer and each absence means "use the one above": the
 * folder's `school.json` says who the school is, the profile says how this kind
 * of paper's cover differs, and the paper itself carries the facts that change
 * every time. Spreading that resolution through JSX would put it somewhere no
 * test can reach, because nothing in this repo renders a component: there is no
 * `preact-render-to-string` and adding one to check a cover would be a poor
 * trade. So the rules live here, taking a resolved paper and returning a model,
 * the way `extract.ts` takes positioned text and no PDF.
 *
 * The shape of the cover itself was established from two real documents, a 2026
 * Year 10 half-yearly and a 2025 Visual Arts HSC trial. They share a skeleton
 * and differ in exactly three configurable ways: which identification fields,
 * whether those repeat on every page, and whether the marks breakdown is a list
 * or a table with a Marks Awarded column.
 */

import type { ResolvedPaper } from './paper'
import { joinPath } from './storage'
import type { IdentificationField } from './types'

/** Where the logo goes when nothing says. The Year 10 cover places its at 85.4 mm. */
export const DEFAULT_LOGO_WIDTH_MM = 85

/** Cells in a student number grid when the field does not say. */
export const DEFAULT_BOXES = 8

export interface CoverField {
  label: string
  kind: 'write' | 'boxes'
  /** Resolved, so the renderer never has to know the default. Ignored for `write`. */
  boxes: number
}

export interface CoverSectionRow {
  title: string
  marks: number
  /** `Questions 1–10`, or empty where the section holds none yet. */
  questions: string
  suggestedMinutes?: number | undefined
}

export interface CoverModel {
  /**
   * The logo as an object URL, when the folder actually holds the file.
   *
   * Absent with `logoPath` present means the file is named and missing, which is
   * printed as a placeholder rather than as blank space, for the reason a
   * missing stimulus image is: better seen on the proof than in the exam room.
   */
  logoSrc?: string | undefined
  /** Where the logo was looked for, so a missing one can be named. */
  logoPath?: string | undefined
  logoWidthMm: number

  schoolName?: string | undefined
  title: string
  subtitle?: string | undefined
  course?: string | undefined
  yearGroup?: string | undefined
  date?: string | undefined
  /** Whether this is the marking guide, which carries its stamp on the cover. */
  guide: boolean

  /** Identification fields printed on the cover. */
  identification: CoverField[]
  /** Identification fields repeated at the top of every page. */
  everyPage: CoverField[]

  readingMinutes?: number | undefined
  workingMinutes?: number | undefined
  instructions: string[]

  totalMarks: number
  sections: CoverSectionRow[]
  /** Print the breakdown as a table with a column the marker fills in. */
  marksAwardedColumn: boolean
}

/**
 * Resolve the three layers into one model.
 *
 * `guide` rather than a `PrintMode`, because this module has no business
 * knowing there are two renderings; all it needs is whether the stamp is on.
 */
export function coverModel(resolved: ResolvedPaper, guide = false): CoverModel {
  const { paper, profile, school } = resolved
  const onPaper = paper.school

  // The profile's list wins whole rather than field by field. Half of an
  // external-style student number grid merged with half of an internal Name and
  // Class block is not a cover anybody prints.
  const fields = (profile?.paper.cover?.identification ?? school?.identification ?? []).filter(
    (f) => f.label.trim(),
  )
  const wanted = (every: boolean) =>
    fields.filter((f) => (f.onEveryPage ?? false) === every).map(toCoverField)

  const logo = logoFor(resolved)

  return {
    ...(logo ?? {}),
    logoWidthMm: school?.logoWidthMm ?? DEFAULT_LOGO_WIDTH_MM,

    schoolName: text(onPaper?.name) ?? text(school?.name),
    title: paper.title,
    subtitle: text(paper.subtitle),
    course: text(onPaper?.course),
    yearGroup: text(onPaper?.yearGroup),
    date: formatDate(text(onPaper?.date)),
    guide,

    identification: wanted(false),
    everyPage: wanted(true),

    readingMinutes: paper.readingMinutes ?? profile?.paper.readingMinutes,
    workingMinutes: paper.workingMinutes ?? profile?.paper.workingMinutes,
    // Blank lines are what an instructions textarea leaves behind, and they
    // print as empty bullets.
    instructions: (paper.instructions ?? profile?.paper.instructions ?? [])
      .map((line) => line.trim())
      .filter(Boolean),

    totalMarks: resolved.totalMarks,
    sections: resolved.sections.map((s) => ({
      title: s.title,
      marks: s.marks,
      questions: questionRange(s.questions.map((q) => q.number)),
      suggestedMinutes: s.profileSection?.suggestedMinutes,
    })),
    marksAwardedColumn: profile?.paper.cover?.marksAwardedColumn ?? false,
  }
}

function toCoverField(field: IdentificationField): CoverField {
  return {
    label: field.label.trim(),
    kind: field.kind,
    boxes: field.kind === 'boxes' ? Math.max(1, Math.round(field.boxes ?? DEFAULT_BOXES)) : 0,
  }
}

/**
 * Which logo, and where it lives.
 *
 * A path is resolved against the file that named it, which is the rule stimulus
 * images already follow. The paper's own logo is relative to `papers/<id>.json`
 * and the school's is relative to `school.json`, so the two cannot be resolved
 * by one base: a folder whose `school.json` sits at the root and whose papers
 * sit a directory down would find the school's logo inside `papers/`.
 */
function logoFor(
  resolved: ResolvedPaper,
): { logoSrc?: string | undefined; logoPath: string } | null {
  const own = resolved.paper.school?.logoFile?.trim()
  if (own) {
    const path = joinPath(resolved.paperPath ?? `papers/${resolved.paper.id}.json`, own)
    return { logoSrc: resolved.images.get(path), logoPath: path }
  }

  const shared = resolved.school?.logoFile?.trim()
  if (shared && resolved.schoolPath) {
    const path = joinPath(resolved.schoolPath, shared)
    return { logoSrc: resolved.images.get(path), logoPath: path }
  }

  return null
}

/**
 * `Questions 1–10`, or `Question 4`, or nothing at all.
 *
 * An en dash because that is what the printed papers use, and because this is
 * a range of numbers, which is the one place the on-screen voice keeps one.
 *
 * The numbers are read rather than assumed contiguous: they are assigned across
 * the whole paper in order, so a section's are always a run, but saying
 * `first–last` off a list that turned out not to be one would print a range that
 * does not match the questions under it.
 */
export function questionRange(numbers: number[]): string {
  if (numbers.length === 0) return ''
  const first = numbers[0]
  const last = numbers[numbers.length - 1]
  if (first === undefined || last === undefined) return ''
  if (numbers.length === 1) return `Question ${first}`
  const contiguous = numbers.every((n, i) => n === first + i)
  return contiguous
    ? `Questions ${first}–${last}`
    : `Questions ${numbers.join(', ')}`
}

/** Minutes as a cover prints them. Both example papers print plain minutes. */
export function minutes(n: number): string {
  return `${n} minute${n === 1 ? '' : 's'}`
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * The date as a cover prints it: `10 August 2026`.
 *
 * The box a teacher fills in is a date picker, so what reaches the file is
 * `2026-08-10`, and printing that on the front of an examination is the file's
 * words rather than anybody's.
 *
 * Anything that is not an ISO date is printed exactly as typed. `date` is a free
 * string in the schema, and a hand-edited paper may hold `Week 3, Term 3` or
 * `Monday 10 August`, which are real answers; reformatting them is not this
 * function's business.
 *
 * Built from the parts rather than through `Date`, because `new Date('2026-08-10')`
 * is read as UTC and then printed in local time, which west of Greenwich is the
 * day before.
 */
export function formatDate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!parts) return value

  const [, year, month, day] = parts
  const name = MONTHS[Number(month) - 1]
  if (!name || !year || !day) return value
  return `${Number(day)} ${name} ${year}`
}

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}
