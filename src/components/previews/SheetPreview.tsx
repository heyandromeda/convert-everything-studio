import { useEffect, useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAX_ROWS = 25
const MAX_COLS = 12

/** First rows of each worksheet, read locally with SheetJS. Cell values are rendered as text only. */
export default function SheetPreview({ blob, formatId }: { blob: Blob; formatId: string }) {
  const [data, setData] = useState<{ names: string[]; rows: Record<string, unknown[][]> } | 'error' | null>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const X = await import('xlsx')
        const wb =
          formatId === 'csv' || formatId === 'tsv'
            ? X.read(await blob.slice(0, 2 * 1024 * 1024).text(), { type: 'string', sheetRows: MAX_ROWS + 1, FS: formatId === 'tsv' ? '\t' : undefined })
            : X.read(await blob.arrayBuffer(), { type: 'array', sheetRows: MAX_ROWS + 1 })
        const rows: Record<string, unknown[][]> = {}
        for (const n of wb.SheetNames) rows[n] = X.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: false, defval: '' })
        if (live) setData({ names: wb.SheetNames, rows })
      } catch {
        if (live) setData('error')
      }
    })()
    return () => {
      live = false
    }
  }, [blob, formatId])

  if (data === 'error') return <p className="py-6 text-center text-sm text-muted-foreground">This spreadsheet could not be previewed.</p>
  if (!data) return <div className="flex justify-center py-10"><Loader2Icon className="size-5 animate-spin text-muted-foreground" aria-label="Loading preview" /></div>
  const name = data.names[active]
  const rows = data.rows[name] ?? []
  return (
    <div className="space-y-2">
      {data.names.length > 1 && (
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-[13px]" role="tablist" aria-label="Worksheets">
          {data.names.map((n, i) => (
            <button key={n} role="tab" aria-selected={i === active} onClick={() => setActive(i)} className={cn('shrink-0 rounded-md px-3 py-1.5 font-medium', i === active ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
              {n}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-[55dvh] overflow-auto rounded-xl border">
        <table className="w-full border-collapse font-mono text-[12px]">
          <tbody>
            {rows.slice(0, MAX_ROWS).map((r, i) => (
              <tr key={i} className={i === 0 ? 'bg-muted/60 font-semibold' : 'odd:bg-muted/20'}>
                {r.slice(0, MAX_COLS).map((c, j) => (
                  <td key={j} className="max-w-48 truncate border-b border-r px-2 py-1.5 whitespace-nowrap">{String(c ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted-foreground">Showing up to {MAX_ROWS} rows and {MAX_COLS} columns.</p>
    </div>
  )
}
