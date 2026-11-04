import { describe, expect, it } from 'vitest'
import type { PictureRow } from '../documents/docxmedia'
import { isFormulaPicture, placeWordPictures, wordQuestions } from './wordpictures'

const picture = (member: string, alt = '') => ({ member, alt })
const row = (table: number, first: string, ...members: string[]): PictureRow => ({
  table,
  cells: [first, 'stem'],
  pictures: members.map((m) => picture(m)),
})

describe('wordQuestions', () => {
  it("reads a number however Word's runs left it", () => {
    const rows = [row(0, '1 .'), row(0, '2.'), row(0, 'Q3'), row(0, '4)'), row(0, '5')]
    expect(wordQuestions(rows).map((q) => q.number)).toEqual([1, 2, 3, 4, 5])
  })

  it('gives a row with no number to the question above it in the same table', () => {
    const rows = [row(0, 'SUPPORT BAND', 'h.png'), row(0, '1 .', 'a.png'), row(0, '', 'b.png')]
    expect(wordQuestions(rows)).toEqual([
      { number: 1, pictures: [picture('a.png'), picture('b.png')] },
    ])
  })

  it('does not carry a picture across into the next table', () => {
    const rows = [row(0, '9 .'), row(1, 'EXTENSION BAND', 'banner.png'), row(1, '1 .')]
    expect(wordQuestions(rows)).toEqual([
      { number: 9, pictures: [] },
      { number: 1, pictures: [] },
    ])
  })

  it('takes a number that starts a sentence as a sentence, not a question', () => {
    expect(wordQuestions([row(0, '3 m by 4 m')])).toEqual([])
  })

  it('leaves out a formula Efofex set as a picture', () => {
    const rows: PictureRow[] = [
      {
        table: 0,
        cells: ['2 .', 'If , evaluate:'],
        pictures: [
          picture('fx.png', 'x equals 2 \n\nefofex://fxe/07b2/xxxx\n\nFXData:AAAL'),
          picture('shape.png'),
        ],
      },
    ]
    expect(wordQuestions(rows)[0]!.pictures).toEqual([picture('shape.png')])
  })

  it('keeps a diagram Efofex drew, which carries the same payload as a formula', () => {
    const sector = picture(
      'sector.png',
      'FX Draw object\n\n\nefofex://fxd/53de/xxxx\n\nFXData:AAAK',
    )
    const rows: PictureRow[] = [
      { table: 0, cells: ['3.', 'Find the area of this sector.'], pictures: [sector] },
    ]
    expect(wordQuestions(rows)[0]!.pictures).toEqual([sector])
  })
})

describe('isFormulaPicture', () => {
  it('cannot tell a pasted screenshot of a formula from a diagram', () => {
    expect(isFormulaPicture(picture('a.png', 'A black text on a white background'))).toBe(false)
    expect(isFormulaPicture(picture('a.png', ''))).toBe(false)
  })
})

describe('placeWordPictures', () => {
  // The Year 8 paper numbers each of its five bands from 1 (#208).
  const bands = [
    { number: 1, pictures: [picture('support1.png')] },
    { number: 2, pictures: [] },
    { number: 1, pictures: [] },
    { number: 2, pictures: [picture('standard2.png')] },
  ]
  const numbered = (...numbers: (number | undefined)[]) => numbers.map((number) => ({ number }))

  it('walks a paper that numbers each band from 1 in order', () => {
    expect(placeWordPictures(numbered(1, 2, 1, 2), bands)).toEqual([
      [picture('support1.png')],
      [],
      [],
      [picture('standard2.png')],
    ])
  })

  it('skips a question the reply left out without losing its place', () => {
    expect(placeWordPictures(numbered(1, 1, 2), bands)).toEqual([
      [picture('support1.png')],
      [],
      [picture('standard2.png')],
    ])
  })

  it('gives nothing to a question with no number or no row', () => {
    expect(placeWordPictures(numbered(1, undefined, 1, 7), bands)).toEqual([
      [picture('support1.png')],
      [],
      [],
      [],
    ])
  })

  // Found by Codex. Walking forward gave Standard 1 the picture of Support 1,
  // which was then kept and its warning taken back.
  it('places nothing where the reply left out a whole band', () => {
    expect(placeWordPictures(numbered(1, 2), bands)).toBeNull()
    expect(
      placeWordPictures(
        [
          { number: 1, section: 'Standard' },
          { number: 2, section: 'Standard' },
        ],
        bands,
      ),
    ).toBeNull()
  })

  it('tells bands apart by section where the numbering does not restart', () => {
    // Support 2 and Standard 1 were both left out: 1 then 2 reads as one band
    // by number alone.
    expect(
      placeWordPictures(
        [
          { number: 1, section: 'Support' },
          { number: 2, section: 'Standard' },
        ],
        bands,
      ),
    ).toEqual([[picture('support1.png')], [picture('standard2.png')]])
  })

  it('matches by number alone in a paper that numbers its questions once', () => {
    const once = [
      { number: 1, pictures: [] },
      { number: 2, pictures: [picture('two.png')] },
      { number: 3, pictures: [] },
    ]
    expect(
      placeWordPictures(
        [
          { number: 2, section: 'I' },
          { number: 3, section: 'II' },
        ],
        once,
      ),
    ).toEqual([[picture('two.png')], []])
  })
})
