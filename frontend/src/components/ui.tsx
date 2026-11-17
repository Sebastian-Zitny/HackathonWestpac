/**
 * Shared building blocks for AutoTopUp AI, built on Westpac GEL (WBC theme).
 * Components come from @westpac/ui; colours are GEL semantic tokens only.
 * Spacing uses GEL's 6px grid (p-1 = 6px, p-2 = 12px, p-3 = 18px, p-4 = 24px).
 */
import type { JSX, ReactNode } from 'react'
import { Badge } from '@westpac/ui/badge'
import {
  CafeIcon, CarIcon, CartIcon, ErrorIcon, GlobalIcon, MedicalIcon, PendingIcon, PhoneIcon,
  RemoveCircleIcon, RestaurantIcon, ShopIcon, ShoppingBagIcon, ShoppingBasketIcon, TakeoutFoodIcon,
  TickCircleIcon, WarningIcon, HeadsetIcon, PersonIcon, SearchIcon, ArrowRightIcon,
} from '@westpac/ui/icon'
import type { IconProps } from '@westpac/ui/icon'
import { cx } from '../lib/format'

export type GelIcon = (props: IconProps) => JSX.Element

export function Card({ children, className, tag: Tag = 'div' }: { children: ReactNode; className?: string; tag?: 'div' | 'section' }) {
  return <Tag className={cx('rounded-3xl border border-border-muted-soft bg-surface-mono', className)}>{children}</Tag>
}

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-1.5 mt-4 flex items-end justify-between px-0.5">
      <h2 id={id} className="typography-body-10 font-bold text-text-heading">{children}</h2>
      {action}
    </div>
  )
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3">
      <h1 className="typography-body-7 font-bold text-text-heading">{children}</h1>
      {sub && <p className="mt-0.5 typography-body-10 text-text-muted">{sub}</p>}
    </div>
  )
}

/* -------- merchant icons (GEL icon set) -------- */
const MERCHANT_ICONS: Record<string, GelIcon> = {
  'shopping-cart': CartIcon, 'shopping-basket': ShoppingBasketIcon, fuel: CarIcon, coffee: CafeIcon,
  utensils: RestaurantIcon, pill: MedicalIcon, globe: GlobalIcon, store: ShopIcon, smartphone: PhoneIcon,
  sandwich: TakeoutFoodIcon, shirt: ShoppingBagIcon,
}
export function MerchantIcon({ icon, ...props }: { icon?: string | null } & IconProps) {
  const I = (icon && MERCHANT_ICONS[icon]) || ShopIcon
  return <I aria-hidden {...props} />
}

/** Rounded icon tile used before list rows. */
export function IconTile({ icon: I, tone = 'muted', size = 'md' }: { icon: GelIcon; tone?: 'muted' | 'primary' | 'hero' | 'success' | 'reversed'; size?: 'sm' | 'md' }) {
  const tones = {
    muted: 'bg-surface-muted-pale text-text-hero',
    primary: 'bg-surface-primary-faint text-text-primary',
    hero: 'bg-surface-hero text-text-mono',
    success: 'bg-surface-success-faint text-text-success',
    reversed: 'bg-surface-primary text-text-mono',
  }
  return (
    <span className={cx('grid shrink-0 place-items-center rounded-full', size === 'sm' ? 'size-5' : 'size-6', tones[tone])}>
      <I size="small" aria-hidden />
    </span>
  )
}

/* -------- status (always icon + text, never colour alone) -------- */
export type Status = 'pass' | 'fail' | 'pending' | 'good' | 'neutral' | 'concern'
export function StatusIcon({ status }: { status: Status }) {
  const common = { size: 'small' as const }
  if (status === 'pass' || status === 'good') return <TickCircleIcon {...common} color="success" aria-label="Passed" />
  if (status === 'fail') return <ErrorIcon {...common} color="danger" aria-label="Failed" />
  if (status === 'concern') return <WarningIcon {...common} color="danger" aria-label="Concern" />
  if (status === 'neutral') return <RemoveCircleIcon {...common} color="warning" aria-label="Caution" />
  return <PendingIcon {...common} color="muted" aria-label="Pending" />
}

