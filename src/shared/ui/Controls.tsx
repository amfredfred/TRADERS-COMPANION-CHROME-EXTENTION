interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm text-tc-sub disabled:cursor-not-allowed disabled:opacity-50"
      aria-pressed={checked}
    >
      <span className={`relative h-6 w-10 rounded-full border transition-colors ${checked ? 'border-tc-green/40 bg-tc-green/25' : 'border-tc-border bg-tc-surface'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-current transition-transform ${checked ? 'translate-x-5 text-tc-green' : 'translate-x-1 text-tc-muted'}`} />
      </span>
      {label && <span>{label}</span>}
    </button>
  )
}

interface ChecklistItemProps {
  label: string
  checked: boolean
  onChange?: (checked: boolean) => void
}

export function ChecklistItem({ label, checked, onChange }: ChecklistItemProps) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!checked)}
      className="flex w-full items-center justify-between rounded-xl border border-tc-border bg-tc-surface px-4 py-3 text-left transition-colors hover:border-[#3a4350]"
    >
      <span className="flex items-center gap-3 text-sm text-tc-text">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${checked ? 'border-tc-green bg-tc-green text-[#06150f]' : 'border-tc-faint text-tc-faint'}`}>
          {checked ? 'OK' : ''}
        </span>
        {label}
      </span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${checked ? 'bg-tc-green/10 text-tc-green' : 'bg-tc-red/10 text-tc-red'}`}>
        {checked ? 'Yes' : 'No'}
      </span>
    </button>
  )
}

interface StatRowProps {
  label: string
  value: string
  tone?: 'default' | 'success' | 'warning' | 'danger'
}

export function StatRow({ label, value, tone = 'default' }: StatRowProps) {
  const valueClass = {
    default: 'text-tc-text',
    success: 'text-tc-green',
    warning: 'text-tc-amber',
    danger: 'text-tc-red',
  }[tone]

  return (
    <div className="flex items-center justify-between border-b border-tc-border px-4 py-3 last:border-b-0">
      <span className="text-sm text-tc-muted">{label}</span>
      <span className={`text-sm font-semibold ${valueClass}`}>{value}</span>
    </div>
  )
}
