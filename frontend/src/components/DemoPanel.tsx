import { TuneIcon } from '@westpac/ui/icon'
import { useStore, type Phase } from '../store'
import { cx, money } from '../lib/format'
import { ContributionBars, PolicyChecks } from './AssessmentView'
import { Card, TrustGauge } from './ui'

const STEPS: { label: string; phases: Phase[] }[] = [
  { label: 'Load a scenario', phases: [] },
  { label: 'Tap card', phases: ['idle'] },
  { label: 'AI + policy checks', phases: ['processing', 'assessing'] },
  { label: 'Authorise on phone', phases: ['awaiting', 'transferring'] },
  { label: 'Tap card again', phases: ['retap'] },
  { label: 'Result & balances', phases: ['approved', 'blocked', 'topup_declined', 'duplicate'] },
]

function PanelHeading({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return <div className="mb-1.5 flex items-center justify-between typography-body-10 font-bold text-text-heading">{children}{aside}</div>
}

export function DemoPanel() {
  const { app, offer, phase, log, purchase } = useStore()
  if (!app) return null
  const a = offer?.assessment
  const stepIdx = STEPS.findIndex((s) => s.phases.includes(phase))

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <TuneIcon size="small" color="primary" aria-hidden />
        <h2 className="typography-body-8 font-bold text-text-heading">Hackathon Demo Mode</h2>
      </div>
      <p className="typography-body-10 text-text-muted">Demo controls (reset, simulated time, security hold) are under <b className="text-text-body">Custom purchase &amp; demo controls</b> with the purchases.</p>

      <ol className="grid grid-cols-2 gap-1" aria-label="Demo progress">
        {STEPS.map((s, i) => {
          const current = i === stepIdx || (i === 0 && !purchase)
          return (
            <li key={s.label} aria-current={current ? 'step' : undefined}
              className={cx('flex items-center gap-1 rounded-2xl border px-1.5 py-1 text-[0.75rem]',
                current ? 'border-border-primary bg-surface-primary font-bold text-text-mono'
                  : i < stepIdx ? 'border-border-success-mild bg-surface-success-faint text-text-success' : 'border-border-muted-soft bg-surface-mono text-text-muted')}>
              <span className="num font-bold">{i + 1}</span>{s.label}
            </li>
          )
        })}
      </ol>

      <Card className="p-2">
        <PanelHeading>What the AI assessed</PanelHeading>
        {a ? (
          <>
            <TrustGauge score={a.trust.trust_score} compact />
            <div className="mt-1 typography-body-10 text-text-body">
              <p className="font-bold text-text-heading">{a.policy.workflow_label}</p>
              <p className="text-text-muted">Shortfall <b className="num text-text-body">{money(a.shortfall_cents)}</b> · anomaly score <span className="num">{a.trust.anomaly_score.toFixed(3)}</span></p>
            </div>
            <div className="mt-1.5"><ContributionBars a={a} limit={5} /></div>
          </>
        ) : <p className="typography-body-10 text-text-muted">Tap the card on a purchase that needs a top-up to see the live assessment.</p>}
      </Card>

      <Card className="p-2">
        <PanelHeading>What the policy engine checked</PanelHeading>
        {a ? <PolicyChecks a={a} compact /> : <p className="typography-body-10 text-text-muted">Mandatory rules run independently of the AI on every top-up.</p>}
      </Card>

      <Card className="p-2">
        <PanelHeading>Event log</PanelHeading>
        <ul tabIndex={0} aria-label="Event log" className="scrollbar-thin max-h-[200px] space-y-1 overflow-y-auto rounded-sm pr-0.5 focus-visible:focus-outline" aria-live="polite">
          {log.length === 0 && <li className="typography-body-10 text-text-muted">No events yet.</li>}
          {log.map((l) => (
            <li key={l.id} className="flex gap-1 text-[0.75rem] leading-snug">
              <span className="num shrink-0 text-text-muted">{l.time}</span>
              <span className={cx(l.tone === 'ok' && 'text-text-success', l.tone === 'err' && 'text-text-danger', l.tone === 'warn' && 'text-text-warning', l.tone === 'ai' && 'font-bold text-text-hero', l.tone === 'info' && 'text-text-body')}>{l.text}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
