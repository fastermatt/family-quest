'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { Camera, Check, CheckCheck, Clock, Dumbbell, Flame, MessageSquare, NotebookPen, RotateCcw, Video, X } from 'lucide-react'
import { formatClock } from '@/lib/dates'

interface DaySummary {
  date: string
  total: number
  done: number
  missed: number
  excused: number
  onTime: number
  pct: number
}

interface Period {
  pct: number
  onTimePct: number
  perfectDays: number
  daysTracked: number
}

interface ChildHistory {
  id: string
  name: string
  emoji: string
  days: DaySummary[]
  summary: { week: Period; month: Period }
  currentStreak: number
  bestStreak: number
}

interface History {
  today: string
  days: number
  children: ChildHistory[]
}

interface Chore {
  id: string
  name: string
  proofType: string
  status: string
  required: boolean
  submittedAt: string | null
  cutoff: string | null
  onTime: boolean | null
  missed: boolean
  hasPhoto: boolean
  answers: { q: string; a: string }[] | null
  reviewNote: string | null
}

interface DayDetail {
  date: string
  isToday: boolean
  chores: Chore[]
  reflection: { question: string; answer: string } | null
  training: { restDay: boolean; skills: string[]; workedOn: string | null; winPrompt: string | null; win: string | null } | null
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const parseDay = (iso: string) => new Date(`${iso}T12:00:00Z`)
const shortDate = (iso: string) => parseDay(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const longDate = (iso: string) => parseDay(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
const clockOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' })

async function getJson<T>(url: string, fallback: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || fallback)
  return json as T
}

// Heatmap colors. Every colored square carries dark ink text and its day number,
// and the selected day spells out the numbers, so color is never the only signal.
const AMBER = '#e0a82e'
const FAINT = 'var(--surface-2)'

function cellStyle(d: DaySummary): React.CSSProperties {
  if (d.total === 0) return { background: FAINT, color: 'var(--ink-3)' }
  if (d.pct === 100) return { background: 'var(--ok)', color: 'var(--accent-ink)' }
  if (d.pct === 0) return { background: 'var(--miss)', color: 'var(--accent-ink)' }
  return { background: AMBER, color: 'var(--accent-ink)' }
}

function ariaFor(d: DaySummary, today: string) {
  const when = shortDate(d.date) + (d.date === today ? ' (today)' : '')
  if (d.total === 0) return `${when}: no chores`
  return `${when}: ${d.done} of ${d.total} done`
}

export default function ProgressPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['parent-history', 30],
    queryFn: () => getJson<History>('/api/parent/history?days=30', 'Could not load progress.'),
    refetchOnWindowFocus: true,
  })

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading progress">
        <div className="skeleton h-9 w-56" />
        <div className="grid grid-cols-3 gap-2">
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
        </div>
        <div className="skeleton h-72" />
        <div className="skeleton h-48" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="panel p-5" role="alert">
        <p className="font-semibold">Progress did not load.</p>
        <p className="mt-1 text-[15px]" style={{ color: 'var(--ink-2)' }}>
          {error instanceof Error ? error.message : 'Check your connection and try again.'}
        </p>
        <button type="button" className="btn btn-quiet mt-3" onClick={() => refetch()} disabled={isFetching}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          {isFetching ? 'Trying…' : 'Retry'}
        </button>
      </div>
    )
  }

  if (data.children.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-[28px] leading-tight">Progress</h1>
        <p className="panel p-4 text-[15px]" style={{ color: 'var(--ink-2)' }}>
          No kids in the family yet. <Link href="/people" className="underline underline-offset-2">Add one</Link> to start tracking.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {data.children.map((c) => (
        <ChildProgress key={c.id} child={c} today={data.today} />
      ))}
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="row flex flex-col p-3">
      <p className="text-[13px] font-semibold" style={{ color: 'var(--ink-2)' }}>
        {label}
      </p>
      <p className="mt-1 text-[28px] font-bold leading-none" style={{ color: 'var(--ink)' }}>
        {value}
      </p>
      <p className="mt-1.5 text-[12px] leading-snug" style={{ color: 'var(--ink-3)' }}>
        {sub}
      </p>
    </div>
  )
}

