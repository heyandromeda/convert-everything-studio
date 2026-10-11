import { useState } from 'react'
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { clearStoredData, rememberSettingsEnabled, setRememberSettings, type ThemePref } from '@/features/settings/preferences'
import { getCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  theme: ThemePref
  onTheme: (t: ThemePref) => void
}

export function SettingsSheet({ open, onOpenChange, theme, onTheme }: Props) {
  const [remember, setRemember] = useState(rememberSettingsEnabled)
  const caps = getCapabilities()

  const clearCaches = async () => {
    clearStoredData()
    try {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.filter((k) => k.startsWith('ce-engines')).map((k) => caches.delete(k)))
      }
      toast.success('Saved settings and downloaded engines were cleared from this device.')
    } catch {
      toast.success('Saved settings were cleared.')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-4">
          <SheetTitle>Settings & privacy</SheetTitle>
          <SheetDescription>Stored only on this device.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5 pb-safe">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Appearance</h3>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
              {([
                ['dark', 'Dark', MoonIcon],
                ['light', 'Light', SunIcon],
                ['system', 'Auto', MonitorIcon],
              ] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={theme === value}
                  onClick={() => onTheme(value)}
                  className={cn(
                    'flex h-16 flex-col items-center justify-center gap-1 rounded-[4px] border text-[13px] font-bold transition-colors',
                    theme === value ? 'border-foreground bg-muted text-foreground' : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="remember" className="text-[15px]">Remember conversion settings</Label>
                <p className="text-[13px] leading-snug text-muted-foreground">Quality, size and similar choices. File names and contents are never stored.</p>
              </div>
              <Switch
                id="remember"
                checked={remember}
                onCheckedChange={(c) => {
                  setRemember(c)
                  setRememberSettings(c)
                }}
              />
            </div>
            <Button variant="outline" size="touch" className="w-full" onClick={clearCaches}>
              Clear saved settings and cached engines
            </Button>
          </section>

          <section className="space-y-2 text-[13.5px] leading-relaxed text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">How your files are handled</h3>
            <p>
              Conversion runs in this browser tab using JavaScript and WebAssembly. Selected files are read into memory on this device and are not sent
              to any server — the site's security policy blocks network requests to other origins.
            </p>
            <p>The web host only serves the app's code. There are no accounts, analytics, ads, or tracking.</p>
            <p>Converted files exist only in memory until you download them or close the tab.</p>
          </section>

          <section className="space-y-2 text-[13.5px] leading-relaxed text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">On iPhone</h3>
            <p>In Safari, tap Share, then Add to Home Screen. Convert Everything opens from your Home Screen without the browser toolbar.</p>
            <p>Downloads go to Files → Downloads. To save a picture to Photos, tap Share, then Save Image.</p>
            <p>Video conversion runs on this phone. Keep Safari in the foreground, and leave the screen on, until it finishes.</p>
          </section>

          <section className="space-y-1 text-[12.5px] text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">This browser</h3>
            <p>WebAssembly: {caps.webAssembly ? 'available' : 'unavailable'}</p>
            <p>Share sheet for files: {caps.webShareFiles ? 'available' : 'unavailable'}</p>
            <p>Max image size: {Math.round(caps.maxCanvasPixels / 1e6)} megapixels</p>
            <p>Parallel conversions: {caps.isMobile ? '1 (phone — saves memory)' : 'up to 3'}</p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
