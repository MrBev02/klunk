/**
 * Correcting a syllabus model by hand, before it is written.
 *
 * The readers get things wrong in ways no count shows. #26 is the proof: Textiles
 * HSC read sixteen topics where the sixteenth was a content point promoted to a
 * heading by a page break, and the count was right while the content was wrong.
 * The same is true of a group taken from document furniture (#14), a course read
 * under the catch-all name `Course`, mathematics coming back linear out of `<m:t>`,
 * and the continuation rule firing on a topic that genuinely opens `iv)`.
 *
 * So these are the failures made undoable: merge a topic into the one above,
 * split one at a content point, clear a group across a course, edit or delete any
 * text that came out wrong. Every operation is a pure function over the parsed
 * courses, so the whole of it is testable without a `.docx` or a browser, exactly
 * as `syllabus.ts` takes XML and no file.
 *
 * **Ids never renumber.** Deleting `HSC-02` leaves `HSC-03` as `HSC-03`, and a new
 * topic or point takes an id past the end of what is there. A question tags itself
 * with a topic id, the screen offers to replace a model that questions already
 * point at, and an id that shifted underneath them would retag the lot silently.
 * That is why nothing here is derived from an array index.
 */

import { taggedIds } from './modelcheck'
import { inSyllabus, syllabusIdsOf } from './storage'
import type { QuestionRef, SyllabusCourse, SyllabusOutcome, SyllabusPoint, SyllabusTopic } from './types'

export class SyllabusEditError extends Error {}

/* --------------------------------------------------------------- minting ids */

/** The stem a course's topic ids are built on: `PRE-04` → `PRE`, `Y11-12` → `Y11`. */
function topicPrefix(course: SyllabusCourse): string {
  for (const topic of course.topics) {
    const split = topic.id.lastIndexOf('-')
    if (split > 0 && /^\d+$/.test(topic.id.slice(split + 1))) return topic.id.slice(0, split)
  }
  // Nothing to copy from, so build one the way both readers do. The schema
  // allows only capitals, digits and hyphens in an id.
  return course.id.toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'TOPIC'
}

/** The ordinal at the end of `id`, where `id` begins with `stem` and a separator. */
function ordinalAfter(id: string, stem: string, separator: string): number | null {
  if (!id.startsWith(stem + separator)) return null
  const tail = id.slice(stem.length + separator.length)
  return /^\d+$/.test(tail) ? Number(tail) : null
}

/**
 * An id for a new topic, past the end rather than into a gap.
 *
 * Past the end because a gap is where a deleted topic used to be, and a question
 * written against a folder in a half-corrected state would then find a different
 * topic under the id it recorded.
 */
export function nextTopicId(course: SyllabusCourse): string {
  const stem = topicPrefix(course)
  const taken = new Set(course.topics.map((t) => t.id))
  let n = 1
  for (const topic of course.topics) {
    const at = ordinalAfter(topic.id, stem, '-')
    if (at !== null && at >= n) n = at + 1
  }
  let id = `${stem}-${String(n).padStart(2, '0')}`
  while (taken.has(id)) id = `${stem}-${String(++n).padStart(2, '0')}`
  return id
}

/** An id for a new content point on `topic`, past the end of the ones it has. */
export function nextPointId(topic: SyllabusTopic): string {
  const points = topic.points ?? []
  const taken = new Set(points.map((p) => p.id))
  let n = 1
  for (const point of points) {
    const at = ordinalAfter(point.id, topic.id, '.')
    if (at !== null && at >= n) n = at + 1
  }
  let id = `${topic.id}.${String(n).padStart(2, '0')}`
  while (taken.has(id)) id = `${topic.id}.${String(++n).padStart(2, '0')}`
  return id
}

/* ------------------------------------------------------------------ plumbing */

function onCourse(
  courses: SyllabusCourse[],
  courseId: string,
  fn: (course: SyllabusCourse) => SyllabusCourse,
): SyllabusCourse[] {
  let found = false
  const out = courses.map((c) => {
    if (c.id !== courseId) return c
    found = true
    return fn(c)
  })
  if (!found) throw new SyllabusEditError(`No course ${courseId} in this syllabus.`)
  return out
}

