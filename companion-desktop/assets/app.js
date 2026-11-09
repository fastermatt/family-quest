const el=id=>document.getElementById(id);
const duration=sec=>{sec=Math.max(0,Math.floor(sec||0));return sec>=3600?`${Math.floor(sec/3600)}h ${Math.floor(sec%3600/60)}m`:sec>=60?`${Math.floor(sec/60)}m ${sec%60}s`:`${sec}s`};
function render(s){
 renderCountdown(s.countdown);el('update').textContent=s.updateStatus||'Automatic updates · checks while running, applies next start';
 el('status').textContent=s.demo?'SAMPLE DATA · No collection or uploads':s.linked?(s.syncError?'Sync needs attention: '+s.syncError:'Linked · Tracking this Windows account'):(s.syncError||'Waiting for a parent to link this PC');
 el('enroll').hidden=s.linked||s.demo;el('code').textContent=s.claim;
 el('greeting').textContent=s.childName?`${s.childName}, here’s your day so far.`:'See what filled your day. Make room for what matters.';el('day').textContent=s.day+' · America/Denver';
 el('gaming').textContent=duration(s.groups.game);el('school').textContent=duration(s.groups.school);el('other').textContent=duration(s.groups.other);
 el('allowance').textContent=s.settings.paused?'Entertainment paused by parent':s.settings.gaming_minutes===null?'No shared gaming limit set':duration(Math.max(0,s.settings.gaming_minutes*60-s.groups.game))+' remaining of '+s.settings.gaming_minutes+' min';
 const total=s.groups.game+s.groups.school+s.groups.other;for(const [key,name]of [['game','gameBar'],['school','schoolBar'],['other','otherBar']])el(name).style.width=(total?s.groups[key]/total*100:0)+'%';
 el('action').hidden=!s.action;el('action').textContent=s.action;el('current').textContent=s.current?'Foreground: '+s.current:'Waiting for an observation';
 const list=el('apps');list.replaceChildren();for(const a of [...s.apps].sort((x,y)=>y.seconds-x.seconds)){
  const row=document.createElement('section');row.className='app';const info=document.createElement('div'),title=document.createElement('div'),sub=document.createElement('div'),bar=document.createElement('div'),fill=document.createElement('i'),right=document.createElement('div'),time=document.createElement('div'),remain=document.createElement('div');title.className='app-title';title.textContent=a.label;sub.className='app-sub';sub.textContent=a.category==='game'?'Gaming · '+a.executable:a.category==='school'?'School · always available':'Other / unclassified · '+a.executable;bar.className='bar';fill.style.width=(total?a.seconds/total*100:0)+'%';fill.style.background=a.category==='school'?'var(--school)':a.category==='game'?'var(--teal)':'#5b6880';bar.append(fill);info.append(title,sub,bar);time.className='app-time';time.textContent=duration(a.seconds);remain.className='app-remaining';remain.textContent=a.limited?duration(a.remaining)+' remaining':a.category==='game'?'No limit set':'';right.append(time,remain);row.append(info,right);list.append(row)
 }
 if(!s.apps.length){const p=document.createElement('p');p.textContent='No application time recorded yet. Use a game or browser for a few seconds.';list.append(p)}
 const uploaded=String(s.lastUpload||'').startsWith('0001')?'No activity uploaded yet':new Date(s.lastUpload).toLocaleTimeString();el('sync').textContent=`${uploaded} · ${s.pending} batches waiting · Uploads about every 5 minutes`;
 el('coverage').textContent=`Unobserved / transitions: ${duration(s.gaps)}. Browsing history, YouTube titles and automatic updates are not included yet.`;
 if(s.syncConflicts)el('coverage').textContent+=' '+s.syncConflicts+' overlapping batches preserved locally for review; some time may be absent from server totals.';
 el('mode').textContent=s.settings.mode==='close'?'Parent selected game closing after a 30-second warning. Requires a fresh synced policy; Windows enforcement must be tested.':'Limits currently show reminders only. Closing games is off.';
}
async function refresh(){try{const r=await fetch('/api/state');if(!r.ok)throw Error();render(await r.json())}catch{el('status').textContent='App stopped or unavailable. Reopen ChoreZap to resume tracking.'}}
el('exit').onclick=async()=>{if(!confirm('Stop tracking and syncing until you reopen ChoreZap?'))return;await fetch('/api/exit',{method:'POST'});el('status').textContent='ChoreZap stopped.'};refresh();setInterval(refresh,1000);
