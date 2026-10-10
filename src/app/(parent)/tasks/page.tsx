'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { AlertTriangle, ChevronDown, Lock, Loader2, Pencil, Plus, Power, Trash2, X } from 'lucide-react'
import { ProofIcon, PROOF_SHORT } from '@/components/chores/status'
import { formatClock } from '@/lib/dates'
import { DEFAULT_QUESTIONS, PROOF_TYPES, defaultPhotoHint, proofTypeOf, type ProofType } from '@/lib/proof'

interface Kid {
  id: string
  name: string
  emoji: string
}

interface Chore {
  id: string
  name: string
  recurrence_type: string
  recurrence_days: number[] | null
  proof_type?: ProofType
  photo_required?: boolean
  cutoff_time?: string | null
  photo_hint?: string | null
  link_url?: string | null
  questions?: string[] | null
  required?: boolean
  xp_value: number
  active: boolean
  assigned_to: string[]
}

interface Reward {
  id: string
  name: string
}

interface Draft {
  name: string
  proof_type: ProofType
  recurrence_type: 'daily' | 'weekdays' | 'weekly' | 'once'
  recurrence_days: number[]
  cutoff_time: string
  photo_hint: string
  link_url: string
  questions: string[]
  required: boolean
  xp_value: number
  assigned_to: string[]
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const OFTEN: { value: Draft['recurrence_type']; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Some days' },
  { value: 'once', label: 'Once' },
]

const PROOF_HELP: Record<ProofType, string> = {
  photo: 'He takes a photo in the app. Counts as soon as he sends it; you can send it back.',
  imessage_video: 'He texts you a video, then taps “Sent it”. You approve after you watch it.',
  written: 'He answers your questions in the app. Counts as soon as he sends it; you read it and can send it back.',
  check: 'He taps done. It counts once you confirm.',
}

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'That did not save. Try again.')
  return json
}

function summary(c: Chore, kids: Kid[]) {
  const often =
    c.recurrence_type === 'daily'
      ? 'Every day'
      : c.recurrence_type === 'weekdays'
        ? 'Weekdays'
        : c.recurrence_type === 'weekly'
          ? (c.recurrence_days ?? []).map((d) => DAY_NAMES[d]).join(', ')
          : c.recurrence_type === 'once'
            ? 'Once'
            : c.recurrence_type
  const who = kids.length > 1 ? kids.filter((k) => c.assigned_to.includes(k.id)).map((k) => k.name).join(', ') : null
  return [often, PROOF_SHORT[proofTypeOf(c)], c.cutoff_time ? `by ${formatClock(c.cutoff_time)}` : null, who]
    .filter(Boolean)
    .join(' · ')
}

function toDraft(c: Chore | null, kids: Kid[]): Draft {
  if (!c) {
    return {
      name: '',
      proof_type: 'photo',
      recurrence_type: 'daily',
      recurrence_days: [],
      cutoff_time: '',
      photo_hint: '',
      link_url: '',
      questions: [...DEFAULT_QUESTIONS],
      required: true,
      xp_value: 100,
      assigned_to: kids.length === 1 ? [kids[0].id] : [],
    }
  }
  return {
    name: c.name,
    proof_type: proofTypeOf(c),
    recurrence_type: (['daily', 'weekdays', 'weekly', 'once'].includes(c.recurrence_type) ? c.recurrence_type : 'daily') as Draft['recurrence_type'],
    recurrence_days: c.recurrence_days ?? [],
    cutoff_time: c.cutoff_time ? c.cutoff_time.slice(0, 5) : '',
    photo_hint: c.photo_hint ?? '',
    link_url: c.link_url ?? '',
    questions: c.questions?.length ? c.questions : [...DEFAULT_QUESTIONS],
    required: c.required !== false,
    xp_value: c.xp_value,
    assigned_to: c.assigned_to,
  }
}

