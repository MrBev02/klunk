/**
 * The syllabus models already in the folder, and reading one of them.
 *
 * A model was write-only (#76). `SyllabusReview` shows every topic with its
 * area, its outcomes, its content points and their ids, and it was reachable
 * only between reading a document and saving the model built from it. The
 * moment Save was pressed the whole thing disappeared, and what a teacher could
 * then see of their own syllabus was topic *names* in two dropdowns.
 *
 * That matters because tagging a question means choosing an id. A teacher who
 * cannot see what `S5-13.02` covers has to open the syllabus document beside the
 * app, which is the thing Klunk exists to save them from — and re-reading the
 * document to look is worse, since that lands on the panel offering to replace
 * the model they are trying to read.
 *
 * Reading only. Correcting a saved model is a different job: it needs the
 * replace-cost count (#44) and a write path, and neither is what is blocking a
 * teacher today. The panel is the same one either way rather than a second
 * read-only rendering of the same data, because two of those drift.
 */

import { useState } from 'preact/hooks'
import type { ContentIndex } from './storage'
import { summarise } from './syllabus'
import { DEFAULT_GROUP_LABEL, SyllabusReview, lowerLabel, pluralLabel } from './syllabusreview'
import type { Loaded, Syllabus } from './types'

export function SyllabusModels({ index }: { index: ContentIndex }) {
  // The path, not the id: two models can share an id only by one of them being
  // broken, and the path is what the teacher sees written under each of them.
  const [open, setOpen] = useState<string | null>(null)
  const models = index.syllabuses

  if (models.length === 0) {
    return (
      <section class="panel">
        <p class="panel__title">No syllabus model in this folder yet</p>
        <p class="hint">
          Klunk ships none, because a syllabus is copyright and this folder is yours. Build
             one below from your own copy of the document, and it will appear here.
        </p>
      </section>
    )
  }

  return (
    <section class="panel">
      <p class="panel__title">The syllabus models in this folder</p>
      <p class="hint">
        This is what your questions are tagged against. Open one to read every course, topic
           and content point in it, with the ids a question uses.
      </p>

      <ul class="modellist">
        {models.map((model) => (
          <ModelRow
            key={model.path}
            model={model}
            open={open === model.path}
            onToggle={() => setOpen(open === model.path ? null : model.path)}
          />
        ))}
      </ul>
    </section>
  )
}

function ModelRow({
  model,
  open,
  onToggle,
}: {
  model: Loaded<Syllabus>
  open: boolean
  onToggle: () => void
}) {
  const syllabus = model.data
  const summary = summarise(syllabus.courses)
  // A model written before the word was recorded carries none, and the
  // framework is the only evidence it has. Two guesses rather than one, because
  // "Focus area" over the IB's three themes is a NESA word on an IB model and
  // the guide never uses it. Both are only ever a fallback: re-read the
  // document and the reader says what the document says.
  const label =
    syllabus.groupLabel?.trim() || (syllabus.framework === 'IB' ? 'Theme' : DEFAULT_GROUP_LABEL)
  // The edition, because two editions of one subject run at the same time (#29)
  // and which one a bank is tagged against is the thing a teacher checks here.
  const about = [syllabus.framework, syllabus.syllabusVersion].filter(Boolean).join(' · ')

  return (
    <li class="model">
      <button class="model__head" onClick={onToggle} aria-expanded={open}>
        <span class="model__titles">
          <span>
            <span class="model__name">{syllabus.name}</span>
            {about && <span class="model__about">{about}</span>}
          </span>
          <span class="model__path">{model.path}</span>
        </span>
        <span class="qrow__caret">›</span>
      </button>

      {/* Only while it is shut. Open, `SyllabusReview` heads each course with the
          same three counts, and printing them twice a hundred pixels apart is
          what made this screen look unconsidered. */}
      {!open && (
        <ul class="model__courses">
          {summary.map((course) => (
            <li class="model__course" key={course.courseId}>
              <span class="model__coursename">{course.courseName}</span>
              <span class="model__counts">
                <b>{course.topics}</b> topics · <b>{course.points}</b> content points ·{' '}
                <b>{course.outcomes}</b> outcomes
              </span>
              <span class="model__areas">
                {course.groups.length === 0 ? (
                  `No ${pluralLabel(lowerLabel(label))}, so every topic sits directly under the course.`
                ) : (
                  <>
                    <span class="model__arealabel">{pluralLabel(label)}</span>
                    {course.groups.join(' · ')}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div class="model__detail">
          <SyllabusReview courses={syllabus.courses} groupLabel={label} />
        </div>
      )}
    </li>
  )
}
