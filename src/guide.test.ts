import { describe, expect, it } from 'vitest'
import { extractPaper, stampSource } from './extract'
import { applyGuide, extractGuide } from './guide'
import { markOnly, marked, page } from './fixtures/page'
import { findPictures, picturesFor } from './pdfimage'

/**
 * Fictional guides in the shape of the real ones.
 *
 * Same constraint as `extract.test.ts`: a NESA marking guide cannot enter this
 * public repo, so the criteria below are invented and only their *arrangement*
 * is taken from the 2015–2025 corpus. The arrangement is the whole difficulty —
 * where a mark sits relative to the bullets it governs — and inventing the words
 * costs nothing. The real guides are checked by `extract.corpus.test.ts`.
 */

describe('the multiple-choice answer key', () => {
  it('reads the key and stops at the first question of Section II', () => {
    const guide = extractGuide([
      page(
        1,
        'Section I',
        'Multiple-choice Answer Key',
        'Question        Answer',
        '   1                B',
        '   2                D',
        '  10                A',
      ),
      page(2, 'Section II', 'Question 11', marked('•  Does the thing', 2)),
    ])
    expect(guide.answerKey).toEqual({ 1: 'B', 2: 'D', 10: 'A' })
    expect(guide.entries.map((e) => e.number)).toEqual([11])
  })

  // Not how many. Ten is a D&T paper's Section I and nobody else's — 2025
  // Biology prints twenty, and a guide read correctly came back saying its key
  // was the wrong size. What is true of any paper is that the key runs from the
  // first question with none missing.
  it('says so when the key skips a question', () => {
    const guide = extractGuide([
      page(
        1,
        'Multiple-choice Answer Key',
        '   1                B',
        '   2                D',
        '   4                A',
      ),
    ])
    expect(guide.notes.join(' ')).toMatch(/so one is missing/)
  })

  it('says nothing about a short key that runs from one, because the paper decides that', () => {
    const guide = extractGuide([
      page(1, 'Multiple-choice Answer Key', '   1                B', '   2                D'),
    ])
    expect(guide.notes).toEqual([])
  })
})

describe('criteria', () => {
  it('takes a mark that lands between the two halves of the criterion it marks', () => {
    const guide = extractGuide([
      page(
        2,
        'Section II',
        'Question 11 (a)',
        'Criteria                                                                   Marks',
        '•  Explains how ongoing evaluation changes what a designer makes next and',
        markOnly(3),
        '   why that matters to the user',
        marked('•  Provides some relevant information', 1),
      ),
    ])
    expect(guide.entries[0]!.criteria).toEqual([
      {
        marks: 3,
        description:
          'Explains how ongoing evaluation changes what a designer makes next and why that matters to the user',
      },
      { marks: 1, description: 'Provides some relevant information' },
    ])
  })

  it('gives a band all of the bullets it is centred against, not just the nearest line', () => {
    // The hard case, and the reason a mark cannot be attached to a line. One band
    // covers three bullets and its mark sits at the centre of the group, so it
    // lands inside whichever bullet happens to be in the middle.
    const guide = extractGuide([
      page(
        4,
        'Section III',
        'Question 14',
        'Criteria                                                                   Marks',
        '•  Shows a comprehensive understanding of how design responds to changing',
        '   community expectations',
        '•  Draws out and relates the implications of those expectations for a',
        markOnly('13–15'),
        '   designer',
        '•  Provides a logical and cohesive response, supported by examples',
        '•  Explains how design responds to changing community expectations',
        markOnly('10–12'),
        '•  Communicates using relevant examples',
        marked('•  Identifies a community expectation', '1–3'),
      ),
    ])

    const criteria = guide.entries[0]!.criteria
    expect(criteria).toHaveLength(3)
    expect(criteria[0]).toEqual({
      marks: 13,
      marksTo: 15,
      description: [
        'Shows a comprehensive understanding of how design responds to changing community expectations',
        'Draws out and relates the implications of those expectations for a designer',
        'Provides a logical and cohesive response, supported by examples',
      ].join('\n'),
    })
    expect(criteria[1]!.marks).toBe(10)
    expect(criteria[1]!.marksTo).toBe(12)
    expect(criteria[1]!.description.split('\n')).toHaveLength(2)
    expect(criteria[2]).toEqual({
      marks: 1,
      marksTo: 3,
      description: 'Identifies a community expectation',
    })
  })

  it('keeps an OR inside the criterion it qualifies', () => {
    const guide = extractGuide([
      page(
        2,
        'Section II',
        'Question 11',
        '•  Identifies safe work practices',
        marked('OR', 2),
        '•  Outlines one safe work practice',
        marked('•  Identifies a safe work practice', 1),
      ),
    ])
    expect(guide.entries[0]!.criteria[0]).toEqual({
      marks: 2,
      description: 'Identifies safe work practices OR\nOutlines one safe work practice',
    })
  })

  it('keeps the sample answer apart from the criteria, under either name', () => {
    const guide = extractGuide([
      page(
        2,
        'Section II',
        'Question 11',
        marked('•  Names two methods', 2),
        'Sample answer:',
        'Making a model.',
        'Surveying a niche market.',
      ),
      page(
        4,
        'Section III',
        'Question 14',
        marked('•  Evaluates thoroughly', '13–15'),
        'Answers could include:',
        'Timing, cost and materials.',
      ),
    ])
    expect(guide.entries[0]!.sampleAnswer).toBe('Making a model. Surveying a niche market.')
    expect(guide.entries[1]!.sampleAnswer).toBe('Timing, cost and materials.')
  })

  it('says so when criteria have no marks beside them at all', () => {
    const guide = extractGuide([
      page(2, 'Section II', 'Question 11', '•  Does the thing', '•  Does less of the thing'),
    ])
    expect(guide.notes.join(' ')).toMatch(/No marks were found beside the criteria for Question 11/)
  })
})

