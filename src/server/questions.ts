import type { Pool, PoolTitle } from './tmdb'

// Deterministic question generation — the same date seed over the shared pool
// produces the same quiz for every installed subreddit. Every distractor is
// checked against pool facts so no option is accidentally also correct.

export interface TriviaQuestion {
  id: string
  prompt: string
  options: string[]
  answerIndex: number
  link: string
}

const GM = 'https://www.galaxymovies.app'

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const seedFrom = (s: string) => [...s].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 7)

function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const norm = (t: string) => t.toLowerCase().trim()
const kindLabel = (t: PoolTitle) => (t.tmdbType === 'tv' ? 'show' : 'movie')

interface Ctx {
  pool: Pool
  rng: () => number
  used: Set<string>
  out: TriviaQuestion[]
}

const titleLink = (t: PoolTitle) => `${GM}/${t.tmdbType === 'tv' ? 'tv' : 'movies'}/${t.tmdbId}`

type Builder = (ctx: Ctx, candidates: PoolTitle[]) => TriviaQuestion | null

function make(ctx: Ctx, prompt: string, answer: string, distractors: string[], link: string): TriviaQuestion | null {
  const seen = new Set<string>([norm(answer)])
  const uniq: string[] = []
  for (const d of distractors) {
    const n = norm(d)
    if (!seen.has(n)) {
      seen.add(n)
      uniq.push(d)
    }
  }
  // Prefer distractors not already used in this quiz; shuffled so the same
  // insertion-order names don't recur as options in every question.
  const fresh = uniq.filter((d) => !ctx.used.has(`d${norm(d)}`))
  const pool = fresh.length >= 3 ? fresh : uniq
  if (pool.length < 3) return null
  const picks = shuffle(ctx.rng, pool).slice(0, 3)
  for (const d of picks) ctx.used.add(`d${norm(d)}`)
  const options = shuffle(ctx.rng, [answer, ...picks])
  return { id: `q${ctx.out.length + 1}`, prompt, options, answerIndex: options.indexOf(answer), link }
}

const otherDirectors = (ctx: Ctx, exclude: Set<string>) =>
  Object.keys(ctx.pool.people).filter((p) => ctx.pool.people[p].directed.length > 0 && !exclude.has(norm(p)))

const otherActors = (ctx: Ctx, t: PoolTitle) =>
  Object.keys(ctx.pool.people).filter((p) => ctx.pool.people[p].actedIn.length > 0 && !t.cast.some((c) => norm(c.name) === norm(p)))

const firstFree = (ctx: Ctx, titles: PoolTitle[], ok: (t: PoolTitle) => boolean) =>
  titles.find((t) => !ctx.used.has(`t${t.tmdbId}`) && ok(t))

const directorQ: Builder = (ctx, candidates) => {
  const t = firstFree(ctx, candidates, (x) => x.tmdbType === 'movie' && x.directors.length > 0)
  if (!t) return null
  const answer = t.directors.join(' & ')
  const q = make(
    ctx,
    `Who directed ${t.title} (${t.year})?`,
    answer,
    otherDirectors(ctx, new Set(t.directors.map(norm))),
    titleLink(t)
  )
  if (q) ctx.used.add(`t${t.tmdbId}`)
  return q
}

const characterQ: Builder = (ctx, candidates) => {
  const t = firstFree(ctx, candidates, (x) => x.cast.some((c) => c.character))
  if (!t) return null
  const member = shuffle(ctx.rng, t.cast.filter((c) => c.character))[0]
  if (ctx.used.has(`p${norm(member.name)}`)) return null
  const q = make(ctx, `Who plays ${member.character} in ${t.title}?`, member.name, otherActors(ctx, t), titleLink(t))
  if (q) {
    ctx.used.add(`t${t.tmdbId}`)
    ctx.used.add(`p${norm(member.name)}`)
  }
  return q
}

