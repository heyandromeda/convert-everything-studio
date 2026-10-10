import type { Capabilities, ConversionDef, DetectedFile, OptionField } from '../types'

const media = () => import('@/engines/media/convert')

const VIDEO_IN = ['mp4', 'mov', 'webm', 'mkv', 'avi', '3gp']
const AUDIO_IN = ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'opus', 'flac', 'aiff']

const needsWasm = (caps: Capabilities) =>
  caps.webAssembly ? { available: true } : { available: false, reason: 'Media conversion needs WebAssembly, which this browser has disabled.' }

const timePattern = /^(\d+(\.\d+)?|(\d+:)?\d{1,2}:\d{1,2}(\.\d+)?)$/
const trimFields: OptionField[] = [
  { key: 'trimStart', kind: 'text', label: 'Start at', placeholder: 'Beginning (e.g. 0:05)', default: '', pattern: timePattern, patternMessage: 'Use seconds (12.5) or minutes:seconds (1:05).' },
  { key: 'trimEnd', kind: 'text', label: 'End at', placeholder: 'End (e.g. 1:30)', default: '', pattern: timePattern, patternMessage: 'Use seconds (12.5) or minutes:seconds (1:05).' },
]

const bitrateField: OptionField = {
  key: 'bitrate', kind: 'select', label: 'Bitrate', default: '192',
  choices: [
    { value: '96', label: '96 kbps (voice)' },
    { value: '128', label: '128 kbps' },
    { value: '192', label: '192 kbps (recommended)' },
    { value: '256', label: '256 kbps' },
    { value: '320', label: '320 kbps (maximum)' },
  ],
}

const audioFields = (lossy: boolean): OptionField[] => [
  ...(lossy ? [bitrateField] : []),
  { key: 'sampleRate', kind: 'select', label: 'Sample rate', default: 'keep', choices: [{ value: 'keep', label: 'Keep original' }, { value: '48000', label: '48 kHz' }, { value: '44100', label: '44.1 kHz' }, { value: '22050', label: '22.05 kHz' }, { value: '16000', label: '16 kHz (speech)' }] },
  { key: 'channels', kind: 'select', label: 'Channels', default: 'keep', choices: [{ value: 'keep', label: 'Keep original' }, { value: 'stereo', label: 'Stereo' }, { value: 'mono', label: 'Mono' }] },
  ...trimFields,
  { key: 'stripMetadata', kind: 'toggle', label: 'Remove tags (title, artist, location…)', default: false },
]

const sizeWarnings = (input: DetectedFile, _o: unknown, caps: Capabilities): string[] => {
  const w: string[] = []
  const dur = input.metadata.media?.duration
  if (caps.isMobile && getCategory(input) === 'video') w.push('Video conversion runs on this phone’s processor and can be slow. Keep the screen on and Safari in the foreground.')
  if (caps.isMobile && dur && dur > 300 && getCategory(input) === 'video') w.push('This video is longer than 5 minutes; consider trimming it first.')
  return w
}

function getCategory(input: DetectedFile) {
  return VIDEO_IN.includes(input.formatId ?? '') ? 'video' : 'audio'
}

const AUDIO_TARGETS: { to: string; lossy: boolean; label: string; limitation: string }[] = [
  { to: 'mp3', lossy: true, label: 'MP3', limitation: 'LAME encoder, constant bitrate.' },
  { to: 'm4a', lossy: true, label: 'M4A (AAC)', limitation: 'FFmpeg native AAC encoder.' },
  { to: 'aac', lossy: true, label: 'AAC (raw ADTS)', limitation: 'Raw AAC stream; M4A is better supported by Apple apps.' },
  { to: 'ogg', lossy: true, label: 'OGG (Vorbis)', limitation: 'Vorbis plays in most browsers; iPhone playback requires iOS 17.4+ or another app.' },
  { to: 'opus', lossy: true, label: 'Opus', limitation: 'Opus in an Ogg container; best quality per bit, limited Apple support.' },
  { to: 'flac', lossy: false, label: 'FLAC', limitation: 'Lossless and compressed.' },
  { to: 'wav', lossy: false, label: 'WAV', limitation: '16-bit PCM, uncompressed.' },
  { to: 'aiff', lossy: false, label: 'AIFF', limitation: '16-bit PCM, uncompressed.' },
]

const audioDefs: ConversionDef[] = AUDIO_TARGETS.map((t) => ({
  id: `audio-to-${t.to}`,
  from: [...AUDIO_IN, ...VIDEO_IN],
  to: t.to,
  label: t.label,
  engine: 'ffmpeg-wasm',
  status: 'stable',
  lossy: t.lossy,
  editable: true,
  formatting: 'n/a',
  cost: 'heavy',
  limitations: [t.limitation, 'Downloads the ~32 MB FFmpeg engine on first use (cached afterwards).', 'From video: extracts the first audio track.'],
  maxInputMB: { mobile: 400, desktop: 2000 },
  options: audioFields(t.lossy),
  outputs: 'single',
  requires: needsWasm,
  warnings: sizeWarnings,
  load: async () => (await media()).toAudio(t.to),
}))

