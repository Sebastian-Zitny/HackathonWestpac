import { useState } from 'react'
import { Alert } from '@westpac/ui/alert'
import { Switch } from '@westpac/ui/switch'
import { AccountIcon, ArrowRightIcon, CreditCardIcon, SettingsIcon } from '@westpac/ui/icon'
import { useStore } from '../store'
import { api } from '../lib/api'
import { money } from '../lib/format'
import { PageHeader } from '../components/ui'
import { AccountCard, accountFooter, TxnRow } from './Dashboard'

type Tab = 'overview' | 'cards'

/** Accounts tab. The Cards sub-tab is where AutoTopUp is switched on or off for each card. */
export function AccountsScreen() {
  const { app, screen, setScreen, refresh } = useStore()
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!app) return null
  const tab: Tab = screen === 'cards' ? 'cards' : 'overview'
  const icons = Object.fromEntries(app.merchants.map((m) => [m.id, m.icon]))
  const total = app.accounts.reduce((s, x) => s + x.balance_cents, 0)
  const everyday = app.accounts.find((x) => x.type === 'everyday')
  const source = app.accounts.find((x) => x.id === app.settings.source_account_id)
  const on = app.settings.enabled

  const toggleCard = async (v: boolean) => {
    setErr(null)
    setSaving(true)
    try {
      await api.saveSettings({ ...app.settings, enabled: v })
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update the card')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="anim-fade-up min-h-full bg-background-pale pb-4">
      <PageHeader<Tab> title="Accounts" active={tab} onTab={(t) => setScreen(t === 'cards' ? 'cards' : 'accounts')}
        tabs={[{ id: 'overview', label: 'Overview', icon: AccountIcon }, { id: 'cards', label: 'Cards', icon: CreditCardIcon }]} />

      {tab === 'overview' ? (
        <div className="px-2 pt-3">
          <p className="border-b border-border-muted-soft px-1 pb-1 typography-body-8 text-text-heading">Cash</p>
          <div className="mt-2 space-y-1.5">
            {app.accounts.map((acc) => (
              <AccountCard key={acc.id} acc={acc} footer={accountFooter(acc, app.settings.source_account_id, on)}
                onView={acc.type === 'everyday' ? () => setScreen('cards') : undefined} />
            ))}
          </div>
          <dl className="mt-3 space-y-0.5 px-1 typography-body-9">
            <div className="flex justify-between text-text-heading"><dt>Credit</dt><dd className="num">{money(total)}</dd></div>
            <div className="flex justify-between text-text-heading"><dt>Debit</dt><dd className="num">$0.00</dd></div>
            <div className="flex justify-between typography-body-8 font-bold text-text-body"><dt>Total</dt><dd className="num">{money(total)}</dd></div>
          </dl>

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
              <p className="mt-2 typography-body-10 text-text-muted">Linked to {everyday.name} {everyday.number_masked}</p>

              <div className="mt-2 rounded-2xl border border-border-muted-soft p-2">
                <Switch block size="medium" label="AutoTopUp for this card" isSelected={on} isDisabled={saving} onChange={toggleCard} className="mb-0 font-bold" />
                <p className="typography-body-10 text-text-muted">
                  {on
                    ? `If a payment on this card would decline, we'll ask before moving the shortfall from ${source?.name ?? 'your savings'}.`
                    : 'Off: payments on this card that are short of funds will simply decline.'}
                </p>
              </div>
              {err && <Alert look="danger" className="mb-0 mt-1.5 rounded-2xl">{err}</Alert>}

              <button onClick={() => setScreen('settings')} className="mt-2 flex w-full items-center gap-1.5 rounded-2xl border border-border-muted-soft px-2 py-1.5 text-left hover:border-border-hero focus-visible:focus-outline">
                <SettingsIcon size="small" color="hero" aria-hidden />
                <span className="flex-1">
                  <span className="block typography-body-9 text-text-body">AutoTopUp limits & security</span>
                  <span className="block typography-body-10 text-text-muted">Per-transfer and daily limits, savings reserve, PIN or biometrics</span>
                </span>
                <ArrowRightIcon size="small" color="primary" aria-hidden />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
