import { describe, expect, it } from 'vitest'
import { render } from 'preact-render-to-string'
import { emptyIndex } from '../folder/storage'
import { resolvePaper } from '../papers/paper'
import { PrintablePaper } from '../papers/render'
import { QuestionDetail } from '../questions/question'
import type { Paper, Question } from './types'
import { Working } from './workingview'

/**
 * A sample answer or a working step that is a table prints as a table, as the
 * question text already does (#262). Each was span-level, so the reader's pipes
 * reached the screen and the printed guide as they were typed.
 */

const TABLE = '| Score | Frequency |\n| --- | --- |\n| 1 | 3 |\n| 2 | 5 |'

const question: Question = {
  id: 'freq',
  questionType: 'short_answer',
  questionText: 'Fill in the missing values in the frequency table.',
  marks: 2,
  markingGuide: { sampleAnswer: `Read each bar.\n${TABLE}` },
  config: {
    parts: [{ label: 'a', text: 'Complete it.', marks: 1, sampleAnswer: TABLE }],
  },
}

/** Drawn as a table, with no raw separator left over. */
function drawsTable(html: string): void {
  expect(html).toContain('<th>Score</th>')
  expect(html).toContain('<td>5</td>')
  expect(html).not.toContain('| --- |')
}

describe('a table in an answer (#262)', () => {
  it('draws on screen, in the sample answer and in a part’s', () => {
    const html = render(<QuestionDetail question={question} />)
    drawsTable(html)
    expect(html.match(/<table class="richtable">/g)).toHaveLength(2)
    expect(html).toContain('Read each bar.')
  })

  it('keeps the whole answer, table and all, inside one sample box', () => {
    const html = render(<QuestionDetail question={question} />)
    expect(html).toContain(
      '<div class="sample"><p class="richp answer-line">Read each bar.</p><table class="richtable">',
    )
    expect(html).toContain('<div class="parts-list__sample"><table class="richtable">')
  })

  it('draws on the printed marking guide', () => {
    const index = emptyIndex()
    index.banks.push({
      path: 'bank/y8.json',
      data: { formatVersion: '1', type: 'klunk_bank', syllabusId: 'maths', questions: [question] },
    })
    const paper: Paper = {
      formatVersion: '1',
      type: 'klunk_paper',
      id: 'p',
      title: 'Paper',
      sections: [{ refs: [{ file: 'bank/y8.json', questionId: 'freq' }] }],
    }
    const html = render(<PrintablePaper resolved={resolvePaper(index, paper)} mode="guide" />)
    drawsTable(html)
    expect(html.match(/<table class="richtable">/g)).toHaveLength(2)
    expect(html).toContain('<div class="guide__sample"><p class="richp answer-line">')
  })

  it('draws in a working step', () => {
    drawsTable(render(<Working working={[{ steps: [{ text: TABLE, marks: 1 }] }]} />))
  })
})
