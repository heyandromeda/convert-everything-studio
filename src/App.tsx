import { useCallback, useEffect, useState } from 'react'
import { LayoutGridIcon, SettingsIcon, ShieldCheckIcon, WifiOffIcon } from 'lucide-react'
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111318' : '#fafbfc')
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
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 pt-safe backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-safe">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Logo />
            <h1 className="truncate text-[17px] font-semibold tracking-tight">Convert Everything</h1>
          </div>
          {!online && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[12px] text-muted-foreground" title="Offline: cached conversions still work">
              <WifiOffIcon className="size-3.5" /> Offline
            </span>
          )}
          <Button variant="ghost" size="icon-touch" onClick={() => setCompatOpen(true)} aria-label="Supported formats">
            <LayoutGridIcon />
          </Button>
          <Button variant="ghost" size="icon-touch" onClick={() => setSettingsOpen(true)} aria-label="Settings and privacy">
            <SettingsIcon />
          </Button>
        </div>
      </header>

      <main className={`mx-auto max-w-3xl space-y-4 px-safe pt-3 ${hasItems ? 'pb-44' : 'pb-10'}`}>
        <p className="flex items-center gap-2 text-[13.5px] text-muted-foreground">
          <ShieldCheckIcon className="size-4 shrink-0 text-brand" aria-hidden />
          <span>
            <strong className="font-semibold text-foreground">Your files stay on your device.</strong> Conversion runs in this browser; nothing is uploaded.
          </span>
        </p>

        <FileDropzone onFiles={onFiles} compact={hasItems} />

        {hasItems && <BatchToolbar />}

        {hasItems ? (
          <section aria-label="Files" className="space-y-3">
            {itemIds.map((id) => (
              <FileCard key={id} id={id} />
            ))}
          </section>
        ) : (
          <QuickGuide onShowFormats={() => setCompatOpen(true)} />
        )}
      </main>

      <BatchBar />
      <CompatibilitySheet open={compatOpen} onOpenChange={setCompatOpen} />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} theme={theme} onTheme={setTheme} />
      <Toaster position="top-center" offset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }} />
    </div>
  )
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-brand" />
      <path d="M10 12.5h9.5l-2.6-2.6M22 19.5h-9.5l2.6 2.6" fill="none" className="stroke-brand-foreground" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const EXAMPLES: [string, string][] = [
  ['PNG / JPEG / HEIC', 'WebP, AVIF, PNG, JPEG, PDF'],
  ['Photos', 'Remove GPS & camera metadata'],
  ['Images', 'Resize, compress, make icons'],
]

function QuickGuide({ onShowFormats }: { onShowFormats: () => void }) {
  return (
    <section className="space-y-3 pt-2" aria-label="What you can do">
      <div className="grid gap-2 sm:grid-cols-3">
        {EXAMPLES.map(([from, to]) => (
          <div key={from} className="rounded-2xl border bg-card/60 p-3.5">
            <p className="text-[13px] font-semibold">{from}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{to}</p>
          </div>
        ))}
      </div>
      <button onClick={onShowFormats} className="text-[13.5px] font-medium text-brand underline-offset-4 hover:underline">
        See every supported conversion
      </button>
    </section>
  )
}
