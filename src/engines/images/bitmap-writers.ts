/** 24-bit bottom-up BMP. Alpha must already be composited onto a background. */
export function encodeBmp(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixelBytes = rowSize * height
  const fileSize = 54 + pixelBytes
  const out = new Uint8Array(fileSize)
  const dv = new DataView(out.buffer)
  out[0] = 0x42
  out[1] = 0x4d
  dv.setUint32(2, fileSize, true)
  dv.setUint32(10, 54, true)
  dv.setUint32(14, 40, true)
  dv.setInt32(18, width, true)
  dv.setInt32(22, height, true)
  dv.setUint16(26, 1, true)
  dv.setUint16(28, 24, true)
  dv.setUint32(30, 0, true)
  dv.setUint32(34, pixelBytes, true)
  dv.setInt32(38, 2835, true)
  dv.setInt32(42, 2835, true)
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4
    let dst = 54 + y * rowSize
    for (let x = 0; x < width; x++) {
      const i = src + x * 4
      out[dst++] = rgba[i + 2]
      out[dst++] = rgba[i + 1]
      out[dst++] = rgba[i]
    }
  }
  return out
}

export interface IcoImage {
  width: number
  height: number
  png: Uint8Array
}

/** ICO container with PNG-compressed entries (supported by Windows Vista+ and all browsers). */
export function encodeIco(images: IcoImage[]): Uint8Array {
  const headerSize = 6 + images.length * 16
  const total = headerSize + images.reduce((s, i) => s + i.png.length, 0)
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint16(0, 0, true)
  dv.setUint16(2, 1, true)
  dv.setUint16(4, images.length, true)
  let offset = headerSize
  images.forEach((img, idx) => {
    const p = 6 + idx * 16
    out[p] = img.width >= 256 ? 0 : img.width
    out[p + 1] = img.height >= 256 ? 0 : img.height
    out[p + 2] = 0
    out[p + 3] = 0
    dv.setUint16(p + 4, 1, true)
    dv.setUint16(p + 6, 32, true)
    dv.setUint32(p + 8, img.png.length, true)
    dv.setUint32(p + 12, offset, true)
    out.set(img.png, offset)
    offset += img.png.length
  })
  return out
}

export function svgWrapperForRaster(pngBase64: string, width: number, height: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- Embedded raster image. This SVG contains a bitmap, not traced vector paths. -->
  <image width="${width}" height="${height}" xlink:href="data:image/png;base64,${pngBase64}" href="data:image/png;base64,${pngBase64}"/>
</svg>
`
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(s)
}
