import { useState } from 'react'
import { Badge } from '@westpac/ui/badge'
import { FlexiCell, FlexiCellAdornment, FlexiCellHint, FlexiCellLabel } from '@westpac/ui/flexi-cell'
import { CloseIcon, CreditCardIcon, HeadsetIcon, MoneyInIcon, MoneyOutIcon, PersonIcon, TransferIcon } from '@westpac/ui/icon'
import { useStore } from '../store'
import type { Account, Txn } from '../lib/api'
import { cx, dateLabel, money, timeLabel } from '../lib/format'
import { CardThumb, IconTile, MerchantIcon, SectionLink } from '../components/ui'

export function TxnRow({ t, merchantIcon }: { t: Txn; merchantIcon?: string }) {
  const credit = t.amount_cents > 0
  const before = t.is_autotopup
    ? <IconTile icon={TransferIcon} tone="primary" />
    : t.merchant_id ? <IconTile icon={(p) => <MerchantIcon icon={merchantIcon} {...p} />} />
      : <IconTile icon={credit ? MoneyInIcon : MoneyOutIcon} tone={credit ? 'success' : 'muted'} />
  return (
    <FlexiCell tag="li" className="mb-0" before={before}
      after={<FlexiCellAdornment align="center"><span className={cx('num typography-body-10 font-bold', credit ? 'text-text-success' : 'text-text-body')}>{money(t.amount_cents, { sign: true })}</span></FlexiCellAdornment>}>
      <FlexiCellLabel truncateText>{t.description}</FlexiCellLabel>
      <FlexiCellHint>
        {dateLabel(t.ts)} · {timeLabel(t.ts)}{t.account_id === 'acc-savings' ? ' · eSaver' : ''}
        {t.is_autotopup ? <Badge color="primary" soft className="ml-1">AutoTopUp</Badge> : null}
      </FlexiCellHint>
    </FlexiCell>
  )
}

/** Account card in the style of the banking app: name, BSB/number, balance, then a card row. */
export function AccountCard({ acc, footer, onView }: { acc: Account; footer: React.ReactNode; onView?: () => void }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border-muted-soft bg-surface-mono shadow-[0_2px_6px_rgba(0,0,0,.06)]">
      <div className="flex items-start justify-between gap-2 px-3 pb-3 pt-2.5">
        <div>
          <p className="typography-body-8 text-text-body">{acc.name}</p>
          <p className="num mt-0.5 typography-body-10 text-text-muted">{acc.bsb} {acc.number_masked}</p>
        </div>
        <p className="num typography-body-8 font-bold text-text-body">{money(acc.balance_cents)}</p>
      </div>
      <div className="flex items-center gap-1.5 border-t border-border-muted-soft px-3 py-2">
        {footer}
        {onView && <button onClick={onView} className="ml-auto typography-body-9 text-text-primary hover:underline focus-visible:focus-outline">View</button>}
      </div>
    </div>
  )
}

export function accountFooter(acc: Account, autotopupSource: string, autotopupOn = false) {
  if (acc.type === 'everyday') return (
    <>
      <CardThumb />
      <span className="whitespace-nowrap typography-body-10 text-text-muted">Card …{acc.number_masked.slice(-4)}</span>
      <Badge color={autotopupOn ? 'success' : 'faint'} soft className="ml-1">AutoTopUp {autotopupOn ? 'on' : 'off'}</Badge>
    </>
  )
  if (acc.id === autotopupSource) return <><TransferIcon size="small" color="primary" aria-hidden /><span className="typography-body-10 text-text-muted">AutoTopUp source account</span></>
  return <span className="typography-body-10 text-text-muted">Savings goal</span>
}

export function Dashboard() {
  const { app, setScreen } = useStore()
  const [hidden, setHidden] = useState<number[]>([])
  if (!app) return null
  const notes = app.notifications.filter((n) => !hidden.includes(n.id)).slice(0, 2)
  const favourites = app.accounts.filter((x) => x.id !== 'acc-goal')

  return (
    <div className="anim-fade-up pb-4">
      {/* Gradient header (GEL hero navy -> holler purple -> primary red) */}
      <div className="relative overflow-hidden px-3 pb-10 pt-8 text-text-mono"
        style={{ background: 'linear-gradient(118deg, var(--wbc-hero-700) 0%, var(--wbc-hero-500) 30%, var(--wbc-holler-700) 46%, var(--wbc-pop-800) 58%, var(--wbc-primary-700) 74%, var(--wbc-primary-500) 100%)' }}>
        <span className="pointer-events-none absolute -left-10 top-0 h-[420px] w-[120px] rotate-[32deg] bg-[var(--wbc-holler-500)] opacity-40" aria-hidden />
        <span className="pointer-events-none absolute left-[38%] -top-10 h-[420px] w-[70px] rotate-[32deg] bg-[var(--wbc-pop-500)] opacity-25" aria-hidden />
        <div className="relative flex items-center justify-between">
          <p className="typography-body-6 font-black tracking-tight">Hi {app.customer.first_name}</p>
          <div className="flex items-center gap-1">
            <span className="flex items-center gap-0.5 rounded-full border-2 border-white/90 px-1.5 py-0.5 typography-body-10"><HeadsetIcon size="xsmall" aria-hidden /> Contact us</span>
            <span className="grid size-5 place-items-center rounded-full border-2 border-white/90"><PersonIcon size="xsmall" aria-hidden /></span>
          </div>
        </div>
      </div>

      <div className="relative -mt-4 rounded-t-[24px] bg-background-pale px-2 pt-1">
        {app.security_hold && (
          <div className="mt-2 rounded-3xl border border-border-danger-mild bg-surface-danger-faint p-2 typography-body-10 text-text-danger"><b>Security hold active.</b> AutoTopUp is paused.</div>
        )}

        <SectionLink onClick={() => setScreen('accounts')}>Favourite accounts</SectionLink>
        <div className="space-y-1.5">
          {favourites.map((acc) => (
            <AccountCard key={acc.id} acc={acc} footer={accountFooter(acc, app.settings.source_account_id, app.autotopup.enabled)}
              onView={() => setScreen(acc.type === 'everyday' ? 'cards' : 'accounts')} />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between px-0.5">
          <button onClick={() => setScreen('cards')} className="flex items-center gap-1 typography-body-9 text-text-primary hover:underline focus-visible:focus-outline">
            <CreditCardIcon size="small" aria-hidden /> Card & AutoTopUp
          </button>
          <button onClick={() => setScreen('accounts')} className="typography-body-9 text-text-primary hover:underline focus-visible:focus-outline">All accounts</button>
        </div>

        {notes.length > 0 && (
          <>
            <SectionLink onClick={() => setScreen('pay')}>Notifications</SectionLink>
            <ul className="space-y-1.5">
              {notes.map((n) => (
                <li key={n.id} className="flex items-stretch overflow-hidden rounded-3xl border border-border-muted-soft bg-surface-mono">
                  <div className="flex-1 px-3 py-2">
                    <p className="typography-body-9 text-text-body">{n.title}</p>
                    <p className="mt-0.5 typography-body-10 text-text-muted">{n.body}</p>
                  </div>
                  <button onClick={() => setHidden((h) => [...h, n.id])} aria-label="Dismiss notification" className="grid w-8 shrink-0 place-items-center border-l border-border-muted-soft text-text-body hover:bg-surface-hover-mono focus-visible:focus-outline">
                    <CloseIcon size="small" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