describe('the mapping grid', () => {
  const grid = (...rows: string[]) =>
    page(
      6,
      'Mapping Grid',
      'Section I',
      'Question      Marks             Content              Syllabus outcomes',
      ...rows,
    )

  it('reads number, marks, content and outcomes without needing the column positions', () => {
    const guide = extractGuide([
      grid(
        '   1      1     Design factors                  H1.1',
        '  10      1     Marketing strategies            H3.2, H6.2',
      ),
    ])
    expect(guide.mapping).toEqual([
      { number: 1, marks: 1, content: 'Design factors', outcomes: ['H1.1'] },
      { number: 10, marks: 1, content: 'Marketing strategies', outcomes: ['H3.2', 'H6.2'] },
    ])
  })

  it('reads a part as its own row', () => {
    const guide = extractGuide([grid('  11 (a)   2     Evaluation methods              H4.3')])
    expect(guide.mapping[0]).toEqual({
      number: 11,
      part: 'a',
      marks: 2,
      content: 'Evaluation methods',
      outcomes: ['H4.3'],
    })
  })

  it('gathers content that wrapped onto lines of its own', () => {
    // The row's number and marks are centred against the wrapped cell, so they
    // land between its lines rather than beside the first of them.
    const guide = extractGuide([
      grid(
        '                Research and methods of experimentation to',
        '  11      2                                                     H1.1',
        '                generate ideas',
        '  12      3     Social trends                                   H2.1',
      ),
    ])
    expect(guide.mapping[0]!.content).toBe(
      'Research and methods of experimentation to generate ideas',
    )
    expect(guide.mapping[1]!.content).toBe('Social trends')
  })

  it('reads a row whose marks cell was left blank, as the 2016 grid leaves one', () => {
    const guide = extractGuide([grid('  14            Impact on society               H3.1, H6.2')])
    expect(guide.mapping[0]).toEqual({
      number: 14,
      content: 'Impact on society',
      outcomes: ['H3.1', 'H6.2'],
    })
  })
})

