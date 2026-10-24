import { describe, expect, it } from 'vitest'
import { buildDailyQuiz, buildSpotlight } from './questions'
import type { Pool, PoolTitle } from './tmdb'

const actor = (n: number, c: string) => ({ name: `Actor ${n}`, character: c })

// Deliberate overlaps (shared actors, a recurring director, a collection, a
// decade cluster) so every question type has material to work with.
const fixturePool = (): Pool => {
  const titles: PoolTitle[] = []
  for (let i = 0; i < 24; i++) {
    const isTv = i % 4 === 3
    const movieCollection = i === 1 || i === 5 || i === 9 || i === 13
    titles.push({
      tmdbId: 1000 + i,
      tmdbType: isTv ? 'tv' : 'movie',
      title: `${isTv ? 'Show' : 'Film'} ${i}`,
      year: 1985 + ((i * 7) % 40),
      directors: isTv ? [] : [`Director ${i % 6}`],
      cast: [actor(i, `Char ${i}`), actor(i + 1, `Char ${i + 1}`), actor(i + 2, `Char ${i + 2}`), actor(30 - i, `Char X${i}`)],
      creators: isTv ? [`Creator ${i % 5}`] : [],
      networks: isTv ? [`Net ${i % 4}`] : [],
      seasons: isTv ? 2 + (i % 6) : null,
      collectionName: movieCollection ? 'Test Collection' : null
    })
  }
  const people: Pool['people'] = {}
  for (const t of titles) {
    for (const c of t.cast) (people[c.name] ||= { actedIn: [], directed: [] }).actedIn.push(t.tmdbId)
    for (const d of [...t.directors, ...t.creators]) (people[d] ||= { actedIn: [], directed: [] }).directed.push(t.tmdbId)
  }
  return { titles, people, updatedAt: Date.now() }
}

const pool = fixturePool()

describe('buildDailyQuiz', () => {
  it('is deterministic for a given date', () => {
    expect(buildDailyQuiz(pool, '2026-10-19')).toEqual(buildDailyQuiz(pool, '2026-10-19'))
  })

  it('produces valid question shape', () => {
    const quiz = buildDailyQuiz(pool, '2026-10-19')
    expect(quiz).not.toBeNull()
    expect(quiz!.questions.length).toBeGreaterThanOrEqual(3)
    for (const q of quiz!.questions) {
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4)
      expect(q.answerIndex).toBeGreaterThanOrEqual(0)
      expect(q.answerIndex).toBeLessThan(4)
      expect(q.options[q.answerIndex]).toBeTruthy()
      expect(q.link).toMatch(/^https:\/\/www\.galaxymovies\.app\//)
    }
  })

  it('never lets a distractor also be correct', () => {
    const quiz = buildDailyQuiz(pool, '2026-10-19')!
    for (const q of quiz.questions) {
      const wrong = q.options.filter((_, i) => i !== q.answerIndex)
      if (q.prompt.startsWith('Who directed')) {
        const film = pool.titles.find((t) => q.prompt.includes(t.title))!
        for (const o of wrong) expect(film.directors).not.toContain(o)
      }
      if (q.prompt.startsWith('Who created')) {
        const show = pool.titles.find((t) => q.prompt.includes(t.title))!
        for (const o of wrong) expect(show.creators).not.toContain(o)
      }
      if (q.prompt.includes('stars ')) {
        const star = q.prompt.split('stars ')[1].replace('?', '')
        for (const o of wrong) {
          const t = pool.titles.find((x) => x.title === o)!
          expect(t.cast.some((c) => c.name === star)).toBe(false)
        }
      }
      if (q.prompt.includes('both appear in which')) {
        const [a, b] = q.prompt.split(' both appear')[0].split(' and ')
        for (const o of wrong) {
          const t = pool.titles.find((x) => x.title === o)!
          const has = (n: string) => t.cast.some((c) => c.name === n)
          expect(has(a) && has(b)).toBe(false)
        }
      }
    }
  })

  it('varies across dates', () => {
    const a = buildDailyQuiz(pool, '2026-10-19')!
    const b = buildDailyQuiz(pool, '2026-10-20')!
    expect(JSON.stringify(a.questions)).not.toBe(JSON.stringify(b.questions))
  })
})

describe('buildSpotlight', () => {
  it('is deterministic for a given week', () => {
    expect(buildSpotlight(pool, '2026-W43')).toEqual(buildSpotlight(pool, '2026-W43'))
  })

  it('returns a themed round with valid questions', () => {
    const spot = buildSpotlight(pool, '2026-W43')
    expect(spot).not.toBeNull()
    expect(spot!.theme.length).toBeGreaterThan(0)
    expect(spot!.questions.length).toBeGreaterThanOrEqual(4)
    for (const q of spot!.questions) {
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4)
      expect(q.options[q.answerIndex]).toBeTruthy()
    }
  })
})