const actedIn = (ctx: Ctx, name: string) =>
  ctx.pool.people[name]?.actedIn
    .map((id) => ctx.pool.titles.find((t) => t.tmdbId === id))
    .filter((t): t is PoolTitle => Boolean(t)) || []

const filmographyQ: Builder = (ctx, candidates) => {
  const names = shuffle(
    ctx.rng,
    Object.keys(ctx.pool.people).filter((p) => !ctx.used.has(`p${norm(p)}`) && ctx.pool.people[p].actedIn.length >= 1)
  )
  for (const name of names) {
    const hits = actedIn(ctx, name).filter((t) => candidates.includes(t) && !ctx.used.has(`t${t.tmdbId}`))
    if (!hits.length) continue
    const answer = hits[0]
    const distractors = candidates
      .filter((t) => t.tmdbType === answer.tmdbType && !t.cast.some((c) => norm(c.name) === norm(name)))
      .map((t) => t.title)
    const q = make(
      ctx,
      `Which of these ${kindLabel(answer)}s stars ${name}?`,
      answer.title,
      distractors,
      titleLink(answer)
    )
    if (q) {
      ctx.used.add(`p${norm(name)}`)
      ctx.used.add(`t${answer.tmdbId}`)
      return q
    }
  }
  return null
}

const pairQ: Builder = (ctx, candidates) => {
  // Prefer pairs where both leads have other pool credits — two recognizably
  // busy actors makes a fairer question than one famous and one obscure lead.
  const t =
    firstFree(
      ctx,
      candidates,
      (x) =>
        x.cast.length >= 2 &&
        (ctx.pool.people[x.cast[0].name]?.actedIn.length ?? 0) >= 2 &&
        (ctx.pool.people[x.cast[1].name]?.actedIn.length ?? 0) >= 2
    ) || firstFree(ctx, candidates, (x) => x.cast.length >= 2)
  if (!t) return null
  const [a, b] = [t.cast[0].name, t.cast[1].name]
  const distractors = candidates
    .filter((x) => x.tmdbType === t.tmdbType && !(x.cast.some((c) => norm(c.name) === norm(a)) && x.cast.some((c) => norm(c.name) === norm(b))))
    .map((x) => x.title)
  const q = make(ctx, `${a} and ${b} both appear in which ${kindLabel(t)}?`, t.title, distractors, titleLink(t))
  if (q) ctx.used.add(`t${t.tmdbId}`)
  return q
}

const creatorQ: Builder = (ctx, candidates) => {
  const t = firstFree(ctx, candidates, (x) => x.tmdbType === 'tv' && x.creators.length > 0)
  if (!t) return null
  const answer = t.creators.join(' & ')
  const others = otherDirectors(ctx, new Set(t.creators.map(norm)))
  const q = make(ctx, `Who created ${t.title}?`, answer, others, titleLink(t))
  if (q) ctx.used.add(`t${t.tmdbId}`)
  return q
}

const networkQ: Builder = (ctx, candidates) => {
  const t = firstFree(ctx, candidates, (x) => x.tmdbType === 'tv' && x.networks.length > 0)
  if (!t) return null
  const answer = t.networks[0]
  const others = [...new Set(ctx.pool.titles.flatMap((x) => x.networks))].filter((n) => !t.networks.some((x) => norm(x) === norm(n)))
  const q = make(ctx, `Which network aired ${t.title}?`, answer, others, titleLink(t))
  if (q) ctx.used.add(`t${t.tmdbId}`)
  return q
}

const seasonsQ: Builder = (ctx, candidates) => {
  const t = firstFree(ctx, candidates, (x) => x.tmdbType === 'tv' && (x.seasons ?? 0) >= 2)
  if (!t || !t.seasons) return null
  const distractors = shuffle(ctx.rng, [t.seasons - 1, t.seasons + 1, t.seasons - 2, t.seasons + 2, t.seasons + 3])
    .filter((n) => n >= 1)
    .map(String)
  const q = make(ctx, `How many seasons of ${t.title} are there?`, String(t.seasons), distractors, titleLink(t))
  if (q) ctx.used.add(`t${t.tmdbId}`)
  return q
}

