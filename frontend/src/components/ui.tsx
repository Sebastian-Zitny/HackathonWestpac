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
  TickCircleIcon, WarningIcon,
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

