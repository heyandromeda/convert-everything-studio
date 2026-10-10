import type { SupportStatus } from '@/registry/types'
import { cn } from '@/lib/utils'

const STYLE: Record<SupportStatus | 'unavailable', { label: string; className: string }> = {
  stable: { label: 'Supported', className: 'bg-success/12 text-success ring-success/25' },
  limited: { label: 'With limits', className: 'bg-warning/12 text-warning ring-warning/25' },
  experimental: { label: 'Experimental', className: 'bg-chart-4/10 text-[oklch(0.75_0.12_300)] ring-[oklch(0.75_0.12_300)]/25' },
  unavailable: { label: 'Unavailable here', className: 'bg-muted text-muted-foreground ring-border' },
}

export function StatusBadge({ status, className }: { status: SupportStatus | 'unavailable'; className?: string }) {
  const s = STYLE[status]
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', s.className, className)}>
      {s.label}
    </span>
  )
}
