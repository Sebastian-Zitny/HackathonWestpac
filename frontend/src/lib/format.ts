export const money = (cents: number, opts: { sign?: boolean } = {}) => {
  const abs = Math.abs(cents) / 100
  const s = abs.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 })
  if (cents < 0) return `−${s}`
  return opts.sign && cents > 0 ? `+${s}` : s
}

/** Dollars typed by a person to cents. Blank or non-numbers give NaN, so callers can say what was wrong. */
export const dollarsToCents = (v: string) => {
  const t = v.replace(/[$,\s]/g, '')
  return t === '' || !/^-?\d*\.?\d*$/.test(t) ? NaN : Math.round(parseFloat(t) * 100)
}
export const centsToDollars = (c: number) => (c / 100).toFixed(2).replace(/\.00$/, '')

export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })

export const dateLabel = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

export const CATEGORY_LABEL: Record<string, string> = {
  grocery: 'Groceries', fuel: 'Fuel', cafe: 'Cafés', dining: 'Dining', health: 'Pharmacy',
  online: 'Online', retail: 'Retail', electronics: 'Electronics',
}

export const WORKFLOW_SHORT: Record<string, string> = {
  QUICK_APPROVE: 'One-tap approval', STANDARD_AUTH: 'Standard verification',
  ENHANCED_AUTH: 'Enhanced verification', BLOCKED: 'Blocked',
}

export const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.max(0, secs) % 60).padStart(2, '0')}`

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
