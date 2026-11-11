import {NextRequest,NextResponse} from 'next/server'
import {adminClient} from '@/lib/session'
import {desktopIdentity,limitedJson,desktopError} from '@/lib/companion/desktop-server'
export const dynamic='force-dynamic'

interface BrowseEntry{domain:string;category:string;title?:string;seconds:number}
interface BrowseBatch{day:string;entries:BrowseEntry[]}

export async function POST(req:NextRequest){
 try{
  const client=await desktopIdentity(req);if(!client)return desktopError('Link expired or revoked.',401)
  const b=await limitedJson(req,256*1024) as BrowseBatch
  if(typeof b.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.day))throw new Error('Invalid day.')
  if(!Array.isArray(b.entries)||b.entries.length>5000)throw new Error('Invalid entries.')
  const entries:BrowseEntry[]=b.entries.filter(e=>
   typeof e.domain==='string'&&e.domain.length<=253&&
   typeof e.seconds==='number'&&e.seconds>0
  ).map(e=>({
   domain:e.domain.slice(0,253),
   category:['youtube','gaming','social','school','other'].includes(e.category)?e.category:'other',
   title:typeof e.title==='string'&&e.title?e.title.slice(0,120):undefined,
   seconds:Math.min(Number(e.seconds),86400),
  }))
  const admin=adminClient()
  const {error}=await admin.from('companion_browse_history').upsert({
   family_id:client.family_id,child_id:client.child_id,day:b.day,
   entries,updated_at:new Date().toISOString(),
  },{onConflict:'family_id,child_id,day'})
  if(error)return desktopError('Could not save browse history.',503)
  return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}})
 }catch(e){return desktopError(e)}
}