const yearQ: Builder = (ctx, candidates) => {
  const t = firstFree(ctx, candidates, (x) => x.year > 1970)
  if (!t) return null
  const distractors = shuffle(ctx.rng, [t.year - 1, t.year + 1, t.year - 2, t.year + 2, t.year - 3, t.year + 3])
    .map(String)
  const verb = t.tmdbType === 'tv' ? 'first air' : 'premiere'
  const q = make(ctx, `What year did ${t.title} ${verb}?`, String(t.year), distractors, titleLink(t))
  if (q) ctx.used.add(`t${t.tmdbId}`)
  return q
}

const collectionGroups = (pool: Pool) => {
  const groups = new Map<string, PoolTitle[]>()
  for (const t of pool.titles) {
    if (!t.collectionName) continue
    groups.set(t.collectionName, [...(groups.get(t.collectionName) || []), t])
  }
  return [...groups.entries()].filter(([, v]) => v.length >= 3)
}

const collectionQ: Builder = (ctx, candidates) => {
  const memberSets = new Map<string, Set<number>>(
    collectionGroups(ctx.pool).map(([name, ts]) => [name, new Set(ts.map((t) => t.tmdbId))])
  )
  // Dedupe display titles — remakes (e.g. two "Dune" entries) would otherwise
  // render as indistinguishable options, which make() can't catch here.
  const uniqTitles = (ts: PoolTitle[]) => {
    const seen = new Set<string>()
    return ts.filter((t) => !seen.has(norm(t.title)) && seen.add(norm(t.title)))
  }
  for (const [name, members] of memberSets) {
    const inPool = uniqTitles(candidates.filter((t) => members.has(t.tmdbId)))
    const outsiders = candidates.filter(
      (t) => !members.has(t.tmdbId) && !ctx.used.has(`t${t.tmdbId}`) && !inPool.some((m) => norm(m.title) === norm(t.title))
    )
    if (inPool.length < 3 || !outsiders.length) continue
    const answer = outsiders[0]
    const options = [answer.title, ...shuffle(ctx.rng, inPool).slice(0, 3).map((t) => t.title)]
    const shuffled = shuffle(ctx.rng, options)
    ctx.used.add(`t${answer.tmdbId}`)
    return {
      id: `q${ctx.out.length + 1}`,
      prompt: `Which of these is NOT part of ${name}?`,
      options: shuffled,
      answerIndex: shuffled.indexOf(answer.title),
      link: titleLink(answer)
    }
  }
  return null
}

// Spotlight-only builders

const directedByQ = (ctx: Ctx, name: string, candidates: PoolTitle[]): TriviaQuestion | null => {
  const mine = candidates.filter((t) => [...t.directors, ...t.creators].some((d) => norm(d) === norm(name)) && !ctx.used.has(`t${t.tmdbId}`))
  if (!mine.length) return null
  const answer = mine[0]
  const distractors = candidates
    .filter((t) => ![...t.directors, ...t.creators].some((d) => norm(d) === norm(name)))
    .map((t) => t.title)
  // People land in `directed` via TV creator credits too — "directed a show"
  // is the wrong verb for a pure showrunner.
  const verb = answer.tmdbType === 'tv' && !answer.directors.some((d) => norm(d) === norm(name)) ? 'create' : 'direct'
  const q = make(ctx, `Which of these did ${name} ${verb}?`, answer.title, distractors, titleLink(answer))
  if (q) ctx.used.add(`t${answer.tmdbId}`)
  return q
}

const tvQ: Builder = (ctx, candidates) => {
  for (const b of shuffle(ctx.rng, [creatorQ, networkQ, seasonsQ] as Builder[])) {
    const q = b(ctx, candidates)
    if (q) return q
  }
  return null
}

