import type { PushPayload } from '../push-copy'
import { UUID } from '../family-controls/policy'

export const PRESENCE_THRESHOLD_MINUTES = 10
export const PRESENCE_DELIVERY_NOTE = 'Monitoring starts after the next fresh PC check-in. Push is best effort and requires browser permission. Notices remain here for 30 days. Push goes to the parent who most recently enabled notices.'

export function cleanPresenceSettingsRequest(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid presence settings.')
  const b = raw as Record<string, unknown>
  if (Object.keys(b).some(key => !['childId', 'enabled'].includes(key)) || !UUID.test(String(b.childId)) || typeof b.enabled !== 'boolean') {
    throw new Error('Choose a child and whether PC presence notices are enabled.')
  }
  return { childId: String(b.childId), enabled: b.enabled }
}

export interface PresenceEvent {
  id: string
  family_id: string
  child_id: string
  notify_parent_id: string
  kind: 'stop_requested' | 'checkin_missing' | 'checkin_restored'
  occurred_at: string
  device_name: string | null
}

export function presencePushPayload(event: PresenceEvent): PushPayload {
  const rawName = typeof event.device_name === 'string' ? event.device_name : ''
  const device = rawName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'The linked PC'
  const base = { url: `/pc?childId=${encodeURIComponent(event.child_id)}`, tag: `pc-presence-${event.id}` }
  if (event.kind === 'stop_requested') return {
    ...base,
    title: 'PC stop requested',
    body: `${device} requested a stop. This records the request; it does not confirm the app exited.`,
  }
  if (event.kind === 'checkin_missing') return {
    ...base,
    title: 'PC check-in missed',
    body: `${device} has not checked in for 10 minutes. It may be asleep, powered off, or offline.`,
  }
  return {
    ...base,
    title: 'PC contact restored',
    body: `${device} has resumed checking in with ChoreZap.`,
  }
}

export function isPresenceEvent(raw: unknown): raw is PresenceEvent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const e = raw as Record<string, unknown>
  return UUID.test(String(e.id)) && UUID.test(String(e.family_id)) && UUID.test(String(e.child_id)) && UUID.test(String(e.notify_parent_id)) &&
    ['stop_requested', 'checkin_missing', 'checkin_restored'].includes(String(e.kind)) &&
    typeof e.occurred_at === 'string' && Number.isFinite(Date.parse(e.occurred_at)) &&
    (e.device_name === null || typeof e.device_name === 'string')
}

