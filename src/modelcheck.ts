/**
 * What the folder's syllabus models say about the questions tagged against them.
 *
 * Two faults this answers, both from #44 and both silent until now.
 *
 * A question tags itself with topic ids, content point ids and outcome codes, and
 * nothing ever checked that those still name anything. `src/question.tsx` printed
 * them as chips without a lookup and `src/paper.ts` warned only when a question
 * had no tags at all, so a tag pointing at nothing looked exactly like a live one.
 * Re-reading a corrected syllabus is how that happens: the fresh parse restores
 * the ids the teacher merged away and takes away the ones they made.
 *
 * And two models can describe one document without Klunk noticing, because the
 * only thing that would say so is `source.title` and nothing compared it. That is
 * not the same as two *editions* of one subject, which is normal and is #29: two
 * editions come from two different documents, so they do not share a title.
 *
 * Everything here takes loaded models and questions rather than a folder, so it
 * is testable without one.
 */

import type { Loaded, Question, QuestionRef, Syllabus, SyllabusCourse } from './types'

/**
 * Every id a question can legitimately tag itself with.
 *
 * All three kinds together, because a question cites all three and they cannot
 * collide: an outcome code is `H1.1` and a topic id is `HSC-01`.
 */
export function taggedIds(courses: SyllabusCourse[]): Set<string> {
  const out = new Set<string>()
  for (const course of courses) {
    for (const outcome of course.outcomes ?? []) out.add(outcome.code)
    for (const topic of course.topics) {
      out.add(topic.id)
      for (const point of topic.points ?? []) out.add(point.id)
    }
  }
  return out
}

/** What each syllabus model in the folder defines, by its id. */
export function knownIds(syllabuses: Loaded<Syllabus>[]): Map<string, Set<string>> {
  return new Map(syllabuses.map(({ data }) => [data.id, taggedIds(data.courses)]))
}

/** The ids on a question, all three kinds, in the order a teacher would read them. */
function citedBy(question: Question): string[] {
  return [
    ...(question.syllabus?.topicIds ?? []),
    ...(question.syllabus?.pointIds ?? []),
    ...(question.outcomes ?? []),
  ]
}

/**
 * Which of a question's tags name nothing in the model it belongs to.
 *
 * Empty in two cases that are not faults, and getting these wrong would make the
 * warning noise a teacher learns to ignore:
 *
 * - **The question names no syllabus.** All that is known is the bare id it
 *   carries, which could belong to any model in the folder. The same reading
 *   `inSyllabus` takes.
 * - **The model is not in this folder.** Klunk ships no syllabus models and a
 *   bank may name one the teacher has not generated yet, so a missing model is
 *   ordinary rather than a fault in the question.
 */
export function unresolvedTags(ref: QuestionRef, known: Map<string, Set<string>>): string[] {
  if (ref.syllabusId === undefined) return []
  const ids = known.get(ref.syllabusId)
  if (ids === undefined) return []
  return citedBy(ref.question).filter((id) => !ids.has(id))
}

/** The same check for a question whose model is already in hand. */
export function unresolvedAgainst(question: Question, ids: Set<string>): string[] {
  return citedBy(question).filter((id) => !ids.has(id))
}

/* ------------------------------------------------------- one document, two models */

export interface DuplicateModels {
  /** The document all of them were generated from. */
  source: string
  models: { id: string; name: string; path: string; edition?: string | undefined }[]
}

/**
 * Models in one folder that were generated from the same document.
 *
 * `source.title` is the document's filename, recorded on every model Klunk
 * writes, and two models of one document under two ids is a duplicate however it
 * happened. Two editions of one subject running at once (#29) is the case this
 * must not catch, and it does not: the 2017 and 2025 Biology syllabuses are two
 * different documents with two different titles.
 *
 * A model with no `source.title` is left out rather than grouped with every other
 * model that also lacks one. Hand-written models exist and a folder of them is
 * not a folder of duplicates.
 */
export function duplicateModels(syllabuses: Loaded<Syllabus>[]): DuplicateModels[] {
  const groups = new Map<string, DuplicateModels['models']>()

  for (const { path, data } of syllabuses) {
    const title = data.source?.title?.trim()
    if (!title) continue
    const mine = groups.get(title) ?? []
    mine.push({ id: data.id, name: data.name, path, edition: data.syllabusVersion })
    groups.set(title, mine)
  }

  const out: DuplicateModels[] = []
  for (const [source, models] of groups) {
    // Two entries under one id cannot happen, since the id is the filename the
    // model is written to. More than one id from one document is the fault.
    if (new Set(models.map((m) => m.id)).size > 1) out.push({ source, models })
  }
  return out
}
