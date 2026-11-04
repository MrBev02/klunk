/**
 * The form behind a folder's `settings.json` (#137): what the folder is called
 * on screen, and the bank a new question goes into.
 *
 * Field for field with `schemas/settings.schema.json`, the way the cover sheet
 * is with its own. In `app/` rather than `folder/`, because `folder/` may only
 * import itself and `shared/`, and a screen needs the shared form controls.
 */

import { useMemo, useState } from 'preact/hooks'
import { CheckList, Field, ScreenBar, normaliseBankPath } from '../shared/fields'
import { SETTINGS_PATH, saveSettings, type ContentIndex } from '../folder/storage'
import type { Settings } from '../shared/types'
import { cleanSettings, validateSettings } from '../shared/validate'

/** The select's value for "no default": the first bank, as before there were settings. */
const FIRST = ''
/** The select's value for "a bank that is not in the folder yet". */
const NEW = ':new'

export function SettingsEditor({
  index,
  folder,
  from,
  onCancel,
  onSaved,
}: {
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  /** Where this screen was opened from, in the words on the tabs: the bar's trail. */
  from: string[]
  onCancel: () => void
  onSaved: (message: string) => void
}) {
  const existing = index.settings
  const bankPaths = index.banks.map((b) => b.path)
  const [name, setName] = useState(existing?.name ?? '')
  // A default naming a bank not in the folder yet opens on "A new bank…" with
  // its path filled in, the same way the question editor will offer it.
  const [choice, setChoice] = useState(() => {
    const wanted = existing?.defaultBank
    if (!wanted) return FIRST
    return bankPaths.includes(normaliseBankPath(wanted)) ? normaliseBankPath(wanted) : NEW
  })
  const [newPath, setNewPath] = useState(() =>
    existing?.defaultBank && choice === NEW ? existing.defaultBank : 'bank/questions.json',
  )
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState('')

  const cleaned = useMemo(
    () =>
      cleanSettings({
        formatVersion: '1',
        type: 'klunk_settings',
        name,
        ...(choice === FIRST ? {} : { defaultBank: choice === NEW ? newPath : choice }),
      } satisfies Settings),
    [name, choice, newPath],
  )
  const checks = useMemo(() => {
    const out = validateSettings(cleaned)
    // Only the folder can say this. A paper or a syllabus at that path would
    // refuse every question saved into it.
    const taken = [...index.papers, ...index.profiles, ...index.syllabuses, ...index.schools].find(
      (f) => f.path === cleaned.defaultBank,
    )
    if (choice === NEW && taken) {
      out.push({
        severity: 'error',
        message: `${taken.path} is already in this folder and is not a question bank. Choose another file name.`,
      })
    }
    return out
  }, [cleaned, choice, index])
  const errors = checks.filter((c) => c.severity === 'error')

  const save = async () => {
    setSaving(true)
    setFailed('')
    try {
      const { path } = await saveSettings(folder, cleaned)
      onSaved(`Saved ${path}. Everyone who opens this folder gets these settings.`)
    } catch (err) {
      setFailed((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="editor">
      <ScreenBar trail={[...from, 'Folder settings']}>
        <button class="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          class="btn btn--primary"
          disabled={saving || errors.length > 0}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Save settings'}
        </button>
      </ScreenBar>

      <p class="hint">
        These apply to everyone who opens this folder. Klunk saves them as{' '}
        <span class="mono">{SETTINGS_PATH}</span>.
      </p>

      <section class="panel">
        <p class="panel__title">This folder</p>

        <Field
          label="Name"
          for="st-name"
          hint={`Shown at the top of Klunk and when you switch folders. Leave it empty to show "${folder.name}".`}
        >
          <input
            id="st-name"
            class="input"
            value={name}
            placeholder={folder.name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
        </Field>

        <Field
          label="New questions go into"
          for="st-bank"
          hint="Where the question editor, Draft with AI and From a past paper start. You can still pick another bank each time."
        >
          <select
            id="st-bank"
            class="input"
            value={choice}
            onChange={(e) => setChoice((e.target as HTMLSelectElement).value)}
          >
            <option value={FIRST}>
              {bankPaths[0]
                ? `The first bank in the folder (${bankPaths[0]})`
                : 'A new bank (bank/questions.json)'}
            </option>
            {index.banks.map((b) => (
              <option key={b.path} value={b.path}>
                {b.data.name ? `${b.data.name} (${b.path})` : b.path}
              </option>
            ))}
            <option value={NEW}>A new bank…</option>
          </select>
        </Field>

        {choice === NEW && (
          <Field
            label="File"
            for="st-path"
            hint="Created when the first question is saved into it."
          >
            <input
              id="st-path"
              class="input mono"
              value={newPath}
              onInput={(e) => setNewPath((e.target as HTMLInputElement).value)}
            />
          </Field>
        )}

        <CheckList checks={checks} />
        {failed && <p class="missing">{failed}</p>}
      </section>
    </div>
  )
}
