import { context, reddit, redis, settings } from '@devvit/web/server'
import { ensurePool } from './tmdb'
import { buildDailyQuiz, buildSpotlight } from './questions'
import type { TriviaQuestion } from './questions'

const FALLBACK_SUB = 'galaxymovies'

interface QuizPayload {
  date?: string
  week?: string
  theme?: string
  questions: TriviaQuestion[]
}

// Content key: `d:{date}` for daily quizzes, `s:{week}` for spotlights. Both
// namespaces share picks/scores/streaks so a player answering the spotlight
// builds the same streak as the daily quiz.
const contentKey = (d: { date?: string; week?: string }) => (d.week ? `s:${d.week}` : `d:${d.date}`)
const quizKey = (date: string) => `st:quiz:${date}`
const spotKey = (week: string) => `st:spotlight:${week}`
const postsKey = (ck: string) => `st:posts:${ck}`
const picksKey = (ck: string, uid: string) => `st:picks:${ck}:${uid}`
const scoreKey = (subId: string) => `st:score:${subId}`
const streakKey = (uid: string) => `st:streak:${uid}`

export const todayUtc = () => new Date().toISOString().split('T')[0]
export const weekKeyUtc = (d = new Date()) => {
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7)
  return `${d.getUTCFullYear()}-W${week}`
}

const subId = () => String(context.subredditId ?? 'unknown')
const subName = () => context.subredditName ?? FALLBACK_SUB
const userId = () => String(context.userId ?? 'anon')

// The post record is stored at creation time so client /api calls only need
// context.postId — context.postData isn't reliably populated on those.
type PostData = { mode: 'quiz' | 'spotlight'; date?: string; week?: string }
const postKey = (postId: string) => `st:post:${postId}`
async function getPostData(): Promise<PostData> {
  const raw = context.postId ? await redis.get(postKey(context.postId)).catch(() => null) : null
  if (raw) return JSON.parse(raw) as PostData
  return (context.postData as PostData | undefined) ?? { mode: 'quiz', date: todayUtc() }
}

async function payloadFor(data: PostData): Promise<QuizPayload | null> {
  const key = data.mode === 'spotlight' ? spotKey(data.week || weekKeyUtc()) : quizKey(data.date || todayUtc())
  const raw = await redis.get(key).catch(() => null)
  return raw ? (JSON.parse(raw) as QuizPayload) : null
}

export type Result = { status: string; detail?: string }

export async function createQuizPost(): Promise<Result> {
  const date = todayUtc()
  if (await redis.hGet(postsKey(`d:${date}`), subId())) {
    return { status: 'skipped', detail: 'already posted today' }
  }
  const pool = await ensurePool()
  const quiz = pool ? buildDailyQuiz(pool, date) : null
  if (!quiz) return { status: 'failed', detail: 'no quiz payload' }
  await redis.set(quizKey(date), JSON.stringify(quiz))

  const post = await reddit.submitCustomPost({
    subredditName: subName(),
    title: `Screen Test — today's film & TV trivia`,
    entry: 'default',
    postData: { mode: 'quiz', date },
    styles: { heightPixels: 512, backgroundColor: '#14181c' },
    textFallback: {
      text: `**Screen Test — daily film & TV trivia**\n\n${quiz.questions.length} questions about movies, shows, actors and directors. Open on the Reddit app or new Reddit to play.\n\nData: TMDB · https://www.galaxymovies.app`
    }
  })
  await redis.hSet(postsKey(`d:${date}`), { [subId()]: post.id })
  await redis.set(postKey(post.id), JSON.stringify({ mode: 'quiz', date }))
  return { status: 'posted' }
}

