import { useEffect, useState } from 'react'
import { Alert } from '@westpac/ui/alert'
import { Button } from '@westpac/ui/button'
import { ButtonGroup, ButtonGroupButton } from '@westpac/ui/button-group'
import { Badge } from '@westpac/ui/badge'
import { FlexiCell, FlexiCellAdornment, FlexiCellHint, FlexiCellLabel } from '@westpac/ui/flexi-cell'
import { Input } from '@westpac/ui/input'
import { InputGroup } from '@westpac/ui/input-group'
import { Select } from '@westpac/ui/select'
import { Switch } from '@westpac/ui/switch'
import { FingerprintIcon, KeyIcon, SecurityIcon, StarsIcon } from '@westpac/ui/icon'
import { useStore } from '../store'
import { api, ApiError, type Settings } from '../lib/api'
import { centsToDollars, dateLabel, dollarsToCents, money } from '../lib/format'
import { Card, IconTile, MerchantIcon, PageHeader, SectionTitle } from '../components/ui'

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="py-1.5">
      <Switch block size="small" label={label} isSelected={checked} onChange={onChange} className="mb-0 font-bold" />
      {hint && <p className="-mt-0.5 pr-10 typography-body-10 text-text-muted">{hint}</p>}
    </div>
  )
}

/** The message for one field, shown under it so people can see exactly which value is out of range. */
function FieldError({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p id={id} role="alert" className="mt-0.5 typography-body-10 font-bold text-text-danger">{msg}</p> : null
}

function MoneyField({ label, cents, onChange, hint, error, id }: { label: string; cents: number; onChange: (c: number) => void; hint?: string; error?: string; id: string }) {
  const [v, setV] = useState(Number.isFinite(cents) ? centsToDollars(cents) : '')
  useEffect(() => { if (Number.isFinite(cents)) setV(centsToDollars(cents)) }, [cents])
  return (
    <div className="py-1">
      <InputGroup label={label} hint={hint} size="medium" before="$" width="full">
        <Input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onChange(dollarsToCents(v))}
          invalid={!!error} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} className="num" />
      </InputGroup>
      <FieldError id={`${id}-err`} msg={error} />
    </div>
  )
}

