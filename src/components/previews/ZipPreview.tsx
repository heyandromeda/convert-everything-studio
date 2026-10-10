import { useEffect, useState } from 'react'
import { FileIcon, FolderIcon } from 'lucide-react'
import { readZipDirectory, type ZipDirectoryEntry } from '@/lib/zip-directory'
import { formatBytes } from '@/lib/files'

export default function ZipPreview({ blob }: { blob: Blob }) {
  const [entries, setEntries] = useState<ZipDirectoryEntry[] | null | 'error'>(null)
  useEffect(() => {
    let live = true
    readZipDirectory(blob, 2000)
      .then((e) => live && setEntries(e ?? 'error'))
      .catch(() => live && setEntries('error'))
    return () => {
      live = false
    }
  }, [blob])
  if (entries === 'error') return <p className="text-sm text-muted-foreground">The archive listing could not be read.</p>
  if (!entries) return null
  return <EntryList entries={entries} />
}

export function EntryList({ entries }: { entries: { path: string; size: number; isDirectory: boolean; unsafe?: string }[] }) {
  const files = entries.filter((e) => !e.isDirectory)
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-muted-foreground">
        {files.length} file{files.length === 1 ? '' : 's'} · {formatBytes(files.reduce((s, e) => s + e.size, 0))} uncompressed
      </p>
      <ul className="max-h-[50dvh] divide-y overflow-y-auto rounded-xl border text-[13px]">
        {entries.slice(0, 500).map((e, i) => (
          <li key={i} className="flex items-center gap-2 px-3 py-2">
            {e.isDirectory ? <FolderIcon className="size-4 shrink-0 text-muted-foreground" /> : <FileIcon className="size-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{e.path}</span>
            {e.unsafe && <span className="shrink-0 text-[11px] text-warning">{e.unsafe}</span>}
            {!e.isDirectory && <span className="shrink-0 tabular-nums text-muted-foreground">{formatBytes(e.size)}</span>}
          </li>
        ))}
      </ul>
      {entries.length > 500 && <p className="text-[12px] text-muted-foreground">Showing the first 500 entries.</p>}
    </div>
  )
}
