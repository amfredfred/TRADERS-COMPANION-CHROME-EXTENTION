import { useState, useEffect } from 'react'
import { getSettings, saveSettings, getTrades } from '../shared/lib/storage'
import type { SessionSettings } from '../shared/types/playbook'
import type { TradeRecord } from '../shared/types/trade'

type Tab = 'session' | 'ai' | 'trades' | 'about'

const DEFAULT_SETTINGS: SessionSettings = {
  userId: '',
  accountId: 'default',
  riskPercent: 1,
  maxTrades: 3,
  enforcementMode: 'training',
  cooldownMinutes: 15,
  givebackLimitPercent: 30,
  hardLockPercent: 50,
  autoNoTradeModeOnTarget: false,
  aiProvider: 'claude',
}

export default function App() {
  const [tab, setTab] = useState<Tab>('session')
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS)
  const [trades, setTrades] = useState<TradeRecord[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getSettings().then(s => { if (s) setSettings(s) })
    getTrades('default').then(setTrades)
  }, [])

  async function handleSave() {
    await saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="min-h-screen bg-[#0a0c12] text-[#e2e8f0]" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Top bar */}
      <div className="border-b border-[#1e2538] px-6 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#22c55e]/20 flex items-center justify-center">
          <span className="text-[#22c55e] text-sm font-bold">TC</span>
        </div>
        <div>
          <div className="text-sm font-semibold">Trader's Companion</div>
          <div className="text-[9px] uppercase tracking-widest text-[#64748b]">Settings</div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-53px)]">
        {/* Sidebar nav */}
        <nav className="w-48 border-r border-[#1e2538] pt-4 shrink-0">
          {([
            ['session', 'Session & Risk'],
            ['ai',      'AI & API Keys'],
            ['trades',  'Trade Log'],
            ['about',   'About'],
          ] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`
                w-full text-left px-4 py-2.5 text-sm transition-colors
                ${tab === t
                  ? 'text-[#e2e8f0] bg-[#141928] border-r-2 border-[#22c55e]'
                  : 'text-[#64748b] hover:text-[#94a3b8] hover:bg-[#0f1320]'
                }
              `}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-8 py-6 max-w-2xl">
          {tab === 'session' && (
            <SessionTab settings={settings} onChange={setSettings} onSave={handleSave} saved={saved} />
          )}
          {tab === 'ai' && (
            <AITab settings={settings} onChange={setSettings} onSave={handleSave} saved={saved} />
          )}
          {tab === 'trades' && (
            <TradesTab trades={trades} />
          )}
          {tab === 'about' && (
            <AboutTab />
          )}
        </main>
      </div>
    </div>
  )
}

// ── Tab: Session & Risk ───────────────────────────────────────────────────────

