/**
 * The form controls both editors share.
 *
 * These started inside the question editor and moved here when the prompt
 * factory needed the same labelled field, the same number box that can be
 * emptied, and the same list of faults. Two copies of a control that has one
 * subtle bug fixed in it is how the second copy quietly gets the bug back.
 */

import { Fragment } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { groupFor } from './manifest'
import type { Check } from './paper'
import type { DocumentPurpose, Manifest, SyllabusTopic } from './types'

export function Field({
  label,
  hint,
  for: htmlFor,
  children,
}: {
  label: string
  hint?: string
  /** Id of the control, when there is a single one worth pointing a label at. */
  for?: string
  children: preact.ComponentChildren
}) {
  return (
    <div class="field">
      {htmlFor ? (
        <>
          <label class="rail__label" for={htmlFor}>
            {label}
          </label>
          {children}
        </>
      ) : (
        // No id to point at, so the control is wrapped instead. An implicit
        // association is a real one; a `for` aimed at nothing only looks like it.
        <label>
          <span class="rail__label">{label}</span>
          {children}
        </label>
      )}
      {hint && <p class="hint">{hint}</p>}
    </div>
  )
}

/**
 * A number box that reports numbers and keeps its own text.
 *
 * Binding a number straight to the input makes clearing it impossible: the
 * moment the box is empty the value becomes 0 and 0 is written back into it.
 * The text is deliberately not synchronised from the value afterwards, because
 * nothing outside changes these fields while the editor is open.
 */
export function NumField({
  value,
  onChange,
  ...rest
}: {
  value: number | undefined
  onChange: (n: number | undefined) => void
  id?: string
  class?: string
  min?: number
  max?: number
  step?: number
  placeholder?: string
  title?: string
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value))

  // What this box last reported. Repeatable rows are keyed by position, so
  // deleting the middle of a list leaves this component in place with the next
  // row's value handed to it: without noticing that, it would go on showing the
  // number belonging to the row that was deleted. Comparing against what was
  // reported rather than against the text distinguishes that from the teacher
  // halfway through typing "1" on the way to "12".
  const reported = useRef(value)
  useEffect(() => {
    if (value === reported.current) return
    reported.current = value
    setText(value === undefined ? '' : String(value))
  }, [value])

  return (
    <input
      type="number"
      class="input"
      {...rest}
      value={text}
      onInput={(e) => {
        const next = (e.target as HTMLInputElement).value
        setText(next)
        const parsed = next.trim() === '' ? undefined : Number(next)
        reported.current = parsed
        onChange(parsed)
      }}
    />
  )
}

/**
 * What sits between two entries in a list box, as typed and as shown.
 *
 * Both of these are the teacher being made to think in the file's terms, which
 * is #13. Fixing that is a different change; this one only makes the boxes
 * accept what is typed into them.
 */
const SEPARATORS = { ',': ', ', '/': ' / ' } as const

/**
 * A box holding a list, which reports the list and reads back from it only when
 * the teacher is somewhere else.
 *
 * Both list boxes used to bind `list.join(', ')` straight to the input and
 * re-parse every keystroke, which meant a separator could not be typed at all
 * (#110): the draft holds one entry, the value prop is that one entry joined,
 * and Preact writes it back over the comma that was just pressed. A second tag
 * could only be pasted in.
 *
 * Keeping the text in local state instead is not enough, and driving it in
 * Chrome is what showed why. A render caused by the draft above arrives with
 * the parsed list already updated and this component's own text one keystroke
 * behind, so Preact writes the stale text over what is in the box; the effect
 * puts it back, and at five milliseconds between keystrokes `ergonomics` came
 * out as `ergonoics`. So the box is not bound to the list at all. While it has
 * focus, what is in it wins.
 */
export function ListField({
  value,
  separator,
  onChange,
  ...rest
}: {
  value: string[]
  separator: keyof typeof SEPARATORS
  onChange: (list: string[]) => void
  id?: string
  class?: string
  placeholder?: string
}) {
  const join = (list: string[]) => list.join(SEPARATORS[separator])
  const parse = (text: string) =>
    text
      .split(separator)
      .map((v) => v.trim())
      .filter(Boolean)

  const box = useRef<HTMLInputElement>(null)

  // Seeds the box on the way in, and follows the list when it changes for a
  // reason other than typing here. Repeatable rows are keyed by position, so
  // deleting one leaves this component in place holding the next row's answers.
  useEffect(() => {
    const el = box.current
    if (!el || el === document.activeElement) return
    if (join(parse(el.value)) === join(value)) return
    el.value = join(value)
  }, [join(value)])

  return (
    <input
      ref={box}
      class="input"
      {...rest}
      onInput={(e) => onChange(parse((e.target as HTMLInputElement).value))}
      // Where the list as stored replaces what was typed, so a trailing comma
      // goes when the teacher leaves rather than as they type.
      onBlur={() => {
        const el = box.current
        if (el) el.value = join(value)
      }}
    />
  )
}

