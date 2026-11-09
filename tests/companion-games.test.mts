import test from 'node:test'
import assert from 'node:assert/strict'
import {aggregateApps,cleanAppHint,cleanActivity} from '../src/lib/companion/activity.ts'
import {gameSuggestions,effectiveGameRules} from '../src/lib/companion/game-suggestions.ts'
test('installed hints suggest names but parent choices and protected apps win',()=>{
 const apps=[{executable:'game.exe',seconds:100,hint:{label:'Example',source:'steam' as const,appId:'123'}},{executable:'chrome.exe',seconds:10,hint:{label:'Chrome',source:'xbox' as const}},{executable:'modernwarfare.exe',seconds:10}]
 assert.equal(gameSuggestions(apps,[]).length,2)
 assert.equal(gameSuggestions(apps,[{executable:'game.exe'},{executable:'modernwarfare.exe'}]).length,0)
})
test('hint validation drops paths, unsupported sources and resource references',()=>{
 for(const hint of [{label:'C:\\Users\\Grey',source:'xbox'},{label:'ms-resource:Name',source:'xbox'},{label:'Game',source:'unknown'},{label:'Game',source:'steam',appId:'oops'}])assert.equal(cleanAppHint(hint),undefined)
 assert.deepEqual(cleanAppHint({label:'Science: A Game',source:'steam',appId:'123',path:'private'}),{label:'Science: A Game',source:'steam',appId:'123'})
})
test('conflicting names for the same executable require manual classification',()=>{
 const apps=aggregateApps([{apps:[{executable:'game.exe',seconds:10,hint:{label:'One',source:'steam',appId:'1'}}]},{apps:[{executable:'game.exe',seconds:20,hint:{label:'Two',source:'steam',appId:'2'}}]}])
 assert.equal(apps[0].seconds,30);assert.equal(apps[0].ambiguous,true);assert.equal(gameSuggestions(apps,[]).length,0)
})
test('old batches retain their canonical shape; new hints survive upload validation',()=>{
 const b={id:'12345678-1234-1234-1234-123456789012',start:new Date(Date.now()-60000).toISOString(),end:new Date().toISOString(),apps:[{executable:'game.exe',seconds:60}],gaps:0,version:'0.2.0'}
 assert.equal('hint' in cleanActivity(b).apps[0],false)
 const v={...b,apps:[{...b.apps[0],hint:{label:'Example',source:'xbox'}}]};assert.equal(cleanActivity(v).apps[0].hint?.label,'Example')
})

test('known games count automatically; overrides and uncertain Steam apps remain unchanged',()=>{
 const apps=[{executable:'rainbowsix.exe',seconds:100},{executable:'tool.exe',seconds:20,hint:{label:'Tool',source:'steam' as const,appId:'123'}},{executable:'xboxgame.exe',seconds:20,hint:{label:'Xbox Game',source:'xbox' as const}}]
 assert.deepEqual(effectiveGameRules(apps,[]).map(r=>r.executable),['rainbowsix.exe','xboxgame.exe'])
 const saved={executable:'rainbowsix.exe',label:'Override',category:'school',daily_minutes:null}
 assert.deepEqual(effectiveGameRules(apps,[saved])[0],saved)
 assert.equal(effectiveGameRules([{executable:'rainbowsix.exe',seconds:1,ambiguous:true}],[]).length,0)
})
