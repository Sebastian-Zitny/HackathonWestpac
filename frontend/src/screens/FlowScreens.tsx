import { useEffect, useState } from 'react'
import { Alert } from '@westpac/ui/alert'
import { Badge } from '@westpac/ui/badge'
import { Button } from '@westpac/ui/button'
import {
  ArrowLeftIcon, ArrowRightIcon, BackspaceIcon, CreditCardIcon, HistoryClockIcon, StarsIcon, ErrorIcon, FingerprintIcon, KeyIcon, PadlockIcon, PiggyBankIcon,
  SecurityIcon, TickCircleIcon, TransferIcon, WalletIcon,
} from '@westpac/ui/icon'
import { useStore } from '../store'
import { api, ApiError, type Assessment } from '../lib/api'
import { clock, cx, money, timeLabel } from '../lib/format'
import { AssessmentView } from '../components/AssessmentView'
import { PurchasePicker, Terminal } from '../components/Terminal'
import { bandOf, Card, PageHeader, Spinner, Tile } from '../components/ui'
import { TxnRow } from './Dashboard'

function Header({ title, back }: { title: string; back?: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex min-h-8 items-center gap-1 border-b border-border-muted-soft bg-surface-mono px-1.5">
      {back && (
        <button onClick={back} aria-label="Back" className="grid size-6 place-items-center rounded-full text-text-primary hover:bg-surface-hover-primary-faint focus-visible:focus-outline">
          <ArrowLeftIcon size="small" aria-hidden />
        </button>
      )}
      <h1 className={cx('typography-body-9 font-bold text-text-heading', !back && 'pl-1')}>{title}</h1>
    </div>
  )
}

function BalanceRows({ rows }: { rows: { icon: typeof WalletIcon; name: string; value: string; sub?: string }[] }) {
  return (
    <Card className="divide-y divide-border-muted-soft">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-1.5 p-2">
          <r.icon size="small" color="hero" aria-hidden />
          <span className="flex-1 typography-body-10 text-text-body">{r.name}{r.sub && <span className="num block text-[0.75rem] text-text-muted">{r.sub}</span>}</span>
          <span className="num typography-body-9 font-bold text-text-heading">{r.value}</span>
        </div>
      ))}
    </Card>
  )
}

