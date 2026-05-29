interface Props {
  title:   string
  sub?:    string
  action?: React.ReactNode
}

export function SectionHeader({ title, sub, action }: Props) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold text-tc-text">{title}</h2>
        {sub && <p className="mt-1 text-xs leading-5 text-tc-sub">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
