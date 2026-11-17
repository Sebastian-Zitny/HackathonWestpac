# Design system: Westpac GEL (WBC theme)

The UI is built on Westpac's open-source **GEL** design system. Sources:
- [WestpacGEL/GEL-next](https://github.com/WestpacGEL/GEL-next)
- the npm packages `@westpac/ui` and `@westpac/style-config`, both MIT-licensed

GEL tokens and components are used directly. The product itself stays original and clearly labelled:
- It has its own "AutoTopUp AI" mark. No Westpac logo or wordmark is used.
- A Westpac-style header (white bar, red brand rule, navy type) carries a "Hackathon prototype · simulated data" tag.

## App layout

The phone app mirrors the structure of the Westpac mobile banking app, built only from GEL tokens and components:

- **Bottom navigation:** three tabs (Home, Accounts, Payments), kept to what the demo needs. The active tab is `text-primary` red.
- **Home:** a hero gradient (hero navy → holler purple → primary red) with the greeting, then "Favourite accounts ›" (account cards with a card row showing whether AutoTopUp is on) and "Notifications ›".
- **Other tabs:** a large page title with search, help and profile icons, plus underline tabs where relevant (Accounts: Overview/Cards, with the per-card AutoTopUp `Switch`; Payments: Pay/Manage).
- **Patterns:** account cards with a card row, 2-column action tiles, and red-outline secondary buttons (`Button look="primary" soft`).
- **Not used:** no Westpac logo, photography or illustrations. The product mark and the decorative shapes are our own.

## Packages and installation (verified 16 Nov 2026)

| Package | Version | Notes |
|---|---|---|
| `@westpac/ui` | 1.21.0 | Peers: `react >=18.2`, `tailwindcss ~4.1.12`. Works with React 19.3. |
| `@westpac/style-config` | 1.0.2 | Tokens, Tailwind theme, brand themes |
| `tailwindcss`, `@tailwindcss/postcss` | 4.1.18 | Pinned to `~4.1.12` to satisfy GEL's peer range. The app was previously on 4.3. |

**Setup follows the official GEL-next README:**
- **PostCSS.** `postcss.config.mjs` re-exports `postcssConfig` from `@westpac/style-config/postcss`.
  - The Tailwind 4.1 *Vite* plugin doesn't support Vite 8, so we use the official PostCSS route instead.
  - No `--force` or `--legacy-peer-deps` was needed.
- **CSS.** `src/index.css` imports:
  - `tailwindcss`
  - `@westpac/style-config/tailwind`
  - **only** `@westpac/style-config/themes/wbc`
  - plus `@source "../node_modules/@westpac/ui/src"`
- **HTML.** `index.html` sets `<html data-brand="wbc" data-theme="light">`.
- **Check.** The compiled CSS contains the WBC theme selector and no STG/BOM/BSA themes. GEL's primary button renders `rgb(218, 23, 16)`, which is `#DA1710`.

## Tokens in use (WBC, light mode)

All colours come from GEL semantic tokens: utility classes such as `bg-surface-primary` and `text-text-heading`, or `var(--token)`. There are no hand-picked hex values in the app.

### Colour

| Role | Token | WBC value |
|---|---|---|
| Primary action, brand accent | `surface-primary` / `text-primary` | `#DA1710` |
| Headings, hero bands, secondary buttons | `text-heading` / `background-hero` / `surface-hero` | `#1F1C4F` |
| Body text | `text-body` | `#161619` |
| Secondary text | `text-muted` | `#706F7C` |
| Page background | `background-pale` | `#F5F5F6` |
| Cards | `surface-mono` + `border-muted-soft` | `#FFFFFF` / `#DEDEE1` |
| Selected / soft highlight | `surface-primary-faint` | `#FFF0F0` |
| Status: high / medium / low trust | `success` / `warning` / `danger` | `#008000` / `#C53B00` / `#C40000` |
| Focus ring | `focus-outline` utility (`border-focus`) | `#BC57EB` |
| Charts | `data-b-solid` (series), `data-a-solid` (current week) | navy / red |

### Other foundations

- **Typography.**
  - GEL's system font stack (`--font-family-sans`) with the `typography-body-*` scale: 7 = 24px titles, 9 = 16px labels, 10 = 14px body.
  - The **Westpac brand font is licensed and not distributed with GEL**. The GEL README asks apps to supply their own font files, so we don't bundle it, and `typography-brand-*` falls back to the system stack.
- **Spacing.** GEL's **6px grid** (`--spacing: 0.375rem`), so `p-2` = 12px, `p-3` = 18px and `p-4` = 24px. Every existing class was re-mapped to this grid.
- **Breakpoints.** GEL breakpoints: `sm` 768, `md` 992, `lg` 1200. The phone frame appears at `sm`, the terminal column at `md`, and the demo panel column at `lg`.
- **Radii.** GEL radius tokens: `rounded-2xl` = 8px for tiles and inputs, `rounded-3xl` = 12px for cards.
- **Icons.** All icons come from GEL's own icon set (`@westpac/ui/icon`). Lucide was removed. Examples: `HouseIcon`, `PaypassIcon`, `TransferIcon`, `PiggyBankIcon`, `FingerprintIcon`, `TickCircleIcon`.

## GEL components reused

| Where | Component |
|---|---|
| All primary/secondary/tertiary actions | `Button` (`primary`, `hero`, `faint` + `soft`, `link`) |
| Account balances, transactions, bills, unusual transactions, AutoTopUp status | `FlexiCell`, `FlexiCellLabel`, `FlexiCellHint`, `FlexiCellAdornment` |
| Daily AutoTopUp usage | `ProgressBar` (skinny) |
| Settings toggles, demo controls | `Switch` |
| Limits, amounts, time inputs | `Input`, `InputGroup` (with `$` add-on) |
| Account and merchant pickers | `Select` |
| Familiar merchants (learned by AI, read-only) | `FlexiCell` + `Badge` |
| Preferred authentication | `ButtonGroup` / `ButtonGroupButton` |
| Trust band, workflow, AutoTopUp tags | `Badge` |
| Security hold, info, prototype notes, financial-health outlook, errors | `Alert` |

**Built with GEL tokens because GEL has no equivalent:**
- **Payment terminal:** a simulated device.
- **Phone frame and push notification.**
- **Trust gauge.**
- **Masked PIN keypad.** GEL's `PassCode` displays the digits, which isn't right for a PIN, so the keypad is custom.
- **Simulated biometric prompt.**

## Accessibility

- **Automated check.** axe-core (WCAG 2.0/2.1 A + AA) was run on these screens:
  - dashboard
  - notification
  - AI analysis
  - approval
  - insights
  - settings

  Result: **0 violations.** (An earlier version used GEL's `CheckboxGroup`, whose decorative tick SVG has `role="img"` without a name; that component is no longer used, but the finding is worth reporting upstream.)
- **Contrast.** One issue was found and fixed: muted text on the pale-red selected card. Selected states now use `text-body`.
- **No colour-only meaning.** Every status uses an icon plus text, and trust bands use labelled badges.
- **Keyboard and focus.** All custom controls use GEL's `focus-outline`, and the event log is keyboard-scrollable.
- **ARIA.** The notification uses `role="alert"`, the terminal display is `aria-live`, and the PIN keypad has labelled buttons and a status announcement.
- **Touch targets.** PIN keys and tab-bar items are 48px tall.
- **Motion.** `prefers-reduced-motion` is respected.
