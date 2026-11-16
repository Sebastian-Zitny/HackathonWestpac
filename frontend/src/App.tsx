import { useState } from 'react'
import { Button } from '@westpac/ui/button'
import { Alert } from '@westpac/ui/alert'
import { Badge } from '@westpac/ui/badge'
import { CloseIcon, ErrorIcon, TuneIcon, TransferIcon } from '@westpac/ui/icon'
import { StoreProvider, useStore } from './store'
import { Phone } from './components/Phone'
import { PurchasePicker, Terminal } from './components/Terminal'
import { DemoPanel } from './components/DemoPanel'
import { Dashboard } from './screens/Dashboard'
import { SettingsScreen } from './screens/SettingsScreen'
import { AnalysisScreen, ApproveScreen, PayScreen, ResultScreen } from './screens/FlowScreens'
import { InsightsScreen } from './screens/InsightsScreen'
import { ErrorBoundary } from './components/ErrorBoundary'

function PhoneContent() {
  const { screen, setScreen } = useStore()
  return <ErrorBoundary key={screen} onReset={() => setScreen('home')}><ScreenSwitch screen={screen} /></ErrorBoundary>
}

function ScreenSwitch({ screen }: { screen: string }) {
  switch (screen) {
    case 'pay': return <PayScreen />
    case 'insights': return <InsightsScreen />
    case 'settings': return <SettingsScreen />
    case 'analysis': return <AnalysisScreen />
    case 'approve': return <ApproveScreen />
    case 'result': return <ResultScreen />
    default: return <Dashboard />
  }
}

/** Westpac-style site header (GEL WBC tokens): white bar, red brand rule, navy type. Product mark is our own. */
function SiteHeader() {
  return (
    <header className="border-t-[4px] border-b border-t-border-primary border-b-border-muted-soft bg-surface-mono">
      <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-2 py-1.5 sm:px-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-2xl bg-surface-primary text-text-mono"><TransferIcon size="small" aria-hidden /></span>
        <div className="min-w-0">
          <p className="typography-body-8 font-bold leading-tight text-text-heading">AutoTopUp <span className="text-text-primary">AI</span></p>
          <p className="truncate typography-body-10 text-text-muted">Never get caught short at checkout.</p>
        </div>
        <nav aria-label="Project" className="ml-auto hidden items-center gap-3 typography-body-10 text-text-heading md:flex">
          <span className="font-bold">Westpac Innovation and Coding Competition 2026</span>
        </nav>
        <Badge color="hero" soft className="ml-auto shrink-0 md:ml-2">Hackathon prototype · simulated data</Badge>
      </div>
    </header>
  )
}

function Shell() {
  const { app, backendDown, error, setError, refresh } = useStore()
  const [drawer, setDrawer] = useState(false)

  if (backendDown) {
    return (
      <div className="grid h-full place-items-center p-3">
        <div className="max-w-[360px] rounded-3xl border border-border-muted-soft bg-surface-mono p-4 text-center">
          <ErrorIcon size="xlarge" color="primary" aria-hidden />
          <h1 className="mt-1.5 typography-body-8 font-bold text-text-heading">Backend not reachable</h1>
          <p className="mt-0.5 typography-body-10 text-text-muted">Start the API with <code className="rounded-sm bg-surface-muted-pale px-0.5">uvicorn app.main:app --port 8000</code> in <code className="rounded-sm bg-surface-muted-pale px-0.5">backend/</code>, then retry.</p>
          <Button look="primary" size="large" className="mt-3" onClick={refresh}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 justify-center gap-4 sm:px-3 sm:py-3 md:items-start">
        <aside className="hidden w-[300px] shrink-0 md:block" aria-label="Purchase and payment terminal">
          <h2 className="mb-1 typography-body-10 font-bold text-text-heading">1 · Choose a purchase</h2>
          <PurchasePicker />
          <h2 className="mb-1.5 mt-3 typography-body-10 font-bold text-text-heading">2 · Payment terminal</h2>
          <Terminal />
        </aside>

        <section className="w-full shrink-0 sm:w-auto" aria-label="Customer phone">
          {app ? <Phone><PhoneContent /></Phone> : <div className="grid h-[820px] w-[400px] place-items-center text-text-muted">Loading…</div>}
        </section>

        <aside className="scrollbar-thin hidden w-[340px] shrink-0 lg:block lg:max-h-[calc(100vh-72px)] lg:overflow-y-auto" aria-label="Hackathon demo mode"><DemoPanel /></aside>
      </div>

      <button onClick={() => setDrawer(true)} className="fixed bottom-12 right-2 z-50 flex items-center gap-0.5 rounded-full bg-surface-hero px-2 py-1 typography-body-10 font-bold text-text-mono shadow-lg focus-visible:focus-outline lg:hidden">
        <TuneIcon size="small" aria-hidden /> Demo
      </button>
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[var(--wbc-hero-opacity)] lg:hidden" onClick={() => setDrawer(false)}>
          <div role="dialog" aria-modal="true" aria-label="Hackathon demo mode" className="scrollbar-thin h-full w-full max-w-[380px] overflow-y-auto bg-background-pale p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end"><Button look="faint" soft size="small" iconBefore={CloseIcon} onClick={() => setDrawer(false)}>Close</Button></div>
            <DemoPanel />
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-2 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2">
          <Alert look="danger" dismissible onClose={() => setError(null)} className="mb-0 rounded-2xl bg-surface-mono shadow-lg">{error}</Alert>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>
}
