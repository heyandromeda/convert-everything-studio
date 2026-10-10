export type ErrorCode =
  | 'canceled'
  | 'unsupported-input'
  | 'decode-failed'
  | 'codec-unavailable'
  | 'out-of-memory'
  | 'too-large'
  | 'corrupt'
  | 'empty-output'
  | 'invalid-output'
  | 'no-text'
  | 'engine-load-failed'
  | 'encrypted'
  | 'unsafe-archive'
  | 'invalid-options'
  | 'not-tabular'
  | 'unknown'

export interface ErrorInfo {
  code: ErrorCode
  title: string
  detail: string
  suggestion?: string
}

/** An error that already carries a user-facing explanation. */
export class ConversionError extends Error {
  readonly code: ErrorCode
  readonly title: string
  readonly suggestion?: string
  constructor(code: ErrorCode, title: string, detail: string, suggestion?: string) {
    super(detail)
    this.name = 'ConversionError'
    this.code = code
    this.title = title
    this.suggestion = suggestion
  }
}

export class CanceledError extends Error {
  constructor() {
    super('Canceled')
    this.name = 'CanceledError'
  }
}

export function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new CanceledError()
}

/**
 * Turns any thrown value into a readable explanation. Raw messages from libraries are
 * kept short and never include file contents.
 */
export function classifyError(err: unknown): ErrorInfo {
  if (err instanceof CanceledError || (err instanceof DOMException && err.name === 'AbortError')) {
    return { code: 'canceled', title: 'Canceled', detail: 'The conversion was stopped before it finished.' }
  }
  if (err instanceof ConversionError) {
    return { code: err.code, title: err.title, detail: err.message, suggestion: err.suggestion }
  }
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()
  if (
    err instanceof RangeError ||
    lower.includes('out of memory') ||
    lower.includes('allocation failed') ||
    lower.includes('cannot enlarge memory') ||
    lower.includes('memory access out of bounds')
  ) {
    return {
      code: 'out-of-memory',
      title: 'The browser ran out of memory',
      detail: 'This file needed more memory than the browser allowed for this tab.',
      suggestion: 'Close other tabs, try a smaller file, or reduce the output resolution.',
    }
  }
  if (lower.includes('invalid pdf') || lower.includes('invalid zip') || lower.includes('corrupt') || lower.includes('unexpected end')) {
    return {
      code: 'corrupt',
      title: 'The file appears damaged',
      detail: 'Its internal structure could not be read.',
      suggestion: 'Try re-exporting the file from the app that created it.',
    }
  }
  if (lower.includes('password') || lower.includes('encrypt')) {
    return {
      code: 'encrypted',
      title: 'The file is password-protected',
      detail: 'Encrypted files cannot be converted without the password.',
      suggestion: 'Remove the password in the original app, then try again.',
    }
  }
  return {
    code: 'unknown',
    title: 'The conversion did not complete',
    detail: truncate(message || 'An unexpected error occurred in the conversion engine.', 200),
    suggestion: 'Try again. If it keeps failing, try a different output format.',
  }
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
