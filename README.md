# Screen Test

Daily film & TV trivia for Reddit — movies, shows, actors, directors — powered
by TMDB metadata.

- **Daily quiz** (16:00 UTC, on the sub's configured post days): 5 questions
  built from a shared, weekly-refreshed pool of ~140 well-known titles enriched
  with real cast/crew credits. One-shot answers, per-sub scores, streaks, and a
  leaderboard.
- **Weekly spotlight** (Wednesday): a themed round — a director spotlight, a
  decade week, or a franchise week — drawn from the same pool.

Every distractor is verified against the pool's real credit data, so no option
is ever "also technically correct." Question sets are deterministic per
date/week, so every install plays the same quiz on the same day.

## Fetch Domains

The following domains are requested for this app:

- `api.themoviedb.org` — fetches read-only title lists (trending, popular,
  top_rated) and title details with appended credits (`/movie/{id}`,
  `/tv/{id}?append_to_response=credits`) to build the quiz pool. Roughly 150
  GETs once a week per app, shared across all installs. The app performs no
  other outbound requests.

## Data & privacy

Stores only pseudonymous Reddit IDs (`t2_*`) with answer picks, per-subreddit
scores, and streaks in Devvit Redis — used solely to render scores and the
leaderboard. No personal data leaves Reddit.

TMDB API key is a developer-set app-scope secret (`devvit settings set
tmdb-api-key`); installers never see or need it. "Powered by TMDB" attribution
is shown in every post.

## Commands

- `npm run build` — client + server bundles into `dist/`
- `npm run typecheck` / `npm test` — tsc + vitest (question-builder tests)
- `npm run dev` — `devvit playtest` against `screen_test_dev`
- `npm run upload` — upload a version to the Developer Portal
- `node scripts/generate-assets.cjs` — regenerate the directory-listing PNGs (`--video` also writes `devvit-featuring-1500x1000.mp4`, an 8s chase-light loop for the featuring slot)
