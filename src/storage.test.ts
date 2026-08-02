/**
 * Tests for folder scanning, specifically the parts that leak or lose data
 * rather than merely look wrong.
 *
 * Object URLs live until the page unloads. A teacher reloads the folder and
 * saves a paper many times in a sitting, and each of those rescans builds a
 * fresh set, so a missed release is a leak that grows all afternoon. Nothing on
 * screen changes when it happens, which is exactly why it needs a test.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  allQuestions,
  copyFileInto,
  emptyIndex,
  inSyllabus,
  joinPath,
  mergeFolder,
  releaseImages,
  safeFilename,
  savePaper,
  saveQuestion,
  scanFolder,
  type ContentIndex,
} from './storage'
import type { Bank, Loaded, Paper, Question } from './types'

/* -------------------------------------------------- a folder made of strings */

/**
 * A directory tree in memory, writable, standing in for the File System Access
 * API. Writable because the interesting failures are writes: a save that
 * flattens the rest of a bank, or an image copy that replaces a picture some
 * other question was using.
 */
type Node = string | Blob | Directory
type Directory = Map<string, Node>

/** Build a directory tree from a flat map of folder-relative path to contents. */
function tree(files: Record<string, string>): Directory {
  const root: Directory = new Map()
  for (const [path, content] of Object.entries(files)) {
    const parts = path.split('/')
    const name = parts.pop() as string
    let here = root
    for (const part of parts) {
      const next = here.get(part)
      if (next instanceof Map) {
        here = next
      } else {
        const made: Directory = new Map()
        here.set(part, made)
        here = made
      }
    }
    here.set(name, content)
  }
  return root
}

/** Read a path out of a tree, for asserting on what a write actually did. */
function read(node: Directory, path: string): Node | undefined {
  let here: Node | undefined = node
  for (const part of path.split('/')) {
    if (!(here instanceof Map)) return undefined
    here = here.get(part)
  }
  return here
}

function readJson(node: Directory, path: string): unknown {
  const value = read(node, path)
  if (typeof value !== 'string') throw new Error(`not a text file: ${path}`)
  return JSON.parse(value)
}

function fileHandle(parent: Directory, name: string): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () => {
      const value = parent.get(name)
      const text = value instanceof Blob ? await value.text() : String(value ?? '')
      return { name, text: async () => text, size: text.length }
    },
    createWritable: async () => ({
      write: async (data: unknown) => {
        parent.set(name, data instanceof Blob ? data : String(data))
      },
      close: async () => undefined,
    }),
  } as unknown as FileSystemFileHandle
}

function dirHandle(node: Directory, name = 'content'): FileSystemDirectoryHandle {
  const handle = {
    kind: 'directory',
    name,
    async *entries(): AsyncGenerator<[string, unknown]> {
      for (const [child, value] of node) {
        yield [child, value instanceof Map ? dirHandle(value, child) : fileHandle(node, child)]
      }
    },
    async getDirectoryHandle(child: string, options?: { create?: boolean }) {
      const value = node.get(child)
      if (value instanceof Map) return dirHandle(value, child)
      if (!options?.create) throw new Error(`no such directory: ${child}`)
      const made: Directory = new Map()
      node.set(child, made)
      return dirHandle(made, child)
    },
    async getFileHandle(child: string, options?: { create?: boolean }) {
      const value = node.get(child)
      if (value === undefined) {
        if (!options?.create) throw new Error(`no such file: ${child}`)
        node.set(child, '')
      } else if (value instanceof Map) {
        throw new Error(`${child} is a directory`)
      }
      return fileHandle(node, child)
    },
  }
  return handle as unknown as FileSystemDirectoryHandle
}

/** A folder holding one bank whose question points at one stimulus image. */
function folderWithImage(): FileSystemDirectoryHandle {
  const bank: Bank = {
    formatVersion: '1',
    type: 'klunk_bank',
    name: 'Test bank',
    questions: [
      {
        id: 'q1',
        questionType: 'short_answer',
        questionText: 'Evaluate the handle shown.',
        marks: 4,
        stimulus: [{ kind: 'image', file: 'stimulus/handle.png' }],
      },
    ],
  }
  return dirHandle(
    tree({
      'bank/design.json': JSON.stringify(bank),
      'bank/stimulus/handle.png': 'not really a png',
    }),
  )
}

