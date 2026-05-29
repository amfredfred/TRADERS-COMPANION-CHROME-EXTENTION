import type { PlatformName } from '../../content/adapters/types'

export type TabDetectionState =
  | 'not_eligible'
  | 'candidate'
  | 'verified_platform'
  | 'manual_attached'
  | 'adapter_active'

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
