/**
 * The printed paper.
 *
 * Klunk renders HTML and lets the browser print it to PDF. That is the same
 * thing a headless browser would do, minus the install, and it means the
 * teacher sees on screen exactly what comes out of the printer.
 *
 * Two renderings of the same paper: the student version, which carries answer
 * space and no answers, and the marking guide, which carries the answers,
 * criteria and sample responses. They share numbering and, critically, option
 * letters.
 */

import { Fragment } from 'preact'
import { coverModel, minutes, type CoverField, type CoverModel } from './cover'
import {
  answerLinesFor,
  rowAnswers,
  shuffledChoices,
  type ResolvedPaper,
  type ResolvedQuestion,
} from './paper'
import { joinPath } from './storage'
import type { MarkCriterion, Profile, Question, Stimulus } from './types'

export type PrintMode = 'paper' | 'guide'

export function PrintablePaper({
  resolved,
  mode,
}: {
  resolved: ResolvedPaper
  mode: PrintMode
}) {
  const { paper, profile } = resolved
  const cover = coverModel(resolved, mode === 'guide')

  const running = cover.everyPage.length > 0

  const body = (
    <>
      <Cover cover={cover} />

      {resolved.sections.map((section, i) => (
        <section class="sheet__section" key={i}>
          <header class="sheet__sectionhead">
            <h2>{section.title}</h2>
            <p class="sheet__sectionmarks">
              {section.marks} mark{section.marks === 1 ? '' : 's'}
            </p>
            {section.profileSection?.suggestedMinutes && (
              <p class="sheet__hint">
                Allow about {section.profileSection.suggestedMinutes} minutes for this section
              </p>
            )}
            {section.instructions && <p class="sheet__hint">{section.instructions}</p>}
            {section.subtitle && <p class="sheet__hint">{section.subtitle}</p>}
          </header>

          {section.questions.map((q, qi) => (
            <Fragment key={`${q.file}#${q.question.id}`}>
              {/* Between alternatives, never before the first. This is what a
                  choice section prints, and without it six questions read as
                  six questions to answer.

                  Before the group heading and not after it: the OR closes the
                  question above, and the heading opens the pair below. Printed
                  the other way round it reads as an alternative to the heading,
                  which is how the examination does not print it. */}
              {section.chooseCount !== undefined && qi > 0 && <p class="sheet__or">OR</p>}

              {/* A heading only where the paper starts a new group, so the
                  three pairs of alternatives print under Practice, Conceptual
                  Framework and Frames rather than as a run of six. */}
              {q.group && q.group !== section.questions[qi - 1]?.group && (
                <h3 class="sheet__group">{q.group}</h3>
              )}

              <QuestionBlock
                item={q}
                mode={mode}
                profile={profile}
                images={resolved.images}
              />
            </Fragment>
          ))}
        </section>
      ))}

      <footer class="sheet__end">End of paper</footer>

      {mode === 'guide' && paper.notes && (
        <section class="sheet__notes">
          <h2>Notes</h2>
          <p>{paper.notes}</p>
        </section>
      )}
    </>
  )

  return (
    <article class={`sheet sheet--${mode}`}>
      {running ? (
        // A table, purely so its header repeats.
        //
        // Browsers have no running headers in print. `position: fixed` does
        // repeat on every page in Chrome, and it was tried first, but it cannot
        // reserve the space it occupies: a fixed element's containing block is
        // the page *area*, so it sits exactly where the questions start, and it
        // cannot be lifted into the page margin because Chrome throws any
        // negative vertical offset to the bottom of the page. Measured off three
        // printed PDFs: `top: 0` lands at the top and `bottom: 0` at the bottom,
        // both correctly, while `top: 0` with `margin-top: -18mm` lands at the
        // bottom.
        //
        // A repeated `thead` is in flow, so it both repeats and pushes the
        // content down on every page, which is the whole problem.
        <table class="runhead">
          <thead>
            <tr>
              <th>
                <RunningIdentification fields={cover.everyPage} />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{body}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        body
      )}
    </article>
  )
}

