import { STATUS_LABEL, type JobStatus } from '@/features/queue/job-state'
import { cn } from '@/lib/utils'

/** Shows a real percentage only when the engine reports one; otherwise an indeterminate bar. */
export function ConversionProgress({ status, progress, message }: { status: JobStatus; progress: number | null; message?: string }) {
  const determinate = progress !== null && status === 'processing'
  const pct = determinate ? Math.round(progress * 100) : null
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="truncate font-medium">{message ?? STATUS_LABEL[status]}</span>
        {pct !== null && <span className="font-mono tabular-nums text-muted-foreground">{pct}%</span>}
      </div>
      <div
        className="relative h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Conversion progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
      >
        {determinate ? (
          <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
        ) : (
          <div className={cn('absolute inset-y-0 w-2/5 rounded-full bg-brand/80', 'animate-indeterminate')} />
        )}
      </div>
    </div>
  )
}
