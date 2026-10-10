import type { FileMetadata } from '@/registry/types'

export async function inspectExtra(_file: File, _fmt: string): Promise<FileMetadata> {
  return {}
}