function build(ctx: Ctx, order: Builder[], candidates: PoolTitle[], count: number): TriviaQuestion[] {
  for (const b of order) {
    if (ctx.out.length >= count) break
    const q = b(ctx, candidates)
    if (q) ctx.out.push(q)
  }
  // Pad with repeats of generic builders over unused titles.
  const pad: Builder[] = [directorQ, characterQ, filmographyQ, yearQ, pairQ, tvQ]
  for (const b of pad) {
    if (ctx.out.length >= count) break
    const q = b(ctx, candidates)
    if (q) ctx.out.push(q)
  }
  return ctx.out
}

export interface DailyQuiz {
  date: string
  questions: TriviaQuestion[]
}

export function buildDailyQuiz(pool: Pool, date: string, count = 5): DailyQuiz | null {
  const rng = mulberry32(seedFrom(date))
  const ctx: Ctx = { pool, rng, used: new Set(), out: [] }
  const candidates = shuffle(rng, pool.titles)
  const order = shuffle(rng, [directorQ, characterQ, filmographyQ, tvQ, yearQ] as Builder[])
  build(ctx, order, candidates, count)
  return ctx.out.length >= 3 ? { date, questions: ctx.out } : null
}

export interface Spotlight {
  week: string
  theme: string
  questions: TriviaQuestion[]
}

interface Theme {
  label: string
  titles: PoolTitle[]
}

const decadeLabel = (d: number) => `'${d % 100}s`

export function buildSpotlight(pool: Pool, week: string, count = 7): Spotlight | null {
  const rng = mulberry32(seedFrom(`${week}:spotlight`))

  const themes: Theme[] = []
  for (const [name, p] of Object.entries(pool.people)) {
    const titles = p.directed.map((id) => pool.titles.find((t) => t.tmdbId === id)).filter((t): t is PoolTitle => Boolean(t))
    if (titles.length >= 4) themes.push({ label: `Spotlight: ${name}`, titles })
  }
  for (const [name, ts] of collectionGroups(pool)) themes.push({ label: `${name} week`, titles: ts })
  const decades = new Map<number, PoolTitle[]>()
  for (const t of pool.titles) {
    const d = Math.floor(t.year / 10) * 10
    decades.set(d, [...(decades.get(d) || []), t])
  }
  for (const [d, ts] of decades) {
    if (ts.length >= 12) themes.push({ label: `The ${decadeLabel(d)} in film & TV`, titles: ts })
  }
  if (!themes.length) return null

  const theme = themes[Math.floor(rng() * themes.length)]
  const ctx: Ctx = { pool, rng, used: new Set(), out: [] }
  const themeTitles = shuffle(rng, theme.titles)
  const allTitles = shuffle(rng, pool.titles)

  // Theme-scoped questions first, then general questions to fill the round.
  const spotlightName = theme.label.startsWith('Spotlight: ') ? theme.label.slice(11) : null
  if (spotlightName) {
    const q = directedByQ(ctx, spotlightName, allTitles)
    if (q) ctx.out.push(q)
    for (const b of shuffle(rng, [directorQ, characterQ, pairQ] as Builder[])) {
      if (ctx.out.length >= 3) break
      const q = b(ctx, themeTitles)
      if (q) ctx.out.push(q)
    }
  } else if (theme.label.endsWith(' week')) {
    const q = collectionQ(ctx, allTitles)
    if (q) ctx.out.push(q)
    for (const b of shuffle(rng, [characterQ, pairQ, yearQ] as Builder[])) {
      if (ctx.out.length >= 3) break
      const q = b(ctx, themeTitles)
      if (q) ctx.out.push(q)
    }
  } else {
    for (const b of shuffle(rng, [yearQ, directorQ, characterQ, filmographyQ] as Builder[])) {
      if (ctx.out.length >= 3) break
      const q = b(ctx, themeTitles)
      if (q) ctx.out.push(q)
    }
  }
  build(ctx, shuffle(rng, [directorQ, characterQ, filmographyQ, tvQ, yearQ, pairQ, collectionQ] as Builder[]), allTitles, count)
  return ctx.out.length >= 4 ? { week, theme: theme.label, questions: ctx.out } : null
}
