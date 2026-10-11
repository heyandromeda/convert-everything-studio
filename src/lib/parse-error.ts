import { ConversionError } from './errors'

export interface TextLocation {
  line: number
  col?: number
}

/** Parser messages often quote the offending text (Safari: `Unexpected identifier "secret"`), so only a location is reported. */
export function syntaxError(fmt: string, where?: TextLocation) {
  return new ConversionError(
    'corrupt',
    `This ${fmt} is not valid`,
    where ? `Syntax error at line ${where.line}${where.col ? `, column ${where.col}` : ''}.` : 'It contains a syntax error.',
    'Fix the syntax error and try again.',
  )
}

function locate(text: string, position: number): TextLocation {
  const before = text.slice(0, position)
  return { line: before.split('\n').length, col: position - before.lastIndexOf('\n') }
}

/** Extracts a location from JSON.parse errors in Chromium ("position N"), Firefox ("line N column M") and Safari (none). */
export function jsonErrorLocation(text: string, e: unknown): TextLocation | undefined {
  const msg = e instanceof Error ? e.message : ''
  const lc = msg.match(/line (\d+) column (\d+)/i)
  if (lc) return { line: Number(lc[1]), col: Number(lc[2]) }
  const pos = msg.match(/position (\d+)/i)
  return pos ? locate(text, Number(pos[1])) : undefined
}

export function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (e) {
    throw syntaxError('JSON', jsonErrorLocation(text, e))
  }
}
