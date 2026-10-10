import type * as PdfJs from 'pdfjs-dist'

let loading: Promise<typeof PdfJs> | null = null

/** Loads the legacy pdf.js build (broader Safari support) with a same-origin worker. */
export function loadPdfJs(): Promise<typeof PdfJs> {
  loading ??= (async () => {
    const lib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof PdfJs
    lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href
    return lib
  })()
  return loading
}

export async function openPdf(data: Uint8Array | ArrayBuffer) {
  const lib = await loadPdfJs()
  const base = import.meta.env.BASE_URL
  return lib.getDocument({
    data: data instanceof Uint8Array ? data : new Uint8Array(data),
    enableXfa: false,
    cMapUrl: `${base}vendor/pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}vendor/pdfjs/standard_fonts/`,
    wasmUrl: `${base}vendor/pdfjs/wasm/`,
    stopAtErrors: false,
  }).promise
}
