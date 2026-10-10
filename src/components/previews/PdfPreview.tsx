import { useEffect, useRef, useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { openPdf } from '@/engines/documents/pdfjs'

const MAX_PAGES = 4

export default function PdfPreview({ blob }: { blob: Blob }) {
  const container = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<number | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    let doc: Awaited<ReturnType<typeof openPdf>> | null = null
    const canvases: HTMLCanvasElement[] = []
    ;(async () => {
      try {
        doc = await openPdf(await blob.arrayBuffer())
        if (!live) return
        setPages(doc.numPages)
        const width = Math.min(container.current?.clientWidth ?? 600, 900)
        for (let i = 1; i <= Math.min(MAX_PAGES, doc.numPages) && live; i++) {
          const page = await doc.getPage(i)
          const base = page.getViewport({ scale: 1 })
          const dpr = Math.min(window.devicePixelRatio || 1, 2)
          const viewport = page.getViewport({ scale: (width / base.width) * dpr })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.className = 'w-full rounded-lg bg-white shadow-sm ring-1 ring-border'
          canvas.setAttribute('aria-label', `Page ${i}`)
          await page.render({ canvas, viewport }).promise
          if (!live) break
          canvases.push(canvas)
          container.current?.appendChild(canvas)
        }
      } catch {
        if (live) setError(true)
      }
    })()
    return () => {
      live = false
      for (const c of canvases) {
        c.width = 0
        c.remove()
      }
      void doc?.loadingTask.destroy()
    }
  }, [blob])

  if (error) return <p className="py-6 text-center text-sm text-muted-foreground">This PDF could not be previewed.</p>
  return (
    <div className="space-y-2">
      {pages === null ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2Icon className="size-5 animate-spin" aria-label="Rendering PDF" />
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          {pages} page{pages === 1 ? '' : 's'}
          {pages > MAX_PAGES && ` · showing the first ${MAX_PAGES}`}
        </p>
      )}
      <div ref={container} className="max-h-[60dvh] space-y-3 overflow-y-auto" />
    </div>
  )
}
