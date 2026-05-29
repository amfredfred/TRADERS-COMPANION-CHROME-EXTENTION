import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null

if (!supabase) {
  console.warn('[TC] Supabase not configured — running in local-only mode.')
}

// ── Lock management ──────────────────────────────────────────────────────────

export interface RemoteLock {
  id: string
  user_id: string
  account_id: string
  reason: string
  reason_detail: string
  locked_at: string
  locked_until: string
  overridden_at: string | null
  override_reason: string | null
}

export async function fetchActiveLock(
  userId: string,
): Promise<{ locked: boolean; lock?: RemoteLock }> {
  if (!supabase) return { locked: false }
  const now = new Date().toISOString()
  const { data } = await supabase
    .from('locks')
    .select('*')
    .eq('user_id', userId)
    .gt('locked_until', now)
    .is('overridden_at', null)
    .order('locked_until', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? { locked: true, lock: data as RemoteLock } : { locked: false }
}

export async function insertLock(params: {
  userId: string
  accountId: string
  reason: string
  reasonDetail: string
  durationMinutes: number
}): Promise<string | null> {
  if (!supabase) return null
  const lockedUntil = new Date(Date.now() + params.durationMinutes * 60_000).toISOString()
  const { data, error } = await supabase
    .from('locks')
    .insert({
      user_id: params.userId,
      account_id: params.accountId,
      reason: params.reason,
      reason_detail: params.reasonDetail,
      locked_until: lockedUntil,
    })
    .select('id')
    .single()
  if (error) { console.error('[TC] Lock insert failed', error); return null }
  return (data as { id: string }).id
}

export async function overrideLock(lockId: string, overrideReason: string): Promise<void> {
  if (!supabase) return
  await supabase.from('locks').update({
    overridden_at: new Date().toISOString(),
    override_reason: overrideReason,
  }).eq('id', lockId)
}

// ── Trade sync ───────────────────────────────────────────────────────────────

export async function syncTrade(trade: Record<string, unknown>): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('trades').upsert(trade)
  if (error) console.error('[TC] Trade sync failed', error)
}