/** A bare list of checks, for wherever a whole panel would be too much. */
/** What each group of documents is called, per slot. */
const GROUP_LABELS: Record<DocumentPurpose, { matching: string; other: string }> = {
  syllabus: { matching: 'Syllabus documents', other: 'Not a syllabus' },
  paper: { matching: 'Past papers', other: 'Not a past paper' },
  'marking guide': { matching: 'Marking guides', other: 'Not a marking guide' },
}

/**
 * The folder's documents, sorted by what Klunk already knows they are (#73, #74).
 *
 * A teacher's folder holds eleven years of past papers and their marking
 * guides, so the syllabus tab was offering 37 documents of which 24 were
 * neither. What the manifest knows sorts them: what this slot wants first, then
 * what nobody has opened, then what is known to be something else.
 *
 * **Nothing is dropped.** Before the subject guide was offered on the syllabus
 * tab at all it could not be read at all (#58), and a list that hides a real
 * syllabus would be that fault again.
 *
 * A folder Klunk has opened nothing in gets a plain list, because a single
 * heading reading "Not opened yet" over the whole thing is decoration.
 */
export function DocumentOptions({
  paths,
  manifest,
  want,
}: {
  paths: string[]
  manifest: Manifest
  want: DocumentPurpose
}) {
  const grouped = groupFor(paths, manifest, want)
  const labels = GROUP_LABELS[want]
  const options = (group: string[]) =>
    group.map((p) => (
      <option key={p} value={p}>
        {p}
      </option>
    ))

  if (grouped.matching.length === 0 && grouped.other.length === 0) {
    return <>{options(grouped.unknown)}</>
  }

  return (
    <>
      {grouped.matching.length > 0 && (
        <optgroup label={labels.matching}>{options(grouped.matching)}</optgroup>
      )}
      {grouped.unknown.length > 0 && (
        <optgroup label="Not opened yet">{options(grouped.unknown)}</optgroup>
      )}
      {grouped.other.length > 0 && (
        <optgroup label={labels.other}>{options(grouped.other)}</optgroup>
      )}
    </>
  )
}

/**
 * A course's topics, under a heading per focus area.
 *
 * Both editors offer topics from one chosen course, and a course is where a
 * topic name stops being unique: Computing Technology 7–10 holds the same four
 * — `Identifying and defining`, `Researching and planning`, `Producing and
 * implementing`, `Testing and evaluating` — under each of six focus areas, so a
 * flat list of Stage 5 is 24 options reading as four (#75).
 *
 * An `optgroup` rather than a prefix on each option, because this syllabus
 * writes the strand into the area as well (`Enterprise information systems:
 * Modelling networks and social connections`) and a prefix puts seventy
 * characters in front of a topic name in a box that shows one line.
 *
 * The library's filter cannot use this: it spans every syllabus in the folder
 * and spends its one level of grouping on saying which. HTML has no nested
 * `optgroup`, so there the area stays a prefix.
 */
export function TopicOptions({
  topics,
  omit = [],
}: {
  topics: SyllabusTopic[]
  /** Topic ids already chosen, which are not offered again. */
  omit?: string[]
}) {
  const left = topics.filter((t) => !omit.includes(t.id))
  const option = (t: SyllabusTopic) => (
    <option key={t.id} value={t.id}>
      {t.name}
    </option>
  )

  // Nothing to head, so no headings. A syllabus that divides its course into
  // nothing — Design and Technology, Drama — would otherwise get one empty
  // `optgroup` wrapped round the whole list.
  if (!left.some((t) => t.group)) return <>{left.map(option)}</>

  // Runs rather than a bucket per name, so the published order survives. A
  // syllabus that returns to an earlier area later on reads as it is printed
  // instead of being silently reordered into it.
  const runs: { group: string; topics: SyllabusTopic[] }[] = []
  for (const topic of left) {
    const group = topic.group ?? ''
    const last = runs[runs.length - 1]
    if (last && last.group === group) last.topics.push(topic)
    else runs.push({ group, topics: [topic] })
  }

  return (
    <>
      {runs.map((run, at) =>
        run.group ? (
          <optgroup key={`${run.group}-${at}`} label={run.group}>
            {run.topics.map(option)}
          </optgroup>
        ) : (
          // A topic with no area in a course that has them. Left at the top
          // level rather than filed under an invented heading.
          <Fragment key={`loose-${at}`}>{run.topics.map(option)}</Fragment>
        ),
      )}
    </>
  )
}

