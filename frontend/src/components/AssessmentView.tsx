import { Badge } from '@westpac/ui/badge'
import { BarChartIcon, InfoIcon, SecurityIcon, StarsIcon } from '@westpac/ui/icon'
import type { Assessment } from '../lib/api'
import { cx, money, WORKFLOW_SHORT } from '../lib/format'
import { Card, StatusIcon, TrustGauge } from './ui'

function CardHeading({ icon: I, children, aside }: { icon: typeof StarsIcon; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1 typography-body-10 font-bold text-text-heading">
      <I size="small" color="hero" aria-hidden /> {children}
      {aside && <span className="ml-auto font-normal text-text-muted">{aside}</span>}
    </div>
  )
}

/** Signed bars: how many trust points each signal removed (red, left) or added (green, right). Tiny effects are left out. */
export function ContributionBars({ a, limit = 6 }: { a: Assessment; limit?: number }) {
  const rows = [...(a.trust.contributions ?? [])].filter((r) => Math.abs(r.impact) >= 1)
    .sort((x, y) => Math.abs(y.impact) - Math.abs(x.impact)).slice(0, limit)
  if (!rows.length) return <p className="typography-body-10 text-text-muted">No single signal moved the score much: everything looked typical for you.</p>
  const max = Math.max(5, ...rows.map((r) => Math.abs(r.impact)))
  return (
    <ul className="space-y-1.5" aria-label="Signals that changed the trust score, in points">
      {rows.map((r) => {
        const w = (Math.abs(r.impact) / max) * 50
        const neg = r.impact < 0
        return (
          <li key={r.feature} className="typography-body-10"
            title={`${r.label}: value ${r.value}, typical ${r.typical_value}.`}>
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-text-body">{r.label}</span>
              <span className={cx('num shrink-0 font-bold', neg ? 'text-text-danger' : 'text-text-success')}>
                {Math.abs(r.impact).toFixed(0)} pts {neg ? 'lower' : 'higher'}
              </span>
            </div>
            <span className="relative mt-0.5 block h-1 rounded-sm bg-surface-muted-pale" aria-hidden>
              <span className="absolute inset-y-0 left-1/2 w-px bg-border-muted-mild" />
              <span className={cx('absolute inset-y-0 rounded-sm', neg ? 'bg-surface-danger' : 'bg-surface-success')}
                style={neg ? { right: '50%', width: `${w}%` } : { left: '50%', width: `${w}%` }} />
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
      <Card className="p-2.5">
        <p className="mb-1 typography-body-10 font-bold text-text-muted">AI trust score · how normal this purchase is for you</p>
        <TrustGauge score={score} />
        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border-muted-soft pt-1.5 typography-body-10 text-text-body">
          <span className="text-text-muted">This request:</span>
          <Badge color={a.policy.workflow === 'BLOCKED' ? 'danger' : 'hero'}>{WORKFLOW_SHORT[a.policy.workflow]}</Badge>
        </div>
        <p className="num mt-0.5 typography-body-10 text-text-muted">{a.merchant.name} · {money(a.amount_cents)} · shortfall {money(a.shortfall_cents)}</p>
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
              <span className="text-[0.75rem] font-bold uppercase tracking-wide text-text-muted">{g.title}</span>
              <p className="typography-body-10 font-bold text-text-heading">{g.headline}</p>
              <p className="typography-body-10 text-text-muted">{g.detail}</p>
            </div>
          </div>
        ))}
      </Card>

      <Card className="p-2.5">
        <CardHeading icon={BarChartIcon}>What lowered or raised the score</CardHeading>
        <ContributionBars a={a} />
        <p className="mt-1 text-[0.75rem] text-text-muted">Each signal compared with a typical purchase for you. The model re-scores the purchase with that signal set to normal and measures the change.</p>
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
