/**
 * A worked solution, on screen and on the printed marking guide (#224).
 *
 * One table per method, a line per row, and the line's marks in a column of
 * their own on the right, where a marker's ticks go. A label heads a method
 * only when there are several, since a single method needs no name.
 */

import type { WorkingMethod } from './types'
import { RichText } from './richtextview'

export function Working({ working }: { working: WorkingMethod[] | undefined }) {
  if (!working?.length) return null
  const several = working.length > 1
  return (
    <div class="working">
      {working.map((method, i) => (
        <div key={i} class="working__method">
          {several && (
            <p class="working__label">
              Method {i + 1}
              {method.label ? `: ${method.label}` : ''}
            </p>
          )}
          <table class="working__steps">
            <tbody>
              {/* The editor's preview passes blank lines that saving drops. */}
              {method.steps
                .filter((step) => step.text.trim() || step.marks)
                .map((step, j) => (
                  <tr key={j}>
                    <td class="working__line">
                      {/* A step may be a table, such as a completed frequency table (#262). */}
                      <RichText text={step.text} class="answer-line" />
                    </td>
                    <td class="working__marks">
                      {step.marks === undefined
                        ? ''
                        : `${step.marks} mark${step.marks === 1 ? '' : 's'}`}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
