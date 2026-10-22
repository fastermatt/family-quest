import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

// Pairing: the PC shows a 6-digit code, a parent types it in ChoreZap, the PC
// gets a long device token exactly once. Only hashes of secrets are stored.

export const PAIR_TTL_MS = 10 * 60 * 1000
export const MAX_PENDING_PAIRINGS = 20

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

export function newSecret(): string {
  return randomBytes(32).toString('base64url')
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

/** A parent types digits; allow spaces and dashes ("123 456"). */
export function cleanCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const d = input.replace(/[\s-]/g, '')
  return /^\d{6}$/.test(d) ? d : null
}

export type Inventory = {
  agentVersion: string
  hostname: string
  windows: { edition: string; displayVersion: string; build: string }
  runningAs: string
  accounts: Array<{ name: string; type: 'local' | 'microsoft' | 'unknown'; isAdmin: boolean; enabled: boolean }>
  browsers: string[]
  avast: boolean
  otherSecurity: string[]
}

const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) : '')
const strs = (v: unknown, n = 20) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, n) : [])

/** Keep only the fields we know, trimmed. Everything else the PC sends is dropped. */
export function cleanInventory(body: unknown): Inventory {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const w = (b.windows && typeof b.windows === 'object' ? b.windows : {}) as Record<string, unknown>
  return {
    agentVersion: str(b.agentVersion, 20),
    hostname: str(b.hostname),
    windows: { edition: str(w.edition), displayVersion: str(w.displayVersion, 20), build: str(w.build, 20) },
    runningAs: str(b.runningAs),
    accounts: (Array.isArray(b.accounts) ? b.accounts : []).slice(0, 10).map((x) => {
      const a = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
      return {
        name: str(a.name),
        type: a.type === 'local' || a.type === 'microsoft' ? (a.type as 'local' | 'microsoft') : ('unknown' as const),
        isAdmin: a.isAdmin === true,
        enabled: a.enabled !== false,
      }
    }),
    browsers: strs(b.browsers),
    avast: b.avast === true,
    otherSecurity: strs(b.otherSecurity),
  }
}
