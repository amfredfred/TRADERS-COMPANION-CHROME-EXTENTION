import { useEffect, useState } from 'react'
import {
  AppShell,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  MetricCard,
  PageHeader,
  Pill,
  ProgressBar,
  SectionHeader,
  SettingRow,
  Textarea,
  Toggle,
} from '../shared/ui'
import { getSettings, getTrades, saveSettings } from '../shared/lib/storage'
import type { AiProvider, SessionSettings } from '../shared/types/playbook'
import type { TradeRecord } from '../shared/types/trade'

type Tab = 'overview' | 'risk' | 'playbooks' | 'ai' | 'trades'

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
  aiProvider: 'off',
}

export default function App() {
  const [tab, setTab] = useState<Tab>('overview')
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS)
  const [trades, setTrades] = useState<TradeRecord[]>([])
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    getSettings().then(s => { if (s) setSettings(s) })
    getTrades('default').then(setTrades)
  }, [])

  async function handleSave() {
    const validationError = validateSettings(settings)
    if (validationError) {
      setSaveError(validationError)
      return
    }

    await saveSettings(settings)
    setSaveError(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  const sidebar = <Sidebar active={tab} onChange={setTab} />

  return (
    <AppShell sidebar={sidebar} className="font-[Inter,ui-sans-serif,system-ui,sans-serif]">
      <div className="mx-auto max-w-6xl px-8 py-8">
        <PageHeader
          title="Trader's Companion"
          subtitle="Configure the extension gate, risk rules, playbooks, lock behavior, and local AI review settings from one calm control surface."
          badge={<Badge tone="success">Chrome extension</Badge>}
          action={
            <div className="flex items-center gap-3">
              {saveError && <span className="max-w-[280px] text-right text-xs leading-5 text-tc-red">{saveError}</span>}
              <Button variant="primary" onClick={handleSave}>{saved ? 'Saved' : 'Save Changes'}</Button>
            </div>
          }
        />

        {tab === 'overview' && <Overview settings={settings} trades={trades} />}
        {tab === 'risk' && <RiskSettings settings={settings} onChange={setSettings} />}
        {tab === 'playbooks' && <Playbooks />}
        {tab === 'ai' && <AISettings settings={settings} onChange={setSettings} />}
        {tab === 'trades' && <Trades trades={trades} />}
      </div>
    </AppShell>
  )
}

function validateSettings(settings: SessionSettings): string | null {
  if (settings.aiProvider === 'gpt4o' && !settings.openaiApiKey?.trim()) {
    return 'OpenAI API key is required only when GPT-4o is selected.'
  }
  if (settings.aiProvider === 'claude' && !settings.claudeApiKey?.trim()) {
    return 'Anthropic API key is required only when Claude is selected.'
  }
  return null
}

function Sidebar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const items: Array<[Tab, string, string]> = [
    ['overview', 'Overview', 'Session posture'],
    ['risk', 'Risk Formula', 'Budget and locks'],
    ['playbooks', 'Playbooks', 'Rules and setups'],
    ['ai', 'AI Provider', 'Chart review'],
    ['trades', 'Trade Log', 'History'],
  ]

  return (
    <aside className="w-64 border-r border-tc-border bg-tc-panel px-4 py-5">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tc-green text-xs font-black text-[#06150f]">TC</div>
        <div>
          <div className="text-sm font-semibold text-tc-text">Trader's Companion</div>
          <div className="text-xs text-tc-muted">Control room</div>
        </div>
      </div>
      <nav className="space-y-1">
        {items.map(([id, label, hint]) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`w-full rounded-xl px-3 py-3 text-left transition-colors ${active === id ? 'bg-tc-surface text-tc-text' : 'text-tc-muted hover:bg-tc-surface/60 hover:text-tc-sub'}`}
          >
            <div className="text-sm font-semibold">{label}</div>
            <div className="mt-0.5 text-xs opacity-70">{hint}</div>
          </button>
        ))}
      </nav>
    </aside>
  )
}

