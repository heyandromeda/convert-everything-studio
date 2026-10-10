declare module 'gifenc' {
  export type Palette = number[][]
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: Record<string, unknown>): Palette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: string): Uint8Array
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: Record<string, unknown>): void
    finish(): void
    bytes(): Uint8Array
  }
}

declare module 'utif' {
  interface IFD {
    width: number
    height: number
    t256?: number[]
    [key: string]: unknown
  }
  const UTIF: {
    decode(buf: ArrayBuffer): IFD[]
    decodeImage(buf: ArrayBuffer, ifd: IFD, ifds?: IFD[]): void
    toRGBA8(ifd: IFD): Uint8Array
    encodeImage(rgba: ArrayBuffer, w: number, h: number, metadata?: Record<string, unknown>): ArrayBuffer
  }
  export default UTIF
}

declare module 'html-to-pdfmake' {
  const htmlToPdfmake: (html: string, options?: Record<string, unknown>) => unknown
  export default htmlToPdfmake
}

declare module 'mammoth/mammoth.browser' {
  const mammoth: unknown
  export = mammoth
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'
  export const gfm: TurndownService.Plugin
}

declare module 'pdfmake/build/pdfmake'
declare module 'pdfmake/build/vfs_fonts'
