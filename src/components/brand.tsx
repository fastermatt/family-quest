/* eslint-disable @next/next/no-img-element */

/** The ChoreZap mark: Matt's C⚡Z app icon with the wordmark. */
export function Brand({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  if (size === 'lg') {
    return (
      <div className="flex flex-col items-center gap-2">
        <img src="/icons/icon-192.png" alt="" width={96} height={96} className="h-24 w-24" />
        <Wordmark className="text-[28px]" />
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <img src="/icons/icon-96.png" alt="" width={32} height={32} className="h-8 w-8" />
      <Wordmark className="text-[19px]" />
    </div>
  )
}

function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-manrope font-extrabold tracking-tight ${className}`} aria-label="ChoreZap">
      <span aria-hidden>Chore</span>
      <span aria-hidden style={{ color: '#FAC922' }}>Zap</span>
    </span>
  )
}
