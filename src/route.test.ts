/**
 * Tests for the address Klunk keeps its place in (#159).
 *
 * The round trip is the part that matters: an address Klunk wrote has to read
 * back as the same place, or Reload lands somewhere the teacher was not.
 */

import { describe, expect, it } from 'vitest'
import { parseRoute, routeHash, type Route } from './route'

describe('routeHash and parseRoute', () => {
  const places: [Route, string][] = [
    [{ help: false }, ''],
    [{ help: true }, '#/help'],
    [{ view: 'library', help: false }, '#/questions'],
    [{ view: 'library', takeover: 'new-question', help: false }, '#/questions/new-question'],
    [{ view: 'library', help: true }, '#/questions/help'],
    [{ view: 'build', help: false }, '#/papers'],
    [
      { view: 'build', paperId: 'trial-hsc-examination', help: false },
      '#/papers/trial-hsc-examination',
    ],
    [
      { view: 'build', paperId: 'trial-hsc-examination', takeover: 'cover', help: true },
      '#/papers/trial-hsc-examination/cover/help',
    ],
    [{ view: 'build', takeover: 'structure', help: false }, '#/papers/structure'],
    [{ view: 'draft', help: false }, '#/draft'],
    [{ view: 'paper', help: false }, '#/past-paper'],
    [{ view: 'syllabus', help: false }, '#/syllabus'],
  ]

  it.each(places)('writes %j as %s and reads it back', (route, hash) => {
    expect(routeHash(route)).toBe(hash)
    expect(parseRoute(hash)).toEqual(route)
  })

  it('keeps a paper id that needs escaping', () => {
    const route: Route = { view: 'build', paperId: 'year 10/half-yearly', help: false }
    const hash = routeHash(route)
    expect(hash).toBe('#/papers/year%2010%2Fhalf-yearly')
    expect(parseRoute(hash)).toEqual(route)
  })

  // A paper is only part of the place on Papers. Writing it on another tab
  // would mean Back from Questions reopened a paper the teacher had moved off.
  it('leaves the paper out on every view but Papers', () => {
    expect(routeHash({ view: 'library', paperId: 'trial', help: false })).toBe('#/questions')
  })
})

describe('parseRoute refuses what is not an address Klunk wrote', () => {
  // Help's contents are plain anchors. Reading one as a place would close help
  // the moment a teacher clicked "Setting up a subject folder".
  it.each(['#help-setup', '#/nowhere', '#/questions/nonsense', '#/papers/trial/cover/extra'])(
    '%s',
    (hash) => {
      expect(parseRoute(hash)).toBeNull()
    },
  )

  it('a hand-edited address with a broken escape', () => {
    expect(parseRoute('#/papers/%E0%A4%A')).toBeNull()
  })

  // The known ambiguity, pinned so a change to it is deliberate.
  it('reads a lone editor name on Papers as the editor, not as a paper', () => {
    expect(parseRoute('#/papers/cover')).toEqual({ view: 'build', takeover: 'cover', help: false })
  })
})
