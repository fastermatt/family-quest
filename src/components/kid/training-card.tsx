'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Check, Dumbbell, Loader2, Pencil, Trophy } from 'lucide-react'
import { FloatChip, IconTile } from './celebrate'
import { haptic, playChime, primeAudio } from './sound'
import { SKILLS } from '@/lib/training'

interface Log {
  day: string
  rest_day: boolean
  skills: string[]
  worked_on: string | null
  win: string | null
}

interface Training {
  day: string
  xp: number
  winPrompt: string
  today: Log | null
  trainedThisWeek: number
  recentWins: { day: string; win: string }[]
}

const KEY = ['child-training']

/** Grey's daily calisthenics log. */
export function TrainingCard({ onPoints }: { onPoints?: () => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch('/api/child/training', { cache: 'no-store' })
      if (!res.ok) throw new Error('load failed')
      return (await res.json()) as Training
    },
  })

  const [editing, setEditing] = useState(false)
  const [skills, setSkills] = useState<string[]>([])
  const [workedOn, setWorkedOn] = useState('')
  const [win, setWin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [chip, setChip] = useState<string | null>(null)
  const [fresh, setFresh] = useState(false)

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/child/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error || 'That did not save. Try again.')
      return out as { xp: number }
    },
    onMutate: () => setError(null),
    onSuccess: (r) => {
      setEditing(false)
      qc.invalidateQueries({ queryKey: KEY })
      if (r.xp > 0) {
        setFresh(true)
        setChip(`+${r.xp}`)
        window.setTimeout(() => setChip(null), 1600)
        haptic()
        playChime('done')
        onPoints?.()
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'That did not save. Try again.'),
  })

  if (!data) return null
  const logged = !!data.today && !editing
  const t = data.today

  const startEdit = () => {
    setSkills(t?.skills ?? [])
    setWorkedOn(t?.worked_on ?? '')
    setWin(t?.win ?? '')
    setEditing(true)
  }
  const toggle = (s: string) => setSkills((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))

  return (
    <section aria-label="Calisthenics log" className="row relative p-4" style={logged ? { background: 'rgba(52,211,153,0.06)' } : undefined}>
      <div className="flex items-start gap-3">
        <IconTile tone={logged ? 'ok' : 'accent'} fresh={fresh}>
          {logged ? <Check className="h-5 w-5" aria-hidden /> : <Dumbbell className="h-5 w-5" aria-hidden />}
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
            Calisthenics log {!t && <span style={{ color: 'var(--accent)' }}>· +{data.xp}</span>}
          </p>
          <h2 className="mt-0.5 text-[17px] font-semibold leading-snug">
            {logged ? (t!.rest_day ? 'Rest day logged' : 'Training logged') : 'What did you train today?'}
          </h2>
          <p className="mt-0.5 text-[13px]" style={{ color: 'var(--ink-3)' }}>
            {data.trainedThisWeek === 0
              ? 'No training days yet this week.'
              : `${data.trainedThisWeek} training day${data.trainedThisWeek === 1 ? '' : 's'} this week`}
          </p>

          {logged ? (
            <div className="mt-2 space-y-1.5 text-[15px]" style={{ color: 'var(--ink-2)' }}>
              {t!.skills.length > 0 && <p className="font-semibold" style={{ color: 'var(--ink)' }}>{t!.skills.join(' · ')}</p>}
              {t!.worked_on && <p>{t!.worked_on}</p>}
              {t!.win && (
                <p className="flex items-start gap-1.5">
                  <Trophy className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--redo)' }} aria-hidden />
                  <span>{t!.win}</span>
                </p>
              )}
              <button type="button" className="btn btn-quiet mt-1 !px-3" onClick={startEdit}>
                <Pencil className="h-4 w-4" aria-hidden />
                Edit
              </button>
            </div>
          ) : (
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                primeAudio()
                save.mutate({ skills, worked_on: workedOn, win })
              }}
            >
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Skills you trained">
                {SKILLS.map((s) => {
                  const on = skills.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(s)}
                      className="min-h-9 rounded-full border px-3 text-[14px] font-semibold transition-colors duration-150"
                      style={{
                        borderColor: on ? 'var(--accent)' : 'var(--line)',
                        background: on ? 'rgba(45,212,191,0.14)' : 'transparent',
                        color: on ? 'var(--accent)' : 'var(--ink-2)',
                      }}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>

              <div>
                <label htmlFor="train-worked" className="mb-1 block text-[14px] font-semibold">
                  What did you work on?
                </label>
                <textarea
                  id="train-worked"
                  className="field min-h-[72px] resize-y"
                  value={workedOn}
                  onChange={(e) => setWorkedOn(e.target.value)}
                  placeholder="5 sets of tuck planche, 10 sec each"
                  maxLength={500}
                />
              </div>

              <div>
                <label htmlFor="train-win" className="mb-1 block text-[14px] font-semibold">
                  {data.winPrompt}
                </label>
                <textarea
                  id="train-win"
                  className="field min-h-[72px] resize-y"
                  value={win}
                  onChange={(e) => setWin(e.target.value)}
                  placeholder="Held a wall handstand for 45 seconds"
                  maxLength={500}
                />
              </div>

              {error && (
                <p className="text-[14px]" role="alert" style={{ color: 'var(--miss)' }}>
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-[14px] underline underline-offset-2"
                  style={{ color: 'var(--ink-3)' }}
                  onClick={() => {
                    primeAudio()
                    save.mutate({ rest_day: true })
                  }}
                  disabled={save.isPending}
                >
                  Rest day today
                </button>
                <div className="flex gap-2">
                  {editing && (
                    <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)}>
                      Cancel
                    </button>
                  )}
                  <button type="submit" className="btn btn-primary" disabled={save.isPending}>
                    {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    {editing ? 'Save' : 'Log it'}
                  </button>
                </div>
              </div>

              {data.recentWins[0] && (
                <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
                  Last win: {data.recentWins[0].win}
                </p>
              )}
            </form>
          )}
        </div>
      </div>
      {chip && <FloatChip text={chip} tone="ok" />}
    </section>
  )
}