/* -------- trust bands -------- */
export type Band = 'success' | 'warning' | 'danger'
export const bandOf = (score: number): Band => (score >= 85 ? 'success' : score >= 60 ? 'warning' : 'danger')
export const bandLabel = (score: number) => (score >= 85 ? 'High trust' : score >= 60 ? 'Medium trust' : 'Low trust')
export function TrustBadge({ score, soft = true }: { score: number; soft?: boolean }) {
  return <Badge color={bandOf(score)} soft={soft}>{bandLabel(score)}</Badge>
}

const ZONES: { band: Band; from: number; to: number; name: string; action: string }[] = [
  { band: 'danger', from: 0, to: 59, name: 'Low', action: 'PIN + confirm' },
  { band: 'warning', from: 60, to: 84, name: 'Medium', action: 'Biometrics or PIN' },
  { band: 'success', from: 85, to: 100, name: 'High', action: 'One tap' },
]
const FILL: Record<Band, { on: string; off: string }> = {
  danger: { on: 'bg-surface-danger', off: 'bg-surface-danger-faint' },
  warning: { on: 'bg-surface-warning', off: 'bg-surface-warning-faint' },
  success: { on: 'bg-surface-success', off: 'bg-surface-success-faint' },
}
const MEANING: Record<Band, string> = {
  danger: 'Unusual for you, so it needs your PIN and a confirmation',
  warning: 'A little different from usual, so it needs biometrics or your PIN',
  success: 'Routine for you, so it needs the lightest check',
}

/**
 * The AI trust score on a labelled 0–100 scale: the three zones with their ranges, what each one asks
 * the customer to do, and a marker at this purchase's score. Higher = more like the customer's normal spending.
 */