function SessionTab({
  settings, onChange, onSave, saved,
}: {
  settings: SessionSettings
  onChange: (s: SessionSettings) => void
  onSave: () => void
  saved: boolean
}) {
  function set<K extends keyof SessionSettings>(key: K, value: SessionSettings[K]) {
    onChange({ ...settings, [key]: value })
  }

  const dailyBudgetExample = 10000 * (settings.riskPercent / 100)
  const riskPerTradeExample = dailyBudgetExample / settings.maxTrades

  return (
    <div className="space-y-8">
      <SectionHeader title="Enforcement Mode" sub="How strictly TC enforces your rules" />

      <div className="grid grid-cols-3 gap-2">
        {(['training', 'strict', 'prop_firm'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => set('enforcementMode', mode)}
            className={`
              py-3 px-2 rounded-lg border text-sm font-medium transition-all text-center
              ${settings.enforcementMode === mode
                ? 'border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]'
                : 'border-[#1e2538] text-[#64748b] hover:border-[#2e3548] hover:text-[#94a3b8]'
              }
            `}
          >
            <div className="font-semibold capitalize">{mode.replace('_', ' ')}</div>
            <div className="text-[10px] mt-1 opacity-70">
              {mode === 'training' ? 'Warnings only' : mode === 'strict' ? 'Full locks' : 'Prop rules'}
            </div>
          </button>
        ))}
      </div>

      <SectionHeader title="Risk Formula" sub="Calculated fresh each session" />

      <div className="space-y-4">
        <FormRow label="Risk percent of account" hint="% of balance you're willing to risk today">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              value={settings.riskPercent}
              onChange={e => set('riskPercent', parseFloat(e.target.value))}
              className="w-24 bg-[#141928] border border-[#1e2538] rounded px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6]"
            />
            <span className="text-[#64748b] text-sm">%</span>
          </div>
        </FormRow>

        <FormRow label="Max trades per day" hint="Your losing streak limit">
          <input
            type="number"
            min={1}
            max={20}
            step={1}
            value={settings.maxTrades}
            onChange={e => set('maxTrades', parseInt(e.target.value, 10))}
            className="w-24 bg-[#141928] border border-[#1e2538] rounded px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6]"
          />
        </FormRow>

        <FormRow label="Revenge trade cooldown" hint="Minutes to lock after a loss">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={120}
              step={5}
              value={settings.cooldownMinutes}
              onChange={e => set('cooldownMinutes', parseInt(e.target.value, 10))}
              className="w-24 bg-[#141928] border border-[#1e2538] rounded px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6]"
            />
            <span className="text-[#64748b] text-sm">min</span>
          </div>
        </FormRow>
      </div>

      {/* Formula preview */}
      <div className="bg-[#0f1320] border border-[#1e2538] rounded-lg px-4 py-3 space-y-1.5">
        <div className="text-[10px] uppercase tracking-widest text-[#64748b] mb-2">Formula preview (on $10,000 balance)</div>
        <FormulaLine label="Daily budget" value={`$${dailyBudgetExample.toFixed(2)}`} />
        <FormulaLine label="Risk per trade" value={`$${riskPerTradeExample.toFixed(2)}`} highlight />
      </div>

      <SectionHeader title="Green Day Protection" sub="Lock in profits, guard your green days" />
      <div className="space-y-4">
        <FormRow label="Giveback warning" hint="Warn when you return this % of daily profit">
          <div className="flex items-center gap-2">
            <input
              type="number" min={10} max={90} step={5}
              value={settings.givebackLimitPercent}
              onChange={e => set('givebackLimitPercent', parseInt(e.target.value, 10))}
              className="w-24 bg-[#141928] border border-[#1e2538] rounded px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6]"
            />
            <span className="text-[#64748b] text-sm">%</span>
          </div>
        </FormRow>
        <FormRow label="Hard lock threshold" hint="Lock when you return this % of daily profit">
          <div className="flex items-center gap-2">
            <input
              type="number" min={10} max={100} step={5}
              value={settings.hardLockPercent}
              onChange={e => set('hardLockPercent', parseInt(e.target.value, 10))}
              className="w-24 bg-[#141928] border border-[#1e2538] rounded px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6]"
            />
            <span className="text-[#64748b] text-sm">%</span>
          </div>
        </FormRow>
      </div>

      <SaveBar onSave={onSave} saved={saved} />
    </div>
  )
}

// ── Tab: AI & API Keys ────────────────────────────────────────────────────────

function AITab({
  settings, onChange, onSave, saved,
}: {
  settings: SessionSettings
  onChange: (s: SessionSettings) => void
  onSave: () => void
  saved: boolean
}) {
  function set<K extends keyof SessionSettings>(key: K, value: SessionSettings[K]) {
    onChange({ ...settings, [key]: value })
  }

  return (
    <div className="space-y-8">
      <SectionHeader title="AI Provider" sub="Which model analyses your charts" />

      <div className="grid grid-cols-2 gap-3">
        {([
          ['claude', 'Claude (Anthropic)', 'claude-sonnet-4-20250514'],
          ['gpt4o',  'GPT-4o (OpenAI)',    'gpt-4o'],
        ] as const).map(([id, label, model]) => (
          <button
            key={id}
            onClick={() => set('aiProvider', id)}
            className={`
              py-3 px-4 rounded-lg border text-left transition-all
              ${settings.aiProvider === id
                ? 'border-[#8b5cf6] bg-[#8b5cf6]/10'
                : 'border-[#1e2538] hover:border-[#2e3548]'
              }
            `}
          >
            <div className={`text-sm font-semibold ${settings.aiProvider === id ? 'text-[#a78bfa]' : 'text-[#94a3b8]'}`}>{label}</div>
            <div className="text-[10px] text-[#64748b] mt-0.5">{model}</div>
          </button>
        ))}
      </div>

      <SectionHeader title="API Keys" sub="Stored locally — never sent to our servers" />

      <div className="space-y-4">
        <FormRow label="Anthropic API key" hint="Required for Claude analysis">
          <input
            type="password"
            value={settings.claudeApiKey ?? ''}
            onChange={e => set('claudeApiKey', e.target.value)}
            placeholder="sk-ant-…"
            className="w-full bg-[#141928] border border-[#1e2538] rounded px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#8b5cf6] font-mono"
          />
        </FormRow>

        <FormRow label="OpenAI API key" hint="Required for GPT-4o analysis">
          <input
            type="password"
            value={settings.openaiApiKey ?? ''}
            onChange={e => set('openaiApiKey', e.target.value)}
            placeholder="sk-…"
            className="w-full bg-[#141928] border border-[#1e2538] rounded px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#8b5cf6] font-mono"
          />
        </FormRow>
      </div>

      <div className="bg-[#141928] border border-[#1e2538] rounded-lg px-4 py-3">
        <p className="text-[11px] text-[#64748b] leading-relaxed">
          API keys are stored in <code className="text-[#94a3b8]">chrome.storage.local</code> on your machine only.
          They are never transmitted to Trader's Companion servers.
          Keys are sent directly to Anthropic or OpenAI when you request chart analysis.
        </p>
      </div>

      <SaveBar onSave={onSave} saved={saved} />
    </div>
  )
}

