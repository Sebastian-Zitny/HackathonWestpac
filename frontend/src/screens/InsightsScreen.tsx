import { useEffect, useState } from 'react'
import { Alert } from '@westpac/ui/alert'
import { Badge } from '@westpac/ui/badge'
import { FlexiCell, FlexiCellAdornment, FlexiCellHint, FlexiCellLabel } from '@westpac/ui/flexi-cell'
import { BarChartIcon, CalendarIcon, MoneyInIcon, TransferIcon, WarningIcon } from '@westpac/ui/icon'
import { useStore } from '../store'
import { api, type Insights } from '../lib/api'
import { CATEGORY_LABEL, cx, dateLabel, money } from '../lib/format'
import { Card, IconTile, PageTitle, SectionTitle, Spinner } from '../components/ui'

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

export function InsightsScreen() {
  const { app } = useStore()
  const [d, setD] = useState<Insights | null>(null)
  useEffect(() => { api.insights().then(setD).catch(() => null) }, [app?.now])
  if (!d) return <div className="grid h-[240px] place-items-center text-text-muted"><Spinner /></div>
  const catMax = Math.max(...d.spending_by_category.map((c) => c.total_cents), 1)
  const catTotal = d.spending_by_category.reduce((s, c) => s + c.total_cents, 0)
  const f = d.finance
  const ev = d.model.evaluation_on_synthetic_holdout
  return (
    <div className="anim-fade-up px-2 pb-4 pt-3">
      <PageTitle sub={<span className="num">Last 30 days · {money(catTotal)} card spending</span>}>Spending insights</PageTitle>

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
