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
      <span className={`relative h-6 w-10 rounded-full transition-colors ${checked ? 'bg-tc-green/30' : 'bg-tc-surface'}`}>
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
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all active:scale-[0.99] ${
        checked
          ? 'bg-tc-green/[0.07] hover:bg-tc-green/[0.10]'
          : 'bg-tc-surface/70 hover:bg-tc-surface'
      }`}
    >
      <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition-all ${
        checked ? 'bg-tc-green' : 'ring-1 ring-inset ring-tc-faint'
      }`}>
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
            <path d="M1 4l2.5 2.5L9 1" stroke="#06150f" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className={`text-sm transition-colors ${checked ? 'text-tc-text' : 'text-tc-muted'}`}>
        {label}
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
