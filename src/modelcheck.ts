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
 * What a model defines, per course and in total.
 *
 * Both, because a question may or may not say which course it belongs to and the
 * two cases have different right answers. See `idsFor`.
 */
export interface ModelIds {
  /** Every id in the model, whichever course holds it. */
  all: Set<string>
  /** What each course holds, by course id. */
  byCourse: Map<string, Set<string>>
}

/**
 * Every id a question can legitimately tag itself with, kept per course.
 *
 * All three kinds together, because a question cites all three and they cannot
 * collide: an outcome code is `H1.1` and a topic id is `HSC-01`.
 *
 * Per course rather than in one heap, because an id is only unique within a
 * course (#47). Every NESA model mints topic ids from the course id, so `PRE-01`
 * and `HSC-01` cannot collide however much content the two courses share, and
 * flattening them was harmless. The IB model uses the code the guide prints, so
 * Standard level and Higher level both hold `A1-1`, and flattening hid the
 * removal of a point from one course behind its survival in the other.
 */
export function taggedIds(courses: SyllabusCourse[]): ModelIds {
  const all = new Set<string>()
  const byCourse = new Map<string, Set<string>>()

  for (const course of courses) {
    const mine = byCourse.get(course.id) ?? new Set<string>()
    const add = (id: string) => {
      mine.add(id)
      all.add(id)
    }
    for (const outcome of course.outcomes ?? []) add(outcome.code)
    for (const topic of course.topics) {
      add(topic.id)
      for (const point of topic.points ?? []) add(point.id)
    }
    byCourse.set(course.id, mine)
  }

  return { all, byCourse }
}

/**
 * The ids a question is entitled to cite, given the course it names.
 *
 * A question naming a course is held to that course. One naming none is held to
 * the whole model, because all that is known is the bare id and it could belong
 * to any course in it. That is the reading `inSyllabus` already takes one level
 * up, and the same argument: a warning raised on a guess is noise a teacher
 * learns to ignore.
 *
 * A course the model does not have falls back to the whole model for the same
 * reason. It is a fault in the question, but reporting it by marking every one
 * of that question's tags dead would say something false and loud about ids that
 * are perfectly real.
 */
export function idsFor(model: ModelIds, courseId: string | undefined): Set<string> {
  if (courseId === undefined) return model.all
  return model.byCourse.get(courseId) ?? model.all
}

/** What each syllabus model in the folder defines, by its id. */
export function knownIds(syllabuses: Loaded<Syllabus>[]): Map<string, ModelIds> {
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
export function unresolvedTags(ref: QuestionRef, known: Map<string, ModelIds>): string[] {
  if (ref.syllabusId === undefined) return []
  const model = known.get(ref.syllabusId)
  if (model === undefined) return []
  return unresolvedAgainst(ref.question, model)
}

/** The same check for a question whose model is already in hand. */
export function unresolvedAgainst(question: Question, model: ModelIds): string[] {
  const ids = idsFor(model, question.syllabus?.courseId)
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