describe('putting a guide back on its paper', () => {
  const paper = () =>
    extractPaper([
      page(1, '2019 HIGHER SCHOOL CERTIFICATE EXAMINATION', 'Design and Technology'),
      page(
        2,
        'Section I',
        '1    Which material suits a lightweight frame?',
        '     A.     Cast iron',
        '     B.     Carbon fibre',
        '     C.     Mild steel',
        '     D.     Lead',
      ),
      page(
        5,
        'Section II',
        'Question 11 (5 marks)',
        'A design studio is being fitted with adjustable desks.',
        marked('(a)   Outline one benefit of the desk shown.', 2),
        marked('(b)   Explain how a designer would test it.', 3),
      ),
    ])

  const guide = () =>
    extractGuide([
      page(1, 'Section I', 'Multiple-choice Answer Key', '   1                B'),
      page(
        2,
        'Section II',
        'Question 11 (a)',
        marked('•  Outlines a benefit', 2),
        'Sample answer:',
        'It can be raised.',
        'Question 11 (b)',
        marked('•  Explains a test', 3),
      ),
      page(
        6,
        'Mapping Grid',
        'Section I',
        'Question      Marks             Content              Syllabus outcomes',
        '   1      1     Design factors                  H1.1',
        'Section II',
        'Question      Marks             Content              Syllabus outcomes',
        '  11 (a)   2     Ergonomics                      H4.3',
        '  11 (b)   3     Evaluation                      H4.3, H3.2',
      ),
    ])

  it('answers the objective questions and tags them from the grid', () => {
    const marked = applyGuide(paper(), guide())
    const one = marked.questions[0]!
    expect(one.answer).toBe('B')
    expect(one.outcomes).toEqual(['H1.1'])
    expect(one.content).toBe('Design factors')
    expect(one.notes).toEqual([])
  })

  it('puts each part’s criteria on that part, and the outcomes on the question', () => {
    const applied = applyGuide(paper(), guide())
    const eleven = applied.questions[1]!
    expect(eleven.parts?.[0]!.criteria).toEqual([{ marks: 2, description: 'Outlines a benefit' }])
    expect(eleven.parts?.[0]!.sampleAnswer).toBe('It can be raised.')
    expect(eleven.parts?.[1]!.criteria).toEqual([{ marks: 3, description: 'Explains a test' }])
    // Gathered across both parts, because the question is what gets tagged.
    expect(eleven.outcomes).toEqual(['H4.3', 'H3.2'])
    expect(eleven.notes).toEqual([])
  })

  it('says so when the paper and the guide disagree about the marks', () => {
    const wrong = extractGuide([
      page(
        6,
        'Mapping Grid',
        'Section II',
        'Question      Marks             Content              Syllabus outcomes',
        '  11      9     Ergonomics                      H4.3',
      ),
    ])
    const applied = applyGuide(paper(), wrong)
    expect(applied.questions[1]!.notes.join(' ')).toMatch(
      /gives this question 5 marks and the marking guide gives it 9/,
    )
  })

  it('says so when the guide covers a question the paper does not have', () => {
    const extra = extractGuide([
      page(
        6,
        'Mapping Grid',
        'Section II',
        'Question      Marks             Content              Syllabus outcomes',
        '  12      4     Social trends                   H2.1',
      ),
    ])
    expect(applyGuide(paper(), extra).notes.join(' ')).toMatch(
      /covers Question 12, but no such question was read from the paper/,
    )
  })

  it('says so when the two files are from different years', () => {
    const other = extractGuide([page(1, '2021 HSC Design and Technology', 'Marking Guidelines')])
    expect(applyGuide(paper(), other).notes.join(' ')).toMatch(
      /paper is from 2019 and the marking guide from 2021/,
    )
  })
})

describe('provenance', () => {
  it('stamps every question with where it came from, and reads the year off the paper', () => {
    const paper = extractPaper([
      page(1, '2019 HIGHER SCHOOL CERTIFICATE EXAMINATION', 'Design and Technology'),
      page(
        2,
        'Section I',
        '1    A question?',
        '     A.     One',
        '     B.     Two',
        '     C.     Three',
        '     D.     Four',
      ),
    ])
    expect(paper.year).toBe(2019)

    const stamped = stampSource(paper, {
      paper: 'NSW HSC Design and Technology',
      year: paper.year!,
      copyright: 'NSW Education Standards Authority',
    })
    expect(stamped.questions[0]!.source).toEqual({
      origin: 'extracted',
      paper: 'NSW HSC Design and Technology',
      year: 2019,
      questionNumber: '1',
      copyright: 'NSW Education Standards Authority',
    })
  })
})