/* ------------------------------------------------------ object URL bookkeeping */

const real = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
let created: string[] = []
let revoked: string[] = []

beforeEach(() => {
  created = []
  revoked = []
  URL.createObjectURL = (() => {
    const url = `blob:test/${created.length}`
    created.push(url)
    return url
  }) as typeof URL.createObjectURL
  URL.revokeObjectURL = ((url: string) => {
    revoked.push(url)
  }) as typeof URL.revokeObjectURL
})

afterEach(() => {
  URL.createObjectURL = real.create
  URL.revokeObjectURL = real.revoke
})

/** Object URLs handed out and not yet given back. */
function live(): string[] {
  return created.filter((url) => !revoked.includes(url))
}

describe('scanFolder image loading', () => {
  it('loads an object URL for a referenced stimulus image', async () => {
    const index = await scanFolder(folderWithImage())

    expect(index.banks).toHaveLength(1)
    expect([...index.images.keys()]).toEqual(['bank/stimulus/handle.png'])
    expect(live()).toHaveLength(1)
    expect(index.problems).toHaveLength(0)
  })

  it('reports a referenced image that is not there rather than failing', async () => {
    const bank: Bank = {
      formatVersion: '1',
      type: 'klunk_bank',
      questions: [
        {
          id: 'q1',
          questionType: 'short_answer',
          questionText: 'Evaluate the handle shown.',
          marks: 4,
          stimulus: [{ kind: 'image', file: 'stimulus/gone.png' }],
        },
      ],
    }
    const index = await scanFolder(dirHandle(tree({ 'bank/design.json': JSON.stringify(bank) })))

    expect(index.images.size).toBe(0)
    expect(index.problems).toEqual([
      { path: 'bank/stimulus/gone.png', message: 'image referenced by a question is missing' },
    ])
  })

  it('releases the index it replaces, so rescanning does not accumulate URLs', async () => {
    const dir = folderWithImage()

    const first = await scanFolder(dir)
    const firstUrl = first.images.get('bank/stimulus/handle.png')
    expect(firstUrl).toBeDefined()

    const second = await scanFolder(dir, first)

    // The new index is usable and the old one has given everything back.
    expect(second.images.size).toBe(1)
    expect(revoked).toEqual([firstUrl])
    expect(first.images.size).toBe(0)
    expect(live()).toEqual([second.images.get('bank/stimulus/handle.png')])

    // The point of the fix: many rescans, still one live URL.
    let current = second
    for (let i = 0; i < 5; i += 1) current = await scanFolder(dir, current)
    expect(created).toHaveLength(7)
    expect(live()).toHaveLength(1)
  })

  it('revokes nothing on a first scan, when there is no previous index', async () => {
    await scanFolder(folderWithImage())
    expect(revoked).toEqual([])
  })

  it('keeps the previous index usable when the rescan fails', async () => {
    const first = await scanFolder(folderWithImage())

    const broken = {
      kind: 'directory',
      name: 'content',
      async *entries(): AsyncGenerator<[string, unknown]> {
        throw new Error('permission revoked mid-scan')
      },
    } as unknown as FileSystemDirectoryHandle

    await expect(scanFolder(broken, first)).rejects.toThrow('permission revoked mid-scan')
    expect(first.images.size).toBe(1)
    expect(revoked).toEqual([])
  })
})

describe('releaseImages', () => {
  it('revokes every URL and empties the map', () => {
    const index = emptyIndex()
    index.images.set('a.png', URL.createObjectURL(new Blob()))
    index.images.set('b.png', URL.createObjectURL(new Blob()))

    releaseImages(index)

    expect(revoked).toEqual(created)
    expect(index.images.size).toBe(0)
  })

  it('is safe to call twice', () => {
    const index = emptyIndex()
    index.images.set('a.png', URL.createObjectURL(new Blob()))

    releaseImages(index)
    releaseImages(index)

    expect(revoked).toHaveLength(1)
  })
})

/* ------------------------------------------------------------ writing a question */

function newQuestion(id: string, text = 'Explain the brief.'): Question {
  return { id, questionType: 'short_answer', questionText: text, marks: 4 }
}

