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
  SectionHeader,
  SettingRow,
  Toggle,
} from '../shared/ui'
import { getActiveAccount, getLiveSession, getPlaybooks, getSettings, getTrades, saveSettings, setLiveSession } from '../shared/lib/storage'
import type { LiveSessionState } from '../shared/lib/storage'
import type { CurrentTabStatusResponse } from '../shared/lib/messages'
import { safeSendMessage } from '../shared/lib/extensionApi'
import { getProviderCapability } from '../shared/ai/providerConfig'
import type { AiProvider, Playbook, SessionSettings } from '../shared/types/playbook'
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
  openaiModel: 'gpt-4o-mini',
  claudeModel: 'claude-3-5-haiku-latest',
  deepseekModel: 'deepseek-chat',
  grokModel: 'grok-3-mini',
}

const MIN_COOLDOWN_MINUTES = 15

export default function App() {
  const [tab, setTab] = useState<Tab>('overview')
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS)
  const [trades, setTrades] = useState<TradeRecord[]>([])
  const [liveSessionData, setLiveSessionData] = useState<LiveSessionState | null>(null)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    getSettings().then(s => { if (s) setSettings(s) })
    getTrades('default').then(setTrades)
    getLiveSession().then(s => setLiveSessionData(s))
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

        {tab === 'overview' && <Overview settings={settings} trades={trades} liveSession={liveSessionData} onTabChange={setTab} />}
        {tab === 'risk' && <RiskSettings settings={settings} onChange={setSettings} />}
        {tab === 'playbooks' && <Playbooks onTabChange={setTab} />}
        {tab === 'ai' && <AISettings settings={settings} onChange={setSettings} />}
        {tab === 'trades' && <Trades trades={trades} />}
      </div>
    </AppShell>
  )
}

function validateSettings(settings: SessionSettings): string | null {
  if (settings.aiProvider !== 'off') {
    const meta = getProviderCapability(settings.aiProvider)
    if (meta.keyField) {
      const key = String(settings[meta.keyField] ?? '').trim()
      if (!key) return `${meta.label} API key is required when ${meta.label} is selected.`
    }
  }
  if (!Number.isFinite(settings.riskPercent) || settings.riskPercent <= 0) {
    return 'Risk percent must be greater than 0.'
  }
  if (!Number.isInteger(settings.maxTrades) || settings.maxTrades < 1) {
    return 'Max trades per day must be at least 1.'
  }
  if (!Number.isFinite(settings.cooldownMinutes) || settings.cooldownMinutes < MIN_COOLDOWN_MINUTES) {
    return `Cooldown after loss must be at least ${MIN_COOLDOWN_MINUTES} minutes.`
  }
  if (settings.autoNoTradeModeOnTarget && (!settings.dailyProfitTarget || settings.dailyProfitTarget <= 0)) {
    return 'Daily profit target is required when Auto No Trade Mode is enabled.'
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
          <Button
            key={id}
            onClick={() => onChange(id)}
            variant={active === id ? 'secondary' : 'subtle'}
            className="h-auto w-full justify-start px-3 py-3 text-left"
          >
            <span>
              <span className="block text-sm font-semibold">{label}</span>
              <span className="mt-0.5 block text-xs opacity-70">{hint}</span>
            </span>
          </Button>
        ))}
      </nav>
    </aside>
  )
}

