/**
 * The multiple choice answer sheet at the back of the paper, without drawing it.
 *
 * Kept out of the renderer for the reason `cover.ts` is: nothing in this repo
 * renders a component, so a rule that lives in JSX is a rule no test reaches.
 * This takes a resolved paper and returns rows, and `render.tsx` draws them.
 *
 * The letters on the sheet have to be the letters on the paper, so each row is
 * built from the same `shuffledChoices` and `shuffledResponses` the questions
 * print from, and the guide's key from the same call again. A sheet that
 * worked out its own order would be wrong only for shuffled questions, which is
 * most of them and none of the ones a quick look would check.
 */

import type { CoverField, CoverModel } from './cover'
import { shuffledChoices, shuffledResponses, type ResolvedPaper } from './paper'

export interface AnswerSheetRow {
  /** The question number as printed. */
  number: number
  /** How many options this question prints, so the cells after the last stay empty. */
  options: number
  /** Whether a student may mark more than one cell. */
  multiple: boolean
  /**
   * The correct cells, for the guide's key. Undefined where the question does
   * not say, which is not the same as an empty set and must not print as one
   * (#64): a paper read without its markscheme has no answer, not the answer
   * "none".
   */
  correct?: number[] | undefined
}

export interface AnswerSheetModel {
  /** Columns across the top, as many as the question with the most options. */
  columns: number
  rows: AnswerSheetRow[]
  /** Where a student writes who they are, at the top of the sheet. */
  identification: CoverField[]
  /** Whether any row lets a student mark more than one cell, which the instruction has to say. */
  anyMultiple: boolean
}

/**
 * The sheet for this paper, or null where it prints none.
 *
 * Null both when the profile has not asked for one and when the paper holds no
 * objective question, because an empty grid at the back of a paper of essays
 * is a page a student would wonder about.
 *
 * Only multiple choice and multiple response. A matching question's answer is a
 * letter per item and a true/false one is a word, so neither is one row of
 * lettered cells, and squeezing them in would give a sheet whose columns mean
 * different things on different rows.
 */
export function answerSheetModel(
  resolved: ResolvedPaper,
  cover: CoverModel,
): AnswerSheetModel | null {
  if (!resolved.profile?.paper.cover?.answerSheet) return null

  const rows: AnswerSheetRow[] = []
  for (const section of resolved.sections) {
    for (const item of section.questions) {
      const q = item.question
      if (q.questionType === 'multiple_choice') {
        const { choices, correctIndex, known } = shuffledChoices(q, item.shuffle)
        rows.push({
          number: item.number,
          options: choices.length,
          multiple: false,
          correct: known && correctIndex >= 0 ? [correctIndex] : undefined,
        })
      } else if (q.questionType === 'multiple_response') {
        const { choices, correctIndexes, known } = shuffledResponses(q, item.shuffle)
        rows.push({
          number: item.number,
          options: choices.length,
          multiple: true,
          correct: known ? correctIndexes : undefined,
        })
      }
    }
  }
  if (rows.length === 0) return null

  return {
    columns: Math.max(...rows.map((r) => r.options)),
    rows,
    identification: sheetIdentification(cover),
    anyMultiple: rows.some((r) => r.multiple),
  }
}

/**
 * What the sheet asks a student to write at the top.
 *
 * The cover's own fields, less those already repeated on every page, since the
 * running header prints those over the sheet as it does over every other page,
 * and asking twice on one page reads as two different things to fill in.
 *
 * Where nothing at all is asked for, a Name. The sheet is the one page made to
 * be torn off and marked apart from the paper, so a sheet that does not say
 * whose it is cannot be marked.
 */
function sheetIdentification(cover: CoverModel): CoverField[] {
  if (cover.identification.length > 0) return cover.identification
  if (cover.everyPage.length > 0) return []
  return [{ label: 'Name', kind: 'write', boxes: 0 }]
}
