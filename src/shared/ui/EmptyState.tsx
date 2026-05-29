interface Props {
  title:      string
  body?:      string
  action?:    React.ReactNode
  className?: string
}

export function EmptyState({ title, body, action, className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center py-14 text-center ${className}`}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-tc-border bg-tc-panel">
        <svg className="h-5 w-5 text-tc-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 17H7A5 5 0 0 1 7 7h2" />
          <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      </div>
      <div className="text-[14px] font-medium text-tc-sub">{title}</div>
      {body && <p className="mt-1.5 max-w-[220px] text-[12px] leading-relaxed text-tc-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
