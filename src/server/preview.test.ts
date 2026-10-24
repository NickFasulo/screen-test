import { describe, expect, it, vi } from 'vitest'

// Live smoke test: `TRIVIA_PREVIEW=1 TMDB_API_KEY=... npx vitest run preview.test.ts`
// builds the real pool and prints actual quizzes for human review. Skipped in
// the normal suite so `npm test` never touches the network.
vi.mock('@devvit/web/server', () => ({
  settings: { get: async () => process.env.TMDB_API_KEY },
  redis: {
    get: async () => null,
    set: async () => {},
    del: async () => {},
    hGet: async () => null,
    hGetAll: async () => null,
    hSet: async () => {},
    hIncrBy: async () => 0
  },
  context: {},
  reddit: {}
}))

import { buildPool } from './tmdb'
import { buildDailyQuiz, buildSpotlight } from './questions'

const run = process.env.TRIVIA_PREVIEW ? describe : describe.skip

run('live preview', () => {
  it('builds the pool and prints this week of quizzes', async () => {
    const pool = await buildPool()
    expect(pool).not.toBeNull()
    console.log(`\npool: ${pool!.titles.length} titles, ${Object.keys(pool!.people).length} people`)
    const movies = pool!.titles.filter((t) => t.tmdbType === 'movie').length
    console.log(`movies: ${movies}, tv: ${pool!.titles.length - movies}`)

    for (const date of ['2026-10-23', '2026-10-24', '2026-10-25']) {
      const quiz = buildDailyQuiz(pool!, date)
      expect(quiz).not.toBeNull()
      console.log(`\n=== ${date} ===`)
      for (const q of quiz!.questions) {
        console.log(`  ${q.prompt}`)
        q.options.forEach((o, i) => console.log(`    ${i === q.answerIndex ? '>' : ' '} ${o}`))
      }
    }

    const spot = buildSpotlight(pool!, '2026-W43')
    if (spot) {
      console.log(`\n=== spotlight ${spot.week}: ${spot.theme} ===`)
      for (const q of spot.questions) {
        console.log(`  ${q.prompt}`)
        q.options.forEach((o, i) => console.log(`    ${i === q.answerIndex ? '>' : ' '} ${o}`))
      }
    }
  }, 120_000)
})