describe('saveQuestion', () => {
  it('creates the bank when there is not one yet', async () => {
    const files = tree({})
    const { created } = await saveQuestion(
      dirHandle(files),
      'bank/design.json',
      newQuestion('design-sa-01'),
      { name: 'Design questions', syllabusId: 'nsw-hsc-design-technology' },
    )

    expect(created).toBe(true)
    expect(readJson(files, 'bank/design.json')).toEqual({
      formatVersion: '1',
      type: 'klunk_bank',
      name: 'Design questions',
      syllabusId: 'nsw-hsc-design-technology',
      questions: [newQuestion('design-sa-01')],
    })
  })

  it('adds to a bank without disturbing what is already in it', async () => {
    const existing: Bank = {
      formatVersion: '1',
      type: 'klunk_bank',
      name: 'Design questions',
      syllabusId: 'nsw-hsc-design-technology',
      questions: [newQuestion('design-sa-01'), newQuestion('design-sa-02')],
    }
    const files = tree({ 'bank/design.json': JSON.stringify(existing) })

    const { created } = await saveQuestion(
      dirHandle(files),
      'bank/design.json',
      newQuestion('design-sa-03'),
    )

    expect(created).toBe(false)
    const written = readJson(files, 'bank/design.json') as Bank
    expect(written.questions.map((q) => q.id)).toEqual([
      'design-sa-01',
      'design-sa-02',
      'design-sa-03',
    ])
    expect(written.name).toBe('Design questions')
    expect(written.syllabusId).toBe('nsw-hsc-design-technology')
  })

  it('replaces a question in place, keeping its position in the bank', async () => {
    const was = newQuestion('b', 'Old wording.')
    const existing: Bank = {
      formatVersion: '1',
      type: 'klunk_bank',
      questions: [newQuestion('a'), was, newQuestion('c')],
    }
    const files = tree({ 'bank/design.json': JSON.stringify(existing) })

    await saveQuestion(dirHandle(files), 'bank/design.json', newQuestion('b', 'New wording.'), {
      replacing: { id: 'b', asLoaded: was },
    })

    const written = readJson(files, 'bank/design.json') as Bank
    expect(written.questions.map((q) => q.id)).toEqual(['a', 'b', 'c'])
    expect(written.questions[1]?.questionText).toBe('New wording.')
  })

  // Two teachers, one bank on a shared drive. Both had it open at two
  // questions, so both were handed the same next free id.
  it('gives a new question a free id rather than overwriting the one that took it', async () => {
    const theirs = newQuestion('design-sa-03', 'Written by somebody else.')
    const existing: Bank = {
      formatVersion: '1',
      type: 'klunk_bank',
      questions: [newQuestion('design-sa-01'), newQuestion('design-sa-02'), theirs],
    }
    const files = tree({ 'bank/design.json': JSON.stringify(existing) })

    const written = await saveQuestion(
      dirHandle(files),
      'bank/design.json',
      newQuestion('design-sa-03', 'Written by me.'),
      // No `replacing`: this question is new.
    )

    expect(written.id).toBe('design-sa-04')
    expect(written.reassignedFrom).toBe('design-sa-03')

    const bank = readJson(files, 'bank/design.json') as Bank
    // Nobody lost anything: four questions, and theirs still reads as theirs.
    expect(bank.questions.map((q) => q.id)).toEqual([
      'design-sa-01',
      'design-sa-02',
      'design-sa-03',
      'design-sa-04',
    ])
    expect(bank.questions[2]).toEqual(theirs)
    expect(bank.questions[3]?.questionText).toBe('Written by me.')
  })

  it('says when an edit landed on a question somebody else had changed', async () => {
    const asLoaded = newQuestion('b', 'What I opened.')
    const existing: Bank = {
      formatVersion: '1',
      type: 'klunk_bank',
      questions: [newQuestion('b', 'What somebody else saved while I was typing.')],
    }
    const files = tree({ 'bank/design.json': JSON.stringify(existing) })

    const written = await saveQuestion(
      dirHandle(files),
      'bank/design.json',
      newQuestion('b', 'What I saved.'),
      { replacing: { id: 'b', asLoaded } },
    )

    expect(written.overwroteChanges).toBe(true)
    // Still last-write-wins, but no longer silently.
    expect((readJson(files, 'bank/design.json') as Bank).questions[0]?.questionText).toBe(
      'What I saved.',
    )
  })

  it('says nothing unusual when an edit lands on the question it was opened from', async () => {
    const asLoaded = newQuestion('b', 'Untouched.')
    const files = tree({
      'bank/design.json': JSON.stringify({
        formatVersion: '1',
        type: 'klunk_bank',
        questions: [asLoaded],
      }),
    })

    const written = await saveQuestion(
      dirHandle(files),
      'bank/design.json',
      newQuestion('b', 'Edited.'),
      { replacing: { id: 'b', asLoaded } },
    )

    expect(written.overwroteChanges).toBeUndefined()
    expect(written.reassignedFrom).toBeUndefined()
    expect(written.id).toBe('b')
  })

  it('adds an edited question back when it has gone from the bank', async () => {
    // Somebody deleted it while it was open. The teacher meant to keep it.
    const files = tree({
      'bank/design.json': JSON.stringify({
        formatVersion: '1',
        type: 'klunk_bank',
        questions: [newQuestion('a')],
      }),
    })

    await saveQuestion(dirHandle(files), 'bank/design.json', newQuestion('b', 'Still wanted.'), {
      replacing: { id: 'b', asLoaded: newQuestion('b') },
    })

    const bank = readJson(files, 'bank/design.json') as Bank
    expect(bank.questions.map((q) => q.id)).toEqual(['a', 'b'])
  })

  it('reads the bank from disk rather than trusting a stale copy', async () => {
    // Two saves in a row through separate handles: the second must see the
    // first, which it only does by re-reading.
    const files = tree({})
    await saveQuestion(dirHandle(files), 'bank/design.json', newQuestion('a'))
    await saveQuestion(dirHandle(files), 'bank/design.json', newQuestion('b'))

    const written = readJson(files, 'bank/design.json') as Bank
    expect(written.questions.map((q) => q.id)).toEqual(['a', 'b'])
  })

  it('refuses to write over a file that is not a bank', async () => {
    // Typing an existing paper's name into the "new bank" box would otherwise
    // destroy the paper.
    const paper: Paper = {
      formatVersion: '1',
      type: 'klunk_paper',
      id: 'trial',
      title: 'Trial HSC Examination',
      sections: [],
    }
    const files = tree({ 'papers/trial.json': JSON.stringify(paper) })

    await expect(
      saveQuestion(dirHandle(files), 'papers/trial.json', newQuestion('a')),
    ).rejects.toThrow('not a question bank')
    expect(readJson(files, 'papers/trial.json')).toEqual(paper)
  })
})

