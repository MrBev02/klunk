/**
 * Showing a teacher what a question actually is.
 *
 * A stem on its own is not enough to judge a question by. Whether the
 * distractors are plausible, whether the criteria add up to the marks, whether
 * the sample answer is the standard you meant: all of that decides if the
 * question earns a place on the paper, and none of it is visible from the first
 * line. Printing the paper to find out is a slow way to answer a fast question.
 *
 * So this shows the whole thing, marking guide included, inline.
 */

import { useState } from 'preact/hooks'
import { unresolvedAgainst, type ModelIds } from './modelcheck'
import {
  optionLetter,
  rowAnswers,
  shuffledChoices,
  shuffledMatching,
  shuffledResponses,
} from './paper'
import { markRange } from './render'
import { Inline, RichText } from './richtext'
import { joinPath } from './storage'
import type { Stimulus } from './types'
import {
  QUESTION_TYPE_LABELS,
  alignOf,
  questionLabel,
  type Question,
  type QuestionRef,
  type QuestionType,
} from './types'
import { hasGuide, looksBanded, needsGuide } from './validate'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export function QuestionRow({
  item,
  index = 0,
  action,
  images,
  known,
}: {
  item: QuestionRef
  index?: number
  action?: preact.ComponentChildren
  /** Stimulus images by folder path, so a question can show its picture. */
  images?: Map<string, string> | undefined
  /**
   * Every id the syllabus this question names defines, when that model is in the
   * folder. Absent means Klunk cannot tell, and nothing is marked.
   */
  known?: ModelIds | undefined
}) {
  const [open, setOpen] = useState(false)
  const q = item.question

  return (
    <li
      class={`qrow ${open ? 'qrow--open' : ''}`}
      /* Capped hard. Fourteen rows at 18ms each plus a 320ms fade meant the
         list was still blank most of a second after load, which reads as a
         broken app rather than a composed one. */
      style={{ animationDelay: `${Math.min(index, 6) * 10}ms` }}
    >
      <button
        class="qrow__head"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={open ? 'Hide detail' : 'Show detail, answers and marking guide'}
      >
        <span class="qrow__marks">
          {q.marks}
          <span class="muted">m</span>
        </span>
        <span class="qrow__stem">{questionLabel(q)}</span>
        <span class="qrow__tail">
          <span class="chip chip--type">{shortType(q)}</span>
          {q.source?.origin && q.source.origin !== 'authored' && (
            <span class="chip chip--flag" title={sourceLabel(q)}>
              {q.source.year ?? q.source.origin}
            </span>
          )}
          <span class="qrow__caret">›</span>
        </span>
      </button>

      {open && (
        <div class="qrow__detail">
          {/* The collapsed row above already shows the stem, so repeating it
              here just pushed the answers further down the screen. */}
          <QuestionDetail
            question={q}
            showStem={false}
            bankFile={item.file}
            images={images}
            known={known}
          />
          <p class="det__label" style={{ marginTop: '0.9rem' }}>
            <span class="mono">{item.file}</span> · <span class="mono">{q.id}</span>
          </p>
          {action}
        </div>
      )}
    </li>
  )
}

export function QuestionDetail({
  question: q,
  showStem = true,
  bankFile,
  images,
  known,
}: {
  question: Question
  showStem?: boolean
  /** Where the question lives, since a stimulus path is relative to its bank. */
  bankFile?: string | undefined
  images?: Map<string, string> | undefined
  /**
   * Every id the syllabus this question names defines, when that model is in the
   * folder. Absent means Klunk cannot tell, and nothing is marked.
   */
  known?: ModelIds | undefined
}) {
  return (
    <>
      {showStem &&
        (q.questionText.trim() ? (
          <RichText text={q.questionText} class="det__stem" />
        ) : (
          <p class="det__stem">{questionLabel(q)}</p>
        ))}

      {q.stimulus?.length ? (
        <div class="det">
          <p class="det__label">Stimulus</p>
          <StimulusItems items={q.stimulus} bankFile={bankFile} images={images} />
        </div>
      ) : null}

      <Body question={q} bankFile={bankFile} images={images} />
      <Guide question={q} />
      <Tags question={q} known={known} />
    </>
  )
}

/**
 * A list of stimulus entries as they read on screen.
 *
 * One component for the question's and for a part's, so the two cannot come to
 * show a picture differently — which would make the panel a worse guide to what
 * prints than the paper itself.
 */
