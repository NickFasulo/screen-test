import { navigateTo } from '@devvit/web/client'
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

interface Question {
  id: string
  prompt: string
  options: string[]
  link: string
}
interface State {
  mode: 'quiz' | 'spotlight'
  date?: string
  week?: string
  theme?: string
  questions?: Question[]
  picks?: Record<string, string>
  score?: number
  streak?: number
}

const api = async <T,>(path: string, body?: unknown): Promise<T> => {
  const resp = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error((data as { error?: string }).error || `HTTP ${resp.status}`)
  return data as T
}

function QuestionCard({
  q,
  picked,
  revealed,
  isLast,
  exiting,
  onPick,
  onNext,
  onExitDone
}: {
  q: Question
  picked: number | undefined
  revealed: { answerIndex: number; link: string } | undefined
  isLast: boolean
  exiting: boolean
  onPick: (choice: number) => void
  onNext: () => void
  onExitDone?: () => void
}) {
  return (
    <div className={`card qcard${exiting ? ' exit' : ''}`} onAnimationEnd={onExitDone}>
      <div className='prompt'>{q.prompt}</div>
      {q.options.map((opt, i) => {
        let cls = 'opt'
        if (picked !== undefined && revealed) {
          if (i === revealed.answerIndex) cls += ' correct'
          else if (i === picked) cls += ' wrong'
          else cls += ' dim'
        }
        return (
          <button key={i} className={cls} disabled={picked !== undefined} onClick={() => onPick(i)}>
            {opt}
          </button>
        )
      })}
      {revealed && (
        <a
          className='link'
          href={revealed.link}
          onClick={(e) => {
            e.preventDefault()
            navigateTo(revealed.link)
          }}
        >
          More on this title →
        </a>
      )}
      {picked !== undefined && (
        <button className='primary next' onClick={onNext}>
          {isLast ? 'See results →' : 'Next →'}
        </button>
      )}
    </div>
  )
}

function Quiz({ state }: { state: State }) {
  const questions = state.questions || []
  const [picks, setPicks] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    for (const [k, v] of Object.entries(state.picks || {})) init[k] = Number(v)
    return init
  })
  const [index, setIndex] = useState(() => {
    const idx = questions.findIndex((q) => state.picks?.[q.id] === undefined)
    return idx === -1 ? questions.length : idx
  })
  const [leaving, setLeaving] = useState<Question | null>(null)
  const [answers, setAnswers] = useState<Record<string, { answerIndex: number; link: string }>>({})
  const [score, setScore] = useState(state.score || 0)
  const [streak, setStreak] = useState(state.streak || 0)
  const [board, setBoard] = useState<{ userId: string; score: number }[] | null>(null)

  const current = index < questions.length ? questions[index] : undefined
  const done = !current && questions.length > 0
  const correctCount = questions.filter((q) => answers[q.id]?.answerIndex === picks[q.id]).length

  const answer = async (q: Question, choice: number) => {
    if (picks[q.id] !== undefined) return
    setPicks((p) => ({ ...p, [q.id]: choice }))
    try {
      const res = await api<{ correct: boolean; answerIndex: number; link: string; score: number; streak: number }>(
        '/api/answer',
        { questionId: q.id, choice }
      )
      setAnswers((a) => ({ ...a, [q.id]: { answerIndex: res.answerIndex, link: res.link } }))
      setScore(res.score)
      if (res.streak) setStreak(res.streak)
    } catch {
      // already answered or offline — leave pick marked
    }
  }

  const advance = () => {
    if (!current || leaving) return
    setLeaving(current)
    setIndex((i) => i + 1)
    window.setTimeout(() => setLeaving(null), 400)
  }

  if (!questions.length) {
    return <div className='card'>No quiz data — check back soon.</div>
  }

  return (
    <>
      <div className='meta'>
        <span>
          Question {Math.min(index + 1, questions.length)} / {questions.length}
        </span>
        <span>
          Score {score}
          {streak > 1 ? ` · ${streak}-set streak` : ''}
        </span>
      </div>
      <div className='stage'>
        {leaving && (
          <QuestionCard
            q={leaving}
            picked={picks[leaving.id]}
            revealed={answers[leaving.id]}
            isLast
            exiting
            onPick={() => {}}
            onNext={() => {}}
            onExitDone={() => setLeaving(null)}
          />
        )}
        {current && (
          <QuestionCard
            key={current.id}
            q={current}
            picked={picks[current.id]}
            revealed={answers[current.id]}
            isLast={index === questions.length - 1}
            exiting={false}
            onPick={(choice) => answer(current, choice)}
            onNext={advance}
          />
        )}
      </div>
      {done && (
        <div className='card center'>
          <div className='brand'>Cut. That's a wrap.</div>
          <div className='score-big'>
            {correctCount}/{questions.length}
          </div>
          <div className='sub'>{streak > 1 ? `${streak} perfect sets in a row` : 'New quiz drops on your sub’s post days'}</div>
          <button className='primary' onClick={() => api<{ rows: { userId: string; score: number }[] }>('/api/leaderboard').then((r) => setBoard(r.rows))}>
            Show leaderboard
          </button>
          {board && (
            <div style={{ marginTop: 14, textAlign: 'left' }}>
              {board.map((r, i) => (
                <div className='row' key={r.userId}>
                  <span>
                    #{i + 1} u/{r.userId.replace(/^t2_/, '')}
                  </span>
                  <span>{r.score} pts</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function App() {
  const [state, setState] = useState<State | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api<State>('/api/state').then(setState).catch((e) => setErr(String(e)))
  }, [])

  if (err) return <div className='card'>Something went wrong loading the game.</div>
  if (!state) return <div className='card'>Loading…</div>

  return (
    <>
      <div className='brand'>Screen Test</div>
      <h1>{state.mode === 'spotlight' ? state.theme || 'Weekly spotlight' : 'Daily film & TV trivia'}</h1>
      <div className='sub'>
        {state.mode === 'spotlight'
          ? 'A themed round for the week — every answer checked against real credits.'
          : 'Movies, shows, actors, directors — one new set every post day.'}
      </div>
      <Quiz state={state} />
      <div className='footer'>
        Data:{' '}
        <a
          href='https://www.themoviedb.org'
          onClick={(e) => {
            e.preventDefault()
            navigateTo('https://www.themoviedb.org')
          }}
        >
          TMDB
        </a>{' '}
        · Built by{' '}
        <a
          href='https://www.galaxymovies.app'
          onClick={(e) => {
            e.preventDefault()
            navigateTo('https://www.galaxymovies.app')
          }}
        >
          galaxymovies.app
        </a>
      </div>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
