import { getCapabilities, maxConcurrency } from '@/lib/capabilities'
import { detectFile } from '@/lib/detect'
import { CanceledError, ConversionError, classifyError } from '@/lib/errors'
import { baseName, uniqueName } from '@/lib/files'
import { inspectMetadata } from '@/lib/metadata'
import { validateOutput } from '@/lib/validate'
import { availabilityOf, conversionsFor, defaultConversionFor, getConversion } from '@/registry'
import { getFormat } from '@/registry/formats'
import { defaultOptions, validateOptions } from '@/registry/options'
import type { OptionValues, ProgressUpdate } from '@/registry/types'
import { isActive, isPending, isTerminal } from './job-state'
import { getItem, newId, revokeItemUrls, useQueue, type QueueItem, type ResultFile } from './store'
import { loadPreferredOptions, rememberOptions } from '../settings/preferences'

const controllers = new Map<string, AbortController>()
const running = new Set<string>()

const { getState } = useQueue

const THUMB_FORMATS = new Set(['png', 'apng', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'ico', 'svg', 'heic'])

export async function addFiles(files: File[]) {
  const items: QueueItem[] = files.map((file) => ({
    id: newId(),
    file,
    addedAt: Date.now(),
    detected: null,
    conversionId: null,
    options: {},
    status: 'detecting',
    progress: null,
    results: [],
    warnings: [],
    runId: 0,
  }))
  getState().add(items)
  // Sequential inspection keeps memory flat when many large files are added at once.
  for (const item of items) await inspect(item.id)
}

async function inspect(id: string) {
  const item = getItem(id)
  if (!item) return
  const caps = getCapabilities()
  try {
    const base = await detectFile(item.file)
    const metadata = await inspectMetadata(item.file, base)
    const detected = { ...base, metadata }
    const options = conversionsFor(detected, caps, item.file.size)
    const thumbUrl = detected.formatId && THUMB_FORMATS.has(detected.formatId) ? URL.createObjectURL(item.file) : undefined
    if (!getItem(id)) {
      if (thumbUrl) URL.revokeObjectURL(thumbUrl)
      return
    }
    const choice = defaultConversionFor(options, detected, lastChoiceFor(detected.formatId))
    getState().transition(id, choice ? 'ready' : 'unsupported', {
      detected,
      thumbUrl,
      conversionId: choice?.def.id ?? null,
      options: choice ? { ...defaultOptions(choice.def.options), ...loadPreferredOptions(choice.def.id) } : {},
    })
  } catch {
    getState().transition(id, 'unsupported', {
      detected: { formatId: null, source: 'none', extension: '', mime: item.file.type, metadata: { notes: ['This file could not be read.'] } },
    })
  }
}

const lastChoice = new Map<string, string>()
function lastChoiceFor(formatId: string | null) {
  return formatId ? lastChoice.get(formatId) : undefined
}

function resetForEdit(item: QueueItem, patch: Partial<QueueItem>) {
  if (isPending(item.status)) return
  if (isTerminal(item.status)) revokeItemUrls(item, false)
  const next = { ...patch, results: [], warnings: [], error: undefined, progress: null, finishedAt: undefined }
  if (item.status === 'ready') getState().patch(item.id, next)
  else getState().transition(item.id, 'ready', next)
}

export function setConversion(id: string, conversionId: string) {
  const item = getItem(id)
  const def = getConversion(conversionId)
  if (!item || !def || isPending(item.status)) return
  const defaults = defaultOptions(def.options)
  // Carry over values for settings that exist in both conversions (e.g. resize).
  const carried: OptionValues = {}
  for (const k of Object.keys(defaults)) if (k in item.options) carried[k] = item.options[k]
  if (item.detected?.formatId) lastChoice.set(item.detected.formatId, conversionId)
  resetForEdit(item, { conversionId, options: { ...defaults, ...loadPreferredOptions(conversionId), ...carried } })
}

