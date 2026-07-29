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
import { emptyIndex, joinPath, releaseImages, scanFolder } from './storage'
import type { Bank } from './types'

/* -------------------------------------------------- a folder made of strings */

type Node = string | Map<string, Node>

/** Build a directory tree from a flat map of folder-relative path to contents. */
function tree(files: Record<string, string>): Map<string, Node> {
  const root = new Map<string, Node>()
  for (const [path, content] of Object.entries(files)) {
    const parts = path.split('/')
    const name = parts.pop() as string
    let here = root
    for (const part of parts) {
      const next = here.get(part)
      if (next instanceof Map) {
        here = next
      } else {
        const made = new Map<string, Node>()
        here.set(part, made)
        here = made
      }
    }
    here.set(name, content)
  }
  return root
}

function fileHandle(name: string, content: string): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () => ({ name, text: async () => content }),
  } as unknown as FileSystemFileHandle
}

function dirHandle(node: Map<string, Node>, name = 'content'): FileSystemDirectoryHandle {
  const handle = {
    kind: 'directory',
    name,
    async *entries(): AsyncGenerator<[string, unknown]> {
      for (const [child, value] of node) {
        yield [child, value instanceof Map ? dirHandle(value, child) : fileHandle(child, value)]
      }
    },
    async getDirectoryHandle(child: string) {
      const value = node.get(child)
      if (!(value instanceof Map)) throw new Error(`no such directory: ${child}`)
      return dirHandle(value, child)
    },
    async getFileHandle(child: string) {
      const value = node.get(child)
      if (typeof value !== 'string') throw new Error(`no such file: ${child}`)
      return fileHandle(child, value)
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
