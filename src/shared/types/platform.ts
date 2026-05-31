import type { PlatformName } from '../../content/adapters/types'

export type TabDetectionState =
  | 'not_eligible'
  | 'platform_disabled'
  | 'candidate'
  | 'verified_platform'
  | 'manual_attached'
  | 'adapter_active'

export type PlatformLifecycleState =
  | 'unsupported'
  | 'detecting_platform'
  | 'platform_ready'
  | 'detecting_account'
  | 'account_detected'
  | 'account_switching'
  | 'session_rehydrating'
  | 'session_active'
  | 'detecting'
  | 'supported_not_ready'
  | 'session_detected'
  | 'session_stale'
  | 'error'

/** @deprecated use TabDetectionState */
export type PlatformStatus = TabDetectionState

export interface PlatformCapabilities {
  screenshot: boolean
  pinnedCompanion: boolean
  symbolDetection: 'available' | 'partial' | 'unavailable'
  timeframeDetection: 'available' | 'partial' | 'unavailable'
  positionDetection: 'available' | 'partial' | 'unavailable'
  orderInterception: 'available' | 'partial' | 'unavailable'
  riskInputs: 'available' | 'partial' | 'unavailable'
  manualTradeLog: boolean
}

export interface PlatformSnapshot {
  adapterId: PlatformName
  platformName: string
  status: TabDetectionState
  confidence: number
  capabilities: PlatformCapabilities
  url: string
  origin: string
  title: string
  symbol: string | null
  timeframe: string | null
  accountBalance: number | null
  mode: 'auto_platform' | 'manual_attach'
  warnings?: string[]
  detectedAccount?: DetectedAccount
}

export interface DetectedAccount {
  platform: PlatformName
  accountId: string | null
  accountName: string | null
  accountType: string | null
  currency: string | null
  balance: number | null
  equity: number | null
  rawSource: string
  detectedAt: number
  accountKey?: string
}

export interface AccountChangeEvent {
  previousAccountKey: string | null
  nextAccountKey: string
  platform: PlatformName
  reason:
    | 'account_id_changed'
    | 'account_label_changed'
    | 'server_changed'
    | 'currency_changed'
    | 'platform_account_widget_changed'
    | 'manual_resync'
  detectedAccount: DetectedAccount
}

export interface TabPinState {
  tabId: number
  origin: string
  urlPattern: string
  pinned: boolean
  mode: 'manual_attach' | 'auto_platform'
  panelCollapsed: boolean
  adapterId: PlatformName
  lastSnapshotAt: number
}