export function setOptions(id: string, values: Partial<OptionValues>) {
  const item = getItem(id)
  if (!item || isPending(item.status)) return
  const options = { ...item.options, ...values } as OptionValues
  if (item.conversionId) rememberOptions(item.conversionId, options)
  resetForEdit(item, { options })
}

/** Copies the conversion and settings to other files that support the exact same conversion. */
export function applyToCompatible(sourceId: string): number {
  const src = getItem(sourceId)
  if (!src?.conversionId) return 0
  const caps = getCapabilities()
  let count = 0
  for (const it of getState().items) {
    if (it.id === sourceId || !it.detected || isPending(it.status)) continue
    const opts = conversionsFor(it.detected, caps, it.file.size)
    const match = opts.find((o) => o.def.id === src.conversionId && o.availability.available)
    if (!match) continue
    resetForEdit(it, { conversionId: src.conversionId, options: { ...src.options } })
    count++
  }
  return count
}

/** Points every compatible file at the given target format. */
export function setTargetForAll(category: string, conversionId: string): number {
  const caps = getCapabilities()
  let count = 0
  for (const it of getState().items) {
    if (!it.detected || isPending(it.status) || getFormat(it.detected.formatId)?.category !== category) continue
    const match = conversionsFor(it.detected, caps, it.file.size).find((o) => o.def.id === conversionId && o.availability.available)
    if (match && it.conversionId !== conversionId) {
      setConversion(it.id, conversionId)
      count++
    } else if (match) count++
  }
  return count
}

const SET_LABEL: Record<string, (n: number) => string> = {
  'image-set': (n) => `${n} images`,
  'pdf-set': (n) => `${n} PDFs`,
  'file-set': (n) => `${n} files`,
}

/** Creates a queue item that operates on several files at once and returns its id. */
export function createCombined(setFormat: 'image-set' | 'pdf-set' | 'file-set', ids: string[], conversionId: string): string | null {
  const items = getState().items.filter((i) => ids.includes(i.id) && i.detected && !i.sources)
  const def = getConversion(conversionId)
  if (items.length < 2 || !def) return null
  const label = SET_LABEL[setFormat](items.length)
  const id = newId()
  getState().add([
    {
      id,
      file: new File([], label),
      label,
      addedAt: Date.now(),
      detected: { formatId: setFormat, source: 'content', extension: '', mime: '', metadata: {} },
      sources: items.map((i) => ({ file: i.file, input: i.detected! })),
      conversionId,
      options: { ...defaultOptions(def.options), ...loadPreferredOptions(conversionId) },
      status: 'ready',
      progress: null,
      results: [],
      warnings: [],
      runId: 0,
    },
  ])
  return id
}

export function convert(ids?: string[]) {
  const targets = getState().items.filter(
    (it) => (!ids || ids.includes(it.id)) && it.conversionId && ['ready', 'failed', 'canceled'].includes(it.status),
  )
  for (const it of targets) {
    if (isTerminal(it.status)) revokeItemUrls(it, false)
    getState().transition(it.id, 'queued', { results: [], warnings: [], error: undefined, progress: null, progressMessage: undefined })
  }
  pump()
}

export function cancel(id: string) {
  const item = getItem(id)
  if (!item) return
  if (item.status === 'queued') {
    getState().transition(id, 'canceled', { finishedAt: Date.now(), error: classifyError(new CanceledError()) })
    return
  }
  controllers.get(id)?.abort()
}

export function cancelAll() {
  for (const it of getState().items) if (isPending(it.status)) cancel(it.id)
}

export function removeItem(id: string) {
  cancel(id)
  controllers.delete(id)
  getState().remove(id)
  pump()
}

export function clearAll() {
  cancelAll()
  getState().clear()
}