export function SettingsScreen() {
  const { app, refresh, setScreen } = useStore()
  const [s, setS] = useState<Settings | null>(app?.settings ?? null)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({})
  useEffect(() => { if (app) setS(app.settings) }, [app?.settings]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!app || !s) return null
  const dirty = JSON.stringify(s) !== JSON.stringify(app.settings)
  const up = (p: Partial<Settings>) => {
    setS({ ...s, ...p }); setSaved(false)
    setFieldErrs((fe) => Object.fromEntries(Object.entries(fe).filter(([k]) => !(k in p))))
  }
  const savingsAccts = app.accounts.filter((a) => a.type === 'savings')
  const everydayAccts = app.accounts.filter((a) => a.type === 'everyday')

  const save = async () => {
    setErr(null)
    setFieldErrs({})
    try {
      await api.saveSettings(s)
      await refresh()
      setSaved(true)
    } catch (e) {
      const fields = e instanceof ApiError && Array.isArray(e.body.fields) ? (e.body.fields as { field: string; label: string; message: string }[]) : []
      setFieldErrs(Object.fromEntries(fields.map((f) => [f.field, f.message])))
      setErr(fields.length === 1 ? `Please fix ${fields[0].label}.`
        : fields.length ? `Please fix the ${fields.length} highlighted fields: ${fields.map((f) => f.label).join(', ')}.`
        : e instanceof Error ? e.message : 'Could not save')
    }
  }

  return (
    <div className="anim-fade-up min-h-full bg-background-pale pb-14">
      <PageHeader title="AutoTopUp limits" onBack={() => setScreen('cards')} />
      <div className="px-2 pt-2">
      <p className="mb-2 typography-body-10 text-text-muted">You stay in control. Every setting here changes how top-ups are decided.</p>
      <Alert look="info" className="mb-0 rounded-2xl">AutoTopUp only moves your own money between your accounts. It never creates credit, a loan or an overdraft.</Alert>

      <p className="mt-2 px-0.5 typography-body-10 text-text-muted">
        AutoTopUp is <b className="text-text-body">{app.settings.enabled ? 'on' : 'off'}</b> for your card.{' '}
        <button onClick={() => setScreen('cards')} className="text-text-primary underline focus-visible:focus-outline">Change it in Accounts → Cards</button>
      </p>

      <SectionTitle>Accounts</SectionTitle>
      <Card className="space-y-2 p-2.5">
        <div>
          <label htmlFor="src-acct" className="mb-0.5 block typography-body-10 font-bold text-text-body">Transfer from</label>
          <Select id="src-acct" size="medium" width="full" value={s.source_account_id} onChange={(e) => up({ source_account_id: e.target.value })}>
            {savingsAccts.map((a) => <option key={a.id} value={a.id}>{a.name} {a.number_masked} — {money(a.balance_cents)}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="dst-acct" className="mb-0.5 block typography-body-10 font-bold text-text-body">Top up</label>
          <Select id="dst-acct" size="medium" width="full" value={s.destination_account_id} onChange={(e) => up({ destination_account_id: e.target.value })}>
            {everydayAccts.map((a) => <option key={a.id} value={a.id}>{a.name} {a.number_masked}</option>)}
          </Select>
        </div>
      </Card>

      <SectionTitle>Limits</SectionTitle>
      <Card className="p-2.5">
        <MoneyField label="Maximum per transfer" cents={s.max_per_transfer_cents} onChange={(c) => up({ max_per_transfer_cents: c })} id="max-transfer" error={fieldErrs.max_per_transfer_cents} />
        <MoneyField label="Maximum total per day" cents={s.max_daily_total_cents} onChange={(c) => up({ max_daily_total_cents: c })} id="max-daily" error={fieldErrs.max_daily_total_cents} />
        <div className="py-1">
          <label htmlFor="max-count" className="mb-0.5 block typography-body-10 font-bold text-text-body">Maximum AutoTopUps per day</label>
          <Input id="max-count" type="number" min={1} max={20} size="medium" width="full" value={Number.isFinite(s.max_daily_count) ? s.max_daily_count : ''}
            onChange={(e) => up({ max_daily_count: e.target.value === '' ? NaN : Number(e.target.value) })}
            invalid={!!fieldErrs.max_daily_count} aria-invalid={!!fieldErrs.max_daily_count} aria-describedby={fieldErrs.max_daily_count ? 'max-count-err' : undefined} className="num" />
          <FieldError id="max-count-err" msg={fieldErrs.max_daily_count} />
        </div>
        <MoneyField label="Minimum savings balance to keep" hint="Transfers never take savings below this" cents={s.min_savings_reserve_cents} onChange={(c) => up({ min_savings_reserve_cents: c })} id="min-reserve" error={fieldErrs.min_savings_reserve_cents} />
      </Card>

      <SectionTitle>Approval</SectionTitle>
      <Card className="px-2.5 py-1">
        <p className="pt-1.5 typography-body-10 text-text-body">AutoTopUp always asks you first. You get <b>{Math.round(app.autotopup.approval_window_seconds / 60)} minutes</b> to approve or decline each request; if you don't respond, nothing moves.</p>
        <Toggle label="Allow one-tap approval" hint="For high-trust purchases at merchants the AI recognises, while you're signed in" checked={s.quick_approve_enabled} onChange={(v) => up({ quick_approve_enabled: v })} />
        <div className="grid grid-cols-2 gap-2 pb-2">
          <div>
            <label htmlFor="quick-from" className="mb-0.5 block typography-body-10 font-bold text-text-body">One-tap from</label>
            <Input id="quick-from" type="time" size="medium" width="full" value={s.quick_hours_start} onChange={(e) => up({ quick_hours_start: e.target.value })}
              invalid={!!fieldErrs.quick_hours_start} aria-invalid={!!fieldErrs.quick_hours_start} className="num" />
            <FieldError id="quick-from-err" msg={fieldErrs.quick_hours_start} />
          </div>
          <div>
            <label htmlFor="quick-to" className="mb-0.5 block typography-body-10 font-bold text-text-body">Until</label>
            <Input id="quick-to" type="time" size="medium" width="full" value={s.quick_hours_end} onChange={(e) => up({ quick_hours_end: e.target.value })}
              invalid={!!fieldErrs.quick_hours_end} aria-invalid={!!fieldErrs.quick_hours_end} className="num" />
            <FieldError id="quick-to-err" msg={fieldErrs.quick_hours_end} />
          </div>
        </div>
        <p className="-mt-1 pb-2 text-[0.75rem] text-text-muted">Outside these hours every top-up needs biometrics or your PIN.</p>
      </Card>

      <SectionTitle>Security</SectionTitle>
      <Card className="px-2.5 py-1">
        <Toggle label="Extra verification for new merchants" hint="First purchase with a merchant always needs your PIN" checked={s.unfamiliar_requires_enhanced} onChange={(v) => up({ unfamiliar_requires_enhanced: v })} />
        <div className="pb-2 pt-1">
          <p id="auth-label" className="mb-1 typography-body-10 font-bold text-text-body">Preferred authentication</p>
          <ButtonGroup aria-labelledby="auth-label" look="hero" size="medium" block selectionMode="single"
            selectedKeys={s.preferred_auth} onSelectionChange={(k) => k && up({ preferred_auth: k as Settings['preferred_auth'] })}>
            <ButtonGroupButton id="biometric" iconBefore={FingerprintIcon}>Biometric</ButtonGroupButton>
            <ButtonGroupButton id="pin" iconBefore={KeyIcon}>PIN</ButtonGroupButton>
          </ButtonGroup>
          <p className="mt-1 flex items-center gap-0.5 typography-body-10 text-text-muted"><SecurityIcon size="xsmall" aria-hidden /> Enhanced verification always uses your PIN. Demo PIN: 1234.</p>
        </div>
      </Card>

      <SectionTitle id="familiar-heading">Familiar merchants · learned by AI</SectionTitle>
      <Card className="px-2">
        <p className="flex gap-1 pt-2 typography-body-10 text-text-muted"><StarsIcon size="small" color="hero" className="shrink-0" aria-hidden />
          There's no list to maintain. The AI learns which merchants are familiar from your last 90 days of purchases, and every new purchase is added to that history.</p>
        <ul aria-labelledby="familiar-heading" className="divide-y divide-border-muted-soft">
          {app.familiar_merchants.map((m) => (
            <FlexiCell key={m.merchant_id} tag="li" className="mb-0" before={<IconTile icon={(p) => <MerchantIcon icon={m.icon} {...p} />} />}
              after={<FlexiCellAdornment align="center"><Badge color={m.familiarity === 'Regular' ? 'success' : 'faint'} soft>{m.familiarity}</Badge></FlexiCellAdornment>}>
              <FlexiCellLabel>{m.name}</FlexiCellLabel>
              <FlexiCellHint><span className="num">{m.visits} purchase{m.visits === 1 ? '' : 's'} · usually {money(m.typical_cents)} · last {dateLabel(m.last_visit)}</span></FlexiCellHint>
            </FlexiCell>
          ))}
        </ul>
      </Card>

      <SectionTitle>Notifications</SectionTitle>
      <Card className="px-2.5 py-1">
        <Toggle label="Push notifications" hint="Top-up requests always appear" checked={s.notifications.push} onChange={(v) => up({ notifications: { ...s.notifications, push: v } })} />
        <Toggle label="Payment and transfer receipts" checked={s.notifications.transfer_receipts} onChange={(v) => up({ notifications: { ...s.notifications, transfer_receipts: v } })} />
        <Toggle label="Email summaries" checked={s.notifications.email} onChange={(v) => up({ notifications: { ...s.notifications, email: v } })} />
        <Toggle label="Weekly spending summary" checked={s.notifications.weekly_summary} onChange={(v) => up({ notifications: { ...s.notifications, weekly_summary: v } })} />
      </Card>

      <div className={dirty ? 'sticky bottom-2 mt-3' : 'mt-3'}>
        {err && <Alert look="danger" className="mb-1 rounded-2xl">{err}</Alert>}
        <div className="rounded-xl bg-surface-mono shadow-[0_8px_24px_-6px_rgba(31,28,79,.3)]">
          <Button look={dirty ? 'primary' : 'faint'} size="xlarge" block disabled={!dirty} onClick={save}>
            {dirty ? 'Save settings' : saved ? '✓ Settings saved' : 'No changes to save'}
          </Button>
        </div>
      </div>
      </div>
    </div>
  )
}
