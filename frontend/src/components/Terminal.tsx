import { useState } from 'react'
import { Button } from '@westpac/ui/button'
import { Input } from '@westpac/ui/input'
import { InputGroup } from '@westpac/ui/input-group'
import { Select } from '@westpac/ui/select'
import { Badge } from '@westpac/ui/badge'
import { Switch } from '@westpac/ui/switch'
import { ClockIcon, PaypassIcon, RefreshIcon, TickCircleIcon, StarsIcon } from '@westpac/ui/icon'
import { useStore } from '../store'
import { api } from '../lib/api'
import { cx, dollarsToCents, money, timeLabel } from '../lib/format'
import { MerchantIcon, Spinner } from './ui'

export function PurchasePicker() {
  const { app, purchase, loadScenario, setPurchase, resetAll, refresh } = useStore()
  const [custom, setCustom] = useState(false)
  const [mid, setMid] = useState('greenleaf-rochedale')
  const [amt, setAmt] = useState('25.00')
  const [time, setTime] = useState('')
  const [amtErr, setAmtErr] = useState<string | null>(null)
  const [timeErr, setTimeErr] = useState<string | null>(null)
  if (!app) return null
  const MAX_PURCHASE_CENTS = 2_000_000
  const usePurchase = () => {
    const c = dollarsToCents(amt)
    const shown = amt.trim() === '' ? 'nothing' : Number.isFinite(c) ? money(c) : `"${amt}"`
    if (!Number.isFinite(c)) return setAmtErr(`Purchase amount must be a dollar amount like 25.00. You entered ${shown}.`)
    if (c <= 0) return setAmtErr(`Purchase amount must be more than $0.00. You entered ${shown}.`)
    if (c > MAX_PURCHASE_CENTS) return setAmtErr(`Purchase amount can't be more than ${money(MAX_PURCHASE_CENTS)}. You entered ${shown}.`)
    setAmtErr(null)
    setPurchase({ merchant_id: mid, amount_cents: c, item: 'Custom purchase' })
  }
  const toggle = async (f: { security_hold?: boolean; app_session_authenticated?: boolean }) => { await api.flags(f); await refresh() }
  const sel = purchase?.scenarioId
  return (
    <div className="space-y-1.5">
      <ul className="space-y-1.5" aria-label="Demo scenarios">
        {app.scenarios.map((s) => {
          const m = app.merchants.find((x) => x.id === s.merchant_id)
          const active = sel === s.id && !custom
          return (
            <li key={s.id}>
              <button onClick={() => { setCustom(false); loadScenario(s.id) }} aria-pressed={active}
                className={cx('flex w-full items-center gap-2 rounded-3xl border bg-surface-mono p-2 text-left transition-colors focus-visible:focus-outline',
                  active ? 'border-border-primary bg-surface-primary-faint shadow-[inset_0_0_0_1px_var(--border-primary)]' : 'border-border-muted-soft hover:border-border-hero')}>
                <span className={cx('grid size-6 shrink-0 place-items-center rounded-full', active ? 'bg-surface-primary text-text-mono' : 'bg-surface-muted-pale text-text-hero')}>
                  <MerchantIcon icon={m?.icon} size="small" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx('flex items-center gap-1 typography-body-10 font-bold', active ? 'text-text-body' : 'text-text-muted')}>Scenario {s.id}
                    <Badge type="pill" color={s.id === 1 ? 'danger' : s.id === 2 ? 'hero' : 'success'} soft>{s.id === 1 ? 'Low trust' : s.id === 2 ? 'High trust' : 'Regular'}</Badge>
                  </span>
                  <span className="block truncate typography-body-10 font-bold text-text-heading">{s.subtitle}</span>
                  <span className={cx('num block truncate text-[0.75rem]', active ? 'text-text-body' : 'text-text-muted')}>{m?.name} · {money(s.amount_cents)} · Everyday {money(s.everyday_cents)}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <Button look="link" size="small" removeLinkPadding onClick={() => setCustom((c) => !c)} aria-expanded={custom}>
        {custom ? 'Hide custom purchase & demo controls' : '+ Custom purchase & demo controls'}
      </Button>
      {custom && (
        <div className="anim-fade-up space-y-2 rounded-3xl border border-border-muted-soft bg-surface-mono p-2">
          <p className="typography-body-10 font-bold text-text-heading">Custom purchase</p>
          <div>
            <label className="mb-0.5 block typography-body-10 font-bold text-text-body" htmlFor="custom-merchant">Merchant</label>
            <Select id="custom-merchant" size="medium" width="full" value={mid} onChange={(e) => setMid(e.target.value)}>
              {app.merchants.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.suburb}</option>)}
            </Select>
          </div>
          <InputGroup label="Amount" size="medium" before="$">
            <Input inputMode="decimal" value={amt} onChange={(e) => { setAmt(e.target.value); setAmtErr(null) }}
              invalid={!!amtErr} aria-invalid={!!amtErr} aria-describedby={amtErr ? 'custom-amount-err' : undefined} />
          </InputGroup>
          {amtErr && <p id="custom-amount-err" role="alert" className="typography-body-10 font-bold text-text-danger">{amtErr}</p>}
          <Button look="hero" size="medium" block onClick={usePurchase}>Use this purchase</Button>
          <p className="text-[0.75rem] text-text-muted">Uses current balances. Settings, limits and the demo clock all apply.</p>

          <div className="space-y-1 border-t border-border-muted-soft pt-2">
            <p className="typography-body-10 font-bold text-text-heading">Demo controls</p>
            <p className="num text-[0.75rem] text-text-muted">
              {app.accounts.filter((x) => x.id !== 'acc-goal').map((x) => <span key={x.id} className="mr-1.5 inline-block">{x.name}: <b className="text-text-heading">{money(x.balance_cents)}</b></span>)}
            </p>
            <Switch block size="small" label="Security / fraud hold" isSelected={app.security_hold} onChange={(v) => toggle({ security_hold: v })} className="mb-0 typography-body-10" />
            <Switch block size="small" label="App session signed in" isSelected={app.app_session_authenticated} onChange={(v) => toggle({ app_session_authenticated: v })} className="mb-0 typography-body-10" />
            <form className="flex items-center gap-1" onSubmit={async (e) => {
              e.preventDefault()
              if (!time) return setTimeErr('Simulated time: choose a time first, like 09:30.')
              try { await api.clock(time); setTimeErr(null); await refresh() } catch (x) { setTimeErr(x instanceof Error ? x.message : 'Could not set the time') }
            }}>
              <ClockIcon size="small" color="hero" aria-hidden />
              <span className="typography-body-10 text-text-body">Sim time <b className="num">{timeLabel(app.now)}</b></span>
              <Input type="time" size="small" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Set simulated time" className="num ml-auto w-[112px]" />
              <Button type="submit" look="faint" soft size="small">Set</Button>
            </form>
            {timeErr && <p role="alert" className="typography-body-10 font-bold text-text-danger">{timeErr}</p>}
            <Button look="faint" soft size="medium" block iconBefore={RefreshIcon} onClick={resetAll}>Reset everything</Button>
          </div>
        </div>
      )}
    </div>
  )
}

const ON_SCREEN = {
  muted: 'text-[var(--wbc-muted-300)]',
  ok: 'text-[var(--reserved-success-200)]',
  bad: 'text-[var(--reserved-danger-200)]',
  info: 'text-[var(--reserved-warning-200)]',
}

export function Terminal() {
  const { app, purchase, phase, view, tapCard, newPurchase } = useStore()
  const [tapping, setTapping] = useState(false)
  const merchant = app?.merchants.find((m) => m.id === purchase?.merchant_id)
  const canTap = !!purchase && ['idle', 'retap', 'blocked', 'topup_declined', 'approved', 'duplicate', 'awaiting'].includes(phase)

  const onTap = async () => {
    setTapping(true)
    setTimeout(() => setTapping(false), 1100)
    await tapCard()
  }

  const status = (() => {
    switch (phase) {
      case 'processing': return <span className={cx('flex items-center gap-1', ON_SCREEN.muted)}><Spinner className="size-2" label="Processing" /> Processing…</span>
      case 'assessing': return <span className={cx('flex items-center gap-1', ON_SCREEN.info)}><StarsIcon size="small" aria-hidden /> Insufficient funds · AutoTopUp checking…</span>
      case 'awaiting': return <span className={ON_SCREEN.bad}><b>DECLINED</b> · Insufficient funds<br /><span className={cx('text-[0.75rem]', ON_SCREEN.muted)}>Approve the AutoTopUp on your phone</span></span>
      case 'transferring': return <span className={cx('flex items-center gap-1', ON_SCREEN.muted)}><Spinner className="size-2" label="Waiting for transfer" /> Waiting for transfer…</span>
      case 'retap': return <span className={ON_SCREEN.ok}><b>Funds available</b><br /><span className={cx('text-[0.75rem]', ON_SCREEN.muted)}>Please tap your card again</span></span>
      case 'approved': return <span className={cx('flex items-center gap-1', ON_SCREEN.ok)}><TickCircleIcon size="small" aria-hidden /> <b>APPROVED</b></span>
      case 'duplicate': return <span className={ON_SCREEN.ok}><b>ALREADY APPROVED</b><br /><span className={cx('text-[0.75rem]', ON_SCREEN.muted)}>Not charged again</span></span>
      case 'blocked': return <span className={ON_SCREEN.bad}><b>DECLINED</b><br /><span className={cx('text-[0.75rem]', ON_SCREEN.muted)}>{view?.intent.decline_reason}</span></span>
      case 'topup_declined': return <span className={ON_SCREEN.bad}><b>DECLINED</b><br /><span className={cx('text-[0.75rem]', ON_SCREEN.muted)}>Top-up declined by customer</span></span>
      default: return <span className={cx('flex items-center gap-1', ON_SCREEN.muted)}><PaypassIcon size="small" aria-hidden /> Present card</span>
    }
  })()

  const tapLabel = phase === 'retap' ? 'Tap card again' : phase === 'awaiting' ? 'Retry tap'
    : phase === 'approved' || phase === 'duplicate' || phase === 'blocked' || phase === 'topup_declined' ? 'Tap again' : 'Tap card'
  const tapHint = phase === 'awaiting' ? 'Retrying re-uses the pending request (no duplicate top-up)'
    : phase === 'approved' || phase === 'duplicate' ? 'Duplicate test: you will not be charged twice' : null
  const light = phase === 'approved' || phase === 'duplicate' ? 'bg-[var(--reserved-success-300)]' : phase === 'awaiting' || phase === 'blocked' || phase === 'topup_declined' ? 'bg-[var(--reserved-danger-300)]' : 'bg-[var(--wbc-muted-600)]'

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[250px] rounded-[28px] bg-gradient-to-b from-[var(--wbc-muted-800)] to-[var(--wbc-muted-950)] p-2.5 pb-4 shadow-2xl" aria-label="Simulated EFTPOS terminal">
        <div className="mb-1.5 flex items-center justify-between px-0.5 text-[0.6875rem] font-bold uppercase tracking-widest text-[var(--wbc-muted-400)]">
          <span>EFTPOS · simulated</span><span className={cx('size-1.5 rounded-full', light)} aria-hidden />
        </div>
        <div aria-live="polite" className={cx('relative flex min-h-[150px] items-center rounded-2xl bg-[var(--wbc-hero-950)] p-2.5 text-text-mono shadow-inner ring-1 ring-white/10',
          (phase === 'awaiting' || phase === 'blocked') && 'anim-shake')}>
          {!purchase || !merchant ? (
            <div className={cx('w-full text-center typography-body-10', ON_SCREEN.muted)}>Select a purchase to begin</div>
          ) : (
            <div className="w-full">
              <div className={cx('typography-body-10', ON_SCREEN.muted)}>{merchant.name}</div>
              <div className="text-[0.75rem] text-[var(--wbc-muted-400)]">{merchant.suburb}</div>
              <div className="num mt-1.5 typography-body-6 font-bold">{money(purchase.amount_cents)}</div>
              <div className="mt-1.5 min-h-7 typography-body-10">{status}</div>
            </div>
          )}
        </div>
        <div className="relative mx-auto mt-3 grid size-12 place-items-center rounded-full bg-white/5 text-[var(--wbc-muted-400)] ring-1 ring-white/10">
          <PaypassIcon size="xlarge" aria-hidden />
          {tapping && (
            <div className="anim-tap pointer-events-none absolute -top-1 h-[56px] w-[88px] rounded-2xl bg-gradient-to-br from-surface-primary to-[var(--wbc-primary-700)] shadow-lg ring-1 ring-white/30" aria-hidden>
              <div className="ml-1.5 mt-1.5 h-1.5 w-2.5 rounded-sm bg-[var(--wbc-dance-200)]" />
            </div>
          )}
        </div>
      </div>
      <div className={cx('mt-3 w-[250px] rounded-xl', phase === 'retap' && 'anim-pulse')}>
        <Button look="primary" size="xlarge" block disabled={!canTap} onClick={onTap} iconBefore={PaypassIcon}>{tapLabel}</Button>
      </div>
      {tapHint && <p className="mt-0.5 w-[250px] text-center text-[0.75rem] text-text-muted">{tapHint}</p>}
      {(phase === 'approved' || phase === 'duplicate' || phase === 'blocked' || phase === 'topup_declined') && (
        <Button look="link" size="small" className="mt-1" iconBefore={RefreshIcon} onClick={newPurchase}>Start a new purchase</Button>
      )}
    </div>
  )
}
