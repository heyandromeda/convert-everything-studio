import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { DetectedFile, OptionField, OptionValues } from '@/registry/types'

interface Props {
  fields: OptionField[]
  values: OptionValues
  input: DetectedFile
  onChange: (patch: OptionValues) => void
  disabled?: boolean
}

export function ConversionOptions({ fields, values, input, onChange, disabled }: Props) {
  const visible = fields.filter((f) => (!f.visible || f.visible(values)) && (!f.appliesTo || f.appliesTo.includes(input.formatId ?? '')))
  if (!visible.length) return <p className="text-sm text-muted-foreground">This conversion has no settings.</p>
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {visible.map((f) => (
        <Field key={f.key} field={f} value={values[f.key] ?? f.default} input={input} onChange={(v) => onChange({ [f.key]: v })} disabled={disabled} />
      ))}
    </div>
  )
}

function Field({
  field,
  value,
  input,
  onChange,
  disabled,
}: {
  field: OptionField
  value: OptionValues[string]
  input: DetectedFile
  onChange: (v: OptionValues[string]) => void
  disabled?: boolean
}) {
  const id = useId()
  const help = field.help ? <p className="text-[13px] leading-snug text-muted-foreground">{field.help}</p> : null

  switch (field.kind) {
    case 'toggle':
      return (
        <div className="flex items-start justify-between gap-4 sm:col-span-2">
          <div className="space-y-1">
            <Label htmlFor={id} className="text-[15px]">{field.label}</Label>
            {help}
          </div>
          <Switch id={id} checked={value === true} onCheckedChange={(c) => onChange(c)} disabled={disabled} className="mt-0.5" />
        </div>
      )
    case 'select': {
      const choices = typeof field.choices === 'function' ? field.choices({ input }) : field.choices
      return (
        <div className="space-y-2">
          <Label htmlFor={id} className="text-[15px]">{field.label}</Label>
          <Select value={String(value)} onValueChange={(v) => onChange(v)} disabled={disabled}>
            <SelectTrigger id={id} className="h-11 w-full rounded-xl text-[15px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-72">
              {choices.map((c) => (
                <SelectItem key={c.value} value={c.value} className="py-2.5 text-[15px]">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {help}
        </div>
      )
    }
    case 'slider':
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor={id} className="text-[15px]">{field.label}</Label>
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {String(value)}
              {field.unit}
            </span>
          </div>
          <Slider
            id={id}
            min={field.min}
            max={field.max}
            step={field.step}
            value={[Number(value)]}
            onValueChange={([v]) => onChange(v)}
            disabled={disabled}
            className="py-2"
          />
          {help}
        </div>
      )
    case 'number':
      return (
        <div className="space-y-2">
          <Label htmlFor={id} className="text-[15px]">
            {field.label}
            {field.unit && <span className="ml-1 font-normal text-muted-foreground">({field.unit})</span>}
          </Label>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={field.min}
            max={field.max}
            step={field.step}
            placeholder={field.placeholder}
            value={value === '' || value === undefined ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={disabled}
            className="h-11 rounded-xl"
          />
          {help}
        </div>
      )
    case 'text':
      return (
        <div className="space-y-2">
          <Label htmlFor={id} className="text-[15px]">{field.label}</Label>
          <Input
            id={id}
            value={String(value ?? '')}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="h-11 rounded-xl"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {help}
        </div>
      )
    case 'color':
      return (
        <div className="space-y-2">
          <Label htmlFor={id} className="text-[15px]">{field.label}</Label>
          <div className="flex items-center gap-3">
            <input
              id={id}
              type="color"
              value={String(value)}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              className="h-11 w-16 cursor-pointer rounded-xl border border-input bg-transparent p-1"
            />
            <div className="flex gap-2">
              {['#ffffff', '#000000'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange(c)}
                  disabled={disabled}
                  aria-label={c === '#ffffff' ? 'White' : 'Black'}
                  className="size-9 rounded-lg border border-input"
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          {help}
        </div>
      )
  }
}
