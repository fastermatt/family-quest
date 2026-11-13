/** Join uploaded foreground time to the server's effective classifications. */
export function summarizePCUsage(
  apps: { executable: string; seconds: number }[],
  rules: { executable: string; label: string; category: string }[],
) {
  const ruleByExecutable = new Map(rules.map(rule => [rule.executable.toLowerCase(), rule]))
  const games = apps.flatMap(app => {
    const rule = ruleByExecutable.get(app.executable.toLowerCase())
    return rule?.category === 'game' ? [{ executable: app.executable, label: rule.label || app.executable, seconds: app.seconds }] : []
  })
  return {
    gamingSeconds: games.reduce((sum, app) => sum + app.seconds, 0),
    topGame: games.reduce<(typeof games)[number] | null>((best, app) => !best || app.seconds > best.seconds ? app : best, null),
  }
}

// A check-in can succeed without any activity reaching the server. Show the
// age of the usage separately so an old total is not mistaken for today's total.
export function pcUsageCoverage(lastUpload: string | null | undefined, lastSeen: string | null | undefined, now: number) {
  const threshold = 10 * 60_000
  const recent = (value: string | null | undefined) => !!value && now - Date.parse(value) < threshold
  if (!recent(lastSeen)) return { current: false, message: 'The PC has not checked in recently. Activity may be missing.' }
  if (!recent(lastUpload)) return { current: false, message: 'The PC checked in recently. Activity uploads are still behind.' }
  return { current: true, message: null }
}
