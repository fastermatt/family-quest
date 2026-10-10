import { Camera, Check, CheckCheck, Clock, MinusCircle, NotebookPen, RotateCcw, Video, X } from 'lucide-react'
import type { ProofType } from '@/lib/proof'

export function ProofIcon({ type, className = 'h-5 w-5' }: { type: ProofType; className?: string }) {
  if (type === 'photo') return <Camera className={className} aria-hidden />
  if (type === 'imessage_video') return <Video className={className} aria-hidden />
  if (type === 'written') return <NotebookPen className={className} aria-hidden />
  return <CheckCheck className={className} aria-hidden />
}

export const PROOF_SHORT: Record<ProofType, string> = {
  photo: 'Photo',
  written: 'Written answer',
  imessage_video: 'Video by text',
  check: 'Parent confirms',
}

const STATUS = {
  pending: { label: 'Not done', color: 'var(--ink-3)', Icon: null },
  late: { label: 'Late', color: 'var(--redo)', Icon: Clock },
  submitted: { label: 'Waiting for review', color: 'var(--wait)', Icon: Clock },
  shown: { label: 'Shown', color: 'var(--ok)', Icon: Check },
  approved: { label: 'Done', color: 'var(--ok)', Icon: Check },
  rejected: { label: 'Sent back', color: 'var(--redo)', Icon: RotateCcw },
  missed: { label: 'Missed', color: 'var(--miss)', Icon: X },
  excused: { label: 'Excused', color: 'var(--ink-3)', Icon: MinusCircle },
} as const

export type StatusKey = keyof typeof STATUS

export function StatusPill({ status, label }: { status: StatusKey; label?: string }) {
  const s = STATUS[status]
  const Icon = s.Icon
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: s.color }}>
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {label ?? s.label}
    </span>
  )
}
