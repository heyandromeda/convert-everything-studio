import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlusIcon, PlusIcon, UploadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  onFiles: (files: File[]) => void
  compact?: boolean
}

export function FileDropzone({ onFiles, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const mediaRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)

  const take = useCallback(
    (list: FileList | null) => {
      const files = list ? Array.from(list).filter((f) => f.size >= 0) : []
      if (files.length) onFiles(files)
    },
    [onFiles],
  )

  // Accept files dropped anywhere on the page, not only on the zone.
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      depth.current++
      setDragging(true)
    }
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      take(e.dataTransfer.files)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [take])

  const inputs = (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="file-input"
        onChange={(e) => {
          take(e.currentTarget.files)
          e.currentTarget.value = ''
        }}
      />
      <input
        ref={mediaRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          take(e.currentTarget.files)
          e.currentTarget.value = ''
        }}
      />
    </>
  )

  if (compact) {
    return (
      <div className="flex gap-2">
        {inputs}
        <Button variant="secondary" size="touch" className="flex-1" onClick={() => inputRef.current?.click()}>
          <PlusIcon /> Add files
        </Button>
        <Button variant="secondary" size="touch" className="flex-1" onClick={() => mediaRef.current?.click()}>
          <ImagePlusIcon /> Photos & videos
        </Button>
        {dragging && <DragOverlay />}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative flex flex-col items-center gap-5 rounded-3xl border border-dashed border-border bg-surface/60 px-5 py-10 text-center transition-colors sm:py-14',
        dragging && 'border-brand bg-brand/5',
      )}
    >
      {inputs}
      <div className="flex size-14 items-center justify-center rounded-2xl bg-brand/12 text-brand ring-1 ring-brand/20">
        <UploadIcon className="size-6" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Choose files to convert</h2>
        <p className="mx-auto max-w-sm text-[15px] text-muted-foreground">
          Images, video, audio, documents, spreadsheets and archives. <span className="hidden sm:inline">Drop them here or browse.</span>
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-2.5 sm:flex-row">
        <Button size="touch-lg" className="w-full bg-brand text-brand-foreground hover:bg-brand/90 sm:w-auto sm:flex-1" onClick={() => inputRef.current?.click()}>
          <PlusIcon /> Browse files
        </Button>
        <Button size="touch-lg" variant="secondary" className="w-full sm:w-auto sm:flex-1" onClick={() => mediaRef.current?.click()}>
          <ImagePlusIcon /> Photos & videos
        </Button>
      </div>
      {dragging && <DragOverlay />}
    </div>
  )
}

function DragOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="rounded-3xl border-2 border-dashed border-brand px-10 py-8 text-lg font-medium text-brand">Drop files to add them</div>
    </div>
  )
}
