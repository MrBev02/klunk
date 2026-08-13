/**
 * Filling a bank from a past paper, one review at a time.
 *
 * The reading is done by `extract.ts` and `guide.ts` and the mapping by
 * `adopt.ts`. What this adds is the part the issue insisted on: **nothing is
 * saved until a teacher has looked at it.** A mis-parsed question that reaches a
 * bank quietly is found in the exam room, so every question is on screen with
 * what the readers noticed about it, and a question with an error cannot be
 * saved from here at all — it goes to the question editor, exactly as a bad AI
 * draft does.
 *
 * The papers are offered from the teacher's own folder, and since #61 from
 * anywhere on this computer as well. Only the first was true before, on the
 * argument that a paper is downloaded into the content folder anyway, which
 * holds for a paper already there and says nothing about one that is not: a
 * folder with no PDFs in it was told to go to Finder, move the file and reload,
 * which is an instruction standing where a control belongs. That is #57's
 * lesson arriving on the tab beside the one #57 fixed.
 *
 * The paper and the marking guide are one box each, and every route in is on
 * the box: drag it on, click it to open the picker, or take one of the folder's
 * own from the list underneath. Three things were wrong with the pair of selects
 * that came before. The controls carried no `input` class and sat in a `grid2`
 * that is in no stylesheet, so the panel had never been laid out at all and the
 * examination name was cut off in its box. One drop target covered both slots
 * and filled them in the order the files happened to arrive, which decides which
 * document is the paper by something a teacher cannot see before letting go. And
 * the list stayed on screen reading "Choose a PDF…" beside a paper that was
 * already loaded, where the filename is the only thing that says what will be
 * read.
 *
 * A paper chosen from this computer is **copied into `source/`**, and this is
 * where the two screens part company. The syllabus reader reads a picked
 * document where it lies and does not copy it in, because the model is the
 * artefact it writes and the document is done with afterwards. A past paper is
 * never done with: a teacher comes back to it for the marking guide, for a
 * second bank, or to check a question against the page it was read from. So it
 * becomes an ordinary file of the folder at the moment it is chosen, and
 * everything after that point treats it as one.
 */

import { useMemo, useState } from 'preact/hooks'
import { adoptPaper, type Adopted } from './adopt'
import type { Editing } from './editor'
import { NotAPaperError, stampSource, type ExtractedQuestion, type PageText } from './extract'
import { PAPER_FORMAT_DESCRIPTIONS, readPastPaper, type PaperFormat } from './paperformats'
import { courseChoices, profileFor } from './factory'
import {
  bankPathFault,
  CheckList,
  CopyButton,
  DocumentOptions,
  Field,
  normaliseBankPath,
} from './fields'
import { historyOf, type DocumentNote } from './manifest'
import { applyGuide, NotAGuideError } from './guide'
import { GUIDE_FORMAT_DESCRIPTIONS, readMarkingGuide, type GuideFormat } from './guideformats'
import { ingestQuestions, type Draft } from './ingest'
import { buildPaperPrompt } from './paperprompt'
import { cutOut, picturesFor, type Cutout } from './pdfimage'
import { hasMarkup } from './richtext'
import { openPdf, pagesFromDocument, readPdf } from './pdftext'
import { QuestionDetail } from './question'
import { hasNoText } from './textlayer'
import {
  copyFileInto,
  copyFileIntoUnlessThere,
  joinPath,
  questionIds,
  readBytes,
  rememberDocument,
  saveQuestion,
  type ContentIndex,
} from './storage'
import {
  QUESTION_TYPE_LABELS,
  questionLabel,
  type DocumentPurpose,
  type Manifest,
  type Question,
} from './types'
import { cleanQuestion, suggestQuestionId, validateQuestion } from './validate'

/**
 * NESA was BOSTES until the end of 2016, and a copyright line naming the wrong
 * body is worse than useless: this is the field that decides where a paper
 * holding the question may go.
 */
function copyrightFor(year: number | undefined): string {
  if (year !== undefined && year <= 2016) {
    return 'Board of Studies, Teaching and Educational Standards NSW'
  }
  return 'NSW Education Standards Authority'
}

/** What a screen reader is told a cut-out picture is. */
function altFor(question: Question): string {
  const which = question.source?.questionNumber ?? question.id
  const year = question.source?.year
  return year === undefined
    ? `Picture from question ${which} of the paper`
    : `Picture from question ${which} of the ${year} paper`
}

/**
 * A transcribed draft, in the shape the review below already understands.
 *
 * `Adopted` and `Draft` are the same thing arrived at two ways, so the whole
 * review, discard, edit and save path is reused rather than written twice. What
 * a transcription has none of is pictures and pages: a crop is cut from where
 * the text is not, and a scan has no text anywhere, so `findPictures` has
 * nothing to bound a band with (#89).
 */
function asAdopted(draft: Draft): Adopted {
  return {
    question: draft.question,
    pictures: [],
    pages: [],
    notes: draft.repairs,
    faults: draft.faults,
  }
}

/** Where a paper chosen from this computer is put, which is where papers already live. */
const SOURCE_DIRECTORY = 'source'

/** Which of the two slots a chosen file fills. */
type Slot = 'paper' | 'guide'

