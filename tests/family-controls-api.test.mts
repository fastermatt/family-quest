import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import pathModule from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { DEFAULT_SETTINGS } from '../src/lib/family-controls/policy.ts'
const require=createRequire(import.meta.url)
const F='10000000-0000-4000-8000-000000000001', C='20000000-0000-4000-8000-000000000001', P='30000000-0000-4000-8000-000000000001'
type Handler=(request:unknown)=>Promise<Response>
function load(path:string,mocks:Record<string,unknown>):Record<string,Handler> {
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const unit={exports:{}}
 vm.runInNewContext(code,{module:unit,exports:unit.exports,require:(name:string)=>{if(name in mocks)return mocks[name];if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.ts',mocks);if(name.startsWith('.'))return load(pathModule.join(pathModule.dirname(path),name)+(name.endsWith('.ts')?'':'.ts'),mocks);return require(name)},Response,Request,Headers,URL,Buffer,console},{filename:path})
 return unit.exports
}
function fixture(role:'parent'|'child'|'none'='parent',sameFamily=true,rpcError:unknown=null) {
 const calls:{name:string;args:Record<string,unknown>}[]=[]
 const admin={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {error:rpcError}}}
 const me=role==='none'?null:{id:role==='child'?C:P,family_id:F,role}
 const error=(status:number)=>Response.json({error:'denied'},{status})
 const mocks={
  '@/lib/api-auth':{requireParent:async()=>!me?{error:error(401)}:role!=='parent'?{error:error(403)}:{me,admin},childInFamily:async()=>sameFamily},
  '@/lib/session':{getSessionProfile:async()=>me,adminClient:()=>admin},
  '@/lib/companion/desktop-server':{sameOrigin:(req:{origin:string})=>req.origin==='https://family.example',limitedJson:async(req:{body:unknown})=>req.body,desktopIdentity:async(req:{linked?:boolean})=>req.linked===false?null:{id:'90000000-0000-4000-8000-000000000001'}},
  '@/lib/family-controls/server':{},
 }
 return {calls,parent:load('src/app/api/parent/family-controls/route.ts',mocks),child:load('src/app/api/child/family-controls/route.ts',mocks),maintenance:load('src/app/api/parent/companion/commands/route.ts',mocks),device:load('src/app/api/companion/v2/commands/route.ts',mocks)}
}
const request=(body:unknown,origin='https://family.example')=>({body,origin})
test('parent mutations reject signed-out, child, cross-family and cross-origin requests before RPC',async()=>{
 for(const [role,status] of [['none',401],['child',403]] as const){const x=fixture(role);assert.equal((await x.parent.POST(request({action:'open-iou',childId:C,amountCents:8000,description:'IOU'}))).status,status);assert.equal(x.calls.length,0)}
 const foreign=fixture('parent',false);assert.equal((await foreign.parent.POST(request({action:'open-iou',childId:C}))).status,404);assert.equal(foreign.calls.length,0)
 const cross=fixture();assert.equal((await cross.parent.POST(request({childId:C},'https://attacker.example'))).status,403);assert.equal(cross.calls.length,0)
})
test('child job actions derive family and identity from session and cannot approve money',async()=>{
 const x=fixture('child')
 const jobId='40000000-0000-4000-8000-000000000001'
 const res=await x.child.POST(request({action:'accept-job',jobId,childId:P,familyId:'other'}))
 assert.equal(res.status,200)
 assert.equal(x.calls[0].args.p_child,C);assert.equal(x.calls[0].args.p_family,F);assert.equal(x.calls[0].args.p_actor,C)
 assert.equal((await x.child.POST(request({action:'review-job',jobId,decision:'approve'}))).status,400)
 assert.equal(x.calls.length,1)
 const preview=fixture('parent');assert.equal((await preview.child.POST(request({action:'accept-job',jobId}))).status,403)
})
test('validation excludes caller authority fields and stale settings/database errors never report success',async()=>{
 const x=fixture()
 assert.equal((await x.parent.POST(request({action:'open-iou',childId:C,amountCents:8000.5,description:'IOU'}))).status,400)
 assert.equal(x.calls.length,0)
 const ok=await x.parent.POST(request({action:'open-iou',childId:C,amountCents:8000,description:'IOU',p_actor:C}))
 assert.equal(ok.status,200);assert.equal(x.calls[0].args.p_actor,P)
 const conflict=fixture('parent',true,{code:'40001'})
 const res=await conflict.parent.POST(request({action:'settings',childId:C,settings:{...DEFAULT_SETTINGS}}))
 assert.equal(res.status,409)
 const unavailable=fixture('parent',true,{code:'08006',message:'sensitive internal details'})
 const fail=await unavailable.parent.POST(request({action:'open-iou',childId:C,amountCents:8000,description:'IOU'}))
 assert.equal(fail.status,503);assert.equal((await fail.text()).includes('sensitive'),false)
})


test('remote maintenance rejects child initiation, unlinked device and arbitrary diagnostic payloads',async()=>{
 const id='80000000-0000-4000-8000-000000000001'
 const child=fixture('child')
 assert.equal((await child.maintenance.POST(request({clientId:id,requestId:id,kind:'diagnostics'}))).status,403)
 assert.equal(child.calls.length,0)
 const x=fixture()
 assert.equal((await x.device.POST({...request({id,status:'completed',result:{version:'0.3.0'}}),linked:false})).status,401)
 assert.equal((await x.device.POST(request({id,status:'completed',result:{token:'not-allowed'}}))).status,400)
 assert.equal(x.calls.length,0)
 assert.equal((await x.device.POST(request({id,status:'completed',result:{version:'0.3.0'},clientId:'forged'}))).status,200)
 assert.equal(x.calls[0].args.p_client,'90000000-0000-4000-8000-000000000001')
 assert.equal(x.calls[0].name,'companion_finish_command')
})
