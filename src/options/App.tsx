import { useState, useEffect } from 'react'
import { getSettings, saveSettings, getTrades } from '../shared/lib/storage'
import type { SessionSettings } from '../shared/types/playbook'
import type { TradeRecord }     from '../shared/types/trade'
import {
  Button, Card, Badge, Input, SectionHeader,
  AlertBox, SettingRow, EmptyState,
} from '../shared/ui'

type Tab = 'session' | 'ai' | 'trades' | 'about'

const DEFAULT_SETTINGS: SessionSettings = {
  userId:                    '',
  accountId:                 'default',
  riskPercent:               1,
  maxTrades:                 3,
  enforcementMode:           'training',
  cooldownMinutes:           15,
  givebackLimitPercent:      30,
  hardLockPercent:           50,
  autoNoTradeModeOnTarget:   false,
  aiProvider:                'claude',
}

const FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'

export default function App() {
  const [tab,      setTab]      = useState<Tab>('session')
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS)
  const [trades,   setTrades]   = useState<TradeRecord[]>([])
  const [saved,    setSaved]    = useState(false)

  useEffect(() => {
    getSettings().then(s => { if (s) setSettings(s) })
    getTrades('default').then(setTrades)
  }, [])

  async function handleSave() {
    await saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const NAV: Array<[Tab, string]> = [
    ['session', 'Session & Risk'],
    ['ai',      'AI & API Keys'],
    ['trades',  'Trade Log'],
    ['about',   'About'],
  ]

  return (
    <div className="min-h-screen bg-tc-bg text-tc-text" style={{ fontFamily: FONT }}>

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 border-b border-tc-border bg-tc-panel px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-tc-green/25 bg-tc-green/10">
          <span className="text-sm font-black text-tc-green">TC</span>
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-semibold text-tc-text">Trader's Companion</div>
          <div className="text-[11px] text-tc-muted">Settings & Control Room</div>
        </div>
        <div className="flex items-center gap-2">
          {(['Data · Local', 'Auth · None', 'AI · Opt-in'] as const).map(label => (
            <span key={label} className="rounded-full border border-tc-border bg-tc-surface px-2.5 py-1 text-[10px] font-medium text-tc-muted">
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex h-[calc(100vh-73px)]">

        {/* ── Sidebar nav ────────────────────────────────────────────── */}
        <nav className="w-52 shrink-0 border-r border-tc-border bg-tc-panel pt-3">
          {NAV.map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'w-full text-left px-4 py-2.5 text-[13px] font-medium transition-colors',
                tab === t
                  ? 'text-tc-text bg-tc-elevated border-r-2 border-tc-green'
                  : 'text-tc-muted hover:text-tc-sub hover:bg-tc-surface/50',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* ── Content ────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto px-8 py-6 max-w-2xl tc-scroll">
          {tab === 'session' && <SessionTab settings={settings} onChange={setSettings} onSave={handleSave} saved={saved} />}
          {tab === 'ai'      && <AITab      settings={settings} onChange={setSettings} onSave={handleSave} saved={saved} />}
          {tab === 'trades'  && <TradesTab  trades={trades} />}
          {tab === 'about'   && <AboutTab />}
        </main>

      </div>
    </div>
  )
}

// ── Session & Risk ────────────────────────────────────────────────────────────

function SessionTab({
  settings, onChange, onSave, saved,
}: {
  settings: SessionSettings
  onChange: (s: SessionSettings) => void
  onSave:   () => void
  saved:    boolean
}) {
  function set<K extends keyof SessionSettings>(key: K, value: SessionSettings[K]) {
    onChange({ ...settings, [key]: value })
  }

  const dailyBudget    = 10000 * (settings.riskPercent / 100)
  const riskPerTrade   = dailyBudget / settings.maxTrades

  return (
    <div className="space-y-8">

      {/* Enforcement Mode */}
      <section className="space-y-4">
        <SectionHeader
          title="Enforcement Mode"
          sub="Controls how strictly TC enforces your rules on each trade attempt."
        />
        <div className="grid grid-cols-3 gap-3">
          {([
            ['training',  'Training',  'Warnings, no hard locks'],
            ['strict',    'Strict',    'Full gate + hard locks'],
            ['prop_firm', 'Prop Firm', 'Firm-specific rule set'],
          ] as const).map(([mode, label, desc]) => (
            <button
              key={mode}
              onClick={() => set('enforcementMode', mode)}
              className={[
                'rounded-xl border px-4 py-4 text-left transition-all',
                settings.enforcementMode === mode
                  ? 'border-tc-green/40 bg-tc-green/10'
                  : 'border-tc-border bg-tc-surface hover:border-[#334155] hover:bg-tc-elevated',
              ].join(' ')}
            >
              <div className={`text-[13px] font-semibold ${settings.enforcementMode === mode ? 'text-tc-green' : 'text-tc-sub'}`}>
                {label}
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-tc-muted">{desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Risk Formula */}
      <section className="space-y-4">
        <SectionHeader
          title="Risk Formula"
          sub="Used by the Pre-Trade Gate to validate each order before it reaches the broker."
        />
        <Card padding="none" className="divide-y divide-tc-border">
          <SettingRow
            label="Risk percent of account"
            hint="% of your balance you're willing to risk per session"
            className="px-4"
          >
            <NumberInput
              value={settings.riskPercent}
              min={0.1} max={10} step={0.1}
              onChange={v => set('riskPercent', v)}
              suffix="%"
            />
          </SettingRow>
          <SettingRow
            label="Max trades per day"
            hint="Hard stop once this trade count is reached"
            className="px-4"
          >
            <NumberInput
              value={settings.maxTrades}
              min={1} max={20} step={1}
              onChange={v => set('maxTrades', v)}
            />
          </SettingRow>
          <SettingRow
            label="Revenge trade cooldown"
            hint="Minutes locked after a losing trade closes"
            className="px-4"
          >
            <NumberInput
              value={settings.cooldownMinutes}
              min={0} max={120} step={5}
              onChange={v => set('cooldownMinutes', v)}
              suffix="min"
            />
          </SettingRow>
        </Card>

        {/* Formula preview */}
        <div className="rounded-xl border border-tc-border bg-tc-elevated px-4 py-3.5 space-y-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-tc-muted">
            Formula preview — on a $10,000 account
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[13px] text-tc-sub">Daily budget</span>
            <span className="font-mono text-[13px] font-semibold text-tc-sub">${dailyBudget.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-tc-border">
            <span className="text-[13px] text-tc-sub">Risk per trade</span>
            <span className="font-mono text-[15px] font-bold text-tc-green">${riskPerTrade.toFixed(2)}</span>
          </div>
        </div>
      </section>

      {/* Green Day Protection */}
      <section className="space-y-4">
        <SectionHeader
          title="Green Day Protection"
          sub="Protect profitable sessions from giveback decisions."
        />
        <Card padding="none" className="divide-y divide-tc-border">
          <SettingRow
            label="Giveback warning"
            hint="Warn when you've returned this % of today's peak profit"
            className="px-4"
          >
            <NumberInput
              value={settings.givebackLimitPercent}
              min={10} max={90} step={5}
              onChange={v => set('givebackLimitPercent', v)}
              suffix="%"
            />
          </SettingRow>
          <SettingRow
            label="Hard lock threshold"
            hint="Lock entries when you've returned this % of peak profit"
            className="px-4"
          >
            <NumberInput
              value={settings.hardLockPercent}
              min={10} max={100} step={5}
              onChange={v => set('hardLockPercent', v)}
              suffix="%"
            />
          </SettingRow>
        </Card>
      </section>

      <SaveBar onSave={onSave} saved={saved} />
    </div>
  )
}

// ── AI & API Keys ─────────────────────────────────────────────────────────────

function AITab({
  settings, onChange, onSave, saved,
}: {
  settings: SessionSettings
  onChange: (s: SessionSettings) => void
  onSave:   () => void
  saved:    boolean
}) {
  function set<K extends keyof SessionSettings>(key: K, value: SessionSettings[K]) {
    onChange({ ...settings, [key]: value })
  }

  return (
    <div className="space-y-8">

      <section className="space-y-4">
        <SectionHeader
          title="AI Provider"
          sub="Optional chart review. AI is never a signal engine — only a reflection tool."
        />
        <div className="grid grid-cols-2 gap-3">
          {([
            ['claude', 'Claude (Anthropic)', 'claude-sonnet-4-6'],
            ['gpt4o',  'GPT-4o (OpenAI)',    'gpt-4o'],
          ] as const).map(([id, label, model]) => (
            <button
              key={id}
              onClick={() => set('aiProvider', id)}
              className={[
                'rounded-xl border px-4 py-3.5 text-left transition-all',
                settings.aiProvider === id
                  ? 'border-tc-purple/40 bg-tc-purple/10'
                  : 'border-tc-border bg-tc-panel hover:border-[#334155]',
              ].join(' ')}
            >
              <div className={`text-[13px] font-semibold ${settings.aiProvider === id ? 'text-[#c4b5fd]' : 'text-tc-sub'}`}>
                {label}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-tc-muted">{model}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="API Keys"
          sub="Stored in chrome.storage.local on this browser. Never transmitted to TC servers."
        />
        <Card padding="none" className="divide-y divide-tc-border">
          <div className="px-4 py-4">
            <Input
              label="Anthropic API key"
              type="password"
              value={settings.claudeApiKey ?? ''}
              onChange={e => set('claudeApiKey', e.target.value)}
              placeholder="sk-ant-..."
              className="font-mono"
            />
          </div>
          <div className="px-4 py-4">
            <Input
              label="OpenAI API key"
              type="password"
              value={settings.openaiApiKey ?? ''}
              onChange={e => set('openaiApiKey', e.target.value)}
              placeholder="sk-..."
              className="font-mono"
            />
          </div>
        </Card>

        <AlertBox
          tone="info"
          title="Local storage only"
          body="Keys are used only when you trigger AI chart review. TC has no backend server and cannot access these keys."
        />
      </section>

      <SaveBar onSave={onSave} saved={saved} />
    </div>
  )
}

// ── Trade Log ─────────────────────────────────────────────────────────────────

function TradesTab({ trades }: { trades: TradeRecord[] }) {
  if (trades.length === 0) {
    return (
      <EmptyState
        title="No trades logged yet"
        body="Trades appear here after you pass the Pre-Trade Gate for the first time."
      />
    )
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Trade Log"
        sub={`${trades.length} trade${trades.length !== 1 ? 's' : ''} recorded`}
      />
      <div className="space-y-2">
        {trades.map(trade => <TradeRow key={trade.id} trade={trade} />)}
      </div>
    </div>
  )
}

function TradeRow({ trade }: { trade: TradeRecord }) {
  const pnl   = trade.pnl ?? 0
  const isWin = pnl >= 0
  const date  = trade.openedAt ? new Date(trade.openedAt).toLocaleDateString() : '--'
  const time  = trade.openedAt ? new Date(trade.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div className="flex items-center gap-3 rounded-xl border border-tc-border bg-tc-panel px-4 py-3">
      <div className={`h-7 w-1 shrink-0 rounded-full ${isWin ? 'bg-tc-green' : 'bg-tc-red'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-semibold text-tc-text">{trade.symbol ?? 'UNKNOWN'}</span>
          <Badge tone={trade.direction === 'long' ? 'success' : 'danger'}>
            {trade.direction?.toUpperCase() ?? '--'}
          </Badge>
          {trade.flaggedUnplanned && <Badge tone="warning">Unplanned</Badge>}
          {trade.setupGrade && <Badge tone="neutral">{trade.setupGrade}</Badge>}
        </div>
        <div className="mt-0.5 text-[11px] text-tc-muted">{date} {time} · {trade.state}</div>
      </div>
      <div className={`shrink-0 text-[13px] font-bold ${isWin ? 'text-tc-green' : 'text-tc-red'}`}>
        {trade.pnl !== undefined ? `${isWin ? '+' : ''}$${pnl.toFixed(2)}` : '--'}
      </div>
    </div>
  )
}

// ── About ─────────────────────────────────────────────────────────────────────

function AboutTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-tc-green/25 bg-tc-green/10">
          <span className="text-xl font-black text-tc-green">TC</span>
        </div>
        <div>
          <div className="text-[17px] font-semibold text-tc-text">Trader's Companion</div>
          <div className="text-[12px] text-tc-muted">v0.1.0 · Chrome Extension · Local-first MVP</div>
        </div>
      </div>

      <Card padding="lg">
        <p className="text-[13px] leading-relaxed text-tc-sub italic">
          "The only trading tool that watches what you're doing, reads the chart you're looking at,
          and asks you the question you don't want to answer before the damage is done."
        </p>
      </Card>

      <div className="space-y-2 text-[13px] text-tc-muted">
        <p>Built for the trader who already has the edge and just needs to execute it consistently.</p>
        <p className="text-[12px] text-tc-faint">
          Current scope: local-first extension · injected gate · Match Trader &amp; MT5 adapters · trade state machine · optional AI keys.
        </p>
      </div>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function NumberInput({
  value, min, max, step, onChange, suffix,
}: {
  value:    number
  min:      number
  max:      number
  step:     number
  onChange: (v: number) => void
  suffix?:  string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => {
          const parsed = step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10)
          if (!isNaN(parsed)) onChange(parsed)
        }}
        className="w-20 h-9 rounded-[8px] border border-tc-border bg-tc-surface px-2.5 text-right text-[13px] text-tc-text focus:outline-none focus:border-tc-green/50"
      />
      {suffix && <span className="text-[12px] text-tc-muted">{suffix}</span>}
    </div>
  )
}

function SaveBar({ onSave, saved }: { onSave: () => void; saved: boolean }) {
  return (
    <div className="flex items-center gap-3 border-t border-tc-border pt-6">
      <Button variant="primary" size="md" onClick={onSave}>
        Save settings
      </Button>
      {saved && <span className="text-[12px] text-tc-green">Saved</span>}
    </div>
  )
}
