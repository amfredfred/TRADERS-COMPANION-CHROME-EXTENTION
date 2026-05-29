interface Props {
  label:      string
  hint?:      string
  children:   React.ReactNode
  className?: string
}

export function SettingRow({ label, hint, children, className = '' }: Props) {
  return (
    <div className={`flex items-start justify-between gap-6 py-3.5 ${className}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-tc-text">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] leading-relaxed text-tc-muted">{hint}</div>}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  )
}