const videoFields: OptionField[] = [
  { key: 'quality', kind: 'select', label: 'Quality', default: 'balanced', choices: [{ value: 'high', label: 'High (larger file)' }, { value: 'balanced', label: 'Balanced' }, { value: 'small', label: 'Smallest file' }], visible: (v) => v.copyStreams !== true },
  { key: 'maxHeight', kind: 'select', label: 'Resolution', default: 'keep', choices: [{ value: 'keep', label: 'Keep original' }, { value: '1080', label: 'Up to 1080p' }, { value: '720', label: 'Up to 720p' }, { value: '480', label: 'Up to 480p' }, { value: '360', label: 'Up to 360p' }], visible: (v) => v.copyStreams !== true },
  { key: 'fps', kind: 'select', label: 'Frame rate', default: 'keep', choices: [{ value: 'keep', label: 'Keep original' }, { value: '30', label: '30 fps' }, { value: '24', label: '24 fps' }, { value: '15', label: '15 fps' }], visible: (v) => v.copyStreams !== true },
  { key: 'removeAudio', kind: 'toggle', label: 'Remove audio', default: false },
  ...trimFields,
  { key: 'stripMetadata', kind: 'toggle', label: 'Remove metadata (location, device, dates)', default: false },
]

const copyField: OptionField = {
  key: 'copyStreams', kind: 'toggle', label: 'Copy streams (fast, no quality loss)',
  help: 'Changes only the container. Works when the codecs are allowed in the target (e.g. H.264/HEVC MOV → MP4).', default: false,
}

const videoDefs: ConversionDef[] = [
  {
    id: 'video-to-mp4', from: VIDEO_IN, to: 'mp4', label: 'MP4 (H.264 + AAC)', engine: 'ffmpeg-wasm', status: 'experimental', lossy: true, editable: true, formatting: 'n/a', cost: 'heavy',
    limitations: ['x264 runs single-threaded in WebAssembly: expect a few seconds of processing per second of 1080p video on a phone.', 'Downloads the ~32 MB FFmpeg engine on first use.', 'Copy-streams mode is fast but HEVC copied into MP4 may need re-encoding to play in some apps.'],
    maxInputMB: { mobile: 400, desktop: 2000 }, options: [copyField, ...videoFields], outputs: 'single', requires: needsWasm, warnings: sizeWarnings,
    load: async () => (await media()).toVideo('mp4'),
  },
  {
    id: 'video-to-mov', from: VIDEO_IN, to: 'mov', label: 'MOV (H.264 + AAC)', engine: 'ffmpeg-wasm', status: 'experimental', lossy: true, editable: true, formatting: 'n/a', cost: 'heavy',
    limitations: ['Same encoder as MP4, QuickTime container.'],
    maxInputMB: { mobile: 400, desktop: 2000 }, options: [copyField, ...videoFields], outputs: 'single', requires: needsWasm, warnings: sizeWarnings,
    load: async () => (await media()).toVideo('mov'),
  },
  {
    id: 'video-to-mkv', from: VIDEO_IN, to: 'mkv', label: 'MKV (H.264 + AAC)', engine: 'ffmpeg-wasm', status: 'experimental', lossy: true, editable: true, formatting: 'n/a', cost: 'heavy',
    limitations: ['Matroska does not play in Safari or the iPhone Photos app.'],
    maxInputMB: { mobile: 400, desktop: 2000 }, options: [copyField, ...videoFields], outputs: 'single', requires: needsWasm, warnings: sizeWarnings,
    load: async () => (await media()).toVideo('mkv'),
  },
  {
    id: 'video-to-webm', from: VIDEO_IN, to: 'webm', label: 'WebM (VP8 + Opus)', engine: 'ffmpeg-wasm', status: 'experimental', lossy: true, editable: true, formatting: 'n/a', cost: 'heavy',
    limitations: ['VP8 for speed; VP9/AV1 encoding is impractically slow in the browser.', 'WebM plays in Safari 16+ but not in the iPhone Photos app.'],
    maxInputMB: { mobile: 300, desktop: 1500 }, options: videoFields, outputs: 'single', requires: needsWasm, warnings: sizeWarnings,
    load: async () => (await media()).toVideo('webm'),
  },
  {
    id: 'video-to-gif', from: VIDEO_IN, to: 'gif', label: 'Animated GIF', engine: 'ffmpeg-wasm', status: 'stable', lossy: true, editable: true, formatting: 'n/a', cost: 'heavy',
    limitations: ['256 colours, no sound.', 'Defaults to the first 10 seconds.'],
    maxInputMB: { mobile: 400, desktop: 2000 },
    options: [
      { key: 'gifWidth', kind: 'select', label: 'Width', default: '480', choices: [{ value: '320', label: '320 px' }, { value: '480', label: '480 px' }, { value: '640', label: '640 px' }, { value: '800', label: '800 px' }] },
      { key: 'gifFps', kind: 'select', label: 'Frame rate', default: '12', choices: [{ value: '8', label: '8 fps' }, { value: '12', label: '12 fps' }, { value: '15', label: '15 fps' }, { value: '24', label: '24 fps' }] },
      ...trimFields,
    ],
    outputs: 'single', requires: needsWasm, warnings: sizeWarnings,
    load: async () => (await media()).toGif,
  },
  {
    id: 'video-thumbnail', from: VIDEO_IN, to: 'jpeg', label: 'JPEG frame (thumbnail)', engine: 'ffmpeg-wasm', status: 'stable', lossy: true, editable: true, formatting: 'n/a', cost: 'heavy',
    limitations: ['Grabs a single frame at the chosen time.'],
    maxInputMB: { mobile: 400, desktop: 2000 },
    options: [{ key: 'at', kind: 'text', label: 'Time', placeholder: 'Middle of the first 2 s (e.g. 0:03)', default: '', pattern: timePattern, patternMessage: 'Use seconds (12.5) or minutes:seconds (1:05).' }],
    outputs: 'single', requires: needsWasm,
    load: async () => (await media()).videoThumbnail,
  },
]

export const mediaConversions: ConversionDef[] = [...videoDefs, ...audioDefs]