describe('copyFileInto', () => {
  it('writes the image and reports the name it used', async () => {
    const files = tree({})
    const name = await copyFileInto(
      dirHandle(files),
      'bank/stimulus',
      'handle.png',
      new Blob(['first']),
    )

    expect(name).toBe('handle.png')
    expect(read(files, 'bank/stimulus/handle.png')).toBeInstanceOf(Blob)
  })

  it('never replaces an image already there', async () => {
    // Two teachers, two photographs, both called handle.png. Overwriting would
    // change a question nobody was editing.
    const dir = tree({ 'bank/stimulus/handle.png': 'the first one' })
    const handle = dirHandle(dir)

    expect(await copyFileInto(handle, 'bank/stimulus', 'handle.png', new Blob(['second']))).toBe(
      'handle-1.png',
    )
    expect(await copyFileInto(handle, 'bank/stimulus', 'handle.png', new Blob(['third']))).toBe(
      'handle-2.png',
    )
    expect(read(dir, 'bank/stimulus/handle.png')).toBe('the first one')
  })
})

/* ------------------------------------------ which subject a question belongs to */

/**
 * Two banks that both use `HSC-01`, because both NSW models do.
 *
 * The generator numbers topics from one within each course, so Design and
 * Technology's first HSC topic and Textiles' first HSC topic have the same id
 * and always will. A folder holding both models — which `../klunk-content` does
 * — therefore cannot tell the two apart from a topic id alone.
 */
function twoSubjects(): ContentIndex {
  const bank = (name: string, syllabusId: string | undefined, ids: string[]): Loaded<Bank> => ({
    path: `bank/${name}.json`,
    data: {
      formatVersion: '1',
      type: 'klunk_bank',
      ...(syllabusId === undefined ? {} : { syllabusId }),
      questions: ids.map((id) => ({
        id,
        questionType: 'short_answer' as const,
        questionText: `Question ${id}`,
        marks: 4,
        syllabus: { topicIds: ['HSC-01'] },
      })),
    },
  })

  return {
    ...emptyIndex(),
    banks: [
      bank('design', 'nsw-hsc-design-technology', ['dt-1']),
      bank('textiles', 'nsw-hsc-textiles-and-design', ['tex-1']),
      bank('loose', undefined, ['loose-1']),
    ],
  }
}

