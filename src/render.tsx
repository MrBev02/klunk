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

import { answerLinesFor, shuffledChoices, type ResolvedPaper, type ResolvedQuestion } from './paper'
import type { Profile, Question, Stimulus } from './types'

export type PrintMode = 'paper' | 'guide'

export function PrintablePaper({
  resolved,
  mode,
}: {
  resolved: ResolvedPaper
  mode: PrintMode
}) {
  const { paper, profile } = resolved

  return (
    <article class={`sheet sheet--${mode}`}>
      <Cover resolved={resolved} mode={mode} />

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

          {section.questions.map((q) => (
            <QuestionBlock
              key={`${q.file}#${q.question.id}`}
              item={q}
              mode={mode}
              profile={profile}
            />
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
    </article>
  )
}

function Cover({ resolved, mode }: { resolved: ResolvedPaper; mode: PrintMode }) {
  const { paper, profile } = resolved
  const school = paper.school

  return (
    <header class="cover">
      {school?.name && <p class="cover__school">{school.name}</p>}
      <h1 class="cover__title">{paper.title}</h1>
      {paper.subtitle && <p class="cover__subtitle">{paper.subtitle}</p>}
      {mode === 'guide' && <p class="cover__guide">Marking guide</p>}

      <div class="cover__grid">
        <div class="cover__block">
          <h3>General instructions</h3>
          <ul>
            {(paper.instructions ?? profile?.paper.instructions ?? []).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>

        <div class="cover__block">
          <h3>Total marks: {resolved.totalMarks}</h3>
          <ul class="cover__sections">
            {resolved.sections.map((s, i) => (
              <li key={i}>
                <strong>
                  {s.title} - {s.marks} mark{s.marks === 1 ? '' : 's'}
                </strong>
                {s.questions.length > 0 && (
                  <span>
                    {' '}
                    (Question{s.questions.length === 1 ? ' ' : 's '}
                    {s.questions[0]?.number}
                    {s.questions.length > 1
                      ? `-${s.questions[s.questions.length - 1]?.number}`
                      : ''}
                    )
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {(school?.yearGroup || school?.date) && (
        <p class="cover__meta">
          {[school?.course, school?.yearGroup, school?.date].filter(Boolean).join(' · ')}
        </p>
      )}
    </header>
  )
}

function QuestionBlock({
  item,
  mode,
  profile,
}: {
  item: ResolvedQuestion
  mode: PrintMode
  profile?: Profile | undefined
}) {
  const q = item.question

  return (
    <div class="q-print">
      <div class="q-print__head">
        <span class="q-print__n">{item.number}</span>
        <div class="q-print__body">
          <p class="q-print__text">{q.questionText}</p>
          {q.stimulus?.map((s, i) => (
            <StimulusBlock key={i} stimulus={s} />
          ))}
        </div>
        <span class="q-print__marks">
          ({item.marks} mark{item.marks === 1 ? '' : 's'})
        </span>
      </div>

      <div class="q-print__answer">
        <QuestionBody item={item} mode={mode} profile={profile} />
      </div>

      {mode === 'guide' && <GuideBlock question={q} />}
    </div>
  )
}

function StimulusBlock({ stimulus }: { stimulus: Stimulus }) {
  if (stimulus.kind === 'text') {
    return (
      <blockquote class="stimulus">
        {stimulus.text}
        {stimulus.caption && <cite>{stimulus.caption}</cite>}
      </blockquote>
    )
  }

  // Images are referenced by path. Until the folder-relative loader is wired in,
  // print a placeholder that names the file rather than a silent blank space, so
  // a missing image is obvious on the proof rather than in the exam room.
  return (
    <figure class="stimulus stimulus--image">
      <div class="stimulus__missing" style={{ minHeight: `${stimulus.maxHeightMm ?? 60}mm` }}>
        {stimulus.alt ?? stimulus.file ?? 'image'}
      </div>
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
            {correct ? ` — ${correct.text}` : ''}
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
                {mode === 'guide' ? (row.answers?.join(' / ') ?? '') : ''}
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
  const partsCovered = question.config?.parts?.some((p) => p.sampleAnswer) ?? false
  const showMissing = wantsSample && !guide?.sampleAnswer && !partsCovered
  const hasAnything = guide?.sampleAnswer || guide?.criteria?.length || guide?.notes

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
          <table class="guide__criteria">
            <tbody>
              {guide.criteria.map((c, i) => (
                <tr key={i}>
                  <td>{c.description}</td>
                  <td class="guide__marks">{c.marks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {guide?.notes && <p class="guide__notes">{guide.notes}</p>}
    </div>
  )
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
