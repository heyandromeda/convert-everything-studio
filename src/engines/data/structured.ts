import { ConversionError } from '@/lib/errors'
import { outputName } from '@/lib/files'
import { mimeFor } from '@/registry/formats'
import type { ConvertContext, ConverterFn } from '@/registry/types'

const textOut = (ctx: ConvertContext, text: string, formatId: string, warnings: string[] = []) => ({
  outputs: [{ blob: new Blob([text], { type: `${mimeFor(formatId)};charset=utf-8` }), name: outputName(ctx.file.name, formatId, formatId === ctx.input.formatId ? '-formatted' : ''), formatId }],
  warnings,
})

const parseError = (fmt: string, e: unknown) =>
  new ConversionError('corrupt', `This ${fmt} is not valid`, e instanceof Error ? e.message.split('\n')[0].slice(0, 200) : 'It could not be parsed.', 'Fix the syntax error and try again.')

async function readJson(ctx: ConvertContext): Promise<unknown> {
  try {
    return JSON.parse((await ctx.file.text()).replace(/^\uFEFF/, ''))
  } catch (e) {
    throw parseError('JSON', e)
  }
}

async function readYaml(ctx: ConvertContext): Promise<unknown> {
  const YAML = await import('yaml')
  try {
    // Aliases are capped to defuse "billion laughs" style expansion.
    return YAML.parse(await ctx.file.text(), { maxAliasCount: 100, prettyErrors: true })
  } catch (e) {
    throw parseError('YAML', e)
  }
}

async function readXml(ctx: ConvertContext): Promise<unknown> {
  const { XMLParser, XMLValidator } = await import('fast-xml-parser')
  const xml = await ctx.file.text()
  const valid = XMLValidator.validate(xml)
  if (valid !== true) throw parseError('XML', new Error(`${valid.err.msg} (line ${valid.err.line})`))
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
