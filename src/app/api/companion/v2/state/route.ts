import { NextRequest,NextResponse } from 'next/server'
import { adminClient } from '@/lib/session'
import { sha256 } from '@/lib/companion/pairing'
import { desktopIdentity,desktopSnapshot,desktopError } from '@/lib/companion/desktop-server'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){
 try {
  const client=await desktopIdentity(req)
  if(!client){
   const raw=(req.headers.get('authorization')??'').replace(/^Bearer /i,'')
   if(!/^[a-f0-9]{64}$/.test(raw))return desktopError('Not linked.',401)
   const {data}=await adminClient().from('companion_enrollments').select('expires_at').eq('token_hash',sha256(raw)).is('client_id',null).gt('expires_at',new Date().toISOString()).maybeSingle()
   return data?NextResponse.json({waiting:true},{headers:{'Cache-Control':'no-store'}}):desktopError('Link expired or revoked.',401)
  }
  const snapshot=await desktopSnapshot(client)
  const version=req.headers.get('x-chorezap-version')??''
  const acknowledged=req.headers.get('x-chorezap-policy-revision')??''
  if(/^\d+\.\d+\.\d+$/.test(version)){
   const revision=/^\d{1,9}$/.test(acknowledged)?Number(acknowledged):null
   const applied=revision!==null&&revision===snapshot.familyPolicy?.revision
   const {error}=await adminClient().from('companion_clients').update({version,last_seen_at:new Date().toISOString(),...(applied?{applied_revision:revision,applied_at:new Date().toISOString()}:{})}).eq('id',client.id).eq('family_id',client.family_id).is('revoked_at',null)
   if(error)return desktopError('Could not record PC status.',503)
  }
  return NextResponse.json(snapshot,{headers:{'Cache-Control':'no-store'}})
 }catch{return desktopError('Could not sync settings.',503)}
}
