/**
 * The form behind the cover sheet: one school, one logo, one set of boxes for a
 * student to say who they are.
 *
 * Folder-level rather than per profile, for the reason the schema gives: a
 * teacher across four year groups has four profiles and would otherwise attach
 * the same logo four times. What genuinely differs between one kind of paper and
 * another lives on the profile, and there is exactly a checkbox and a list of it.
 *
 * Field for field with `schemas/school.schema.json`, the way `profile.tsx` is
 * with its own schema, so what a teacher types is what the file holds.
 *
 * Named apart from `cover.ts`, which holds the resolution rules, because a
 * `cover.ts` and a `cover.tsx` side by side make `import './cover'` mean
 * whichever the bundler reaches first. Same split as `syllabusedit.ts` and
 * `syllabusreview.tsx`.
 */

import { useEffect, useMemo, useState } from 'preact/hooks'
import { Field, NumField, patched, type Patch } from './fields'
import { DEFAULT_BOXES, DEFAULT_LOGO_WIDTH_MM } from './cover'
import { copyFileInto, joinPath, safeFilename, saveSchool, type ContentIndex } from './storage'
import type { IdentificationField, School } from './types'
import { cleanSchool, validateSchool } from './validate'

export function CoverEditor({
  index,
  folder,
  onCancel,
  onSaved,
}: {
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  onCancel: () => void
  onSaved: (message: string) => void
}) {
  const existing = index.schools[0]
  const [draft, setDraft] = useState<School>(() => existing?.data ?? blankSchool())
  /** A logo chosen from the computer and not yet copied into the folder. */
  const [pending, setPending] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState('')

  const cleaned = useMemo(() => cleanSchool(draft), [draft])
  const faults = useMemo(() => validateSchool(cleaned), [cleaned])
  const errors = faults.filter((f) => f.severity === 'error')

  const set = (patch: Patch<School>) => setDraft((d) => patched(d, patch))
  const setFields = (fn: (f: IdentificationField[]) => IdentificationField[]) =>
    setDraft((d) => ({ ...d, identification: fn(d.identification ?? []) }))

  // The logo already in the folder, or the one just chosen. A chosen file needs
  // its own object URL and has to give it back, or picking six logos in a row
  // leaks five.
  const [chosenUrl, setChosenUrl] = useState('')
  useEffect(() => {
    if (!pending) return
    const url = URL.createObjectURL(pending)
    setChosenUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pending])

  const savedLogo =
    draft.logoFile && existing
      ? index.images.get(joinPath(existing.path, draft.logoFile))
      : undefined
  const preview = pending ? chosenUrl : savedLogo

  const choose = async () => {
    setFailed('')
    try {
      const handles = await window.showOpenFilePicker({
        id: 'klunk-logo',
        multiple: false,
        types: [
          {
            description: 'Images',
            accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'] },
          },
        ],
      })
      const handle = handles[0]
      if (!handle) return
      const file = await handle.getFile()
      setPending(file)
      set({ logoFile: safeFilename(file.name) })
    } catch (err) {
      // Closing the dialog is not a fault.
      if (err instanceof DOMException && err.name === 'AbortError') return
      setFailed((err as Error).message)
    }
  }

  const save = async () => {
    setSaving(true)
    setFailed('')
    try {
      let toWrite = cleaned
      if (pending) {
        // Copied beside school.json, and never over a file already there: the
        // name that comes back is the one actually used.
        const written = await copyFileInto(folder, '', pending.name, pending)
        toWrite = { ...cleaned, logoFile: written }
      }
      const { path } = await saveSchool(folder, toWrite, { path: existing?.path })
      setPending(null)
      onSaved(`Saved ${path}. It goes on the cover of every paper in this folder.`)
    } catch (err) {
      setFailed((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="editor">
      <div class="editor__head">
        <p class="panel__title">{existing ? 'Your cover sheet' : 'Set up your cover sheet'}</p>
        <div class="rowbtns">
          <button class="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            class="btn btn--primary"
            disabled={saving || errors.length > 0}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Create cover sheet'}
          </button>
        </div>
      </div>

      <p class="hint">
        This is the front page of every paper you print from this folder: your school's name and
        logo, and the boxes a student fills in. Klunk saves it as{' '}
        <span class="mono">{existing?.path ?? 'school.json'}</span>.
      </p>

      <section class="panel">
        <p class="panel__title">Your school</p>

        <div class="fieldrow">
          <Field label="Name" for="ce-name" hint="Printed on the cover, and used to name papers">
            <input
              id="ce-name"
              class="input"
              value={draft.name}
              placeholder="Redlands"
              onInput={(e) => set({ name: (e.target as HTMLInputElement).value })}
            />
          </Field>

          <Field
            label="How wide the logo prints"
            for="ce-width"
            hint="Millimetres across an A4 page. 85 is about a third of the width."
          >
            <NumField
              id="ce-width"
              value={draft.logoWidthMm}
              min={1}
              max={180}
              placeholder={String(DEFAULT_LOGO_WIDTH_MM)}
              onChange={(n) => set({ logoWidthMm: n })}
            />
          </Field>
        </div>

        <Field label="Logo">
          <div class="coverlogo">
            {preview ? (
              <img class="coverlogo__img" src={preview} alt="" />
            ) : draft.logoFile ? (
              <span class="coverlogo__missing">
                {draft.logoFile} is not in this folder, so the cover prints a grey box with that
                name in it.
              </span>
            ) : (
              <span class="muted">No logo yet. The cover prints your school's name instead.</span>
            )}
            <div class="rowbtns">
              <button class="btn btn--small" onClick={() => void choose()}>
                {draft.logoFile ? 'Choose a different logo' : 'Choose a logo'}
              </button>
              {draft.logoFile && (
                <button
                  class="btn btn--small"
                  onClick={() => {
                    setPending(null)
                    set({ logoFile: undefined })
                  }}
                >
                  Remove the logo
                </button>
              )}
            </div>
          </div>
        </Field>
        {pending && (
          <p class="hint">
            <span class="mono">{safeFilename(pending.name)}</span> is copied into this folder when
            you save, so the folder and its logo travel together.
          </p>
        )}
      </section>

      <IdentificationFields
        fields={draft.identification ?? []}
        setFields={setFields}
        hint="Where a student writes who they are. Klunk prints these in a box at the top right of the cover."
      />

      {failed && (
        <section class="panel panel--alert">
          <p class="panel__title">Could not save</p>
          <p>{failed}</p>
        </section>
      )}

      {faults.length > 0 && (
        <section class={`panel ${errors.length > 0 ? 'panel--alert' : 'panel--note'}`}>
          <p class="panel__title">
            {errors.length > 0
              ? `${errors.length} thing${errors.length === 1 ? '' : 's'} to fix`
              : 'Worth a look'}
          </p>
          <ul class="plain">
            {faults.map((f, i) => (
              <li key={i}>
                {f.where && <strong>{f.where}: </strong>}
                {f.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/**
 * The identification list, shared by this editor and the profile's override of
 * it. Both write the same shape, and two copies of a control is how the second
 * copy quietly loses a fix made to the first.
 */
export function IdentificationFields({
  fields,
  setFields,
  hint,
}: {
  fields: IdentificationField[]
  setFields: (fn: (f: IdentificationField[]) => IdentificationField[]) => void
  hint: string
}) {
  const change = (i: number, patch: Patch<IdentificationField>) =>
    setFields((list) => list.map((f, j) => (i === j ? patched(f, patch) : f)))

  return (
    <section class="panel">
      <p class="panel__title">What a student fills in</p>
      <p class="hint">{hint}</p>

      {fields.length === 0 && (
        <p class="hint">
          Nothing yet, so the cover prints no boxes at all. Most schools ask for a name and a
          class.
        </p>
      )}

      {fields.map((field, i) => (
        <div class="editor__sub" key={i}>
          <div class="fieldrow">
            <Field label="Label" hint="The words printed above the space">
              <input
                class="input"
                value={field.label}
                placeholder="Name"
                onInput={(e) => change(i, { label: (e.target as HTMLInputElement).value })}
              />
            </Field>

            <Field label="What it looks like">
              <select
                class="input"
                value={field.kind}
                onChange={(e) =>
                  change(i, { kind: (e.target as HTMLSelectElement).value as 'write' | 'boxes' })
                }
              >
                <option value="write">A line to write on</option>
                <option value="boxes">A row of boxes, one character each</option>
              </select>
            </Field>

            {field.kind === 'boxes' && (
              <Field label="How many boxes" hint="A student number is usually eight">
                <NumField
                  value={field.boxes}
                  min={1}
                  max={20}
                  placeholder={String(DEFAULT_BOXES)}
                  onChange={(n) => change(i, { boxes: n })}
                />
              </Field>
            )}
          </div>

          <div class="rowbtns">
            <label class="checkline">
              <input
                type="checkbox"
                checked={field.onEveryPage ?? false}
                onChange={(e) =>
                  change(i, { onEveryPage: (e.target as HTMLInputElement).checked || undefined })
                }
              />
              <span>Print this at the top of every page, not just the cover</span>
            </label>
            <button class="btn btn--small" onClick={() => setFields((l) => l.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        </div>
      ))}

      <button
        class="btn"
        onClick={() => setFields((l) => [...l, { label: '', kind: 'write' }])}
      >
        Add something to fill in
      </button>
    </section>
  )
}

function blankSchool(): School {
  return { formatVersion: '1', type: 'klunk_school', name: '' }
}
