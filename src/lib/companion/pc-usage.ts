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
