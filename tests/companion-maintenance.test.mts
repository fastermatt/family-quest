import test from 'node:test'
import assert from 'node:assert/strict'
import {commandRequest,commandResult} from '../src/lib/companion/maintenance.ts'
const id='10000000-0000-4000-8000-000000000001'
test('maintenance supports only bounded named operations',()=>{
 for(const kind of ['diagnostics','check-update','apply-update','test-countdown'])assert.equal(commandRequest({clientId:id,requestId:id,kind}).kind,kind)
 for(const kind of ['shell','powershell','download','restart-windows',null])assert.throws(()=>commandRequest({clientId:id,requestId:id,kind}))
 assert.throws(()=>commandRequest({clientId:'bad',requestId:id,kind:'diagnostics'}))
})
test('results reject credentials, paths, arbitrary payloads and wrong primitive types',()=>{
 const valid={id,status:'completed',result:{version:'0.3.0',platform:'windows',policyRevision:4,policyAgeSeconds:20,familyEnabled:true,gamingAllowed:false,reason:'School time',updateOutcome:'staged',countdownOutcome:'requested'}}
 assert.deepEqual(commandResult(valid),valid)
 for(const result of [{token:'secret'},{path:'C:\\Users\\child'},{policyRevision:-1},{gamingAllowed:'yes'},{reason:'x'.repeat(201)},{errorCode:{message:'stack'}},{updateOutcome:'installed'}])assert.throws(()=>commandResult({id,status:'completed',result}))
 assert.throws(()=>commandResult({id,status:'running',result:{}}))
})
