/**
 * What a syllabus document actually read as, topic by topic, and the means to
 * correct it before it is written.
 *
 * The screen this replaces was four numbers and a list of focus areas per course.
 * Counts do catch some faults, and both #14 and #26 first showed as one, but #26
 * is the case that matters: Textiles HSC read sixteen topics where the sixteenth
 * was a content point a page break had promoted to a heading. The count was right
 * while the content was wrong, and nothing on that screen could have shown it.
 *
 * So the reading surface is the collapsed list of topic names, which is where a
 * content point masquerading as a heading is obvious at a glance, and the detail
 * opens underneath it. Editing is a separate toggle rather than a permanent wall
 * of form fields, because the job here is to read this against the document on
 * the desk, and a page of textareas is a worse thing to read than a page of text.
 *
 * Every operation lives in `syllabusedit.ts` and is pure, so what this file holds
 * is which button calls which one.
 */

import { Fragment } from 'preact'
import { useState } from 'preact/hooks'
import { Field } from './fields'
import {
  addPoint,
  clearGroups,
  deleteOutcome,
  deletePoint,
  deleteSkill,
  deleteTopic,
  editOutcome,
  editPoint,
  editSkill,
  mergeTopicUp,
  renameCourse,
  renameTopic,
  setOutcomeCode,
  setTopicGroup,
  splitTopic,
} from './syllabusedit'
import type { SyllabusCourse, SyllabusTopic } from './types'

/**
 * One correction, applied to the whole model rather than to the course it is
 * shown under. A syllabus holds two courses and every operation takes the lot,
 * so a course-at-a-time signature would only mean stitching them back together
 * at every call.
 */
type Apply = (courses: SyllabusCourse[]) => SyllabusCourse[]

/**
 * How a correction is run, or `null` when the panel is only being read.
 *
 * Null rather than a no-op, so that every control which exists to change
 * something has to say what it does when nothing can be changed. A no-op would
 * leave the buttons on screen doing nothing.
 */
type Applier = ((fn: Apply, what: string) => void) | null

/**
 * How tall to make the box holding a content point.
 *
 * Drama and Visual Arts write their content as paragraphs rather than bullets, so
 * a fixed two rows cuts a point off mid-sentence and a teacher cannot read the
 * thing they are here to check. Chrome sizes these to their content through
 * `field-sizing` in the stylesheet; this is the estimate every other browser
 * falls back to.
 */
function linesFor(text: string): number {
  return Math.min(14, Math.max(2, Math.ceil(text.length / 85) + 1))
}

/**
 * The word to use for the division a topic sits under.
 *
 * A default is needed because a model saved before the word was recorded carries
 * none, and "Focus area" is what NESA calls it in every document but two. It is
 * only ever a fallback: where the reader knows, the reader says.
 */
export const DEFAULT_GROUP_LABEL = 'Focus area'

/** The same word mid-sentence, where it is not opening a label or a heading. */
export function lowerLabel(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1)
}

/**
 * More than one of them.
 *
 * Not `+ 's'`. Two of the four labels are noun phrases and English pluralises
 * the head noun, which in `Area of study` is the word before `of`: reading the
 * real Textiles document through this panel printed "Area of studys" over the
 * three areas it had just found. `Focus area` and `Theme` have their head noun
 * at the end and take the plural there.
 */
export function pluralLabel(label: string): string {
  const of = label.search(/\s+of\s+/i)
  return of === -1 ? `${label}s` : `${label.slice(0, of)}s${label.slice(of)}`
}

export function SyllabusReview({
  courses,
  suspects = [],
  groupLabel,
  onChange,
}: {
  courses: SyllabusCourse[]
  /**
   * Topic ids the reader is unsure about. Marked rather than merged, because the
   * markup that says so is reliable in one document and misleading in another.
   */
  suspects?: string[]
  /**
   * What this document calls a division. Empty for a model that predates the
   * field, or one whose reader had no evidence.
   */
  groupLabel?: string
  /**
   * The corrected courses, with what was done to them for the list of changes.
   *
   * Omitted to read a model rather than correct one (#76). The reading half of
   * this panel is the same either way, and a second component rendering the
   * same topics read-only is how the two quietly stop agreeing about what a
   * topic looks like.
   */
  onChange?: ((courses: SyllabusCourse[], what: string) => void) | undefined
}) {
  // An operation that cannot be done says so here. The buttons that would always
  // refuse are not offered at all, so this is for the ones that depend on what is
  // left, such as deleting the last topic a course has.
  const [refused, setRefused] = useState('')
  const label = groupLabel?.trim() || DEFAULT_GROUP_LABEL

  const apply: Applier | null = onChange
    ? (fn, what) => {
        setRefused('')
        try {
          onChange(fn(courses), what)
        } catch (err) {
          setRefused((err as Error).message)
        }
      }
    : null

  return (
    <>
      {refused && (
        <div class="panel panel--alert">
          <p>{refused}</p>
        </div>
      )}

      {courses.map((course) => (
        <CourseReview
          key={course.id}
          course={course}
          suspects={suspects}
          label={label}
          apply={apply}
        />
      ))}
    </>
  )
}

