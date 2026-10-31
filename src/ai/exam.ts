/**
 * An exam as one self-contained document, out and back.
 *
 * A paper file holds references — `bank/design-processes.json#q14` — because a
 * question belongs to the bank and not to the paper that uses it. That is the
 * right thing on disk and useless to a model, which sees an opaque id going out
 * and has nothing to write in coming back. So this is the other form of the
 * same exam: the structure with its questions written out whole, which is what
 * a model can read as a worked example and what it can answer with.
 *
 * It is an interchange format, not a second storage format. Nothing here writes
 * a bundle to the folder and nothing reads one as though it were a paper: what
 * comes back becomes new questions in a bank the teacher chooses and a new
 * paper of references to them, and the by-reference decision is untouched.
 *
 * **Reading one never changes a question that already exists.** Every question
 * in a returned bundle is new and gets an id Klunk assigns. There is no match,
 * no merge and no round trip — an exported exam is a sample to write from, not
 * a document to edit and put back. That is what keeps the whole path clear of
 * deciding whether two similar questions are the same question.
 *
 * Both directions live in this one file for the reason `asPromptJson` serves
 * both the example and the avoid list: a writer that is not the reader's mirror
 * drifts from it, and the drift shows up as a reply that will not parse.
 */

import { extractJson, readQuestion, type Draft, type IngestContext } from './ingest'
import type { ResolvedPaper } from '../papers/paper'
import { pretty, promptFields } from './prompt'
import type { Paper, PaperSection, Profile, ProfileSection, Question } from '../shared/types'
import { asArray, asString } from './ingest'

/* ------------------------------------------------------------------ writing */

/**
 * An exam written out whole, for a model to read.
 *
 * The questions go through `promptFields`, which is the shape the reply is
 * measured against — so the sample teaches exactly the JSON the reader wants.
 * It drops what a model must not be shown or must not echo: `id`, `syllabusId`
 * and `courseId` because Klunk assigns and stamps those, an image stimulus
 * because Klunk cannot fetch one, and `source`, because a sample carrying
 * "2019 HSC question 24" hands a model the one thing it is forbidden to
 * reproduce.
 *
 * The envelope carries the title, the course and the totals as well. Those are
 * context rather than fields a reply is asked for, and the prompt says so.
 */
export function asExamJson(resolved: ResolvedPaper, courseLabel?: string): string {
  const out: Record<string, unknown> = { title: resolved.paper.title }
  if (courseLabel) out.course = courseLabel
  out.totalMarks = resolved.totalMarks
  out.sections = resolved.sections.map((section) => {
    const fields: Record<string, unknown> = { name: section.title }
    if (section.instructions) fields.instructions = section.instructions
    fields.marks = section.marks
    if (section.chooseCount !== undefined) fields.chooseCount = section.chooseCount
    fields.questions = section.questions.map((q) => promptFields(q.question))
    return fields
  })
  return pretty(out, '')
}

/* ------------------------------------------------------------------ reading */

export interface ExamContext extends Omit<IngestContext, 'expected'> {
  /**
   * The profile the returned paper is measured against, when there is one.
   *
   * Only used to work out what each section asked for, so a question of the
   * wrong type or the wrong mark value can be reported as a departure. The
   * paper as a whole is checked by `checkPaper`, which is the thing that already
   * knows how a paper and its profile can disagree.
   */
  profile?: Profile | undefined
}

export interface ExamSectionRead {
  /** The section name the reply gave, or the profile's where it gave none. */
  name: string
  /** Which profile section this fills, matched by name and then by position. */
  profileSectionId?: string | undefined
  instructions?: string | undefined
  drafts: Draft[]
  /** Entries in this section that were not questions, and why. */
  rejected: { at: number; why: string }[]
}

export interface ExamRead {
  sections: ExamSectionRead[]
  /** What it took to find the sections, when it took anything. */
  notes: string[]
  /** Why nothing could be read at all. Present only when `sections` is empty. */
  failure?: string
}