describe('allQuestions', () => {
  it('resolves each question to a syllabus from its bank', () => {
    const found = allQuestions(twoSubjects())
    expect(found.map((r) => [r.question.id, r.syllabusId])).toEqual([
      ['dt-1', 'nsw-hsc-design-technology'],
      ['tex-1', 'nsw-hsc-textiles-and-design'],
      ['loose-1', undefined],
    ])
  })

  it('lets a question override its bank', () => {
    const index = twoSubjects()
    const first = index.banks[0]!.data.questions[0]!
    first.syllabus = { syllabusId: 'nsw-hsc-textiles-and-design', topicIds: ['HSC-01'] }
    expect(allQuestions(index)[0]!.syllabusId).toBe('nsw-hsc-textiles-and-design')
  })
})

describe('inSyllabus', () => {
  it('separates two subjects that share a topic id', () => {
    const found = allQuestions(twoSubjects())
    const tagged = (id: string) =>
      found
        .filter((r) => (r.question.syllabus?.topicIds ?? []).includes('HSC-01'))
        .filter((r) => inSyllabus(r, id))
        .map((r) => r.question.id)

    expect(tagged('nsw-hsc-design-technology')).toEqual(['dt-1', 'loose-1'])
    expect(tagged('nsw-hsc-textiles-and-design')).toEqual(['tex-1', 'loose-1'])
  })

  it('keeps a question that names no syllabus, since nothing rules it out', () => {
    const loose = allQuestions(twoSubjects())[2]!
    expect(inSyllabus(loose, 'nsw-hsc-design-technology')).toBe(true)
    expect(inSyllabus(loose, 'anything-at-all')).toBe(true)
  })
})

/**
 * The write nobody can undo.
 *
 * A paper's file is named from its title, every new paper starts with the same
 * default title, and papers are in no history: whatever a save replaces is gone.
 */
describe('savePaper', () => {
  const paperNamed = (id: string, title: string): Paper => ({
    formatVersion: '1',
    type: 'klunk_paper',
    id,
    title,
    profileId: 'nsw-hsc-design-technology',
    sections: [{ profileSectionId: 'I', refs: [`bank/design.json#${id}`] }],
  })

  it('writes a paper whose file is not there yet', async () => {
    const files = tree({})
    const { path } = await savePaper(dirHandle(files), paperNamed('trial', 'Trial'))

    expect(path).toBe('papers/trial.json')
    expect(readJson(files, 'papers/trial.json')).toEqual(paperNamed('trial', 'Trial'))
  })

  it('refuses to write over a paper it was not opened from, and names it', async () => {
    const theirs = paperNamed('trial-hsc-examination', 'Trial HSC Examination')
    const files = tree({ 'papers/trial-hsc-examination.json': JSON.stringify(theirs) })

    await expect(
      savePaper(dirHandle(files), paperNamed('trial-hsc-examination', 'Trial HSC Examination')),
    ).rejects.toThrow(/already there and holds "Trial HSC Examination"/)

    // The point of the test: the finished paper is untouched.
    expect(readJson(files, 'papers/trial-hsc-examination.json')).toEqual(theirs)
  })

  it('writes when the caller says this paper is the one in that file', async () => {
    const files = tree({
      'papers/trial.json': JSON.stringify(paperNamed('trial', 'Trial')),
    })
    const edited = { ...paperNamed('trial', 'Trial'), status: 'final' as const }

    await savePaper(dirHandle(files), edited, { replacing: true })
    expect(readJson(files, 'papers/trial.json')).toEqual(edited)
  })

  it('refuses a file that is there and is not a paper', async () => {
    const files = tree({ 'papers/trial.json': JSON.stringify({ type: 'klunk_bank' }) })

    await expect(savePaper(dirHandle(files), paperNamed('trial', 'Trial'))).rejects.toThrow(
      /is not a paper/,
    )
  })

  // The other teacher on the shared drive, who saved between this paper being
  // started and this save being pressed. The last scan does not know about it,
  // so the check has to read the folder.
  it('catches a file that appeared after the last scan', async () => {
    const files = tree({})
    const dir = dirHandle(files)
    await savePaper(dir, paperNamed('trial', 'Mine'))

    files.delete('papers')
    const theirs = paperNamed('trial', 'Theirs')
    const appeared = tree({ 'papers/trial.json': JSON.stringify(theirs) })
    for (const [name, node] of appeared) files.set(name, node)

    await expect(savePaper(dir, paperNamed('trial', 'Mine'))).rejects.toThrow(/holds "Theirs"/)
  })
})

