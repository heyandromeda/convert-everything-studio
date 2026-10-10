import type { ReactNode } from 'react'
import { AlertTriangleIcon, InfoIcon, OctagonAlertIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'info' | 'warning' | 'error'

const TONES: Record<Tone, { icon: typeof InfoIcon; className: string }> = {
  info: { icon: InfoIcon, className: 'bg-muted/60 text-foreground [&_svg]:text-muted-foreground' },
  warning: { icon: AlertTriangleIcon, className: 'bg-warning/10 text-foreground [&_svg]:text-warning' },
  error: { icon: OctagonAlertIcon, className: 'bg-destructive/10 text-foreground [&_svg]:text-destructive' },
}

export function Notice({ tone = 'info', title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const { icon: Icon, className: toneClass } = TONES[tone]
  return (
    <div className={cn('flex gap-2.5 rounded-xl px-3 py-2.5 text-[13px] leading-snug', toneClass, className)} role={tone === 'error' ? 'alert' : undefined}>
      <Icon className="mt-px size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-muted-foreground [&_strong]:text-foreground">{children}</div>}
      </div>
    </div>
  )
}