/**
 * A chosen topic, named so it can be told from its namesakes.
 *
 * A chip has nowhere to put a heading, so here the area is a prefix. It is set
 * apart rather than run together with the name, because on Computing Technology
 * the area is the longer of the two and would otherwise read as the topic.
 */
export function TopicChipLabel({ topic }: { topic: SyllabusTopic }) {
  return (
    <span class="chip__topic">
      {topic.group && <span class="chip__where">{topic.group}</span>}
      {topic.name}
    </span>
  )
}

/**
 * Copy something long to the clipboard, and say what happened beside the button.
 *
 * Shared by the two screens that hand a teacher a prompt to paste elsewhere, so
 * the failure wording exists once. The recovery is the teacher's own hands: the
 * text is on screen and selectable either way, which is why a browser refusing
 * the clipboard is a hint rather than an error.
 *
 * What was copied stops being what is on screen the moment the text changes, so
 * the confirmation clears with it.
 */
export function CopyButton({
  text,
  label = 'Copy to clipboard',
}: {
  text: string
  label?: string
}) {
  const [said, setSaid] = useState('')

  useEffect(() => setSaid(''), [text])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setSaid('Copied. Paste it into your school\u2019s AI.')
    } catch {
      setSaid('Your browser would not let Klunk copy this. Select the prompt and press Ctrl+C.')
    }
  }

  return (
    <div class="panel__act">
      {said && <span class="hint">{said}</span>}
      <button class="btn btn--primary" disabled={!text} onClick={() => void copy()}>
        {label}
      </button>
    </div>
  )
}

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul class="plain">
      {checks.map((f, i) => (
        <li key={i} style={{ marginBottom: '0.2rem' }}>
          <span class="mono" style={{ opacity: 0.7 }}>
            {f.severity === 'error' ? '✕' : '!'}
          </span>{' '}
          {f.where && <span class="muted">{f.where}: </span>}
          {f.message}
        </li>
      ))}
    </ul>
  )
}

export function Faults({ faults, pathFault }: { faults: Check[]; pathFault: string | null }) {
  if (faults.length === 0 && !pathFault) {
    return (
      <section class="panel panel--ok">
        <p class="panel__title">Ready to save</p>
      </section>
    )
  }

  // Three states rather than two since #105. A question that saves and is not
  // finished is neither ready nor stuck, and calling it either is the fault:
  // "3 things to fix" over a question that saves reads as a refusal, and
  // "Worth knowing" over one reads as nothing to do.
  const blocking =
    faults.filter((f) => f.severity === 'error' && !f.unfinished).length + (pathFault ? 1 : 0)
  const owed = faults.filter((f) => f.unfinished).length
  const title =
    blocking > 0
      ? `${blocking} thing${blocking === 1 ? '' : 's'} to fix`
      : owed > 0
        ? `Saves now, with ${owed} thing${owed === 1 ? '' : 's'} left to finish`
        : 'Worth knowing'
  return (
    <section class={`panel ${blocking > 0 ? 'panel--alert' : 'panel--note'}`}>
      <p class="panel__title">{title}</p>
      {pathFault && (
        <ul class="plain">
          <li>
            <span class="mono" style={{ opacity: 0.7 }}>
              ✕
            </span>{' '}
            {pathFault}
          </li>
        </ul>
      )}
      <CheckList checks={faults} />
    </section>
  )
}

/* --------------------------------------------------------------- bank paths */

export function normaliseBankPath(input: string): string {
  const trimmed = input.trim().replace(/^\/+/, '')
  if (!trimmed) return 'bank/questions.json'
  return /\.json$/i.test(trimmed) ? trimmed : `${trimmed}.json`
}

export function bankPathFault(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return 'Give the new bank a filename.'
  if (trimmed.split('/').includes('..')) {
    return 'A bank has to live inside your folder, so its path cannot contain "..".'
  }
  return null
}

/**
 * A set of changes to an object, where undefined means "clear this".
 *
 * `Partial<T>` cannot say that: under `exactOptionalPropertyTypes` an absent
 * key and a key holding undefined are different things, and only the first is
 * allowed. Every field in these forms is optional and clearable, so patches go
 * through `patched`, which deletes rather than assigns undefined and so writes
 * a file with no `"caption": null` in it.
 *
 * Lived in the question editor until the profile editor needed the same thing.
 */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined }

export function patched<T extends object>(base: T, patch: Patch<T>): T {
  const out = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete out[key]
    else out[key] = value
  }
  return out as T
}
