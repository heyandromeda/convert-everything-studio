import type { ConversionDef } from '../types'

const structured = () => import('@/engines/data/structured')
const subs = () => import('@/engines/data/subtitles')

const base = { editable: true, cost: 'light', outputs: 'single' } as const

export const dataConversions: ConversionDef[] = [
  {
    ...base, id: 'data-to-yaml', from: ['json', 'xml'], to: 'yaml', engine: 'yaml', status: 'stable', lossy: false, formatting: 'n/a',
    limitations: ['Comments are not preserved.'], load: async () => (await structured()).toYaml,
  },
  {
    ...base, id: 'data-to-json', from: ['yaml', 'xml', 'json'], to: 'json', engine: 'yaml', status: 'stable', lossy: false, formatting: 'n/a',
    limitations: ['XML attributes become "@_"-prefixed keys; XML comments are dropped.', 'YAML anchors are expanded (at most 100 aliases).'],
    options: [{ key: 'indent', kind: 'select', label: 'Formatting', default: '2', choices: [{ value: '2', label: 'Pretty (2 spaces)' }, { value: '4', label: 'Pretty (4 spaces)' }, { value: 'min', label: 'Minified' }] }],
    load: async () => (await structured()).toJsonData,
  },
  {
    ...base, id: 'data-to-xml', from: ['json', 'yaml'], to: 'xml', engine: 'fast-xml-parser', status: 'limited', lossy: false, formatting: 'n/a',
    limitations: ['Keys must be valid XML element names.', 'Data without a single top-level key is wrapped in <root>.'],
    load: async () => (await structured()).toXml,
  },
  {
    ...base, id: 'subs-to-vtt', from: ['srt', 'vtt'], to: 'vtt', engine: 'subtitles', status: 'stable', lossy: false, formatting: 'partial',
    limitations: ['Basic tags (<b>, <i>, <u>) carry over.'],
    options: [{ key: 'shiftMs', kind: 'number', label: 'Shift timing', unit: 'ms', default: 0, min: -3600000, max: 3600000, help: 'Positive delays subtitles, negative makes them earlier.' }],
    load: async () => (await subs()).convertSubtitles('vtt'),
  },
  {
    ...base, id: 'subs-to-srt', from: ['vtt', 'srt'], to: 'srt', engine: 'subtitles', status: 'stable', lossy: true, formatting: 'partial',
    limitations: ['WebVTT positioning, regions and styling blocks have no SRT equivalent and are dropped.'],
    options: [{ key: 'shiftMs', kind: 'number', label: 'Shift timing', unit: 'ms', default: 0, min: -3600000, max: 3600000, help: 'Positive delays subtitles, negative makes them earlier.' }],
    load: async () => (await subs()).convertSubtitles('srt'),
  },
]
