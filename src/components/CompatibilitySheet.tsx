import { useMemo } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getCapabilities } from '@/lib/capabilities'
import { allConversions } from '@/registry'
import { formatLabel, getFormat } from '@/registry/formats'
import type { Category } from '@/registry/types'
import { UNSUPPORTED } from '@/registry/unsupported'
import { CATEGORY_LABEL } from './category-label'
import { StatusBadge } from './StatusBadge'

const ENGINE_LABEL: Record<string, string> = {
  canvas: 'Browser canvas',
  'libwebp-wasm': 'libwebp (WebAssembly)',
  'libavif-wasm': 'libavif (WebAssembly)',
  gifenc: 'gifenc',
  utif: 'UTIF.js',
  'bitmap-writer': 'Built-in writer',
  'jpeg-png-metadata': 'Built-in byte editor',
  'pdf-lib': 'pdf-lib',
  pdfjs: 'PDF.js',
  pdfmake: 'pdfmake',
  marked: 'marked + DOMPurify',
  turndown: 'Turndown',
  mammoth: 'Mammoth',
  sheetjs: 'SheetJS',
  yaml: 'yaml',
  'fast-xml-parser': 'fast-xml-parser',
  subtitles: 'Built-in parser',
  fflate: 'fflate',
  'tar-reader': 'Built-in TAR reader',
  'ffmpeg-wasm': 'FFmpeg (WebAssembly)',
  'libarchive-wasm': 'libarchive (WebAssembly)',
  'ooxml-reader': 'Built-in OOXML reader',
}

export function CompatibilitySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const caps = getCapabilities()
  const groups = useMemo(() => {
    const map = new Map<Category, ReturnType<typeof allConversions>[number][]>()
    for (const d of allConversions()) {
      const cat = getFormat(d.from[0])?.category ?? 'other'
      map.set(cat, [...(map.get(cat) ?? []), d])
    }
    return [...map.entries()]
  }, [])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-4">
          <SheetTitle>What converts to what</SheetTitle>
          <SheetDescription>Every conversion below runs entirely in your browser. Nothing is listed unless it is implemented and tested.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5 pb-safe">
          {groups.map(([cat, defs]) => (
            <section key={cat}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{CATEGORY_LABEL[cat]}</h3>
              <ul className="divide-y rounded-2xl border">
                {defs.map((d) => {
                  const req = d.requires?.(caps)
                  return (
                    <li key={d.id} className="space-y-1 px-3.5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-semibold">
                          {d.from.map(formatLabel).join(', ')} → {d.label ?? formatLabel(d.to)}
                        </span>
                        <StatusBadge status={req && !req.available ? 'unavailable' : d.status} />
                      </div>
                      <p className="text-[12.5px] leading-snug text-muted-foreground">
                        {ENGINE_LABEL[d.engine] ?? d.engine} · {d.lossy === true ? 'lossy' : d.lossy === false ? 'lossless' : 'lossy or lossless'}
                        {d.formatting === 'partial' ? ' · formatting partly preserved' : d.formatting === 'none' ? ' · formatting not preserved' : ''}
                        {d.editable ? '' : ' · output not editable'}
                      </p>
                      {d.limitations.length > 0 && (
                        <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] leading-snug text-muted-foreground">
                          {d.limitations.map((l) => (
                            <li key={l}>{l}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Not supported</h3>
            <ul className="divide-y rounded-2xl border">
              {UNSUPPORTED.map((u) => (
                <li key={u.from.join() + u.to} className="space-y-1 px-3.5 py-3">
                  <p className="text-[14px] font-semibold">
                    {u.from.map(formatLabel).join(', ')} → {u.to}
                  </p>
                  <p className="text-[12.5px] leading-snug text-muted-foreground">{u.reason}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
