import { Badge, Button, Card, ChecklistItem, MetricCard, ProgressBar } from '../shared/ui'

const features = [
  ['Pre-Trade Gate', 'Intercept Buy/Sell clicks and force a clear decision before execution.'],
  ['Playbook Rules', 'Turn discretionary setups into structured checklist enforcement.'],
  ['Risk Guard', 'Keep intended risk inside the daily formula you set.'],
  ['No Trade Mode', 'Voluntarily block new entries when the session is done.'],
  ['Green Day Protection', 'Protect profitable days from giveback decisions.'],
  ['Discipline Score', 'Track behavior separately from P&L.'],
]

const steps = [
  'Click Buy/Sell',
  'Pass the Pre-Trade Gate',
  'Log trade context',
  'TC detects rule breaks',
  'Review discipline data',
]

export default function App() {
  return (
    <main className="min-h-screen bg-tc-bg text-tc-text" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <header className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tc-green text-xs font-black text-[#06150f]">TC</div>
          <div className="text-sm font-semibold">Trader's Companion</div>
        </div>
        <Button variant="secondary">Install Extension</Button>
      </header>

      <section className="mx-auto grid max-w-7xl grid-cols-[0.9fr_1.1fr] gap-10 px-8 pb-20 pt-12">
        <div className="flex flex-col justify-center">
          <Badge tone="success" className="mb-5 w-fit">AI Accountability Partner for Traders</Badge>
          <h1 className="max-w-xl text-6xl font-semibold leading-[1.02] tracking-[-0.055em]">Stop breaking your own trading rules.</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-tc-sub">
            Trader's Companion adds a Pre-Trade Gate, discipline tracking, and rule enforcement on top of your web trading platform, so impulse has to pass through your own standards first.
          </p>
          <div className="mt-8 flex gap-3">
            <Button variant="primary" size="lg">Start Free</Button>
            <Button variant="secondary" size="lg">View Demo</Button>
          </div>
        </div>

        <HeroMockup />
      </section>

      <section className="mx-auto max-w-7xl px-8 py-16">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold tracking-tight">Everything points back to execution.</h2>
          <p className="mt-2 text-sm text-tc-muted">A focused extension UI for moments where decision quality matters.</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {features.map(([title, body]) => (
            <Card key={title}>
              <div className="text-base font-semibold text-tc-text">{title}</div>
              <p className="mt-2 text-sm leading-6 text-tc-muted">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-8 py-16">
        <Card className="grid grid-cols-[0.65fr_1fr] gap-10 p-8">
          <div>
            <Badge tone="neutral">How it works</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">A clean pause between impulse and execution.</h2>
          </div>
          <div className="grid gap-3">
            {steps.map((step, index) => (
              <div key={step} className="flex items-center gap-4 rounded-xl border border-tc-border bg-tc-surface p-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-tc-green/15 text-sm font-semibold text-tc-green">{index + 1}</div>
                <div className="text-sm font-medium text-tc-text">{step}</div>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </main>
  )
}

function HeroMockup() {
  return (
    <div className="rounded-3xl border border-tc-border bg-[#07090d] p-4">
      <div className="mb-4 flex gap-2">
        <span className="h-3 w-3 rounded-full bg-tc-red/70" />
        <span className="h-3 w-3 rounded-full bg-tc-amber/70" />
        <span className="h-3 w-3 rounded-full bg-tc-green/70" />
      </div>
      <div className="grid grid-cols-[1fr_390px] gap-4">
        <div className="relative min-h-[520px] overflow-hidden rounded-2xl border border-tc-border bg-tc-panel p-5">
          <div className="absolute inset-0 opacity-45 blur-[1px]">
            <Candles />
          </div>
          <div className="relative grid grid-cols-4 gap-2">
            <MetricCard label="Risk / trade" value="Session" className="p-4" />
            <MetricCard label="Budget" value="Detected" className="p-4" />
            <MetricCard label="Trades" value="Tracked" className="p-4" />
            <MetricCard label="Score" value="Live" tone="success" className="p-4" />
          </div>
        </div>
        <Card className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-tc-green text-xs font-black text-[#06150f]">TC</div>
              <div className="font-semibold">Pre-Trade Gate</div>
            </div>
            <Badge tone="success">Strict Mode</Badge>
          </div>
          <Card padding="none">
            <Info label="Setup" value="CRT Reversal" />
            <Info label="Symbol" value="XAUUSD" />
            <Info label="Direction" value="Buy" />
          </Card>
          <div className="space-y-2">
            {['HTF bias confirmed', 'Liquidity sweep confirmed', 'Retest complete'].map(item => (
              <ChecklistItem key={item} label={item} checked />
            ))}
          </div>
          <ProgressBar label="Risk usage" value={95} showValue />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary">Cancel Trade</Button>
            <Button variant="primary">Submit Trade</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-tc-border px-4 py-3 last:border-b-0">
      <span className="text-sm text-tc-muted">{label}</span>
      <span className="text-sm font-semibold text-tc-text">{value}</span>
    </div>
  )
}

function Candles() {
  const bars = Array.from({ length: 42 }, (_, i) => {
    const up = i % 3 !== 0
    const h = 32 + ((i * 17) % 120)
    const y = 240 - h / 2 + ((i * 9) % 80)
    return { x: 20 + i * 18, y, h, up }
  })
  return (
    <svg viewBox="0 0 820 520" className="h-full w-full">
      <g stroke="#273140" strokeWidth="1">
        {Array.from({ length: 9 }, (_, i) => <line key={`h-${i}`} x1="0" x2="820" y1={60 + i * 48} y2={60 + i * 48} />)}
        {Array.from({ length: 12 }, (_, i) => <line key={`v-${i}`} y1="0" y2="520" x1={40 + i * 68} x2={40 + i * 68} />)}
      </g>
      {bars.map((bar, i) => (
        <g key={i} stroke={bar.up ? '#2bbf89' : '#d97979'}>
          <line x1={bar.x} x2={bar.x} y1={bar.y - 22} y2={bar.y + bar.h + 22} />
          <rect x={bar.x - 5} y={bar.y} width="10" height={bar.h} fill={bar.up ? '#2bbf89' : '#d97979'} rx="2" />
        </g>
      ))}
    </svg>
  )
}
