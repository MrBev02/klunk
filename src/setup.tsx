/**
 * Making a brand new folder into a working one.
 *
 * A teacher points Klunk at an empty folder and, until now, hit a wall: the
 * Papers tab told them in prose to copy a profile into `profiles/` and reload.
 * There was no code path that wrote one. Everything else about the app assumes
 * teachers never touch files directly, so that instruction was the one place it
 * gave up on its own premise.
 *
 * Two halves, and the honesty is in the second. Klunk can supply the profile,
 * so it does, in one click. Klunk cannot supply the syllabus model, by design
 * and for copyright reasons, so it says so plainly and names the tool rather
 * than leaving an empty dropdown to be puzzled over.
 */

import { useMemo, useState } from 'preact/hooks'
import { installProfile, SHIPPED_PROFILES, type ShippedProfile } from './shipped'
import type { ContentIndex } from './storage'

export function ProfileInstaller({
  index,
  folder,
  syllabusId,
  onInstalled,
}: {
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  /**
   * Offer only what fits this syllabus. Setup wants everything Klunk has, since
   * a new folder does not yet say what it is for; the prompt factory is already
   * drafting a particular subject, and offering that teacher another subject's
   * profile is the same substitution the factory just stopped making.
   */
  syllabusId?: string
  onInstalled: () => void
}) {
  const [busy, setBusy] = useState('')
  const [problem, setProblem] = useState('')

  const here = useMemo(
    () => new Set(index.profiles.map((p) => p.data.id)),
    [index.profiles],
  )
  const offered = SHIPPED_PROFILES.filter(
    (s) =>
      !here.has(s.profile.id) &&
      (syllabusId === undefined || s.profile.syllabusId === syllabusId),
  )

  if (offered.length === 0) return null

  const install = async (shipped: ShippedProfile) => {
    setBusy(shipped.profile.id)
    setProblem('')
    try {
      const result = await installProfile(folder, shipped)
      if (!result.written) {
        // The file is there but did not show up as a profile in the scan, so it
        // is something else wearing the name. Saying so beats silence.
        setProblem(`${result.path} is already there, so nothing was written.`)
        return
      }
      onInstalled()
    } catch (err) {
      setProblem((err as Error).message)
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <ul class="plain setup__list">
        {offered.map((shipped) => (
          <li key={shipped.profile.id} class="setup__row">
            <div>
              <strong>{shipped.profile.name}</strong>
              <br />
              <span class="muted mono setup__meta">
                {shipped.profile.paper.totalMarks} marks ·{' '}
                {shipped.profile.paper.sections.length} section
                {shipped.profile.paper.sections.length === 1 ? '' : 's'} · writes{' '}
                <code>{shipped.path}</code>
              </span>
            </div>
            <button
              class="btn btn--small"
              disabled={busy !== ''}
              onClick={() => void install(shipped)}
            >
              {busy === shipped.profile.id ? 'Adding…' : 'Add to this folder'}
            </button>
          </li>
        ))}
      </ul>
      {problem && <p class="setup__problem">{problem}</p>}
    </>
  )
}

/**
 * What Klunk deliberately does not ship, and what to do about it.
 *
 * Shown only when the folder has no syllabus model, because that is the one
 * gap a teacher cannot close from inside the app and will otherwise meet as an
 * empty topic dropdown with no explanation.
 */
export function SyllabusNote() {
  return (
    <>
      <p>
        A syllabus model is the list of outcomes, topics and content points that
        questions are tagged against. <strong>Klunk ships none, on purpose.</strong> A
        syllabus is copyright, and the whole content inventory of one, restructured and
        published, is not a reasonable portion under anyone's reading. So you generate
        one from your own copy of the syllabus, into your own folder.
      </p>
      <p class="muted">
        For a NSW Stage 6 syllabus, that is one command against the <code>.docx</code>{' '}
        you downloaded from NESA:
      </p>
      <pre class="setup__cmd">
        <code>
          python3 tools/nesa_stage6_syllabus.py your-syllabus.docx \{'\n'}
          {'    '}--id nsw-hsc-design-technology --name "Design and Technology" \{'\n'}
          {'    '}--out syllabus/nsw-hsc-design-technology.json
        </code>
      </pre>
      <p class="muted">
        Without one you can still write questions and build papers. You just cannot tag
        a question to a topic, and the coverage a paper has is not something Klunk can
        work out.
      </p>
    </>
  )
}
