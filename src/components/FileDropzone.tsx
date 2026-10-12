import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlusIcon, PlusIcon } from 'lucide-react'
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
        <Button variant="secondary" size="touch" className="min-w-0 flex-1 px-3 leading-tight whitespace-normal" onClick={() => inputRef.current?.click()}>
          <PlusIcon /> Add files
        </Button>
        <Button variant="secondary" size="touch" className="min-w-0 flex-1 px-3 leading-tight whitespace-normal" onClick={() => mediaRef.current?.click()}>
          <ImagePlusIcon /> Photos & videos
        </Button>
        {dragging && <DragOverlay />}
      </div>
    )
  }

  return (
    <div className={cn(dragging && 'outline outline-2 outline-foreground outline-offset-4')}>
      {inputs}
      <h2 className="mb-1.5 text-[0.95rem] font-bold">Choose files to convert</h2>
      <div className="flex flex-wrap gap-2">
        <Button className="flex-1 sm:flex-none" onClick={() => inputRef.current?.click()}>
          Browse files
        </Button>
        <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => mediaRef.current?.click()}>
          Photos & videos
        </Button>
      </div>
      <p className="mt-3 text-[0.9rem] leading-normal text-[#555] dark:text-[#aaa]">
        Images, video, audio, documents, spreadsheets and archives. Drop them anywhere on this page.
      </p>
      {dragging && <DragOverlay />}
    </div>
  )
}

function DragOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="border border-foreground bg-background px-6 py-5 text-[0.95rem] font-bold">Drop files to add them</div>
    </div>
  )
}