export function readExam(pasted: string, ctx: ExamContext): ExamRead {
  const notes: string[] = []

  const found = extractJson(pasted)
  if ('failure' in found) return { sections: [], notes, failure: found.failure }
  if (found.note) notes.push(found.note)

  let value: unknown
  try {
    value = JSON.parse(found.json)
  } catch (err) {
    return {
      sections: [],
      notes,
      failure:
        `That is not valid JSON: ${(err as Error).message}. Copy the whole reply, ` +
        'code block and all, and paste it again. If the model stopped halfway ' +
        'through, ask it for one section at a time.',
    }
  }

  const found2 = sectionsFrom(value)
  if ('failure' in found2) return { sections: [], notes, failure: found2.failure }
  if (found2.note) notes.push(found2.note)

  const specs = ctx.profile?.paper.sections ?? []
  const used = new Set<string>()

  // Ids are assigned across the whole reply, not per section, so two sections
  // cannot be handed the same one.
  const taken = new Set(ctx.inFolder)

  const sections = found2.items.map((raw, at): ExamSectionRead => {
    const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
    // Nothing is matched where the reply had no sections in it. One section
    // holding the whole paper is not this profile's first section, and saying it
    // is would tell the checker that Section I is satisfied by a paper that has
    // no sections at all — the one reading of this reply that hides the fault.
    const spec = found2.unsectioned ? undefined : matchSection(specs, asString(obj.name), at, used)
    if (spec) used.add(spec.id)

    const questions = asArray(obj.questions ?? obj.refs)
    const drafts: Draft[] = []
    const rejected: { at: number; why: string }[] = []
    const qctx: IngestContext = { ...ctx, expected: expectationOf(spec) }

    questions.forEach((q, qat) => {
      const read = readQuestion(q, qctx, taken)
      if ('why' in read) rejected.push({ at: qat, why: read.why })
      else drafts.push(read)
    })

    const instructions = asString(obj.instructions)
    if (instructions && spec?.instructions) {
      // Never dropped in silence. The profile is what prints above a section
      // and the prompt says so, but a model that wrote its own has written
      // something the teacher would otherwise look for on the paper and not
      // find.
      notes.push(
        `${spec.name} came back with its own instructions. Your profile's are printed ` +
          'instead: ' +
          spec.instructions,
      )
    }

    return {
      name: asString(obj.name) ?? spec?.name ?? `Section ${at + 1}`,
      profileSectionId: spec?.id,
      instructions,
      drafts,
      rejected,
    }
  })

  if (specs.length > 0 && !found2.unsectioned && sections.length !== specs.length) {
    // Said here rather than left to `checkPaper`, because it explains why a
    // section further down has nothing from the profile against it.
    notes.push(
      `The profile has ${specs.length} section${specs.length === 1 ? '' : 's'} and the ` +
        `reply has ${sections.length}. The paper is built as it came back, and the ` +
        'checker will say where it and the profile disagree.',
    )
  }

  if (sections.every((s) => s.drafts.length === 0 && s.rejected.length === 0)) {
    return { sections: [], notes, failure: 'That JSON parsed, but holds no questions.' }
  }
  return { sections, notes }
}

/**
 * Which profile section a returned one fills.
 *
 * By name first, because a model that renames nothing is the ordinary case and
 * a name survives a section being dropped; by position after that, because a
 * model that invents its own names still writes them in order. A section
 * already matched is not matched twice: two sections both called "Section II"
 * are one fault, not a reason to check both against the same rules.
 */
function matchSection(
  specs: ProfileSection[],
  name: string | undefined,
  at: number,
  used: Set<string>,
): ProfileSection | undefined {
  const free = (s: ProfileSection) => !used.has(s.id)
  const wanted = name?.trim().toLowerCase()
  if (wanted) {
    const byName = specs.find((s) => free(s) && s.name.trim().toLowerCase() === wanted)
    if (byName) return byName
  }
  const byPlace = specs[at]
  return byPlace && free(byPlace) ? byPlace : undefined
}

/**
 * What this section asked for, where it asked for one thing.
 *
 * A departure is only worth reporting against something definite. A section
 * that names three types, or that leaves the mark value of each question to
 * whoever writes it, has not been departed from by a question that is worth
 * three marks — so nothing is claimed.
 */
