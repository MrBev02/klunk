/**
 * The formula palette beside the question editor (#209).
 *
 * One palette in the rail rather than one under each box, because a
 * mathematics question has formulas in its parts, its options and its sample
 * answers as much as in its stem, and the rail stays on screen beside
 * whichever of them is being written. It types into the box last typed in,
 * and says which, so a click never lands somewhere unseen.
 *
 * One group of buttons at a time, chosen from a list. All seven at once
 * stood 310px tall, and on a 700px window that pushed the preview, where a
 * teacher sees what a click did, off the bottom of the screen.
 *
 * A click goes through `execCommand('insertText')` so that Ctrl+Z takes it
 * back out, which matters most to someone trying buttons to see what they
 * do. It fires the box's own `input` event, so the editor's state follows as
 * it does for typing. `setRangeText` is the fallback where a browser refuses.
 */

import type { RefObject } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { Inline } from '../shared/richtextview'
import { PALETTE, insertion } from './formulas'

type Box = HTMLTextAreaElement | HTMLInputElement

/**
 * A box a formula can go in: any text area but a program's, and a one-line box
 * marked as prose. A program prints exactly as typed, so a formula there would
 * print as its source.
 */
export function isProse(el: EventTarget | null): el is Box {
  if (el instanceof HTMLTextAreaElement) return !el.classList.contains('input--code')
  return el instanceof HTMLInputElement && el.dataset.prose !== undefined
}

/** What the teacher would call the box: its label, else its placeholder. */
function nameOf(box: Box): string {
  const label = box.labels?.[0]
  const text = label?.querySelector('.rail__label')?.textContent ?? label?.textContent
  return (text || box.placeholder || 'the box last typed in').trim()
}

function insert(box: Box, inserts: string) {
  const start = box.selectionStart ?? box.value.length
  const end = box.selectionEnd ?? start
  const edit = insertion(box.value, start, end, inserts)
  box.focus()
  box.setSelectionRange(edit.from, edit.to)
  if (!document.execCommand('insertText', false, edit.text)) {
    box.setRangeText(edit.text, edit.from, edit.to, 'end')
    box.dispatchEvent(new Event('input', { bubbles: true }))
  }
  box.setSelectionRange(edit.cursor, edit.cursor)
}

export function FormulaPalette({
  form,
  fallback,
}: {
  /** The form whose boxes the palette types into. */
  form: RefObject<HTMLElement | null>
  /** The id of the box to type into before any has been used. */
  fallback: string
}) {
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<Box | null>(null)
  const [shown, setShown] = useState(0)
  const group = PALETTE[shown]!

  useEffect(() => {
    const at = form.current
    if (!at) return
    const focused = (e: FocusEvent) => {
      if (isProse(e.target)) setBox(e.target)
    }
    at.addEventListener('focusin', focused)
    return () => at.removeEventListener('focusin', focused)
  }, [form])

  // A part or an option can be removed after it was typed in.
  const target = (): Box | null => {
    if (box?.isConnected) return box
    const first = document.getElementById(fallback)
    return isProse(first) ? first : null
  }
  const into = target()

  return (
    <div class="panel palette">
      <div class="palette__head">
        <span class="panel__title">Formulas</span>
        <button class="btn btn--quiet" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Show the formula buttons'}
        </button>
      </div>
      {open && (
        <>
          <p class="hint">
            Click a button to type its formula into{' '}
            <strong>{into ? nameOf(into) : 'the question'}</strong>. Help has a table of what to
            type.
          </p>
          <select
            class="input palette__pick"
            aria-label="Which formulas"
            value={String(shown)}
            onChange={(e) => setShown(Number((e.target as HTMLSelectElement).value))}
          >
            {PALETTE.map((group, i) => (
              <option key={group.title} value={String(i)}>
                {group.title}
              </option>
            ))}
          </select>
          <div class="palette__buttons" role="group" aria-label={group.title}>
            {group.buttons.map((b) => (
              <button
                key={b.name}
                class="btn btn--small palette__btn"
                title={`${b.name}: types ${b.inserts.replace(/[@#]/g, '').trim()}`}
                aria-label={b.name}
                // Keeps the cursor and selection in the box being written.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const at = target()
                  if (at) insert(at, b.inserts)
                }}
              >
                <Inline text={`\\(${b.shows}\\)`} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
