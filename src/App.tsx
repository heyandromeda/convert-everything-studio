import { useCallback, useEffect, useState } from 'react'
import { WifiOffIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { BatchBar } from '@/components/BatchBar'
import { BatchToolbar } from '@/components/BatchToolbar'
import { CompatibilitySheet } from '@/components/CompatibilitySheet'
import { FileCard } from '@/components/FileCard'
import { FileDropzone } from '@/components/FileDropzone'
import { SettingsSheet } from '@/components/SettingsSheet'
import { addFiles } from '@/features/queue/runner'
import { useQueue } from '@/features/queue/store'
import { loadTheme, saveTheme, type ThemePref } from '@/features/settings/preferences'
import { useOnline } from '@/hooks/use-online'

function applyTheme(t: ThemePref) {
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111111' : '#ffffff')
}

export default function App() {
  const ids = useQueue((s) => s.items.map((i) => i.id).join(','))
  const itemIds = ids ? ids.split(',') : []
  const [theme, setTheme] = useState<ThemePref>(loadTheme)
  const [compatOpen, setCompatOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const online = useOnline()

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [theme])

  const onFiles = useCallback((files: File[]) => void addFiles(files), [])
  const hasItems = itemIds.length > 0

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main className={`mx-auto w-[min(100%-2rem,700px)] pt-[max(env(safe-area-inset-top),3rem)] ${hasItems ? 'pb-[calc(env(safe-area-inset-bottom)+15rem)]' : 'pb-12'}`}>
        <div className="mb-2 flex items-start justify-between gap-3">
          <p className="pt-2 text-xs tracking-[0.08em] text-[#666] uppercase dark:text-[#aaa]">Local utility</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCompatOpen(true)} aria-label="Supported formats">
              Formats
            </Button>
            <Button variant="secondary" onClick={() => setSettingsOpen(true)} aria-label="Settings and privacy">
              Settings
            </Button>
          </div>
        </div>
        {!online && (
          <p className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground" title="Offline: cached conversions still work">
            <WifiOffIcon className="size-3.5" /> Offline. Cached conversions still work.
          </p>
        )}
        <h1 className="mb-2 text-[2rem] leading-tight font-normal">Convert Everything</h1>
        <p className="mb-6 leading-normal text-[#555] dark:text-[#aaa]">
          Convert images, documents, spreadsheets, audio, video and archives. Files stay in this browser.
        </p>

        <FileDropzone onFiles={onFiles} compact={hasItems} />

        {hasItems ? (
          <section aria-label="Files" className="mt-4 space-y-4 border-t border-border pt-4">
            {itemIds.map((id) => (
              <FileCard key={id} id={id} />
            ))}
            <BatchToolbar />
          </section>
        ) : (
          <QuickGuide onShowFormats={() => setCompatOpen(true)} />
        )}

        <p className="mt-6 text-[0.8rem] text-[#777]">Runs entirely in your browser. Nothing is uploaded or stored.</p>
      </main>

      <BatchBar />
      <CompatibilitySheet open={compatOpen} onOpenChange={setCompatOpen} />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} theme={theme} onTheme={setTheme} />
      <Toaster position="top-center" offset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }} />
    </div>
  )
}

const EXAMPLES: [string, string][] = [
  ['PNG / JPEG / HEIC', 'WebP, AVIF, PNG, JPEG, PDF'],
  ['Photos', 'Remove GPS and camera metadata'],
  ['Images', 'Resize, compress, make icons'],
]

function QuickGuide({ onShowFormats }: { onShowFormats: () => void }) {
  return (
    <section className="mt-4 space-y-3" aria-label="What you can do">
      <ul className="space-y-1 text-[0.9rem] leading-normal text-[#555] dark:text-[#aaa]">
        {EXAMPLES.map(([from, to]) => (
          <li key={from}>
            <strong className="font-bold text-foreground">{from}.</strong> {to}
          </li>
        ))}
      </ul>
      <button onClick={onShowFormats} className="text-[0.9rem] font-bold underline underline-offset-2">
        See every supported conversion
      </button>
    </section>
  )
}