function onTopic(
  courses: SyllabusCourse[],
  courseId: string,
  topicId: string,
  fn: (topic: SyllabusTopic) => SyllabusTopic,
): SyllabusCourse[] {
  return onCourse(courses, courseId, (course) => {
    if (!course.topics.some((t) => t.id === topicId)) {
      throw new SyllabusEditError(`No topic ${topicId} in ${course.name}.`)
    }
    return { ...course, topics: course.topics.map((t) => (t.id === topicId ? fn(t) : t)) }
  })
}

function indexOfTopic(course: SyllabusCourse, topicId: string): number {
  const at = course.topics.findIndex((t) => t.id === topicId)
  if (at < 0) throw new SyllabusEditError(`No topic ${topicId} in ${course.name}.`)
  return at
}

/* ---------------------------------------------------------------- the course */

export function renameCourse(
  courses: SyllabusCourse[],
  courseId: string,
  name: string,
): SyllabusCourse[] {
  return onCourse(courses, courseId, (course) => ({ ...course, name }))
}

/* ----------------------------------------------------------------- the topic */

/**
 * The published heading is kept as `text` and only `name` is edited, which is
 * what the schema says it is for: the name is tidied for display and the
 * original still has to be checkable against the document.
 */
export function renameTopic(
  courses: SyllabusCourse[],
  courseId: string,
  topicId: string,
  name: string,
): SyllabusCourse[] {
  return onTopic(courses, courseId, topicId, (topic) => ({ ...topic, name }))
}

/** An empty group removes it, because absent and empty are different in the schema. */
export function setTopicGroup(
  courses: SyllabusCourse[],
  courseId: string,
  topicId: string,
  group: string,
): SyllabusCourse[] {
  return onTopic(courses, courseId, topicId, (topic) => {
    const { group: _was, ...rest } = topic
    return group.trim() ? { ...rest, group } : rest
  })
}

/**
 * Take the group off every topic in a course.
 *
 * The #14 shape by hand. A heading that does not say it is a focus area was read
 * as one and every topic in the course inherited it, so the correction is a
 * course at a time rather than forty topics at a time.
 */
export function clearGroups(courses: SyllabusCourse[], courseId: string): SyllabusCourse[] {
  return onCourse(courses, courseId, (course) => ({
    ...course,
    topics: course.topics.map(({ group: _was, ...rest }) => rest),
  }))
}

/** @throws SyllabusEditError when it is the only topic the course has. */
export function deleteTopic(
  courses: SyllabusCourse[],
  courseId: string,
  topicId: string,
): SyllabusCourse[] {
  return onCourse(courses, courseId, (course) => {
    indexOfTopic(course, topicId)
    if (course.topics.length === 1) {
      throw new SyllabusEditError(
        `${course.name} would have no topics left. Every course needs at least one.`,
      )
    }
    return { ...course, topics: course.topics.filter((t) => t.id !== topicId) }
  })
}

/**
 * Fold a topic into the one above it, heading and all.
 *
 * The heading becomes the first of the points that move, because that is what it
 * was: a content point the page break turned into a topic (#26). The verbatim
 * heading goes across rather than the tidied name, so what lands in the model is
 * what the syllabus printed.
 *
 * The merged topic's own outcomes and group are dropped. They were the parent's
 * to begin with in every case this exists for, and guessing which of two lists
 * of outcomes is right would be inventing content.
 *
 * @throws SyllabusEditError when it is the first topic and there is nothing above.
 */
export function mergeTopicUp(
  courses: SyllabusCourse[],
  courseId: string,
  topicId: string,
): SyllabusCourse[] {
  return onCourse(courses, courseId, (course) => {
    const at = indexOfTopic(course, topicId)
    if (at === 0) {
      throw new SyllabusEditError(
        `${course.topics[0]?.name ?? topicId} is the first topic, so there is nothing above it.`,
      )
    }
    const parent = course.topics[at - 1] as SyllabusTopic
    const child = course.topics[at] as SyllabusTopic

    let merged: SyllabusTopic = { ...parent, points: [...(parent.points ?? [])] }
    const moving = [child.text?.trim() || child.name, ...(child.points ?? []).map((p) => p.text)]
    for (const text of moving) {
      merged = {
        ...merged,
        points: [...(merged.points ?? []), { id: nextPointId(merged), text }],
      }
    }
    if (child.skills?.length) merged.skills = [...(merged.skills ?? []), ...child.skills]

    const topics = [...course.topics]
    topics.splice(at - 1, 2, merged)
    return { ...course, topics }
  })
}

