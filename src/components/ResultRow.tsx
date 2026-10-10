import { useState } from 'react'
import { DownloadIcon, EyeIcon, Share2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { QueueItem, ResultFile } from '@/features/queue/store'
import { getCapabilities } from '@/lib/capabilities'
import { shareFiles } from '@/lib/download'
import { describeSizeChange, formatBytes } from '@/lib/files'
import { cn } from '@/lib/utils'
import { formatLabel } from '@/registry/formats'
import { FilePreview } from './FilePreview'
import { FormatIcon } from './FormatIcon'

const THUMBABLE = new Set(['png', 'apng', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'ico', 'svg'])

export function ResultRow({ item, result, showDelta }: { item: QueueItem; result: ResultFile; showDelta: boolean }) {
  const [open, setOpen] = useState(false)
  const [compare, setCompare] = useState<'after' | 'before'>('after')
  const caps = getCapabilities()
  const isImage = THUMBABLE.has(result.formatId)
  const canCompare = isImage && !!item.thumbUrl && item.detected?.formatId !== 'heic'
  const delta = showDelta ? describeSizeChange(item.file.size, result.blob.size) : ''

  const share = async () => {
    const r = await shareFiles([result])
    if (r === 'unsupported') toast.error('Sharing files is not supported in this browser. Use Download instead.')
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-2.5" data-testid="result-row">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background ring-1 ring-border"
        aria-label={`Preview ${result.name}`}
      >
        {isImage ? (
          <img src={result.url} alt="" className="checkerboard size-full object-cover" />
        ) : (
          <FormatIcon formatId={result.formatId} className="text-muted-foreground" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium" title={result.name}>{result.name}</p>
        <p className="truncate text-[12px] text-muted-foreground">
          <span className="font-mono tabular-nums">{formatBytes(result.blob.size)}</span>
          {result.meta?.width && result.meta.height ? ` · ${result.meta.width}×${result.meta.height}` : ''}
          {result.meta?.pages ? ` · ${result.meta.pages} page${result.meta.pages === 1 ? '' : 's'}` : ''}
          {delta && <span className={cn(result.blob.size < item.file.size ? 'text-success' : '')}> · {delta}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-touch" className="hidden sm:inline-flex" onClick={() => setOpen(true)} aria-label="Preview">
          <EyeIcon />
        </Button>
        {caps.webShareFiles && (
          <Button variant="ghost" size="icon-touch" onClick={share} aria-label={`Share ${result.name}`}>
            <Share2Icon />
          </Button>
        )}
        <Button asChild size="icon-touch" className="bg-brand text-brand-foreground hover:bg-brand/90">
          <a href={result.url} download={result.name} aria-label={`Download ${result.name}`} data-testid="download-link">
            <DownloadIcon />
          </a>
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto rounded-3xl p-4 sm:p-6">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="truncate">{result.name}</DialogTitle>
            <DialogDescription>
              {formatLabel(result.formatId)} · {formatBytes(result.blob.size)}
              {showDelta && ` · original ${formatBytes(item.file.size)}`}
            </DialogDescription>
          </DialogHeader>
          {canCompare && (
            <div className="flex gap-1 rounded-xl bg-muted p-1 text-[14px]" role="tablist" aria-label="Compare">
              {(['before', 'after'] as const).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={compare === k}
                  onClick={() => setCompare(k)}
                  className={cn('h-9 flex-1 rounded-lg font-medium', compare === k ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                >
                  {k === 'before' ? `Original · ${formatBytes(item.file.size)}` : `Converted · ${formatBytes(result.blob.size)}`}
                </button>
              ))}
            </div>
          )}
          {canCompare && compare === 'before' ? (
            <FilePreview blob={item.file} url={item.thumbUrl!} formatId={item.detected!.formatId!} name={item.file.name} zoomable />
          ) : (
            <FilePreview blob={result.blob} url={result.url} formatId={result.formatId} name={result.name} zoomable />
          )}
          {isImage && <p className="text-center text-[12px] text-muted-foreground">Tap the image to toggle actual size.</p>}
          <div className="flex gap-2">
            {caps.webShareFiles && (
              <Button variant="secondary" size="touch" className="flex-1" onClick={share}>
                <Share2Icon /> Share
              </Button>
            )}
            <Button asChild size="touch" className="flex-1 bg-brand text-brand-foreground hover:bg-brand/90">
              <a href={result.url} download={result.name}>
                <DownloadIcon /> Download
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
