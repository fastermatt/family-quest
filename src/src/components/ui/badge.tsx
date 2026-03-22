import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full text-xs font-semibold px-2.5 py-1',
  {
    variants: {
      variant: {
        xp: 'bg-gradient-to-r from-teal-600 to-teal-400 text-white',
        streak: 'bg-gradient-to-r from-orange-600 to-orange-400 text-white animate-streak',
        level: 'bg-purple-500/20 border border-purple-400/50 text-purple-300',
        pending: 'bg-yellow-500/20 border border-yellow-400/50 text-yellow-300',
        approved: 'bg-green-500/20 border border-green-400/50 text-green-300',
        rejected: 'bg-red-500/20 border border-red-400/50 text-red-300',
        submitted: 'bg-blue-500/20 border border-blue-400/50 text-blue-300',
      },
    },
    defaultVariants: {
      variant: 'xp',
    },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
