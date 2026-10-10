import { useMemo, useState } from 'react'
import { ArrowRightIcon, DownloadIcon, Loader2Icon, SquareIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { isPending } from '@/features/queue/job-state'
import { cancelAll, clearAll, convert } from '@/features/queue/runner'
import { useQueue } from '@/features/queue/store'
import { buildZip, triggerDownload } from '@/lib/download'
import { baseName, formatBytes, safeFilename } from '@/lib/files'

/** Sticky bottom bar: the primary action stays under the thumb on phones. */
export function BatchBar() {
  const items = useQueue((s) => s.items)
  const [zip, setZip] = useState<{ url: string; size: number; key: string } | null>(null)
  const [zipping, setZipping] = useState(false)

  const stats = useMemo(() => {
    const ready = items.filter((i) => ['ready', 'failed', 'canceled'].includes(i.status) && i.conversionId).length
    const pending = items.filter((i) => isPending(i.status)).length
    const completed = items.filter((i) => i.status === 'completed')
    const failed = items.filter((i) => i.status === 'failed').length
    const canceled = items.filter((i) => i.status === 'canceled').length
    const outputs = completed.flatMap((i) => i.results)
    const key = outputs.map((o) => o.url).join('|')
    return { ready, pending, completed: completed.length, failed, canceled, outputs, key }
  }, [items])

  if (!items.length) return null

  const zipCurrent = zip && zip.key === stats.key ? zip : null

  const makeZip = async () => {
    setZipping(true)
    try {
      if (zip) URL.revokeObjectURL(zip.url)
      const done = useQueue.getState().items.filter((i) => i.status === 'completed')
      // Multi-file results (PDF pages, extracted archives) go in a folder named after their source.
      const files = done.flatMap((i) =>
        i.results.map((r) => ({ blob: r.blob, name: r.path ?? r.name, folder: i.results.length > 1 ? safeFilename(baseName(i.file.name)) : undefined })),
      )
      const blob = await buildZip(files)
      const url = URL.createObjectURL(blob)
      setZip({ url, size: blob.size, key: stats.key })
      triggerDownload(url, `converted-${new Date().toISOString().slice(0, 10)}.zip`)
    } catch {
      toast.error('The ZIP could not be created. The results may be too large for this device; download them individually.')
    } finally {
      setZipping(false)
    }
  }

  const summary = [
    stats.completed && `${stats.completed} done`,
    stats.failed && `${stats.failed} failed`,
    stats.canceled && `${stats.canceled} canceled`,
    stats.pending && `${stats.pending} in progress`,
  ].filter(Boolean)

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 pb-safe backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 px-safe pt-3">
        <div className="flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground" aria-live="polite">
          <span>
            {items.length} file{items.length === 1 ? '' : 's'}
            {summary.length ? ` · ${summary.join(' · ')}` : ''}
          </span>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 hover:text-foreground" onClick={clearAll}>
            <Trash2Icon className="size-3.5" /> Clear all
          </button>
        </div>
        <div className="flex gap-2">
          {stats.pending > 0 ? (
            <Button size="touch-lg" variant="secondary" className="flex-1" onClick={cancelAll}>
              <SquareIcon className="size-4" /> Stop all
            </Button>
          ) : null}
          {stats.ready > 0 && (
            <Button size="touch-lg" className="flex-[2] bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => convert()} data-testid="convert-all">
              Convert {stats.ready > 1 ? `${stats.ready} files` : ''} <ArrowRightIcon />
            </Button>
          )}
          {stats.outputs.length > 1 && !stats.pending && (
            zipCurrent ? (
              <Button asChild size="touch-lg" variant="secondary" className="flex-1">
                <a href={zipCurrent.url} download={`converted-${new Date().toISOString().slice(0, 10)}.zip`}>
                  <DownloadIcon /> ZIP · {formatBytes(zipCurrent.size)}
                </a>
              </Button>
            ) : (
              <Button size="touch-lg" variant="secondary" className="flex-1" onClick={makeZip} disabled={zipping}>
                {zipping ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />} Download all (ZIP)
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
