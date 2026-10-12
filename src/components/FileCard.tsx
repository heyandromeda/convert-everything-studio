import { memo, useMemo, useState } from 'react'
import { CopyCheckIcon, Loader2Icon, RotateCwIcon, SlidersHorizontalIcon, SquareIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { isActive, isPending, STATUS_LABEL } from '@/features/queue/job-state'
import { applyToCompatible, cancel, convert, removeItem, setConversion, setOptions } from '@/features/queue/runner'
import type { QueueItem } from '@/features/queue/store'
import { useQueue } from '@/features/queue/store'
import { useArmed } from '@/hooks/use-armed'
import { getCapabilities } from '@/lib/capabilities'
import { describeDetection } from '@/lib/detect'
import { formatBytes, formatDuration } from '@/lib/files'
import { cn } from '@/lib/utils'
import { getConversion, unsupportedNotesFor } from '@/registry'
import { formatLabel, getFormat } from '@/registry/formats'
import { ConversionOptions } from './ConversionOptions'
import { ConversionProgress } from './ConversionProgress'
import { FormatIcon } from './FormatIcon'
import { FormatPicker } from './FormatPicker'
import { Notice } from './Notice'
import { ResultRow } from './ResultRow'
import { SourcePreview } from './SourcePreview'
import { ArchiveEntryPicker } from './ArchiveEntryPicker'

function metaLine(item: QueueItem): string[] {
  if (item.sources) return [formatBytes(item.sources.reduce((s, x) => s + x.file.size, 0)) + ' total']
  const m = item.detected?.metadata
  const parts: string[] = [formatBytes(item.file.size)]
  if (m?.image?.width && m.image.height) parts.push(`${m.image.width}×${m.image.height}`)
  if (m?.image?.animated) parts.push('animated')
  if (m?.media?.width && m.media.height) parts.push(`${m.media.width}×${m.media.height}`)
  if (m?.media?.duration !== undefined) parts.push(formatDuration(m.media.duration))
  if (m?.document?.pageCount) parts.push(`${m.document.pageCount} page${m.document.pageCount === 1 ? '' : 's'}`)
  if (m?.document?.slideCount) parts.push(`${m.document.slideCount} slide${m.document.slideCount === 1 ? '' : 's'}`)
  if (m?.sheet?.sheetNames?.length) parts.push(`${m.sheet.sheetNames.length} sheet${m.sheet.sheetNames.length === 1 ? '' : 's'}`)
  if (m?.sheet?.rowCount) parts.push(`${m.sheet.rowCount.toLocaleString()} rows`)
  const atLeast = m?.archive?.entryCountIsMinimum ? 'at least ' : ''
  if (m?.archive?.entryCount !== undefined) parts.push(`${m.archive.entryCount.toLocaleString()}${atLeast ? '+' : ''} file${m.archive.entryCount === 1 ? '' : 's'}`)
  if (m?.archive?.totalSize) parts.push(`${atLeast}${formatBytes(m.archive.totalSize)} unpacked`)
  return parts
}

function StopButton({ onStop }: { onStop: () => void }) {
  const armed = useArmed()
  return (
    <Button variant="outline" size="touch" className="shrink-0 scroll-mb-60" onClick={onStop} disabled={!armed}>
      <SquareIcon className="size-3.5" /> Stop
    </Button>
  )
}

export const FileCard = memo(function FileCard({ id }: { id: string }) {
  const item = useQueue((s) => s.items.find((i) => i.id === id))
  const [showOptions, setShowOptions] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const caps = getCapabilities()
  const def = getConversion(item?.conversionId)
  const detectedInput = item?.detected
  const options = item?.options
  const warnings = useMemo(
    () => (detectedInput && options && def?.warnings ? def.warnings(detectedInput, options, caps) : []),
    [detectedInput, options, def, caps],
  )
  if (!item) return null

  const { detected, status } = item
  const fmt = getFormat(detected?.formatId)
  const busy = isPending(status)
  const img = detected?.metadata.image
  const privacyFlags = [img?.hasGps && 'GPS location', img?.hasExif && !img?.hasGps && 'EXIF data', img?.cameraModel && `camera (${img.cameraModel})`].filter(Boolean) as string[]

  return (
    <article
      className={cn(
        'scroll-mb-60 rounded-[4px] border bg-card p-4 transition-colors',
        status === 'failed' && 'border-destructive/40',
        status === 'completed' && 'border-success/30',
      )}
      data-testid="file-card"
      data-item-id={id}
      data-status={status}
      aria-label={item.file.name}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          disabled={!detected?.formatId || !!item.sources}
          aria-label={`Preview ${item.file.name}`}
          className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[4px] border bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#555]"
        >
          {item.thumbUrl ? (
            <img src={item.thumbUrl} alt="" className="checkerboard size-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
          ) : (
            <FormatIcon formatId={item.sources ? 'files' : detected?.formatId} className="size-6 text-muted-foreground" />
          )}
        </button>
        {detected?.formatId && !item.sources && <SourcePreview item={item} open={previewOpen} onOpenChange={setPreviewOpen} />}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-[15px] leading-tight font-semibold" title={item.label ?? item.file.name}>{item.label ?? item.file.name}</p>
          {item.sources && (
            <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{item.sources.map((s) => s.file.name).join(', ')}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
            {status === 'detecting' ? (
              <span className="inline-flex items-center gap-1.5"><Loader2Icon className="size-3.5 animate-spin" /> Inspecting…</span>
            ) : (
              <>
                <span
                  className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-secondary-foreground uppercase"
                  title={detected ? describeDetection(detected) : undefined}
                  data-testid="detected-format"
                >
                  {fmt?.label ?? 'Unknown'}
                </span>
                {metaLine(item).map((p, i) => (
                  <span key={i} className="font-mono tabular-nums">{p}</span>
                ))}
              </>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon-touch" className="-mt-1 -mr-1 shrink-0 text-muted-foreground" onClick={() => removeItem(id)} aria-label={`Remove ${item.file.name}`}>
          <XIcon />
        </Button>
      </div>

      {detected?.mismatch && (
        <Notice tone="warning" className="mt-3" title="File extension doesn't match the contents">
          Named as <strong>{formatLabel(detected.mismatch.claimed)}</strong> but the data is <strong>{formatLabel(detected.mismatch.actual)}</strong>. It will be treated as {formatLabel(detected.mismatch.actual)}.
        </Notice>
      )}
      {privacyFlags.length > 0 && status !== 'unsupported' && (
        <Notice tone="info" className="mt-3">
          Contains {privacyFlags.join(', ')}. Converting removes it; "Remove metadata" does so without re-compressing.
        </Notice>
      )}
      {detected?.metadata.notes?.map((n) => (
        <Notice key={n} tone="info" className="mt-3">{n}</Notice>
      ))}

      {status === 'unsupported' && item.file.size > 0 && (
        <div className="mt-3 space-y-2">
          <Notice tone="warning" title={detected?.formatId ? `No conversions available for ${fmt?.label ?? 'this format'} yet` : 'This file type was not recognised'}>
            {detected?.formatId
              ? 'This app only offers conversions it can genuinely perform in your browser.'
              : 'The contents did not match any supported format, so nothing is offered rather than guessing.'}
          </Notice>
          {unsupportedNotesFor(detected?.formatId ?? null).map((u) => (
            <Notice key={u.to} tone="info"><strong>{u.to}:</strong> {u.reason}</Notice>
          ))}
        </div>
      )}

      {detected && status !== 'detecting' && status !== 'unsupported' && (
        <div className="mt-3.5 space-y-3">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <FormatPicker input={detected} fileSize={item.file.size} value={item.conversionId} onChange={(c) => setConversion(id, c)} disabled={busy} />
            </div>
            {def?.options?.length ? (
              <Button
                variant={showOptions ? 'secondary' : 'outline'}
                className="size-11 shrink-0 rounded-[4px]"
                onClick={() => setShowOptions((s) => !s)}
                aria-expanded={showOptions}
                aria-label="Conversion settings"
              >
                <SlidersHorizontalIcon />
              </Button>
            ) : null}
          </div>

          {item.conversionId?.startsWith('archive-extract') && detected.metadata.archive?.entries && detected.metadata.archive.entries.length > 1 && (
            <ArchiveEntryPicker
              entries={detected.metadata.archive.entries}
              total={detected.metadata.archive.entryCount}
              totalIsMinimum={detected.metadata.archive.entryCountIsMinimum}
              selected={Array.isArray(item.options.entries) ? item.options.entries : []}
              onChange={(paths) => setOptions(id, { entries: paths })}
              disabled={busy}
            />
          )}

          {showOptions && def?.options && (
            <div className="space-y-4 border-t border-border pt-4">
              <ConversionOptions fields={def.options} values={item.options} input={detected} onChange={(p) => setOptions(id, p)} disabled={busy} />
              {useQueue.getState().items.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-muted-foreground"
                  onClick={() => {
                    const n = applyToCompatible(id)
                    toast(n ? `Applied to ${n} other file${n === 1 ? '' : 's'}` : 'No other files support this exact conversion')
                  }}
                >
                  <CopyCheckIcon /> Apply to all compatible files
                </Button>
              )}
            </div>
          )}

          {warnings.map((w) => (
            <Notice key={w} tone="warning">{w}</Notice>
          ))}

          {isActive(status) || status === 'queued' ? (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                {status === 'queued' ? (
                  <p className="text-[13px] text-muted-foreground">Queued — waiting for other conversions</p>
                ) : (
                  <ConversionProgress status={status} progress={item.progress} message={item.progressMessage} />
                )}
              </div>
              <StopButton onStop={() => cancel(id)} />
            </div>
          ) : null}

          {status === 'failed' && item.error && (
            <div className="space-y-2">
              <Notice tone="error" title={item.error.title}>
                {item.error.detail}
                {item.error.suggestion && <span className="mt-1 block">{item.error.suggestion}</span>}
              </Notice>
              <Button variant="secondary" size="touch" onClick={() => convert([id])}>
                <RotateCwIcon /> Retry
              </Button>
            </div>
          )}
          {status === 'canceled' && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] text-muted-foreground">{STATUS_LABEL.canceled}. Nothing was saved.</p>
              <Button variant="secondary" size="touch" onClick={() => convert([id])}>
                <RotateCwIcon /> Convert again
              </Button>
            </div>
          )}

          {status === 'completed' && (
            <div className="space-y-2" data-testid="results">
              {item.warnings.map((w) => (
                <Notice key={w} tone="info">{w}</Notice>
              ))}
              {item.results.length > 1 && (
                <p className="text-[13px] font-medium text-muted-foreground">{item.results.length} files produced</p>
              )}
              <div className="space-y-2">
                {item.results.slice(0, 60).map((r) => (
                  <ResultRow key={r.url} item={item} result={r} showDelta={item.results.length === 1 && !item.sources} />
                ))}
              </div>
              {item.results.length > 60 && (
                <p className="text-[13px] text-muted-foreground">+{item.results.length - 60} more — use “Download all as ZIP”.</p>
              )}
            </div>
          )}

          {status === 'ready' && useQueue.getState().items.length > 1 && (
            <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => convert([id])}>
              Convert just this file
            </Button>
          )}
        </div>
      )}
    </article>
  )
})
