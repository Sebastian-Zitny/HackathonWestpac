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

/** Semi-circular gauge using GEL reserved status tokens for the three illustrative bands. */
export function TrustGauge({ score, size = 180 }: { score: number; size?: number }) {
  const r = 70, cx0 = 90, cy0 = 88
  const pt = (v: number) => {
    const a = Math.PI * (1 - v / 100)
    return [cx0 + r * Math.cos(a), cy0 - r * Math.sin(a)]
  }
  const arc = (a: number, b: number) => { const [x1, y1] = pt(a); const [x2, y2] = pt(b); return `M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}` }
  const band = bandOf(score)
  const color = `var(--surface-${band})`
  const [nx, ny] = pt(score)
  return (
    <svg viewBox="0 0 180 104" width={size} height={(size * 104) / 180} role="img" aria-label={`Trust score ${score} out of 100, ${bandLabel(score)}`}>
      <path d={arc(0, 58.5)} stroke="var(--reserved-danger-100)" strokeWidth="12" fill="none" strokeLinecap="round" />
      <path d={arc(60.5, 83.5)} stroke="var(--reserved-warning-100)" strokeWidth="12" fill="none" />
      <path d={arc(85.5, 100)} stroke="var(--reserved-success-100)" strokeWidth="12" fill="none" strokeLinecap="round" />
      <path d={arc(0, Math.max(score, 0.5))} stroke={color} strokeWidth="12" fill="none" strokeLinecap="round" style={{ transition: 'all .8s ease' }} />
      <circle cx={nx} cy={ny} r="7" fill="var(--surface-mono)" stroke={color} strokeWidth="3" />
      <text x="90" y="78" textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--text-heading)" className="num">{score}</text>
      <text x="90" y="97" textAnchor="middle" fontSize="10" fill="var(--text-muted)">illustrative trust score</text>
    </svg>
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