function ChildProgress({ child, today }: { child: ChildHistory; today: string }) {
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked ?? today
  const { week, month } = child.summary
  const tracked = child.days.some((d) => d.total > 0)

  // Monday-first calendar: pad the first week so weekdays line up, and the last week to a full row.
  const lead = (parseDay(child.days[0].date).getUTCDay() + 6) % 7
  const cells: (DaySummary | null)[] = [...Array<null>(lead).fill(null), ...child.days]
  while (cells.length % 7) cells.push(null)

  const sel = child.days.find((d) => d.date === selected)

  return (
    <section aria-labelledby={`progress-${child.id}`} className="space-y-4">
      <h1 id={`progress-${child.id}`} className="text-[24px] leading-tight">
        {child.emoji} {child.name}&apos;s progress
      </h1>

      <div className="grid grid-cols-3 gap-2">
        <Tile
          label="This week"
          value={week.daysTracked ? `${week.pct}%` : '—'}
          sub={week.daysTracked ? `chores done · ${week.perfectDays} perfect day${week.perfectDays === 1 ? '' : 's'}` : 'No finished days yet'}
        />
        <Tile
          label="On time"
          value={week.daysTracked && week.pct > 0 ? `${week.onTimePct}%` : '—'}
          sub={week.daysTracked && week.pct > 0 ? 'of finished chores, by the cutoff' : 'Nothing finished yet'}
        />
        <div className="row flex flex-col p-3">
          <p className="text-[13px] font-semibold" style={{ color: 'var(--ink-2)' }}>
            Streak
          </p>
          <p className="mt-1 flex items-center gap-1 text-[28px] font-bold leading-none" style={{ color: child.currentStreak > 0 ? 'var(--redo)' : 'var(--ink)' }}>
            {child.currentStreak > 0 && <Flame className="h-5 w-5" aria-hidden />}
            {child.currentStreak}
            <span className="text-[13px] font-semibold" style={{ color: 'var(--ink-2)' }}>
              {child.currentStreak === 1 ? 'day' : 'days'}
            </span>
          </p>
          <p className="mt-1.5 text-[12px] leading-snug" style={{ color: 'var(--ink-3)' }}>
            Best: {child.bestStreak}
          </p>
        </div>
      </div>

      <div className="panel p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="text-[17px]">Last 30 days</h2>
          {month.daysTracked > 0 && (
            <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
              {month.pct}% done · {month.perfectDays} perfect day{month.perfectDays === 1 ? '' : 's'}
            </p>
          )}
        </div>

        {!tracked ? (
          <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
            No chores recorded in the last 30 days yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1.5" aria-hidden>
              {WEEKDAYS.map((w, i) => (
                <span key={i} className="text-center text-[12px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                  {w}
                </span>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-7 gap-1.5" role="group" aria-label={`${child.name}'s last 30 days`}>
              {cells.map((d, i) => {
                if (!d) return <span key={`pad-${i}`} aria-hidden />
                const isSel = d.date === selected
                const isToday = d.date === today
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setPicked(d.date)}
                    aria-label={ariaFor(d, today)}
                    aria-pressed={isSel}
                    className="relative flex aspect-square min-h-10 items-center justify-center rounded-[8px] text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      ...cellStyle(d),
                      outlineColor: 'var(--ink)',
                      boxShadow: isSel ? '0 0 0 2px var(--surface-1), 0 0 0 4px var(--ink)' : isToday ? 'inset 0 0 0 2px var(--ink)' : undefined,
                    }}
                  >
                    {parseDay(d.date).getUTCDate()}
                  </button>
                )
              })}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]" style={{ color: 'var(--ink-2)' }} aria-label="Legend">
              <LegendItem bg="var(--ok)" label="All done" />
              <LegendItem bg={AMBER} label="Some done" />
              <LegendItem bg="var(--miss)" label="None done" />
              <LegendItem bg={FAINT} label="No chores" border />
              <li className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-[3px]" style={{ boxShadow: 'inset 0 0 0 2px var(--ink)' }} aria-hidden />
                Today
              </li>
            </ul>
          </>
        )}
      </div>

      <DayPanel child={child} date={selected} today={today} summary={sel} />
    </section>
  )
}

