import { useEffect, useId, useState } from 'react'
import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import './SelectField.css'

export interface SelectOption<Value extends string = string> {
  value: Value
  label: string
}

interface SelectFieldProps<Value extends string> {
  label: string
  value: Value
  options: readonly SelectOption<Value>[]
  onChange: (value: Value) => void
  hideLabel?: boolean
  compact?: boolean
}

/** One accessible, viewport-bounded dropdown for both library and study filters. */
export default function SelectField<Value extends string>({
  label, value, options, onChange, hideLabel = false, compact = false,
}: SelectFieldProps<Value>) {
  const id = useId()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    // Radix portals the menu and hides the page from assistive technology. Inert
    // also removes that background from keyboard focus, not just the ARIA tree.
    const root = document.getElementById('root')
    if (!root) return
    const previous = root.inert
    root.inert = true
    return () => { root.inert = previous }
  }, [open])

  return (
    <div className={`select-field${compact ? ' select-field--compact' : ''}`}>
      <label className={hideLabel ? 'sr-only' : 'select-field-label'} htmlFor={id}>{label}</label>
      <Select.Root open={open} onOpenChange={setOpen} value={value} onValueChange={(next) => {
        const option = options.find((item) => item.value === next)
        if (option) onChange(option.value)
      }}>
        <Select.Trigger id={id} className="select-trigger" aria-label={label} data-value={value}>
          <Select.Value />
          <Select.Icon className="select-chevron"><ChevronDown size={17} aria-hidden="true" /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="select-content"
            position="popper"
            sideOffset={6}
            collisionPadding={12}
            align="start"
            aria-label={`${label} options`}
          >
            <Select.ScrollUpButton className="select-scroll" aria-hidden="true"><ChevronUp size={16} /></Select.ScrollUpButton>
            <Select.Viewport className="select-viewport">
              {options.map((option) => (
                <Select.Item className="select-option" key={option.value} value={option.value} textValue={option.label} tabIndex={option.value === value ? 0 : -1}>
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="select-check"><Check size={16} aria-hidden="true" /></Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="select-scroll" aria-hidden="true"><ChevronDown size={16} /></Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}