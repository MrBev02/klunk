/**
 * Pictures in a Word document's table rows, on markup written here.
 *
 * The real paper is read in `wordpictures.corpus.test.ts`, which skips without
 * the content folder. This covers the markup's own cases wherever it runs.
 */

import { describe, expect, it } from 'vitest'
import { imageType, pictureRows } from './docxmedia'

const RELS =
  '<Relationships>' +
  '<Relationship Id="rId7" Type="image" Target="media/image1.png"/>' +
  '<Relationship Id="rId8" Type="image" Target="media/image2.jpeg"/>' +
  '<Relationship Id="rId9" Type="image" Target="file:///C:/x.png" TargetMode="External"/>' +
  '</Relationships>'

function drawing(id: string, descr = ''): string {
  return (
    '<w:r><w:drawing><wp:inline>' +
    `<wp:docPr id="1" name="Picture 1"${descr ? ` descr="${descr}"` : ''}/>` +
    `<a:graphic><pic:pic><pic:blipFill><a:blip r:embed="${id}"/></pic:blipFill></pic:pic></a:graphic>` +
    '</wp:inline></w:drawing></w:r>'
  )
}

const cell = (...paras: string[]) => `<w:tc>${paras.map((p) => `<w:p>${p}</w:p>`).join('')}</w:tc>`
const text = (t: string) => `<w:r><w:t>${t}</w:t></w:r>`
const row = (...cells: string[]) => `<w:tr>${cells.join('')}</w:tr>`
const table = (...rows: string[]) => `<w:tbl>${rows.join('')}</w:tbl>`

describe('pictureRows', () => {
  it('names the file each picture in a row is kept in, and its alt text', () => {
    const xml = table(
      row(cell(text('1')), cell(text('Find the perimeter.') + drawing('rId7', 'A pentagon'))),
      row(cell(text('2')), cell(text('Simplify.'))),
    )
    expect(pictureRows(xml, RELS)).toEqual([
      {
        table: 0,
        cells: ['1', 'Find the perimeter.'],
        pictures: [{ member: 'word/media/image1.png', alt: 'A pentagon' }],
      },
      { table: 0, cells: ['2', 'Simplify.'], pictures: [] },
    ])
  })

  it('reads alt text with its entities, which Efofex fills with line breaks', () => {
    const xml = table(row(cell(text('2')), cell(drawing('rId8', 'x equals 2 &#xA;efofex://fxe/1'))))
    expect(pictureRows(xml, RELS)[0]!.pictures).toEqual([
      { member: 'word/media/image2.jpeg', alt: 'x equals 2 \nefofex://fxe/1' },
    ])
  })

  it('counts tables, so a reader can tell where one ends', () => {
    const xml = table(row(cell(text('1')))) + '<w:p/>' + table(row(cell(text('1'))))
    expect(pictureRows(xml, RELS).map((r) => r.table)).toEqual([0, 1])
  })

  // The Year 8 paper's first question sets its sub-questions as a table in its
  // row, and a lazy match ended the outer table there, losing the rest (#207).
  it('keeps a table nested in a row inside that row', () => {
    const inner = table(row(cell(text('the sum of a and b'))), row(cell(text('the product'))))
    const xml = table(
      '<w:tblPr><w:tblW w:w="0"/></w:tblPr>',
      row('<w:trPr><w:trHeight w:val="1"/></w:trPr>', cell(text('1.')), cell(inner)),
      row(cell(text('2.')), cell(text('Evaluate.') + drawing('rId7'))),
    )
    expect(pictureRows(xml, RELS)).toEqual([
      { table: 0, cells: ['1.', 'the sum of a and b the product'], pictures: [] },
      {
        table: 0,
        cells: ['2.', 'Evaluate.'],
        pictures: [{ member: 'word/media/image1.png', alt: '' }],
      },
    ])
  })

  it("takes no linked picture, which is a file on the author's own disk", () => {
    const xml = table(row(cell(text('1')), cell(drawing('rId9'))))
    expect(pictureRows(xml, RELS)[0]!.pictures).toEqual([])
  })

  it('takes no picture outside a table', () => {
    expect(pictureRows(`<w:p>${drawing('rId7')}</w:p>`, RELS)).toEqual([])
  })
})

/*
 * The two layouts the Year 8 Term 2 task sets its options in (#238), each a
 * table inside the question's row.
 */
describe('a picture beside a letter', () => {
  const tc = (inner: string) => `<w:tc>${inner}</w:tc>`
  const pic = (id: string) => cell(drawing(id))
  const choicesOf = (xml: string) =>
    pictureRows(xml, RELS)[0]!.pictures.map((p) => p.choice ?? 'question')

  it('takes a column of pictures beside a column of letters, and not the diagram beside A', () => {
    const options = table(
      row(cell(text('A.')), pic('rId7'), pic('rId8')),
      row(cell(text('B.')), pic('rId7'), cell()),
      row(cell(text('C.')), pic('rId7'), cell()),
    )
    const xml = table(
      row(cell(text('6.')), tc(`<w:p>${text('Circle the true statement.')}</w:p>${options}`)),
    )
    expect(choicesOf(xml)).toEqual([0, 'question', 1, 2])
  })

  it('takes the picture under each letter of a row of them', () => {
    const options = table(
      row(cell(text('A.')), cell(text('B.')), cell(text('C.'))),
      row(pic('rId7'), pic('rId7'), pic('rId7')),
    )
    const xml = table(row(cell(text('3.')), tc(`<w:p>${text('Which shape?')}</w:p>${options}`)))
    expect(choicesOf(xml)).toEqual([0, 1, 2])
  })

  // Support 3 letters typed formulas and sets the sector beside A.
  it('takes nothing where the options are words and one picture sits beside them', () => {
    const options = table(
      row(cell(text('A.')), cell(text('60 × 13')), pic('rId7')),
      row(cell(text('B.')), cell(text('60 ÷ 13')), cell()),
    )
    const xml = table(row(cell(text('3.')), tc(options)))
    expect(choicesOf(xml)).toEqual(['question'])
  })

  it('takes nothing from letters that do not run from A', () => {
    const options = table(row(cell(text('B.')), pic('rId7')), row(cell(text('C.')), pic('rId7')))
    const xml = table(row(cell(text('3.')), tc(options)))
    expect(choicesOf(xml)).toEqual(['question', 'question'])
  })
})

describe('imageType', () => {
  it('knows what a browser draws', () => {
    expect(imageType('word/media/image1.png')).toBe('image/png')
    expect(imageType('word/media/image2.JPG')).toBe('image/jpeg')
  })

  it('refuses a Windows metafile, which no browser shows', () => {
    expect(imageType('word/media/image3.emf')).toBeUndefined()
    expect(imageType('word/media/image4.wmf')).toBeUndefined()
  })
})