function LegendItem({ bg, label, border }: { bg: string; label: string; border?: boolean }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: bg, border: border ? '1px solid var(--line-strong)' : undefined }} aria-hidden />
      {label}
    </li>
  )
}

function proofIcon(type: string) {
  const cls = 'h-4 w-4'
  if (type === 'photo') return <Camera className={cls} aria-hidden />
  if (type === 'imessage_video') return <Video className={cls} aria-hidden />
  if (type === 'written') return <NotebookPen className={cls} aria-hidden />
  return <CheckCheck className={cls} aria-hidden />
}

function pillFor(c: Chore, isToday: boolean) {
  if (c.status === 'approved') return { label: 'Done', color: 'var(--ok)', Icon: Check }
  if (c.status === 'excused') return { label: 'Excused', color: 'var(--ok)', Icon: Check }
  if (c.status === 'submitted') return { label: 'Waiting', color: 'var(--wait)', Icon: Clock }
  if (c.missed) return { label: 'Missed', color: 'var(--miss)', Icon: X }
  if (c.status === 'rejected') return { label: 'Sent back', color: 'var(--redo)', Icon: RotateCcw }
  return { label: isToday ? 'Not done yet' : 'Missed', color: 'var(--ink-3)', Icon: null }
}

function timingNote(c: Chore): string | null {
  if (c.status === 'excused') return 'Excused'
  const sent = c.submittedAt ? clockOf(c.submittedAt) : null
  if (c.onTime === true) return sent ? `On time, sent ${sent}` : 'On time'
  if (c.onTime === false) return `Late, sent ${sent ?? '?'}${c.cutoff ? ` (due by ${formatClock(c.cutoff)})` : ''}`
  if (c.status === 'rejected' && c.missed) return 'Sent back and not redone'
  if (c.cutoff && c.status === 'pending') return `Due by ${formatClock(c.cutoff)}`
  return null
}