describe('finding where the pictures are', () => {
  it('takes a band of the page that no text touches', () => {
    const paper = extractPaper([
      page(
        5,
        'Section II',
        'Question 11 (5 marks)',
        'The images show two chairs developed for different uses.',
        '',
        '',
        '',
        '',
        '',
        marked('Compare the two chairs shown.', 5),
      ),
    ])
    const regions = picturesFor(paper.questions[0]!, [
      page(
        5,
        'Section II',
        'Question 11 (5 marks)',
        'The images show two chairs developed for different uses.',
        '',
        '',
        '',
        '',
        '',
        marked('Compare the two chairs shown.', 5),
      ),
    ])
    expect(regions).toHaveLength(1)
    expect(regions[0]!.page).toBe(5)
    // Between the two lines of text, and not touching either of them.
    expect(regions[0]!.height).toBeGreaterThan(20)
  })

  it('does not take the space between two lines of ordinary text', () => {
    const p = page(5, 'Section II', 'Question 11 (5 marks)', 'One line.', 'The next line.')
    expect(findPictures(p)).toEqual([])
  })

  /**
   * A page with its answer lines on it, which is what a real one has.
   *
   * The prose columns are worked out from how much of the document's text each
   * column carries, so a page has to hold a page's worth of text for the sum to
   * mean anything. Ruled lines are most of what a Section II page holds, and
   * they set in the same column as its prose.
   */
  const ruled = Array.from({ length: 20 }, () => '.'.repeat(90))

  it('does not cut a picture into slices at the labels printed inside it', () => {
    // The 2025 Biology paper prints `Parent amoeba`, `Nucleus divides` and the
    // rest *inside* the diagram, and each label cut the band it sat in: one
    // diagram arrived as five crops, a karyotype as four, a tick bite as seven.
    // Eleven years of D&T never showed it, because a photograph carries no
    // words. A label is told from a line of the question by where it starts —
    // a paper sets its prose in the same one or two columns throughout, and a
    // figure is placed wherever it fits.
    const pages = [
      page(
        2,
        'Section II',
        'Question 11 (5 marks)',
        'The diagram shows how a cell divides.',
        '',
        '',
        '',
        '',
        '                              Parent cell',
        '',
        '',
        '',
        '',
        '                              Two daughter cells',
        '',
        '',
        '',
        '',
        marked('Explain what is shown.', 5),
        ...ruled,
      ),
    ]
    const paper = extractPaper(pages)
    const regions = picturesFor(paper.questions[0]!, pages)
    expect(regions).toHaveLength(1)
    // The whole of the diagram, labels and all, rather than the three gaps
    // between them, which is what this used to return.
    expect(regions[0]!.height).toBeGreaterThan(150)
  })

  it("still bounds a picture at the question's own last line", () => {
    // The exception that keeps the rule honest. A row at the left margin is
    // prose whatever sits above and below it, because that is where a paragraph
    // starts and a figure never does. Without it the question's own closing line
    // was taken into the diagram, the band had nothing below it to close
    // against, and the picture was lost rather than merged.
    const pages = [
      page(
        2,
        'Section II',
        'Question 11 (5 marks)',
        'The diagram shows a process.',
        '',
        '',
        '',
        '',
        '                              A label',
        '',
        '',
        '',
        '',
        marked('Explain what is shown.', 5),
        '                    Component      How it protects',
        ...ruled,
      ),
    ]
    const paper = extractPaper(pages)
    expect(picturesFor(paper.questions[0]!, pages)).toHaveLength(1)
  })

  it('gives a band to the question whose text surrounds it, not merely to the page', () => {
    // A page carrying the end of one question and the start of the next: the gap
    // belongs to whichever one's text is above and below it.
    const pages = [
      page(
        6,
        'Section II',
        'Question 11 (4 marks)',
        'Explain one thing.',
        marked('Explain another.', 4),
        'Question 12 (6 marks)',
        'A picture follows.',
        '',
        '',
        '',
        '',
        '',
        marked('Discuss what is shown.', 6),
      ),
    ]
    const paper = extractPaper(pages)
    const eleven = paper.questions.find((q) => q.number === 11)!
    const twelve = paper.questions.find((q) => q.number === 12)!
    expect(picturesFor(eleven, pages)).toEqual([])
    expect(picturesFor(twelve, pages)).toHaveLength(1)
  })
})
