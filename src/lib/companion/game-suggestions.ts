import {type AppTime,PROTECTED_APPS,cleanAppHint} from './activity.ts'
export type GameSuggestion={executable:string;label:string;source:'steam'|'xbox'|'observed';reason:string}
// Original seed from Matt's supplied Windows pilot; no third-party game dataset.
const observedGames:Record<string,string>={'modernwarfare.exe':'Call of Duty: Modern Warfare'}
export function gameSuggestions(apps:AppTime[],rules:{executable:string}[]):GameSuggestion[]{
 const saved=new Set(rules.map(r=>r.executable))
 return apps.flatMap<GameSuggestion>(a=>{
  if(saved.has(a.executable)||PROTECTED_APPS.has(a.executable)||a.ambiguous)return []
  const hint=cleanAppHint(a.hint)
  if(hint)return [{executable:a.executable,label:hint.label,source:hint.source,reason:hint.source==='steam'?'Steam installation · may also be non-game software':'Xbox game configuration'}]
  const label=observedGames[a.executable]
  return label?[{executable:a.executable,label,source:'observed' as const,reason:'Recognized executable name · please confirm'}]:[]
 })
}

export type EffectiveRule={executable:string;label:string;category:string;daily_minutes:number|null}
// Conservative family catalog: launchers are not automatically gameplay.
const knownGames:Record<string,string>={...observedGames,'rainbowsix.exe':"Tom Clancy's Rainbow Six Siege"}
export function effectiveGameRules(apps:AppTime[],saved:EffectiveRule[]):EffectiveRule[]{
 const existing=new Set(saved.map(r=>r.executable))
 return [...saved,...apps.flatMap<EffectiveRule>(a=>{
  if(existing.has(a.executable)||PROTECTED_APPS.has(a.executable)||a.ambiguous)return []
  const hint=cleanAppHint(a.hint)
  const label=knownGames[a.executable]??(hint?.source==='xbox'?hint.label:undefined)
  return label?[{executable:a.executable,label,category:'game',daily_minutes:null}]:[]
 })]
}
