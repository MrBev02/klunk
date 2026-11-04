/**
 * The select that says what a picture belongs to: the question, one of its
 * parts, or one of its lettered options (#238).
 *
 * One component for the editor's stimulus rows and the past-paper cards, which
 * had each kept their own copy of the part half. The option half would have
 * been a third place to keep in step.
 */

import type { QuestionPart } from '../shared/types'
import { optionLetter } from '../papers/paper'

export interface Owner {
  at: number | null
  choice?: number
}

export function OwnerSelect({
  owner,
  parts,
  choices,
  onChange,
  disabled = false,
  title,
}: {
  owner: Owner
  parts: QuestionPart[]
  /** How many options a picture can be the picture of. 0 on any other type. */
  choices: number
  onChange: (owner: Owner) => void
  disabled?: boolean
  title?: string
}) {
  // A choice wins over a part where both are set, as `placeStimulus` has it.
  const value =
    owner.choice !== undefined && owner.choice < choices
      ? `c${owner.choice}`
      : owner.at !== null && owner.at < parts.length
        ? `p${owner.at}`
        : ''
  return (
    <select
      class="input input--sub"
      value={value}
      disabled={disabled}
      title={title}
      onChange={(e) => {
        const v = (e.target as HTMLSelectElement).value
        if (v.startsWith('c')) onChange({ at: null, choice: Number(v.slice(1)) })
        else onChange({ at: v.startsWith('p') ? Number(v.slice(1)) : null })
      }}
    >
      <option value="">The whole question</option>
      {parts.map((p, j) => (
        <option key={`p${j}`} value={`p${j}`}>
          Part {p.label.trim() || `(${j + 1})`}
        </option>
      ))}
      {Array.from({ length: choices }, (_, i) => (
        <option key={`c${i}`} value={`c${i}`}>
          Option {optionLetter(i)}
        </option>
      ))}
    </select>
  )
}