function SessionStat({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-tc-surface px-3 py-2">
      <span className="text-xs text-tc-muted">{label}</span>
      <span className={`text-sm font-semibold ${tone === 'success' ? 'text-tc-green' : 'text-tc-text'}`}>{value}</span>
    </div>
  )
}

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function Overview({ settings, trades, liveSession, onTabChange }: {
  settings: SessionSettings
  trades: TradeRecord[]
  liveSession: LiveSessionState | null
  onTabChange: (tab: Tab) => void
}) {
  const score = liveSession?.disciplineScore ?? null
  const scoreTone = score == null ? 'neutral' : score >= 80 ? 'success' : score >= 60 ? 'warning' : 'danger'
  const hasSession = !!(liveSession?.accountBalance && liveSession.accountBalance > 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Risk rule" value={`${settings.riskPercent}%`} tone="success" sub="Of detected balance" />
        <MetricCard label="Max trades" value={`${settings.maxTrades}`} sub="Daily limit" />
        <MetricCard label="Discipline" value={score != null ? `${score}` : '—'} tone={scoreTone} sub="Current score" />
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
          <SectionHeader title="Active Session" sub="Live values from the current trading session." />
          <Pill tone={settings.enforcementMode === 'training' ? 'warning' : 'success'}>
            {settings.enforcementMode.replace('_', ' ')}
          </Pill>
          {hasSession ? (
            <div className="space-y-2">
              <SessionStat label="Balance" value={formatMoney(liveSession!.accountBalance)} />
              <SessionStat label="Risk / trade" value={formatMoney(liveSession!.riskPerTrade)} tone="success" />
              <SessionStat label="Trades today" value={`${liveSession!.tradesOpenedToday} / ${liveSession!.maxTrades}`} />
              <SessionStat label="Budget left" value={formatMoney(Math.max(0, liveSession!.dailyBudget + Math.min(0, liveSession!.dailyPnl)))} />
            </div>
          ) : (
            <p className="text-xs leading-5 text-tc-muted">
              No active session. Attach TC to a trading tab or enter a manual balance in Risk Formula.
            </p>
          )}
          <Button variant="secondary" fullWidth onClick={() => onTabChange('risk')}>Edit Risk Rules</Button>
        </Card>
      </div>
    </div>
  )
}

function RiskSettings({ settings, onChange }: { settings: SessionSettings; onChange: (s: SessionSettings) => void }) {
  const [liveSession, setLiveSessionState] = useState<LiveSessionState | null>(null)
  const [tabStatus, setTabStatus] = useState<CurrentTabStatusResponse | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualBalance, setManualBalance] = useState('')
  const [sessionMessage, setSessionMessage] = useState<string | null>(null)

  useEffect(() => {
    refreshSessionContext()
  }, [])

  function set<K extends keyof SessionSettings>(key: K, value: SessionSettings[K]) {
    onChange({ ...settings, [key]: value })
  }

  async function refreshSessionContext() {
    const [session, currentTab] = await Promise.all([
      getLiveSession().catch(() => null),
      safeSendMessage<CurrentTabStatusResponse>({ type: 'TC_GET_CURRENT_TAB_STATUS', timestamp: Date.now() }).catch(() => null),
    ])
    setLiveSessionState(session)
    setTabStatus(currentTab)
  }

  async function attachTradingTab() {
    await safeSendMessage({ type: 'TC_PIN_TAB', timestamp: Date.now() }).catch(() => null)
    await refreshSessionContext()
  }

  async function startManualSession() {
    const balance = parseFloat(manualBalance)
    if (!Number.isFinite(balance) || balance <= 0) {
      setSessionMessage('Enter a valid manual session balance.')
      return
    }
    await startSession(balance, 'Manual session balance')
  }

  async function startDetectedSession() {
    const balance = tabStatus?.snapshot?.accountBalance
    if (!balance || balance <= 0) {
      setSessionMessage('No detected account balance is available.')
      return
    }
    await startSession(balance, `${tabStatus?.snapshot?.platformName ?? 'Platform'} Adapter`)
  }

  async function startSession(balance: number, source: string) {
    const dailyBudget = balance * (settings.riskPercent / 100)
    const riskPerTrade = dailyBudget / settings.maxTrades
    const next: LiveSessionState = {
      accountId: 'default',
      startedAt: Date.now(),
      accountBalance: balance,
      dailyBudget,
      riskPerTrade,
      tradesOpenedToday: 0,
      dailyPnl: 0,
      peakDailyPnl: 0,
      noTradeMode: false,
      lockState: null,
      maxTrades: settings.maxTrades,
      disciplineScore: 100,
      enforcementMode: settings.enforcementMode,
      sessionSource: source,
    }
    await setLiveSession(next)
    setLiveSessionState(next)
    setSessionMessage(`Session values locked from ${source}.`)
    setManualOpen(false)
  }

  const detectedBalance = tabStatus?.snapshot?.accountBalance ?? null

  return (
    <div className="grid grid-cols-3 gap-6">
      <Card className="col-span-2 space-y-2">
        <SectionHeader title="Risk Rules" sub="Define how Trader's Companion calculates risk once a trading session is attached." />
        <SettingRow label="Risk percent of detected account balance" hint="Daily amount you are willing to put at risk.">
          <Input type="number" min={0.1} max={10} step={0.1} value={settings.riskPercent} onChange={e => set('riskPercent', parseFloat(e.target.value))} className="w-28" />
        </SettingRow>
        <SettingRow label="Max trades per day" hint="Your losing-streak limit for the session.">
          <Input type="number" min={1} max={20} value={settings.maxTrades} onChange={e => set('maxTrades', parseInt(e.target.value, 10))} className="w-28" />
        </SettingRow>
        <SettingRow label="Cooldown after loss" hint="Delay before a new trade can be considered.">
          <Input type="number" min={MIN_COOLDOWN_MINUTES} max={120} step={5} value={settings.cooldownMinutes} onChange={e => set('cooldownMinutes', parseInt(e.target.value, 10))} className="w-28" />
        </SettingRow>
        <SettingRow label="Auto No Trade Mode" hint="Turn on No Trade Mode after target hit.">
          <Toggle checked={settings.autoNoTradeModeOnTarget} onChange={v => set('autoNoTradeModeOnTarget', v)} />
        </SettingRow>
        <SettingRow label="Daily profit target" hint="Required if Auto No Trade Mode depends on a target.">
          <Input type="number" min={0} step={1} value={settings.dailyProfitTarget ?? ''} onChange={e => set('dailyProfitTarget', e.target.value ? parseFloat(e.target.value) : undefined)} placeholder="Optional" className="w-32" />
        </SettingRow>
        <SettingRow label="Green-day giveback limit" hint="Warn when this percent of peak profit is returned.">
          <Input type="number" min={10} max={90} step={5} value={settings.givebackLimitPercent} onChange={e => set('givebackLimitPercent', parseInt(e.target.value, 10))} className="w-28" />
        </SettingRow>
      </Card>

      <Card className="space-y-4">
        <SectionHeader title="Session Calculation" sub="Live values come from the active session, not settings." />
        <SessionCalculation
          liveSession={liveSession}
          tabStatus={tabStatus}
          detectedBalance={detectedBalance}
          settings={settings}
          manualOpen={manualOpen}
          manualBalance={manualBalance}
          message={sessionMessage}
          onAttach={attachTradingTab}
          onStartDetected={startDetectedSession}
          onManualOpen={() => setManualOpen(true)}
          onManualBalance={setManualBalance}
          onStartManual={startManualSession}
          onRefresh={refreshSessionContext}
        />
      </Card>
    </div>
  )
}

