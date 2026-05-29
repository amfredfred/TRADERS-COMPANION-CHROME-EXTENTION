interface Props {
  title:   string
  sub?:    string
  action?: React.ReactNode
}

export function SectionHeader({ title, sub, action }: Props) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-tc-text">{title}</h2>
        {sub && <p className="mt-0.5 text-[12px] leading-relaxed text-tc-muted">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
