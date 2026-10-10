import { lazy, Suspense, useEffect, useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { QueueItem } from '@/features/queue/store'
import { formatBytes } from '@/lib/files'
import { formatLabel } from '@/registry/formats'
import { FilePreview } from './FilePreview'
import { EntryList } from './previews/ZipPreview'

const SheetPreview = lazy(() => import('./previews/SheetPreview'))
const SHEETS = new Set(['xlsx', 'xls', 'ods', 'csv', 'tsv'])

/** Preview of the original file. The object URL exists only while the dialog is open. */
export function SourcePreview({ item, open, onOpenChange }: { item: QueueItem; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const fmt = item.detected?.formatId ?? ''

  useEffect(() => {
    if (!open) return
    const u = item.thumbUrl ?? URL.createObjectURL(item.file)
    setUrl(u)
    return () => {
      if (u !== item.thumbUrl) URL.revokeObjectURL(u)
      setUrl(null)
    }
  }, [open, item.file, item.thumbUrl])

  const entries = item.detected?.metadata.archive?.entries
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto rounded-3xl p-4 sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="truncate">{item.file.name}</DialogTitle>
          <DialogDescription>Original · {formatLabel(fmt)} · {formatBytes(item.file.size)}</DialogDescription>
        </DialogHeader>
        {!url ? null : SHEETS.has(fmt) ? (
          <Suspense fallback={<Loader2Icon className="mx-auto size-5 animate-spin" />}>
            <SheetPreview blob={item.file} formatId={fmt} />
          </Suspense>
        ) : entries ? (
          <EntryList entries={entries} />
        ) : (
          <FilePreview blob={item.file} url={url} formatId={fmt} name={item.file.name} zoomable />
        )}
      </DialogContent>
    </Dialog>
  )
}
