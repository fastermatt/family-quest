import { NextResponse } from 'next/server'
import { integer, text, UUID } from './policy'

export function response(data:unknown,status=200) { return NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}}) }
export function failure(error: unknown,status=400) { return response({error:error instanceof Error?error.message:'Could not save. Try again.'},status) }
export function rpcFailure(error: {code?:string}) {
  const code=error.code
  return response({error:code==='40001'?'This changed or was already reviewed. Refresh before trying again.':code==='P0002'?'This item was not found.':code==='22023'||code==='23514'?'This action is not available. Check the amount, work status and family rules.':'Could not save. No success was confirmed; try again.'},code==='40001'?409:code==='P0002'?404:code==='22023'||code==='23514'?400:503)
}
export function cleanMoneyAction(b:Record<string,unknown>,child=false) {
 const action=String(b.action)
 const allowed=child?['accept-job','submit-job']:['open-iou','offer-job','review-job','settle-cash']
 if(!allowed.includes(action))throw new Error('Unknown action.')
 if(action==='open-iou')return {amountCents:integer(b.amountCents,0,1000000,'IOU cents'),description:text(b.description,200,'what this IOU is for')}
 if(action==='offer-job')return {title:text(b.title,100,'a job title'),description:text(b.description,2000,'the job scope'),criteria:text(b.criteria,1000,'what finished looks like'),priceCents:integer(b.priceCents,1,1000000,'Job price cents')}
 if(action==='settle-cash'){
  if(!UUID.test(String(b.requestId)))throw new Error('Invalid payment request.')
  return {amountCents:integer(b.amountCents,1,1000000,'Payment cents'),requestId:b.requestId}
 }
 if(!UUID.test(String(b.jobId)))throw new Error('Choose a job.')
 const note=typeof b.note==='string'?b.note.trim().slice(0,1000):''
 if(action==='submit-job'&&!note)throw new Error('Describe the work you finished.')
 if(action==='review-job'&&!['approve','changes_requested','cancel'].includes(String(b.decision)))throw new Error('Choose a review decision.')
 if(b.decision==='changes_requested'&&!note)throw new Error('Say what needs fixing.')
 return {jobId:b.jobId,note,...(action==='review-job'?{decision:b.decision}:{})}
}
