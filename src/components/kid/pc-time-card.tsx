'use client'
import {useQuery} from '@tanstack/react-query'
type Data={familyRulesEnabled?:boolean;familyReason?:string;day:string;linked:boolean;gaming:number;total:number;lastUpload:string|null;apps:{name:string;category:string;seconds:number}[];settings:{gaming_minutes:number|null;paused:boolean;mode:string}}
const duration=(s:number)=>{const m=Math.floor(Math.max(0,s)/60);return m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m}m`}
export function PCTimeCard(){
 const q=useQuery<Data>({queryKey:['my-pc-time'],queryFn:async()=>{const r=await fetch('/api/child/pc-time',{cache:'no-store'});if(!r.ok)throw Error('Could not load PC time');return r.json()},refetchInterval:60_000})
 return <section className="rounded-2xl border border-white/10 bg-[#0a1120] p-5" aria-label="My PC time"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">My PC time</h2><span className="text-xs text-white/50">Today · Denver</span></div>
 {q.isPending?<p role="status" className="mt-3 text-white/60">Loading recorded time…</p>:q.isError?<p role="alert" className="mt-3 text-white/70">PC time is unavailable. <button onClick={()=>q.refetch()} className="underline">Try again</button></p>:q.data&&<>
 {!q.data.linked?<p className="mt-3 text-white/60">Ask your parent to link your PC to see your time here.</p>:<>
 <div className="my-5 flex flex-wrap items-end gap-8"><div><p className="text-xs uppercase tracking-wider text-white/60">Gaming recorded</p><p className="text-4xl font-bold text-[#2dd4bf]">{duration(q.data.gaming)}</p></div><div><p className="text-xs text-white/60">All PC apps</p><p className="text-xl font-semibold">{duration(q.data.total)}</p></div></div>
 <p className="text-sm text-[#fac922]">{q.data.familyRulesEnabled?q.data.familyReason:q.data.settings.paused?'Parent has paused gaming':q.data.settings.gaming_minutes===null?'No shared gaming allowance set':`${duration(q.data.settings.gaming_minutes*60-q.data.gaming)} left of ${duration(q.data.settings.gaming_minutes*60)}`}</p>
 <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">What filled your day</summary><ul className="mt-2 divide-y divide-white/10">{q.data.apps.map((a,i)=><li key={i} className="flex justify-between gap-4 py-3 text-sm"><div className="min-w-0 break-words">{a.name}<span className="block text-xs text-white/50">{a.category==='game'?'Gaming':a.category==='school'?'School':'Other / not classified'}</span></div><span className="shrink-0">{duration(a.seconds)}</span></li>)}</ul>{!q.data.apps.length&&<p className="py-3 text-sm text-white/60">No activity uploaded today yet.</p>}</details>
 <p className="mt-4 text-xs text-white/50">{q.data.lastUpload?`Last uploaded ${new Date(q.data.lastUpload).toLocaleTimeString('en-US',{timeZone:'America/Denver',hour:'numeric',minute:'2-digit'})} Denver time.`:'Waiting for the first upload.'} Updates about every five minutes while the PC is connected. Recorded foreground time only; websites are not included yet.</p>
 </>}
 </>}
 </section>
}