function CourseReview({
  course,
  suspects,
  label,
  apply,
}: {
  course: SyllabusCourse
  suspects: string[]
  /** The document's word for a division, already resolved to a real one. */
  label: string
  apply: Applier
}) {
  const [open, setOpen] = useState<string[]>([])
  const [showOutcomes, setShowOutcomes] = useState(false)
  const grouped = course.topics.filter((t) => t.group).length
  const points = course.topics.reduce((n, t) => n + (t.points?.length ?? 0), 0)

  const toggle = (id: string) =>
    setOpen((was) => (was.includes(id) ? was.filter((x) => x !== id) : [...was, id]))

  return (
    <section class="panel">
      <div class="review__head">
        {apply ? (
          <Field label="Course" for={`rv-${course.id}`} hint="As it will appear in the topic lists">
            <input
              id={`rv-${course.id}`}
              class="input"
              value={course.name}
              onInput={(e) =>
                apply(
                  (all) => renameCourse(all, course.id, (e.target as HTMLInputElement).value),
                  `Renamed the course to ${(e.target as HTMLInputElement).value}`,
                )
              }
            />
          </Field>
        ) : (
          <h3 class="review__course">{course.name}</h3>
        )}
        <p class="det__label review__counts">
          {course.topics.length} topic{course.topics.length === 1 ? '' : 's'} · {points} content
          point{points === 1 ? '' : 's'} · {course.outcomes?.length ?? 0} outcome
          {course.outcomes?.length === 1 ? '' : 's'}
        </p>
      </div>

      <div class="rowbtns">
        <button
          class="btn btn--small"
          onClick={() => setOpen(open.length === 0 ? course.topics.map((t) => t.id) : [])}
        >
          {open.length === 0 ? 'Open every topic' : 'Close every topic'}
        </button>
        <button class="btn btn--small" onClick={() => setShowOutcomes(!showOutcomes)}>
          {showOutcomes ? 'Hide the outcomes' : `Show the ${course.outcomes?.length ?? 0} outcomes`}
        </button>
        {grouped > 0 && apply && (
          <button
            class="btn btn--small"
            onClick={() =>
              apply(
                (all) => clearGroups(all, course.id),
                `Cleared the ${lowerLabel(label)} on ${grouped} topics of ${course.name}`,
              )
            }
          >
            Clear the {lowerLabel(label)} on all {grouped} topics
          </button>
        )}
      </div>

      {showOutcomes && !apply && (
        <div class="det">
          <ul class="plain review__readoutcomes">
            {(course.outcomes ?? []).map((outcome) => (
              <li key={outcome.code}>
                <span class="mono review__pid">{outcome.code}</span>
                <span>{outcome.text}</span>
              </li>
            ))}
            {(course.outcomes ?? []).length === 0 && (
              <li class="muted">
                This syllabus sets its outcomes against the course as a whole rather than
                   against each topic, so the model carries none.
              </li>
            )}
          </ul>
        </div>
      )}

      {showOutcomes && apply && (
        <div class="det">
          <p class="hint">
            Deleting an outcome here also takes it off every topic that lists it.
          </p>
          <ul class="plain review__outcomes">
            {(course.outcomes ?? []).map((outcome) => (
              <li key={outcome.code}>
                <input
                  class="input mono review__code"
                  value={outcome.code}
                  aria-label={`Code for outcome ${outcome.code}`}
                  onInput={(e) =>
                    apply(
                      (all) =>
                        setOutcomeCode(
                          all,
                          course.id,
                          outcome.code,
                          (e.target as HTMLInputElement).value,
                        ),
                      `Changed the outcome code ${outcome.code}`,
                    )
                  }
                />
                <textarea
                  class="input"
                  rows={linesFor(outcome.text)}
                  value={outcome.text}
                  aria-label={`Wording of outcome ${outcome.code}`}
                  onInput={(e) =>
                    apply(
                      (all) =>
                        editOutcome(
                          all,
                          course.id,
                          outcome.code,
                          (e.target as HTMLTextAreaElement).value,
                        ),
                      `Reworded outcome ${outcome.code}`,
                    )
                  }
                />
                <button
                  class="btn btn--small"
                  onClick={() =>
                    apply(
                      (all) => deleteOutcome(all, course.id, outcome.code),
                      `Deleted outcome ${outcome.code}`,
                    )
                  }
                >
                  Delete
                </button>
              </li>
            ))}
            {(course.outcomes ?? []).length === 0 && (
              <li class="muted">Klunk found no outcomes for this course.</li>
            )}
          </ul>
        </div>
      )}

      <ul class="qlist">
        {course.topics.map((topic, at) => (
          <Fragment key={topic.id}>
            {/* The area as a heading over its topics rather than as a prefix on
                each of them. Computing Technology 7–10 is six focus areas
                holding the same four topic names, so a flat list of this
                course reads as "Identifying and defining" six times over and
                the one thing that tells them apart is the one thing missing.
                A prefix would say it, at the cost of repeating seventy
                characters on every row of the list this panel exists to be
                read (#75). */}
            {topic.group && topic.group !== course.topics[at - 1]?.group && (
              <li class="review__area">
                <span class="det__label">{label}</span>
                {topic.group}
              </li>
            )}
            <TopicRow
              course={course}
              topic={topic}
              at={at}
              label={label}
              suspect={suspects.includes(topic.id)}
              open={open.includes(topic.id)}
              onToggle={() => toggle(topic.id)}
              apply={apply}
            />
          </Fragment>
        ))}
      </ul>
    </section>
  )
}