function Playbooks({ onTabChange }: { onTabChange: (tab: Tab) => void }) {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const account = await getActiveAccount()
      const items = account ? await getPlaybooks(account.id) : await getPlaybooks('default')
      setPlaybooks(items)
      setLoading(false)
    }
    void load()
  }, [])

  if (loading) {
    return <Card><EmptyState title="Loading playbooks" body="Reading local extension playbooks." /></Card>
  }

  if (playbooks.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No playbooks configured."
          body="Create playbooks from your rules so TC can compare chart reviews against real setup criteria."
          action={<Button variant="secondary" onClick={() => onTabChange('risk')}>Review Risk Rules</Button>}
        />
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      <Card className="col-span-2 space-y-5">
        <SectionHeader title="Playbook Builder" sub="Stored rules power sidecar review and checklist context." />
        {playbooks.map(playbook => (
          <div key={playbook.id} className="rounded-lg border border-tc-border bg-tc-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-tc-text">{playbook.name}</div>
                <div className="mt-1 text-xs text-tc-muted">
                  {playbook.allowedSessions.length ? playbook.allowedSessions.join(', ') : 'Any session'} · {playbook.allowedSymbols.length ? playbook.allowedSymbols.join(', ') : 'Any symbol'}
                </div>
              </div>
              <Badge tone={playbook.active ? 'success' : 'neutral'}>{playbook.active ? 'Active' : 'Inactive'}</Badge>
            </div>
          </div>
        ))}
      </Card>
      <Card className="space-y-4">
        <SectionHeader title="Rules Notes" sub="Quick reference for the selected stored playbooks." />
        <p className="text-sm leading-6 text-tc-sub">
          Full playbook editing is intentionally kept in the dedicated builder flow. The side panel reads these stored rules for review context.
        </p>
      </Card>
    </div>
  )
}

