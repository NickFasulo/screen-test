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
const nameKey = (uid: string) => `st:name:${uid}`
const answerLockKey = (ck: string, uid: string, qid: string) => `st:anslock:${ck}:${uid}:${qid}`
const shownKey = (ck: string, uid: string, qid: string) => `st:shown:${ck}:${uid}:${qid}`

// Speed bonus: the first client view stamps a server-side clock, and the
// award decays from FULL_PTS (<=8s) to FLOOR_PTS (>=20s). A lookup takes
// long enough that it only ever earns the floor.
const FULL_PTS = 100
const FLOOR_PTS = 25
const FULL_MS = 8_000
const FLOOR_MS = 20_000
const awardFor = (elapsed: number) =>
  elapsed <= FULL_MS
    ? FULL_PTS
    : elapsed >= FLOOR_MS
      ? FLOOR_PTS
      : FULL_PTS - Math.round(((elapsed - FULL_MS) / (FLOOR_MS - FULL_MS)) * (FULL_PTS - FLOOR_PTS))

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

// `force` is for manual menu/external triggers: the scheduler dedups once per
// day, but a mod explicitly re-running the action wants another post. Note a
// forced post rebuilds the day's quiz payload, resetting visible progress on
// the earlier post since picks are keyed by question id.
export async function createQuizPost(force = false): Promise<Result> {
  const date = todayUtc()
  if (!force && (await redis.hGet(postsKey(`d:${date}`), subId()))) {
    return { status: 'skipped', detail: 'already posted today' }
  }
  const pool = await ensurePool()
  const quiz = pool ? buildDailyQuiz(pool, date) : null
  if (!quiz) return { status: 'failed', detail: 'no quiz payload' }
  await redis.set(quizKey(date), JSON.stringify(quiz))

  const post = await reddit.submitCustomPost({
    subredditName: subName(),
    title: `Screen Test: today's film & TV trivia`,
    entry: 'default',
    postData: { mode: 'quiz', date },
    styles: { heightPixels: 512, backgroundColor: '#0a0820' },
    textFallback: {
      text: `**Screen Test: daily film & TV trivia**\n\n${quiz.questions.length} questions about movies, shows, actors and directors. Open on the Reddit app or new Reddit to play.\n\nData: TMDB · https://www.galaxymovies.app`
    }
  })
  await redis.hSet(postsKey(`d:${date}`), { [subId()]: post.id })
  await redis.set(postKey(post.id), JSON.stringify({ mode: 'quiz', date }))
  return { status: 'posted' }
}

export async function createSpotlightPost(force = false): Promise<Result> {
  const week = weekKeyUtc()
  if (!force && (await redis.hGet(postsKey(`s:${week}`), subId()))) {
    return { status: 'skipped', detail: 'already posted this week' }
  }
  const pool = await ensurePool()
  const spotlight = pool ? buildSpotlight(pool, week) : null
  if (!spotlight) return { status: 'failed', detail: 'no spotlight payload' }
  await redis.set(spotKey(week), JSON.stringify(spotlight))

  const post = await reddit.submitCustomPost({
    subredditName: subName(),
    title: `Screen Test Spotlight: ${spotlight.theme}`,
    entry: 'default',
    postData: { mode: 'spotlight', week },
    styles: { heightPixels: 512, backgroundColor: '#0a0820' },
    textFallback: {
      text: `**Screen Test Spotlight: ${spotlight.theme}**\n\n${spotlight.questions.length} themed trivia questions. Open on the Reddit app or new Reddit to play.\n\nData: TMDB · https://www.galaxymovies.app`
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
  const questions = payload?.questions || []
  const allAnswered = questions.length > 0 && questions.every((q) => picks[q.id] !== undefined)
  return {
    mode: data.mode,
    date: payload?.date,
    week: payload?.week,
    theme: payload?.theme,
    questions: questions.map(({ id, prompt, options, link }) => ({ id, prompt, options, link })),
    picks,
    score: Number(score) || 0,
    streak: Number(streak?.count) || 0,
    // Correct count is safe to expose only once the set is fully answered —
    // earlier it would leak per-question answer indexes indirectly.
    solved: allAnswered ? questions.filter((q) => picks[q.id] === String(q.answerIndex)).length : undefined
  }
}

// Records when the client first rendered a question. nx: first stamp wins,
// so it can't be reset just before answering.
export async function markShown(questionId: string) {
  const data = await getPostData()
  const payload = await payloadFor(data)
  if (!payload?.questions.some((q) => q.id === questionId)) return
  await redis
    .set(shownKey(contentKey(data), userId(), questionId), String(Date.now()), {
      nx: true,
      expiration: new Date(Date.now() + 8 * 86_400_000)
    })
    .catch(() => null)
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
  // Atomic claim: concurrent submissions could both pass an hGet check and
  // double-score; the nx lock makes the first writer win.
  const claimed = await redis
    .set(answerLockKey(ck, uid, questionId), '1', { nx: true, expiration: new Date(Date.now() + 60_000) })
    .catch(() => null)
  if (!claimed) return { error: 'already answered', status: 409 as const }

  const existing = await redis.hGet(picksKey(ck, uid), questionId).catch(() => null)
  if (existing !== null && existing !== undefined) {
    return { error: 'already answered', status: 409 as const }
  }

  // Store the username once so leaderboards can show u/name, not t2_ ids.
  if (!(await redis.get(nameKey(uid)).catch(() => null))) {
    const name = await reddit.getCurrentUsername().catch(() => undefined)
    if (name) await redis.set(nameKey(uid), name).catch(() => {})
  }

  const correct = choice === question.answerIndex
  await redis.hSet(picksKey(ck, uid), { [questionId]: String(choice) })
  let points = 0
  if (correct) {
    const shown = Number(await redis.get(shownKey(ck, uid, questionId)).catch(() => null)) || 0
    // Missing stamp (unstamped view) can't verify speed: scores at the floor.
    points = awardFor(shown ? Date.now() - shown : Number.POSITIVE_INFINITY)
    await redis.hIncrBy(scoreKey(subId()), uid, points).catch(() => {})
  }

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
  return { correct, answerIndex: question.answerIndex, link: question.link, points, score: Number(score) || 0, streak }
}

export async function getLeaderboard() {
  const all = ((await redis.hGetAll(scoreKey(subId())).catch(() => null)) || {}) as Record<string, string>
  const sorted = Object.entries(all)
    .map(([uid, s]) => ({ userId: uid, score: Number(s) }))
    .sort((a, b) => b.score - a.score)
  const top = sorted.slice(0, 10)
  const names = await Promise.all(top.map((r) => redis.get(nameKey(r.userId)).catch(() => null)))
  const rows = top.map((r, i) => ({ ...r, username: names[i] || r.userId.replace(/^t2_/, '') }))
  const myIndex = sorted.findIndex((r) => r.userId === userId())
  const me = myIndex === -1 ? null : { rank: myIndex + 1, score: sorted[myIndex].score }
  return { rows, me }
}