export async function createSpotlightPost(): Promise<Result> {
  const week = weekKeyUtc()
  if (await redis.hGet(postsKey(`s:${week}`), subId())) {
    return { status: 'skipped', detail: 'already posted this week' }
  }
  const pool = await ensurePool()
  const spotlight = pool ? buildSpotlight(pool, week) : null
  if (!spotlight) return { status: 'failed', detail: 'no spotlight payload' }
  await redis.set(spotKey(week), JSON.stringify(spotlight))

  const post = await reddit.submitCustomPost({
    subredditName: subName(),
    title: `Screen Test Spotlight — ${spotlight.theme}`,
    entry: 'default',
    postData: { mode: 'spotlight', week },
    styles: { heightPixels: 512, backgroundColor: '#14181c' },
    textFallback: {
      text: `**Screen Test Spotlight — ${spotlight.theme}**\n\n${spotlight.questions.length} themed trivia questions. Open on the Reddit app or new Reddit to play.\n\nData: TMDB · https://www.galaxymovies.app`
    }
  })
  await redis.hSet(postsKey(`s:${week}`), { [subId()]: post.id })
  await redis.set(postKey(post.id), JSON.stringify({ mode: 'spotlight', week }))
  return { status: 'posted' }
}

export async function refreshPool(): Promise<Result> {
  const pool = await ensurePool(true)
  return pool
    ? { status: 'ok', detail: `${pool.titles.length} titles` }
    : { status: 'failed', detail: 'pool build failed' }
}

// Whether today is a configured post day for this install. `post_days` is a
// subreddit setting so subs running several apps can space out their posts.
export async function isPostDay(): Promise<boolean> {
  const all = await settings.getAll<{ post_days?: string[] | string }>().catch(() => ({}) as { post_days?: string[] | string })
  const raw = all.post_days
  const days = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? [raw] : ['1', '3', '5']
  return days.includes(String(new Date().getUTCDay()))
}

// ---------- client API helpers ----------

export async function getState() {
  const data = await getPostData()
  const payload = await payloadFor(data)
  const ck = contentKey(data)
  const picks = (await redis.hGetAll(picksKey(ck, userId())).catch(() => null)) || {}
  const streak = (await redis.hGetAll(streakKey(userId())).catch(() => null)) as { count?: string } | null
  const score = await redis.hGet(scoreKey(subId()), userId()).catch(() => null)
  return {
    mode: data.mode,
    date: payload?.date,
    week: payload?.week,
    theme: payload?.theme,
    questions: (payload?.questions || []).map(({ id, prompt, options, link }) => ({ id, prompt, options, link })),
    picks,
    score: Number(score) || 0,
    streak: Number(streak?.count) || 0
  }
}

export async function submitAnswer(questionId: string, choice: number) {
  const data = await getPostData()
  const payload = await payloadFor(data)
  const question = payload?.questions.find((q) => q.id === questionId)
  if (!payload || !question || typeof choice !== 'number') {
    return { error: 'bad request', status: 400 as const }
  }
  const ck = contentKey(data)
  const uid = userId()
  const existing = await redis.hGet(picksKey(ck, uid), questionId).catch(() => null)
  if (existing !== null && existing !== undefined) {
    return { error: 'already answered', status: 409 as const }
  }

  const correct = choice === question.answerIndex
  await redis.hSet(picksKey(ck, uid), { [questionId]: String(choice) })
  if (correct) await redis.hIncrBy(scoreKey(subId()), uid, 1).catch(() => {})

  // Streak: increments when the set is fully answered with all correct.
  const picks = (await redis.hGetAll(picksKey(ck, uid)).catch(() => null)) || {}
  const answeredAll = payload.questions.every((q) => picks[q.id] !== undefined)
  let streak = 0
  if (answeredAll) {
    const allRight = payload.questions.every((q) => picks[q.id] === String(q.answerIndex))
    const prev = (await redis.hGetAll(streakKey(uid)).catch(() => null)) as { count?: string; lastKey?: string } | null
    if (allRight) {
      streak = prev?.lastKey && prev.lastKey !== ck ? Number(prev.count) + 1 : prev?.lastKey === ck ? Number(prev.count) : 1
      await redis.hSet(streakKey(uid), { count: String(streak), lastKey: ck })
    } else {
      await redis.hSet(streakKey(uid), { count: '0', lastKey: ck })
    }
  }

  const score = await redis.hGet(scoreKey(subId()), uid).catch(() => null)
  return { correct, answerIndex: question.answerIndex, link: question.link, score: Number(score) || 0, streak }
}

export async function getLeaderboard() {
  const all = ((await redis.hGetAll(scoreKey(subId())).catch(() => null)) || {}) as Record<string, string>
  const rows = Object.entries(all)
    .map(([uid, s]) => ({ userId: uid, score: Number(s) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
  return { rows }
}