function ChoreForm({
  initial,
  kids,
  saving,
  onSave,
  onCancel,
  submitLabel,
}: {
  initial: Draft
  kids: Kid[]
  saving: boolean
  onSave: (d: Draft) => void
  onCancel: () => void
  submitLabel: string
}) {
  const [d, setD] = useState<Draft>(initial)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }))
  const id = initial.name ? `edit-${initial.name}` : 'new'

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(d)
      }}
    >
      <div>
        <label htmlFor={`${id}-name`} className="mb-1.5 block text-[14px] font-semibold">
          Chore
        </label>
        <input
          id={`${id}-name`}
          className="field"
          value={d.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Feed the chickens"
          maxLength={80}
          autoFocus={!initial.name}
          required
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[14px] font-semibold">How he proves it</legend>
        <div className="seg" role="group">
          {PROOF_TYPES.map((p) => (
            <button key={p} type="button" aria-pressed={d.proof_type === p} onClick={() => set('proof_type', p)}>
              <ProofIcon type={p} className="h-4 w-4" />
              <span>{p === 'photo' ? 'Photo' : p === 'written' ? 'Written' : p === 'imessage_video' ? 'Video' : 'You check'}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-2)' }}>
          {PROOF_HELP[d.proof_type]}
        </p>
        {d.proof_type === 'written' && (
          <div className="mt-3 space-y-2">
            <p className="text-[14px] font-semibold">Questions he answers</p>
            {d.questions.map((q, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="field flex-1"
                  value={q}
                  aria-label={`Question ${i + 1}`}
                  onChange={(e) => set('questions', d.questions.map((x, j) => (j === i ? e.target.value : x)))}
                  maxLength={120}
                />
                {d.questions.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-quiet !px-3"
                    aria-label={`Remove question ${i + 1}`}
                    onClick={() => set('questions', d.questions.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {d.questions.length < 3 && (
              <button type="button" className="text-[14px] underline underline-offset-2" style={{ color: 'var(--accent)' }} onClick={() => set('questions', [...d.questions, ''])}>
                Add a question
              </button>
            )}
          </div>
        )}
        {d.proof_type === 'photo' && (
          <div className="mt-3">
            <label htmlFor={`${id}-hint`} className="mb-1.5 block text-[14px] font-semibold">
              What the photo should show
            </label>
            <input
              id={`${id}-hint`}
              className="field"
              value={d.photo_hint}
              onChange={(e) => set('photo_hint', e.target.value)}
              placeholder={defaultPhotoHint(d.name || 'the chore')}
              maxLength={120}
            />
            <p className="mt-1.5 text-[13px]" style={{ color: 'var(--ink-2)' }}>
              Grey sees this when he opens the chore. Leave blank to use the suggestion.
            </p>
          </div>
        )}
      </fieldset>

      <div>
        <label htmlFor={`${id}-link`} className="mb-1.5 block text-[14px] font-semibold">
          Link <span className="font-normal" style={{ color: 'var(--ink-3)' }}>(optional)</span>
        </label>
        <input
          id={`${id}-link`}
          className="field"
          type="url"
          inputMode="url"
          value={d.link_url}
          onChange={(e) => set('link_url', e.target.value)}
          placeholder="https://… an app or page he opens for this chore"
          maxLength={300}
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[14px] font-semibold">How often</legend>
        <div className="seg" role="group">
          {OFTEN.map((o) => (
            <button key={o.value} type="button" aria-pressed={d.recurrence_type === o.value} onClick={() => set('recurrence_type', o.value)}>
              {o.label}
            </button>
          ))}
        </div>
        {d.recurrence_type === 'weekly' && (
          <div className="mt-2 flex gap-1.5" role="group" aria-label="Days">
            {DAYS.map((label, i) => {
              const on = d.recurrence_days.includes(i)
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  aria-label={DAY_NAMES[i]}
                  onClick={() => set('recurrence_days', on ? d.recurrence_days.filter((x) => x !== i) : [...d.recurrence_days, i])}
                  className="h-11 min-w-11 flex-1 rounded-[10px] border text-[15px] font-semibold transition-colors duration-150"
                  style={{
                    borderColor: on ? 'var(--accent)' : 'var(--line)',
                    background: on ? 'rgba(45,212,191,0.16)' : 'var(--surface-2)',
                    color: on ? 'var(--accent)' : 'var(--ink-2)',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-due`} className="mb-1.5 block text-[14px] font-semibold">
            Due by <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>optional</span>
          </label>
          <div className="flex gap-2">
            <input
              id={`${id}-due`}
              type="time"
              className="field"
              value={d.cutoff_time}
              onChange={(e) => set('cutoff_time', e.target.value)}
            />
            {d.cutoff_time && (
              <button type="button" className="btn btn-quiet !px-3" onClick={() => set('cutoff_time', '')} aria-label="Clear due time">
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-pts`} className="mb-1.5 block text-[14px] font-semibold">
            Points
          </label>
          <input
            id={`${id}-pts`}
            type="number"
            inputMode="numeric"
            min={0}
            max={1000}
            className="field"
            value={d.xp_value}
            onChange={(e) => set('xp_value', Number(e.target.value))}
          />
        </div>
      </div>

      {kids.length > 1 && (
        <fieldset>
          <legend className="mb-1.5 text-[14px] font-semibold">Who does it</legend>
          <div className="flex flex-wrap gap-2">
            {kids.map((k) => {
              const on = d.assigned_to.includes(k.id)
              return (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set('assigned_to', on ? d.assigned_to.filter((x) => x !== k.id) : [...d.assigned_to, k.id])}
                  className="btn border text-[15px]"
                  style={{
                    borderColor: on ? 'var(--accent)' : 'var(--line)',
                    background: on ? 'rgba(45,212,191,0.16)' : 'transparent',
                    color: on ? 'var(--accent)' : 'var(--ink-2)',
                  }}
                >
                  {k.emoji} {k.name}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      <label className="flex items-start gap-3 text-[15px]">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5"
          checked={d.required}
          onChange={(e) => set('required', e.target.checked)}
        />
        <span>
          <span className="font-semibold">Must be done before rewards</span>
          <span className="block text-[14px]" style={{ color: 'var(--ink-2)' }}>
            Turn off for a bonus chore that earns points but never blocks games or TV.
          </span>
        </span>
      </label>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary flex-1" disabled={saving || !d.name.trim()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {submitLabel}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function ChoresPage() {
  const qc = useQueryClient()
  // "Add a chore" on the Today screen links here with ?new=1.
  const [adding, setAdding] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('new')
  )
  const [editing, setEditing] = useState<string | null>(null)
  const [showOff, setShowOff] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rewardName, setRewardName] = useState('')

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['chores'],
    queryFn: () => call('/api/parent/chores', 'GET') as Promise<{ chores: Chore[]; children: Kid[] }>,
  })
  const { data: rewardData } = useQuery({
    queryKey: ['rewards'],
    queryFn: () => call('/api/parent/rewards', 'GET') as Promise<{ rewards: Reward[] }>,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['chores'] })
    qc.invalidateQueries({ queryKey: ['parent-overview'] })
  }
  const onErr = (e: unknown) => setError(e instanceof Error ? e.message : 'That did not save.')

  const create = useMutation({
    mutationFn: (d: Draft) => call('/api/parent/chores', 'POST', { ...d, cutoff_time: d.cutoff_time || null }),
    onMutate: () => setError(null),
    onSuccess: () => setAdding(false),
    onError: onErr,
    onSettled: refresh,
  })
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => call(`/api/parent/chores/${id}`, 'PATCH', body),
    onMutate: () => setError(null),
    onSuccess: () => setEditing(null),
    onError: onErr,
    onSettled: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => call(`/api/parent/chores/${id}`, 'DELETE'),
    onError: onErr,
    onSettled: refresh,
  })
  const addReward = useMutation({
    mutationFn: (name: string) => call('/api/parent/rewards', 'POST', { name }),
    onSuccess: () => setRewardName(''),
    onError: onErr,
    onSettled: () => qc.invalidateQueries({ queryKey: ['rewards'] }),
  })
  const delReward = useMutation({
    mutationFn: (id: string) => call(`/api/parent/rewards/${id}`, 'DELETE'),
    onError: onErr,
    onSettled: () => qc.invalidateQueries({ queryKey: ['rewards'] }),
  })

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading chores">
        <div className="skeleton h-10 w-40" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[68px]" />
        ))}
      </div>
    )
  }
  if (loadError || !data) {
    return (
      <div className="panel p-5" role="alert">
        <p className="font-semibold">Chores did not load.</p>
        <p className="mt-1 text-[15px]" style={{ color: 'var(--ink-2)' }}>
          {loadError instanceof Error ? loadError.message : 'Reload the page.'}
        </p>
      </div>
    )
  }

  const kids = data.children
  const on = data.chores.filter((c) => c.active)
  const off = data.chores.filter((c) => !c.active)

  const save = (id: string, d: Draft) =>
    update.mutate({ id, body: { ...d, cutoff_time: d.cutoff_time || null } })

  const row = (c: Chore) =>
    editing === c.id ? (
      <li key={c.id} className="panel p-4">
        <ChoreForm
          initial={toDraft(c, kids)}
          kids={kids}
          saving={update.isPending}
          onSave={(d) => save(c.id, d)}
          onCancel={() => setEditing(null)}
          submitLabel="Save changes"
        />
      </li>
    ) : (
      <li key={c.id} className="row flex items-center gap-3 p-3" style={c.active ? undefined : { background: 'transparent', borderStyle: 'dashed' }}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]" style={{ background: 'rgba(148,163,184,0.1)', color: 'var(--ink-2)' }}>
          <ProofIcon type={proofTypeOf(c)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-snug">{c.name}</p>
          <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
            {summary(c, kids)}
            {c.required === false ? ' · bonus' : ''}
          </p>
        </div>
        {c.active ? (
          <>
            <button type="button" className="btn btn-quiet !px-3" onClick={() => { setEditing(c.id); setAdding(false) }} aria-label={`Edit ${c.name}`}>
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              className="btn btn-quiet !px-3"
              onClick={() => update.mutate({ id: c.id, body: { active: false } })}
              aria-label={`Turn off ${c.name}`}
              title="Turn off"
            >
              <Power className="h-4 w-4" aria-hidden />
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-quiet" onClick={() => update.mutate({ id: c.id, body: { active: true } })} aria-label={`Turn on ${c.name}`}>
              Turn on
            </button>
            <button
              type="button"
              className="btn btn-danger !px-3"
              onClick={() => {
                if (window.confirm(`Delete “${c.name}”? Chores he has already done stay in his history.`)) remove.mutate(c.id)
              }}
              aria-label={`Delete ${c.name}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}
      </li>
    )

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] leading-tight">Chores</h1>
          <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
            New chores go on his list right away.
          </p>
        </div>
        {!adding && (
          <button type="button" className="btn btn-primary" onClick={() => { setAdding(true); setEditing(null) }}>
            <Plus className="h-4 w-4" aria-hidden />
            New chore
          </button>
        )}
      </header>

      {error && (
        <div className="row flex items-start gap-2 p-3 text-[15px]" role="alert" style={{ borderColor: 'rgba(251,113,133,0.4)' }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--miss)' }} aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {adding && (
        <section className="panel p-4" aria-label="New chore">
          <h2 className="mb-4 text-[19px]">New chore</h2>
          <ChoreForm
            initial={toDraft(null, kids)}
            kids={kids}
            saving={create.isPending}
            onSave={(d) => create.mutate(d)}
            onCancel={() => setAdding(false)}
            submitLabel="Add chore"
          />
        </section>
      )}

      <section aria-label="Active chores">
        <h2 className="mb-3 text-[19px]">On his list ({on.length})</h2>
        {on.length === 0 ? (
          <p className="panel p-4 text-[15px]" style={{ color: 'var(--ink-2)' }}>
            No chores yet. Add the first one above.
          </p>
        ) : (
          <ul className="space-y-2">{on.map(row)}</ul>
        )}
      </section>

      {off.length > 0 && (
        <section aria-label="Turned off chores">
          <button
            type="button"
            className="flex min-h-11 items-center gap-2 text-[15px] font-semibold"
            style={{ color: 'var(--ink-2)' }}
            aria-expanded={showOff}
            onClick={() => setShowOff(!showOff)}
          >
            <ChevronDown className="h-4 w-4 transition-transform duration-150" style={{ transform: showOff ? 'rotate(180deg)' : undefined }} aria-hidden />
            Turned off ({off.length})
          </button>
          {showOff && <ul className="mt-2 space-y-2">{off.map(row)}</ul>}
        </section>
      )}

      <section aria-labelledby="rewards-h">
        <h2 id="rewards-h" className="mb-1 text-[19px]">Rewards</h2>
        <p className="mb-3 text-[15px]" style={{ color: 'var(--ink-2)' }}>
          Locked each day until every must-do chore is shown. He asks, you say yes.
        </p>
        <ul className="space-y-2">
          {(rewardData?.rewards ?? []).map((r) => (
            <li key={r.id} className="row flex items-center gap-3 p-3">
              <Lock className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden />
              <span className="flex-1 text-[16px]">{r.name}</span>
              <button
                type="button"
                className="btn btn-quiet !px-3"
                onClick={() => {
                  if (window.confirm(`Remove “${r.name}”?`)) delReward.mutate(r.id)
                }}
                aria-label={`Remove ${r.name}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (rewardName.trim()) addReward.mutate(rewardName.trim())
          }}
        >
          <label htmlFor="new-reward" className="sr-only">
            New reward
          </label>
          <input id="new-reward" className="field" placeholder="30 minutes of games" value={rewardName} onChange={(e) => setRewardName(e.target.value)} maxLength={60} />
          <button type="submit" className="btn btn-quiet" disabled={!rewardName.trim() || addReward.isPending}>
            Add
          </button>
        </form>
      </section>
    </div>
  )
}