function TopicRow({
  course,
  topic,
  at,
  label,
  suspect,
  open,
  onToggle,
  apply,
}: {
  course: SyllabusCourse
  topic: SyllabusTopic
  at: number
  label: string
  /** The reader thinks this heading may be a content point of the topic above. */
  suspect: boolean
  open: boolean
  onToggle: () => void
  apply: Applier
}) {
  const [fixing, setFixing] = useState(false)
  const points = topic.points ?? []
  const skills = topic.skills ?? []
  // The published heading, where it is not what the name says. This is the line a
  // teacher compares against the page, so it is worth its own row when the two
  // differ and worth nothing when they do not.
  const verbatim = topic.text?.trim() !== topic.name.trim() ? topic.text?.trim() : ''

  return (
    <li class={`qrow ${open ? 'qrow--open' : ''}`}>
      <button class="qrow__head" onClick={onToggle}>
        <span class="qrow__marks">{at + 1}</span>
        <span class="qrow__stem">
          {topic.name.trim() || <span class="muted">This topic has no name</span>}
        </span>
        <span class="qrow__tail">
          {suspect && <span class="chip chip--flag">check this one</span>}
          <span class="muted review__meta">
            {points.length} point{points.length === 1 ? '' : 's'}
          </span>
          <span class="qrow__caret">›</span>
        </span>
      </button>

      {open && (
        <div class="qrow__detail">
          <p class="det__label">
            <span class="mono">{topic.id}</span>
            {topic.group && ` · ${topic.group}`}
            {(topic.outcomes ?? []).length > 0 && ` · ${(topic.outcomes ?? []).join(', ')}`}
          </p>

          {suspect && (
            <p class="review__suspect">
              In the document this line is set as a bullet, not as a heading, and it starts a
                 fresh page. That is what a topic looks like when it runs past the bottom of a
                 page and carries on overleaf, so this may belong to{' '}
              {at > 0 ? `"${course.topics[at - 1]?.name}"` : 'the topic above'} rather than
                 standing on its own. Read it against the document, and use Join to the topic
                 above if it does.
            </p>
          )}

          {verbatim && (
            <p class="review__verbatim">
              In the syllabus this heading reads <q>{verbatim}</q>.
            </p>
          )}

          {fixing && apply ? (
            <FixTopic
              course={course}
              topic={topic}
              label={label}
              first={at === 0}
              onDone={() => setFixing(false)}
              apply={apply}
            />
          ) : (
            <>
              {points.length > 0 ? (
                <ol class="review__points">
                  {points.map((point) => (
                    <li key={point.id}>
                      <span class="mono review__pid">{point.id}</span>
                      <span>{point.text}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p class="muted">
                  This topic has no content points, so a question tags itself against the topic
                     itself.
                </p>
              )}

              {skills.length > 0 && (
                <div class="det">
                  <p class="det__label">Students learn to</p>
                  <ul class="plain review__skills">
                    {skills.map((skill, n) => (
                      <li key={n}>{skill}</li>
                    ))}
                  </ul>
                </div>
              )}

              {apply && (
                <div class="rowbtns">
                  <button class="btn btn--small" onClick={() => setFixing(true)}>
                    Fix this topic
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * The same topic with its text in fields.
 *
 * Every button here names what it does to this topic. "Join to the topic above"
 * is the #26 correction and "Make this a new topic" is the same rule firing on a
 * topic that genuinely opens with a list marker.
 */
function FixTopic({
  course,
  topic,
  label,
  first,
  onDone,
  apply,
}: {
  course: SyllabusCourse
  topic: SyllabusTopic
  label: string
  first: boolean
  onDone: () => void
  apply: (fn: Apply, what: string) => void
}) {
  const points = topic.points ?? []
  const skills = topic.skills ?? []
  const name = topic.name.trim() || topic.id

  return (
    <div class="review__fix">
      <div class="fieldrow">
        <Field label="Topic heading" for={`fx-${topic.id}-name`}>
          <input
            id={`fx-${topic.id}-name`}
            class="input"
            value={topic.name}
            onInput={(e) =>
              apply(
                (all) =>
                  renameTopic(
                    all,
                    course.id,
                    topic.id,
                    (e.target as HTMLInputElement).value,
                  ),
                `Renamed ${topic.id}`,
              )
            }
          />
        </Field>

        <Field
          label={label}
          for={`fx-${topic.id}-group`}
          hint={`Leave it blank if the syllabus does not divide this course into ${pluralLabel(lowerLabel(label))}.`}
        >
          <input
            id={`fx-${topic.id}-group`}
            class="input"
            value={topic.group ?? ''}
            onInput={(e) =>
              apply(
                (all) =>
                  setTopicGroup(
                    all,
                    course.id,
                    topic.id,
                    (e.target as HTMLInputElement).value,
                  ),
                `Set the ${lowerLabel(label)} on ${topic.id}`,
              )
            }
          />
        </Field>
      </div>

      <p class="det__label">Content points</p>
      <ul class="plain review__editpoints">
        {points.map((point, n) => (
          <li key={point.id}>
            <span class="mono review__pid">{point.id}</span>
            <textarea
              class="input"
              rows={linesFor(point.text)}
              value={point.text}
              aria-label={`Content point ${point.id}`}
              onInput={(e) =>
                apply(
                  (all) =>
                    editPoint(
                      all,
                      course.id,
                      topic.id,
                      point.id,
                      (e.target as HTMLTextAreaElement).value,
                    ),
                  `Reworded ${point.id}`,
                )
              }
            />
            <span class="review__pbtns">
              {n > 0 && (
                <button
                  class="btn btn--small"
                  title="This point is a topic heading the reader missed"
                  onClick={() =>
                    apply(
                      (all) => splitTopic(all, course.id, topic.id, point.id),
                      `Made ${point.id} a topic of its own`,
                    )
                  }
                >
                  Make this a new topic
                </button>
              )}
              <button
                class="btn btn--small"
                onClick={() =>
                  apply(
                    (all) => deletePoint(all, course.id, topic.id, point.id),
                    `Deleted ${point.id}`,
                  )
                }
              >
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>

      <div class="rowbtns">
        <button
          class="btn btn--small"
          onClick={() =>
            apply(
              (all) => addPoint(all, course.id, topic.id, ''),
              `Added a content point to ${topic.id}`,
            )
          }
        >
          Add a content point
        </button>
      </div>

      {skills.length > 0 && (
        <>
          <p class="det__label">Students learn to</p>
          <ul class="plain review__editpoints">
            {skills.map((skill, n) => (
              <li key={n}>
                <textarea
                  class="input"
                  rows={linesFor(skill)}
                  value={skill}
                  aria-label={`Skill ${n + 1} of ${name}`}
                  onInput={(e) =>
                    apply(
                      (all) =>
                        editSkill(
                          all,
                          course.id,
                          topic.id,
                          n,
                          (e.target as HTMLTextAreaElement).value,
                        ),
                      `Reworded a skill under ${topic.id}`,
                    )
                  }
                />
                <span class="review__pbtns">
                  <button
                    class="btn btn--small"
                    onClick={() =>
                      apply(
                        (all) => deleteSkill(all, course.id, topic.id, n),
                        `Deleted a skill under ${topic.id}`,
                      )
                    }
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div class="rowbtns review__fixbtns">
        <button class="btn btn--small" onClick={onDone}>
          Done with this topic
        </button>
        {!first && (
          <button
            class="btn btn--small"
            title="This heading is really a content point of the topic above"
            onClick={() =>
              apply(
                (all) => mergeTopicUp(all, course.id, topic.id),
                `Joined ${topic.id} to the topic above it`,
              )
            }
          >
            Join to the topic above
          </button>
        )}
        <button
          class="btn btn--small"
          onClick={() =>
            apply((all) => deleteTopic(all, course.id, topic.id), `Deleted ${topic.id}`)
          }
        >
          Delete this topic
        </button>
      </div>
    </div>
  )
}
