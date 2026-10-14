import { test } from 'node:test'
import assert from 'node:assert/strict'
import { middlewareAccess } from '../src/lib/middleware-access.ts'
import { timeoutFetch, withTimeout } from '../src/lib/request-timeout.ts'
test('public login, root and cron routes do not authenticate even with stale auth cookies', () => {
 const stale=[{name:'sb-example-auth-token',value:'stale'}]
 for(const p of ['/','/login','/family-login','/api/cron/custom-reminders','/api/active-profile'])assert.equal(middlewareAccess(p,stale),'pass')
 assert.equal(middlewareAccess('/dashboard',stale),'authenticate')
 assert.equal(middlewareAccess('/api/parent/reminder-schedules',[]),'deny')
 assert.equal(middlewareAccess('/home',[{name:'profile_token',value:'token'}]),'pass')
 assert.equal(middlewareAccess('/home',[{name:'profile_token',value:''}]),'deny')
 assert.equal(middlewareAccess('/login-malicious',[]),'deny')
})
test('a hung upstream is bounded and its network signal is cancelled',async()=>{
 let signal: AbortSignal | undefined
 const send=(async (_input,init)=>{signal=init?.signal as AbortSignal;return await new Promise<Response>(()=>{})}) as typeof fetch
 await assert.rejects(timeoutFetch(15,send)('https://example.com'),/timed out/)
 assert.equal(signal?.aborted,true)
 assert.equal(await withTimeout(Promise.resolve(7),50),7)
})

test('successful fetch keeps the response body readable', async () => {
 let signal: AbortSignal | undefined
 const send=(async (_input,init)=>{signal=init?.signal as AbortSignal;return new Response('{"ok":true}')}) as typeof fetch
 const response=await timeoutFetch(50,send)('https://example.com')
 assert.equal(signal?.aborted,false)
 assert.deepEqual(await response.json(),{ok:true})
})
