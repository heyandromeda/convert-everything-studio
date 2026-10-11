import { useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { formatBytes } from '@/lib/files'
import type { ArchiveEntry } from '@/registry/types'

/** Lets the user extract a subset of an archive. An empty selection means "everything". */
export function ArchiveEntryPicker({ entries, selected, onChange, disabled }: { entries: ArchiveEntry[]; selected: string[]; onChange: (paths: string[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const files = entries.filter((e) => !e.isDirectory)
  const chosen = new Set(selected)
  const all = chosen.size === 0
  const toggle = (path: string) => {
    const next = new Set(all ? files.map((f) => f.path) : chosen)
    if (next.has(path)) {
      // At least one file must stay selected.
      if (next.size === 1) return
      next.delete(path)
    } else next.add(path)
    onChange(next.size === files.length ? [] : [...next])
  }
  return (
    <div className="rounded-[4px] border">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex h-11 w-full items-center justify-between px-3.5 text-[14px] font-medium">
        <span>
          {all ? `All ${files.length} files` : `${chosen.size} of ${files.length} files`} selected
        </span>
        <ChevronDownIcon className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t">
          <div className="flex gap-3 px-3.5 py-2 text-[13px]">
            <button type="button" className="font-bold underline" onClick={() => onChange([])} disabled={disabled}>Select all</button>
          </div>
          <ul className="max-h-72 divide-y overflow-y-auto border-t text-[13px]">
            {files.slice(0, 1000).map((e) => (
              <li key={e.path}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3.5 py-2">
                  <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={all || chosen.has(e.path)} onChange={() => toggle(e.path)} disabled={disabled} />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{e.path}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{formatBytes(e.size)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
