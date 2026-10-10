export interface JpegInfo {
  width?: number
  height?: number
  orientation?: number
  hasExif: boolean
  hasGps: boolean
  hasXmp: boolean
  hasIcc: boolean
  cameraModel?: string
}

function readTiff(buf: Uint8Array, start: number, length: number): { orientation?: number; hasGps: boolean; model?: string } {
  const dv = new DataView(buf.buffer, buf.byteOffset + start, length)
  if (length < 8) return { hasGps: false }
  const le = dv.getUint16(0) === 0x4949
  const u16 = (o: number) => dv.getUint16(o, le)
  const u32 = (o: number) => dv.getUint32(o, le)
  const ifd0 = u32(4)
  if (ifd0 + 2 > length) return { hasGps: false }
  const count = u16(ifd0)
  let orientation: number | undefined
  let hasGps = false
  let model: string | undefined
  for (let i = 0; i < count; i++) {
    const e = ifd0 + 2 + i * 12
    if (e + 12 > length) break
    const tag = u16(e)
    if (tag === 0x0112) orientation = u16(e + 8)
    if (tag === 0x8825) {
      const gpsOff = u32(e + 8)
      hasGps = gpsOff > 0 && gpsOff + 2 <= length && u16(gpsOff) > 0
    }
    if (tag === 0x0110) {
      const n = u32(e + 4)
      const off = n <= 4 ? e + 8 : u32(e + 8)
      if (off + n <= length) {
        model = new TextDecoder().decode(new Uint8Array(buf.buffer, buf.byteOffset + start + off, n)).replace(/\0+$/, '').trim()
      }
    }
  }
  return { orientation, hasGps, model }
}

/** Walks JPEG markers up to the start of scan. Never decodes image data. */
export function parseJpeg(buf: Uint8Array): JpegInfo {
  const info: JpegInfo = { hasExif: false, hasGps: false, hasXmp: false, hasIcc: false }
  let p = 2
  while (p + 4 <= buf.length) {
    if (buf[p] !== 0xff) break
    const marker = buf[p + 1]
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      p += 2
      continue
    }
    if (marker === 0xda || marker === 0xd9) break
    const len = (buf[p + 2] << 8) | buf[p + 3]
    const seg = p + 4
    if (marker === 0xe1) {
      const id = String.fromCharCode(...buf.subarray(seg, seg + 6))
      if (id === 'Exif\0\0') {
        info.hasExif = true
        const t = readTiff(buf, seg + 6, Math.min(len - 8, buf.length - seg - 6))
        info.orientation = t.orientation
        info.hasGps = t.hasGps
        info.cameraModel = t.model
      } else if (String.fromCharCode(...buf.subarray(seg, seg + 28)).startsWith('http://ns.adobe.com/xap/1.0/')) {
        info.hasXmp = true
      }
    }
    if (marker === 0xe2 && String.fromCharCode(...buf.subarray(seg, seg + 11)) === 'ICC_PROFILE') info.hasIcc = true
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      info.height = (buf[seg + 1] << 8) | buf[seg + 2]
      info.width = (buf[seg + 3] << 8) | buf[seg + 4]
    }
    p += 2 + len
  }
  return info
}

/** Minimal APP1 Exif segment containing only the orientation tag. */
function orientationOnlyExif(orientation: number): Uint8Array {
  const tiff = new Uint8Array([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian header, IFD0 at 8
    0x00, 0x01, // 1 entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation & 0xff, 0x00, 0x00, // Orientation SHORT
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ])
  const payload = new Uint8Array(6 + tiff.length)
  payload.set([0x45, 0x78, 0x69, 0x66, 0, 0])
  payload.set(tiff, 6)
  const seg = new Uint8Array(4 + payload.length)
  seg[0] = 0xff
  seg[1] = 0xe1
  seg[2] = ((payload.length + 2) >> 8) & 0xff
  seg[3] = (payload.length + 2) & 0xff
  seg.set(payload, 4)
  return seg
}

export interface StripReport {
  removed: string[]
  kept: string[]
}

/**
 * Removes EXIF, XMP, IPTC, comments and other APPn segments from a JPEG without re-encoding.
 * The ICC colour profile and Adobe colour-transform marker are kept so colours stay correct,
 * and a non-default orientation is re-written so the photo is not displayed rotated.
 */
