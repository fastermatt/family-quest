const PUBLIC_PATHS = new Set(['/', '/login','/family-login','/child-login','/family/setup','/setup-pin','/api/setup-pin','/api/logout','/api/report-problem','/api/generate-task-instances','/api/family-members','/api/set-child-token','/api/pin-login','/api/active-profile'])
// These handlers/layouts already validate identity. Cookie presence never grants a role.
export function middlewareAccess(path: string, cookies: { name: string; value: string }[]): 'pass' | 'authenticate' | 'deny' {
  if (PUBLIC_PATHS.has(path) || path.startsWith('/auth/') || path.startsWith('/api/join/') || path.startsWith('/api/cron/')) return 'pass'
  if (cookies.some(c => c.name === 'profile_token' && !!c.value)) return 'pass'
  if (cookies.some(c => /^sb-.+-auth-token(?:\.\d+)?$/.test(c.name) && !!c.value)) return 'authenticate'
  return 'deny'
}
