import { redis, settings } from '@devvit/web/server'

// TMDB access + the shared enriched title pool. The pool is built once a week
// by the pool-refresh task (or lazily by the first post creator that finds it
// stale) and lives in app-global Redis, so every install serves questions from
// the same ground truth — which is also what makes distractor verification
// possible.

const TMDB_URL = 'https://api.themoviedb.org/3'
const POOL_KEY = 'st:pool'
const POOL_LOCK = 'st:pool:lock'
const POOL_FRESH_MS = 7 * 24 * 60 * 60 * 1000
const POOL_SIZE = 140
const MIN_VOTES = 500

export interface CastEntry {
  name: string
  character: string
}

export interface PoolTitle {
  tmdbId: number
  tmdbType: 'movie' | 'tv'
  title: string
  year: number
  directors: string[]
  cast: CastEntry[]
  creators: string[]
  networks: string[]
  seasons: number | null
  collectionName: string | null
}

export interface Pool {
  titles: PoolTitle[]
  people: Record<string, { actedIn: number[]; directed: number[] }>
  updatedAt: number
}

interface TmdbPaged<T> {
  results?: T[]
}

interface TmdbListItem {
  id: number
  media_type?: string
  title?: string
  name?: string
  vote_count?: number
  popularity?: number
}

interface TmdbDetails {
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  number_of_seasons?: number | null
  created_by?: { name: string }[]
  networks?: { name: string }[]
  belongs_to_collection?: { name: string } | null
  credits?: {
    cast?: { name: string; character?: string; order?: number }[]
    crew?: { name: string; job?: string }[]
  }
}

async function tmdbFetch<T>(path: string, params: Record<string, string | number> = {}): Promise<T | null> {
  const apiKey = await settings.get<string>('tmdb-api-key').catch(() => undefined)
  if (!apiKey) return null
  const qs = new URLSearchParams({ api_key: apiKey, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })
  let response: Response | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(`${TMDB_URL}${path}?${qs}`, { signal: AbortSignal.timeout(8000) })
      if (response.ok || (response.status !== 429 && response.status < 500)) break
    } catch {
      response = null
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400))
  }
  if (!response?.ok) return null
  return (await response.json().catch(() => null)) as T | null
}

const seededRng = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const seedFrom = (s: string) => [...s].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 7)

async function fetchList(path: string): Promise<TmdbListItem[]> {
  const data = await tmdbFetch<TmdbPaged<TmdbListItem>>(path)
  return data?.results || []
}

// Weekly candidate sample: trending keeps the pool current, popular/top_rated
// keep it recognizable. The week seed rotates which borderline titles make the
// cut so the pool drifts over time instead of ossifying.
async function collectCandidates(): Promise<{ id: number; type: 'movie' | 'tv' }[]> {
  const [trendM, trendT, popM, popT, topM, topT] = await Promise.all([
    fetchList('/trending/movie/week'),
    fetchList('/trending/tv/week'),
    fetchList('/movie/popular'),
    fetchList('/tv/popular'),
    fetchList('/movie/top_rated'),
    fetchList('/tv/top_rated')
  ])
  const seen = new Map<string, { id: number; type: 'movie' | 'tv'; votes: number }>()
  for (const [items, type] of [
    [trendM, 'movie'],
    [trendT, 'tv'],
    [popM, 'movie'],
    [popT, 'tv'],
    [topM, 'movie'],
    [topT, 'tv']
  ] as const) {
    for (const it of items) {
      const key = `${type}:${it.id}`
      if (!seen.has(key) && (it.vote_count || 0) >= MIN_VOTES) {
        seen.set(key, { id: it.id, type, votes: it.vote_count || 0 })
      }
    }
  }
  const week = new Date().toISOString().slice(0, 10)
  return shuffle(seededRng(seedFrom(`pool:${week}`)), [...seen.values()]).slice(0, POOL_SIZE)
}

const toPoolTitle = (d: TmdbDetails, id: number, type: 'movie' | 'tv'): PoolTitle | null => {
  const title = type === 'movie' ? d.title : d.name
  const dateStr = type === 'movie' ? d.release_date : d.first_air_date
  const cast = (d.credits?.cast || [])
    .filter((c) => c.name)
    .slice(0, 6)
    .map((c) => ({ name: c.name, character: (c.character || '').split(' / ')[0].trim() }))
  const directors = (d.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name)
  const creators = (d.created_by || []).map((c) => c.name)
  if (!title || !dateStr || cast.length < 3) return null
  if (type === 'movie' && !directors.length) return null
  return {
    tmdbId: id,
    tmdbType: type,
    title,
    year: Number(dateStr.slice(0, 4)),
    directors,
    cast,
    creators,
    networks: (d.networks || []).map((n) => n.name),
    seasons: d.number_of_seasons ?? null,
    collectionName: d.belongs_to_collection?.name || null
  }
}

export async function buildPool(): Promise<Pool | null> {
  const candidates = await collectCandidates()
  if (candidates.length < 40) return null

  const titles: PoolTitle[] = []
  const CONCURRENCY = 8
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async ({ id, type }) => {
        const d = await tmdbFetch<TmdbDetails>(`/${type}/${id}`, { append_to_response: 'credits' })
        return d ? toPoolTitle(d, id, type) : null
      })
    )
    for (const t of results) if (t) titles.push(t)
  }
  if (titles.length < 40) return null

  const people: Pool['people'] = {}
  for (const t of titles) {
    for (const c of t.cast) {
      ;(people[c.name] ||= { actedIn: [], directed: [] }).actedIn.push(t.tmdbId)
    }
    for (const d of [...t.directors, ...t.creators]) {
      ;(people[d] ||= { actedIn: [], directed: [] }).directed.push(t.tmdbId)
    }
  }
  return { titles, people, updatedAt: Date.now() }
}

// Returns a usable pool or null. Acquires a short lock so parallel installs
// (every sub runs its own scheduler) don't each burn ~140 TMDB calls at once;
// a stale pool is always better than none, so losers just serve the old one.
export async function ensurePool(force = false): Promise<Pool | null> {
  const raw = await redis.get(POOL_KEY).catch(() => null)
  const pool = raw ? (JSON.parse(raw) as Pool) : null
  if (pool && !force && Date.now() - pool.updatedAt < POOL_FRESH_MS) return pool

  const locked = await redis.set(POOL_LOCK, '1', { nx: true, expiration: new Date(Date.now() + 300_000) }).catch(() => null)
  if (!locked) return pool
  try {
    const fresh = await buildPool()
    if (fresh) {
      await redis.set(POOL_KEY, JSON.stringify(fresh)).catch(() => {})
      return fresh
    }
    return pool
  } finally {
    await redis.del(POOL_LOCK).catch(() => {})
  }
}
