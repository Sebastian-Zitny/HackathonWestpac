import { useState } from 'react'
import { Badge } from '@westpac/ui/badge'
import { AccountIcon, CreditCardIcon } from '@westpac/ui/icon'
import { useStore } from '../store'
import { money } from '../lib/format'
import { CardThumb, PageHeader } from '../components/ui'
import { AccountCard, accountFooter, TxnRow } from './Dashboard'

type Tab = 'overview' | 'cards'

export function AccountsScreen() {
  const { app, setScreen } = useStore()
  const [tab, setTab] = useState<Tab>('overview')
  if (!app) return null
  const icons = Object.fromEntries(app.merchants.map((m) => [m.id, m.icon]))
  const total = app.accounts.reduce((s, x) => s + x.balance_cents, 0)
  const everyday = app.accounts.find((x) => x.type === 'everyday')

  return (
    <div className="anim-fade-up min-h-full bg-background-pale pb-4">
      <PageHeader<Tab> title="Accounts" active={tab} onTab={setTab}
        tabs={[{ id: 'overview', label: 'Overview', icon: AccountIcon }, { id: 'cards', label: 'Cards', icon: CreditCardIcon }]} />

      {tab === 'overview' ? (
        <div className="px-2 pt-3">
          <p className="border-b border-border-muted-soft px-1 pb-1 typography-body-8 text-text-heading">Cash</p>
          <div className="mt-2 space-y-1.5">
            {app.accounts.map((acc) => <AccountCard key={acc.id} acc={acc} footer={accountFooter(acc, app.settings.source_account_id)} />)}
          </div>
          <dl className="mt-3 space-y-0.5 px-1 typography-body-9">
            <div className="flex justify-between text-text-heading"><dt>Credit</dt><dd className="num">{money(total)}</dd></div>
            <div className="flex justify-between text-text-heading"><dt>Debit</dt><dd className="num">$0.00</dd></div>
            <div className="flex justify-between typography-body-8 font-bold text-text-body"><dt>Total</dt><dd className="num">{money(total)}</dd></div>
          </dl>
          <button onClick={() => setScreen('settings')} className="mt-2 block w-full px-1 text-right typography-body-9 text-text-primary hover:underline focus-visible:focus-outline">AutoTopUp settings</button>

          <h2 id="acc-tx" className="mb-1.5 mt-4 px-1 typography-body-7 font-bold text-text-heading">Recent transactions</h2>
          <div className="rounded-3xl border border-border-muted-soft bg-surface-mono">
            <ul aria-labelledby="acc-tx" className="divide-y divide-border-muted-soft px-2">
              {app.transactions.slice(0, 15).map((t) => <TxnRow key={t.id} t={t} merchantIcon={t.merchant_id ? icons[t.merchant_id] : undefined} />)}
            </ul>
          </div>
        </div>
      ) : (
        <div className="space-y-2 px-2 pt-3">
          {everyday && (
            <div className="rounded-3xl border border-border-muted-soft bg-surface-mono p-3">
              <div className="flex h-[150px] flex-col justify-between rounded-3xl bg-gradient-to-br from-surface-primary to-[var(--wbc-primary-800)] p-2.5 text-text-mono shadow-md">
                <div className="flex items-start justify-between"><span className="typography-body-10 font-bold">Debit card</span><span className="h-[22px] w-[30px] rounded-[4px] bg-[var(--wbc-dance-200)]" aria-hidden /></div>
                <div>
                  <p className="num typography-body-8 tracking-widest">•••• •••• •••• {everyday.number_masked.slice(-4)}</p>
                  <p className="typography-body-10 opacity-90">{app.customer.first_name.toUpperCase()} {app.customer.last_name.toUpperCase()}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <CardThumb />
                <span className="flex-1 typography-body-9 text-text-body">Linked to {everyday.name}</span>
                <Badge color={app.autotopup.enabled ? 'success' : 'faint'} soft>AutoTopUp {app.autotopup.enabled ? 'on' : 'off'}</Badge>
              </div>
              <p className="mt-1 typography-body-10 text-text-muted">When this card would decline, AutoTopUp asks before moving money from your savings.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