function DayPanel({ child, date, today, summary }: { child: ChildHistory; date: string; today: string; summary?: DaySummary }) {
  const [zoom, setZoom] = useState<string | null>(null)
  const isToday = date === today
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['history-day', child.id, date],
    queryFn: () => getJson<DayDetail>(`/api/parent/history/day?child=${child.id}&date=${date}`, 'Could not load that day.'),
    staleTime: isToday ? 15_000 : 5 * 60_000,
  })

  const required = data?.chores.filter((c) => c.required) ?? []
  const extras = data?.chores.filter((c) => !c.required) ?? []

  return (
    <div className="panel p-4" aria-live="polite">
      <div className="mb-3">
        <h2 className="text-[17px]">{isToday ? `Today, ${shortDate(date)}` : longDate(date)}</h2>
        {summary && summary.total > 0 && (
          <p className="mt-0.5 text-[14px]" style={{ color: 'var(--ink-2)' }}>
            {summary.done} of {summary.total} done
            {summary.done > 0 && ` · ${summary.onTime} on time`}
            {summary.missed > 0 && ` · ${summary.missed} missed`}
            {summary.excused > 0 && ` · ${summary.excused} excused`}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading day">
          <div className="skeleton h-12" />
          <div className="skeleton h-12" />
          <div className="skeleton h-12" />
        </div>
      ) : error || !data ? (
        <div role="alert">
          <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
            {error instanceof Error ? error.message : 'That day did not load.'}
          </p>
          <button type="button" className="btn btn-quiet mt-2" onClick={() => refetch()} disabled={isFetching}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            {isFetching ? 'Trying…' : 'Retry'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {data.chores.length === 0 ? (
            <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
              No chores on {isToday ? 'the list today' : 'this day'}.
            </p>
          ) : (
            <>
              <ChoreList chores={required} isToday={isToday} zoom={zoom} setZoom={setZoom} />
              {extras.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-[13px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                    Extras (not counted in the percentages)
                  </h3>
                  <ChoreList chores={extras} isToday={isToday} zoom={zoom} setZoom={setZoom} />
                </div>
              )}
            </>
          )}

          {data.training && (
            <div className="row p-3">
              <h3 className="flex items-center gap-1.5 text-[14px] font-semibold">
                <Dumbbell className="h-4 w-4" style={{ color: 'var(--accent)' }} aria-hidden />
                Calisthenics
              </h3>
              {data.training.restDay ? (
                <p className="mt-1 text-[15px]" style={{ color: 'var(--ink-2)' }}>
                  Rest day.
                </p>
              ) : (
                <div className="mt-1 space-y-1 text-[15px]" style={{ color: 'var(--ink-2)' }}>
                  {data.training.skills.length > 0 && <p>{data.training.skills.join(', ')}</p>}
                  {data.training.workedOn && <p>Worked on: {data.training.workedOn}</p>}
                  {data.training.win && (
                    <p>
                      <span style={{ color: 'var(--ink-3)' }}>{data.training.winPrompt ?? 'Win'}</span> “{data.training.win}”
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {data.reflection && (
            <div className="row p-3">
              <h3 className="flex items-center gap-1.5 text-[14px] font-semibold">
                <MessageSquare className="h-4 w-4" style={{ color: 'var(--accent)' }} aria-hidden />
                {data.reflection.question}
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-[15px]" style={{ color: 'var(--ink-2)' }}>
                “{data.reflection.answer}”
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ChoreList({ chores, isToday, zoom, setZoom }: { chores: Chore[]; isToday: boolean; zoom: string | null; setZoom: (id: string | null) => void }) {
  if (chores.length === 0) return null
  return (
    <ul className="divide-y rounded-[12px] border" style={{ borderColor: 'var(--line)' }}>
      {chores.map((c) => {
        const pill = pillFor(c, isToday)
        const note = timingNote(c)
        const showAnswers = c.answers?.length && (c.status === 'approved' || c.status === 'submitted')
        return (
          <li key={c.id} className="px-3 py-3" style={{ borderColor: 'var(--line)' }}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5" style={{ color: 'var(--ink-3)' }}>
                {proofIcon(c.proofType)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-snug">{c.name}</p>
                {note && (
                  <p className="mt-0.5 text-[13px]" style={{ color: c.onTime === false ? 'var(--redo)' : 'var(--ink-3)' }}>
                    {note}
                  </p>
                )}
                {c.reviewNote && (
                  <p className="mt-0.5 text-[13px]" style={{ color: 'var(--ink-3)' }}>
                    Note: {c.reviewNote}
                  </p>
                )}
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold" style={{ color: pill.color }}>
                {pill.Icon && <pill.Icon className="h-3.5 w-3.5" aria-hidden />}
                {pill.label}
              </span>
            </div>

            {c.hasPhoto && (
              <div className="mt-2 pl-7">
                <button
                  type="button"
                  onClick={() => setZoom(zoom === c.id ? null : c.id)}
                  aria-expanded={zoom === c.id}
                  aria-label={zoom === c.id ? `Shrink photo for ${c.name}` : `Enlarge photo for ${c.name}`}
                  className="block overflow-hidden rounded-[10px] focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ outlineColor: 'var(--accent)' }}
                >
                  {zoom === c.id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/proof/${c.id}`} alt={`Proof for ${c.name}, large`} className="w-full" style={{ background: 'var(--surface-2)' }} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/proof/${c.id}`}
                      alt={`Proof for ${c.name}`}
                      width={72}
                      height={72}
                      loading="lazy"
                      className="h-[72px] w-[72px] object-cover"
                      style={{ background: 'var(--surface-2)' }}
                    />
                  )}
                </button>
              </div>
            )}

            {showAnswers ? (
              <dl className="mt-2 space-y-1.5 pl-7">
                {c.answers!.map((x, i) => (
                  <div key={i}>
                    <dt className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
                      {x.q}
                    </dt>
                    <dd className="whitespace-pre-wrap text-[14px]" style={{ color: 'var(--ink-2)' }}>
                      “{x.a}”
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
