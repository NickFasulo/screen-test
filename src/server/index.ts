import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createServer, getServerPort } from '@devvit/web/server'
import type { TaskRequest, TaskResponse } from '@devvit/web/server'
import type { UiResponse } from '@devvit/web/shared'
import {
  createQuizPost,
  createSpotlightPost,
  getLeaderboard,
  getState,
  isPostDay,
  markShown,
  refreshPool,
  resetAll,
  submitAnswer
} from './game'
import type { Result } from './game'

const app = new Hono()

// ---------- client API ----------

app.get('/api/state', async (c) => c.json(await getState()))

app.post('/api/answer', async (c) => {
  const { questionId, choice } = (await c.req.json().catch(() => ({}))) as {
    questionId?: string
    choice?: number
  }
  if (!questionId || typeof choice !== 'number') return c.json({ error: 'bad request' }, 400)
  const res = await submitAnswer(questionId, choice)
  if ('error' in res) return c.json({ error: res.error }, res.status)
  return c.json(res)
})

app.post('/api/shown', async (c) => {
  const { questionId } = (await c.req.json().catch(() => ({}))) as { questionId?: string }
  if (questionId) await markShown(questionId)
  return c.json({ ok: true })
})

app.get('/api/leaderboard', async (c) => c.json(await getLeaderboard()))

// ---------- scheduler ----------

app.post('/internal/scheduler/pool-refresh', async (c) => {
  await c.req.json<TaskRequest>().catch(() => null)
  const result = await refreshPool()
  console.log('pool-refresh:', JSON.stringify(result))
  return c.json<TaskResponse>({ status: 'ok' }, 200)
})

app.post('/internal/scheduler/daily-quiz', async (c) => {
  await c.req.json<TaskRequest>().catch(() => null)
  const result = (await isPostDay())
    ? await createQuizPost()
    : ({ status: 'skipped', detail: 'not a configured post day' } as Result)
  console.log('daily-quiz:', JSON.stringify(result))
  return c.json<TaskResponse>({ status: 'ok' }, 200)
})

app.post('/internal/scheduler/weekly-spotlight', async (c) => {
  await c.req.json<TaskRequest>().catch(() => null)
  const result = await createSpotlightPost()
  console.log('weekly-spotlight:', JSON.stringify(result))
  return c.json<TaskResponse>({ status: 'ok' }, 200)
})

// ---------- menu + external triggers ----------

const menuHandler = (fn: () => Promise<Result>) => async (c: { json: (b: unknown, s: number) => Response }) => {
  const result = await fn()
  return c.json({ showToast: `${result.status}${result.detail ? `: ${result.detail}` : ''}` } satisfies UiResponse, 200)
}

const externalHandler = (fn: () => Promise<Result>) => async (c: { json: (b: unknown, s: number) => Response }) => {
  const result = await fn()
  return c.json(result, result.status === 'failed' ? 500 : 200)
}

app.post('/internal/menu/quiz-now', menuHandler(() => createQuizPost(true)))
app.post('/internal/menu/spotlight-now', menuHandler(() => createSpotlightPost(true)))
app.post('/internal/menu/reset-now', menuHandler(resetAll))

app.post('/external/quiz-now', externalHandler(() => createQuizPost(true)))
app.post('/external/spotlight-now', externalHandler(() => createSpotlightPost(true)))
app.post('/external/pool-refresh-now', externalHandler(refreshPool))

serve({ fetch: app.fetch, createServer, port: getServerPort() })