/**
 * The front page.
 *
 * A full page rather than a header block, because that is what a school exam
 * is: both documents this was built from open with a page carrying the logo, the
 * title, the timing, the general instructions, the marks breakdown and somewhere
 * for a student to write who they are, and start the first section overleaf.
 *
 * Every decision about what belongs here is in `cover.ts`. This draws what it is
 * given and picks nothing.
 */
function Cover({ cover }: { cover: CoverModel }) {
  return (
    <header class="cover">
      <div class="cover__top">
        <div class="cover__brand">
          {cover.logoPath ? (
            cover.logoSrc ? (
              <img
                class="cover__logo"
                src={cover.logoSrc}
                alt={cover.schoolName ?? ''}
                style={{ width: `${cover.logoWidthMm}mm` }}
              />
            ) : (
              // Named and not in the folder. A placeholder for the same reason a
              // missing stimulus gets one: caught on the proof rather than in
              // the exam room.
              <div class="cover__logomissing" style={{ width: `${cover.logoWidthMm}mm` }}>
                Missing logo: {cover.logoPath}
              </div>
            )
          ) : null}
          {cover.schoolName && <p class="cover__school">{cover.schoolName}</p>}
        </div>

        {cover.identification.length > 0 && (
          <IdentificationBlock fields={cover.identification} />
        )}
      </div>

      <h1 class="cover__title">{cover.title}</h1>
      {cover.course && <p class="cover__course">{cover.course}</p>}
      {cover.subtitle && <p class="cover__subtitle">{cover.subtitle}</p>}
      {cover.guide && <p class="cover__guide">Marking guide</p>}

      {/* Reading and working time print from the numbers the profile already
          holds. They used to reach the page only by being typed a second time
          into the instructions, so the same two facts were stored twice and only
          the typed copy was printed. */}
      {(cover.readingMinutes !== undefined || cover.workingMinutes !== undefined) && (
        <p class="cover__timing">
          {cover.readingMinutes !== undefined && (
            <span>Reading time: {minutes(cover.readingMinutes)}</span>
          )}
          {cover.workingMinutes !== undefined && (
            <span>Working time: {minutes(cover.workingMinutes)}</span>
          )}
        </p>
      )}

      <div class="cover__grid">
        <div class="cover__block">
          <h3>General instructions</h3>
          <ul>
            {cover.instructions.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>

        <div class="cover__block">
          <h3>Total marks: {cover.totalMarks}</h3>
          {cover.marksAwardedColumn ? (
            <MarksTable cover={cover} />
          ) : (
            <ul class="cover__sections">
              {cover.sections.map((s, i) => (
                <li key={i}>
                  <strong>
                    {s.title} - {s.marks} mark{s.marks === 1 ? '' : 's'}
                  </strong>
                  {s.questions && <span> ({s.questions})</span>}
                  {s.attempt && <span class="cover__allow">{s.attempt}</span>}
                  {s.suggestedMinutes !== undefined && (
                    <span class="cover__allow">
                      Allow about {minutes(s.suggestedMinutes)} for this section
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {(cover.yearGroup || cover.date) && (
        <p class="cover__meta">{[cover.yearGroup, cover.date].filter(Boolean).join(' · ')}</p>
      )}
    </header>
  )
}

/**
 * The marks breakdown as a table the marker fills in.
 *
 * The third column is what makes this worth having as a separate shape: an
 * internal school exam prints `/ 30` per section for a marker to write against,
 * and a public examination prints nothing of the kind.
 */
function MarksTable({ cover }: { cover: CoverModel }) {
  return (
    <table class="cover__marks">
      <thead>
        <tr>
          <th>Section</th>
          <th>Marks available</th>
          <th>Marks awarded</th>
        </tr>
      </thead>
      <tbody>
        {cover.sections.map((s, i) => (
          <tr key={i}>
            <td>{s.title}</td>
            <td>{s.marks}</td>
            <td class="cover__awarded">/ {s.marks}</td>
          </tr>
        ))}
        <tr class="cover__total">
          <td>Total</td>
          <td>{cover.totalMarks}</td>
          <td class="cover__awarded">/ {cover.totalMarks}</td>
        </tr>
      </tbody>
    </table>
  )
}

/** Where a student writes who they are: a bordered box on the cover. */
function IdentificationBlock({ fields }: { fields: CoverField[] }) {
  return (
    <div class="ident">
      {fields.map((field, i) => (
        <div class="ident__field" key={i}>
          <span class="ident__label">{field.label}</span>
          {field.kind === 'boxes' ? (
            <span class="ident__boxes">
              {Array.from({ length: field.boxes }, (_, j) => (
                <span class="ident__box" key={j} />
              ))}
            </span>
          ) : (
            <span class="ident__write" />
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * The identification fields that repeat on every printed page.
 *
 * A paper is split into piles for marking, so every sheet has to say whose it
 * is, which is why the 2025 Visual Arts trial draws its student number grid on
 * all nineteen pages. Browsers have no running headers in print; what does work
 * is `position: fixed`, which Chrome repeats on each page. On screen it sits at
 * the top of the preview once, with a line saying what it is, because a fixed
 * element in a scrolling preview would follow the window rather than the paper.
 */
function RunningIdentification({ fields }: { fields: CoverField[] }) {
  return (
    <div class="runid">
      <IdentificationBlock fields={fields} />
      <p class="runid__note">Printed at the top of every page.</p>
    </div>
  )
}

function QuestionBlock({
  item,
  mode,
  profile,
  images,
}: {
  item: ResolvedQuestion
  mode: PrintMode
  profile?: Profile | undefined
  images: Map<string, string>
}) {
  const q = item.question
  const marks = `(${item.marks} mark${item.marks === 1 ? '' : 's'})`

  /*
   * NESA prints a question two ways and Klunk used to print one.
   *
   * An objective question is numbered inline, `1  Which factor …`, with its
   * options under it. Everything else gets a heading of its own,
   * `Question 11 (4 marks)`, with the stem below. `src/extract.ts` has always
   * read both — the inline form at its objective branch and the heading form in
   * `HEADING` — because eleven years of papers taught it to; the renderer knew
   * only the second shape and drew every question in the first.
   */
  const asHeading = q.questionType !== 'multiple_choice' && q.questionType !== 'true_false'

  return (
    <div class="q-print">
      {asHeading ? (
        <div class="q-print__body">
          <h3 class="q-print__heading">
            Question {item.number} {marks}
          </h3>
          {q.stimulus?.map((s, i) => (
            <StimulusBlock key={i} stimulus={s} bankFile={item.file} images={images} />
          ))}
          {q.questionText.trim() && <p class="q-print__text">{q.questionText}</p>}
        </div>
      ) : (
        <div class="q-print__head">
          <span class="q-print__n">{item.number}</span>
          <div class="q-print__body">
            <p class="q-print__text">{q.questionText}</p>
            {q.stimulus?.map((s, i) => (
              <StimulusBlock key={i} stimulus={s} bankFile={item.file} images={images} />
            ))}
          </div>
          <span class="q-print__marks">{marks}</span>
        </div>
      )}

      <div class={asHeading ? 'q-print__answer q-print__answer--full' : 'q-print__answer'}>
        <QuestionBody item={item} mode={mode} profile={profile} />
      </div>

      {mode === 'guide' && <GuideBlock question={q} />}
    </div>
  )
}

function StimulusBlock({
  stimulus,
  bankFile,
  images,
}: {
  stimulus: Stimulus
  bankFile: string
  images: Map<string, string>
}) {
  if (stimulus.kind === 'text') {
    return (
      <blockquote class="stimulus">
        {stimulus.text}
        {stimulus.caption && <cite>{stimulus.caption}</cite>}
      </blockquote>
    )
  }

  const src = stimulus.file ? images.get(joinPath(bankFile, stimulus.file)) : undefined

  // A missing image prints as a placeholder naming the file, not blank space.
  // Better to see it on the proof than in the exam room.
  if (!src) {
    return (
      <figure class="stimulus stimulus--image">
        <div class="stimulus__missing" style={{ minHeight: `${stimulus.maxHeightMm ?? 60}mm` }}>
          Missing image: {stimulus.file ?? 'unnamed'}
        </div>
        {stimulus.caption && <figcaption>{stimulus.caption}</figcaption>}
      </figure>
    )
  }

  return (
    <figure class="stimulus stimulus--image">
      <img
        class="stimulus__img"
        src={src}
        alt={stimulus.alt ?? ''}
        style={{ maxHeight: `${stimulus.maxHeightMm ?? 60}mm` }}
      />
      {stimulus.caption && <figcaption>{stimulus.caption}</figcaption>}
    </figure>
  )
}

function QuestionBody({
  item,
  mode,
  profile,
}: {
  item: ResolvedQuestion
  mode: PrintMode
  profile?: Profile | undefined
}) {
  const q = item.question

  // The marking guide is a different document, not the paper with annotations.
  // A marker already has the paper in front of them, so repeating every option
  // and every blank line just buries the answer.
  if (mode === 'guide') return <GuideAnswer item={item} />

  switch (q.questionType) {
    case 'multiple_choice': {
      const { choices, letters } = shuffledChoices(q)
      return (
        <ol class="choices">
          {choices.map((c, i) => (
            <li key={i}>
              <span class="choices__letter">{letters[i]}.</span>
              <span>{c.text}</span>
            </li>
          ))}
        </ol>
      )
    }

    case 'true_false':
      return (
        <p class="truefalse">
          <span>TRUE</span>
          <span>FALSE</span>
        </p>
      )

    case 'table':
      return <TableBody question={q} mode={mode} />

    case 'drawing': {
      const [w, h] = q.config?.spaceMm ?? [160, 90]
      return (
        <>
          {q.config?.instructions && <p class="q-print__hint">{q.config.instructions}</p>}
          <div
            class={`drawbox ${q.config?.grid ? 'drawbox--grid' : ''}`}
            style={{ width: `${w}mm`, height: `${h}mm` }}
          />
        </>
      )
    }

    default: {
      const parts = q.config?.parts
      if (parts?.length) {
        return (
          <ol class="parts">
            {parts.map((part, i) => (
              <li key={i}>
                <div class="parts__head">
                  <span class="parts__label">{part.label}</span>
                  <span class="parts__text">{part.text}</span>
                  <span class="parts__marks">
                    ({part.marks} mark{part.marks === 1 ? '' : 's'})
                  </span>
                </div>
                <Lines n={part.answerLines ?? Math.max(2, Math.round(part.marks * 2))} />
              </li>
            ))}
          </ol>
        )
      }
      return <Lines n={answerLinesFor(q, item.marks, profile)} />
    }
  }
}

/**
 * What a marker actually needs: the answer, why it is the answer, and what a
 * response worth the marks looks like.
 */
function GuideAnswer({ item }: { item: ResolvedQuestion }) {
  const q = item.question

  switch (q.questionType) {
    case 'multiple_choice': {
      const { choices, correctIndex, letters } = shuffledChoices(q)
      const correct = choices[correctIndex]
      return (
        <>
          <p class="answer">
            <strong>Answer: {letters[correctIndex]}</strong>
            {correct ? `. ${correct.text}` : ''}
          </p>
          {correct?.feedback && <p class="why">{correct.feedback}</p>}
        </>
      )
    }

    case 'true_false': {
      const yes = q.config?.correctAnswer === true
      const why = yes ? q.config?.feedbackTrue : q.config?.feedbackFalse
      return (
        <>
          <p class="answer">
            <strong>Answer: {yes ? 'TRUE' : 'FALSE'}</strong>
          </p>
          {why && <p class="why">{why}</p>}
        </>
      )
    }

    case 'table':
      return <TableBody question={q} mode="guide" />

    case 'drawing':
      return q.config?.instructions ? (
        <>
          <p class="guide__head">Expected response</p>
          <p>{q.config.instructions}</p>
        </>
      ) : null

    default: {
      const parts = q.config?.parts
      if (!parts?.length) return null
      return (
        <ol class="parts">
          {parts.map((part, i) => (
            <li key={i}>
              <div class="parts__head">
                <span class="parts__label">{part.label}</span>
                <span class="parts__text">{part.text}</span>
                <span class="parts__marks">
                  ({part.marks} mark{part.marks === 1 ? '' : 's'})
                </span>
              </div>
              {part.sampleAnswer && <p class="guide__sample">{part.sampleAnswer}</p>}
              {part.criteria?.length ? <Criteria criteria={part.criteria} /> : null}
            </li>
          ))}
        </ol>
      )
    }
  }
}

function TableBody({ question, mode }: { question: Question; mode: PrintMode }) {
  const cfg = question.config
  const columns = cfg?.columns ?? []
  const rows = cfg?.rows ?? []

  return (
    <table class="answertable">
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td>{row.label}</td>
            {columns.slice(1).map((_, j) => (
              <td key={j} class="answertable__blank">
                {mode === 'guide' ? rowAnswers(row, j).join(' / ') : ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function GuideBlock({ question }: { question: Question }) {
  const guide = question.markingGuide
  const wantsSample =
    question.questionType === 'short_answer' ||
    question.questionType === 'extended_response' ||
    question.questionType === 'drawing'
  // A question whose parts each carry a sample answer is already covered, so
  // saying so again at question level is nagging rather than useful.
  const partsCovered =
    question.config?.parts?.some((p) => p.sampleAnswer || p.criteria?.length) ?? false
  const showMissing = wantsSample && !guide?.sampleAnswer && !partsCovered
  const hasAnything =
    guide?.sampleAnswer ||
    guide?.criteria?.length ||
    guide?.answersCouldInclude?.length ||
    guide?.notes

  if (!hasAnything && !showMissing) return null

  return (
    <div class="guide">
      {/*
        Sample answer before the criteria, deliberately. A table of marks says
        how to score a response; it does not say what a response worth those
        marks looks like. A teacher marking the course for the first time, or a
        student given the guide back, needs the second thing first.
      */}
      {guide?.sampleAnswer ? (
        <>
          <p class="guide__head">Sample answer</p>
          <p class="guide__sample">{guide.sampleAnswer}</p>
        </>
      ) : showMissing ? (
        <p class="guide__missing">
          No sample answer recorded. Marking this consistently, or handing the
          guide back to a class, is much harder without one.
        </p>
      ) : null}

      {guide?.criteria?.length ? (
        <>
          <p class="guide__head">Marking criteria</p>
          <Criteria criteria={guide.criteria} />
        </>
      ) : null}

      {/* What a marker should accept. Every NESA guideline ends with one and it
          is the longest part of it, so it is a list of its own rather than
          being run into the notes. */}
      {guide?.answersCouldInclude?.length ? (
        <>
          <p class="guide__head">Answers could include</p>
          <ul class="guide__points">
            {guide.answersCouldInclude.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </>
      ) : null}

      {guide?.notes && <p class="guide__notes">{guide.notes}</p>}
    </div>
  )
}

/**
 * A criteria table, on a question or on one of its parts.
 *
 * A band prints as the range the examination printed. Putting `15` where NESA
 * printed `13–15` is wrong on the one page a marker reads while marking, and it
 * quietly tells them a response either earns fifteen or earns nothing.
 */
function Criteria({ criteria }: { criteria: MarkCriterion[] }) {
  return (
    <table class="guide__criteria">
      <thead>
        <tr>
          <th>Criteria</th>
          <th class="guide__marks">Marks</th>
        </tr>
      </thead>
      <tbody>
        {criteria.map((c, i) => (
          <tr key={i}>
            <td>
              <CriterionPoints description={c.description} />
            </td>
            <td class="guide__marks">{markRange(c)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * One band's criteria.
 *
 * A NESA band is two or three separate points rather than one sentence, so a
 * newline separates them and they print as the list the guidelines print. A
 * single-line description stays a plain sentence, because most of them are and a
 * bullet on its own is noise.
 */
function CriterionPoints({ description }: { description: string }) {
  const points = description
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (points.length <= 1) return <>{points[0] ?? ''}</>
  return (
    <ul class="guide__points">
      {points.map((point, i) => (
        <li key={i}>{point}</li>
      ))}
    </ul>
  )
}

/** An en dash, as the printed guides use, not a hyphen. */
export function markRange(c: MarkCriterion): string {
  return c.marksTo === undefined ? String(c.marks) : `${c.marks}–${c.marksTo}`
}

/** Ruled answer space. Real lines, because students write on them. */
function Lines({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <div class="lines">
      {Array.from({ length: n }, (_, i) => (
        <span class="lines__line" key={i} />
      ))}
    </div>
  )
}