/**
 * Break a topic in two at one of its content points.
 *
 * The inverse of the merge, for the case where the continuation rule fired on a
 * topic that genuinely opens with a list marker. The point becomes the heading of
 * a new topic sitting directly after, and every point below it moves across.
 *
 * The new topic copies the group and outcomes of the one it came out of, which is
 * what the reader would have given it had the document not run over a page.
 * Skills stay where they are: once merged, nothing records which side they came
 * from, and splitting them by guess would put a skill under the wrong topic.
 *
 * @throws SyllabusEditError when the point is the first one, which would leave the
 *   topic with a heading and nothing under it and change nothing else.
 */
export function splitTopic(
  courses: SyllabusCourse[],
  courseId: string,
  topicId: string,
  pointId: string,
): SyllabusCourse[] {
  return onCourse(courses, courseId, (course) => {
    const at = indexOfTopic(course, topicId)
    const topic = course.topics[at] as SyllabusTopic
    const points = topic.points ?? []
    const cut = points.findIndex((p) => p.id === pointId)
    if (cut < 0) throw new SyllabusEditError(`No content point ${pointId} in ${topic.name}.`)
    if (cut === 0) {
      throw new SyllabusEditError(
        `${points[0]?.text ?? pointId} is the first content point, so splitting here would ` +
          'leave the topic above it empty.',
      )
    }

    const heading = points[cut] as SyllabusPoint
    const kept: SyllabusTopic = { ...topic, points: points.slice(0, cut) }
    const id = nextTopicId(course)
    const fresh: SyllabusTopic = {
      id,
      name: heading.text,
      text: heading.text,
      outcomes: [...(topic.outcomes ?? [])],
      points: points.slice(cut + 1).map((p, i) => ({
        // Renumbered under their new topic. These ids are being minted here for
        // the first time under this parent, so nothing can already point at them.
        ...p,
        id: `${id}.${String(i + 1).padStart(2, '0')}`,
      })),
    }
    if (topic.group) fresh.group = topic.group

    const topics = [...course.topics]
    topics.splice(at, 1, kept, fresh)
    return { ...course, topics }
  })
}

/* --------------------------------------------------------- the content points */

export function editPoint(
  courses: SyllabusCourse[],
  courseId: string,
  topicId: string,
  pointId: string,
  text: string,
): SyllabusCourse[] {
  return onTopic(courses, courseId, topicId, (topic) => ({
    ...topic,
    points: (topic.points ?? []).map((p) => (p.id === pointId ? { ...p, text } : p)),
  }))
}

export function deletePoint(
  courses: SyllabusCourse[],
  courseId: string,
  topicId: string,
  pointId: string,
): SyllabusCourse[] {
  return onTopic(courses, courseId, topicId, (topic) => ({
    ...topic,
    points: (topic.points ?? []).filter((p) => p.id !== pointId),
  }))
}

/** Append a point the reader dropped. Its id goes past the end, never into a gap. */
export function addPoint(
  courses: SyllabusCourse[],
  courseId: string,
  topicId: string,
  text: string,
): SyllabusCourse[] {
  return onTopic(courses, courseId, topicId, (topic) => ({
    ...topic,
    points: [...(topic.points ?? []), { id: nextPointId(topic), text }],
  }))
}

/* --------------------------------------------------------------- the outcomes */

export function editOutcome(
  courses: SyllabusCourse[],
  courseId: string,
  code: string,
  text: string,
): SyllabusCourse[] {
  return onCourse(courses, courseId, (course) => ({
    ...course,
    outcomes: (course.outcomes ?? []).map((o) => (o.code === code ? { ...o, text } : o)),
  }))
}

/**
 * Change an outcome's code, and every topic that cites it with it.
 *
 * A code and its text arrive concatenated out of one paragraph and are pulled
 * apart by a pattern, so a code can come out wrong. Changing it in one place and
 * leaving the topics citing the old one would break the link between them without
 * saying so.
 */
