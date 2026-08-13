/**
 * Which profile describes this paper.
 *
 * Driving the transcription panel found the fault this pins: the course select
 * defaults to the folder's first course, and a 3-mark Biology test profile was
 * being used to tell an AI how a 60-mark Enterprise Computing paper is laid out
 * (#89). A profile is the shape of one particular examination, so taking another
 * course's is the same borrowing this function's own comment already refused
 * across subjects, one level down.
 */

import { describe, expect, it } from 'vitest'
import { profileFor } from './factory'
import type { ContentIndex } from './storage'
import type { Profile, Syllabus } from './types'

function profile(id: string, syllabusId: string, courseId?: string): Profile {
  return {
    formatVersion: '1.0.0',
    type: 'klunk_profile',
    id,
    name: id,
    syllabusId,
    ...(courseId === undefined ? {} : { courseId }),
    paper: { totalMarks: 40, sections: [] },
  }
}

function index(...profiles: Profile[]): ContentIndex {
  return {
    profiles: profiles.map((data) => ({ path: `profiles/${data.id}.json`, data })),
    syllabuses: [],
    banks: [],
    papers: [],
    schools: [],
    problems: [],
    scanned: 0,
    pdfs: [],
  } as unknown as ContentIndex
}

const syllabus = { id: 'bio', name: 'Biology' } as Syllabus

describe('profileFor', () => {
  it('takes the one naming this very course', () => {
    const found = profileFor(index(profile('y11', 'bio', 'y11'), profile('y12', 'bio', 'y12')), syllabus, 'y11')
    expect(found?.id).toBe('y11')
  })

  it('takes one that names no course, which is what every profile used to be', () => {
    expect(profileFor(index(profile('any', 'bio')), syllabus, 'y11')?.id).toBe('any')
  })

  it('refuses a profile for a different course of the same syllabus', () => {
    // The whole point. It would otherwise state Year 12's totals as Year 11's.
    expect(profileFor(index(profile('y12', 'bio', 'y12')), syllabus, 'y11')).toBeUndefined()
  })

  it('refuses another subject entirely', () => {
    expect(profileFor(index(profile('dt', 'nsw-hsc-design-technology')), syllabus, 'y11')).toBeUndefined()
  })

  it('has nothing to find when no course was chosen at all', () => {
    expect(profileFor(index(profile('any', 'bio')), undefined, undefined)).toBeUndefined()
  })

  it('still finds a course-less profile when no course id is passed', () => {
    expect(profileFor(index(profile('any', 'bio')), syllabus)?.id).toBe('any')
  })
})
