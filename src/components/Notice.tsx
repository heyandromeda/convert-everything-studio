import type { ReactNode } from 'react'
import { AlertTriangleIcon, InfoIcon, OctagonAlertIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'info' | 'warning' | 'error'

const TONES: Record<Tone, { icon: typeof InfoIcon; className: string }> = {
  info: { icon: InfoIcon, className: 'border-l-[3px] border-[#999] bg-[#f7f7f7] text-foreground dark:bg-[#1c1c1c] [&_svg]:text-muted-foreground' },
  warning: { icon: AlertTriangleIcon, className: 'border-l-[3px] border-[#b57900] bg-[#fff8e7] text-[#5f4300] dark:bg-[#2a220c] dark:text-[#e2b657] [&_svg]:text-[#b57900]' },
  error: { icon: OctagonAlertIcon, className: 'border-l-[3px] border-[#a12626] bg-[#ffe0e0] text-[#7a1f1f] dark:bg-[#2a1212] dark:text-[#ffb4b4] [&_svg]:text-[#a12626]' },
}

export function Notice({ tone = 'info', title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const { icon: Icon, className: toneClass } = TONES[tone]
  return (
    <div className={cn('flex gap-2.5 px-3 py-2.5 text-[0.9rem] leading-snug', toneClass, className)} role={tone === 'error' ? 'alert' : undefined}>
      <Icon className="mt-px size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-muted-foreground [&_strong]:text-foreground">{children}</div>}
      </div>
    </div>
  )
}