export function setOutcomeCode(
  courses: SyllabusCourse[],
  courseId: string,
  code: string,
  to: string,
): SyllabusCourse[] {
  return onCourse(courses, courseId, (course) => ({
    ...course,
    outcomes: (course.outcomes ?? []).map((o) => (o.code === code ? { ...o, code: to } : o)),
    topics: course.topics.map((t) =>
      t.outcomes?.includes(code)
        ? { ...t, outcomes: t.outcomes.map((c) => (c === code ? to : c)) }
        : t,
    ),
  }))
}

/** Drop an outcome, and stop every topic citing a code the course no longer has. */
export function deleteOutcome(
  courses: SyllabusCourse[],
  courseId: string,
  code: string,
): SyllabusCourse[] {
  return onCourse(courses, courseId, (course) => ({
    ...course,
    outcomes: (course.outcomes ?? []).filter((o) => o.code !== code),
    topics: course.topics.map((t) =>
      t.outcomes?.includes(code) ? { ...t, outcomes: t.outcomes.filter((c) => c !== code) } : t,
    ),
  }))
}

/* ----------------------------------------------------------------- the skills */

/** Skills are plain strings with no ids of their own, so they are addressed by position. */
export function editSkill(
  courses: SyllabusCourse[],
  courseId: string,
  topicId: string,
  at: number,
  text: string,
): SyllabusCourse[] {
  return onTopic(courses, courseId, topicId, (topic) => ({
    ...topic,
    skills: (topic.skills ?? []).map((s, i) => (i === at ? text : s)),
  }))
}

export function deleteSkill(
  courses: SyllabusCourse[],
  courseId: string,
  topicId: string,
  at: number,
): SyllabusCourse[] {
  return onTopic(courses, courseId, topicId, (topic) => ({
    ...topic,
    skills: (topic.skills ?? []).filter((_s, i) => i !== at),
  }))
}

/* ------------------------------------------------------------------- checking */

/**
 * Trim every piece of text.
 *
 * Applied on the way to the file rather than on every keystroke, because trimming
 * as a teacher types takes the space away before they reach the next word.
 *
 * Nothing is dropped for being empty except a skill, which carries no id and is
 * referenced by nothing. An empty content point or outcome is reported by
 * `problemsWith` and blocks the save instead, so a line a teacher cleared by
 * accident is one they are told about rather than one that quietly goes.
 */
export function tidyCourses(courses: SyllabusCourse[]): SyllabusCourse[] {
  return courses.map((course) => {
    const out: SyllabusCourse = {
      ...course,
      name: course.name.trim(),
      topics: course.topics.map((topic) => {
        const kept: SyllabusTopic = {
          ...topic,
          name: topic.name.trim(),
          points: (topic.points ?? []).map((p) => ({ ...p, text: p.text.trim() })),
        }
        if (topic.group !== undefined) {
          const group = topic.group.trim()
          if (group) kept.group = group
          else delete kept.group
        }
        if (topic.skills) kept.skills = topic.skills.map((s) => s.trim()).filter(Boolean)
        return kept
      }),
    }
    if (course.outcomes) {
      out.outcomes = course.outcomes
        .map((o): SyllabusOutcome => ({ code: o.code.trim(), text: o.text.trim() }))
        .filter((o) => o.code !== '')
    }
    return out
  })
}

/* ------------------------------------------------------ replacing a model */

export interface Replacing {
  /** Ids the model in the folder has and the one on screen does not. */
  lost: string[]
  /** How many questions in the folder are tagged against one of them. */
  questions: number
  /** Which of the lost ids a question actually cites, in id order. */
  inUse: string[]
}

