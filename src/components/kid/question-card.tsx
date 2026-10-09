'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Check, ChevronUp, Lightbulb, Loader2, Pencil } from 'lucide-react'
import { FloatChip, IconTile } from './celebrate'
import { CollapsedRow } from './collapsed-row'
import { haptic, playChime, primeAudio } from './sound'

interface Reflection {
  day: string
  question: string
  answer: string | null
  xp: number
}

const KEY = ['child-reflection']
const MIN = 15

/** Grey's question of the day. Answering once a day pays points. */
export function QuestionCard({ onPoints, collapsible = true }: { onPoints?: () => void; collapsible?: boolean }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch('/api/child/reflection', { cache: 'no-store' })
      if (!res.ok) throw new Error('load failed')
      return (await res.json()) as Reflection
    },
  })

  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chip, setChip] = useState<string | null>(null)
  const [fresh, setFresh] = useState(false)
  const [open, setOpen] = useState(false)

  const save = useMutation({
    mutationFn: async (answer: string) => {
      const res = await fetch('/api/child/reflection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'That did not save. Try again.')
      return body as { answer: string; xp: number }
    },
    onMutate: () => setError(null),
    onSuccess: (r) => {
      qc.setQueryData<Reflection>(KEY, (d) => (d ? { ...d, answer: r.answer } : d))
      setEditing(false)
      setDraft('')
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
  const answered = !!data.answer && !editing
  const len = draft.trim().length

  if (collapsible && !open) {
    return (
      <CollapsedRow
        icon={<Lightbulb className="h-5 w-5" aria-hidden />}
        title="Question of the day"
        badge={`+${data.xp}`}
        done={!!data.answer}
        open={false}
        onToggle={() => setOpen(true)}
        controls="question-card"
      >
        {chip && <FloatChip text={chip} tone="ok" />}
      </CollapsedRow>
    )
  }

  return (
    <section id="question-card" aria-label="Question of the day" className="row relative p-4" style={answered ? { background: 'rgba(52,211,153,0.06)' } : undefined}>
      <div className="flex items-start gap-3">
        <IconTile tone={answered ? 'ok' : 'accent'} fresh={fresh}>
          {answered ? <Check className="h-5 w-5" aria-hidden /> : <Lightbulb className="h-5 w-5" aria-hidden />}
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
            Question of the day {!data.answer && <span style={{ color: 'var(--accent)' }}>· +{data.xp}</span>}
          </p>
          <h2 className="mt-0.5 text-[17px] font-semibold leading-snug">{data.question}</h2>

          {answered ? (
            <>
              <p className="mt-2 whitespace-pre-wrap text-[15px]" style={{ color: 'var(--ink-2)' }}>
                {data.answer}
              </p>
              <button type="button" className="btn btn-quiet mt-2 !px-3" onClick={() => {
                  setDraft(data.answer ?? '')
                  setEditing(true)
                }}>
                <Pencil className="h-4 w-4" aria-hidden />
                Edit
              </button>
            </>
          ) : (
            <form
              className="mt-3"
              onSubmit={(e) => {
                e.preventDefault()
                primeAudio()
                if (len < MIN) return setError('Write a little more. A full sentence or two.')
                save.mutate(draft)
              }}
            >
              <label htmlFor="reflection-answer" className="sr-only">
                Your answer
              </label>
              <textarea
                id="reflection-answer"
                className="field min-h-[96px] resize-y"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type your answer…"
                maxLength={1000}
              />
              {error && (
                <p className="mt-1.5 text-[14px]" role="alert" style={{ color: 'var(--miss)' }}>
                  {error}
                </p>
              )}
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
                  Mom and Dad read these.
                </span>
                <div className="flex gap-2">
                  {editing && (
                    <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)}>
                      Cancel
                    </button>
                  )}
                  <button type="submit" className="btn btn-primary" disabled={save.isPending || len === 0}>
                    {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    {editing ? 'Save' : 'Send'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
      {collapsible && (
        <button type="button" className="btn btn-quiet mt-3 !px-3" onClick={() => setOpen(false)} aria-expanded>
          <ChevronUp className="h-4 w-4" aria-hidden />
          Hide
        </button>
      )}
      {chip && <FloatChip text={chip} tone="ok" />}
    </section>
  )
}
