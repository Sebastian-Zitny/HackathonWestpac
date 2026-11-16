import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, ApiError, type AppState, type IntentView, type Offer } from './lib/api'
import { money } from './lib/format'

export type Screen = 'home' | 'accounts' | 'cards' | 'pay' | 'settings' | 'analysis' | 'approve' | 'result'
export type Phase =
  | 'idle' | 'processing' | 'assessing' | 'awaiting' | 'transferring' | 'retap'
  | 'approved' | 'blocked' | 'topup_declined' | 'duplicate'

export interface Purchase { merchant_id: string; amount_cents: number; item: string; scenarioId?: number }
export interface Banner { id: number; kind: 'topup_request' | 'transfer' | 'declined' | 'receipt' | 'info'; title: string; body: string }
export interface LogEntry { id: number; time: string; text: string; tone: 'info' | 'ok' | 'warn' | 'err' | 'ai' }

interface Store {
  app: AppState | null
  screen: Screen; setScreen: (s: Screen) => void
  purchase: Purchase | null; setPurchase: (p: Purchase) => void
  view: IntentView | null; phase: Phase
  offer: Offer | null
  banner: Banner | null; dismissBanner: () => void
  secondsLeft: number | null
  log: LogEntry[]
  error: string | null; setError: (e: string | null) => void
  backendDown: boolean
  refresh: () => Promise<void>
  loadScenario: (n: number) => Promise<void>
  resetAll: () => Promise<void>
  tapCard: () => Promise<void>
  approve: (body: Parameters<typeof api.approve>[1]) => Promise<IntentView | ApiError>
  declineTopUp: () => Promise<void>
  openApproval: () => void
  approveFromBanner: () => Promise<void>
  newPurchase: () => void
}

