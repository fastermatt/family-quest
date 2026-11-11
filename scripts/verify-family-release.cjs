// Read-only operator smoke check. Keep tokens in this process; never print responses/errors.
const fs = require('node:fs');
const { parseEnv } = require('node:util');
const assert = require('node:assert/strict');
async function main() {
  const base = process.argv[2];
  assert(base && (base.startsWith('https://') || /^http:\/\/127\.0\.0\.1:\d+$/.test(base)));
  const env = parseEnv(fs.readFileSync(process.argv[3], 'utf8'));
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const family = '7059b2ec-bfef-4a3f-9d29-5a44be5c2eb9';
  const child = '48c5ec41-91db-4399-b1ea-6498de40a67a';
  const p = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?family_id=eq.${family}&select=id,role,access_token`, {headers});
  assert.equal(p.status, 200, 'operator lookup');
  const profiles = await p.json();
  const parent = profiles.find(p => p.role === 'parent');
  const kid = profiles.find(p => p.id === child);
  assert(parent?.access_token && kid?.access_token, 'scoped profile lookup');
  async function get(path, profile) {
    const r = await fetch(base + path, { headers: profile ? {Cookie: `profile_token=${profile.access_token}`} : {}, redirect: 'manual' });
    return { status: r.status, data: await r.json().catch(() => null) };
  }
  assert.equal((await get('/api/parent/family-controls')).status,401,'unauthenticated parent denied');
  assert.equal((await get('/api/parent/family-controls',kid)).status,403,'child parent access denied');
  const familyResult = await get(`/api/parent/family-controls?childId=${child}`,parent);
  assert.equal(familyResult.status,200,'parent overview');
  const o = familyResult.data.overview;
  assert.equal(o.money.debtRemainingCents,8000,'opening IOU');
  assert.equal(o.money.entries.filter(e=>e.kind==='opening_iou').length,1,'single opening IOU');
  assert.equal(o.settings.enabled,false,'rules held for Windows test');
  const pc = await get(`/api/parent/companion?childId=${child}`,parent);
  assert.equal(pc.status,200,'PC overview');
  assert.equal(pc.data.settings.gaming_minutes,120,'legacy allowance');
  assert.equal(pc.data.settings.mode,'warn','reminder pilot');
  assert(!JSON.stringify(pc.data).includes('stop_pin_hash'),'no PIN hash in parent response');
  assert(!Object.hasOwn(pc.data.settings,'stop_pin'),'no plaintext PIN');
  const kidResult = await get('/api/child/family-controls',kid);
  assert.equal(kidResult.status,200,'child overview');
  const stop = await fetch(base+'/api/companion/v2/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"pin":""}'});
  assert([401,426].includes(stop.status),'unlinked stop denied / LAN HTTP rejected');
  const anon = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/public_profiles?select=id&limit=1`, {headers:{apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:`Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`}});
  assert([401,403].includes(anon.status),'profile view closed to anonymous role');
  console.log(JSON.stringify({base,checks:'passed',debtDollars:o.money.debtRemainingCents/100,settings:o.settings,devices:pc.data.clients.map(c=>({version:c.version,lastSeen:c.last_seen_at}))},null,2));
}
main().catch(e=>{console.error('Read-only release smoke failed:',e.code==='ERR_ASSERTION'?e.message:'request or configuration failure');process.exit(1)});