export function TrustGauge({ score, compact = false }: { score: number; compact?: boolean }) {
  const band = bandOf(score)
  const pos = Math.min(100, Math.max(0, score))
  return (
    <figure className="w-full text-left" aria-label={`AI trust score ${score} out of 100: ${bandLabel(score)}. ${MEANING[band]}.`}>
      <div className="flex items-baseline gap-1">
        <span className={cx('num font-bold text-text-heading', compact ? 'typography-body-7' : 'typography-body-5')}>{score}</span>
        <span className="num typography-body-10 text-text-muted">/ 100</span>
        <span className="ml-1"><TrustBadge score={score} /></span>
      </div>
      {!compact && <p className="mt-0.5 typography-body-10 text-text-body">{MEANING[band]}.</p>}

      <div className="relative mt-3" aria-hidden>
        {/* marker above the bar */}
        <div className="absolute -top-[14px] flex -translate-x-1/2 flex-col items-center" style={{ left: `${pos}%` }}>
          <span className="h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-[var(--text-heading)]" />
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full">
          {ZONES.map((z) => (
            <span key={z.band} style={{ width: `${z.to - z.from + (z.from ? 0 : 1)}%` }}
              className={cx('h-full', z.band === band ? FILL[z.band].on : FILL[z.band].off,
                z.band !== 'danger' && 'border-l-2 border-surface-mono')} />
          ))}
        </div>
      </div>
      <div className="mt-0.5 flex justify-between text-[0.75rem] text-text-muted" aria-hidden>
        <span className="num">0</span><span>more unusual · more normal for you</span><span className="num">100</span>
      </div>
      {!compact && (
        <ul className="mt-1.5 space-y-0.5 typography-body-10" aria-hidden>
          {[...ZONES].reverse().map((z) => (
            <li key={z.band} className={cx('flex items-center gap-1 rounded-xl px-1 py-0.5', z.band === band ? 'bg-surface-muted-faint font-bold text-text-heading' : 'text-text-muted')}>
              <span className={cx('size-1 shrink-0 rounded-full', FILL[z.band].on)} />
              <span className="w-[124px] shrink-0 whitespace-nowrap">{z.name} <span className="num">{z.from}–{z.to}</span></span>
              <span className="flex-1">{z.action}</span>
              {z.band === band && <span className="shrink-0 text-[0.75rem] font-normal text-text-muted">this purchase</span>}
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return <span role="status" aria-label={label} className={cx('inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />
}


/* ---------------- Westpac-app-style building blocks ---------------- */

/** Large page title with the search / help / profile icons on the right, and optional underline tabs. */
export function PageHeader<T extends string>({ title, tabs, active, onTab, onBack }: {
  title: string; tabs?: { id: T; label: string; icon?: GelIcon }[]; active?: T; onTab?: (t: T) => void; onBack?: () => void
}) {
  return (
    <div className="bg-surface-mono">
      <div className="flex items-center justify-end gap-3 px-3 pt-2 text-text-body">
        {onBack && <button onClick={onBack} className="mr-auto rounded-full p-0.5 text-text-primary focus-visible:focus-outline" aria-label="Back"><ArrowRightIcon size="small" className="rotate-180" aria-hidden /></button>}
        <SearchIcon size="small" aria-hidden />
        <HeadsetIcon size="small" aria-hidden />
        <PersonIcon size="small" aria-hidden />
      </div>
      <h1 className="px-3 pb-1.5 pt-1 typography-body-6 font-bold text-text-body">{title}</h1>
      {tabs && (
        <div role="tablist" className="flex gap-3 border-b border-border-muted-soft px-3">
          {tabs.map((t) => {
            const on = t.id === active
            return (
              <button key={t.id} role="tab" aria-selected={on} onClick={() => onTab?.(t.id)}
                className={cx('flex items-center gap-1 border-b-[3px] pb-1.5 pt-0.5 typography-body-9 focus-visible:focus-outline',
                  on ? 'border-border-hero font-bold text-text-heading' : 'border-transparent text-text-muted')}>
                {t.icon && <t.icon size="small" className={on ? 'text-text-primary' : ''} aria-hidden />}{t.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Navy section heading with a chevron, as used for "Notifications ›" and "Favourite accounts ›". */
export function SectionLink({ children, onClick, id }: { children: ReactNode; onClick?: () => void; id?: string }) {
  return (
    <h2 id={id} className="mb-1.5 mt-4">
      <button onClick={onClick} disabled={!onClick} className="flex items-center gap-1 typography-body-7 font-bold text-text-heading focus-visible:focus-outline disabled:cursor-default">
        {children}{onClick && <ArrowRightIcon size="small" aria-hidden />}
      </button>
    </h2>
  )
}

/** Small red payment-card thumbnail (generic card graphic, no logos). */
export function CardThumb({ digits }: { digits?: string }) {
  return (
    <span className="relative inline-flex h-[28px] w-[44px] shrink-0 items-end justify-end overflow-hidden rounded-md bg-gradient-to-br from-surface-primary to-[var(--wbc-primary-700)] p-[3px] shadow-sm" aria-hidden>
      <span className="absolute left-[5px] top-[6px] h-[6px] w-[9px] rounded-[2px] bg-[var(--wbc-dance-200)]" />
      {digits && <span className="num text-[7px] font-bold leading-none text-text-mono">{digits}</span>}
    </span>
  )
}

/** Square-ish action tile used in the Payments and More grids. */
export function Tile({ icon: I, label, onClick }: { icon: GelIcon; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex min-h-[112px] flex-col items-start justify-between rounded-3xl border border-border-muted-soft bg-surface-mono p-2 text-left transition-colors hover:border-border-hero focus-visible:focus-outline">
      <I size="small" color="hero" aria-hidden />
      <span className="typography-body-9 text-text-body">{label}</span>
    </button>
  )
}

/** Featured-card corner marker (blue triangle with a star), as on promotional cards. */
export function FeaturedCorner() {
  return (
    <span className="absolute left-0 top-0 h-[34px] w-[34px] overflow-hidden rounded-tl-3xl" aria-hidden>
      <span className="absolute -left-[17px] -top-[17px] h-[34px] w-[34px] rotate-45 bg-surface-info" />
      <svg viewBox="0 0 10 10" className="absolute left-[4px] top-[4px] size-[10px] fill-white"><path d="M5 0l1.2 3.3H10L7 5.5 8.1 9 5 6.9 1.9 9 3 5.5 0 3.3h3.8z" /></svg>
    </span>
  )
}
