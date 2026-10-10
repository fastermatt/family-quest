// Server only: never import this from a client component.
import webpush from 'web-push'
import type { adminClient } from './session'
import type { PushPayload } from './push-copy'

type Admin = ReturnType<typeof adminClient>

let configured: boolean | null = null
function configure(): boolean {
  if (configured !== null) return configured
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) {
    console.warn('push: VAPID env vars missing, notifications disabled')
    return (configured = false)
  }
  try {
    webpush.setVapidDetails(subject, pub, priv)
    configured = true
  } catch (e) {
    console.error('push: bad VAPID config', e)
    configured = false
  }
  return configured
}

/** Send to every subscription of these profiles. Never throws. Returns count delivered. */
export async function sendToProfiles(admin: Admin, profileIds: string[], payload: PushPayload): Promise<number> {
  try {
    if (!profileIds.length || !configure()) return 0
    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('profile_id', profileIds)
    if (error) {
      console.error('push: load subscriptions failed', error.message)
      return 0
    }
    const body = JSON.stringify(payload)
    const results = await Promise.all(
      (subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600 })
          return 'ok'
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode
          if (code === 404 || code === 410) return `dead:${s.id}`
          console.error('push: send failed', code ?? e)
          return 'err'
        }
      })
    )
    const dead = results.filter((r) => r.startsWith('dead:')).map((r) => r.slice(5))
    if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead)
    return results.filter((r) => r === 'ok').length
  } catch (e) {
    console.error('push: sendToProfiles failed', e)
    return 0
  }
}

export async function parentIds(admin: Admin, familyId: string): Promise<string[]> {
  const { data } = await admin.from('profiles').select('id').eq('family_id', familyId).eq('role', 'parent')
  return (data ?? []).map((p) => p.id as string)
}

/** Best-effort wrapper for request handlers: never throws, waits at most ~2.5s. */
export async function bestEffort(work: Promise<unknown>, ms = 2500): Promise<void> {
  try {
    await Promise.race([work.catch(() => undefined), new Promise((r) => setTimeout(r, ms))])
  } catch {}
}