function expectationOf(
  spec: ProfileSection | undefined,
):
  | { questionType: NonNullable<ProfileSection['questionTypes']>[number]; marks: number }
  | undefined {
  const types = spec?.questionTypes ?? []
  const type = types.length === 1 ? types[0] : undefined
  if (!type || spec?.marksPerQuestion === undefined) return undefined
  return { questionType: type, marks: spec.marksPerQuestion }
}

/**
 * The sections out of whatever the reply is wrapped in.
 *
 * Three shapes are accepted and two of them are repairs. `{ "sections": [...] }`
 * is what the prompt asks for. A bare array of sections is what a model that
 * dropped the envelope returns. A bare array of *questions* is a model that
 * ignored the sections altogether, and becomes one unnamed section — reported,
 * because the paper it builds will not match the profile and the teacher has to
 * know why before the checker tells them.
 */
function sectionsFrom(
  value: unknown,
): { items: unknown[]; note?: string; unsectioned?: boolean } | { failure: string } {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    if (Array.isArray(obj.sections)) return { items: obj.sections }
    if (Array.isArray(obj.paper))
      return { items: obj.paper, note: 'The sections were under "paper".' }
    if (Array.isArray(obj.questions)) {
      return {
        items: [obj],
        unsectioned: true,
        note:
          'The reply held one list of questions and no sections, so they are all in one ' +
          'section and none of them is against your profile. Move them into sections on ' +
          'the paper, or ask for the paper again.',
      }
    }
    return {
      failure:
        'That JSON parsed, but has no "sections". Ask for the whole paper again, as ' +
        'one JSON object with a "sections" array.',
    }
  }

  if (!Array.isArray(value)) {
    return { failure: `That JSON parsed, but is a ${typeof value} rather than a paper.` }
  }
  if (value.length === 0) return { failure: 'That JSON parsed, but holds nothing.' }

  const sectionish = value.some(
    (v) =>
      typeof v === 'object' &&
      v !== null &&
      Array.isArray((v as Record<string, unknown>).questions),
  )
  if (sectionish)
    return { items: value, note: 'The sections came back without an object around them.' }
  return {
    items: [{ questions: value }],
    unsectioned: true,
    note:
      'The reply held one list of questions and no sections, so they are all in one ' +
      'section and none of them is against your profile. Move them into sections on ' +
      'the paper, or ask for the paper again.',
  }
}

/* ------------------------------------------------------- building the paper */

/**
 * The paper that refers to the questions just written.
 *
 * Built after the questions are saved rather than before, because `saveQuestion`
 * reassigns an id somebody else has taken while this reply was being read, and a
 * paper pointing at the id Klunk first chose would point at their question. So
 * the caller says what each draft was actually written as, and a draft that was
 * not written at all is left out rather than referred to.
 */
export function examPaper(
  read: ExamRead,
  opts: {
    id: string
    title: string
    profileId?: string | undefined
    bankPath: string
    /** The id a draft was written under, or undefined where it was not written. */
    writtenAs: (draft: Question) => string | undefined
  },
): Paper {
  const sections: PaperSection[] = read.sections.map((section) => {
    const out: PaperSection = { refs: [] }
    // A matched section takes its name and its instructions from the profile,
    // which is the template it is an instance of (#106). Writing the model's
    // words into `instructions` would make every drafted paper override a field
    // it was only ever echoing back.
    if (section.profileSectionId) out.profileSectionId = section.profileSectionId
    else {
      out.title = section.name
      if (section.instructions) out.instructions = section.instructions
    }
    out.refs = section.drafts
      .map((d) => opts.writtenAs(d.question))
      .filter((id): id is string => id !== undefined)
      .map((id) => `${opts.bankPath}#${id}`)
    return out
  })

  const paper: Paper = {
    formatVersion: '1',
    type: 'klunk_paper',
    id: opts.id,
    title: opts.title,
    status: 'draft',
    sections: sections.length > 0 ? sections : [{ refs: [] }],
  }
  if (opts.profileId) paper.profileId = opts.profileId
  return paper
}