// ── Tab: Trade Log ────────────────────────────────────────────────────────────

function TradesTab({ trades }: { trades: TradeRecord[] }) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-[#64748b] text-sm">No trades logged yet.</div>
        <div className="text-[#64748b] text-xs mt-1">Trades appear here after you use the Pre-Trade Gate.</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SectionHeader title={`Trade Log`} sub={`${trades.length} trade${trades.length !== 1 ? 's' : ''} recorded`} />
      <div className="space-y-2">
        {trades.map(trade => (
          <TradeRow key={trade.id} trade={trade} />
        ))}
      </div>
    </div>
  )
}

function TradeRow({ trade }: { trade: TradeRecord }) {
  const pnl = trade.pnl ?? 0
  const isWin = pnl >= 0
  const date = trade.openedAt ? new Date(trade.openedAt).toLocaleDateString() : '—'
  const time = trade.openedAt ? new Date(trade.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div className="bg-[#0f1320] border border-[#1e2538] rounded-lg px-4 py-3 flex items-center gap-4">
      <div className={`w-1 h-8 rounded-full self-center ${isWin ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#e2e8f0]">{trade.symbol ?? 'UNKNOWN'}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${trade.direction === 'long' ? 'bg-[#22c55e]/15 text-[#22c55e]' : 'bg-[#ef4444]/15 text-[#ef4444]'}`}>
            {trade.direction?.toUpperCase() ?? '—'}
          </span>
          {trade.flaggedUnplanned && (
            <span className="text-[10px] text-[#f59e0b] bg-[#f59e0b]/10 px-1.5 py-0.5 rounded">Unplanned</span>
          )}
          {trade.setupGrade && (
            <span className="text-[10px] text-[#64748b] border border-[#1e2538] px-1.5 py-0.5 rounded">{trade.setupGrade}</span>
          )}
        </div>
        <div className="text-[10px] text-[#64748b] mt-0.5">{date} {time} · {trade.state}</div>
      </div>
      <div className={`text-sm font-bold ${isWin ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
        {trade.pnl !== undefined ? `${isWin ? '+' : ''}$${pnl.toFixed(2)}` : '—'}
      </div>
    </div>
  )
}

// ── Tab: About ────────────────────────────────────────────────────────────────

function AboutTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-[#22c55e]/15 flex items-center justify-center">
          <span className="text-[#22c55e] text-xl font-bold">TC</span>
        </div>
        <div>
          <div className="text-lg font-semibold">Trader's Companion</div>
          <div className="text-[#64748b] text-sm">Version 0.1.0 · Phase 1 Scaffold</div>
        </div>
      </div>

      <div className="bg-[#0f1320] border border-[#1e2538] rounded-lg px-5 py-4">
        <p className="text-[#94a3b8] text-sm leading-relaxed italic">
          "The only trading tool that watches what you're doing, reads the chart you're looking at,
          and asks you the question you don't want to answer — before the damage is done."
        </p>
      </div>

      <div className="space-y-2 text-sm text-[#64748b]">
        <p>Built for the trader who already has the edge — and just needs to execute it.</p>
        <p className="text-xs">Phase 1: Extension scaffold, Match Trader adapter, trade state machine, Supabase schema.</p>
      </div>
    </div>
  )
}

// ── Shared components ─────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-[#e2e8f0]">{title}</h2>
      <p className="text-xs text-[#64748b] mt-0.5">{sub}</p>
    </div>
  )
}

function FormRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="pt-1.5">
        <div className="text-sm text-[#e2e8f0]">{label}</div>
        {hint && <div className="text-[10px] text-[#64748b] mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function FormulaLine({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[#64748b]">{label}</span>
      <span className={`text-xs font-mono font-semibold ${highlight ? 'text-[#22c55e]' : 'text-[#94a3b8]'}`}>{value}</span>
    </div>
  )
}

function SaveBar({ onSave, saved }: { onSave: () => void; saved: boolean }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button
        onClick={onSave}
        className="px-5 py-2 rounded bg-[#22c55e] text-white text-sm font-semibold hover:bg-[#16a34a] transition-colors"
      >
        Save settings
      </button>
      {saved && <span className="text-[#22c55e] text-xs">✓ Saved</span>}
    </div>
  )
}
