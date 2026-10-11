import type { SupportStatus } from '@/registry/types'
import { cn } from '@/lib/utils'

const STYLE: Record<SupportStatus | 'unavailable', { label: string; className: string }> = {
  stable: { label: 'Supported', className: 'border-[#176b36] bg-transparent text-[#176b36]' },
  limited: { label: 'With limits', className: 'border-[#b57900] bg-[#fff8e7] text-[#5f4300] dark:bg-[#2a220c] dark:text-[#e2b657]' },
  experimental: { label: 'Experimental', className: 'border-[#999] bg-[#f7f7f7] text-[#444] dark:bg-[#1c1c1c] dark:text-[#ccc]' },
  unavailable: { label: 'Unavailable here', className: 'border-border bg-transparent text-muted-foreground' },
}

export function StatusBadge({ status, className }: { status: SupportStatus | 'unavailable'; className?: string }) {
  const s = STYLE[status]
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-[3px] border px-1.5 py-0.5 text-[11px] font-bold', s.className, className)}>
      {s.label}
    </span>
  )
}
