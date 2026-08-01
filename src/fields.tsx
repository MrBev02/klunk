/**
 * The form controls both editors share.
 *
 * These started inside the question editor and moved here when the prompt
 * factory needed the same labelled field, the same number box that can be
 * emptied, and the same list of faults. Two copies of a control that has one
 * subtle bug fixed in it is how the second copy quietly gets the bug back.
 */

import { useEffect, useRef, useState } from 'preact/hooks'
import type { Check } from './paper'

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

/** A bare list of checks, for wherever a whole panel would be too much. */
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
  const errors = faults.filter((f) => f.severity === 'error')
  if (faults.length === 0 && !pathFault) {
    return (
      <section class="panel panel--ok">
        <p class="panel__title">Ready to save</p>
      </section>
    )
  }

  const blocking = errors.length + (pathFault ? 1 : 0)
  return (
    <section class={`panel ${blocking > 0 ? 'panel--alert' : 'panel--note'}`}>
      <p class="panel__title">
        {blocking > 0
          ? `${blocking} thing${blocking === 1 ? '' : 's'} to fix`
          : 'Worth knowing'}
      </p>
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
