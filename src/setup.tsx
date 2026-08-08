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

/**
 * Why a folder is being offered no stock profile, or `null` if it is being
 * offered some.
 *
 * Two different absences, and a teacher can act on the difference. Klunk having
 * nothing for this subject is permanent until #8, #33 and #45 land. Klunk not
 * knowing which subject is a fact about this folder holding several syllabuses,
 * which #29 says is the ordinary state for a year.
 */
export type NoOffer = 'no-profile-for-subject' | 'several-syllabuses'

export interface ProfileOffer {
  offered: ShippedProfile[]
  /** Null when something is offered. */
  why: NoOffer | null
}

/**
 * What Klunk can honestly offer a folder.
 *
 * Setup used to pass no `syllabusId` at all and so offer everything, on the
 * reasoning that a new folder does not yet say what it is for. That holds for a
 * genuinely empty folder and stops holding the moment the folder has a syllabus
 * model — which is the ordinary case, because a teacher generates the model
 * first and comes to the Papers tab afterwards. An IB folder was being offered
 * **NSW HSC Design and Technology** in the heading position (#48).
 *
 * So the folder is asked what it is for, and the answer is only trusted when it
 * is unambiguous. Several models means Klunk cannot tell which exam a stock
 * profile would be for, and offering one of them would be the same wrong guess
 * in a new costume, so it offers none and says why.
 *
 * An explicit `syllabusId` still wins: the prompt factory is drafting a
 * particular subject and knows better than the folder does.
 */
export function profilesOnOffer(index: ContentIndex, syllabusId?: string): ProfileOffer {
  const here = new Set(index.profiles.map((p) => p.data.id))
  const notHere = SHIPPED_PROFILES.filter((s) => !here.has(s.profile.id))

  const ids = [...new Set(index.syllabuses.map((s) => s.data.id))]
  const wanted = syllabusId ?? (ids.length === 1 ? ids[0] : undefined)

  // Only when the folder itself was ambiguous. A caller naming a syllabus has
  // said which one, however many models are in the folder.
  if (wanted === undefined && ids.length > 1) {
    return { offered: [], why: 'several-syllabuses' }
  }

  // An empty folder does not say what it is for, so everything Klunk has is a
  // fair offer. That was the original reasoning and it survives untouched.
  const offered =
    wanted === undefined ? notHere : notHere.filter((s) => s.profile.syllabusId === wanted)

  return { offered, why: offered.length === 0 ? 'no-profile-for-subject' : null }
}

export function ProfileInstaller({
  index,
  folder,
  syllabusId,
  onBuild,
  onInstalled,
}: {
  /**
   * Open the profile editor. Klunk ships one profile, so for every teacher who
   * is not teaching Design and Technology the list above is empty or wrong, and
   * "build your own" is the only offer that means anything to them.
   */
  onBuild?: (() => void) | undefined
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

  const { offered, why } = useMemo(
    () => profilesOnOffer(index, syllabusId),
    [index, syllabusId],
  )

  // Nothing to show only when there is also nothing to build. This used to
  // return null on an empty list, which is precisely the state a teacher of any
  // subject but Design and Technology is in, so the one control that would have
  // helped them disappeared along with the list that could not.
  if (offered.length === 0 && !onBuild) return null

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
      {/* With nothing to offer, describing your own paper is not a footnote to
          an empty list, it is the step. It sat in muted prose under a small
          button, which put the only offer that meant anything to a teacher of
          any subject but Design and Technology into the small print (#48). */}
      {onBuild && offered.length > 0 && (
        <p class="muted">
          Building towards a different exam?{' '}
          <button class="btn btn--small" onClick={onBuild}>
            Describe your own paper
          </button>
        </p>
      )}
      {onBuild && offered.length === 0 && (
        <>
          <p>
            {why === 'several-syllabuses'
              ? 'This folder holds more than one syllabus, so Klunk cannot tell which exam a stock profile would be for.'
              : 'Klunk has no stock profile for this subject.'}
          </p>
          <div class="rowbtns">
            <button class="btn btn--primary" onClick={onBuild}>
              Describe your own paper
            </button>
          </div>
        </>
      )}
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
        A syllabus model is the list of outcomes, topics and content points that you tag
           your questions against. <strong>Klunk comes with none, because a syllabus is
           copyright.</strong> Build your own from your own copy, into your own folder.
      </p>
      <p class="muted">
        For a NSW Stage 6 syllabus, open the <strong>From a syllabus</strong> tab and choose
           the <code>.docx</code> you downloaded from NESA. Klunk can read it straight out of
           your Downloads, so it does not have to be in this folder first. It shows you the
           courses, topics and content points it found before it writes anything.
      </p>
      <p class="muted">
        You can still write questions and build papers without one. You just cannot tag a
           question to a topic, and Klunk cannot tell you what a paper covers.
      </p>
    </>
  )
}
