import { AccountIcon, BarChartIcon, CalculatorIcon, CreditCardIcon, InfoIcon, LightBulbIcon, PadlockIcon, SecurityIcon, SettingsIcon, StarsIcon, TransferIcon } from '@westpac/ui/icon'
import { useStore } from '../store'
import { PageHeader, SectionLink, Tile } from '../components/ui'

export function MoreScreen() {
  const { setScreen, app } = useStore()
  return (
    <div className="anim-fade-up min-h-full bg-background-pale pb-4">
      <PageHeader title="More" />
      <div className="px-2">
        <SectionLink>AutoTopUp</SectionLink>
        <div className="grid grid-cols-2 gap-1.5">
          <Tile icon={TransferIcon} label="AutoTopUp settings" onClick={() => setScreen('settings')} />
          <Tile icon={StarsIcon} label="How the AI decides" onClick={() => setScreen('analysis')} />
          <Tile icon={SecurityIcon} label="Limits & security" onClick={() => setScreen('settings')} />
          <Tile icon={PadlockIcon} label={app?.security_hold ? 'Security hold: on' : 'Security hold: off'} onClick={() => setScreen('pay')} />
        </div>

        <button onClick={() => setScreen('insights')} className="mt-3 flex w-full items-center gap-2 rounded-3xl border border-border-muted-soft bg-surface-mono px-3 py-3 text-left hover:border-border-hero focus-visible:focus-outline">
          <CalculatorIcon size="small" color="hero" aria-hidden />
          <span className="typography-body-8 font-bold text-text-heading">Spending insights</span>
        </button>

        <SectionLink>Services</SectionLink>
        <div className="grid grid-cols-2 gap-1.5">
          <Tile icon={AccountIcon} label="Accounts & history" onClick={() => setScreen('accounts')} />
          <Tile icon={CreditCardIcon} label="Cards" onClick={() => setScreen('accounts')} />
          <Tile icon={BarChartIcon} label="Insights & tools" onClick={() => setScreen('insights')} />
          <Tile icon={LightBulbIcon} label="Familiar merchants" onClick={() => setScreen('settings')} />
        </div>

        <div className="relative mt-4 rounded-3xl border border-border-muted-soft bg-surface-mono px-3 py-3">
          <p className="flex items-center gap-1 typography-body-8 font-bold text-text-body"><InfoIcon size="small" color="hero" aria-hidden /> About this prototype</p>
          <p className="mt-1 typography-body-9 text-text-muted">AutoTopUp AI is a hackathon prototype for the Westpac Innovation and Coding Competition 2026. All customers, accounts and transactions are simulated. The AI runs locally on this device.</p>
          <button onClick={() => setScreen('settings')} className="mt-1.5 flex items-center gap-1 typography-body-9 text-text-primary hover:underline focus-visible:focus-outline"><SettingsIcon size="small" aria-hidden /> Open settings</button>
        </div>
      </div>
    </div>
  )
}
