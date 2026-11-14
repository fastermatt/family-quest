export const CATEGORIES = ['game', 'school', 'other'] as const
export type AppCategory = typeof CATEGORIES[number]
export type AppHint = {label:string;source:'steam'|'xbox';appId?:string}
export type AppTime = { executable: string; seconds: number; hint?:AppHint; ambiguous?:boolean }
export function cleanAppHint(value:unknown):AppHint|undefined {
 if(!value||typeof value!=='object')return undefined
 const h=value as Record<string,unknown>
 if(!['steam','xbox'].includes(String(h.source))||typeof h.label!=='string'||!h.label.trim()||h.label.length>60||/[\\/\u0000-\u001f]/.test(h.label)||/^ms-resource:/i.test(h.label))return undefined
 if(h.source==='steam'&&(typeof h.appId!=='string'||!/^\d{1,12}$/.test(h.appId)))return undefined
 return {label:h.label.trim(),source:h.source as AppHint['source'],...(h.source==='steam'?{appId:h.appId as string}:{})}
}
export type ActivityBatch = { id: string; start: string; end: string; apps: AppTime[]; gaps: number; version: string }
export const PROTECTED_APPS = new Set(['msedge.exe','chrome.exe','avastbrowser.exe','firefox.exe','brave.exe','opera.exe','steam.exe','steamwebhelper.exe','xboxpcapp.exe','gamingservices.exe','explorer.exe','windowsterminal.exe','cmd.exe','powershell.exe','chorezap-desktop.exe'])
export const HASH = /^[a-f0-9]{64}$/
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function cleanExecutable(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 120 || !/^[\p{L}\p{N}_. ()-]+\.exe$/iu.test(value)) return null
  return value.toLowerCase()
}
export function cleanActivity(value: unknown, now = Date.now()): ActivityBatch {
  if (!value || typeof value !== 'object') throw new Error('Missing activity batch.')
  const b = value as Record<string, unknown>
  const start = Date.parse(String(b.start)), end = Date.parse(String(b.end))
  if (!UUID.test(String(b.id)) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end-start > 360_000 || end > now+120_000 || start < now-14*86400_000) throw new Error('Invalid activity interval.')
  if (!Array.isArray(b.apps) || b.apps.length > 100) throw new Error('Too many applications.')
  const seen = new Set<string>()
  const apps = b.apps.map((item: unknown) => {
    const a = item as Record<string, unknown>, executable = cleanExecutable(a?.executable)
    if (!executable || seen.has(executable) || typeof a.seconds !== 'number' || !Number.isFinite(a.seconds) || a.seconds < 0) throw new Error('Invalid application duration.')
    seen.add(executable)
    const hint=PROTECTED_APPS.has(executable)?undefined:cleanAppHint(a.hint)
    return { executable, seconds: Math.round(a.seconds*1000)/1000, ...(hint?{hint}:{}) }
  })
  if (typeof b.gaps !== 'number' || !Number.isFinite(b.gaps) || b.gaps < 0) throw new Error('Invalid gap duration.')
  const total = apps.reduce((sum,a)=>sum+a.seconds, b.gaps)
  if (Math.abs(total-(end-start)/1000) > 1) throw new Error('Activity does not balance with elapsed time.')
  return { id: String(b.id), start: new Date(start).toISOString(), end:new Date(end).toISOString(), apps, gaps:Math.round(b.gaps*1000)/1000, version:typeof b.version === 'string' ? b.version.slice(0,30) : 'unknown' }
}
export function cleanAppRule(value: unknown) {
  const b = value as Record<string, unknown>, executable = cleanExecutable(b?.executable)
  if (!executable || !CATEGORIES.includes(b.category as AppCategory)) throw new Error('Choose an application and category.')
  if (b.category === 'game' && PROTECTED_APPS.has(executable)) throw new Error('Browsers, launchers and system tools cannot be limited as games.')
  const dailyMinutes = b.dailyMinutes === null ? null : Number(b.dailyMinutes)
  if (dailyMinutes !== null && (!Number.isInteger(dailyMinutes) || dailyMinutes < 0 || dailyMinutes > 1440)) throw new Error('Limit must be 0–1440 minutes, or unlimited.')
  return { executable, category:b.category as AppCategory, label:typeof b.label === 'string' ? b.label.replace(/[\u0000-\u001f]/g,'').trim().slice(0,60) || executable : executable, daily_minutes:b.category === 'game' ? dailyMinutes : null }
}
export function denverDay(date = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(date) }
export function aggregateApps(rows: { apps: AppTime[] }[]): AppTime[] {
  const totals = new Map<string,AppTime>()
  for (const row of rows) for (const a of row.apps) {
    const current=totals.get(a.executable)??{executable:a.executable,seconds:0}
    current.seconds+=a.seconds
    const hint=PROTECTED_APPS.has(a.executable)?undefined:cleanAppHint(a.hint)
    if(hint&&!current.ambiguous){
      if(current.hint&&JSON.stringify(current.hint)!==JSON.stringify(hint)){delete current.hint;current.ambiguous=true}
      else current.hint=hint
    }
    totals.set(a.executable,current)
  }
  return [...totals.values()].sort((a,b)=>b.seconds-a.seconds)
}
