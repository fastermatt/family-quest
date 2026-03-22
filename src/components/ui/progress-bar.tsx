import { cn } from '@/lib/utils'

export function ProgressBar({
  value,
  max = 100,
  className,
}: {
  value: number
  max?: number
  className?: string
}) {
  const pct = Math.min((value / max) * 100, 100)

  return (
    <div className={cn('h-2 bg-white/10 rounded-full overflow-hidden', className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-teal-600 to-cyan-400 transition-all duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
