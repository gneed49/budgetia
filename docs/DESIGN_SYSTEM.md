# Budgetia design system

The source-of-truth concepts are `docs/design/dashboard-concept.png` and
`docs/design/analytics-concept.png`.

## Direction

- Calm editorial-fintech interface with open white space, not a grid of cards.
- Near-white canvas (`#FBFCFB`) with deep navy ink (`#071421`).
- Emerald (`#169B68`) is the default interaction accent. The user may replace it
  with Blue, Violet or Coral; sage and category colors continue to identify data.
- Amounts use tabular numerals and carry the strongest hierarchy.
- Repeated controls use 16-18 px radii, one-pixel borders, and 44 px minimum
  touch targets.
- Icons are outline icons with a consistent two-pixel optical weight.

## Tokens

| Role | Value |
| --- | --- |
| Canvas | `#FBFCFB` |
| Surface | `#FFFFFF` |
| Ink | `#071421` |
| Muted ink | `#697386` |
| Border | `#DCE2E0` |
| Mint | `#169B68` |
| Mint soft | `#E4F4EC` |
| Sage | `#93B29A` |
| Coral | `#F46F61` |
| Amber | `#F2C15D` |

## Appearance

- Light mode retains the original near-white editorial canvas.
- Dark mode uses `#0B1117` for the canvas, `#111B24` for surfaces,
  `#F4F7F6` for primary text and `#2A3946` for borders.
- Primary choices are Emerald `#169B68`, Blue `#3478F6`, Violet `#7C5CE7`
  and Coral `#E85D4A`.
- Theme and primary choice are local appearance preferences and do not affect
  category colors or shared financial data.

Spacing uses a four-pixel base. Screen gutters are 20 px; major vertical gaps
are 24-32 px; controls are 44-52 px tall.

## Component inventory

- App shell with a four-item bottom navigation.
- Horizontal budget-space switcher for private and shared contexts.
- Period segmented control: Semaine, Mois, Année.
- Chart switcher: donut, bars, line.
- Reusable chart surface with time-series and category modes.
- Expense row, category filter chip, month selector, progress bar.
- Add-expense bottom sheet and category lifecycle sheet with usage, transfer target,
  protected fallback state, and explicit destructive actions.
- Connection and monthly-budget settings.
- Appearance controls and shared-budget invitation flow.
