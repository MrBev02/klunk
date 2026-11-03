/**
 * The formula being typed, shown larger under its box (#210).
 *
 * A teacher learning LaTeX gets stuck on a typo, and the paper preview in the
 * rail prints a formula KaTeX cannot read as red source among several
 * paragraphs, with nothing to say why. This shows the one formula the cursor
 * is in, as it is typed, and in place of it the reason it will not set.
 *
 * One panel for the whole form, laid over the page under whichever box the
 * cursor is in, rather than one per box. The editor has sixteen kinds of box
 * that can hold a formula, and a slot written into each is sixteen places to
 * forget it. It is not slipped into the page after the box either: that box's
 * parent is Preact's, and Preact places its children relative to their next
 * sibling, so a node it does not know about can be moved under the wrong box.
 */

import type { RefObject } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { formulaFault } from '../shared/formulacheck'
import { formulaAt, type FormulaAtCursor } from '../shared/richtext'
import { Inline } from '../shared/richtextview'
import { isProse } from './palette'

/**
 * An empty `{}` drawn as a box, on the preview only.
 *
 * A palette button types `\frac{}{}` with the cursor in the first slot, and
 * KaTeX sets an empty slot as nothing at all, so the preview was blank at the
 * moment a teacher most needs to see the shape. `\{\}`, an escaped pair, is a
 * set's braces and stays as it is.
 */
function withSlots(tex: string): string {
  return tex.replace(/(?<!\\)\{\}/g, '{\\square}')
}

interface Shown {
  formula: FormulaAtCursor
  /** Where the panel sits in the form, under the box. */
  top: number
  left: number
  width: number
}

export function FormulaPreview({ form }: { form: RefObject<HTMLElement | null> }) {
  const [shown, setShown] = useState<Shown | null>(null)

  useEffect(() => {
    const at = form.current
    if (!at) return
    const look = (e: Event) => {
      const box = e.target
      if (!isProse(box) || document.activeElement !== box) return setShown(null)
      const formula = formulaAt(box.value, box.selectionStart ?? 0)
      if (!formula) return setShown(null)
      // Measured each time, because a box grows as it is typed into and the
      // fault list above it changes length as it is fixed.
      const outer = at.getBoundingClientRect()
      const rect = box.getBoundingClientRect()
      setShown({
        formula,
        top: rect.bottom - outer.top + 4,
        left: rect.left - outer.left,
        width: rect.width,
      })
    }
    const away = () => setShown(null)
    const events = ['input', 'keyup', 'click', 'focusin', 'select']
    for (const name of events) at.addEventListener(name, look)
    at.addEventListener('focusout', away)
    return () => {
      for (const name of events) at.removeEventListener(name, look)
      at.removeEventListener('focusout', away)
    }
  }, [form])

  if (!shown) return null
  const { tex, display, closed } = shown.formula
  const fault = tex.trim() ? formulaFault(tex, display) : null
  const closer = display ? '\\]' : '\\)'

  return (
    <div
      class={`formulapreview ${fault ? 'formulapreview--fault' : ''}`}
      style={{ top: `${shown.top}px`, left: `${shown.left}px`, width: `${shown.width}px` }}
    >
      {!tex.trim() ? (
        <p class="hint">Type the formula here. Help has a table of what to type.</p>
      ) : fault ? (
        <p class="formulapreview__fault" role="status">
          <strong>This formula cannot be drawn.</strong> {fault}
        </p>
      ) : (
        <div class="formulapreview__set">
          <Inline text={display ? `\\[${withSlots(tex)}\\]` : `\\(${withSlots(tex)}\\)`} />
        </div>
      )}
      {!closed && (
        <p class="hint">
          Type <span class="mono">{closer}</span> to end the formula. Until then it prints as typed.
        </p>
      )}
    </div>
  )
}
