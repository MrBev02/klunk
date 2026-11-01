/**
 * The record of what has been released to students (#150), read and folded
 * into, pure.
 *
 * Unlike the manifest this is not a cache. It holds the date each exam was sat
 * and who approved each question, which nothing else in the folder records. So
 * it is read leniently, an entry that does not fit is dropped rather than
 * taking the rest with it, but it is written by merging into what is on disk,
 * never by replacing it from memory.
 */

import type { LedgerExam, LedgerQuestion, ReleaseLedger } from '../shared/types'

/** Beside nothing else Klunk writes, so a teacher can see at a glance it is not content. */
export const LEDGER_PATH = 'release/ledger.json'

export function emptyLedger(): ReleaseLedger {
  return { formatVersion: '1', type: 'klunk_release_ledger', exams: [], questions: [] }
}

const text = (v: unknown): v is string => typeof v === 'string' && v !== ''

export function readLedger(data: unknown): ReleaseLedger {
  const ledger = emptyLedger()
  if (typeof data !== 'object' || data === null) return ledger
  const { exams, questions } = data as { exams?: unknown; questions?: unknown }

  for (const raw of Array.isArray(exams) ? exams : []) {
    if (typeof raw !== 'object' || raw === null) continue
    const e = raw as Record<string, unknown>
    if (!text(e.key)) continue
    ledger.exams.push({
      key: e.key,
      ...(text(e.dateSat) ? { dateSat: e.dateSat } : {}),
      ...(text(e.title) ? { title: e.title } : {}),
      ...(text(e.subject) ? { subject: e.subject } : {}),
      ...(typeof e.yearLevel === 'number' ? { yearLevel: e.yearLevel } : {}),
      ...(text(e.file) ? { file: e.file } : {}),
      ...(text(e.releasedOn) ? { releasedOn: e.releasedOn } : {}),
    })
  }

  for (const raw of Array.isArray(questions) ? questions : []) {
    if (typeof raw !== 'object' || raw === null) continue
    const q = raw as Record<string, unknown>
    if (!text(q.id) || !text(q.exam) || !text(q.hash)) continue
    ledger.questions.push({
      id: q.id,
      exam: q.exam,
      approvedBy: text(q.approvedBy) ? q.approvedBy : '',
      approvedOn: text(q.approvedOn) ? q.approvedOn : '',
      hash: q.hash,
    })
  }
  return ledger
}

/**
 * Replace one exam's entry and its questions, leaving every other exam alone.
 *
 * A release writes the whole of one exam, so its questions are replaced as a
 * set: one left out of this release is no longer released, and the ledger
 * should not go on saying it is.
 */
export function recordRelease(
  ledger: ReleaseLedger,
  exam: LedgerExam,
  questions: LedgerQuestion[],
): ReleaseLedger {
  return {
    ...ledger,
    exams: [...ledger.exams.filter((e) => e.key !== exam.key), exam],
    questions: [...ledger.questions.filter((q) => q.exam !== exam.key), ...questions],
  }
}
