/**
 * The Year 8 Word paper's pictures, question by question (#207).
 *
 * Established by unzipping the paper and looking at every picture in a question
 * row: nineteen of them. Nine are Efofex formulas, all in the Advanced band,
 * and name themselves in their alt text. Six are pasted screenshots of
 * formulas (Support 6, 8 and 9, Standard 2, 4 and 8) and four are diagrams
 * (Standard 7, Extension 3, Beyond 1 and 7). Nothing in the file tells the
 * screenshots from the diagrams, so all ten are offered, and the reply's own
 * description decides which start kept. The two pictures outside any table
 * are the cover's.
 *
 * Pinned picture by picture rather than counted, because a count of seven
 * survives every picture landing one question late.
 */

/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { YEAR8_PAPER, YEAR8_TERM2_PAPER, have } from '../testing/corpus'
import { readZipMember } from '../documents/docx'
import { pictureRows } from '../documents/docxmedia'
import { placeWordPictures, wordQuestions } from './wordpictures'

async function questionsOf(path: string) {
  const file = readFileSync(path)
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
  const document = await readZipMember(bytes, 'word/document.xml')
  const rels = await readZipMember(bytes, 'word/_rels/document.xml.rels')
  return wordQuestions(pictureRows(document, rels))
}

const BANDS = ['Support', 'Standard', 'Advanced', 'Extension', 'Beyond']

/** Each picture as its band, its question, its file and any option it is, in paper order. */
function labelled(questions: Awaited<ReturnType<typeof questionsOf>>): string[] {
  let band = -1
  const found: string[] = []
  for (const q of questions) {
    if (q.number === 1) band++
    for (const p of q.pictures) {
      const option = p.choice === undefined ? '' : ` option ${'ABCDEFGH'[p.choice]}`
      found.push(`${BANDS[band]} ${q.number} ${p.member.slice(11)}${option}`)
    }
  }
  return found
}

describe.skipIf(!have(YEAR8_PAPER))('the 2025 Year 8 Word paper', () => {
  // Support's Question 1 sets its sub-questions as a table inside its row. A
  // lazy match ended the band's table there and found one question, not nine.
  it('numbers its bands from 1, one row per question', async () => {
    const numbers = (await questionsOf(YEAR8_PAPER)).map((q) => q.number)
    const runs: number[][] = []
    for (const n of numbers) {
      if (n === 1) runs.push([])
      runs[runs.length - 1]!.push(n)
    }
    expect(runs.map((r) => r.length)).toEqual([9, 9, 9, 9, 7])
  })

  it('gives each diagram and screenshot to its own question, and no formula to any', async () => {
    expect(labelled(await questionsOf(YEAR8_PAPER))).toEqual([
      'Support 6 image3.png',
      'Support 8 image4.png',
      'Support 9 image5.png',
      'Standard 2 image6.png',
      'Standard 4 image7.png',
      'Standard 7 image8.png',
      'Standard 8 image9.png',
      'Extension 3 image19.png',
      'Beyond 1 image20.png',
      'Beyond 7 image21.png',
    ])
  })

  it('lands them on a reply that numbers the paper as it prints', async () => {
    const questions = await questionsOf(YEAR8_PAPER)
    const placed = placeWordPictures(
      questions.map((q) => ({ number: q.number })),
      questions,
    )
    expect(placed?.map((p) => p.length)).toEqual(questions.map((q) => q.pictures.length))
  })
})

// Every picture in a question row here is a diagram or a choice: it has no
// Efofex formulas, and no pasted screenshots of one.
describe.skipIf(!have(YEAR8_TERM2_PAPER))('the 2025 Year 8 Term 2 Word paper', () => {
  it('numbers its bands from 1, one row per question', async () => {
    const numbers = (await questionsOf(YEAR8_TERM2_PAPER)).map((q) => q.number)
    expect(numbers.filter((n) => n === 1)).toHaveLength(5)
    expect(numbers).toHaveLength(40)
  })

  // Advanced 3's sector and Beyond 4's triangle are drawn with Efofex FX Draw,
  // and were dropped as formulas until only FX Equation's were.
  it('keeps the diagrams Efofex drew', async () => {
    const found = labelled(await questionsOf(YEAR8_TERM2_PAPER))
    expect(found).toContain('Advanced 3 image20.png')
    expect(found).toContain('Beyond 4 image31.png')
  })

  // Support 6 and Beyond 3 set their options in a table inside the question's
  // row (#238). Support 6's are formulas pasted as pictures down a column,
  // with the triangle, image8, beside A in a third column; Beyond 3's are
  // shapes across a row under their letters.
  it('gives each picture to its own question', async () => {
    expect(labelled(await questionsOf(YEAR8_TERM2_PAPER))).toEqual([
      'Support 1 image3.png',
      'Support 2 image4.png',
      'Support 3 image5.png',
      'Support 5 image6.jpeg',
      'Support 6 image7.png option A',
      'Support 6 image8.png',
      'Support 6 image9.png option B',
      'Support 6 image10.png option C',
      'Support 6 image11.png option D',
      'Support 10 image12.png',
      'Standard 1 image13.png',
      'Standard 3 image14.png',
      'Standard 4 image15.png',
      'Standard 5 image16.png',
      'Advanced 1 image17.png',
      'Advanced 1 image18.png',
      'Advanced 2 image19.jpeg',
      'Advanced 3 image20.png',
      'Advanced 5 image21.png',
      'Extension 2 image22.png',
      'Extension 3 image23.png',
      'Extension 4 image24.png',
      'Beyond 1 image25.png',
      'Beyond 2 image26.png',
      'Beyond 3 image27.png option A',
      'Beyond 3 image28.png option B',
      'Beyond 3 image29.png option C',
      'Beyond 3 image30.png option D',
      'Beyond 4 image31.png',
      'Beyond 5 image32.png',
    ])
  })
})
