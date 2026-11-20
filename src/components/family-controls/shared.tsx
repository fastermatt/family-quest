import type { TimeWindow } from '@/lib/family-controls/types'

export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
export const duration = (seconds: number) => `${Math.max(0, Math.floor(seconds / 60))} min`
export const clock = (value: string) => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
export const centsFrom = (value: string) => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return NaN
  const [dollars, cents = ''] = value.split('.')
  const result = Number(dollars) * 100 + Number(cents.padEnd(2, '0'))
  return Number.isSafeInteger(result) ? result : NaN
}
export async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Could not save. Please try again.')
  return json
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export function WindowEditor({ title, help, value, onChange, disabled }: { title: string; help: string; value: TimeWindow[]; onChange: (v: TimeWindow[]) => void; disabled: boolean }) {
  const change = (i: number, next: TimeWindow) => onChange(value.map((w, n) => n === i ? next : w))
  return <fieldset className="space-y-3 rounded-xl border p-3" disabled={disabled}>
    <legend className="px-1 font-semibold">{title}</legend>
    <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{help}</p>
    {value.map((w, i) => <div className="row space-y-3 p-3" key={i}>
      <div className="flex flex-wrap gap-2">{DAYS.map((day, n) => <label key={day} className="flex items-center gap-1 rounded-lg border px-2 py-2 text-[13px]"><input type="checkbox" checked={w.days.includes(n)} onChange={e => change(i, { ...w, days: e.target.checked ? [...w.days, n].sort() : w.days.filter(d => d !== n) })} />{day}</label>)}</div>
      <div className="flex flex-wrap items-end gap-3"><label className="min-w-[110px] flex-1 text-[13px]">Start<input className="field mt-1" type="time" value={w.start} onChange={e => change(i, { ...w, start: e.target.value })} /></label><label className="min-w-[110px] flex-1 text-[13px]">End<input className="field mt-1" type="time" value={w.end} onChange={e => change(i, { ...w, end: e.target.value })} /></label><button className="btn btn-quiet" type="button" onClick={() => onChange(value.filter((_, n) => n !== i))}>Remove</button></div>
      {w.start > w.end && <p className="text-[12px]" style={{ color: 'var(--ink-2)' }}>Overnight: continues into the next morning.</p>}
    </div>)}
    <button className="btn btn-quiet" type="button" disabled={disabled || value.length >= 21} onClick={() => onChange([...value, { days: [0, 1, 2, 3, 4, 5, 6], start: '15:00', end: '20:00' }])}>Add time window</button>
  </fieldset>
}