/**
 * What replacing the model in the folder would cost, counted rather than guessed.
 *
 * The screen used to tell a teacher that "questions tagged against it keep
 * working", which was true while a model was always a straight parse of a
 * document: the same file in, the same ids out. Corrections make it false, and a
 * re-read that quietly takes `PRE-04.07` away from every question tagged with it
 * is exactly the kind of damage nothing downstream notices (#44).
 *
 * Only an id the folder's model **has** and the new one **lacks** counts. An id
 * neither has changes nothing by being replaced, so counting it would raise a
 * false alarm about a question that was already tagged against something else.
 *
 * **Counted per course, not across the model** (#47). Where two courses share an
 * id, taking the model as one heap means a point deleted from Standard level
 * still looks present because Higher level kept it, and the screen tells a
 * teacher their questions are safe when the ones tagged against Standard level
 * are about to break. That is this function's own failure mode, so it is the one
 * place it may not be approximated.
 *
 * `inSyllabus` decides which questions are in scope, rather than a rule invented
 * here, because it is the reading the rest of the app already takes: a question
 * naming a different syllabus is out, and one naming none cannot be ruled out.
 * The same applies a level down to the course, which is why a question naming no
 * course is measured against what the model lost everywhere.
 */
export function costOfReplacing(
  inFolder: SyllabusCourse[],
  onScreen: SyllabusCourse[],
  questions: QuestionRef[],
  syllabusId: string,
): Replacing {
  const before = taggedIds(inFolder)
  const after = taggedIds(onScreen)

  // Every course the folder's model had gets an entry, empty ones included, so
  // "this course lost nothing" is distinguishable from "there is no such course".
  const lostByCourse = new Map<string, Set<string>>()
  for (const [courseId, had] of before.byCourse) {
    const kept = after.byCourse.get(courseId) ?? new Set<string>()
    lostByCourse.set(courseId, new Set([...had].filter((id) => !kept.has(id))))
  }

  // What a question naming no course is measured against: an id still somewhere
  // in the model has not been taken away from a question that never said where
  // it was looking.
  const lostEverywhere = new Set([...before.all].filter((id) => !after.all.has(id)))

  const inUse = new Set<string>()
  const lost = new Set<string>()
  for (const gone of lostByCourse.values()) for (const id of gone) lost.add(id)

  let count = 0
  for (const ref of questions) {
    if (!inSyllabus(ref, syllabusId)) continue
    const courseId = ref.question.syllabus?.courseId
    const gone =
      courseId !== undefined && lostByCourse.has(courseId)
        ? lostByCourse.get(courseId)!
        : lostEverywhere

    const cited = [...syllabusIdsOf(ref.question), ...(ref.question.outcomes ?? [])].filter((id) =>
      gone.has(id),
    )
    if (cited.length === 0) continue
    count += 1
    for (const id of cited) inUse.add(id)
  }

  return { lost: [...lost].sort(), questions: count, inUse: [...inUse].sort() }
}

/**
 * What would stop this being written as a syllabus model, in a teacher's terms.
 *
 * The schema requires at least one topic in every course, and a name, a point
 * text and an outcome code and text that are not empty. Klunk validates a bank
 * the same way, by restating the schema's rules rather than carrying a validator,
 * and for the same reason: a second dependency to say what a file already says.
 *
 * Positions rather than ids, because a topic with no name has nothing else a
 * teacher can find it by on the page.
 */
export function problemsWith(courses: SyllabusCourse[]): string[] {
  const problems: string[] = []

  for (const course of courses) {
    const where = course.name.trim() || course.id
    if (!course.name.trim()) problems.push('One of the courses has no name.')
    if (course.topics.length === 0) {
      problems.push(`${where} has no topics left. Every course needs at least one.`)
    }

    for (const [at, topic] of course.topics.entries()) {
      const named = topic.name.trim()
      if (!named) {
        problems.push(
          `Topic ${at + 1} of ${where} has no name. Type its heading in, or delete the topic.`,
        )
      }
      for (const [n, point] of (topic.points ?? []).entries()) {
        if (!point.text.trim()) {
          problems.push(
            `Content point ${n + 1} of "${named || `topic ${at + 1}`}" is empty. ` +
              'Type it in, or delete it.',
          )
        }
      }
    }

    for (const [at, outcome] of (course.outcomes ?? []).entries()) {
      if (!outcome.code.trim()) {
        problems.push(`Outcome ${at + 1} of ${where} has no code, such as H1.1.`)
      }
      if (!outcome.text.trim()) {
        problems.push(
          `Outcome ${outcome.code.trim() || at + 1} of ${where} has no wording after its code.`,
        )
      }
    }
  }

  return problems
}
