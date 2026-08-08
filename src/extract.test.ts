import { describe, expect, it } from 'vitest'
import { extractPaper, toLines } from './extract'
import { markOnly, marked, page, shuffled } from './fixtures/page'

/**
 * Fixtures are fictional, and that is a constraint rather than a convenience.
 *
 * The real corpus is eleven years of NESA papers sitting outside this repo, and
 * it must stay there: this repo is public and a past paper is NESA's. So every
 * fixture below is invented D&T-flavoured text arranged in the *shape* the real
 * papers use. The shapes are the facts worth testing — where a mark sits, how a
 * continuation is announced, which option labels a year used — and none of them
 * require NESA's words to reproduce.
 *
 * The real papers are checked separately by `extract.corpus.test.ts`, which reads
 * the folder outside the repo and skips itself when it is not there, so CI never
 * runs it.
 */

describe('toLines', () => {
  it('rebuilds reading order from positions, not from stream order', () => {
    const p = shuffled(page(1, 'First line here', 'Second line here', 'Third line here'))
    expect(toLines(p).map((l) => l.text)).toEqual([
      'First line here',
      'Second line here',
      'Third line here',
    ])
  })

  it('joins columns on one line with a single space', () => {
    const p = page(1, 'Figure 1        Figure 2')
    expect(toLines(p)[0]!.text).toBe('Figure 1 Figure 2')
  })

  it('lifts a bare number in the right margin off the line as its marks', () => {
    const p = page(1, marked('(a)   Describe one benefit of the frame shown.', 2))
    const [line] = toLines(p)
    expect(line!.marginMark).toBe(2)
    expect(line!.text).toBe('(a) Describe one benefit of the frame shown.')
  })

  it('leaves a number in the body alone', () => {
    // "in 200 households" must not be read as a mark just because it is a number.
    const p = page(1, 'A new kettle was trialled in 200 households over 12 weeks.')
    const [line] = toLines(p)
    expect(line!.marginMark).toBeUndefined()
    expect(line!.text).toContain('200 households')
  })
})

