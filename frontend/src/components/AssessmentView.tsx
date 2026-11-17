import { Badge } from '@westpac/ui/badge'
import { BarChartIcon, InfoIcon, SecurityIcon, StarsIcon } from '@westpac/ui/icon'
import type { Assessment } from '../lib/api'
import { cx, money, WORKFLOW_SHORT } from '../lib/format'
import { Card, StatusIcon, TrustBadge, TrustGauge } from './ui'

function CardHeading({ icon: I, children, aside }: { icon: typeof StarsIcon; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1 typography-body-10 font-bold text-text-heading">
      <I size="small" color="hero" aria-hidden /> {children}
      {aside && <span className="ml-auto font-normal text-text-muted">{aside}</span>}
    </div>
  )
}

/** Signed horizontal bars: trust points each model feature added (right) or removed (left). */
export function ContributionBars({ a, limit = 6, barWidth = 96 }: { a: Assessment; limit?: number; barWidth?: number }) {
  const rows = [...(a.trust.contributions ?? [])].sort((x, y) => Math.abs(y.impact) - Math.abs(x.impact)).slice(0, limit)
  const max = Math.max(5, ...rows.map((r) => Math.abs(r.impact)))
  return (
    <ul className="space-y-1" aria-label="Model feature contributions, in trust points">
      {rows.map((r) => {
        const w = (Math.abs(r.impact) / max) * 50
        const neg = r.impact < 0
        return (
          <li key={r.feature} style={{ gridTemplateColumns: `1fr ${barWidth}px 42px` }} className="grid items-center gap-1 typography-body-10"
            title={`${r.label}: value ${r.value}, typical ${r.typical_value}. Impact ${r.impact > 0 ? '+' : ''}${r.impact} trust points.`}>
            <span className="truncate text-text-body">{r.label}</span>
            <span className="relative h-1.5 rounded-sm bg-surface-muted-pale" aria-hidden>
              <span className="absolute inset-y-0 left-1/2 w-px bg-border-muted-mild" />
              <span className={cx('absolute inset-y-0 rounded-sm', neg ? 'bg-surface-danger' : 'bg-surface-success')}
                style={neg ? { right: '50%', width: `${w}%` } : { left: '50%', width: `${w}%` }} />
            </span>
            <span className={cx('num text-right font-bold', neg ? 'text-text-danger' : r.impact > 0 ? 'text-text-success' : 'text-text-muted')}>
              {r.impact > 0 ? '+' : ''}{r.impact.toFixed(1)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function PolicyChecks({ a, compact = false }: { a: Assessment; compact?: boolean }) {
  return (
    <ul className="space-y-1">
      {(a.policy.checks ?? []).map((c) => (
        <li key={c.id} className="flex items-start gap-1 typography-body-10">
          <StatusIcon status={c.status} />
          <span>
            <span className={cx(compact ? 'font-normal' : 'font-bold', c.status === 'fail' ? 'font-bold text-text-danger' : 'text-text-body')}>{c.label}</span>
            {!compact && <span className="block text-text-muted">{c.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function AssessmentView({ a }: { a: Assessment }) {
  const score = a.trust.trust_score
  return (
    <div className="space-y-1.5">
      <Card className="p-2.5 text-center">
        <div className="flex justify-center"><TrustGauge score={score} /></div>
        <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1">
          <TrustBadge score={score} />
          <Badge color={a.policy.workflow === 'BLOCKED' ? 'danger' : 'hero'}>{WORKFLOW_SHORT[a.policy.workflow]}</Badge>
        </div>
        <p className="num mt-1 typography-body-10 text-text-muted">{a.merchant.name} · {money(a.amount_cents)} · shortfall {money(a.shortfall_cents)}</p>
      </Card>

      <Card className="p-2.5">
        <CardHeading icon={StarsIcon} aside="Generated locally from the AI model">AI explanation</CardHeading>
        <p className="typography-body-10 text-text-body">{a.explanation.text}</p>
      </Card>

      <Card className="divide-y divide-border-muted-soft px-2.5">
        {(a.groups ?? []).map((g) => (
          <div key={g.id} className="flex items-start gap-1.5 py-1.5">
            <span className="mt-[2px]"><StatusIcon status={g.status} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[0.75rem] font-bold uppercase tracking-wide text-text-muted">{g.title}</span>
                {g.model_impact !== null && Math.abs(g.model_impact) >= 0.5 && (
                  <span className={cx('num text-[0.75rem] font-bold', g.model_impact < -1 ? 'text-text-danger' : 'text-text-muted')}>{g.model_impact > 0 ? '+' : ''}{g.model_impact.toFixed(1)} pts</span>
                )}
              </div>
              <p className="typography-body-10 font-bold text-text-heading">{g.headline}</p>
              <p className="typography-body-10 text-text-muted">{g.detail}</p>
            </div>
          </div>
        ))}
      </Card>

      <Card className="p-2.5">
        <CardHeading icon={BarChartIcon}>What moved the model's score</CardHeading>
        <ContributionBars a={a} />
        <p className="mt-1 text-[0.75rem] text-text-muted">Trust points gained or lost versus a typical value for each feature (Isolation Forest perturbation test).</p>
      </Card>

      <Card className="p-2.5">
        <CardHeading icon={SecurityIcon}>Deterministic policy engine</CardHeading>
        <PolicyChecks a={a} />
        <div className="mt-2 rounded-2xl bg-surface-hero-faint p-2">
          <p className="typography-body-10 font-bold text-text-heading">Suggested authorisation: {a.policy.workflow_label}</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-3 typography-body-10 text-text-body">{(a.policy.workflow_reasons ?? []).map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
        <p className="mt-2 typography-body-10 font-bold text-text-heading">One-tap approval conditions</p>
        <ul className="mt-0.5 space-y-0.5">{(a.policy.quick_eligibility ?? []).map((e) => (
          <li key={e.label} className="flex items-center gap-1 typography-body-10 text-text-body"><StatusIcon status={e.met ? 'pass' : 'fail'} />{e.label}</li>))}</ul>
      </Card>

      <p className="flex gap-1 px-0.5 text-[0.75rem] text-text-muted"><InfoIcon size="xsmall" className="mt-[2px] shrink-0" aria-hidden />AutoTopUp never moves money on its own: every request waits for you to approve or decline.</p>
      <p className="flex gap-1 px-0.5 text-[0.75rem] text-text-muted"><InfoIcon size="xsmall" className="mt-[2px] shrink-0" aria-hidden />{a.disclaimer} Mandatory rules always run independently and a score can never override them.</p>
    </div>
  )
}
