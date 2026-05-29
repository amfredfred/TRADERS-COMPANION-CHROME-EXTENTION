export type AlertTone = 'success' | 'warning' | 'danger' | 'info'

interface Props {
  tone:       AlertTone
  title:      string
  body?:      string
  className?: string
  children?:  React.ReactNode
}

const cfg: Record<AlertTone, { wrap: string; title: string }> = {
  success: { wrap: 'border-tc-green/25 bg-tc-green/10', title: 'text-tc-green'  },
  warning: { wrap: 'border-tc-amber/25 bg-tc-amber/10', title: 'text-tc-amber'  },
  danger:  { wrap: 'border-tc-red/25   bg-tc-red/10',   title: 'text-[#fca5a5]' },
  info:    { wrap: 'border-tc-blue/25  bg-tc-blue/10',  title: 'text-[#93c5fd]' },
}

export function AlertBox({ tone, title, body, className = '', children }: Props) {
  const c = cfg[tone]
  return (
    <div className={`rounded-xl border px-4 py-3 ${c.wrap} ${className}`}>
      <div className={`text-[13px] font-semibold ${c.title}`}>{title}</div>
      {body && <p className="mt-1 text-[12px] leading-relaxed text-tc-sub">{body}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}
