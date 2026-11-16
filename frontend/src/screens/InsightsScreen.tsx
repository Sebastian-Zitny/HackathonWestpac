import { useEffect, useState } from 'react'
import { Alert } from '@westpac/ui/alert'
import { Badge } from '@westpac/ui/badge'
import { FlexiCell, FlexiCellAdornment, FlexiCellHint, FlexiCellLabel } from '@westpac/ui/flexi-cell'
import { BarChartIcon, CalendarIcon, MoneyInIcon, PieChartIcon, StarsIcon, TransferIcon, WarningIcon } from '@westpac/ui/icon'
import { useStore } from '../store'
import { api, type Insights } from '../lib/api'
import { CATEGORY_LABEL, cx, dateLabel, money } from '../lib/format'
import { Card, IconTile, PageHeader, SectionTitle, Spinner } from '../components/ui'

/** Single-series weekly bars (GEL data-b = hero navy; current week = data-a primary). Hover/focus tooltip per bar. */
function WeeklyBars({ data }: { data: Insights['weekly_totals'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.total_cents), 1)
  return (
    <div>
      <div className="relative flex h-[132px] items-end gap-[6px]" role="group" aria-label="Weekly spending, last 8 weeks">
        {data.map((d, i) => (
          <div key={d.week_ending} tabIndex={0} role="img" aria-label={`Week ending ${dateLabel(d.week_ending)}: ${money(d.total_cents)}`}
            className="relative flex h-full flex-1 items-end rounded-sm focus-visible:focus-outline"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
            <div className={cx('w-full rounded-t-[4px] transition-opacity', i === data.length - 1 ? 'bg-[var(--data-a-solid)]' : 'bg-[var(--data-b-solid)]', hover !== null && hover !== i && 'opacity-60')}
              style={{ height: `${Math.max(3, (d.total_cents / max) * 100)}%` }} />
            {hover === i && (
              <div className="absolute -top-5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-muted-vivid px-1 py-0.5 text-[0.75rem] text-text-mono shadow">
                <span className="num font-bold">{money(d.total_cents)}</span> · w/e {dateLabel(d.week_ending)}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-0.5 flex justify-between border-t border-border-muted-soft pt-0.5 text-[0.75rem] text-text-muted"><span>8 weeks ago</span><span>This week</span></div>
    </div>
  )
}

type Tab = 'overview' | 'insights'

export function InsightsScreen() {
  const { app, setScreen } = useStore()
  const [d, setD] = useState<Insights | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  useEffect(() => { api.insights().then(setD).catch(() => null) }, [app?.now])
  return (
    <div className="anim-fade-up min-h-full bg-background-pale pb-4">
      <PageHeader<Tab> title="Insights & tools" active={tab} onTab={setTab}
        tabs={[{ id: 'overview', label: 'Overview', icon: PieChartIcon }, { id: 'insights', label: 'Insights', icon: StarsIcon }]} />
      {!d ? <div className="grid h-[240px] place-items-center text-text-muted"><Spinner /></div>
        : tab === 'overview' ? <Overview d={d} openDetail={() => setTab('insights')} openSettings={() => setScreen('settings')} /> : <InsightsDetail d={d} />}
    </div>
  )
}

function MoneyTool({ title, children, onClick }: { title: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex min-h-[170px] flex-col rounded-3xl border border-border-muted-soft bg-surface-mono p-2.5 text-left hover:border-border-hero focus-visible:focus-outline">
      <span className="typography-body-10 font-bold uppercase tracking-wide text-text-heading">{title}</span>
      {children}
    </button>
  )
}

function Overview({ d, openDetail, openSettings }: { d: Insights; openDetail: () => void; openSettings: () => void }) {
  const spent = d.spending_by_category.reduce((s, c) => s + c.total_cents, 0)
  const income = d.finance.expected_income_14d_cents
  const top = d.spending_by_category[0]
  const bills = d.upcoming.filter((u) => u.kind === 'bill')
  const max = Math.max(spent, income, 1)
  return (
    <div className="px-2 pt-3">
      <div className="overflow-hidden rounded-3xl border border-border-muted-soft bg-surface-mono">
        <div className="relative grid h-[150px] place-items-center overflow-hidden"
          style={{ background: 'linear-gradient(135deg, var(--wbc-holler-50) 0%, var(--wbc-holler-100) 60%, var(--wbc-pop-100) 100%)' }}>
          <span className="absolute -right-6 -top-6 size-[140px] rounded-full bg-[var(--wbc-holler-200)] opacity-60" aria-hidden />
          <span className="absolute -bottom-8 left-6 size-[110px] rounded-full bg-[var(--wbc-pop-200)] opacity-60" aria-hidden />
          <span className="relative grid size-12 place-items-center rounded-full bg-surface-holler text-text-mono shadow-lg"><TransferIcon size="large" aria-hidden /></span>
        </div>
        <div className="p-3">
          <p className="typography-body-8 font-bold text-text-heading">AutoTopUp AI</p>
          <p className="mt-0.5 typography-body-9 text-text-muted">Smarter top-ups that learn your spending, and always ask first.</p>
          <button onClick={openSettings} className="mt-1 typography-body-9 text-text-primary hover:underline focus-visible:focus-outline">Get started</button>
        </div>
      </div>

      <h2 className="mb-1.5 mt-4 px-0.5 typography-body-7 font-bold text-text-heading">Money tools</h2>
      <div className="grid grid-cols-2 gap-1.5">
        <MoneyTool title="Cash flow" onClick={openDetail}>
          <span className="num mt-1 typography-body-7 font-bold text-text-body">{money(spent)}</span>
          <span className="typography-body-10 text-text-muted">spent, last 30 days</span>
          <span className="mt-auto pt-1 typography-body-10 text-text-muted">Expenses</span>
          <span className="h-1 rounded-full bg-surface-muted-pale"><span className="block h-1 rounded-full bg-surface-holler" style={{ width: `${(spent / max) * 100}%` }} /></span>
          <span className="mt-0.5 typography-body-10 text-text-muted">Income next 14 days</span>
          <span className="h-1 rounded-full bg-surface-muted-pale"><span className="block h-1 rounded-full bg-surface-hero" style={{ width: `${(income / max) * 100}%` }} /></span>
        </MoneyTool>
        <MoneyTool title="Categories" onClick={openDetail}>
          <span className="num mt-1 typography-body-7 font-bold text-text-body">{top ? money(top.total_cents) : '$0.00'}</span>
          <span className="typography-body-10 text-text-muted">{top ? `top category: ${CATEGORY_LABEL[top.category] ?? top.category}` : 'No spending yet'}</span>
        </MoneyTool>
        <MoneyTool title="Bills calendar" onClick={openDetail}>
          <CalendarIcon size="large" color="hero" className="mt-1.5" aria-hidden />
          <span className="mt-auto typography-body-10 text-text-muted">{bills.length} bills in the next 14 days</span>
        </MoneyTool>
        <MoneyTool title="AutoTopUp" onClick={openSettings}>
          <span className="num mt-1 typography-body-7 font-bold text-text-body">{d.autotopups_30d.count}</span>
          <span className="typography-body-10 text-text-muted">top-ups in 30 days · {money(d.autotopups_30d.total_cents)}</span>
        </MoneyTool>
      </div>
    </div>
  )
}

function InsightsDetail({ d }: { d: Insights }) {
  const catMax = Math.max(...d.spending_by_category.map((c) => c.total_cents), 1)
  const catTotal = d.spending_by_category.reduce((s, c) => s + c.total_cents, 0)
  const f = d.finance
  const ev = d.model.evaluation_on_synthetic_holdout
  return (
    <div className="px-2 pt-2">
      <p className="num px-0.5 typography-body-10 text-text-muted">Last 30 days · {money(catTotal)} card spending</p>

      <SectionTitle>Spending by category</SectionTitle>
      <Card className="space-y-2 p-2.5">
        {d.spending_by_category.map((c) => {
          const pct = Math.round((c.total_cents / catTotal) * 100)
          return (
            <div key={c.category} title={`${CATEGORY_LABEL[c.category] ?? c.category}: ${money(c.total_cents)} (${pct}%)`}>
              <div className="flex justify-between typography-body-10"><span className="text-text-body">{CATEGORY_LABEL[c.category] ?? c.category}</span>
                <span className="num font-bold text-text-heading">{money(c.total_cents)} <span className="font-normal text-text-muted">{pct}%</span></span></div>
              <div className="mt-0.5 h-1 rounded-full bg-surface-muted-pale"><div className="h-1 rounded-full bg-[var(--data-b-solid)]" style={{ width: `${Math.max(3, (c.total_cents / catMax) * 100)}%` }} /></div>
            </div>
          )
        })}
      </Card>

      <SectionTitle>Weekly pattern</SectionTitle>
      <Card className="p-2.5 pt-6"><WeeklyBars data={d.weekly_totals} /></Card>

      <SectionTitle>Unusual transactions</SectionTitle>
      <Card className="px-2">
        {d.unusual_transactions.length === 0 && <p className="py-2 typography-body-10 text-text-muted">Nothing unusual in the last 30 days. Your spending matches your normal pattern.</p>}
        <ul className="divide-y divide-border-muted-soft">
          {d.unusual_transactions.map((u) => (
            <FlexiCell key={u.ts + u.merchant} tag="li" className="mb-0" before={<IconTile icon={WarningIcon} tone="primary" />}
              after={<FlexiCellAdornment align="top"><Badge color="danger" soft>Trust {u.trust_score}</Badge></FlexiCellAdornment>}>
              <FlexiCellLabel>{u.merchant} · <span className="num">{money(u.amount_cents)}</span></FlexiCellLabel>
              <FlexiCellHint>{dateLabel(u.ts)} · {u.why}</FlexiCellHint>
            </FlexiCell>
          ))}
        </ul>
      </Card>

      <SectionTitle>AutoTopUp activity</SectionTitle>
      <Card className="p-2.5">
        <div className="flex items-center gap-1.5">
          <IconTile icon={TransferIcon} tone="primary" />
          <div>
            <p className="num typography-body-10 font-bold text-text-heading">{d.autotopups_30d.count} top-ups · {money(d.autotopups_30d.total_cents)} in 30 days</p>
            <p className="typography-body-10 text-text-muted">All moved from your own savings. No credit used.</p>
          </div>
        </div>
        <ul className="mt-1.5 space-y-0.5 typography-body-10">
          {d.autotopups.slice(0, 5).map((t) => <li key={t.ref} className="flex justify-between text-text-body"><span className="num">{dateLabel(t.ts)} · {t.ref}</span><span className="num font-bold text-text-heading">{money(t.amount_cents)}</span></li>)}
        </ul>
      </Card>

      <SectionTitle>Savings and upcoming bills</SectionTitle>
      <Card className="p-2.5">
        <Alert look={f.status === 'HEALTHY' ? 'success' : f.status === 'CAUTION' ? 'warning' : 'danger'} heading={f.headline} className="mb-0 rounded-2xl">{f.detail}</Alert>
        <ul className="mt-1 divide-y divide-border-muted-soft">
          {d.upcoming.map((u) => (
            <FlexiCell key={u.id} tag="li" className="mb-0" before={<IconTile icon={u.kind === 'income' ? MoneyInIcon : CalendarIcon} tone={u.kind === 'income' ? 'success' : 'muted'} size="sm" />}
              after={<FlexiCellAdornment align="center"><span className={cx('num typography-body-10 font-bold', u.kind === 'income' ? 'text-text-success' : 'text-text-body')}>{u.kind === 'income' ? '+' : '−'}{money(u.amount_cents)}</span></FlexiCellAdornment>}>
              <FlexiCellLabel>{u.description}</FlexiCellLabel>
              <FlexiCellHint>{dateLabel(u.due)}</FlexiCellHint>
            </FlexiCell>
          ))}
        </ul>
        <p className="num mt-1 typography-body-10 text-text-muted">Projected 14-day position (everyday + savings + income − bills): <b className="text-text-heading">{money(f.projected_position_14d_cents)}</b></p>
      </Card>

      <SectionTitle>About the AI model</SectionTitle>
      <Card className="p-2.5 typography-body-10 text-text-body">
        <p className="flex items-center gap-1 font-bold text-text-heading"><BarChartIcon size="small" color="hero" aria-hidden /> {d.model.algorithm}</p>
        <p className="mt-0.5">Trained unsupervised on {d.model.training_rows.toLocaleString()} synthetic transactions from {d.model.synthetic_customers} fictional customers, using {d.model.features.length} behavioural features.</p>
        <p className="mt-0.5 text-text-muted">On a synthetic hold-out set, {Math.round(Number(ev.anomalies_flagged_low_trust) * 100)}% of injected anomalies scored low-trust and {Math.round(Number(ev.ordinary_flagged_low_trust) * 100)}% of ordinary purchases did. Illustrative only, not real-world fraud performance.</p>
      </Card>
    </div>
  )
}