describe('Section I objective questions', () => {
  const stem = (n: number, text: string) => `${n}    ${text}`

  it('reads the (A) labels used up to 2016', () => {
    const paper = extractPaper([
      page(
        2,
        'Section I',
        '10 marks',
        'Attempt Questions 1–10',
        'Use the multiple-choice answer sheet for Questions 1–10.',
        '',
        stem(1, 'Which material is most suitable for a lightweight bicycle frame?'),
        '',
        '     (A) Cast iron',
        '     (B)    Carbon fibre',
        '     (C)    Mild steel',
        '     (D) Lead',
      ),
    ])

    expect(paper.questions).toHaveLength(1)
    const q = paper.questions[0]!
    expect(q.number).toBe(1)
    expect(q.marks).toBe(1)
    expect(q.questionType).toBe('multiple_choice')
    expect(q.text).toBe('Which material is most suitable for a lightweight bicycle frame?')
    expect(q.options).toEqual([
      { label: 'A', text: 'Cast iron' },
      { label: 'B', text: 'Carbon fibre' },
      { label: 'C', text: 'Mild steel' },
      { label: 'D', text: 'Lead' },
    ])
    expect(q.notes).toEqual([])
  })

  it('reads the A. labels used from 2017', () => {
    const paper = extractPaper([
      page(
        2,
        'Section I',
        stem(1, 'What does an ergonomic assessment of a chair measure?'),
        '     A.     Cost of manufacture',
        '     B.     Fit to the user',
        '     C.     Colour range',
        '     D.     Brand recognition',
      ),
    ])
    expect(paper.questions[0]!.options?.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D'])
    expect(paper.questions[0]!.options?.[1]!.text).toBe('Fit to the user')
  })

  it('keeps a wrapped stem together and a wrapped option with its own option', () => {
    const paper = extractPaper([
      page(
        2,
        'Section I',
        stem(1, 'A designer is choosing a finish for an outdoor bench that will stand in'),
        '     full sun for many years.',
        '',
        '     A.     A finish that resists ultraviolet light and can be reapplied',
        '            without removing the bench',
        '     B.     A finish chosen only for its colour',
        '     C.     No finish at all',
        '     D.     A finish intended for indoor use',
      ),
    ])
    const q = paper.questions[0]!
    expect(q.text).toBe(
      'A designer is choosing a finish for an outdoor bench that will stand in full sun for many years.',
    )
    expect(q.options?.[0]!.text).toBe(
      'A finish that resists ultraviolet light and can be reapplied without removing the bench',
    )
    expect(q.options).toHaveLength(4)
  })

  it('reads a run of questions and numbers them in order', () => {
    const paper = extractPaper([
      page(
        2,
        'Section I',
        stem(1, 'First question?'),
        '     A.     One',
        '     B.     Two',
        '     C.     Three',
        '     D.     Four',
        stem(2, 'Second question?'),
        '     A.     One',
        '     B.     Two',
        '     C.     Three',
        '     D.     Four',
        stem(3, 'Third question?'),
        '     A.     One',
        '     B.     Two',
        '     C.     Three',
        '     D.     Four',
      ),
    ])
    expect(paper.questions.map((q) => q.number)).toEqual([1, 2, 3])
    expect(paper.questions.every((q) => q.options?.length === 4)).toBe(true)
    expect(paper.notes).toEqual([])
  })

  it('says so when a question does not have four options', () => {
    const paper = extractPaper([
      page(2, 'Section I', stem(1, 'Only three offered?'), '     A.     One', '     B.     Two', '     C.     Three'),
    ])
    expect(paper.questions[0]!.notes.join(' ')).toMatch(/Read 3 options rather than four/)
  })
})

describe('Section II questions', () => {
  it('reads parts and takes each mark from the right margin', () => {
    const paper = extractPaper([
      page(
        5,
        'Section II',
        '15 marks',
        'Attempt Questions 11–13',
        '',
        'Question 11 (5 marks)',
        '',
        'A school is fitting out a new design studio with adjustable desks.',
        '',
        marked('(a)   Outline one ergonomic benefit of an adjustable desk.', 2),
        '',
        marked('(b)   Explain how a designer would test that benefit with users.', 3),
      ),
    ])

    expect(paper.questions).toHaveLength(1)
    const q = paper.questions[0]!
    expect(q.number).toBe(11)
    expect(q.marks).toBe(5)
    expect(q.section).toBe('II')
    expect(q.questionType).toBe('short_answer')
    expect(q.parts).toEqual([
      { label: 'a', text: 'Outline one ergonomic benefit of an adjustable desk.', marks: 2 },
      { label: 'b', text: 'Explain how a designer would test that benefit with users.', marks: 3 },
    ])
    expect(q.notes).toEqual([])
  })

  it('takes a mark that lands on its own line between the lines it belongs to', () => {
    // The mark is centred against a two-line cell, so its baseline falls between
    // the halves of the text. Observed in the real marking guides, and the reason
    // "the mark is at the end of the line" is not a rule that holds.
    const paper = extractPaper([
      page(
        5,
        'Section II',
        'Question 11 (5 marks)',
        'Outdoor furniture is exposed to weather all year.',
        '(a)   Explain how the choice of material affects the durability of a product',
        markOnly(3),
        '      that is used outdoors every day.',
        marked('(b)   Identify one other factor.', 2),
      ),
    ])
    const parts = paper.questions[0]!.parts!
    expect(parts[0]!.marks).toBe(3)
    expect(parts[0]!.text).toBe(
      'Explain how the choice of material affects the durability of a product that is used outdoors every day.',
    )
    expect(parts[1]!.marks).toBe(2)
    expect(paper.questions[0]!.notes).toEqual([])
  })

  it('says so when the parts do not add up to the question total', () => {
    const paper = extractPaper([
      page(
        5,
        'Section II',
        'Question 11 (5 marks)',
        marked('(a)   Outline one benefit.', 2),
        '(b)   Explain another.',
      ),
    ])
    expect(paper.questions[0]!.notes.join(' ')).toMatch(
      /Parts add up to 2 marks but the question is worth 5/,
    )
  })

  it('keeps a question that is only its parts, and says it needs a stem', () => {
    // 2016, 2018 and 2019 all do this: the heading is followed straight by (a),
    // with no stem at all. Nothing is wrong with the paper, but a saved question
    // must have text, so the teacher has to write one before it can be kept.
    const paper = extractPaper([
      page(
        5,
        'Section II',
        'Question 12 (6 marks)',
        marked('(a)   Why does a designer evaluate a product while designing it?', 2),
        marked('(b)   Discuss how testing changes what a designer makes next.', 4),
      ),
    ])
    const q = paper.questions[0]!
    expect(q.text).toBe('')
    expect(q.parts?.map((p) => p.marks)).toEqual([2, 4])
    expect(q.notes.join(' ')).toMatch(/must have text/)
  })

  it('says so when a question reads as entirely empty', () => {
    // A heading with nothing at all under it is the cover-page teaser and is
    // dropped. This is the other case: something was read, but all of it was a
    // mark in the margin, so there is no text to have been the question.
    const paper = extractPaper([page(5, 'Section II', 'Question 11 (5 marks)', markOnly(5))])
    expect(paper.questions[0]!.notes.join(' ')).toMatch(/No text was read for this question at all/)
  })

  it('keeps a question with no parts as a single stem', () => {
    const paper = extractPaper([
      page(
        5,
        'Section II',
        'Question 13 (4 marks)',
        'Explain how sustainable material choices influence the development of new',
        'manufacturing techniques.',
      ),
    ])
    const q = paper.questions[0]!
    expect(q.parts).toBeUndefined()
    expect(q.text).toBe(
      'Explain how sustainable material choices influence the development of new manufacturing techniques.',
    )
  })
})

describe('the variants that break a naive parser', () => {
  it('merges a (continued) block into the question it belongs to', () => {
    const paper = extractPaper([
      page(
        6,
        'Section II',
        'Question 11 (5 marks)',
        marked('(a)   Outline one ergonomic benefit of the workstation shown.', 2),
        '.........................................................................................',
        'Question 11 continues on page 7',
        '– 6 –',
      ),
      page(
        7,
        'Question 11 (continued)',
        marked('(b)   Explain how technological change has altered the design of workstations.', 3),
        '– 7 –',
      ),
    ])

    expect(paper.questions).toHaveLength(1)
    const q = paper.questions[0]!
    expect(q.parts?.map((p) => p.label)).toEqual(['a', 'b'])
    expect(q.marks).toBe(5)
    expect(q.pages).toEqual([6, 7])
    expect(paper.notes).toEqual([])
  })

  it('does not count the heading a section cover page prints for the question overleaf', () => {
    // 2016 and 2018 both do this: the cover page announces Question 11 at its
    // foot, then "Please turn over", then the real Question 11 on the next page.
    const paper = extractPaper([
      page(
        4,
        'Section II',
        '15 marks',
        'Attempt Questions 11–13',
        'Allow about 35 minutes for this section',
        'Question 11 (5 marks)',
        'Please turn over',
        '2221',
        '– 4 –',
      ),
      page(
        5,
        'Question 11 (5 marks)',
        marked('(a)   Outline one benefit of the design shown.', 5),
      ),
    ])

    expect(paper.questions).toHaveLength(1)
    expect(paper.questions[0]!.number).toBe(11)
    expect(paper.questions[0]!.parts).toHaveLength(1)
    expect(paper.notes).toEqual([])
  })

  it('handles a section whose question count differs from another year', () => {
    // Section II ran two, three and four questions in different years, so nothing
    // may assume a count.
    const two = extractPaper([
      page(5, 'Section II', 'Question 11 (7 marks)', 'First.', 'Question 12 (8 marks)', 'Second.'),
    ])
    const four = extractPaper([
      page(5, 'Section II', 'Question 11 (2 marks)', 'a', 'Question 12 (3 marks)', 'b'),
      page(6, 'Question 13 (4 marks)', 'c', 'Question 14 (6 marks)', 'd'),
    ])
    expect(two.questions).toHaveLength(2)
    expect(four.questions).toHaveLength(4)
    expect(two.notes).toEqual([])
    expect(four.notes).toEqual([])
  })

  it('ignores both front-matter layouts rather than reading them as sections', () => {
    const paper = extractPaper([
      page(
        1,
        '2018 HIGHER SCHOOL CERTIFICATE EXAMINATION',
        'Design and Technology',
        'Section I      Pages 2–4',
        'Section II – 15 marks (pages 5–7)',
        'Section III – 15 marks (page 9)',
      ),
      page(2, 'Section I', '1    A real question?', '     A.     One', '     B.     Two', '     C.     Three', '     D.     Four'),
    ])
    expect(paper.questions).toHaveLength(1)
    expect(paper.questions[0]!.section).toBe('I')
  })

  it('drops page furniture without letting it separate a heading from its text', () => {
    const paper = extractPaper([
      page(
        9,
        'Section III',
        'Question 15 (15 marks)',
        '2221',
        '– 9 –',
        'Evaluate the effect of emerging technologies on the work of designers.',
      ),
    ])
    const q = paper.questions[0]!
    expect(q.questionType).toBe('extended_response')
    expect(q.text).toBe('Evaluate the effect of emerging technologies on the work of designers.')
  })
})

describe('what the teacher is told to check', () => {
  it('records the figures a question names, and says nothing about them', () => {
    // What to do about a picture is not the reader's to decide: pictures are cut
    // out of the page now, so a note here saying they cannot be would be a lie.
    // `adopt.ts` warns, and only when no picture was cut out for the question.
    const paper = extractPaper([
      page(
        5,
        'Section II',
        'Question 11 (4 marks)',
        marked('(a)   Compare the two chairs shown in Figure 1 and Figure 2.', 4),
      ),
    ])
    const q = paper.questions[0]!
    expect(q.figures).toEqual(['Figure 1', 'Figure 2'])
    expect(q.notes.join(' ')).not.toMatch(/Figure|picture|image/i)
  })

  it('reports a gap in the numbering rather than quietly returning fewer questions', () => {
    const paper = extractPaper([
      page(5, 'Section II', 'Question 11 (5 marks)', 'First.', 'Question 14 (6 marks)', 'Second.'),
    ])
    expect(paper.questions).toHaveLength(2)
    expect(paper.notes.join(' ')).toMatch(/Question 11 is followed by Question 14/)
  })

  it('reports a continuation whose question was never seen', () => {
    const paper = extractPaper([page(7, 'Section II', 'Question 11 (continued)', '(b)   Second half.   3')])
    expect(paper.notes.join(' ')).toMatch(/no Question 11 had been read yet/)
  })
})

describe('tolerating a capital letter the corpus does not print', () => {
  it('reads a heading whose Marks is capitalised', () => {
    const paper = extractPaper([
      page(5, 'Section II', 'Question 11 (5 Marks)', marked('(a)   Describe one benefit.', 5)),
    ])
    expect(paper.questions).toHaveLength(1)
    expect(paper.questions[0]!.marks).toBe(5)
  })

  it('reads a section heading in capitals and still labels it I, II or III', () => {
    const paper = extractPaper([
      page(5, 'SECTION II', 'Question 11 (5 marks)', marked('(a)   Describe one benefit.', 5)),
    ])
    // Upper-cased where it is read: a bare cast would make this `II` from
    // `SECTION II` but `ii` from `Section ii`, and `SECTION_TYPE['ii']` is
    // undefined, which is a question with no type and no complaint.
    expect(paper.questions[0]!.section).toBe('II')
    expect(paper.questions[0]!.questionType).toBe('short_answer')
  })
})