function pump() {
  const caps = getCapabilities()
  const limit = maxConcurrency(caps)
  const items = getState().items
  const heavyRunning = [...running].some((id) => getConversion(getItem(id)?.conversionId)?.cost === 'heavy')
  if (heavyRunning) return
  for (const it of items) {
    if (running.size >= limit) break
    if (it.status !== 'queued') continue
    const def = getConversion(it.conversionId)
    if (def?.cost === 'heavy' && running.size > 0) break
    void run(it.id)
    if (def?.cost === 'heavy') break
  }
}

async function run(id: string) {
  const item = getItem(id)
  if (!item || item.status !== 'queued') return
  const def = getConversion(item.conversionId)
  const runId = item.runId + 1
  getState().patch(id, { runId })
  running.add(id)
  const ctrl = new AbortController()
  controllers.set(id, ctrl)
  const caps = getCapabilities()
  const tr = (to: Parameters<ReturnType<typeof getState>['transition']>[1], patch?: Partial<QueueItem>) => getState().transition(id, to, patch, runId)

  try {
    tr('preparing', { startedAt: Date.now(), progress: null, progressMessage: undefined })
    if (!def || !item.detected) throw new ConversionError('unsupported-input', 'No converter selected', 'Choose an output format first.')
    const availability = availabilityOf(def, caps, item.detected, item.file.size)
    if (!availability.available) throw new ConversionError('too-large', 'This conversion is unavailable', availability.reason ?? 'Not available in this browser.')
    const problems = validateOptions(def.options, item.options)
    if (problems.length) throw new ConversionError('invalid-options', 'Some settings need attention', problems.join(' '))

    tr('loading-engine', { progressMessage: 'Loading converter' })
    let fn
    try {
      fn = await def.load()
    } catch {
      throw new ConversionError(
        'engine-load-failed',
        'The conversion engine could not be loaded',
        navigator.onLine ? 'Part of the app failed to download.' : 'You appear to be offline and this engine has not been cached on this device yet.',
        'Check your connection and try again.',
      )
    }
    if (ctrl.signal.aborted) throw new CanceledError()
    tr('processing', { progressMessage: undefined })

    const onProgress = (u: ProgressUpdate) => {
      if (ctrl.signal.aborted) return
      const current = getItem(id)
      if (!current || current.runId !== runId || !isActive(current.status)) return
      const patch: Partial<QueueItem> = {}
      if (u.ratio !== undefined) patch.progress = u.ratio === null ? null : Math.max(0, Math.min(1, u.ratio))
      if (u.message !== undefined) patch.progressMessage = u.message
      if (u.stage && u.stage !== current.status) tr(u.stage, patch)
      else getState().patch(id, patch, runId)
    }

    const result = await fn({
      sources: item.sources,
      file: item.file,
      baseName: baseName(item.file.name),
      input: item.detected,
      options: item.options,
      caps,
      signal: ctrl.signal,
      onProgress,
    })
    if (ctrl.signal.aborted) throw new CanceledError()

    tr('finalizing', { progressMessage: 'Verifying output' })
    if (!result.outputs.length) throw new ConversionError('empty-output', 'Nothing was produced', 'The converter finished without producing any files.')
    for (const out of result.outputs) await validateOutput(out)
    if (ctrl.signal.aborted) throw new CanceledError()

    const taken = new Set<string>()
    const results: ResultFile[] = result.outputs.map((o) => ({ ...o, name: uniqueName(o.name, taken), url: URL.createObjectURL(o.blob) }))
    if (!tr('completed', { results, warnings: result.warnings ?? [], finishedAt: Date.now(), progress: 1, progressMessage: undefined })) {
      for (const r of results) URL.revokeObjectURL(r.url)
    }
  } catch (err) {
    const info = classifyError(err)
    tr(info.code === 'canceled' ? 'canceled' : 'failed', { error: info, finishedAt: Date.now(), progressMessage: undefined })
  } finally {
    running.delete(id)
    if (controllers.get(id) === ctrl) controllers.delete(id)
    pump()
  }
}