describe('safeFilename', () => {
  it('reduces anything a chooser hands over to a plain filename', () => {
    expect(safeFilename('C:\\Users\\Aaron\\bench photo.JPG')).toBe('bench-photo.JPG')
    expect(safeFilename('../../etc/passwd')).toBe('passwd')
    expect(safeFilename('!!!')).toBe('file')
  })
})

describe('joinPath', () => {
  it('resolves a stimulus path against its bank', () => {
    expect(joinPath('bank/design.json', 'stimulus/handle.png')).toBe('bank/stimulus/handle.png')
  })

  it('walks out of the bank folder', () => {
    expect(joinPath('bank/hsc/design.json', '../shared/logo.png')).toBe('bank/shared/logo.png')
  })

  it('treats a leading slash as folder-relative, not filesystem-absolute', () => {
    expect(joinPath('bank/design.json', '/stimulus/handle.png')).toBe('stimulus/handle.png')
  })
})

/* ------------------------------------------------- remembering subject folders */

/**
 * A folder handle that knows only its own identity.
 *
 * `isSameEntry` is the only thing that identifies a directory handle: it
 * carries no path, and two subjects' folders can perfectly well both be called
 * `bank` or `HSC`. Naming them the same here is the point of the test.
 */
function folderHandle(id: string, name = id): FileSystemDirectoryHandle {
  const handle = {
    kind: 'directory',
    name,
    id,
    isSameEntry: async (other: FileSystemHandle) =>
      (other as unknown as { id?: string }).id === id,
  }
  return handle as unknown as FileSystemDirectoryHandle
}

const names = (list: FileSystemDirectoryHandle[]) =>
  list.map((h) => (h as unknown as { id: string }).id)

describe('mergeFolder', () => {
  it('puts the folder just used at the front, so the switcher reads by recency', async () => {
    const dt = folderHandle('dt')
    const textiles = folderHandle('textiles')
    expect(names(await mergeFolder([dt], textiles))).toEqual(['textiles', 'dt'])
  })

  it('does not remember the same folder twice when it is picked again', async () => {
    const dt = folderHandle('dt')
    const textiles = folderHandle('textiles')
    const merged = await mergeFolder([dt, textiles], folderHandle('dt'))
    expect(names(merged)).toEqual(['dt', 'textiles'])
  })

  it('tells two folders apart when they have the same name', async () => {
    // Realistic: a teacher keeps `HSC` inside each subject's Teams folder. Going
    // by name would silently drop one subject the first time the other opened.
    const a = folderHandle('dt-hsc', 'HSC')
    const b = folderHandle('textiles-hsc', 'HSC')
    expect(names(await mergeFolder([a], b))).toEqual(['textiles-hsc', 'dt-hsc'])
  })

  it('keeps the freshly granted handle rather than the stored one', async () => {
    // The stored handle is a structured clone from IndexedDB and its permission
    // may have lapsed; the one just returned by the picker is known good.
    const stored = folderHandle('dt')
    const fresh = folderHandle('dt')
    const merged = await mergeFolder([stored], fresh)
    expect(merged[0]).toBe(fresh)
  })

  it('stops remembering the oldest once the list is full', async () => {
    const existing = ['a', 'b', 'c'].map((id) => folderHandle(id))
    expect(names(await mergeFolder(existing, folderHandle('d'), 3))).toEqual(['d', 'a', 'b'])
  })

  it('survives a handle that cannot answer whether it is the same entry', async () => {
    // A handle for a folder on a drive that has been unplugged. It must not take
    // the whole switcher down with it.
    const broken = {
      kind: 'directory',
      name: 'gone',
      id: 'gone',
      isSameEntry: async () => {
        throw new DOMException('no such entry', 'NotFoundError')
      },
    } as unknown as FileSystemDirectoryHandle
    expect(names(await mergeFolder([broken], folderHandle('dt')))).toEqual(['dt', 'gone'])
  })
})
