import { useMemo } from 'react'
import { FileArchiveIcon, FilesIcon, ImagesIcon, Layers2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { isPending } from '@/features/queue/job-state'
import { convert, createCombined, setTargetForAll } from '@/features/queue/runner'
import { useQueue } from '@/features/queue/store'
import { getFormat } from '@/registry/formats'

const IMAGE_TARGETS: [string, string][] = [
  ['image-to-webp', 'WebP'],
  ['image-to-jpeg', 'JPEG'],
  ['image-to-png', 'PNG'],
  ['image-to-avif', 'AVIF'],
  ['image-to-pdf', 'PDF'],
]

/** Batch presets and multi-file operations. Image presets never touch non-image files. */
export function BatchToolbar() {
  const items = useQueue((s) => s.items)
  const groups = useMemo(() => {
    const singles = items.filter((i) => !i.sources && i.detected?.formatId && i.status !== 'unsupported' && i.status !== 'detecting')
    const images = singles.filter((i) => getFormat(i.detected!.formatId)?.category === 'image')
    const pdfs = singles.filter((i) => i.detected!.formatId === 'pdf')
    return { singles, images, pdfs, busy: items.some((i) => isPending(i.status)) }
  }, [items])

  if (groups.singles.length < 2) return null

  const combine = (set: 'image-set' | 'pdf-set' | 'file-set', ids: string[], conversionId: string, what: string) => {
    const id = createCombined(set, ids, conversionId)
    if (id) {
      toast(`${what} was added to the list.`, { action: { label: 'Create now', onClick: () => convert([id]) } })
      requestAnimationFrame(() => document.querySelector(`[data-item-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    }
  }

  return (
    <section aria-label="Batch actions" className="space-y-3 border-t border-border pt-4">
      {groups.images.length >= 2 && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
            <ImagesIcon className="size-4" aria-hidden /> Convert all {groups.images.length} images to
          </p>
          <div className="flex flex-wrap gap-1.5">
            {IMAGE_TARGETS.map(([id, label]) => (
              <Button
                key={id}
                variant="secondary"
                size="sm"
                className="h-9 rounded-lg px-3.5"
                disabled={groups.busy}
                onClick={() => {
                  const n = setTargetForAll('image', id)
                  toast(n ? `${n} image${n === 1 ? '' : 's'} set to ${label}` : `No images can be converted to ${label} here`)
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
          <Layers2Icon className="size-4" aria-hidden /> Combine files
        </p>
        <div className="flex flex-wrap gap-1.5">
          {groups.images.length >= 2 && (
            <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => combine('image-set', groups.images.map((i) => i.id), 'combine-images-pdf', 'A combined PDF')}>
              <FilesIcon /> {groups.images.length} images → one PDF
            </Button>
          )}
          {groups.pdfs.length >= 2 && (
            <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => combine('pdf-set', groups.pdfs.map((i) => i.id), 'combine-pdfs', 'A merged PDF')}>
              <FilesIcon /> Merge {groups.pdfs.length} PDFs
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => combine('file-set', groups.singles.map((i) => i.id), 'combine-zip', 'A ZIP of the originals')}>
            <FileArchiveIcon /> ZIP {groups.singles.length} originals
          </Button>
        </div>
      </div>
    </section>
  )
}
