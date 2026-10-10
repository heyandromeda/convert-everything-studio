import { useMemo, useState } from 'react'
import { CheckIcon, ChevronDownIcon, InfoIcon } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/utils'
import { conversionsFor, unsupportedNotesFor, type ConversionOption } from '@/registry'
import { getFormat } from '@/registry/formats'
import type { DetectedFile } from '@/registry/types'
import { CATEGORY_LABEL, FormatIcon } from './FormatIcon'
import { StatusBadge } from './StatusBadge'

interface Props {
  input: DetectedFile
  fileSize: number
  value: string | null
  onChange: (conversionId: string) => void
  disabled?: boolean
}

export function FormatPicker({ input, fileSize, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const options = useMemo(() => conversionsFor(input, getCapabilities(), fileSize), [input, fileSize])
  const unsupported = useMemo(() => unsupportedNotesFor(input.formatId), [input.formatId])
  const current = options.find((o) => o.def.id === value)

  const groups = useMemo(() => {
    const map = new Map<string, ConversionOption[]>()
    for (const o of options) {
      const cat = getFormat(o.target)?.category ?? 'other'
      map.set(cat, [...(map.get(cat) ?? []), o])
    }
    return [...map.entries()]
  }, [options])

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-testid="format-picker"
        aria-haspopup="dialog"
        className="flex h-12 w-full min-w-0 items-center gap-3 rounded-xl border border-input bg-background/60 px-3.5 text-left transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
      >
        <span className="shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">To</span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{current ? current.label : 'Choose format'}</span>
        {current && current.def.status !== 'stable' && <StatusBadge status={current.def.status} className="hidden min-[380px]:inline-flex" />}
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[85dvh] w-full max-w-xl rounded-t-3xl px-0 pb-safe sm:bottom-4 sm:rounded-3xl sm:border">
          <SheetHeader className="px-5 pt-5 pb-1">
            <SheetTitle>Convert {getFormat(input.formatId)?.label ?? 'file'} to…</SheetTitle>
            <SheetDescription>Only conversions that genuinely work in this browser are listed.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4" role="listbox" aria-label="Output formats">
            {groups.map(([cat, opts]) => (
              <div key={cat} className="mb-3">
                <div className="px-2 pt-2 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL]}
                </div>
                <div className="space-y-1">
                  {opts.map((o) => {
                    const selected = o.def.id === value
                    const unavailable = !o.availability.available
                    return (
                      <button
                        key={o.def.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        aria-disabled={unavailable}
                        data-testid={`target-${o.def.id}`}
                        onClick={() => {
                          if (unavailable) return
                          onChange(o.def.id)
                          setOpen(false)
                        }}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
                          selected ? 'bg-brand/10 ring-1 ring-brand/30' : 'hover:bg-accent',
                          unavailable && 'cursor-not-allowed opacity-60 hover:bg-transparent',
                        )}
                      >
                        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                          <FormatIcon formatId={o.target} className="size-[18px]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[15px] font-semibold">{o.label}</span>
                            <StatusBadge status={unavailable ? 'unavailable' : o.def.status} />
                          </div>
                          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                            {unavailable ? o.availability.reason : (o.def.description ?? describe(o))}
                          </p>
                        </div>
                        {selected && <CheckIcon className="mt-2 size-5 shrink-0 text-brand" aria-label="Selected" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {unsupported.length > 0 && (
              <div className="mx-1 mt-2 rounded-2xl bg-muted/50 p-3.5">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <InfoIcon className="size-3.5" aria-hidden /> Not supported
                </div>
                <ul className="space-y-2 text-[13px] leading-snug">
                  {unsupported.map((u) => (
                    <li key={u.to}>
                      <span className="font-medium">{u.to}:</span> <span className="text-muted-foreground">{u.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function describe(o: ConversionOption): string {
  const parts: string[] = []
  if (o.def.lossy === true) parts.push('Lossy')
  else if (o.def.lossy === false) parts.push('Lossless')
  else parts.push('Lossy or lossless')
  if (o.def.formatting === 'partial') parts.push('formatting partly preserved')
  if (o.def.formatting === 'none') parts.push('formatting not preserved')
  if (o.def.cost === 'heavy') parts.push('slow on phones')
  const first = o.def.limitations[0]
  return [parts.join(' · '), first].filter(Boolean).join('. ')
}
