import type { HTMLAttributes } from 'react'

interface AppShellProps extends HTMLAttributes<HTMLDivElement> {
  sidebar?: React.ReactNode
}

export function AppShell({ sidebar, children, className = '', ...rest }: AppShellProps) {
  return (
    <div {...rest} className={`min-h-screen bg-tc-bg text-tc-text antialiased ${className}`}>
      {sidebar ? (
        <div className="flex min-h-screen">
          {sidebar}
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      ) : children}
    </div>
  )
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  badge?: React.ReactNode
  action?: React.ReactNode
}

export function PageHeader({ title, subtitle, badge, action }: PageHeaderProps) {
  return (
    <header className="mb-8 flex items-start justify-between gap-6">
      <div>
        <div className="mb-3 flex items-center gap-3">{badge}</div>
        <h1 className="text-3xl font-semibold text-tc-text">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm leading-6 text-tc-sub">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}

interface SidePanelProps extends HTMLAttributes<HTMLElement> {
  width?: string
}

export function SidePanel({ width = '420px', className = '', children, ...rest }: SidePanelProps) {
  return (
    <aside {...rest} style={{ width }} className={`border-l border-tc-border/80 bg-tc-panel text-tc-text ${className}`}>
      {children}
    </aside>
  )
}

interface ModalProps {
  children: React.ReactNode
  className?: string
}

export function Modal({ children, className = '' }: ModalProps) {
  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/70 p-6">
      <div className={`w-full max-w-lg rounded-lg border border-tc-border bg-tc-panel ${className}`}>{children}</div>
    </div>
  )
}