function StimulusItems({
  items,
  bankFile,
  images,
}: {
  items: Stimulus[]
  bankFile: string | undefined
  images: Map<string, string> | undefined
}) {
  return (
    <>
      {items.map((s, i) =>
        s.kind === 'text' ? (
          <p key={i} class="sample">
            <Inline text={s.text ?? ''} />
            {s.caption && <em>. {s.caption}</em>}
          </p>
        ) : imageUrl(s, bankFile, images) ? (
          // The alignment shows here too, because otherwise the only way to see
          // what the field did is to print the paper.
          <figure key={i} class={`stim-figure stim-figure--${alignOf(s)}`}>
            <img src={imageUrl(s, bankFile, images)} alt={s.alt ?? ''} />
            {s.caption && <figcaption>{s.caption}</figcaption>}
          </figure>
        ) : (
          <p key={i} class="stim-note">
            Image: <span class="mono">{s.file ?? 'unnamed'}</span>
            {s.alt ? `. ${s.alt}` : ''}
            {s.caption ? ` (${s.caption})` : ''}
          </p>
        ),
      )}
    </>
  )
}

function Body({
  question: q,
  bankFile,
  images,
}: {
  question: Question
  /** Both only for a part's pictures; the question's are shown above this. */
  bankFile?: string | undefined
  images?: Map<string, string> | undefined
}) {
  switch (q.questionType) {
    case 'multiple_choice': {
      const { choices, correctIndex, known } = shuffledChoices(q)
      return (
        <div class="det">
          <p class="det__label">
            Options, in the order they will print
            {known ? '' : ' · no answer recorded'}
          </p>
          <ul class="opts">
            {choices.map((c, i) => (
              <li key={i} class={i === correctIndex ? 'is-correct' : ''}>
                <span class="opts__letter">{LETTERS[i]}</span>
                <span>
                  <Inline text={c.text} />
                  {i === correctIndex && <strong class="muted"> (correct)</strong>}
                </span>
                {c.feedback && (
                  <span class="opts__why">
                    <Inline text={c.feedback} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )
    }

    case 'true_false':
      return (
        <div class="det">
          <p class="det__label">Answer</p>
          <p>
            <strong>{q.config?.correctAnswer === true ? 'TRUE' : 'FALSE'}</strong>
          </p>
          {(q.config?.feedbackTrue || q.config?.feedbackFalse) && (
            <table class="crit">
              <tbody>
                {q.config?.feedbackTrue && (
                  <tr>
                    <td>
                      If true: <Inline text={q.config.feedbackTrue} />
                    </td>
                  </tr>
                )}
                {q.config?.feedbackFalse && (
                  <tr>
                    <td>
                      If false: <Inline text={q.config.feedbackFalse} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )

    case 'multiple_response': {
      const { choices, correctIndexes, known } = shuffledResponses(q)
      const isAnswer = new Set(correctIndexes)
      return (
        <div class="det">
          <p class="det__label">
            Options, in the order they will print
            {known ? '' : ' · no answers recorded'}
          </p>
          <ul class="opts">
            {choices.map((c, i) => (
              <li key={i} class={isAnswer.has(i) ? 'is-correct' : ''}>
                <span class="opts__letter">{optionLetter(i)}</span>
                <span>
                  <Inline text={c.text} />
                  {isAnswer.has(i) && <strong class="muted"> (an answer)</strong>}
                </span>
                {c.feedback && (
                  <span class="opts__why">
                    <Inline text={c.feedback} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )
    }

    /*
     * The same table `render.tsx` prints, in screen units.
     *
     * Two faults got it here. It began as a `minitable` of the numbered column
     * above an `opts` list of the lettered one: two visual forms for the two
     * halves of one pairing, so nothing said the halves belonged together or
     * that a line is drawn between them, and a single digit was stretched
     * across a third of the width. Side-by-side columns fixed that and left
     * the real one — the halves have to align **row for row**, which is what
     * the examination does and what says which box a line runs between.
     *
     * #76 settled the general form of this for the syllabus panel: two
     * renderings of one thing are how the two stop agreeing about what the
     * thing looks like. Screen and print keep separate stylesheets here, as
     * `answertable` and `minitable` already do, but the markup is the same
     * shape on purpose.
     */
    case 'matching': {
      const { items, options, known } = shuffledMatching(q)
      return (
        <div class="det">
          <p class="det__label">
            The two columns, as they will print{known ? '' : ' · no links recorded'}
          </p>
          <div class="matchdet">
            <table class="matchdet__table">
              <tbody>
                {Array.from({ length: Math.max(items.length, options.length) }, (_, i) => {
                  const item = items[i]
                  const option = options[i]
                  return (
                    <tr key={i}>
                      {item ? (
                        <>
                          <td class="matchdet__key">{i + 1}</td>
                          <td class="matchdet__cell">
                            <Inline text={item.text} />
                          </td>
                        </>
                      ) : (
                        <>
                          <td class="matchdet__none" />
                          <td class="matchdet__none" />
                        </>
                      )}
                      {/* Only where there is an answer to show. A dash in every
                          row is a column of nothing pretending to be one. */}
                      {known && <td class="matchdet__answer">{item?.letters.join(', ') || '–'}</td>}
                      <td class="matchdet__gap" />
                      {option ? (
                        <>
                          <td class="matchdet__key">{optionLetter(i)}</td>
                          <td class="matchdet__cell">
                            <Inline text={option.text} />
                          </td>
                        </>
                      ) : (
                        <>
                          <td class="matchdet__none" />
                          <td class="matchdet__none" />
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    case 'table': {
      const cols = q.config?.columns ?? []
      const rows = q.config?.rows ?? []
      return (
        <div class="det">
          <p class="det__label">Table, with the expected answers</p>
          <table class="minitable">
            <thead>
              <tr>
                {cols.map((c, i) => (
                  <th key={i}>
                    <Inline text={c} />
                  </th>
                ))}
                <th>Marks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <Inline text={r.label} />
                  </td>
                  {cols.slice(1).map((_, j) => (
                    <td key={j}>
                      <Inline text={rowAnswers(r, j).join(' / ')} />
                    </td>
                  ))}
                  <td class="mono">{r.marks ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    case 'drawing': {
      const [w, h] = q.config?.spaceMm ?? [160, 90]
      return (
        <div class="det">
          <p class="det__label">Drawing task</p>
          {q.config?.instructions && (
            <p>
              <Inline text={q.config.instructions} />
            </p>
          )}
          <p class="muted">
            {q.config?.subtype ?? 'sketch'} · {w}mm × {h}mm of space
            {q.config?.grid ? ' · gridded' : ''}
          </p>
        </div>
      )
    }

    default: {
      const parts = q.config?.parts
      if (!parts?.length) return null
      const sum = parts.reduce((t, p) => t + p.marks, 0)
      return (
        <div class="det">
          <p class="det__label">
            Parts
            {sum !== q.marks && (
              <span class="missing">
                {' '}
                (these total {sum}, not {q.marks})
              </span>
            )}
          </p>
          <ul class="parts-list">
            {parts.map((p, i) => (
              <li key={i}>
                <span class="parts-list__label">{p.label}</span>
                <span>
                  <Inline text={p.text} />
                </span>
                <span class="parts-list__marks">{p.marks}m</span>
                {p.stimulus?.length ? (
                  <div class="parts-list__stim">
                    <StimulusItems items={p.stimulus} bankFile={bankFile} images={images} />
                  </div>
                ) : null}
                {p.sampleAnswer && (
                  <p class="parts-list__sample">
                    <Inline text={p.sampleAnswer} />
                  </p>
                )}
                {p.criteria?.length ? (
                  <table class="crit crit--part">
                    <tbody>
                      {p.criteria.map((c, j) => (
                        <tr key={j}>
                          <td>
                            <Inline text={c.description} />
                          </td>
                          <td>{markRange(c)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )
    }
  }
}

/**
 * The picture itself where it can be found, and its filename where it cannot.
 *
 * Showing only the filename was tolerable while every image was one a teacher
 * had chosen and could picture from its name. Klunk now cuts pictures out of
 * past papers by itself, and a teacher checking fifteen of those needs to see
 * what was cut.
 */
function imageUrl(
  s: Stimulus,
  bankFile: string | undefined,
  images: Map<string, string> | undefined,
): string | undefined {
  if (s.kind !== 'image' || !s.file || !bankFile || !images) return undefined
  return images.get(joinPath(bankFile, s.file))
}

function Guide({ question: q }: { question: Question }) {
  const g = q.markingGuide
  if (
    !g ||
    (!g.criteria?.length && !g.sampleAnswer && !g.answersCouldInclude?.length && !g.notes)
  ) {
    // A question marked part by part keeps everything on its parts, which the
    // parts list has already shown. Asking for criteria directly underneath a
    // table of them is the kind of nagging that teaches a teacher to ignore
    // every warning Klunk gives.
    if (hasGuide(q)) return null
    if (needsGuide(q.questionType)) {
      return (
        <div class="det">
          <p class="det__label">Marking guide</p>
          <p class="muted">
            None yet. A {QUESTION_TYPE_LABELS[q.questionType].toLowerCase()} worth {q.marks} marks
            is hard to mark consistently without criteria.
          </p>
        </div>
      )
    }
    return null
  }

  const sum = g.criteria?.reduce((t, c) => t + c.marks, 0)

  return (
    <div class="det">
      {/* Sample answer before the criteria, matching the printed guide. A table
          of marks says how to score a response; it does not say what a response
          worth those marks looks like. */}
      {g.sampleAnswer && (
        <>
          <p class="det__label">Sample answer</p>
          <p class="sample">
            <Inline text={g.sampleAnswer} />
          </p>
        </>
      )}

      {g.criteria?.length ? (
        <>
          <p class="det__label" style={{ marginTop: g.sampleAnswer ? '0.7rem' : '0' }}>
            Marking criteria
          </p>
          <table class="crit">
            <tbody>
              {g.criteria.map((c, i) => (
                <tr key={i}>
                  <td>
                    <Inline text={c.description} />
                  </td>
                  <td>{markRange(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Banded criteria describe alternatives, so only flag a mismatch when
              the criteria read as additive components. */}
          {sum !== undefined && sum !== q.marks && !looksBanded(g.criteria ?? []) && (
            <p class="missing">
              Criteria total {sum}, but the question is worth {q.marks}.
            </p>
          )}
        </>
      ) : null}

      {/* It prints on the marking guide and had nowhere to be read before
          saving, which is this screen's one rule. Nothing populated it until
          #94: `guide.ts` puts the whole `Answers could include:` block into the
          sample answer as one paragraph, and an AI transcription returns it as
          the list the guide prints. */}
      {g.answersCouldInclude?.length ? (
        <>
          <p class="det__label" style={{ marginTop: '0.7rem' }}>
            Answers could include
          </p>
          <ul class="plain">
            {g.answersCouldInclude.map((point, i) => (
              <li key={i}>
                <Inline text={point} />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {g.notes && (
        <p class="muted">
          <Inline text={g.notes} />
        </p>
      )}
    </div>
  )
}

function Tags({ question: q, known }: { question: Question; known?: ModelIds | undefined }) {
  const topics = q.syllabus?.topicIds ?? []
  const points = q.syllabus?.pointIds ?? []
  const outcomes = q.outcomes ?? []
  const tags = q.tags ?? []

  // Only where the model this question names is actually in the folder. Klunk
  // ships none, so a bank naming one the teacher has not generated is ordinary
  // and every chip would otherwise read as broken (#44).
  const dead = known ? unresolvedAgainst(q, known) : []
  const chip = (id: string) => (dead.includes(id) ? 'chip chip--dead' : 'chip')

  return (
    <div class="det">
      <div class="tagrow">
        <span class="chip">{QUESTION_TYPE_LABELS[q.questionType]}</span>
        {q.difficulty && <span class="chip">difficulty {q.difficulty}</span>}
        {topics.concat(points).map((id) => (
          <span key={id} class={chip(id)}>
            {id}
          </span>
        ))}
        {outcomes.map((o) => (
          <span key={o} class={chip(o)}>
            {o}
          </span>
        ))}
        {tags.map((t) => (
          <span key={t} class="chip">
            {t}
          </span>
        ))}
        {topics.length + points.length === 0 && (
          <span class="chip chip--flag">not tagged to the syllabus</span>
        )}
      </div>
      {dead.length > 0 && (
        <p class="tagrow__dead">
          {dead.length === 1 ? 'The struck-through tag is' : 'The struck-through tags are'} not in
          this syllabus any more, so this question will not show as covering anything under
          {dead.length === 1 ? ' it' : ' them'}. Open the question and tag it again.
        </p>
      )}
      {q.source?.origin && q.source.origin !== 'authored' && (
        <p class="muted" style={{ marginTop: '0.4rem', fontSize: '0.85rem' }}>
          {sourceLabel(q)}
        </p>
      )}
    </div>
  )
}

/* --------------------------------------------------------------------- utils */

/*
 * `Record<QuestionType, string>` rather than `Record<string, string>` with a
 * fallback, which is what this was: a type added to the list printed its own
 * `multiple_response` in the builder's rail, past the typechecker and past every
 * test, and was only visible on screen.
 *
 * `MC` and `T/F` are abbreviations teachers already write on a mark sheet.
 * There is no such shorthand for the other two, so they get a word.
 */
export function shortType(q: Question): string {
  const map: Record<QuestionType, string> = {
    multiple_choice: 'MC',
    multiple_response: 'multi',
    matching: 'match',
    true_false: 'T/F',
    short_answer: 'short',
    extended_response: 'extended',
    table: 'table',
    drawing: 'drawing',
  }
  return map[q.questionType]
}

export function sourceLabel(q: Question): string {
  const s = q.source
  if (!s) return ''
  const bits = [s.origin, s.paper, s.year?.toString(), s.questionNumber].filter(Boolean)
  return bits.join(' · ')
}
