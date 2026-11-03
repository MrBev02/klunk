/**
 * Writing a worked solution in the question editor (#224), for a question or
 * one of its parts.
 *
 * A line per box, with its marks beside it, because that is how a teacher
 * writes a solution and how a marker reads one. Enter starts the next line and
 * a pasted block of lines becomes that many lines, so typing it feels like the
 * page rather than a form. Blank lines are left alone while editing and dropped
 * on save, by `cleanQuestion`.
 */

import { useLayoutEffect, useRef } from 'preact/hooks'
import { NumField } from '../shared/fields'
import type { WorkingMethod, WorkingStep } from '../shared/types'

export function WorkingFields({
  working,
  onChange,
  id,
}: {
  working: WorkingMethod[] | undefined
  onChange: (next: WorkingMethod[] | undefined) => void
  /** Prefixes every box's id, so the editor can hold one of these per part. */
  id: string
}) {
  const methods = working ?? []
  const several = methods.length > 1

  const setMethod = (i: number, next: WorkingMethod) =>
    onChange(methods.map((m, j) => (i === j ? next : m)))
  const setSteps = (i: number, steps: WorkingStep[]) => {
    const method = methods[i]
    if (method) setMethod(i, { ...method, steps })
  }
  // Focus moves as the new line renders rather than at the next paint, which
  // Chrome holds back for a window it is not drawing. Until focus moves, a
  // space typed lands on "Add a line" and presses it again.
  const pending = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    if (!pending.current) return
    document.getElementById(pending.current)?.focus()
    pending.current = undefined
  })
  const focus = (method: number, line: number) => {
    pending.current = `${id}-${method}-${line}`
  }

  if (methods.length === 0) {
    return (
      <button
        class="btn btn--small"
        onClick={() => {
          onChange([{ steps: [{ text: '' }] }])
          focus(0, 0)
        }}
      >
        Add worked solution
      </button>
    )
  }

  return (
    <div class="working-edit">
      {methods.map((method, i) => (
        <div key={i} class="working-edit__method">
          {several && (
            <div class="withbtn">
              <input
                class="input"
                value={method.label ?? ''}
                placeholder={`Method ${i + 1}, e.g. Using Pythagoras`}
                title="Name this method"
                onInput={(e) =>
                  setMethod(i, { ...method, label: (e.target as HTMLInputElement).value })
                }
              />
              <button
                class="btn btn--small"
                onClick={() => onChange(methods.filter((_, j) => j !== i))}
              >
                Remove method {i + 1}
              </button>
            </div>
          )}
          <ol class="editrows">
            {method.steps.map((step, j) => (
              <li key={j} class="editrow">
                <span class="editrow__letter">{j + 1}</span>
                <div class="editrow__body withbtn">
                  <input
                    id={`${id}-${i}-${j}`}
                    class="input"
                    value={step.text}
                    placeholder={j === 0 ? 'First line of working, e.g. \\(c^2 = a^2 + b^2\\)' : ''}
                    onInput={(e) => {
                      const text = (e.target as HTMLInputElement).value
                      setSteps(
                        i,
                        method.steps.map((s, k) => (k === j ? { ...s, text } : s)),
                      )
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      const steps = [...method.steps]
                      steps.splice(j + 1, 0, { text: '' })
                      setSteps(i, steps)
                      focus(i, j + 1)
                    }}
                    onPaste={(e) => {
                      const pasted = e.clipboardData?.getData('text/plain') ?? ''
                      const lines = pasted.split(/\r?\n/).filter((l) => l.trim())
                      if (lines.length < 2) return
                      e.preventDefault()
                      const steps = [...method.steps]
                      const here = steps[j]
                      const into = here && !here.text.trim() ? 1 : 0
                      steps.splice(j + 1 - into, into, ...lines.map((text) => ({ text })))
                      setSteps(i, steps)
                      focus(i, j + lines.length - into)
                    }}
                  />
                  <NumField
                    class="input input--narrow"
                    value={step.marks}
                    min={0}
                    step={0.5}
                    placeholder="m"
                    title="Marks this line earns"
                    onChange={(n) =>
                      setSteps(
                        i,
                        method.steps.map((s, k) => {
                          if (k !== j) return s
                          const { marks: _, ...rest } = s
                          return n === undefined ? rest : { ...rest, marks: n }
                        }),
                      )
                    }
                  />
                </div>
                <button
                  class="btn btn--icon"
                  title="Remove this line"
                  onClick={() => {
                    const steps = method.steps.filter((_, k) => k !== j)
                    if (steps.length > 0) setSteps(i, steps)
                    else
                      onChange(methods.length > 1 ? methods.filter((_, k) => k !== i) : undefined)
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
          <button
            class="btn btn--small"
            onClick={() => {
              setSteps(i, [...method.steps, { text: '' }])
              focus(i, method.steps.length)
            }}
          >
            Add a line
          </button>
        </div>
      ))}
      <button
        class="btn btn--small"
        onClick={() => {
          onChange([...methods, { steps: [{ text: '' }] }])
          focus(methods.length, 0)
        }}
      >
        Add another method
      </button>
    </div>
  )
}
