// Typed client for the AutoTopUp AI FastAPI backend. All money is integer cents.

export type Workflow = 'QUICK_APPROVE' | 'STANDARD_AUTH' | 'ENHANCED_AUTH' | 'BLOCKED'

export interface Account { id: string; name: string; type: 'everyday' | 'savings'; bsb: string; number_masked: string; balance_cents: number }
export interface Merchant { id: string; name: string; category: string; suburb: string; lat: number | null; lon: number | null; icon: string }
export interface Txn {
  id: number; account_id: string; ts: string; kind: string; description: string; merchant_id: string | null
  category: string | null; amount_cents: number; balance_after_cents: number | null; ref: string | null; is_autotopup: number
}
export interface Notification { id: number; ts: string; kind: string; title: string; body: string; offer_id: string | null; intent_id: string | null; read: number }
export interface Settings {
  enabled: boolean; source_account_id: string; destination_account_id: string
  max_per_transfer_cents: number; max_daily_total_cents: number; max_daily_count: number
  min_savings_reserve_cents: number; quick_hours_start: string; quick_hours_end: string
  unfamiliar_requires_enhanced: boolean; quick_approve_enabled: boolean; preferred_auth: 'biometric' | 'pin'
  notifications: { push: boolean; email: boolean; transfer_receipts: boolean; weekly_summary: boolean }
}
export interface Scenario {
  id: number; key: string; title: string; subtitle: string; merchant_id: string; amount_cents: number
  item: string; everyday_cents: number; savings_cents: number; time: [number, number]; expected_workflow: Workflow
}
export interface AppState {
  customer: { first_name: string; last_name: string; home_suburb: string }
  now: string; scenario_id: number; accounts: Account[]; settings: Settings
  autotopup: { enabled: boolean; quick_enabled: boolean; approval_window_seconds: number; today_count: number; today_total_cents: number; max_daily_count: number; max_daily_total_cents: number }
  security_hold: boolean; app_session_authenticated: boolean
  transactions: Txn[]; notifications: Notification[]; merchants: Merchant[]; scenarios: Scenario[]
  familiar_merchants: FamiliarMerchant[]
}
export interface FamiliarMerchant { merchant_id: string; name: string; suburb: string; icon: string; visits: number; last_visit: string; typical_cents: number; familiarity: 'Regular' | 'Occasional' }
export interface Contribution { feature: string; label: string; group: string; value: number; typical_value: number; impact: number }
export interface Check { id: string; label: string; status: 'pass' | 'fail' | 'pending'; detail: string; mandatory: boolean }
export interface Group { id: string; title: string; status: 'good' | 'neutral' | 'concern'; headline: string; detail: string; model_impact: number | null }
export interface Assessment {
  assessed_at: string; merchant: Merchant; amount_cents: number; everyday_cents: number; shortfall_cents: number
  trust: { model_version: string; anomaly_score: number; trust_score: number; trust_band: 'HIGH' | 'MEDIUM' | 'LOW'; contributions: Contribution[] }
  raw: Record<string, number | string | boolean>
  groups: Group[]
  finance: { status: string; headline: string; detail: string; next_payday: string | null; bills_before_payday_cents: number; projected_position_14d_cents: number }
  policy: { checks: Check[]; mandatory_passed: boolean; workflow: Workflow; workflow_label: string; workflow_reasons: string[]; quick_eligibility: { label: string; met: boolean }[] }
  explanation: { text: string; source: 'local'; template_text: string }
  disclaimer: string
}
export interface Offer {
  id: string; intent_id: string; amount_cents: number; status: string; workflow: Workflow; workflow_label: string
  trust_score: number; created_ts: string; expires_ts: string; completed_ts: string | null; transfer_ref: string | null
  auth_method: string | null; pin_failures: number; pin_attempts_remaining: number; assessment: Assessment
  approval_window_seconds: number; seconds_remaining: number
}
export interface Receipt { transaction_id: number; ts: string; merchant: string; suburb: string; amount_cents: number; account: string; balance_after_cents: number; reference: string }
export interface IntentView {
  intent: { id: string; merchant_id: string; amount_cents: number; status: string; attempts: number; decline_reason: string | null; merchant: Merchant }
  offer: Offer | null; receipt: Receipt | null; accounts: Account[]
  result?: string; duplicate?: boolean; message?: string
}
export interface Insights {
  now: string
  spending_by_category: { category: string; total_cents: number }[]
  weekly_totals: { week_ending: string; total_cents: number }[]
  unusual_transactions: { ts: string; merchant: string; amount_cents: number; trust_score: number; why: string }[]
  autotopups: { ts: string; amount_cents: number; ref: string }[]
  autotopups_30d: { count: number; total_cents: number }
  upcoming: { id: number; kind: string; description: string; due: string; amount_cents: number }[]
  finance: Assessment['finance'] & { expected_income_14d_cents: number; bills_14d_cents: number }
  model: { algorithm: string; training_rows: number; synthetic_customers: number; features: string[]; evaluation_on_synthetic_holdout: Record<string, number | string> }
}

export class ApiError extends Error {
  status: number
  code: string
  body: Record<string, unknown>
  constructor(status: number, code: string, message: string, body: Record<string, unknown>) {
    super(message)
    this.status = status
    this.code = code
    this.body = body
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = typeof data.message === 'string' ? data.message
      : Array.isArray(data.detail) ? data.detail.map((d: { msg: string }) => d.msg).join('; ') : `Request failed (${res.status})`
    throw new ApiError(res.status, data.error ?? 'error', msg, data)
  }
  return data as T
}

export const api = {
  state: () => req<AppState>('GET', '/state'),
  saveSettings: (s: Settings) => req<Settings>('PUT', '/settings', s),
  reset: (scenario_id: number, keep_settings: boolean) => req<{ state: AppState }>('POST', '/demo/reset', { scenario_id, keep_settings }),
  clock: (time: string) => req<{ now: string }>('POST', '/demo/clock', { time }),
  flags: (f: { security_hold?: boolean; app_session_authenticated?: boolean }) => req('POST', '/demo/flags', f),
  createPayment: (merchant_id: string, amount_cents: number) => req<IntentView>('POST', '/payments', { merchant_id, amount_cents }),
  payment: (id: string) => req<IntentView>('GET', `/payments/${id}`),
  tap: (id: string) => req<IntentView>('POST', `/payments/${id}/tap`),
  approve: (id: string, body: { method: 'tap' | 'biometric' | 'pin'; pin?: string; biometric_ok?: boolean; confirm_recognised?: boolean }) =>
    req<IntentView>('POST', `/topups/${id}/approve`, body),
  decline: (id: string) => req<IntentView>('POST', `/topups/${id}/decline`),
  assess: (merchant_id: string, amount_cents: number) => req<Assessment>('POST', '/assess', { merchant_id, amount_cents }),
  insights: () => req<Insights>('GET', '/insights'),
  health: () => req<{ ok: boolean; runs_locally: boolean }>('GET', '/health'),
}