export function stripJpegMetadata(buf: Uint8Array): { data: Uint8Array; report: StripReport } {
  const info = parseJpeg(buf)
  const parts: Uint8Array[] = [buf.subarray(0, 2)]
  const removed = new Set<string>()
  const kept = new Set<string>()
  let p = 2
  let wroteOrientation = false
  while (p + 4 <= buf.length) {
    if (buf[p] !== 0xff) break
    const marker = buf[p + 1]
    if (marker === 0xda) {
      parts.push(buf.subarray(p))
      p = buf.length
      break
    }
    const len = (buf[p + 2] << 8) | buf[p + 3]
    const end = p + 2 + len
    const seg = buf.subarray(p, end)
    const id = String.fromCharCode(...buf.subarray(p + 4, p + 4 + 14))
    let keep = true
    if (marker === 0xe0) keep = id.startsWith('JFIF')
    else if (marker === 0xe1) {
      keep = false
      removed.add(id.startsWith('Exif') ? 'EXIF (camera, date, GPS)' : 'XMP')
    } else if (marker === 0xe2) {
      keep = id.startsWith('ICC_PROFILE')
      if (keep) kept.add('ICC colour profile')
      else removed.add('APP2 data')
    } else if (marker === 0xed) {
      keep = false
      removed.add('IPTC / Photoshop')
    } else if (marker === 0xee) {
      keep = id.startsWith('Adobe')
    } else if (marker >= 0xe3 && marker <= 0xef) {
      keep = false
      removed.add(`APP${marker - 0xe0} data`)
    } else if (marker === 0xfe) {
      keep = false
      removed.add('Comment')
    }
    if (keep) parts.push(seg)
    if (!wroteOrientation && marker === 0xe0 && info.orientation && info.orientation !== 1) {
      parts.push(orientationOnlyExif(info.orientation))
      kept.add('Orientation flag')
      wroteOrientation = true
    }
    p = end
  }
  if (!wroteOrientation && info.orientation && info.orientation !== 1) {
    parts.splice(1, 0, orientationOnlyExif(info.orientation))
    kept.add('Orientation flag')
  }
  const total = parts.reduce((s, x) => s + x.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const x of parts) {
    out.set(x, o)
    o += x.length
  }
  return { data: out, report: { removed: [...removed], kept: [...kept] } }
}

const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'])

export function pngChunks(buf: Uint8Array): { type: string; start: number; end: number }[] {
  const chunks: { type: string; start: number; end: number }[] = []
  let p = 8
  while (p + 12 <= buf.length) {
    const len = ((buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3]) >>> 0
    const type = String.fromCharCode(...buf.subarray(p + 4, p + 8))
    const end = p + 12 + len
    if (end > buf.length) break
    chunks.push({ type, start: p, end })
    p = end
    if (type === 'IEND') break
  }
  return chunks
}

/** Removes textual and EXIF chunks from a PNG without touching pixel data. */
export function stripPngMetadata(buf: Uint8Array): { data: Uint8Array; report: StripReport } {
  const chunks = pngChunks(buf)
  const removed = new Set<string>()
  const kept = new Set<string>()
  const parts: Uint8Array[] = [buf.subarray(0, 8)]
  for (const c of chunks) {
    if (PNG_DROP.has(c.type)) {
      removed.add(c.type === 'eXIf' ? 'EXIF' : c.type === 'tIME' ? 'Modification time' : 'Text metadata')
      continue
    }
    if (c.type === 'iCCP' || c.type === 'sRGB') kept.add('Colour profile')
    parts.push(buf.subarray(c.start, c.end))
  }
  const total = parts.reduce((s, x) => s + x.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const x of parts) {
    out.set(x, o)
    o += x.length
  }
  return { data: out, report: { removed: [...removed], kept: [...kept] } }
}

export function parsePng(buf: Uint8Array) {
  if (buf.length < 33) return {}
  const dv = new DataView(buf.buffer, buf.byteOffset)
  const width = dv.getUint32(16)
  const height = dv.getUint32(20)
  const colorType = buf[25]
  const chunks = pngChunks(buf)
  const types = new Set(chunks.map((c) => c.type))
  let frameCount: number | undefined
  const actl = chunks.find((c) => c.type === 'acTL')
  if (actl) frameCount = dv.getUint32(actl.start + 8)
  return {
    width,
    height,
    hasAlpha: colorType === 4 || colorType === 6 || types.has('tRNS'),
    animated: !!actl && (frameCount ?? 0) > 1,
    frameCount,
    hasExif: types.has('eXIf'),
    hasText: types.has('tEXt') || types.has('iTXt') || types.has('zTXt'),
    hasIcc: types.has('iCCP'),
  }
}
