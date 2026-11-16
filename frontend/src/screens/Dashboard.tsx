import { useEffect, useState } from 'react'
import { Alert } from '@westpac/ui/alert'
import { Badge } from '@westpac/ui/badge'
import { FlexiCell, FlexiCellAdornment, FlexiCellHint, FlexiCellLabel } from '@westpac/ui/flexi-cell'
import { ProgressBar } from '@westpac/ui/progress-bar'
import { MoneyInIcon, MoneyOutIcon, PiggyBankIcon, TransferIcon, WalletIcon } from '@westpac/ui/icon'
import { useStore } from '../store'
import { api, type Insights, type Txn } from '../lib/api'
import { CATEGORY_LABEL, cx, dateLabel, money, timeLabel } from '../lib/format'
import { Card, IconTile, MerchantIcon, SectionTitle } from '../components/ui'

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

export function Dashboard() {
  const { app, setScreen } = useStore()
  const [ins, setIns] = useState<Insights | null>(null)
  useEffect(() => { api.insights().then(setIns).catch(() => null) }, [app?.now])
  if (!app) return null
  const hour = new Date(app.now).getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const icons = Object.fromEntries(app.merchants.map((m) => [m.id, m.icon]))
  const a = app.autotopup
  const top = ins?.spending_by_category.slice(0, 3) ?? []
  const totalTop = ins?.spending_by_category.reduce((s, c) => s + c.total_cents, 0) || 1
  const total = app.accounts.reduce((s, x) => s + x.balance_cents, 0)

  return (
    <div className="anim-fade-up pb-4">
      <div className="bg-background-hero px-3 pb-10 pt-3 text-text-mono">
        <p className="typography-body-10 opacity-80">{greet},</p>
        <p className="typography-body-7 font-bold">{app.customer.first_name}</p>
        <p className="num mt-1 typography-body-10 opacity-80">Total across accounts <b className="opacity-100">{money(total)}</b></p>
      </div>
      <div className="-mt-7 space-y-1.5 px-2">
        <ul aria-label="Accounts" className="space-y-1.5">
          {app.accounts.map((acc) => (
            <FlexiCell key={acc.id} tag="li" withBorder className="mb-0 shadow-[0_2px_8px_rgba(31,28,79,.06)]"
              before={<IconTile icon={acc.type === 'everyday' ? WalletIcon : PiggyBankIcon} tone={acc.type === 'everyday' ? 'hero' : 'primary'} />}
              after={<FlexiCellAdornment align="center"><span className="num typography-body-8 font-bold text-text-heading">{money(acc.balance_cents)}</span><span className="text-[0.75rem] text-text-muted">available</span></FlexiCellAdornment>}>
              <FlexiCellLabel>{acc.name}</FlexiCellLabel>
              <FlexiCellHint>{acc.bsb} {acc.number_masked}</FlexiCellHint>
            </FlexiCell>
          ))}
        </ul>

        {app.security_hold && (
          <Alert look="danger" heading="Security hold active" className="mb-0 rounded-2xl">AutoTopUp is paused until the hold is removed.</Alert>
        )}

        <FlexiCell tag="button" withBorder withArrow onClick={() => setScreen('settings')} className="mb-0 w-full text-left"
          before={<IconTile icon={TransferIcon} tone="reversed" />}>
          <FlexiCellLabel>
            <span className="flex flex-wrap items-center gap-1">AutoTopUp
              <Badge color={a.enabled ? 'success' : 'faint'} soft>{a.enabled ? 'On' : 'Off'}</Badge>
              {a.enabled && <Badge color="hero" soft>Always asks first</Badge>}
            </span>
          </FlexiCellLabel>
          <FlexiCellHint><span className="num">Today: {a.today_count} of {a.max_daily_count} top-ups · {money(a.today_total_cents)} of {money(a.max_daily_total_cents)}</span></FlexiCellHint>
          <ProgressBar look="skinny" noLabel value={Math.min(100, (a.today_total_cents / Math.max(a.max_daily_total_cents, 1)) * 100)} aria-label="Daily AutoTopUp limit used" className="mt-0.5" />
        </FlexiCell>

        {ins && (
          <>
            <SectionTitle action={<button onClick={() => setScreen('insights')} className="typography-body-10 font-bold text-text-link hover:underline focus-visible:focus-outline">See all</button>}>Spending insights · 30 days</SectionTitle>
            <Card className="space-y-2 p-2.5">
              {top.map((c) => (
                <div key={c.category}>
                  <div className="flex justify-between typography-body-10"><span className="text-text-body">{CATEGORY_LABEL[c.category] ?? c.category}</span><span className="num font-bold text-text-heading">{money(c.total_cents)}</span></div>
                  <div className="mt-0.5 h-1 rounded-full bg-surface-muted-pale"><div className="h-1 rounded-full bg-[var(--data-b-solid)]" style={{ width: `${Math.max(4, (c.total_cents / totalTop) * 100)}%` }} /></div>
                </div>
              ))}
              <p className="typography-body-10 text-text-muted">{ins.finance.headline}. Next payday {ins.finance.next_payday ? dateLabel(ins.finance.next_payday) : '—'}.</p>
            </Card>
          </>
        )}

        <SectionTitle id="recent-tx">Recent transactions</SectionTitle>
        <Card className="overflow-hidden">
          <ul aria-labelledby="recent-tx" className="divide-y divide-border-muted-soft px-2">
            {app.transactions.slice(0, 10).map((t) => <TxnRow key={t.id} t={t} merchantIcon={t.merchant_id ? icons[t.merchant_id] : undefined} />)}
          </ul>
        </Card>
      </div>
    </div>
  )
}
