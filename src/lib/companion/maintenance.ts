import { UUID } from '../family-controls/policy.ts'
export const COMMAND_KINDS = ['diagnostics','check-update','test-countdown','apply-update'] as const
export function commandRequest(raw:unknown) {
 if(!raw||typeof raw!=='object')throw new Error('Invalid maintenance request.')
 const b=raw as Record<string,unknown>
 if(!UUID.test(String(b.clientId))||!UUID.test(String(b.requestId))||!COMMAND_KINDS.includes(b.kind as typeof COMMAND_KINDS[number]))throw new Error('Choose a PC and supported maintenance action.')
 return {clientId:String(b.clientId),requestId:String(b.requestId),kind:String(b.kind)}
}
export function commandResult(raw:unknown) {
 if(!raw||typeof raw!=='object')throw new Error('Invalid result.')
 const b=raw as Record<string,unknown>
 if(!UUID.test(String(b.id))||!['completed','failed'].includes(String(b.status))||!b.result||typeof b.result!=='object'||Array.isArray(b.result))throw new Error('Invalid command acknowledgement.')
 const result=b.result as Record<string,unknown>
 const lengths:Record<string,number>={version:30,launcherVersion:30,platform:30,reason:200,updateStatus:200,errorCode:80}
 for(const [key,value] of Object.entries(result)){
  if(key in lengths){if(typeof value!=='string'||value.length>lengths[key])throw new Error('Invalid diagnostic field.')}
  else if(['policyRevision','policyAgeSeconds'].includes(key)){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>2147483647)throw new Error('Invalid diagnostic number.')}
  else if(['familyEnabled','gamingAllowed','remoteActivationAvailable'].includes(key)){if(typeof value!=='boolean')throw new Error('Invalid diagnostic flag.')}
  else if(key==='updateOutcome'){if(!['current','staged','failed','not_checked','deferred','restart_requested'].includes(String(value)))throw new Error('Invalid update result.')}
  else if(key==='countdownOutcome'){if(!['requested','displayed','unavailable'].includes(String(value)))throw new Error('Invalid countdown result.')}
  else throw new Error('Unsupported diagnostic field.')
 }
 return {id:String(b.id),status:String(b.status),result}
}
