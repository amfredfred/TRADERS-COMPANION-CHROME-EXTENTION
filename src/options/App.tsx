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
  Textarea,
  Toggle,
} from '../shared/ui'
import type { ChecklistItem as ChecklistItemType, TradingSession } from '../shared/types/playbook'
import { getActiveAccount, getLiveSession, getPlaybooks, getSettings, getTrades, savePlaybooks, saveSettings, setLiveSession } from '../shared/lib/storage'
import type { LiveSessionState } from '../shared/lib/storage'
import type { CurrentTabStatusResponse } from '../shared/lib/messages'
import { safeSendMessage } from '../shared/lib/extensionApi'
import { getProviderCapability, type AIProviderCapability } from '../shared/ai/providerConfig'
import type { AiProvider, Playbook, SessionSettings } from '../shared/types/playbook'
import type { TradeRecord } from '../shared/types/trade'

type Tab = 'overview' | 'risk' | 'playbooks' | 'ai' | 'trades'

const DEFAULT_SETTINGS: SessionSettings = {
  userId: '',
  accountId: 'default',
  riskPercent: 1,
  dailyLossLimitPercent: 2,
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
  const [savedSettings, setSavedSettings] = useState<SessionSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    getSettings().then(s => { if (s) { setSettings(s); setSavedSettings(s) } })
    getTrades('default').then(setTrades)
    getLiveSession().then(s => setLiveSessionData(s))
  }, [])

  async function handleSave() {
    const validationError = validateSettings(settings)
    if (validationError) {
      setSaveError(validationError)
      return
    }

    setSaving(true)
    await saveSettings(settings)
    setSavedSettings(settings)
    setSaveError(null)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  const isDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings)

  const sidebar = <Sidebar active={tab} onChange={setTab} />

  return (
    <AppShell sidebar={sidebar} className="font-[Inter,ui-sans-serif,system-ui,sans-serif]">
      <div className="mx-auto max-w-6xl px-8 py-8">
        <PageHeader
          title="Trader's Companion"
          subtitle="Configure local review, playbooks, risk rules, and extension behavior."
          badge={<Badge tone="success">Chrome extension</Badge>}
          action={
            <div className="flex items-center gap-3">
              {saveError && <span className="max-w-[280px] text-right text-xs leading-5 text-tc-red">{saveError}</span>}
              <Button
                variant={isDirty ? 'primary' : 'secondary'}
                onClick={handleSave}
                disabled={saving || !isDirty}
              >
                {saving ? 'Saving…' : saved ? '✓ Saved' : isDirty ? 'Save Changes' : 'No changes'}
              </Button>
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
    const riskPerTrade = Math.round(balance * (settings.riskPercent / 100) * 100) / 100
    const dailyBudget  = Math.round(balance * ((settings.dailyLossLimitPercent ?? 2) / 100) * 100) / 100
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
        <SettingRow label="Risk per trade (% of balance)" hint="Maximum risk on a single trade, as a percentage of detected account balance.">
          <Input type="number" min={0.1} max={10} step={0.1} value={settings.riskPercent} onChange={e => set('riskPercent', parseFloat(e.target.value))} className="w-28" />
        </SettingRow>
        <SettingRow label="Daily loss limit (% of balance)" hint="Maximum total loss allowed per day, as a percentage of detected account balance.">
          <Input type="number" min={0.5} max={20} step={0.5} value={settings.dailyLossLimitPercent ?? 2} onChange={e => set('dailyLossLimitPercent', parseFloat(e.target.value))} className="w-28" />
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
        <SectionHeader title="Session Calculation" sub="Session values are calculated from the detected trading account and your configured risk rules." />
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

const ALL_SESSIONS: TradingSession[] = ['London', 'NY', 'Asian', 'Pacific']

function blankPlaybook(accountId: string): Playbook {
  return {
    id: crypto.randomUUID(),
    accountId,
    name: '',
    allowedSessions: [],
    htfBiasRequired: false,
    allowedSymbols: [],
    entryConfirmation: '',
    checklistItems: [],
    stopRule: '',
    maxTradesPerDay: 0,
    cooldownAfterLossMinutes: 0,
    active: true,
    createdAt: Date.now(),
  }
}

function Playbooks({ onTabChange: _onTabChange }: { onTabChange: (tab: Tab) => void }) {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [accountId, setAccountId] = useState('default')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Playbook | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const account = await getActiveAccount()
      const id = account?.id ?? 'default'
      setAccountId(id)
      setPlaybooks(await getPlaybooks(id))
      setLoading(false)
    }
    void load()
  }, [])

  async function persist(next: Playbook[]) {
    await savePlaybooks(accountId, next)
    setPlaybooks(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function startNew() {
    setEditing(blankPlaybook(accountId))
    setSaved(false)
  }

  async function saveEditing() {
    if (!editing || !editing.name.trim()) return
    const exists = playbooks.some(p => p.id === editing.id)
    const next = exists ? playbooks.map(p => p.id === editing.id ? editing : p) : [...playbooks, editing]
    await persist(next)
    setEditing(null)
  }

  async function deletePlaybook(id: string) {
    await persist(playbooks.filter(p => p.id !== id))
  }

  async function toggleActive(id: string) {
    await persist(playbooks.map(p => p.id === id ? { ...p, active: !p.active } : p))
  }

  if (loading) {
    return <Card><EmptyState title="Loading playbooks" body="Reading local extension storage." /></Card>
  }

  if (editing) {
    return <PlaybookEditor playbook={editing} onChange={setEditing} onSave={saveEditing} onCancel={() => setEditing(null)} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title="Playbooks" sub="Active playbooks are used by the pre-trade gate and sidecar review." />
        <Button variant="primary" onClick={startNew}>New Playbook</Button>
      </div>

      {saved && <p className="text-xs text-tc-green">Saved.</p>}

      {playbooks.length === 0 ? (
        <Card>
          <EmptyState
            title="No playbooks yet."
            body="Playbooks define your setup rules and checklist. The pre-trade gate and sidecar both read from the active playbook."
            action={<Button variant="primary" onClick={startNew}>Create First Playbook</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {playbooks.map(pb => (
            <Card key={pb.id} padding="sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-tc-text">{pb.name}</span>
                    <Badge tone={pb.active ? 'success' : 'neutral'}>{pb.active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-tc-muted">
                    {pb.checklistItems.length} checklist item{pb.checklistItems.length !== 1 ? 's' : ''}
                    {pb.allowedSymbols.length ? ` · ${pb.allowedSymbols.join(', ')}` : ''}
                    {pb.allowedSessions.length ? ` · ${pb.allowedSessions.join(', ')}` : ''}
                  </div>
                  {pb.stopRule && <div className="mt-1 text-xs text-tc-muted">Stop rule: {pb.stopRule}</div>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { setEditing(pb); setSaved(false) }}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => void toggleActive(pb.id)}>
                    {pb.active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void deletePlaybook(pb.id)}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function PlaybookEditor({ playbook, onChange, onSave, onCancel }: {
  playbook: Playbook
  onChange: (p: Playbook) => void
  onSave: () => void
  onCancel: () => void
}) {
  const [newItem, setNewItem] = useState('')
  const [symbolInput, setSymbolInput] = useState(playbook.allowedSymbols.join(', '))

  function patch(fields: Partial<Playbook>) {
    onChange({ ...playbook, ...fields })
  }

  function addChecklistItem() {
    const label = newItem.trim()
    if (!label) return
    const item: ChecklistItemType = { id: crypto.randomUUID(), label, required: true }
    patch({ checklistItems: [...playbook.checklistItems, item] })
    setNewItem('')
  }

  function removeChecklistItem(id: string) {
    patch({ checklistItems: playbook.checklistItems.filter(i => i.id !== id) })
  }

  function toggleItemRequired(id: string) {
    patch({
      checklistItems: playbook.checklistItems.map(i =>
        i.id === id ? { ...i, required: !i.required } : i,
      ),
    })
  }

  function toggleSession(session: TradingSession) {
    const current = playbook.allowedSessions
    patch({
      allowedSessions: current.includes(session)
        ? current.filter(s => s !== session)
        : [...current, session],
    })
  }

  function commitSymbols() {
    patch({
      allowedSymbols: symbolInput.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
    })
  }

  const canSave = !!playbook.name.trim()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <SectionHeader title={playbook.name || 'New Playbook'} sub="Define your setup rules and checklist." />
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onSave} disabled={!canSave}>Save Playbook</Button>
        </div>
      </div>

      <Card padding="sm" className="space-y-4">
        <SectionHeader title="Identity" sub="" />
        <Input
          label="Playbook name"
          value={playbook.name}
          onChange={e => patch({ name: e.target.value })}
          placeholder="CRT Reversal, ICT MMXM, Breakout..."
        />
        <Toggle
          label="Active — used by pre-trade gate and sidecar"
          checked={playbook.active}
          onChange={checked => patch({ active: checked })}
        />
      </Card>

      <Card padding="sm" className="space-y-4">
        <SectionHeader title="Checklist" sub="Items shown in the pre-trade gate before every order." />
        <div className="space-y-2">
          {playbook.checklistItems.map(item => (
            <div key={item.id} className="flex items-center gap-2 rounded-lg bg-tc-surface px-3 py-2">
              <span className="flex-1 text-sm text-tc-sub">{item.label}</span>
              <button
                onClick={() => toggleItemRequired(item.id)}
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${item.required ? 'bg-tc-green/15 text-tc-green' : 'bg-tc-surface text-tc-faint'}`}
              >
                {item.required ? 'Required' : 'Optional'}
              </button>
              <button onClick={() => removeChecklistItem(item.id)} className="text-tc-faint hover:text-tc-red text-xs">✕</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            placeholder="Add checklist item..."
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() } }}
            className="flex-1"
          />
          <Button variant="secondary" onClick={addChecklistItem} disabled={!newItem.trim()}>Add</Button>
        </div>
      </Card>

      <Card padding="sm" className="space-y-4">
        <SectionHeader title="Filters" sub="Optional constraints — leave blank for any." />
        <div>
          <div className="mb-2 text-xs font-medium text-tc-muted">Allowed sessions</div>
          <div className="flex flex-wrap gap-2">
            {ALL_SESSIONS.map(session => (
              <button
                key={session}
                onClick={() => toggleSession(session)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  playbook.allowedSessions.includes(session)
                    ? 'bg-tc-green/15 text-tc-green'
                    : 'bg-tc-surface text-tc-muted hover:text-tc-sub'
                }`}
              >
                {session}
              </button>
            ))}
          </div>
        </div>
        <Input
          label="Allowed symbols (comma separated)"
          value={symbolInput}
          onChange={e => setSymbolInput(e.target.value)}
          onBlur={commitSymbols}
          placeholder="XAUUSD, EURUSD, NQ..."
        />
        <Toggle
          label="HTF bias required before entry"
          checked={playbook.htfBiasRequired}
          onChange={checked => patch({ htfBiasRequired: checked })}
        />
      </Card>

      <Card padding="sm" className="space-y-4">
        <SectionHeader title="Rules" sub="Shown in the sidecar for quick reference." />
        <Textarea
          label="Entry confirmation rule"
          value={playbook.entryConfirmation}
          onChange={e => patch({ entryConfirmation: e.target.value })}
          placeholder="Wait for displacement + FVG fill on M5 before entry"
        />
        <Textarea
          label="Stop rule"
          value={playbook.stopRule}
          onChange={e => patch({ stopRule: e.target.value })}
          placeholder="Stop trading after 2 losses or when daily budget is 50% consumed"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Max trades per day"
            type="number"
            min="0"
            value={playbook.maxTradesPerDay || ''}
            onChange={e => patch({ maxTradesPerDay: Number(e.target.value) })}
            placeholder="0 = use session setting"
          />
          <Input
            label="Cooldown after loss (min)"
            type="number"
            min="0"
            value={playbook.cooldownAfterLossMinutes || ''}
            onChange={e => patch({ cooldownAfterLossMinutes: Number(e.target.value) })}
            placeholder="0 = use session setting"
          />
        </div>
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
    const sourceLabel = liveSession.sessionSource === 'auto_detected'
      ? 'Balance source: Auto-detected from platform'
      : liveSession.sessionSource ?? 'Session start'
    return (
      <div className="space-y-3">
        <Badge tone="success">Session Started</Badge>
        <p className="text-sm leading-6 text-tc-muted">
          Session values locked at {new Date(liveSession.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
        </p>
        <SessionStat label="Account balance" value={formatMoney(liveSession.accountBalance)} />
        <SessionStat label="Daily budget" value={formatMoney(liveSession.dailyBudget)} />
        <SessionStat label="Risk / trade" value={formatMoney(liveSession.riskPerTrade)} tone="success" />
        <SessionStat label="Trades today" value={`${liveSession.tradesOpenedToday} / ${liveSession.maxTrades || settings.maxTrades}`} />
        <SessionStat label="Budget left" value={formatMoney(budgetLeft)} />
        <SessionStat label="Source" value={sourceLabel} />
        {message && <p className="text-xs text-tc-muted">{message}</p>}
      </div>
    )
  }

  if (detectedBalance && detectedBalance > 0) {
    const riskPerTrade = Math.round(detectedBalance * (settings.riskPercent / 100) * 100) / 100
    const dailyBudget  = Math.round(detectedBalance * ((settings.dailyLossLimitPercent ?? 2) / 100) * 100) / 100
    return (
      <div className="space-y-3">
        <Badge tone="success">Balance Detected</Badge>
        <p className="text-sm leading-6 text-tc-muted">
          Balance detected from {tabStatus?.snapshot?.platformName ?? 'attached platform'}. Lock these values to start the session.
        </p>
        <SessionStat label="Account balance" value={formatMoney(detectedBalance)} />
        <SessionStat label="Risk / trade" value={formatMoney(riskPerTrade)} tone="success" />
        <SessionStat label="Daily budget" value={formatMoney(dailyBudget)} />
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
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')

  function set<K extends keyof SessionSettings>(key: K, value: SessionSettings[K]) {
    onChange({ ...settings, [key]: value })
  }

  function setProvider(provider: AiProvider) {
    set('aiProvider', provider)
    setShowKey(false)
    setTestState('idle')
    setTestMessage('')
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
      setTestState('error')
      setTestMessage(`Add a ${providerMeta.label} API key before testing.`)
      return
    }
    setTestState('testing')
    setTestMessage('Testing connection…')
    safeSendMessage<{ ok?: boolean; error?: string }>({ type: 'TC_TEST_AI_PROVIDER', timestamp: Date.now() })
      .then(response => {
        if (response?.ok) {
          setTestState('ok')
          setTestMessage(`${providerMeta.label} connection verified.`)
        } else {
          setTestState('error')
          setTestMessage(response?.error ?? 'Connection test failed.')
        }
      })
      .catch(error => {
        setTestState('error')
        setTestMessage(error instanceof Error ? error.message : 'Connection test failed.')
      })
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      <Card className="col-span-2 space-y-6">
        <SectionHeader
          title="AI Provider"
          sub="Optional chart review. The AI reads the connected chart tab — it does not generate signals or place trades."
        />

        <ProviderSelector selected={selectedProvider} onChange={setProvider} />

        {selectedProvider === 'off' ? (
          <div className="rounded-xl border border-tc-border bg-tc-surface px-6 py-8 text-center">
            <div className="mb-3 text-2xl leading-none text-tc-faint">—</div>
            <div className="mb-1.5 text-sm font-medium text-tc-sub">AI review is off</div>
            <div className="mx-auto max-w-[300px] text-xs leading-5 text-tc-muted">
              You can still use manual playbooks and session checks without an AI provider.
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <CapabilityChips meta={providerMeta} />

            {keyField && (
              <ApiKeyField
                label={`${providerMeta.label} API Key`}
                value={apiKeyValue}
                placeholder={selectedProvider === 'gpt4o' ? 'sk-…' : selectedProvider === 'claude' ? 'sk-ant-…' : 'API key'}
                helper="Stored locally in chrome.storage.local — only used when this provider is active."
                visible={showKey}
                onToggleVisible={() => setShowKey(v => !v)}
                onChange={value => { if (keyField) set(keyField, value as never) }}
              />
            )}

            {modelField && (
              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium uppercase tracking-wide text-tc-muted">Model</label>
                <input
                  type="text"
                  value={modelValue}
                  onChange={e => { if (modelField) set(modelField, e.target.value as never) }}
                  placeholder={providerMeta.defaultModel ?? 'model name'}
                  spellCheck={false}
                  className="h-9 w-full rounded-lg border border-tc-border bg-tc-surface px-3 font-mono text-xs text-tc-text placeholder:text-tc-faint focus:border-tc-green/60 focus:outline-none"
                />
                <p className="text-xs text-tc-faint">Leave blank to use the default.</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={handleTestConnection} disabled={testState === 'testing'}>
                Test {providerMeta.label} connection
              </Button>
              {testState !== 'idle' && (
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 flex-shrink-0 rounded-full ${
                    testState === 'testing' ? 'animate-pulse bg-yellow-500'
                    : testState === 'ok' ? 'bg-tc-green'
                    : 'bg-tc-red'
                  }`} />
                  <span className="text-xs text-tc-muted">{testMessage}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <PrivacyCard />
    </div>
  )
}

function ProviderSelector({ selected, onChange }: { selected: AiProvider; onChange: (provider: AiProvider) => void }) {
  const providers: AiProvider[] = ['off', 'gpt4o', 'claude', 'deepseek', 'grok']

  return (
    <div className="grid grid-cols-5 gap-2">
      {providers.map(id => {
        const meta = getProviderCapability(id)
        const isActive = selected === id
        const isOff = id === 'off'

        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={[
              'relative flex flex-col rounded-xl border p-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-tc-green/40',
              isActive
                ? 'border-tc-green/50 bg-tc-green/5 ring-1 ring-tc-green/20'
                : 'border-tc-border bg-tc-surface hover:border-tc-green/30 hover:bg-tc-elevated',
            ].join(' ')}
          >
            {isActive && (
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-tc-green" />
            )}
            <span className={`text-xs font-semibold leading-none ${isActive ? 'text-tc-text' : 'text-tc-sub'}`}>
              {isOff ? 'Off' : meta.label}
            </span>
            <div className="mt-2 flex flex-wrap gap-1">
              {isOff ? (
                <span className="text-[10px] leading-none text-tc-faint">Disabled</span>
              ) : (
                <>
                  {meta.supportsVision
                    ? <span className="rounded bg-tc-green/10 px-1 py-0.5 text-[10px] font-medium leading-none text-tc-green">Vision</span>
                    : <span className="rounded border border-tc-border px-1 py-0.5 text-[10px] font-medium leading-none text-tc-faint">Text</span>
                  }
                  {meta.supportsTools && (
                    <span className="rounded bg-tc-green/10 px-1 py-0.5 text-[10px] font-medium leading-none text-tc-green">Tools</span>
                  )}
                </>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function CapabilityChips({ meta }: { meta: AIProviderCapability }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge tone="neutral">Text</Badge>
      {meta.supportsStreaming && <Badge tone="success">Streaming</Badge>}
      {meta.supportsVision
        ? <Badge tone="success">Vision</Badge>
        : <Badge tone="warning">No vision</Badge>}
      {meta.supportsTools && <Badge tone="success">Tools</Badge>}
    </div>
  )
}

function PrivacyCard() {
  const rows: Array<{ icon: string; label: string; detail: string }> = [
    { icon: '🔑', label: 'No account required', detail: 'Works entirely within your browser.' },
    { icon: '💾', label: 'Local API keys', detail: "Stored in chrome.storage.local — never sent to Trader's Companion servers." },
    { icon: '📸', label: 'Chart screenshots', detail: 'Only sent when vision is active and chart review is explicitly requested.' },
    { icon: '👁', label: 'Review only', detail: 'AI reads the chart. It cannot place or modify trades.' },
  ]

  return (
    <Card className="space-y-4">
      <SectionHeader title="Privacy" sub="Local-first. No account needed." />
      <div className="space-y-4">
        {rows.map(row => (
          <div key={row.label} className="flex gap-3">
            <span className="mt-0.5 text-base leading-none">{row.icon}</span>
            <div>
              <div className="text-xs font-medium text-tc-sub">{row.label}</div>
              <div className="mt-0.5 text-xs leading-4 text-tc-muted">{row.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
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
    <div className="space-y-1.5">
      <label className="block text-[11px] font-medium uppercase tracking-wide text-tc-muted">{label}</label>
      <div className="flex min-w-0 gap-2">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className="h-10 min-w-0 flex-1 truncate rounded-xl border border-tc-border bg-tc-surface px-3 font-mono text-sm text-tc-text placeholder:text-tc-faint focus:border-tc-green/60 focus:outline-none"
        />
        <Button type="button" variant="secondary" size="sm" onClick={onToggleVisible}>
          {visible ? 'Hide' : 'Reveal'}
        </Button>
      </div>
      <p className="flex items-center gap-1.5 text-xs leading-5 text-tc-muted">
        <span>🔒</span>
        <span>{helper}</span>
      </p>
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
