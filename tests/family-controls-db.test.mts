import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { DEFAULT_SETTINGS } from '../src/lib/family-controls/policy.ts'

const F='10000000-0000-4000-8000-000000000001', C='20000000-0000-4000-8000-000000000001', P='30000000-0000-4000-8000-000000000001'
const F2='10000000-0000-4000-8000-000000000002', C2='20000000-0000-4000-8000-000000000002', P2='30000000-0000-4000-8000-000000000002'
const R='40000000-0000-4000-8000-000000000001', T='50000000-0000-4000-8000-000000000001', I='60000000-0000-4000-8000-000000000001'
async function setup() {
 const db=new PGlite()
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table families(id uuid primary key,family_xp integer default 0,family_level integer default 1);
 create table profiles(id uuid primary key,family_id uuid references families,role text,xp_total integer default 0);
 create view public_profiles as select * from profiles; grant select on public_profiles to public;
 create function cleanup_old_pin_attempts() returns void language plpgsql security definer as $$ begin return; end $$;
 create table privileges(id uuid primary key,family_id uuid references families);
 create table task_templates(id uuid primary key,family_id uuid references families,proof_type text,photo_required boolean default false,required boolean default true,active boolean default true,xp_value integer default 100);
 create table task_instances(id uuid primary key,template_id uuid references task_templates,assigned_to uuid references profiles,due_date date,status text,xp_awarded integer default 0,reviewed_at timestamptz,review_note text);
 create table companion_clients(id uuid primary key,family_id uuid references families,child_id uuid references profiles,revoked_at timestamptz,last_seen_at timestamptz,name text);
 create table companion_limits(family_id uuid,child_id uuid,gaming_minutes int,paused bool default false,mode text default 'warn',primary key(family_id,child_id));
 -- pgcrypto compatibility shim for the embedded DB only. Real crypt verified in hosted rollback test.
 create schema extensions;
 create function extensions.gen_salt(text,int) returns text language sql as $$ select '$test$'; $$;
 create function extensions.crypt(text,text) returns text language sql as $$ select '$test$'||$1; $$;
 create function award_xp(p_child uuid,p_family uuid,p_xp integer) returns void language sql as $$ update profiles set xp_total=xp_total+p_xp where id=p_child;update families set family_xp=family_xp+p_xp where id=p_family; $$;
 insert into families(id) values('${F}'),('${F2}');
 insert into profiles(id,family_id,role) values('${C}','${F}','child'),('${P}','${F}','parent'),('${C2}','${F2}','child'),('${P2}','${F2}','parent');
 insert into privileges values('${R}','${F}');
 insert into task_templates(id,family_id,proof_type) values('${T}','${F}','photo');
 insert into task_instances(id,template_id,assigned_to,due_date,status) values('${I}','${T}','${C}',(now() at time zone 'America/Denver')::date,'pending');`)
 const migration=await readFile(new URL('../supabase/migrations/20261109052008_family_controls_pilot.sql',import.meta.url),'utf8')
 await db.exec(migration)
 await db.exec(await readFile(new URL('../supabase/migrations/20261109054611_companion_remote_maintenance.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/migrations/20261111143134_companion_release_schema_and_stop_verification.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/migrations/20261111143718_companion_stop_pin_transition_and_access.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/migrations/20261111151000_companion_presence_monitor.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/migrations/20261111152500_presence_recipient_scope.sql',import.meta.url),'utf8'))
 return db
}
async function money(db:PGlite,action:string,body:unknown,actor=P,child=C,family=F) { await db.query('select family_money_action($1,$2,$3,$4,$5::jsonb)',[family,child,actor,action,JSON.stringify(body)]) }
async function account(db:PGlite) {return (await db.query<{debt_remaining_cents:number;cash_owed_cents:number}>('select * from family_money_accounts where child_id=$1',[C])).rows[0]}
async function state(db:PGlite) {return (await db.query<{state:{eligible:boolean;grantedSeconds:number;remainingTasks:number;requiredCount:number}}>('select family_game_state($1,$2) as state',[F,C])).rows[0].state}
async function settings(db:PGlite,revision=0,extra={}) {await db.query('select family_save_settings($1,$2,$3,$4::jsonb)',[F,C,P,JSON.stringify({...DEFAULT_SETTINGS,enabled:true,game_privilege_id:R,weekend_requires_chores:true,revision,...extra})])}
async function job(db:PGlite,priceCents:number,title='Clean patio') {
 await money(db,'offer-job',{title,description:'Sweep and wash the patio.',criteria:'Clear debris and rinse tools.',priceCents})
 const id=(await db.query<{id:string}>('select id from family_job_offers where title=$1 order by created_at desc limit 1',[title])).rows[0].id
 await money(db,'accept-job',{jobId:id},C)
 await money(db,'submit-job',{jobId:id,note:'Finished the scope and put tools away.'},C)
 return id
}

test('IOU repayments split exactly, duplicate approvals and payment retries cannot pay twice',async()=>{
 const db=await setup()
 try{
  await money(db,'open-iou',{amountCents:8000,description:'Modern Warfare purchase'})
  await money(db,'open-iou',{amountCents:8000,description:'Modern Warfare purchase'})
  await assert.rejects(money(db,'open-iou',{amountCents:9000,description:'Changed'}))
  const first=await job(db,7700,'First project')
  await Promise.all([money(db,'review-job',{jobId:first,decision:'approve'}),money(db,'review-job',{jobId:first,decision:'approve'})])
  assert.equal((await account(db)).debt_remaining_cents,300)
  const last=await job(db,500,'Final project')
  await money(db,'review-job',{jobId:last,decision:'approve'})
  assert.equal((await account(db)).debt_remaining_cents,0)
  assert.equal((await account(db)).cash_owed_cents,200)
  const requestId='70000000-0000-4000-8000-000000000001'
  await money(db,'settle-cash',{amountCents:200,requestId})
  await money(db,'settle-cash',{amountCents:200,requestId})
  assert.equal((await account(db)).cash_owed_cents,0)
  await assert.rejects(money(db,'settle-cash',{amountCents:100,requestId}))
  await assert.rejects(money(db,'settle-cash',{amountCents:1,requestId:'70000000-0000-4000-8000-000000000002'}))
  const totals=(await db.query<{debt:number;cash:number}>('select sum(debt_delta_cents)::int debt,sum(cash_delta_cents)::int cash from family_money_entries')).rows[0]
  assert.deepEqual(totals,{debt:0,cash:0})
  assert.equal((await db.query<{n:number}>('select count(*)::int n from family_money_entries')).rows[0].n,4)
 }finally{await db.close()}
})
test('child and foreign-family actors cannot award money; unfinished jobs cannot earn',async()=>{
 const db=await setup()
 try{
  await assert.rejects(money(db,'open-iou',{amountCents:8000,description:'IOU'},C))
  await assert.rejects(money(db,'open-iou',{amountCents:8000,description:'IOU'},P2))
  await assert.rejects(money(db,'open-iou',{amountCents:8000,description:'IOU'},P,C2))
  await money(db,'open-iou',{amountCents:0,description:'No IOU'})
  await money(db,'offer-job',{title:'Project',description:'Do the scope',criteria:'Agreed work',priceCents:500})
  const id=(await db.query<{id:string}>('select id from family_job_offers')).rows[0].id
  await assert.rejects(money(db,'submit-job',{jobId:id,note:'Done'},C))
  await assert.rejects(money(db,'accept-job',{jobId:id},C2))
  await assert.rejects(money(db,'review-job',{jobId:id,decision:'approve'}))
  await money(db,'accept-job',{jobId:id},C)
  await money(db,'submit-job',{jobId:id,note:'Done'},C)
  await assert.rejects(money(db,'review-job',{jobId:id,decision:'approve'},C))
  await money(db,'review-job',{jobId:id,decision:'changes_requested',note:'Please finish the edge.'})
  await assert.rejects(money(db,'review-job',{jobId:id,decision:'approve'}))
  assert.equal((await account(db)).cash_owed_cents,0)
  await money(db,'submit-job',{jobId:id,note:'Edge finished'},C)
  await money(db,'review-job',{jobId:id,decision:'approve'})
  assert.equal((await account(db)).cash_owed_cents,500)
 }finally{await db.close()}
})
test('dated game grants survive redo/retry and future price edits without cash or duplicate minutes',async()=>{
 const db=await setup()
 try{
  assert.equal((await state(db)).grantedSeconds,0)
  await settings(db)
  assert.equal((await state(db)).eligible,false)
  await db.query("update task_instances set status='submitted' where id=$1",[I])
  assert.equal((await state(db)).grantedSeconds,7200)
  assert.equal((await state(db)).grantedSeconds,7200)
  await settings(db,1,{weekday_minutes:180,weekend_minutes:180})
  assert.equal((await state(db)).grantedSeconds,7200)
  await db.query("update task_instances set status='rejected' where id=$1",[I])
  assert.equal((await state(db)).eligible,false)
  assert.equal((await state(db)).grantedSeconds,7200)
  await db.query("update task_instances set status='submitted' where id=$1",[I])
  assert.equal((await state(db)).grantedSeconds,7200)
  await settings(db,2,{require_parent_approval:true})
  assert.equal((await state(db)).eligible,false)
  await db.query('select family_approve_task($1,$2,$3,$4)',[F,P,I,'Good work'])
  await db.query('select family_approve_task($1,$2,$3,$4)',[F,P,I,'Retry'])
  assert.equal((await state(db)).eligible,true)
  assert.equal((await db.query<{xp_total:number}>('select xp_total from profiles where id=$1',[C])).rows[0].xp_total,100)
  assert.equal((await db.query<{n:number}>('select count(*)::int n from family_money_entries')).rows[0].n,0)
  await assert.rejects(settings(db,1))
 }finally{await db.close()}
})
test('missing task list does not unlock gated day; bonus limited to one weekend receipt',async()=>{
 const db=await setup()
 try{
  await settings(db)
  await db.exec('delete from task_instances')
  assert.equal((await state(db)).eligible,false)
  assert.equal((await state(db)).grantedSeconds,0)
  const dow=(await db.query<{dow:number}>("select extract(dow from now() at time zone 'America/Denver')::int dow")).rows[0].dow
  if(dow===0||dow===6){
   await db.query('select family_bathroom_bonus($1,$2,$3,$4)',[F,C,P,'Deep clean checked'])
   await db.query('select family_bathroom_bonus($1,$2,$3,$4)',[F,C,P,'Retry'])
   assert.equal((await state(db)).grantedSeconds,3600)
   assert.equal((await state(db)).eligible,false)
  }else await assert.rejects(db.query('select family_bathroom_bonus($1,$2,$3,$4)',[F,C,P,'Deep clean checked']))
 }finally{await db.close()}
})
test('XP failure rolls approval back and RLS blocks browser roles on all new data/functions',async()=>{
 const db=await setup()
 try{
  await db.exec("update task_instances set status='submitted'; create or replace function award_xp(p_child uuid,p_family uuid,p_xp integer) returns void language plpgsql as $$ begin raise exception 'simulated XP failure'; end $$;")
  await assert.rejects(db.query('select family_approve_task($1,$2,$3,$4)',[F,P,I,'']))
  assert.equal((await db.query<{status:string}>('select status from task_instances')).rows[0].status,'submitted')
  for(const table of ['family_control_settings','family_game_grants','family_money_accounts','family_job_offers','family_money_entries']){
   assert.equal((await db.query<{relrowsecurity:boolean}>('select relrowsecurity from pg_class where oid=$1::regclass',[table])).rows[0].relrowsecurity,true)
   for(const role of ['anon','authenticated'])for(const operation of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await db.query<{ok:boolean}>('select has_table_privilege($1,$2,$3) ok',[role,table,operation])).rows[0].ok,false)
  }
  for(const role of ['anon','authenticated'])assert.equal((await db.query<{ok:boolean}>('select has_function_privilege($1,$2,$3) ok',[role,'family_money_action(uuid,uuid,uuid,text,jsonb)','EXECUTE'])).rows[0].ok,false)
 }finally{await db.close()}
})


test('remote commands enforce device/family scope, idempotency, fixed actions, expiry and acknowledgement replay',async()=>{
 const db=await setup()
 const PC='90000000-0000-4000-8000-000000000001',OTHER='90000000-0000-4000-8000-000000000002'
 const request='a0000000-0000-4000-8000-000000000001'
 try{
  await db.query('insert into companion_clients(id,family_id,child_id) values($1,$2,$3),($4,$5,$6)',[PC,F,C,OTHER,F2,C2])
  const queue=(kind:string,req=request,actor=P,pc=PC)=>db.query<{id:string}>('select companion_queue_command($1,$2,$3,$4,$5) id',[F,actor,pc,kind,req])
  await assert.rejects(queue('diagnostics',request,C))
  await assert.rejects(queue('diagnostics',request,P,OTHER))
  await assert.rejects(queue('shell'))
  const id=(await queue('diagnostics')).rows[0].id
  assert.equal((await queue('diagnostics')).rows[0].id,id)
  await assert.rejects(queue('check-update'))
  await assert.rejects(queue('diagnostics','a0000000-0000-4000-8000-000000000002'))
  const next=()=>db.query<{command:{id:string;kind:string}|null}>('select companion_next_command($1) command',[PC])
  assert.equal((await next()).rows[0].command?.id,id)
  assert.equal((await next()).rows[0].command?.id,id)
  assert.equal((await db.query<{command:unknown}>('select companion_next_command($1) command',[OTHER])).rows[0].command,null)
  const finish=(pc=PC,result={version:'0.3.0'})=>db.query('select companion_finish_command($1,$2,$3,$4::jsonb)',[pc,id,'completed',JSON.stringify(result)])
  await assert.rejects(finish(OTHER))
  await finish();await finish();await assert.rejects(finish(PC,{version:'0.3.1'}))
  assert.equal((await next()).rows[0].command,null)
  const old=(await queue('check-update','a0000000-0000-4000-8000-000000000003')).rows[0].id
  await db.query("update companion_commands set expires_at=now()-interval '1 second' where id=$1",[old])
  assert.equal((await next()).rows[0].command,null)
  assert.equal((await db.query<{status:string}>('select status from companion_commands where id=$1',[old])).rows[0].status,'expired')
  await db.query('update companion_clients set revoked_at=now() where id=$1',[PC])
  await assert.rejects(next())
  for(const role of ['anon','authenticated']){
   assert.equal((await db.query<{ok:boolean}>('select has_table_privilege($1,$2,$3) ok',[role,'companion_commands','SELECT'])).rows[0].ok,false)
   assert.equal((await db.query<{ok:boolean}>('select has_function_privilege($1,$2,$3) ok',[role,'companion_next_command(uuid)','EXECUTE'])).rows[0].ok,false)
  }
 }finally{await db.close()}
})


test('presence monitoring arms on a fresh heartbeat, dedupes transitions, honors stop grace and claims pushes once',async()=>{
 const db=await setup(),pc='90000000-0000-4000-8000-000000000001',other='90000000-0000-4000-8000-000000000002'
 try{
  await db.query('insert into companion_clients(id,family_id,child_id,last_seen_at,name) values($1,$2,$3,now()-interval \'20 minutes\',$4),($5,$2,$3,now(),$6)',[pc,F,C,'Grey PC',other,'Revoked PC'])
  await db.query('update companion_clients set revoked_at=now(),last_seen_at=now()-interval \'20 minutes\' where id=$1',[other])
  const save=async(enabled:boolean)=>db.query('select companion_presence_settings_save($1,$2,$3,$4)',[F,C,P,enabled])
  const scan=async()=>db.query('select companion_presence_scan()')
  const count=async(kind:string)=> (await db.query<{n:number}>('select count(*)::int n from companion_presence_events where child_id=$1 and kind=$2',[C,kind])).rows[0].n

  // A PC already stale before monitoring was enabled is not reported missing.
  await save(true)
  await scan()
  assert.equal(await count('checkin_missing'),0)
  assert.equal((await db.query('select 1 from companion_presence_state where client_id=$1',[pc])).rows.length,0)
  assert.equal((await db.query('select 1 from companion_presence_state where client_id=$1',[other])).rows.length,0)
  assert.equal((await db.query('select 1 from companion_presence_events where client_id=$1',[other])).rows.length,0)
  // The first post-enable heartbeat only arms online tracking.
  await db.query('update companion_clients set last_seen_at=now() where id=$1',[pc])
  await scan()
  assert.equal((await db.query<{status:string}>('select status from companion_presence_state where client_id=$1',[pc])).rows[0].status,'online')
  assert.equal(await count('checkin_missing'),0)

  // A missing transition is one event even when the scanner runs repeatedly.
  await db.query("update companion_presence_settings set enabled_at=now()-interval '20 minutes' where child_id=$1",[C])
  await db.query("update companion_clients set last_seen_at=now()-interval '11 minutes' where id=$1",[pc])
  await scan();await scan()
  assert.equal(await count('checkin_missing'),1)
  assert.equal((await db.query<{status:string}>('select status from companion_presence_state where client_id=$1',[pc])).rows[0].status,'missing')

  // Recovery restores online state exactly once.
  await db.query('update companion_clients set last_seen_at=now() where id=$1',[pc])
  await scan();await scan()
  assert.equal(await count('checkin_restored'),1)
  assert.equal((await db.query<{status:string}>('select status from companion_presence_state where client_id=$1',[pc])).rows[0].status,'online')

  // An authorized Stop creates one event and ignores final in-flight check-ins for 60 seconds.
  await db.query('select companion_presence_stop($1)',[pc])
  await db.query('select companion_presence_stop($1)',[pc])
  assert.equal(await count('stop_requested'),1)
  const changed=(await db.query<{changed_at:string}>('select changed_at from companion_presence_state where client_id=$1',[pc])).rows[0].changed_at
  await db.query("update companion_clients set last_seen_at=$2::timestamptz+interval '30 seconds' where id=$1",[pc,changed])
  await scan()
  assert.equal((await db.query<{status:string}>('select status from companion_presence_state where client_id=$1',[pc])).rows[0].status,'stop_requested')
  await db.query("update companion_clients set last_seen_at=$2::timestamptz+interval '61 seconds' where id=$1",[pc,changed])
  await scan()
  assert.equal((await db.query<{status:string}>('select status from companion_presence_state where client_id=$1',[pc])).rows[0].status,'online')
  assert.equal(await count('checkin_restored'),2)

  // Claimed notices cannot be sent a second time; disabling and revocation stop future events.
  const first=(await db.query<{n:number}>('select count(*)::int n from companion_presence_claim()')).rows[0].n
  assert.ok(first >= 3)
  assert.equal((await db.query<{n:number}>('select count(*)::int n from companion_presence_claim()')).rows[0].n,0)
  await db.query(`insert into companion_presence_events(family_id,child_id,client_id,notify_parent_id,kind,reference_at,device_name)
   values($1,$2,$3,$4,'stop_requested',now()+interval '3 minutes','Grey PC')`,[F,C,pc,P2])
  assert.equal((await db.query<{n:number}>('select count(*)::int n from companion_presence_claim()')).rows[0].n,0)
  await save(false)
  await db.query('update companion_clients set last_seen_at=now()-interval \'20 minutes\' where id=$1',[pc])
  await scan()
  assert.equal(await count('checkin_missing'),1)

  for(const role of ['anon','authenticated']){
   for(const table of ['companion_presence_settings','companion_presence_state','companion_presence_events'])assert.equal((await db.query<{ok:boolean}>('select has_table_privilege($1,$2,$3) ok',[role,table,'SELECT'])).rows[0].ok,false)
   for(const signature of ['companion_presence_scan()','companion_presence_claim()','companion_presence_stop(uuid)','companion_presence_settings_save(uuid,uuid,uuid,boolean)'])assert.equal((await db.query<{ok:boolean}>('select has_function_privilege($1,$2,$3) ok',[role,signature,'EXECUTE'])).rows[0].ok,false)
  }
 }finally{await db.close()}
})


test('stop PIN remains server-only, scoped, throttled across clients and revoked devices cannot authorize',async()=>{
 const db=await setup(),id='90000000-0000-4000-8000-000000000001',second='90000000-0000-4000-8000-000000000002'
 try{
  await db.query('insert into companion_clients(id,family_id,child_id) values($1,$3,$4),($2,$3,$4)',[id,second,F,C])
  const verify=async(client:string,pin:string)=>(await db.query<{r:string}>('select companion_verify_stop($1,$2) r',[client,pin])).rows[0].r
  assert.equal(await verify(id,''),'allowed')
  await assert.rejects(db.query('select companion_set_stop_pin($1,$2,$3,$4)',[F,C,C,'1234']))
  await db.query('select companion_set_stop_pin($1,$2,$3,$4)',[F,C,P,'1234'])
  const stored=(await db.query<{stop_pin:null;stop_pin_hash:string}>('select stop_pin,stop_pin_hash from companion_limits')).rows[0]
  assert.equal(stored.stop_pin,null);assert.notEqual(stored.stop_pin_hash,'1234')
  for(let i=0;i<5;i++)assert.equal(await verify(i%2?id:second,'0000'),'wrong_pin')
  assert.equal(await verify(id,'1234'),'throttled')
  await db.exec("update companion_stop_attempts set window_started=now()-interval '16 minutes'")
  assert.equal(await verify(id,'1234'),'allowed')
  await db.query('update companion_clients set revoked_at=now() where id=$1',[id])
  await assert.rejects(verify(id,'1234'))
  await db.query('select companion_set_stop_pin($1,$2,$3,$4)',[F,C,P,null])
  assert.equal(await verify(second,''),'allowed')
  await db.query('update companion_limits set stop_pin=$1 where child_id=$2',['4321',C])
  assert.equal((await db.query<{stop_pin:null}>('select stop_pin from companion_limits')).rows[0].stop_pin,null)
  assert.equal(await verify(second,'4321'),'allowed')
  await db.exec('set role anon')
  await assert.rejects(db.query('select * from public_profiles'))
  await assert.rejects(db.query('select cleanup_old_pin_attempts()'))
  await assert.rejects(db.query('select * from companion_stop_attempts'))
  await assert.rejects(db.query('select companion_verify_stop($1,$2)',[second,'']))
 }finally{await db.close()}
})