export function Extractor({
  index,
  folder,
  today,
  onEdit,
  onSaved,
}: {
  index: ContentIndex
  folder: FileSystemDirectoryHandle
  /** ISO date, passed in so the clock is not reached for here, as the syllabus reader does. */
  today: string
  onEdit: (editing: Editing) => void
  /** Something landed in the folder, so the folder wants rescanning. */
  onSaved: () => void
}) {
  const courses = useMemo(() => courseChoices(index), [index])
  const banks = index.banks

  // Bumped when a note lands, so the two lists regroup as documents are read.
  // Only saving reloads the folder, and a paper read but not yet saved is
  // exactly what the list should already know about.
  const [, noted] = useState(0)
  const remember = (entry: DocumentNote) => {
    void rememberDocument(folder, index, entry).then(() => noted((n) => n + 1))
  }

  const [paperPath, setPaperPath] = useState('')
  const [guidePath, setGuidePath] = useState('')
  // Copied in this session. Merged with the scan's own list so a paper is
  // selectable the moment it is copied, rather than after the rescan it starts
  // has come back.
  const [added, setAdded] = useState<string[]>([])
  // Which slot is being dragged over, so only that one lights up.
  const [dragging, setDragging] = useState<Slot | null>(null)
  const [taking, setTaking] = useState(false)
  const [took, setTook] = useState('')
  /**
   * Which course every question read here is tagged against.
   *
   * Empty until the teacher says, and deliberately not defaulted to the folder's
   * first course (#90). A default cannot be told from a choice on screen, and
   * this one is written into the bank: three Enterprise Computing questions went
   * in tagged as Visual Arts because the select was showing what it opened with.
   *
   * A wrong course is worse than none. #47 holds a question naming a course to
   * that course, and `modelcheck.ts` cannot report it either, because the ids are
   * real ids of a real model. Untagged is already handled everywhere: #47 and #49
   * both offer a question that names nothing rather than holding it out.
   */
  const [courseKey, setCourseKey] = useState('')
  /**
   * The bank to write into, or `null` for one that does not exist yet.
   *
   * Named apart from `bankPath` below, which is where the questions actually go
   * and is either this or the new path. The same pair the question editor and
   * the factory already keep: this screen was the only one of the three with no
   * way to make a bank at all (#69), while `saveQuestion` had been able to
   * create one from the start.
   */
  const [bank, setBank] = useState<string | null>(banks[0]?.path ?? null)
  const [newBankPath, setNewBankPath] = useState('bank/questions.json')
  const [newBankName, setNewBankName] = useState('')
  /**
   * The examination every question says it came from.
   *
   * Empty until a paper is read, then filled from what the reader made of it.
   * It used to default to `NSW HSC Design and Technology` and sit above the Read
   * button, which was right while NESA was the only reader and became a lie the
   * moment a second one arrived: reading the IB practice paper stamped all
   * thirty questions as NESA's because nobody had thought to retype a field that
   * already looked filled in.
   */
  const [paperName, setPaperName] = useState('')

  const [reading, setReading] = useState(false)
  const [failed, setFailed] = useState('')
  /**
   * This document is a picture of a paper, so no reader can ever have it (#89).
   *
   * Set only after every reader has already refused, which is what makes it a
   * second route rather than a guess about the file.
   */
  const [noText, setNoText] = useState(false)
  /** The reply to the transcription prompt, as pasted. */
  const [pasted, setPasted] = useState('')
  /**
   * The year every question carries, as typed.
   *
   * Kept as text rather than a number so a half-typed `20` is not read as a
   * year, and held here rather than per question because one paper is one year
   * and #70's teacher was otherwise being sent into thirty editors to type the
   * same four digits.
   */
  const [yearText, setYearText] = useState('')
  const [read, setRead] = useState<{
    adopted: Adopted[]
    notes: string[]
    /** Which reader claimed it. Absent where none did and an AI transcribed it. */
    format?: PaperFormat
    guideFormat?: GuideFormat
    year?: number
  } | null>(
    null,
  )
  const [discarded, setDiscarded] = useState<string[]>([])
  const [renamed, setRenamed] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const chosen = courses.find((c) => c.key === courseKey)
  const bankPath = bank === null ? normaliseBankPath(newBankPath) : bank
  const pathFault = bank === null ? bankPathFault(newBankPath) : null

  const pdfs = useMemo(
    () => [...new Set([...index.pdfs, ...added])].sort((a, b) => a.localeCompare(b)),
    [index.pdfs, added],
  )

  /** A PDF from this computer: the pickers and a drop both land here. */
  const take = async (file: File, slot: Slot) => {
    setTaking(true)
    setFailed('')
    try {
      const { name, wrote } = await copyFileIntoUnlessThere(folder, SOURCE_DIRECTORY, file)
      const path = `${SOURCE_DIRECTORY}/${name}`
      setAdded((a) => (a.includes(path) ? a : [...a, path]))
      if (slot === 'paper') setPaperPath(path)
      else setGuidePath(path)
      setTook(
        wrote
          ? `${file.name} is now in your folder, as ${path}.`
          : `${path} was already in your folder, so nothing was written.`,
      )
      onSaved()
    } catch (err) {
      setFailed(`${file.name} could not be copied into your folder: ${(err as Error).message}`)
    } finally {
      setTaking(false)
    }
  }

  const pick = async (slot: Slot) => {
    setFailed('')
    try {
      const handles = await window.showOpenFilePicker({
        id: 'klunk-paper',
        multiple: false,
        types: [{ description: 'Past papers', accept: { 'application/pdf': ['.pdf'] } }],
      })
      const handle = handles[0]
      if (!handle) return
      await take(await handle.getFile(), slot)
    } catch (err) {
      // Closing the dialog is not a fault.
      if (err instanceof DOMException && err.name === 'AbortError') return
      setFailed((err as Error).message)
    }
  }

  /**
   * A drop fills the box it landed on, and takes one file.
   *
   * It used to take two at once, the first as the paper and the second as the
   * marking guide, off one box covering both. Which file a drag holds first is
   * not something a teacher can see before letting go, so that rule decided
   * which document was the paper by an order nobody chose.
   */
  const drop = async (e: DragEvent, slot: Slot) => {
    e.preventDefault()
    setDragging(null)
    const dropped = [...(e.dataTransfer?.files ?? [])]
    const file = dropped.find((f) => /\.pdf$/i.test(f.name))
    if (!file) {
      const first = dropped[0]
      setFailed(
        first
          ? `Klunk reads a past paper as a .pdf, and ${first.name} is not one.`
          : 'That was not a file Klunk could take. Drop the paper itself, not a link to it.',
      )
      return
    }
    await take(file, slot)
  }

  const readPaper = async () => {
    if (!paperPath) return
    setReading(true)
    setFailed('')
    setDiscarded([])
    setRenamed({})
    setRead(null)
    setNoText(false)
    // Held outside the try so the refusal below can say what kind of document
    // this is, rather than only that no reader wanted it.
    let pages: PageText[] = []
    try {
      // One open document for both the text and the pictures: `getDocument`
      // detaches the bytes it is given, so opening the same file twice throws.
      const doc = await openPdf(await readBytes(folder, paperPath))
      pages = await pagesFromDocument(doc)
      const { format, paper: readAs } = readPastPaper(pages)
      remember({ path: paperPath, read: 'paper', when: today })
      let paper = readAs
      let guideFormat: GuideFormat | undefined
      let guideFailed = ''
      if (guidePath) {
        // A marking guide Klunk cannot read must not take the paper down with
        // it. The questions are still worth having and the answers can be set by
        // hand, so this is reported against the paper as a whole rather than
        // thrown: losing thirty read questions because the second file was the
        // wrong one would be the worse trade.
        try {
          const reading = readMarkingGuide(await readPdf(await readBytes(folder, guidePath)))
          guideFormat = reading.format
          paper = applyGuide(paper, reading.guide)
          remember({ path: guidePath, read: 'marking guide', when: today })
        } catch (err) {
          if (!(err instanceof NotAGuideError)) throw err
          guideFailed = `${guidePath}: ${err.message}`
          remember({ path: guidePath, refused: 'marking guide', when: today })
        }
      }
      const year = paper.year
      // Stamped whether or not a year was found. The examination, the origin and
      // the question number are known either way, and #70 was that a paper with
      // no year got no source at all — which left the origin defaulting to
      // `authored` and so hid the editor's own Year field behind the very
      // condition that told the teacher to go and use it.
      // `Past paper` is vague, and vague is the point: it is true of anything,
      // where a named examination Klunk guessed would not be.
      const examination =
        paperName.trim() || (format === 'nesa' ? 'NSW HSC Design and Technology' : 'Past paper')
      paper = stampSource(paper, {
        paper: examination,
        ...(year === undefined ? {} : { year }),
        // NESA's alone. Klunk does not know who owns a paper read by any other
        // reader, and `bank.schema.json` says copyright is what constrains where
        // the paper holding the question may go, so guessing is not cosmetic.
        ...(format === 'nesa' ? { copyright: copyrightFor(year) } : {}),
      })

      // Where the text is not, on the pages a question covers.
      const wanted = new Map<ExtractedQuestion, ReturnType<typeof picturesFor>>()
      for (const question of paper.questions) {
        const regions = picturesFor(question, pages)
        if (regions.length > 0) wanted.set(question, regions)
      }
      const cut = await cutOut(doc, [...wanted.values()].flat())
      const cutouts = new Map<ExtractedQuestion, Cutout[]>()
      for (const [question, regions] of wanted) {
        const mine = cut.filter((c) => regions.includes(c.region))
        if (mine.length > 0) cutouts.set(question, mine)
      }

      const adopted = adoptPaper(paper, {
        bankPath,
        inFolder: questionIds(index),
        inBank: new Set(
          (banks.find((b) => b.path === bankPath)?.data.questions ?? []).map((q) => q.id),
        ),
        syllabusId: chosen?.syllabus.id,
        courseId: chosen?.course.id,
      }, cutouts)

      const notes = [...paper.notes]
      if (guideFailed) notes.push(guideFailed)
      // A missing year is no longer a note. It used to say "add the year in the
      // editor", which named the wrong screen and a hidden field; it is a box on
      // the review panel now, so the panel says it rather than the notes list.
      setYearText(year === undefined ? '' : String(year))
      setPaperName(examination)
      setRead({
        adopted,
        notes,
        format,
        ...(guideFormat === undefined ? {} : { guideFormat }),
        ...(year === undefined ? {} : { year }),
      })
    } catch (err) {
      // Both readers refused it, which is worth writing down: it is what keeps
      // the subject guide out of the top of this list next time. Anything else
      // that threw says nothing about what the document is.
      if (err instanceof NotAPaperError) {
        remember({ path: paperPath, refused: 'paper', when: today })
        // The questions are in there, they are simply not text, so this is the
        // one refusal that opens a second route instead of closing the screen.
        if (hasNoText(pages)) setNoText(true)
      }
      setFailed((err as Error).message)
    } finally {
      setReading(false)
    }
  }

  /** The year as typed, where four digits have been typed. */
  const typedYear = /^\d{4}$/.test(yearText.trim()) ? Number(yearText.trim()) : undefined

  /**
   * The prompt for a document no reader can have.
   *
   * Rebuilt as the examination and year are typed, because both are printed in
   * it and a prompt naming the wrong paper is worse than one naming none.
   */
  const transcribeProfile = useMemo(
    () => profileFor(index, chosen?.syllabus, chosen?.course.id),
    [index, chosen],
  )

  const transcribePrompt = useMemo(() => {
    if (!noText) return ''
    return buildPaperPrompt({
      examination: paperName.trim() || 'Past paper',
      year: typedYear,
      profile: transcribeProfile,
      syllabus: chosen?.syllabus,
      course: chosen?.course,
    })
  }, [noText, paperName, typedYear, transcribeProfile, chosen])

  /**
   * Read back what the teacher's AI made of the paper.
   *
   * The same `ingestQuestions` the Draft with AI tab uses, told that these came
   * off a named paper, which is what turns a question number in the reply into
   * provenance. Content points are deliberately not offered: a course can carry
   * hundreds, and tagging is by topic here (#89).
   */
  const readReply = () => {
    setFailed('')
    const examination = paperName.trim() || 'Past paper'
    const out = ingestQuestions(pasted, {
      bankPath,
      inFolder: questionIds(index),
      inBank: new Set(
        (banks.find((b) => b.path === bankPath)?.data.questions ?? []).map((q) => q.id),
      ),
      syllabusId: chosen?.syllabus.id,
      courseId: chosen?.course.id,
      topicIds: (chosen?.course.topics ?? []).map((t) => t.id),
      points: [],
      outcomes: [],
      paper: { examination, year: typedYear },
    })

    if (out.drafts.length === 0) {
      setFailed(out.failure ?? 'That reply held no questions.')
      return
    }

    setRead({
      adopted: out.drafts.map(asAdopted),
      notes: [
        ...out.notes,
        ...out.rejected.map((r) => `Entry ${r.at + 1} was not a question: ${r.why}`),
      ],
      ...(typedYear === undefined ? {} : { year: typedYear }),
    })
  }

  // Worked out from the folder rather than remembered, so a question sent to the
  // editor and saved there comes back marked saved too.
  const alreadySaved = useMemo(() => questionIds(index), [index])
  const savedAs = (a: Adopted) => renamed[a.question.id] ?? a.question.id
  const live = (read?.adopted ?? []).filter((a) => !discarded.includes(a.question.id))
  const unsaved = live.filter((a) => !alreadySaved.has(savedAs(a)))
  const ready = unsaved.filter((a) => !a.faults.some((f) => f.severity === 'error'))
  const stuck = unsaved.length - ready.length

  /**
   * Put the typed year on every question read, or take it off them all.
   *
   * Applied to the adopted questions rather than re-read, because re-reading
   * would throw away every picture the teacher has already dropped and every
   * question they have discarded.
   */
  const applyYear = (text: string) => {
    setYearText(text)
    const trimmed = text.trim()
    const year = /^\d{4}$/.test(trimmed) ? Number(trimmed) : undefined
    setRead((r) => {
      if (r === null) return r
      return {
        ...r,
        adopted: r.adopted.map((a) => {
          const source = { ...(a.question.source ?? {}) }
          if (year === undefined) delete source.year
          else source.year = year
          return { ...a, question: { ...a.question, source } }
        }),
      }
    })
  }

  /**
   * Re-mint the ids when the bank changes, because an id is named after its bank.
   *
   * `adoptPaper` hands out ids at read time against whichever bank was selected
   * then, so switching afterwards used to leave thirty questions called
   * `example-bank-mc-22` sitting in `ib-dt-p1-practice.json`. The id is derived
   * from the filename by design, so one naming a different bank is not untidy,
   * it is wrong.
   *
   * Anything already written is left alone: a saved question's id is what a
   * paper points at, and #64's sibling lesson is that renaming those silently
   * would break every paper using them. The faults are recomputed with the ids,
   * because a clash inside the target bank is one of the things they report.
   */
  const retargetIds = (path: string) => {
    const inFolder = questionIds(index)
    const inBank = new Set(
      (banks.find((b) => b.path === path)?.data.questions ?? []).map((q) => q.id),
    )
    setRead((r) => {
      if (r === null) return r
      const taken = new Set(inFolder)
      return {
        ...r,
        adopted: r.adopted.map((a) => {
          if (alreadySaved.has(a.question.id)) {
            taken.add(a.question.id)
            return a
          }
          const id = suggestQuestionId(path, a.question.questionType, taken)
          taken.add(id)
          const question = { ...a.question, id }
          return { ...a, question, faults: validateQuestion(question, { inBank, inFolder }) }
        }),
      }
    })
  }

  const chooseBank = (value: string) => {
    setBank(value || null)
    retargetIds(value || normaliseBankPath(newBankPath))
  }

  const chooseNewBankPath = (value: string) => {
    setNewBankPath(value)
    if (bankPathFault(value) === null) retargetIds(normaliseBankPath(value))
  }

  /** The examination name on every question read, the way `applyYear` does the year. */
  const applyExamination = (text: string) => {
    setPaperName(text)
    const name = text.trim() || 'Past paper'
    setRead((r) =>
      r === null
        ? r
        : {
            ...r,
            adopted: r.adopted.map((a) => ({
              ...a,
              question: { ...a.question, source: { ...(a.question.source ?? {}), paper: name } },
            })),
          },
    )
  }

  const togglePicture = (id: string, at: number) => {
    setRead((r) =>
      r === null
        ? r
        : {
            ...r,
            adopted: r.adopted.map((a) =>
              a.question.id !== id
                ? a
                : {
                    ...a,
                    pictures: a.pictures.map((p, i) => (i === at ? { ...p, keep: !p.keep } : p)),
                  },
            ),
          },
    )
  }

  const saveReady = async () => {
    setSaving(true)
    setFailed('')
    try {
      const moved: Record<string, string> = {}
      for (const item of ready) {
        // The pictures go in first, because the question has to point at them and
        // a question pointing at a file that was never written prints a
        // placeholder naming a file nobody has.
        const kept = item.pictures.filter((p) => p.keep)
        const stimulus = []
        for (const [at, picture] of kept.entries()) {
          const name = `${item.question.id}${kept.length > 1 ? `-${at + 1}` : ''}.png`
          const written = await copyFileInto(folder, imageDirectory(bankPath), name, picture.cutout.blob)
          stimulus.push({
            kind: 'image' as const,
            // Stored relative to the bank, which is how every other stimulus is
            // stored and what lets the whole folder be moved.
            file: relativeToBank(bankPath, imageDirectory(bankPath), written),
            // Built in two pieces rather than interpolating a possibly-absent
            // year, which left "of the  paper" with a hole in it once a paper
            // without one could be read at all.
            alt: altFor(item.question),
          })
        }

        const question = stimulus.length > 0
          ? { ...item.question, stimulus }
          : item.question
        const written = await saveQuestion(folder, bankPath, cleanQuestion(question), {
          syllabusId: chosen?.syllabus.id,
          // Only used when the bank does not exist yet; `saveQuestion` creates it
          // on the first question and ignores this on every one after.
          ...(bank === null && newBankName.trim() ? { name: newBankName.trim() } : {}),
        })
        if (written.reassignedFrom !== undefined) moved[written.reassignedFrom] = written.id
      }
      setRenamed((r) => ({ ...r, ...moved }))
      // Where this paper's questions ended up, which nothing has recorded until
      // now: a bank holds the examination and the year, and never the file they
      // were read out of.
      if (ready.length > 0) {
        remember({ path: paperPath, read: 'paper', into: bankPath, when: today })
      }
      onSaved()
    } catch (err) {
      setFailed((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="factory">
      <section class="panel">
        <p class="panel__title">
          <span class="step">1</span> Choose the paper
        </p>
        <p class="hint">
          Both files stay on your computer. Klunk reads them in the browser and sends
             nothing anywhere.
        </p>

        <div class="slots">
          <PdfSlot
            label="Past paper"
            id="ex-paper"
            what="the paper"
            path={paperPath}
            inFolder={pdfs}
            manifest={index.manifest}
            want="paper"
            busy={taking}
            over={dragging === 'paper'}
            onOver={(on) => setDragging(on ? 'paper' : null)}
            onChoose={setPaperPath}
            onPick={() => void pick('paper')}
            onDrop={(e) => void drop(e, 'paper')}
          />

          <PdfSlot
            label="Marking guide"
            id="ex-guide"
            what="the marking guide"
            optional
            hint="Brings the answers, the criteria and the syllabus outcomes with it."
            path={guidePath}
            // Never the paper itself, which was the one thing the old pair of
            // selects got right.
            inFolder={pdfs.filter((p) => p !== paperPath)}
            manifest={index.manifest}
            want="marking guide"
            busy={taking}
            over={dragging === 'guide'}
            onOver={(on) => setDragging(on ? 'guide' : null)}
            onChoose={setGuidePath}
            onPick={() => void pick('guide')}
            onDrop={(e) => void drop(e, 'guide')}
          />
        </div>

        {took && <p class="hint">{took}</p>}

        <div class="fieldrow">
          <Field label="Tag against" for="ex-course">
            <select
              id="ex-course"
              class="input"
              value={courseKey}
              onChange={(e) => setCourseKey((e.target as HTMLSelectElement).value)}
            >
              <option value="">
                {courses.length === 0 ? 'No syllabus in this folder' : 'Not one of these'}
              </option>
              {courses.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <p class="hint">
              {chosen === undefined
                ? 'Every question is saved untagged. You can tag them later in the library.'
                : `Every question is saved tagged against ${chosen.syllabus.name}, ${chosen.course.name}.`}
            </p>
          </Field>

        </div>

        <div class="rowbtns">
          <button
            class="btn btn--primary"
            disabled={!paperPath || reading}
            onClick={() => void readPaper()}
          >
            {reading ? 'Reading…' : 'Read the paper'}
          </button>
        </div>

        {failed && (
          <div class="panel panel--bad" style={{ marginTop: '0.8rem' }}>
            <p>{failed}</p>
          </div>
        )}
      </section>

      {noText && (
        <TranscribePanel
          paperPath={paperPath}
          prompt={transcribePrompt}
          profileName={transcribeProfile?.name}
          courseName={chosen ? `${chosen.syllabus.name}, ${chosen.course.name}` : undefined}
          examination={paperName}
          onExamination={setPaperName}
          year={yearText}
          onYear={setYearText}
          pasted={pasted}
          onPasted={setPasted}
          onRead={readReply}
        />
      )}

      {read && (
        <section class="panel">
          <p class="panel__title">
            <span class="step">{read.format === undefined ? 3 : 2}</span> Review every question
               before saving
          </p>
          <p class="hint">
            Check each question against the paper. Anything Klunk was unsure about is
               flagged below.
          </p>

          {read.notes.length > 0 && (
            <div class="draft__note">
              <p class="det__label">About the paper as a whole</p>
              <ul class="plain">
                {read.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <div class="fieldrow">
            <Field label="Bank to save into" for="ex-bank">
              <select
                id="ex-bank"
                class="input"
                value={bank ?? ''}
                onChange={(e) => chooseBank((e.target as HTMLSelectElement).value)}
              >
                {banks.map((b) => (
                  <option key={b.path} value={b.path}>
                    {b.data.name ? `${b.data.name} (${b.path})` : b.path}
                  </option>
                ))}
                <option value="">A new bank…</option>
              </select>
            </Field>

            <Field label="Year" for="ex-year" hint="So Klunk can warn that students may have seen one">
              <input
                id="ex-year"
                class="input"
                inputMode="numeric"
                placeholder="2025"
                value={yearText}
                onInput={(e) => applyYear((e.target as HTMLInputElement).value)}
              />
            </Field>
          </div>

          {/* Provenance is confirmed here rather than on the panel above,
              because here the teacher can see what was actually read. Both
              fields write to every question at once, which is the whole reason
              they are not left to the editor: one paper is one examination and
              one year. */}
          <Field
            label="Examination"
            for="ex-name"
            hint="Recorded on every question, as the paper it came from"
          >
            <input
              id="ex-name"
              type="text"
              class="input"
              value={paperName}
              onInput={(e) => applyExamination((e.target as HTMLInputElement).value)}
            />
          </Field>

          {bank === null && (
            <div class="fieldrow">
              <Field label="File" for="ex-path">
                <input
                  id="ex-path"
                  class="input mono"
                  value={newBankPath}
                  onInput={(e) => chooseNewBankPath((e.target as HTMLInputElement).value)}
                />
              </Field>
              <Field label="Bank name" for="ex-bankname" hint="Shown in Klunk, optional">
                <input
                  id="ex-bankname"
                  class="input"
                  placeholder="IB Design Technology Paper 1"
                  value={newBankName}
                  onInput={(e) => setNewBankName((e.target as HTMLInputElement).value)}
                />
              </Field>
            </div>
          )}
          {pathFault && <p class="missing">{pathFault}</p>}

          <p class="det__label" style={{ marginTop: '0.6rem' }}>
            {read.adopted.length} question{read.adopted.length === 1 ? '' : 's'} read
            {/^\d{4}$/.test(yearText.trim()) && ` from the ${yearText.trim()} paper`} ·{' '}
            {read.adopted.reduce((sum, a) => sum + a.question.marks, 0)} marks
          </p>
          {/* Which reader claimed the document, for the reason the syllabus tab
              says it: if Klunk has taken this for the wrong shape, the questions
              below are what look wrong, and this line is what says why. */}
          <p class="hint">
            {read.format === undefined
              ? 'An AI transcribed these from the scan. Klunk did not read the paper itself.'
              : `Klunk read this as ${PAPER_FORMAT_DESCRIPTIONS[read.format]}.`}
            {read.guideFormat !== undefined &&
              ` The marking guide is ${GUIDE_FORMAT_DESCRIPTIONS[read.guideFormat]}.`}
          </p>

          <ol class="drafts">
            {live.map((item, i) => (
              <ExtractedCard
                key={item.question.id}
                item={item}
                at={i}
                bankPath={bankPath}
                onTogglePicture={(n) => togglePicture(item.question.id, n)}
                saved={alreadySaved.has(savedAs(item))}
                savedAs={renamed[item.question.id]}
                onEdit={() =>
                  onEdit({ question: item.question, file: bankPath, fresh: true })
                }
                onDiscard={() => setDiscarded((d) => [...d, item.question.id])}
              />
            ))}
          </ol>

          {/* "Saved or discarded" was said whenever nothing was left to save,
              which included nothing having been read in the first place. Both
              readers now refuse a document they cannot read, so this branch
              should be unreachable — it stays because a line claiming a
              successful run of nothing is the fault #64 was filed for. */}
          {read.adopted.length === 0 ? (
            <p class="hint">No questions were read from this paper.</p>
          ) : unsaved.length === 0 ? (
            <p class="hint">Everything here has been saved or discarded.</p>
          ) : (
            <div class="rowbtns">
              <button
                class="btn btn--primary"
                disabled={ready.length === 0 || saving || !bankPath || pathFault !== null}
                onClick={() => void saveReady()}
              >
                {saving
                  ? 'Saving…'
                  : `Save ${ready.length} question${ready.length === 1 ? '' : 's'} into this bank`}
              </button>
              {stuck > 0 && (
                <p class="hint">
                  {stuck} of these cannot be saved from here. Open one in the editor to
                  finish it.
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

/**
 * One document, chosen however the teacher has it to hand.
 *
 * The paper and its marking guide are the same kind of thing and are chosen the
 * same way, so they are one component and sit side by side. Both routes in are
 * on the box: drag it on, or click anywhere to open the picker, and a folder
 * that already holds PDFs offers those underneath as well. A paper downloaded
 * this morning and a paper filed last year are both one action away.
 *
 * **The list goes once the document is chosen.** A select still reading "Choose
 * a PDF…" beside a paper that is already loaded says nothing true about what
 * will be read; the filename does. Choose a different one puts the box back to
 * empty, which is where all three routes are again, and for the marking guide
 * is also how it goes back to none.
 */
function PdfSlot({
  label,
  id,
  what,
  hint,
  optional,
  path,
  inFolder,
  manifest,
  want,
  busy,
  over,
  onOver,
  onChoose,
  onPick,
  onDrop,
}: {
  label: string
  id: string
  /** Named in the instruction, so each box says which document it wants. */
  what: string
  hint?: string
  optional?: boolean
  path: string
  inFolder: string[]
  /** What the folder already knows its documents are, which orders the list (#74). */
  manifest: Manifest
  /** Which slot this is, so the list is ordered for what this box wants. */
  want: DocumentPurpose
  busy: boolean
  over: boolean
  onOver: (on: boolean) => void
  onChoose: (path: string) => void
  onDrop: (e: DragEvent) => void
  onPick: () => void
}) {
  const filled = path !== ''
  return (
    <div
      class={`slot${filled ? ' slot--filled' : ''}${over ? ' slot--over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
        if (!over) onOver(true)
      }}
      onDragLeave={() => onOver(false)}
      onDrop={onDrop}
      // The whole box is the target, so the button inside it carries no handler
      // of its own: a click on the button bubbles to here and picks once. That
      // is also what makes the box reachable from the keyboard, without a
      // role on a div that holds a select.
      onClick={(e) => {
        if (filled || busy) return
        if ((e.target as HTMLElement).closest('select')) return
        onPick()
      }}
    >
      <p class="rail__label">
        {label}
        {optional && <span class="muted"> (optional)</span>}
      </p>

      {filled ? (
        <>
          <p class="slot__file mono">{path}</p>
          {/* Reading the same paper into a second bank is a real mistake and had
              no warning until the folder remembered where a document's questions
              went (#74). */}
          {historyOf(manifest, path) && <p class="hint">{historyOf(manifest, path)}</p>}
          <button class="btn btn--small" disabled={busy} onClick={() => onChoose('')}>
            Choose a different one
          </button>
        </>
      ) : (
        <>
          <button class="btn btn--small" disabled={busy}>
            {busy ? 'Copying…' : `Choose ${what} on this computer`}
          </button>
          <p class="hint">Or drag it onto this box.</p>
          {inFolder.length > 0 && (
            <p class="slot__inside">
              <label class="hint" for={id}>
                Or one already in your folder:
              </label>
              <select
                id={id}
                class="input"
                value={path}
                onChange={(e) => onChoose((e.target as HTMLSelectElement).value)}
              >
                <option value="">{optional ? 'None' : 'Choose a PDF…'}</option>
                <DocumentOptions paths={inFolder} manifest={manifest} want={want} />
              </select>
            </p>
          )}
        </>
      )}

      {hint && <p class="hint">{hint}</p>}
    </div>
  )
}

/** Where a bank's pictures live, beside the bank rather than mixed in with it. */
/**
 * The second route in, for a paper that is a picture of a paper.
 *
 * It appears only once every reader has refused a document holding no text, so
 * it is never an alternative to reading one Klunk can read. The privacy line is
 * not decoration: every other prompt Klunk writes carries its own content, and
 * the teacher reads the whole of it before copying. This one cannot, because the
 * content is in a file Klunk cannot see, so the teacher attaches the paper
 * themselves and the whole of it leaves their computer (#89).
 */
function TranscribePanel({
  paperPath,
  prompt,
  profileName,
  courseName,
  examination,
  onExamination,
  year,
  onYear,
  pasted,
  onPasted,
  onRead,
}: {
  paperPath: string
  prompt: string
  /** The profile the structure came from, named because a borrowed one is invisible. */
  profileName?: string | undefined
  courseName?: string | undefined
  examination: string
  onExamination: (v: string) => void
  year: string
  onYear: (v: string) => void
  pasted: string
  onPasted: (v: string) => void
  onRead: () => void
}) {
  return (
    <section class="panel">
      <div class="panel__head">
        <p class="panel__title">
          <span class="step">2</span> Transcribe it with an AI
        </p>
        <CopyButton text={prompt} />
      </div>

      <p class="hint">
        Copy the prompt, attach {paperPath} in whatever AI your school pays for, and paste
           the reply into the box below.
      </p>
      <p class="hint">
        You attach the paper yourself, so all of it leaves your computer. Klunk cannot read
           it to show you first.
      </p>

      <div class="slots">
        <Field label="Which examination is this?" for="tr-exam">
          <input
            id="tr-exam"
            class="input"
            value={examination}
            placeholder="Enterprise Computing Year 11 Examination"
            onInput={(e) => onExamination((e.target as HTMLInputElement).value)}
          />
        </Field>
        <Field label="Year" for="tr-year" hint="Printed on every question, so it can be found again.">
          <input
            id="tr-year"
            class="input"
            inputMode="numeric"
            value={year}
            placeholder="2025"
            onInput={(e) => onYear((e.target as HTMLInputElement).value)}
          />
        </Field>
      </div>

      {/* The course above is a default until somebody changes it, and the profile
          follows the course, so the totals in this prompt can be another
          examination's entirely. They are stated to the model as fact, so the
          one thing that must not happen is their arriving unattributed. */}
      <p class="hint">
        {profileName !== undefined
          ? `Structure taken from ${profileName}. Change the course above if that is not ` +
            'this paper.'
          : courseName === undefined
            ? 'The prompt does not say how the paper is laid out. Choose a course above to ' +
              'take that from its profile.'
            : `No paper profile for ${courseName} in this folder, so the prompt does not say ` +
              'how the paper is laid out.'}
      </p>

      <pre class="promptbox">{prompt}</pre>

      <Field label="Paste the reply here" for="tr-reply">
        <textarea
          id="tr-reply"
          class="input"
          rows={6}
          value={pasted}
          placeholder="Paste the whole reply, code block and all."
          onInput={(e) => onPasted((e.target as HTMLTextAreaElement).value)}
        />
      </Field>

      <div class="panel__act">
        <button class="btn btn--primary" disabled={!pasted.trim()} onClick={onRead}>
          Read the reply
        </button>
      </div>
    </section>
  )
}

function imageDirectory(bankPath: string): string {
  const slash = bankPath.lastIndexOf('/')
  return slash < 0 ? 'stimulus' : `${bankPath.slice(0, slash)}/stimulus`
}

/** `copyFileInto` returns a filename; a stimulus wants it relative to the bank. */
function relativeToBank(bankPath: string, directory: string, name: string): string {
  const full = directory ? `${directory}/${name}` : name
  const bankDir = bankPath.slice(0, Math.max(0, bankPath.lastIndexOf('/')))
  return bankDir && full.startsWith(`${bankDir}/`) ? full.slice(bankDir.length + 1) : full
}

function ExtractedCard({
  item,
  at,
  saved,
  savedAs,
  bankPath,
  onEdit,
  onDiscard,
  onTogglePicture,
}: {
  item: Adopted
  at: number
  saved: boolean
  savedAs?: string | undefined
  bankPath: string
  onEdit: () => void
  onDiscard: () => void
  onTogglePicture: (at: number) => void
}) {
  const [open, setOpen] = useState(false)
  const q = item.question
  const errors = item.faults.filter((f) => f.severity === 'error')
  const state = saved ? 'saved' : errors.length > 0 ? 'bad' : 'ready'

  return (
    <li class={`draft draft--${state}`}>
      <div class="draft__head">
        <span class="draft__n">{at + 1}</span>
        <span class="draft__stem">{questionLabel(q)}</span>
        <span class="draft__state">
          {saved ? 'Saved' : errors.length > 0 ? `${errors.length} to fix` : 'Ready'}
        </span>
      </div>

      <p class="det__label">
        <span class="mono">{savedAs ?? q.id}</span> · {QUESTION_TYPE_LABELS[q.questionType]} ·{' '}
        {q.marks} mark{q.marks === 1 ? '' : 's'}
        {/* The page is what a doubtful question gets checked against, so it is on
            the card rather than hidden behind the detail. A transcribed question
            has none: nobody read the pages, so there is no page to name. */}
        {item.pages.length > 0 &&
          ` · page${item.pages.length === 1 ? '' : 's'} ${item.pages.join(', ')}`}
        {q.source?.year !== undefined && ` · ${q.source.year} Q${q.source.questionNumber}`}
      </p>

      {savedAs && (
        <div class="draft__note">
          <p>
            <span class="mono">{q.id}</span> had been taken since you opened this folder,
            so this went in as <span class="mono">{savedAs}</span> rather than replacing
            theirs.
          </p>
        </div>
      )}

      {item.pictures.length > 0 && (
        <div class="draft__note">
          <p class="det__label">
            {item.pictures.filter((p) => p.keep).length} of {item.pictures.length} picture
            {item.pictures.length === 1 ? '' : 's'} will be saved with this question
          </p>
          <p class="hint">
            Drop any picture that is not part of the question. Klunk cuts these from the
               page, so some will be wrong.
          </p>
          <ul class="cutouts">
            {item.pictures.map((picture, n) => (
              <li key={n} class={picture.keep ? '' : 'cutouts--dropped'}>
                <img src={picture.cutout.url} alt={`Picture ${n + 1} from page ${picture.cutout.region.page}`} />
                <button class="btn btn--small" onClick={() => onTogglePicture(n)} disabled={saved}>
                  {picture.keep ? 'Drop this one' : 'Keep it after all'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {item.notes.length > 0 && (
        <div class="draft__note">
          <p class="det__label">Worth checking against the paper</p>
          <ul class="plain">
            {item.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {item.faults.length > 0 && (
        <div class={`draft__note ${errors.length > 0 ? 'draft__note--bad' : ''}`}>
          <p class="det__label">
            {errors.length > 0 ? 'Cannot be saved until this is fixed' : 'Worth knowing'}
          </p>
          <CheckList checks={item.faults} />
        </div>
      )}

      <div class="rowbtns">
        <button class="btn btn--small" onClick={() => setOpen(!open)}>
          {open ? 'Hide the question' : 'Show the whole question'}
        </button>
        {!saved && (
          <>
            <button class="btn btn--small" onClick={onEdit}>
              {errors.length > 0 ? 'Fix it in the editor' : 'Open in the editor'}
            </button>
            <button class="btn btn--small" onClick={onDiscard}>
              Discard
            </button>
          </>
        )}
      </div>

      {open && (
        <div class="qrow__detail">
          {/* The heading above shows the stem, so it is not repeated here —
              unless it holds a table, which a clamped heading cannot show (#88). */}
          <QuestionDetail question={q} showStem={hasMarkup(q.questionText)} />
          <p class="det__label" style={{ marginTop: '0.6rem' }}>
            Will be saved into <span class="mono">{bankPath}</span>
          </p>
        </div>
      )}
    </li>
  )
}