/* ---------------- Screen 3: Payments (phone view) ---------------- */
export function PayScreen() {
  const { purchase, app, setScreen } = useStore()
  if (!app) return null
  const icons = Object.fromEntries(app.merchants.map((m) => [m.id, m.icon]))
  const topups = app.transactions.filter((t) => t.is_autotopup && t.kind === 'transfer_in')
  return (
    <div className="anim-fade-up min-h-full bg-background-pale pb-4">
      <PageHeader title="Payments" />
      <div className="px-2 pt-3">
        {/* On small screens the left-hand terminal column is hidden, so the picker and terminal show here instead. */}
        <div className="md:hidden">
          <h2 className="mb-1 px-1 typography-body-8 font-bold text-text-heading">Tap to pay (simulation)</h2>
          <p className="mb-2 px-1 typography-body-10 text-text-muted">Choose a purchase, then tap your card on the terminal.</p>
          <PurchasePicker />
          <div className="mt-4">{purchase && <Terminal />}</div>
        </div>
        <p className="hidden items-center justify-center gap-1 rounded-3xl border border-border-muted-soft bg-surface-mono p-2 typography-body-10 text-text-body md:flex">
          <ArrowLeftIcon size="small" color="primary" aria-hidden /> Choose a purchase and tap your card on the left.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Tile icon={TransferIcon} label="Card & AutoTopUp" onClick={() => setScreen('cards')} />
          <Tile icon={StarsIcon} label="AI analysis" onClick={() => setScreen('analysis')} />
          <Tile icon={HistoryClockIcon} label="Transaction history" onClick={() => setScreen('accounts')} />
          <Tile icon={CreditCardIcon} label="AutoTopUp limits" onClick={() => setScreen('settings')} />
        </div>
        <h2 id="atu-activity" className="mb-1.5 mt-3 px-1 typography-body-8 font-bold text-text-heading">AutoTopUp activity</h2>
        <Card className="px-2">
          {topups.length === 0 && <p className="py-2 typography-body-10 text-text-muted">No top-ups yet.</p>}
          <ul aria-labelledby="atu-activity" className="divide-y divide-border-muted-soft">
            {topups.map((t) => <TxnRow key={t.id} t={t} merchantIcon={t.merchant_id ? icons[t.merchant_id] : undefined} />)}
          </ul>
        </Card>
        <h2 className="mb-1.5 mt-3 px-1 typography-body-8 font-bold text-text-heading">Notifications</h2>
        <Card className="divide-y divide-border-muted-soft px-2.5">
          {app.notifications.length === 0 && <p className="py-2 typography-body-10 text-text-muted">No notifications yet.</p>}
          {app.notifications.slice(0, 10).map((n) => (
            <div key={n.id} className="py-1.5">
              <p className="typography-body-10 font-bold text-text-body">{n.title}</p>
              <p className="typography-body-10 text-text-muted">{n.body}</p>
              <p className="num text-[0.75rem] text-text-muted">{timeLabel(n.ts)}</p>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}

/* ---------------- Screen 4: AI analysis ---------------- */
export function AnalysisScreen() {
  const { offer, purchase, setScreen, phase, openApproval } = useStore()
  const [preview, setPreview] = useState<Assessment | null>(null)
  useEffect(() => {
    if (!offer && purchase) api.assess(purchase.merchant_id, purchase.amount_cents).then(setPreview).catch(() => null)
  }, [offer, purchase])
  const a = offer?.assessment ?? preview
  return (
    <div className="anim-fade-up pb-4">
      <Header title="AI transaction analysis" back={() => setScreen(phase === 'awaiting' ? 'pay' : 'home')} />
      <div className="p-2">
        {!offer && preview && <Alert look="info" className="mb-1.5 rounded-2xl">Preview only: what the AI would assess if this purchase needed a top-up right now.</Alert>}
        {a ? <AssessmentView a={a} /> : <p className="py-8 text-center typography-body-10 text-text-muted">Select a purchase to see an assessment.</p>}
        {phase === 'awaiting' && offer?.status === 'PENDING' && (
          <Button look="primary" size="xlarge" block className="mt-3" onClick={openApproval}>Continue to approval</Button>
        )}
      </div>
    </div>
  )
}

/* ---------------- Screen 5: approval & authentication ---------------- */
function PinPad({ onSubmit, disabled, error }: { onSubmit: (pin: string) => void; disabled?: boolean; error?: string | null }) {
  const [pin, setPin] = useState('')
  const [shakeKey, setShakeKey] = useState(0)
  useEffect(() => { if (error) { setPin(''); setShakeKey((k) => k + 1) } }, [error])
  const press = (d: string) => {
    if (disabled) return
    const next = (pin + d).slice(0, 4)
    setPin(next)
    if (next.length === 4) onSubmit(next)
  }
  return (
    <div onKeyDown={(e) => { if (/^\d$/.test(e.key)) press(e.key); if (e.key === 'Backspace') setPin(pin.slice(0, -1)) }}>
      <div key={shakeKey} className={cx('flex justify-center gap-2 py-2', error && 'anim-shake')} role="status" aria-label={`${pin.length} of 4 PIN digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx('size-2 rounded-full border-2 transition-colors', i < pin.length ? 'border-border-hero bg-surface-hero' : 'border-border-muted-mild')} />
        ))}
      </div>
      {error && <p role="alert" className="mb-1 text-center typography-body-10 font-bold text-text-danger">{error}</p>}
      <div className="mx-auto grid max-w-[264px] grid-cols-3 gap-1">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k) => k === '' ? <span key="blank" /> : (
          <button key={k} disabled={disabled} onClick={() => (k === 'del' ? setPin(pin.slice(0, -1)) : press(k))} aria-label={k === 'del' ? 'Delete digit' : k}
            className="num grid h-8 place-items-center rounded-2xl border border-border-muted-soft bg-surface-mono typography-body-7 text-text-heading transition-colors hover:bg-surface-hover-hero-faint active:bg-surface-active-hero-faint focus-visible:focus-outline disabled:opacity-40">
            {k === 'del' ? <BackspaceIcon size="small" aria-hidden /> : k}
          </button>
        ))}
      </div>
    </div>
  )
}

function Biometric({ onDone, busy }: { onDone: () => void; busy: boolean }) {
  const [scanning, setScanning] = useState(false)
  const go = () => { setScanning(true); setTimeout(() => { setScanning(false); onDone() }, 1300) }
  return (
    <div className="flex flex-col items-center py-1">
      <div className={cx('relative grid size-14 place-items-center overflow-hidden rounded-4xl border transition-colors',
        scanning ? 'border-border-primary bg-surface-primary-faint text-text-primary' : 'border-border-muted-soft bg-surface-muted-faint text-text-hero')}>
        <FingerprintIcon size="xlarge" aria-hidden />
        {scanning && <span className="anim-scan absolute inset-x-1 h-[2px] bg-surface-primary" aria-hidden />}
      </div>
      <Button look="hero" size="xlarge" block className="mt-3" disabled={scanning || busy} onClick={go} iconBefore={FingerprintIcon}>
        {scanning ? 'Scanning…' : 'Confirm with biometrics'}
      </Button>
      <p className="mt-0.5 text-[0.75rem] text-text-muted">Simulated biometric check</p>
    </div>
  )
}

export function ApproveScreen() {
  const { offer, view, phase, approve, declineTopUp, setScreen, app, secondsLeft } = useStore()
  const [err, setErr] = useState<string | null>(null)
  const [recognised, setRecognised] = useState(false)
  const [usePin, setUsePin] = useState(false)
  const busy = phase === 'transferring'
  if (!offer || !view || !app) return <div><Header title="Approve transfer" back={() => setScreen('home')} /><p className="p-4 typography-body-10 text-text-muted">No top-up request right now.</p></div>
  const a = offer.assessment
  const src = app.accounts.find((x) => x.id === app.settings.source_account_id)
  const dst = app.accounts.find((x) => x.id === app.settings.destination_account_id)
  const wf = offer.workflow

  const run = async (body: Parameters<typeof approve>[0]) => {
    setErr(null)
    const r = await approve(body)
    if (r instanceof ApiError) setErr(r.code === 'incorrect_pin' ? `Incorrect PIN. ${String(r.body.attempts_remaining)} attempt(s) left.` : r.message)
  }

  if (phase === 'retap' || offer.status === 'COMPLETED') {
    return (
      <div className="anim-fade-up">
        <Header title="Transfer complete" />
        <div className="flex flex-col items-center px-3 py-5 text-center">
          <span className="anim-pop grid size-12 place-items-center rounded-full bg-surface-success-faint text-text-success"><TickCircleIcon size="xlarge" aria-hidden /></span>
          <h2 className="mt-3 typography-body-7 font-bold text-text-heading">{money(offer.amount_cents)} moved to {dst?.name}</h2>
          <p className="num mt-0.5 typography-body-10 text-text-muted">Ref {offer.transfer_ref} · {offer.completed_ts && timeLabel(offer.completed_ts)}</p>
          <div className="mt-3 w-full text-left">
            <BalanceRows rows={[
              { icon: WalletIcon, name: dst?.name ?? '', value: money(dst?.balance_cents ?? 0) },
              { icon: PiggyBankIcon, name: src?.name ?? '', value: money(src?.balance_cents ?? 0) },
            ]} />
          </div>
          <div className="mt-3 w-full rounded-3xl bg-background-hero p-3 text-left text-text-mono">
            <p className="typography-body-9 font-bold">Now tap your card again</p>
            <p className="typography-body-10 opacity-85">You have enough to pay {money(view.intent.amount_cents)} at {view.intent.merchant.name}.</p>
            <button onClick={() => setScreen('pay')} className="mt-1 inline-flex items-center gap-0.5 typography-body-10 font-bold underline focus-visible:focus-outline md:hidden">Go to terminal <ArrowRightIcon size="xsmall" aria-hidden /></button>
          </div>
        </div>
      </div>
    )
  }

  if (offer.status !== 'PENDING') {
    return (
      <div><Header title="Top-up unavailable" back={() => setScreen('home')} />
        <div className="flex flex-col items-center p-5 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-surface-danger-faint text-text-danger">{offer.status === 'LOCKED' ? <PadlockIcon size="large" aria-hidden /> : <ErrorIcon size="large" aria-hidden />}</span>
          <h2 className="mt-2 typography-body-8 font-bold text-text-heading">This top-up is {offer.status.toLowerCase()}</h2>
          <p className="mt-0.5 typography-body-10 text-text-muted">{view.intent.decline_reason ?? 'No money was moved.'}</p>
        </div>
      </div>
    )
  }

  const band = bandOf(a.trust.trust_score)
  return (
    <div className="anim-fade-up pb-4">
      <Header title="Approve AutoTopUp" back={() => setScreen('pay')} />
      <div className="space-y-1.5 p-2">
        <Card className="p-2.5">
          <p className="typography-body-10 font-bold text-text-muted">Transfer</p>
          <p className="num typography-body-5 font-bold text-text-heading">{money(offer.amount_cents)}</p>
          <div className="mt-2 flex items-stretch gap-1 typography-body-10">
            <span className="flex-1 rounded-2xl bg-surface-muted-faint p-1.5"><span className="block text-[0.75rem] text-text-muted">From</span><b className="text-text-body">{src?.name}</b><span className="num block text-[0.75rem] text-text-muted">{money(src?.balance_cents ?? 0)} → {money((src?.balance_cents ?? 0) - offer.amount_cents)}</span></span>
            <span className="grid place-items-center text-text-primary"><TransferIcon size="small" aria-hidden /></span>
            <span className="flex-1 rounded-2xl bg-surface-muted-faint p-1.5"><span className="block text-[0.75rem] text-text-muted">To</span><b className="text-text-body">{dst?.name}</b><span className="num block text-[0.75rem] text-text-muted">{money(dst?.balance_cents ?? 0)} → {money((dst?.balance_cents ?? 0) + offer.amount_cents)}</span></span>
          </div>
          <p className="mt-1.5 typography-body-10 text-text-muted">To complete {money(view.intent.amount_cents)} at {view.intent.merchant.name}. Your own money, not a loan or overdraft.</p>
        </Card>

        {secondsLeft !== null && (
          <div role="timer" className="rounded-3xl border border-border-muted-soft bg-surface-mono p-2">
            <div className="flex items-center justify-between typography-body-10">
              <span className="text-text-body">Take your time. Nothing moves until you choose.</span>
              <b className={cx('num', secondsLeft <= 30 ? 'text-text-danger' : 'text-text-heading')}>{clock(secondsLeft)}</b>
            </div>
            <div className="mt-1 h-[6px] rounded-full bg-surface-muted-pale" aria-hidden>
              <div className={cx('h-[6px] rounded-full transition-[width] duration-1000 ease-linear', secondsLeft <= 30 ? 'bg-surface-danger' : 'bg-surface-hero')}
                style={{ width: `${(secondsLeft / (offer.approval_window_seconds || 300)) * 100}%` }} />
            </div>
            <p className="mt-0.5 text-[0.75rem] text-text-muted">If you don't respond, the request expires and no money is moved.</p>
          </div>
        )}

        <button onClick={() => setScreen('analysis')} className="flex w-full items-center gap-1.5 rounded-3xl border border-border-muted-soft bg-surface-mono p-2 text-left transition-colors hover:border-border-hero focus-visible:focus-outline">
          <span className={cx('num grid size-6 place-items-center rounded-full typography-body-10 font-bold text-text-mono', { success: 'bg-surface-success', warning: 'bg-surface-warning', danger: 'bg-surface-danger' }[band])}>{a.trust.trust_score}</span>
          <span className="flex-1"><span className="block typography-body-10 font-bold text-text-heading">{offer.workflow_label}</span><span className="text-[0.75rem] text-text-muted">See why the AI chose this</span></span>
          <ArrowRightIcon size="small" color="primary" aria-hidden />
        </button>

        {wf === 'ENHANCED_AUTH' && (
          <Card className="border-border-danger-mild p-2.5">
            <p className="flex items-center gap-1 typography-body-10 font-bold text-text-danger"><SecurityIcon size="small" aria-hidden /> Why we need extra verification</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-3 typography-body-10 text-text-body">
              {a.groups.filter((g) => g.status === 'concern').map((g) => <li key={g.id}><b>{g.title}:</b> {g.headline}</li>)}
              {a.policy.workflow_reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
            <label className="mt-2 flex cursor-pointer items-start gap-1 rounded-2xl border border-border-muted-soft bg-surface-muted-faint p-1.5 typography-body-10 text-text-body">
              <input type="checkbox" checked={recognised} onChange={(e) => setRecognised(e.target.checked)} className="mt-[3px] size-[18px] shrink-0 accent-[var(--surface-hero)] focus-visible:focus-outline" />
              <span>I recognise this {money(view.intent.amount_cents)} purchase at {view.intent.merchant.name} and want to continue.</span>
            </label>
          </Card>
        )}

        <Card className="p-2.5">
          {wf === 'QUICK_APPROVE' && (
            <>
              <p className="typography-body-10 text-text-body">The AI recognises this as a routine purchase from your history and you're signed in, so no extra PIN is needed. Approve or decline below.</p>
              <Button look="primary" size="xlarge" block className="mt-2" disabled={busy} onClick={() => run({ method: 'tap' })} iconBefore={busy ? undefined : TransferIcon}>
                {busy ? <span className="flex items-center gap-1"><Spinner className="size-2" label="Transferring" /> Transferring…</span> : `Approve ${money(offer.amount_cents)} transfer`}
              </Button>
              {err && <p role="alert" className="mt-1 typography-body-10 text-text-danger">{err}</p>}
            </>
          )}
          {wf === 'STANDARD_AUTH' && (
            app.settings.preferred_auth === 'biometric' && !usePin ? (
              <>
                <p className="typography-body-10 text-text-body">Confirm it's you to approve this transfer.</p>
                <Biometric busy={busy} onDone={() => run({ method: 'biometric', biometric_ok: true })} />
                <Button look="link" size="small" block onClick={() => setUsePin(true)}>Use PIN instead</Button>
                {err && <p role="alert" className="mt-1 typography-body-10 text-text-danger">{err}</p>}
              </>
            ) : (
              <>
                <p className="flex items-center gap-1 typography-body-10 font-bold text-text-heading"><KeyIcon size="small" aria-hidden /> Enter your PIN <Badge color="faint" soft>Demo: 1234</Badge></p>
                <PinPad disabled={busy} error={err} onSubmit={(pin) => run({ method: 'pin', pin })} />
              </>
            )
          )}
          {wf === 'ENHANCED_AUTH' && (
            <>
              <p className="flex items-center gap-1 typography-body-10 font-bold text-text-heading"><KeyIcon size="small" aria-hidden /> Enter your PIN <Badge color="faint" soft>Demo: 1234</Badge></p>
              {!recognised && <p className="mt-0.5 typography-body-10 text-text-warning">Tick the confirmation above first.</p>}
              <PinPad disabled={busy || !recognised} error={err} onSubmit={(pin) => run({ method: 'pin', pin, confirm_recognised: recognised })} />
            </>
          )}
          {busy && wf !== 'QUICK_APPROVE' && <p className="mt-2 flex items-center justify-center gap-1 typography-body-10 text-text-body"><Spinner className="size-2" label="Verifying" /> Verifying and transferring…</p>}
        </Card>
        <Button look="faint" soft size="large" block disabled={busy} onClick={declineTopUp}>Decline: don't transfer</Button>
      </div>
    </div>
  )
}

/* ---------------- Screen 6: payment result ---------------- */
export function ResultScreen() {
  const { view, app, setScreen, newPurchase, offer } = useStore()
  if (!view || !app) return <div><Header title="Payment" back={() => setScreen('home')} /><p className="p-4 typography-body-10 text-text-muted">No payment yet.</p></div>
  const ok = view.intent.status === 'APPROVED'
  const r = view.receipt
  const transferred = offer?.status === 'COMPLETED' ? offer : null
  const icons = Object.fromEntries(app.merchants.map((m) => [m.id, m.icon]))
  const related = app.transactions.filter((t) => t.ref === view.intent.id || (transferred && t.ref === transferred.transfer_ref))
  return (
    <div className="anim-fade-up pb-4">
      <Header title={ok ? 'Payment successful' : 'Payment unsuccessful'} back={() => setScreen('home')} />
      <div className="flex flex-col items-center px-3 pt-4 text-center">
        <span className={cx('anim-pop grid size-12 place-items-center rounded-full', ok ? 'bg-surface-success-faint text-text-success' : 'bg-surface-danger-faint text-text-danger')}>
          {ok ? <TickCircleIcon size="xlarge" aria-hidden /> : <ErrorIcon size="xlarge" aria-hidden />}
        </span>
        <p className="num mt-2 typography-body-5 font-bold text-text-heading">{money(view.intent.amount_cents)}</p>
        <p className="typography-body-10 text-text-body">{view.intent.merchant.name} · {view.intent.merchant.suburb}</p>
        {!ok && <p className="mt-1 typography-body-10 font-bold text-text-danger">{view.intent.decline_reason}</p>}
        {transferred && (
          <Badge color="primary" soft className="mt-2">
            {money(transferred.amount_cents)} AutoTopUp · {transferred.auth_method === 'tap' ? 'approved with one tap' : `approved, verified by ${transferred.auth_method}`}
          </Badge>
        )}
      </div>
      <div className="space-y-1.5 p-2">
        {r && (
          <Card className="p-2.5">
            <p className="mb-1 typography-body-10 font-bold text-text-heading">Receipt</p>
            <dl className="typography-body-10">
              {[['Merchant', r.merchant], ['Amount', money(r.amount_cents)], ['Paid from', r.account], ['Time', timeLabel(r.ts)],
                ['Card taps', String(view.intent.attempts)], ['Reference', r.reference]].map(([k, v]) => (
                <div key={k} className="flex justify-between py-[3px]"><dt className="text-text-muted">{k}</dt><dd className="num font-bold text-text-body">{v}</dd></div>
              ))}
            </dl>
          </Card>
        )}
        <BalanceRows rows={view.accounts.filter((x) => x.id !== 'acc-goal').map((x) => ({ icon: x.type === 'everyday' ? WalletIcon : PiggyBankIcon, name: x.name, value: money(x.balance_cents) }))} />
        {related.length > 0 && (
          <Card className="overflow-hidden">
            <p className="px-2 pt-2 typography-body-10 font-bold text-text-heading">Recorded transactions</p>
            <ul className="divide-y divide-border-muted-soft px-2">{related.map((t) => <TxnRow key={t.id} t={t} merchantIcon={t.merchant_id ? icons[t.merchant_id] : undefined} />)}</ul>
          </Card>
        )}
        <div className="grid grid-cols-2 gap-1">
          {offer && <Button look="hero" soft size="large" block onClick={() => setScreen('analysis')}>AI analysis</Button>}
          <Button look="primary" size="large" block className={offer ? '' : 'col-span-2'} onClick={newPurchase}>New purchase</Button>
        </div>
      </div>
    </div>
  )
}
