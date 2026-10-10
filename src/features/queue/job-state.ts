export type JobStatus =
  | 'detecting'
  | 'ready'
  | 'unsupported'
  | 'queued'
  | 'preparing'
  | 'loading-engine'
  | 'processing'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'canceled'

const ACTIVE: JobStatus[] = ['preparing', 'loading-engine', 'processing', 'finalizing']
const TERMINAL: JobStatus[] = ['completed', 'failed', 'canceled']

const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  detecting: ['ready', 'unsupported'],
  ready: ['queued', 'ready'],
  unsupported: [],
  queued: ['preparing', 'canceled', 'ready'],
  preparing: ['loading-engine', 'processing', 'finalizing', 'completed', 'failed', 'canceled'],
  'loading-engine': ['preparing', 'processing', 'finalizing', 'completed', 'failed', 'canceled'],
  processing: ['loading-engine', 'processing', 'finalizing', 'completed', 'failed', 'canceled'],
  finalizing: ['completed', 'failed', 'canceled'],
  completed: ['ready', 'queued'],
  failed: ['ready', 'queued'],
  canceled: ['ready', 'queued'],
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return from === to ? ACTIVE.includes(from) || from === 'ready' : TRANSITIONS[from].includes(to)
}

export const isActive = (s: JobStatus) => ACTIVE.includes(s)
export const isTerminal = (s: JobStatus) => TERMINAL.includes(s)
export const isPending = (s: JobStatus) => s === 'queued' || isActive(s)

export const STATUS_LABEL: Record<JobStatus, string> = {
  detecting: 'Inspecting',
  ready: 'Ready',
  unsupported: 'Not supported',
  queued: 'Queued',
  preparing: 'Preparing',
  'loading-engine': 'Loading engine',
  processing: 'Converting',
  finalizing: 'Verifying output',
  completed: 'Done',
  failed: 'Failed',
  canceled: 'Canceled',
}