function SessionCalculation({
  liveSession,
  tabStatus,
  detectedBalance,
  settings,
  manualOpen,
  manualBalance,
  message,
  onAttach,
  onStartDetected,
  onManualOpen,
  onManualBalance,
  onStartManual,
  onRefresh,
}: {
  liveSession: LiveSessionState | null
  tabStatus: CurrentTabStatusResponse | null
  detectedBalance: number | null
  settings: SessionSettings
  manualOpen: boolean
  manualBalance: string
  message: string | null
  onAttach: () => void
  onStartDetected: () => void
  onManualOpen: () => void
  onManualBalance: (value: string) => void
  onStartManual: () => void
  onRefresh: () => void
}) {
  if (liveSession?.accountBalance && liveSession.accountBalance > 0) {
    const budgetLeft = Math.max(0, liveSession.dailyBudget + Math.min(0, liveSession.dailyPnl))
    return (
      <div className="space-y-3">
        <Badge tone="success">Session Locked</Badge>
        <p className="text-sm leading-6 text-tc-muted">
          Session values locked at {new Date(liveSession.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
        </p>
        <SessionStat label="Account balance" value={formatMoney(liveSession.accountBalance)} />
        <SessionStat label="Daily budget" value={formatMoney(liveSession.dailyBudget)} />
        <SessionStat label="Risk / trade" value={formatMoney(liveSession.riskPerTrade)} tone="success" />
        <SessionStat label="Trades today" value={`${liveSession.tradesOpenedToday} / ${liveSession.maxTrades || settings.maxTrades}`} />
        <SessionStat label="Budget left" value={formatMoney(budgetLeft)} />
        <SessionStat label="Source" value={liveSession.sessionSource ?? 'Session start'} />
        {message && <p className="text-xs text-tc-muted">{message}</p>}
      </div>
    )
  }

  if (detectedBalance && detectedBalance > 0) {
    const dailyBudget = detectedBalance * (settings.riskPercent / 100)
    const riskPerTrade = dailyBudget / settings.maxTrades
    return (
      <div className="space-y-3">
        <Badge tone="success">Balance Detected</Badge>
        <p className="text-sm leading-6 text-tc-muted">
          Balance detected from {tabStatus?.snapshot?.platformName ?? 'attached platform'}. Lock these values to start the session.
        </p>
        <SessionStat label="Account balance" value={formatMoney(detectedBalance)} />
        <SessionStat label="Daily budget" value={formatMoney(dailyBudget)} />
        <SessionStat label="Risk / trade" value={formatMoney(riskPerTrade)} tone="success" />
        <SessionStat label="Detection source" value={`${tabStatus?.snapshot?.platformName ?? 'Adapter'}`} />
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="primary" onClick={onStartDetected}>Lock Session Values</Button>
          <Button variant="secondary" onClick={onRefresh}>Refresh</Button>
        </div>
      </div>
    )
  }

  if (tabStatus?.pinned || tabStatus?.status === 'candidate' || tabStatus?.status === 'manual_attached') {
    return (
      <div className="space-y-4">
        <EmptyState
          title="Account balance not detected."
          body="TC is attached or available, but this platform did not expose a reliable account balance."
          className="py-4"
        />
        <Button variant="primary" fullWidth onClick={onManualOpen}>Enter Manual Session Balance</Button>
        {manualOpen && (
          <div className="space-y-3 rounded-xl bg-tc-surface p-3">
            <Input label="Manual session balance" value={manualBalance} onChange={e => onManualBalance(e.target.value)} placeholder="Enter balance" type="number" />
            <Button variant="primary" fullWidth onClick={onStartManual}>Start Manual Session</Button>
          </div>
        )}
        {message && <p className="text-xs text-tc-red">{message}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <EmptyState
        title="No trading session attached."
        body="Attach TC to a trading tab to calculate live risk, or enter a manual session balance."
        className="py-4"
      />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" onClick={onAttach}>Attach Trading Tab</Button>
        <Button variant="secondary" onClick={onManualOpen}>Enter Manual Balance</Button>
      </div>
      {manualOpen && (
        <div className="space-y-3 rounded-xl bg-tc-surface p-3">
          <Input label="Manual session balance" value={manualBalance} onChange={e => onManualBalance(e.target.value)} placeholder="Enter balance" type="number" />
          <Button variant="primary" fullWidth onClick={onStartManual}>Start Manual Session</Button>
        </div>
      )}
      {message && <p className="text-xs text-tc-red">{message}</p>}
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
  const providerMeta = getProviderCapability(selectedProvider)
  const keyField = providerMeta.keyField
  const modelField = providerMeta.modelField
  const apiKeyValue = keyField ? String(settings[keyField] ?? '') : ''
  const modelValue = modelField ? String(settings[modelField] ?? providerMeta.defaultModel ?? '') : ''

  function handleTestConnection() {
    if (selectedProvider === 'off') return
    if (!apiKeyValue.trim()) {
      setTestStatus(`Add a ${providerMeta.label} API key before testing.`)
      return
    }
    setTestStatus('Testing connection...')
    safeSendMessage<{ ok?: boolean; error?: string }>({ type: 'TC_TEST_AI_PROVIDER', timestamp: Date.now() })
      .then(response => {
        setTestStatus(response?.ok ? `${providerMeta.label} connection verified.` : response?.error ?? 'Connection test failed.')
      })
      .catch(error => {
        setTestStatus(error instanceof Error ? error.message : 'Connection test failed.')
      })
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      <Card className="col-span-2 space-y-6">
        <div className="flex items-start justify-between gap-5">
          <SectionHeader title="AI Provider" sub="Optional chart review. AI is a reviewer, not a signal engine." />
          <ProviderControl selected={selectedProvider} onChange={setProvider} />
        </div>

        {selectedProvider === 'off' ? (
          <div className="rounded-xl border border-tc-border bg-tc-surface p-6">
            <EmptyState
              title="AI chart review is disabled."
              body="The Pre-Trade Gate, risk rules, playbooks, locks, and trade logging will still work."
              className="py-6"
            />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Capability badges */}
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">Text</Badge>
              {providerMeta.supportsStreaming && <Badge tone="success">Streaming</Badge>}
              {providerMeta.supportsVision ? <Badge tone="success">Vision</Badge> : <Badge tone="neutral">No vision</Badge>}
              {providerMeta.supportsTools && <Badge tone="success">Tools</Badge>}
            </div>

            {/* API key field */}
            {keyField && (
              <ApiKeyField
                label={`${providerMeta.label} API key`}
                value={apiKeyValue}
                placeholder={selectedProvider === 'gpt4o' ? 'sk-...' : selectedProvider === 'claude' ? 'sk-ant-...' : 'API key'}
                helper="Stored locally in chrome.storage.local. Only used when this provider is active."
                visible={showKey}
                onToggleVisible={() => setShowKey(v => !v)}
                onChange={value => {
                  if (keyField) set(keyField, value as never)
                }}
              />
            )}

            {/* Model field */}
            {modelField && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-tc-sub">Model</label>
                <input
                  type="text"
                  value={modelValue}
                  onChange={e => {
                    if (modelField) set(modelField, e.target.value as never)
                  }}
                  placeholder={providerMeta.defaultModel ?? 'model name'}
                  spellCheck={false}
                  className="h-11 w-full rounded-xl border border-tc-border bg-tc-surface px-3 font-mono text-sm text-tc-text placeholder:text-tc-faint focus:border-tc-green/60 focus:outline-none"
                />
                <p className="text-xs leading-5 text-tc-muted">Leave blank to use the default model for this provider.</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={handleTestConnection}>
                Test {providerMeta.label} connection
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
          API keys are stored in chrome.storage.local on this browser. Provider selection is local. Chart screenshots are only sent when the selected provider/model supports vision and the user requests chart review.
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
    ['deepseek', 'DeepSeek'],
    ['grok', 'Grok'],
  ]

  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-tc-border bg-tc-surface p-1">
      {providers.map(([id, label]) => (
        <Button
          key={id}
          type="button"
          variant={selected === id ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => onChange(id)}
          className="min-w-[64px]"
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
