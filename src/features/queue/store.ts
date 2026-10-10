import { create } from 'zustand'
import type { ErrorInfo } from '@/lib/errors'
import type { DetectedFile, OptionValues, OutputFile } from '@/registry/types'
import { canTransition, type JobStatus } from './job-state'

export interface ResultFile extends OutputFile {
  url: string
}

export interface QueueItem {
  id: string
  file: File
  addedAt: number
  detected: DetectedFile | null
  conversionId: string | null
  options: OptionValues
  status: JobStatus
  /** 0..1 when measurable, null for indeterminate work. */
  progress: number | null
  progressMessage?: string
  results: ResultFile[]
  warnings: string[]
  error?: ErrorInfo
  startedAt?: number
  finishedAt?: number
  /** Incremented on every run so late updates from a superseded run are ignored. */
  runId: number
  thumbUrl?: string
}

interface QueueState {
  items: QueueItem[]
  add: (items: QueueItem[]) => void
  patch: (id: string, patch: Partial<QueueItem>, runId?: number) => void
  transition: (id: string, to: JobStatus, patch?: Partial<QueueItem>, runId?: number) => boolean
  remove: (id: string) => void
  clear: () => void
}

let counter = 0
export const newId = () => `job-${Date.now().toString(36)}-${(counter++).toString(36)}`

export function revokeItemUrls(item: Pick<QueueItem, 'results' | 'thumbUrl'>, includeThumb = true) {
  for (const r of item.results) URL.revokeObjectURL(r.url)
  if (includeThumb && item.thumbUrl) URL.revokeObjectURL(item.thumbUrl)
}

export const useQueue = create<QueueState>((set, get) => ({
  items: [],
  add: (items) => set((s) => ({ items: [...s.items, ...items] })),
  patch: (id, patch, runId) =>
    set((s) => ({
      items: s.items.map((it) => (it.id === id && (runId === undefined || it.runId === runId) ? { ...it, ...patch } : it)),
    })),
  transition: (id, to, patch, runId) => {
    const item = get().items.find((i) => i.id === id)
    if (!item || (runId !== undefined && item.runId !== runId) || !canTransition(item.status, to)) return false
    set((s) => ({ items: s.items.map((it) => (it.id === id ? { ...it, ...patch, status: to } : it)) }))
    return true
  },
  remove: (id) => {
    const item = get().items.find((i) => i.id === id)
    if (item) revokeItemUrls(item)
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
  },
  clear: () => {
    for (const it of get().items) revokeItemUrls(it)
    set({ items: [] })
  },
}))

export const getItem = (id: string) => useQueue.getState().items.find((i) => i.id === id)