const Ctx = createContext<Store | null>(null)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function StoreProvider({ children }: { children: ReactNode }) {
  const [app, setApp] = useState<AppState | null>(null)
  const [screen, setScreen] = useState<Screen>('home')
  const [purchase, setPurchaseRaw] = useState<Purchase | null>(null)
  const [view, setView] = useState<IntentView | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [banner, setBanner] = useState<Banner | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [backendDown, setBackendDown] = useState(false)
  const seq = useRef(1)
  const deadline = useRef<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  const addLog = useCallback((text: string, tone: LogEntry['tone'] = 'info') => {
    const time = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLog((l) => [{ id: seq.current++, time, text, tone }, ...l].slice(0, 60))
  }, [])

  const showBanner = useCallback((b: Omit<Banner, 'id'>) => {
    if (app && !app.settings.notifications.push && b.kind !== 'topup_request') return
    setBanner({ ...b, id: seq.current++ })
  }, [app])

  const refresh = useCallback(async () => {
    try {
      const s = await api.state()
      setApp(s)
      setBackendDown(false)
    } catch {
      setBackendDown(true)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Approval window: every top-up request waits for the customer; show a live countdown and expire it at zero.
  const pendingOfferId = view?.offer?.status === 'PENDING' ? view.offer.id : null
  useEffect(() => {
    if (!pendingOfferId || !view?.offer) { deadline.current = null; setSecondsLeft(null); return }
    deadline.current = Date.now() + view.offer.seconds_remaining * 1000
    const tick = () => {
      const left = Math.max(0, Math.round(((deadline.current ?? 0) - Date.now()) / 1000))
      setSecondsLeft(left)
      return left
    }
    tick()
    const t = setInterval(async () => {
      if (tick() > 0) return
      clearInterval(t)
      const v = await api.payment(view.intent.id).catch(() => null)
      if (v && v.offer?.status === 'EXPIRED') {
        setView(v)
        setPhase('blocked')
        setScreen('result')
        setBanner({ id: seq.current++, kind: 'declined', title: 'Top-up request expired', body: 'You didn\'t respond in time, so no money was moved. Tap your card again to start over.' })
        addLog('Approval window ended with no response. Request expired; no money moved.', 'warn')
        refresh()
      }
    }, 1000)
    return () => clearInterval(t)
  }, [pendingOfferId]) // eslint-disable-line react-hooks/exhaustive-deps

  const clearFlow = () => { setView(null); setPhase('idle'); setBanner(null) }

  const setPurchase = (p: Purchase) => { setPurchaseRaw(p); clearFlow() }

  const loadScenario = useCallback(async (n: number) => {
    const r = await api.reset(n, true)
    setApp(r.state)
    const sc = r.state.scenarios.find((s) => s.id === n)!
    setPurchaseRaw({ merchant_id: sc.merchant_id, amount_cents: sc.amount_cents, item: sc.item, scenarioId: n })
    clearFlow()
    setScreen((cur) => (['approve', 'result', 'analysis'].includes(cur) ? 'pay' : cur))
    addLog(`Scenario ${n} loaded — ${sc.title}. Balances reset to Everyday ${money(sc.everyday_cents)}, Savings ${money(sc.savings_cents)}.`)
  }, [addLog])

  const resetAll = useCallback(async () => {
    const n = app?.scenario_id ?? 2
    const r = await api.reset(n, false)
    setApp(r.state)
    clearFlow()
    setScreen('home')
    setLog([])
    addLog(`Full reset: balances, history and settings restored (scenario ${n}).`)
  }, [app, addLog])

  const tapCard = useCallback(async () => {
    if (!purchase || !app) return
    setError(null)
    setBanner(null)
    try {
      let current = view
      if (!current) {
        current = await api.createPayment(purchase.merchant_id, purchase.amount_cents)
        setView(current)
      }
      const m = current.intent.merchant
      addLog(`Card tapped at ${m.name} for ${money(purchase.amount_cents)}.`)
      setPhase('processing')
      const prevOfferId = current.offer?.id
      const [res] = await Promise.all([api.tap(current.intent.id), sleep(1100)])
      setView(res)

      if (res.result === 'APPROVED' && res.duplicate) {
        setPhase('duplicate')
        addLog('Duplicate tap detected — payment already approved, customer not charged again.', 'warn')
        showBanner({ kind: 'info', title: 'Already paid', body: res.message ?? '' })
        await refresh()
        return
      }
      if (res.offer && res.offer.id !== prevOfferId) {
        addLog(`Insufficient funds: Everyday ${money(res.offer.assessment.everyday_cents)} < ${money(purchase.amount_cents)}. Shortfall ${money(res.offer.amount_cents)}.`, 'warn')
        setPhase('assessing')
        await sleep(1500)
        const a = res.offer.assessment
        addLog(`AI trust score ${a.trust.trust_score}/100 (${a.trust.trust_band}). Policy: ${a.policy.mandatory_passed ? 'all mandatory checks passed' : 'mandatory check failed'} → ${a.policy.workflow_label}.`, 'ai')
      }
      if (res.result === 'APPROVED') {
        setPhase('approved')
        addLog(`Payment approved — ${money(purchase.amount_cents)} at ${m.name}.`, 'ok')
        showBanner({ kind: 'receipt', title: 'Payment approved', body: `${money(purchase.amount_cents)} at ${m.name}` })
        setScreen('result')
      } else if (res.result === 'DECLINED_INSUFFICIENT') {
        setPhase('awaiting')
        if (res.duplicate) addLog('Retry while a request is pending — the same top-up request was re-used (no duplicate).', 'warn')
        showBanner({ kind: 'topup_request', title: 'Insufficient funds', body: `Transfer ${money(res.offer!.amount_cents)} from Savings to complete your purchase at ${m.name}? Nothing moves unless you approve.` })
      } else if (res.result === 'DECLINED_FINAL') {
        setPhase('blocked')
        setScreen('result')
        addLog(`Declined. AutoTopUp unavailable: ${res.intent.decline_reason}.`, 'err')
        showBanner({ kind: 'declined', title: 'Payment declined — insufficient funds', body: `AutoTopUp couldn't help: ${res.intent.decline_reason}.` })
      }
      await refresh()
    } catch (e) {
      setPhase('idle')
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }, [purchase, app, view, addLog, showBanner, refresh])

  const openApproval = useCallback(() => { setBanner(null); setScreen('approve') }, [])

  const approve = useCallback(async (body: Parameters<typeof api.approve>[1]) => {
    const offer = view?.offer
    if (!offer) return new ApiError(400, 'no_offer', 'No pending top-up', {})
    try {
      setPhase('transferring')
      const [res] = await Promise.all([api.approve(offer.id, body), sleep(900)])
      setView(res)
      setPhase('retap')
      addLog(`Customer approved via ${body.method === 'tap' ? 'quick tap' : body.method === 'pin' ? 'PIN' : 'biometric'}. Policy re-checked; ${money(offer.amount_cents)} transferred Savings → Everyday.`, 'ok')
      showBanner({ kind: 'transfer', title: `${money(offer.amount_cents)} moved to Everyday`, body: 'Transfer complete. Tap your card again to finish your purchase.' })
      await refresh()
      return res
    } catch (e) {
      setPhase('awaiting')
      if (e instanceof ApiError) {
        addLog(`Approval rejected: ${e.message}.`, 'err')
        if (['locked', 'policy_blocked', 'offer_expired', 'offer_not_pending'].includes(e.code)) {
          setPhase('blocked')
          const v = await api.payment(view!.intent.id).catch(() => null)
          if (v) setView(v)
          await refresh()
        }
        return e
      }
      return new ApiError(500, 'error', 'Something went wrong', {})
    }
  }, [view, addLog, showBanner, refresh])

  // High-trust (one-tap) requests are approved straight from the notification: a single click.
  // Other workflows open the approval screen for biometric / PIN verification.
  const approveFromBanner = useCallback(async () => {
    if (view?.offer?.workflow === 'QUICK_APPROVE') {
      setBanner(null)
      setScreen('approve')
      await approve({ method: 'tap' })
    } else {
      openApproval()
    }
  }, [view, approve, openApproval])

  const declineTopUp = useCallback(async () => {
    const offer = view?.offer
    if (!offer) return
    const res = await api.decline(offer.id)
    setView(res)
    setBanner(null)
    setPhase('topup_declined')
    setScreen('result')
    addLog('Customer declined the top-up. No money moved; payment remains declined.', 'warn')
    await refresh()
  }, [view, addLog, refresh])

  const newPurchase = useCallback(() => { clearFlow(); setScreen('pay') }, [])

  const value = useMemo<Store>(() => ({
    app, screen, setScreen, purchase, setPurchase, view, phase, offer: view?.offer ?? null,
    banner, dismissBanner: () => setBanner(null), secondsLeft, log, error, setError, backendDown,
    refresh, loadScenario, resetAll, tapCard, approve, declineTopUp, openApproval, approveFromBanner, newPurchase,
  }), [app, screen, purchase, view, phase, banner, secondsLeft, log, error, backendDown, refresh, loadScenario, resetAll, tapCard, approve, declineTopUp, openApproval, approveFromBanner, newPurchase])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside provider')
  return s
}
