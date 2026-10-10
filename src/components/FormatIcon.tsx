import {
  BracesIcon,
  FileArchiveIcon,
  FileAudioIcon,
  FileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
  PresentationIcon,
  type LucideIcon,
} from 'lucide-react'
import { getFormat } from '@/registry/formats'
import type { Category } from '@/registry/types'
import { cn } from '@/lib/utils'

const ICONS: Record<Category, LucideIcon> = {
  image: FileImageIcon,
  video: FileVideoIcon,
  audio: FileAudioIcon,
  document: FileTextIcon,
  presentation: PresentationIcon,
  spreadsheet: FileSpreadsheetIcon,
  archive: FileArchiveIcon,
  data: BracesIcon,
  other: FileIcon,
}

export const CATEGORY_LABEL: Record<Category, string> = {
  image: 'Images',
  video: 'Video',
  audio: 'Audio',
  document: 'Documents',
  presentation: 'Presentations',
  spreadsheet: 'Spreadsheets',
  archive: 'Archives',
  data: 'Data & text',
  other: 'Other',
}

export function FormatIcon({ formatId, className }: { formatId: string | null | undefined; className?: string }) {
  const Icon = ICONS[getFormat(formatId)?.category ?? 'other']
  return <Icon className={cn('size-5', className)} aria-hidden />
}
