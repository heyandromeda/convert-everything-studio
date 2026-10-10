import { lazy, Suspense, useEffect, useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { getFormat } from '@/registry/formats'
import { cn } from '@/lib/utils'
import { formatBytes } from '@/lib/files'

const PdfPreview = lazy(() => import('./previews/PdfPreview'))
const ZipPreview = lazy(() => import('./previews/ZipPreview'))

const IMAGE = new Set(['png', 'apng', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'ico', 'svg', 'heic', 'tiff'])
const TEXT = new Set(['txt', 'md', 'html', 'csv', 'tsv', 'json', 'yaml', 'xml', 'srt', 'vtt', 'svg-source'])
const MAX_TEXT = 200 * 1024

interface Props {
  blob: Blob
  url: string
  formatId: string
  name: string
  zoomable?: boolean
}

export function FilePreview({ blob, url, formatId, name, zoomable }: Props) {
  const cat = getFormat(formatId)?.category
  if (IMAGE.has(formatId)) return <ImagePreview url={url} name={name} zoomable={zoomable} />
  if (cat === 'video' && formatId !== 'gif') {
    return <video src={url} controls playsInline preload="metadata" className="max-h-[60dvh] w-full rounded-xl bg-black" aria-label={name} />
  }
  if (cat === 'audio') return <audio src={url} controls preload="metadata" className="w-full" aria-label={name} />
  if (formatId === 'pdf') {
    return (
      <Suspense fallback={<Spinner />}>
        <PdfPreview blob={blob} />
      </Suspense>
    )
  }
  if (formatId === 'zip') {
    return (
      <Suspense fallback={<Spinner />}>
        <ZipPreview blob={blob} />
      </Suspense>
    )
  }
  if (TEXT.has(formatId)) return <TextPreview blob={blob} html={formatId === 'html'} />
  return <p className="py-6 text-center text-sm text-muted-foreground">No preview for this format. Download it to open in another app.</p>
}

function Spinner() {
  return (
    <div className="flex justify-center py-10 text-muted-foreground">
      <Loader2Icon className="size-5 animate-spin" aria-label="Loading preview" />
    </div>
  )
}

function ImagePreview({ url, name, zoomable }: { url: string; name: string; zoomable?: boolean }) {
  const [zoom, setZoom] = useState(false)
  const [failed, setFailed] = useState(false)
  if (failed) return <p className="py-6 text-center text-sm text-muted-foreground">This browser cannot display this image format, but the file is valid. Download it to view.</p>
  return (
    <div className={cn('checkerboard overflow-auto rounded-xl', zoom ? 'max-h-[65dvh]' : '')}>
      <img
        src={url}
        alt={`Preview of ${name}`}
        onError={() => setFailed(true)}
        onClick={() => zoomable && setZoom((z) => !z)}
        className={cn('mx-auto block', zoom ? 'max-w-none cursor-zoom-out' : 'max-h-[60dvh] max-w-full object-contain', zoomable && !zoom && 'cursor-zoom-in')}
      />
    </div>
  )
}

function TextPreview({ blob, html }: { blob: Blob; html: boolean }) {
  const [text, setText] = useState<string | null>(null)
  const [rendered, setRendered] = useState(false)
  useEffect(() => {
    let live = true
    blob.slice(0, MAX_TEXT).text().then((t) => live && setText(t))
    return () => {
      live = false
    }
  }, [blob])
  if (text === null) return <Spinner />
  return (
    <div className="space-y-2">
      {html && (
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-[13px]" role="tablist">
          {['Source', 'Rendered'].map((t, i) => (
            <button
              key={t}
              role="tab"
              aria-selected={rendered === (i === 1)}
              onClick={() => setRendered(i === 1)}
              className={cn('flex-1 rounded-md px-3 py-1.5 font-medium', rendered === (i === 1) ? 'bg-background shadow-sm' : 'text-muted-foreground')}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      {html && rendered ? (
        // Fully sandboxed: no scripts, no same-origin access, no forms or navigation.
        <iframe title="Rendered HTML preview" sandbox="" srcDoc={text} className="h-[55dvh] w-full rounded-xl border bg-white" referrerPolicy="no-referrer" />
      ) : (
        <pre className="max-h-[55dvh] overflow-auto rounded-xl bg-muted/60 p-3 font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap">
          {text}
          {blob.size > MAX_TEXT && `\n\n… preview truncated (${formatBytes(blob.size)} total)`}
        </pre>
      )}
    </div>
  )
}
