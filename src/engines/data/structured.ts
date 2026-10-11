import { ConversionError } from '@/lib/errors'
import { outputName } from '@/lib/files'
import { parseJsonText, syntaxError } from '@/lib/parse-error'
import { mimeFor } from '@/registry/formats'
import type { ConvertContext, ConverterFn } from '@/registry/types'

const textOut = (ctx: ConvertContext, text: string, formatId: string, warnings: string[] = []) => ({
  outputs: [{ blob: new Blob([text], { type: `${mimeFor(formatId)};charset=utf-8` }), name: outputName(ctx.file.name, formatId, formatId === ctx.input.formatId ? '-formatted' : ''), formatId }],
  warnings,
})

async function readJson(ctx: ConvertContext): Promise<unknown> {
  return parseJsonText((await ctx.file.text()).replace(/^\uFEFF/, ''))
}

async function readYaml(ctx: ConvertContext): Promise<unknown> {
  const YAML = await import('yaml')
  try {
    // Aliases are capped to defuse "billion laughs" style expansion.
    return YAML.parse(await ctx.file.text(), { maxAliasCount: 100, prettyErrors: true })
  } catch (e) {
    const pos = (e as { linePos?: { line: number; col: number }[] }).linePos?.[0]
    throw syntaxError('YAML', pos)
  }
}

async function readXml(ctx: ConvertContext): Promise<unknown> {
  const { XMLParser, XMLValidator } = await import('fast-xml-parser')
  const xml = await ctx.file.text()
  const valid = XMLValidator.validate(xml)
  if (valid !== true) throw syntaxError('XML', { line: valid.err.line, col: valid.err.col })
  // processEntities stays limited to the predefined XML entities; DOCTYPE entities are never expanded.
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: ctx.options.parseValues !== false, processEntities: true, htmlEntities: false, ignoreDeclaration: true, ignorePiTags: true })
  return parser.parse(xml)
}

async function readAny(ctx: ConvertContext): Promise<unknown> {
  switch (ctx.input.formatId) {
    case 'json':
      return readJson(ctx)
    case 'yaml':
      return readYaml(ctx)
    case 'xml':
      return readXml(ctx)
    default:
      throw new ConversionError('unsupported-input', 'Unsupported input', 'This converter reads JSON, YAML or XML.')
  }
}

export const toJsonData: ConverterFn = async (ctx) => {
  const data = await readAny(ctx)
  const indent = ctx.options.indent === 'min' ? undefined : Number(ctx.options.indent ?? 2)
  const warnings = ctx.input.formatId === 'xml' ? ['XML attributes are stored as keys prefixed with "@_"; comments are dropped.'] : []
  return textOut(ctx, JSON.stringify(data, null, indent) + '\n', 'json', warnings)
}

export const toYaml: ConverterFn = async (ctx) => {
  const data = await readAny(ctx)
  const YAML = await import('yaml')
  return textOut(ctx, YAML.stringify(data, { indent: 2, lineWidth: 0 }), 'yaml')
}

export const toXml: ConverterFn = async (ctx) => {
  const data = await readAny(ctx)
  const { XMLBuilder } = await import('fast-xml-parser')
  const warnings: string[] = []
  let root = data
  if (Array.isArray(data) || data === null || typeof data !== 'object' || Object.keys(data as object).length !== 1) {
    root = { root: Array.isArray(data) ? { item: data } : data }
    warnings.push('XML needs a single root element, so the data was wrapped in <root>.')
  }
  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, indentBy: '  ', suppressEmptyNode: true })
  return textOut(ctx, `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build(root)}`, 'xml', warnings)
}