function Overview({ settings, trades }: { settings: SessionSettings; trades: TradeRecord[] }) {
  const dailyBudget = 10000 * (settings.riskPercent / 100)
  const riskPerTrade = dailyBudget / settings.maxTrades

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Risk / trade" value={`$${riskPerTrade.toFixed(2)}`} tone="success" sub={`${settings.riskPercent}% daily risk`} />
        <MetricCard label="Max trades" value={`${settings.maxTrades}`} sub="Daily limit" />
        <MetricCard label="Discipline" value="82" tone="success" sub="Current score" />
        <MetricCard label="Trades logged" value={`${trades.length}`} sub="Local browser" />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2 space-y-5">
          <SectionHeader title="Protection Stack" sub="The extension blocks the moments where execution quality breaks down." />
          <div className="grid grid-cols-2 gap-3">
            {['Pre-Trade Gate', 'Risk Guard', 'No Trade Mode', 'Green Day Protection', 'Mistake Tags', 'Platform Lock'].map(item => (
              <div key={item} className="rounded-xl border border-tc-border bg-tc-surface p-4">
                <div className="text-sm font-semibold text-tc-text">{item}</div>
                <div className="mt-1 text-xs leading-5 text-tc-muted">Configured through local extension settings.</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <SectionHeader title="Current Mode" sub="Controls how strict TC should be." />
          <Pill tone={settings.enforcementMode === 'training' ? 'warning' : 'success'}>{settings.enforcementMode.replace('_', ' ')}</Pill>
          <ProgressBar value={82} label="Discipline score" showValue />
          <Button variant="secondary" fullWidth>Edit Rules</Button>
        </Card>
      </div>
    </div>
  )
}

function RiskSettings({ settings, onChange }: { settings: SessionSettings; onChange: (s: SessionSettings) => void }) {
  function set<K extends keyof SessionSettings>(key: K, value: SessionSettings[K]) {
    onChange({ ...settings, [key]: value })
  }

  const dailyBudget = 10000 * (settings.riskPercent / 100)
  const riskPerTrade = dailyBudget / settings.maxTrades

  return (
    <div className="grid grid-cols-3 gap-6">
      <Card className="col-span-2 space-y-2">
        <SectionHeader title="Risk Formula" sub="Calculated at session start and enforced by the Pre-Trade Gate." />
        <SettingRow label="Risk percent of account" hint="Daily amount you are willing to put at risk.">
          <Input type="number" min={0.1} max={10} step={0.1} value={settings.riskPercent} onChange={e => set('riskPercent', parseFloat(e.target.value))} className="w-28" />
        </SettingRow>
        <SettingRow label="Max trades per day" hint="Your losing-streak limit for the session.">
          <Input type="number" min={1} max={20} value={settings.maxTrades} onChange={e => set('maxTrades', parseInt(e.target.value, 10))} className="w-28" />
        </SettingRow>
        <SettingRow label="Cooldown after loss" hint="Delay before a new trade can be considered.">
          <Input type="number" min={0} max={120} step={5} value={settings.cooldownMinutes} onChange={e => set('cooldownMinutes', parseInt(e.target.value, 10))} className="w-28" />
        </SettingRow>
        <SettingRow label="Auto No Trade Mode" hint="Turn on No Trade Mode after target hit.">
          <Toggle checked={settings.autoNoTradeModeOnTarget} onChange={v => set('autoNoTradeModeOnTarget', v)} />
        </SettingRow>
      </Card>

      <Card className="space-y-4">
        <SectionHeader title="Formula Preview" sub="Example on a $10,000 account." />
        <MetricCard label="Daily budget" value={`$${dailyBudget.toFixed(2)}`} className="p-4" />
        <MetricCard label="Risk / trade" value={`$${riskPerTrade.toFixed(2)}`} tone="success" className="p-4" />
        <ProgressBar value={Math.round(settings.riskPercent * 10)} label="Budget usage" showValue />
      </Card>
    </div>
  )
}

function Playbooks() {
  return (
    <div className="grid grid-cols-3 gap-6">
      <Card className="col-span-2 space-y-5">
        <SectionHeader title="Playbook Builder" sub="Structured rules power hard enforcement. Free-text notes guide AI review." />
        {['CRT Reversal', 'Liquidity Sweep', 'Range Play'].map((setup, index) => (
          <div key={setup} className="rounded-xl border border-tc-border bg-tc-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-tc-text">{setup}</div>
                <div className="mt-1 text-xs text-tc-muted">{index === 0 ? 'Active setup for London and NY sessions' : 'Draft setup'}</div>
              </div>
              <Badge tone={index === 0 ? 'success' : 'neutral'}>{index === 0 ? 'Active' : 'Draft'}</Badge>
            </div>
          </div>
        ))}
      </Card>
      <Card className="space-y-4">
        <SectionHeader title="Rules Notes" sub="Sent to AI as context only." />
        <Textarea placeholder="Describe your strategy rules in plain language." rows={7} />
        <Button variant="secondary" fullWidth>Save Playbook</Button>
      </Card>
    </div>
  )
}

function AISettings({ settings, onChange }: { settings: SessionSettings; onChange: (s: SessionSettings) => void }) {
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<string | null>(null)

  function set<K extends keyof SessionSettings>(key: K, value: SessionSettings[K]) {
    onChange({ ...settings, [key]: value })
  }

  function setProvider(provider: AiProvider) {
    set('aiProvider', provider)
    setShowKey(false)
    setTestStatus(null)
  }

  const selectedProvider = settings.aiProvider
  const providerMeta = getProviderMeta(selectedProvider)

  function handleTestConnection() {
    if (selectedProvider === 'off') return
    const key = selectedProvider === 'gpt4o' ? settings.openaiApiKey : settings.claudeApiKey
    if (!key?.trim()) {
      setTestStatus(`Add a ${providerMeta.keyLabel} before testing.`)
      return
    }
    setTestStatus('Key saved locally. Live connection testing is not enabled in this build.')
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      <Card className="col-span-2 space-y-6">
        <div className="flex items-start justify-between gap-5">
          <SectionHeader title="AI Provider" sub="Optional chart review. AI is a reviewer, not a signal engine." />
          <ProviderControl selected={selectedProvider} onChange={setProvider} />
        </div>

        {selectedProvider === 'off' ? (
          <div className="rounded-2xl border border-tc-border bg-tc-surface p-6">
            <EmptyState
              title="AI chart review is disabled."
              body="The Pre-Trade Gate, risk rules, playbooks, locks, and trade logging will still work."
              className="py-6"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <ApiKeyField
              label={providerMeta.keyLabel}
              value={selectedProvider === 'gpt4o' ? settings.openaiApiKey ?? '' : settings.claudeApiKey ?? ''}
              placeholder={providerMeta.placeholder}
              helper="Stored locally. Used only when AI chart review is enabled."
              visible={showKey}
              onToggleVisible={() => setShowKey(v => !v)}
              onChange={value => {
                if (selectedProvider === 'gpt4o') set('openaiApiKey', value)
                if (selectedProvider === 'claude') set('claudeApiKey', value)
              }}
            />

            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={handleTestConnection}>
                Test {providerMeta.testLabel} connection
              </Button>
              {testStatus && <span className="text-xs text-tc-muted">{testStatus}</span>}
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <SectionHeader title="Privacy" sub="Local-first by default." />
        <Badge tone="neutral">No account required</Badge>
        <p className="text-sm leading-6 text-tc-muted">
          API keys are stored in chrome.storage.local on this browser. Switching providers preserves saved keys, but only the selected provider is shown.
        </p>
      </Card>
    </div>
  )
}

function ProviderControl({ selected, onChange }: { selected: AiProvider; onChange: (provider: AiProvider) => void }) {
  const providers: Array<[AiProvider, string]> = [
    ['off', 'Off'],
    ['gpt4o', 'GPT-4o'],
    ['claude', 'Claude'],
  ]

  return (
    <div className="flex rounded-xl border border-tc-border bg-tc-surface p-1">
      {providers.map(([id, label]) => (
        <Button
          key={id}
          type="button"
          variant={selected === id ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => onChange(id)}
          className="min-w-[76px]"
        >
          {label}
        </Button>
      ))}
    </div>
  )
}

function ApiKeyField({
  label,
  value,
  placeholder,
  helper,
  visible,
  onToggleVisible,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  helper: string
  visible: boolean
  onToggleVisible: () => void
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-tc-sub">{label}</label>
      <div className="flex min-w-0 gap-2">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className="h-11 min-w-0 flex-1 truncate rounded-xl border border-tc-border bg-tc-surface px-3 font-mono text-sm text-tc-text placeholder:text-tc-faint focus:border-tc-green/60 focus:outline-none"
        />
        <Button type="button" variant="secondary" onClick={onToggleVisible}>
          {visible ? 'Hide' : 'Reveal'}
        </Button>
      </div>
      <p className="text-xs leading-5 text-tc-muted">{helper}</p>
    </div>
  )
}

function getProviderMeta(provider: AiProvider) {
  if (provider === 'gpt4o') {
    return {
      keyLabel: 'OpenAI API key',
      placeholder: 'sk-...',
      testLabel: 'OpenAI',
    }
  }

  if (provider === 'claude') {
    return {
      keyLabel: 'Anthropic API key',
      placeholder: 'sk-ant-...',
      testLabel: 'Anthropic',
    }
  }

  return {
    keyLabel: 'API key',
    placeholder: '',
    testLabel: '',
  }
}

function Trades({ trades }: { trades: TradeRecord[] }) {
  if (trades.length === 0) {
    return <Card><EmptyState title="No trades logged yet" body="Trades appear here after you use the Pre-Trade Gate." /></Card>
  }

  return (
    <Card className="space-y-3">
      <SectionHeader title="Trade Log" sub={`${trades.length} local trade records`} />
      {trades.map(trade => (
        <div key={trade.id} className="flex items-center justify-between rounded-xl border border-tc-border bg-tc-surface p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-tc-text">{trade.symbol ?? 'UNKNOWN'}</span>
              <Badge tone={trade.direction === 'short' ? 'danger' : 'success'}>{trade.direction ?? 'trade'}</Badge>
              {trade.setupGrade && <Badge>{trade.setupGrade}</Badge>}
            </div>
            <div className="mt-1 text-xs text-tc-muted">{trade.state}</div>
          </div>
          <div className={`text-sm font-semibold ${(trade.pnl ?? 0) >= 0 ? 'text-tc-green' : 'text-tc-red'}`}>
            {trade.pnl !== undefined ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : '--'}
          </div>
        </div>
      ))}
    </Card>
  )
}
