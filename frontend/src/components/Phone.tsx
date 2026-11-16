import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@westpac/ui/button'
import { AccountIcon, CloseIcon, DollarIcon, HouseIcon, LightBulbIcon, TilesIcon, TransferIcon } from '@westpac/ui/icon'
import { useStore, type Screen } from '../store'
import { clock, cx, timeLabel } from '../lib/format'

function StatusGlyphs() {
  // decorative phone status-bar glyphs (not icons with meaning)
  return (
    <span className="flex items-center gap-1" aria-hidden>
      <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="4.5" y="5" width="3" height="6" rx="1" /><rect x="9" y="2.5" width="3" height="8.5" rx="1" /><rect x="13.5" y="0" width="3" height="11" rx="1" /></svg>
      <svg width="24" height="11" viewBox="0 0 24 11" fill="none"><rect x=".5" y=".5" width="20" height="10" rx="3" stroke="currentColor" opacity=".45" /><rect x="2" y="2" width="16" height="7" rx="1.6" fill="currentColor" /><rect x="21.5" y="3.5" width="1.6" height="4" rx=".8" fill="currentColor" opacity=".45" /></svg>
    </span>
  )
}

function Banner() {
  const { banner, dismissBanner, openApproval, declineTopUp, setScreen, offer, phase, secondsLeft } = useStore()
  useEffect(() => {
    if (!banner || banner.kind === 'topup_request') return
    const t = setTimeout(dismissBanner, 7000)
    return () => clearTimeout(t)
  }, [banner, dismissBanner])
  if (!banner) return null
  const req = banner.kind === 'topup_request' && phase === 'awaiting'
  const tone = banner.kind === 'declined' ? 'bg-surface-danger' : banner.kind === 'topup_request' ? 'bg-surface-primary'
    : banner.kind === 'info' ? 'bg-surface-hero' : 'bg-surface-success'
  return (
    <div key={banner.id} className="anim-slide-down absolute inset-x-1.5 top-6 z-40" role="alert" aria-live="assertive">
      <div className="overflow-hidden rounded-4xl border border-border-muted-soft bg-surface-mono shadow-[0_12px_32px_-8px_rgba(31,28,79,.35)]">
        <div className="flex items-start gap-2 p-2">
          <span className={cx('grid size-5 shrink-0 place-items-center rounded-2xl text-text-mono', tone)}><TransferIcon size="small" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between typography-body-10 text-text-muted"><span className="font-bold text-text-hero">AutoTopUp AI</span><span>now</span></div>
            <div className="typography-body-9 font-bold text-text-body">{banner.title}</div>
            <div className="typography-body-10 text-text-body">{banner.body}</div>
            {req && secondsLeft !== null && (
              <div className="mt-1" role="timer" aria-live="off">
                <div className="flex justify-between text-[0.75rem] text-text-muted"><span>Time to approve or decline</span><b className="num text-text-heading">{clock(secondsLeft)}</b></div>
                <div className="mt-0.5 h-[4px] rounded-full bg-surface-muted-pale"><div className="h-[4px] rounded-full bg-surface-hero transition-[width] duration-1000 ease-linear" style={{ width: `${(secondsLeft / (offer?.approval_window_seconds || 300)) * 100}%` }} /></div>
              </div>
            )}
          </div>
          {!req && (
            <button onClick={dismissBanner} aria-label="Dismiss notification" className="rounded-full p-0.5 text-text-muted hover:bg-surface-hover-mono focus-visible:focus-outline">
              <CloseIcon size="small" aria-hidden />
            </button>
          )}
        </div>
        {req && offer && (
          <div className="grid grid-cols-3 gap-1 border-t border-border-muted-soft p-1.5">
            <Button size="medium" look="link" onClick={() => { dismissBanner(); setScreen('analysis') }}>Why?</Button>
            <Button size="medium" look="faint" soft onClick={declineTopUp}>Decline</Button>
            <Button size="medium" look="primary" onClick={openApproval}>Approve</Button>
          </div>
        )}
        {banner.kind === 'transfer' && (
          <div className="border-t border-border-muted-soft px-1 py-0.5">
            <Button size="small" look="link" block onClick={() => { dismissBanner(); setScreen('analysis') }}>View details</Button>
          </div>
        )}
      </div>
    </div>
  )
}

const NAV: { id: Screen; label: string; icon: typeof HouseIcon }[] = [
  { id: 'home', label: 'Home', icon: HouseIcon },
  { id: 'accounts', label: 'Accounts', icon: AccountIcon },
  { id: 'pay', label: 'Payments', icon: DollarIcon },
  { id: 'insights', label: 'Insights', icon: LightBulbIcon },
  { id: 'more', label: 'More', icon: TilesIcon },
]

export function Phone({ children }: { children: ReactNode }) {
  const { app, screen, setScreen } = useStore()
  const active = NAV.some((n) => n.id === screen) ? screen : ['analysis', 'approve', 'result'].includes(screen) ? 'pay' : screen === 'settings' ? 'more' : 'home'
  const mainRef = useRef<HTMLElement>(null)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => { mainRef.current?.scrollTo(0, 0); setScrolled(false) }, [screen])
  const overHero = screen === 'home' && !scrolled
  return (
    <div className="relative mx-auto h-[calc(100dvh-54px)] w-full bg-background-pale sm:h-[820px] sm:w-[400px] sm:rounded-[46px] sm:border-[10px] sm:border-surface-muted-vivid sm:shadow-[0_30px_60px_-15px_rgba(31,28,79,.4)]">
      <div className="relative flex h-full flex-col overflow-hidden sm:rounded-[36px]">
        <div className={cx('z-30 flex h-6 shrink-0 items-center justify-between px-4 typography-body-10 font-bold',
          screen === 'home' ? 'absolute inset-x-0 top-0' : 'relative',
          overHero ? 'bg-[var(--wbc-hero-700)] text-text-mono' : 'bg-surface-mono text-text-body shadow-[0_1px_0_var(--border-muted-soft)]')}>
          <span className="num">{app ? timeLabel(app.now) : '--:--'}</span>
          <span className="absolute left-1/2 top-1 hidden h-4 w-[96px] -translate-x-1/2 rounded-full bg-[var(--wbc-muted-950)] sm:block" aria-hidden />
          <StatusGlyphs />
        </div>
        <Banner />
        <main ref={mainRef} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 120)} className="scrollbar-thin relative flex-1 overflow-y-auto" aria-label="AutoTopUp AI mobile banking (simulated)">{children}</main>
        <nav aria-label="Main" className="z-20 grid shrink-0 grid-cols-5 border-t border-border-muted-soft bg-surface-mono pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgba(0,0,0,.04)]">
          {NAV.map((n) => {
            const on = active === n.id
            return (
              <button key={n.id} onClick={() => setScreen(n.id)} aria-current={on ? 'page' : undefined}
                className={cx('relative flex min-h-9 flex-col items-center justify-center gap-0.5 text-[0.8125rem] focus-visible:focus-outline focus-visible:-outline-offset-4',
                  on ? 'font-bold text-text-primary' : 'text-text-body hover:text-text-hero')}>
                <n.icon size="medium" look={on ? 'filled' : 'outlined'} aria-hidden />
                {n.label}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
