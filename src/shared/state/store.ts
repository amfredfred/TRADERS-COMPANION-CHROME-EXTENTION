import { create } from 'zustand'
import type { LiveSessionState, LockState } from '../lib/storage'
import type { TradeRecord } from '../types/trade'
import type { Playbook } from '../types/playbook'

interface OverlayState {
  // Pre-Trade Gate
  gateVisible: boolean
  gateIntentId: string | null
  gateDirection: 'long' | 'short' | null
  gateSymbol: string | null

  // Lock overlay
  lockVisible: boolean
  lockState: LockState | null

  // No Trade Mode
  noTradeModeVisible: boolean

  // Exit prompt
  exitPromptVisible: boolean
  exitTradeId: string | null
}

interface TCStore {
  session: LiveSessionState | null
  playbooks: Playbook[]
  trades: TradeRecord[]
  overlay: OverlayState

  setSession: (s: LiveSessionState) => void
  patchSession: (patch: Partial<LiveSessionState>) => void
  setPlaybooks: (p: Playbook[]) => void
  setTrades: (t: TradeRecord[]) => void
  upsertTrade: (t: TradeRecord) => void

  openGate: (intentId: string, direction: 'long' | 'short', symbol: string | null) => void
  closeGate: () => void

  activateLock: (lock: LockState) => void
  releaseLock: () => void

  showExitPrompt: (tradeId: string) => void
  closeExitPrompt: () => void
}

export const useStore = create<TCStore>((set, get) => ({
  session: null,
  playbooks: [],
  trades: [],
  overlay: {
    gateVisible: false,
    gateIntentId: null,
    gateDirection: null,
    gateSymbol: null,
    lockVisible: false,
    lockState: null,
    noTradeModeVisible: false,
    exitPromptVisible: false,
    exitTradeId: null,
  },

  setSession: (session) => set({ session }),
  patchSession: (patch) => {
    const current = get().session
    if (current) set({ session: { ...current, ...patch } })
  },
  setPlaybooks: (playbooks) => set({ playbooks }),
  setTrades: (trades) => set({ trades }),
  upsertTrade: (trade) => set(state => {
    const idx = state.trades.findIndex(t => t.id === trade.id)
    const next = [...state.trades]
    if (idx >= 0) { next[idx] = trade } else { next.unshift(trade) }
    return { trades: next }
  }),

  openGate: (gateIntentId, gateDirection, gateSymbol) =>
    set(state => ({ overlay: { ...state.overlay, gateVisible: true, gateIntentId, gateDirection, gateSymbol } })),
  closeGate: () =>
    set(state => ({ overlay: { ...state.overlay, gateVisible: false, gateIntentId: null, gateDirection: null, gateSymbol: null } })),

  activateLock: (lockState) =>
    set(state => ({ overlay: { ...state.overlay, lockVisible: true, lockState } })),
  releaseLock: () =>
    set(state => ({ overlay: { ...state.overlay, lockVisible: false, lockState: null } })),

  showExitPrompt: (exitTradeId) =>
    set(state => ({ overlay: { ...state.overlay, exitPromptVisible: true, exitTradeId } })),
  closeExitPrompt: () =>
    set(state => ({ overlay: { ...state.overlay, exitPromptVisible: false, exitTradeId: null } })),
}))
