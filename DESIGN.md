# Design Brief

## Direction

Bún Bò Huế 65 Ship — Vietnamese restaurant-chain shipping & payment tool (UI tiếng Việt) with enterprise role-based device management, now extended to a multi-partner (tenant) platform: each partner owns its own brand, logo, restaurant chain and menu under a `toidatmon.com` subdomain.

## Tone

Modern operational console, not rustic food app — warm vermillion brand accent on a warm neutral base, plus a dedicated cooler-neutral enterprise surface for admin/accounting/promo screens; clean, data-dense, legible. Partner branding is applied as a thin, additive layer so the core design language never changes.

## Differentiation

A shipping app that feels like a confident operations console wearing a Vietnamese food brand — vivid vermillion primary, functional status colors, large driver touch targets, dense legible enterprise tables.

## Color Palette
| Token        | OKLCH (light)  | OKLCH (dark)  | Role                              |
| ------------ | -------------- | ------------- | --------------------------------- |
| background   | 0.97 0.012 75  | 0.16 0.015 50 | Warm cream / warm charcoal        |
| foreground   | 0.2 0.02 50    | 0.93 0.012 60 | Deep warm ink / soft warm white   |
| card         | 0.99 0.008 75  | 0.2 0.018 50  | Elevated surface                  |
| primary      | 0.55 0.22 28   | 0.68 0.2 32   | Vivid vermillion — brand CTA      |
| accent       | 0.55 0.22 28   | 0.68 0.2 32   | Same as primary (single accent)   |
| secondary    | 0.94 0.018 75  | 0.24 0.02 50  | Subtle surfaces, secondary btns   |
| muted        | 0.94 0.015 75  | 0.24 0.02 50  | Backgrounds, disabled             |
| success      | 0.55 0.16 150  | 0.65 0.16 150 | Paid status (green)               |
| info         | 0.5 0.16 245   | 0.6 0.16 245  | Shipping status (blue)            |
| warning      | 0.72 0.16 70   | 0.78 0.16 70  | Pending status (amber)            |
| destructive  | 0.5 0.22 25    | 0.6 0.22 25   | Cancelled status (red)            |
### Enterprise surface (`.bbh-enterprise-theme`)

| Token        | OKLCH (light)  | Role                              |
| ------------ | -------------- | --------------------------------- |
| background   | 0.972 0.006 240 | Cool neutral base for admin      |
| card         | 0.995 0.004 240 | Crisp elevated surface           |
| primary      | 0.53 0.21 28   | Vermillion brand CTA             |
| success      | 0.52 0.15 150  | Paid / confirmed status          |
| warning      | 0.72 0.15 75   | Pending / awaiting payment       |
| info         | 0.5 0.15 250   | Lookup / in-progress status      |
## Typography

- Display: Space Grotesk — headings, KPI numbers, brand wordmark
- Body: Plus Jakarta Sans — UI labels, forms, tables (full Vietnamese diacritics)
- Mono: JetBrains Mono — order IDs, activation codes, amount columns
- Scale: hero `text-4xl md:text-5xl font-bold tracking-tight`, h2 `text-2xl md:text-3xl font-semibold`, label `text-xs font-semibold tracking-wider uppercase`, body `text-base`, mono IDs `font-mono text-sm`
## Elevation & Depth

Layered surfaces via `bg-card` on `bg-background`, subtle borders over heavy shadows; `shadow-panel` for enterprise cards, `shadow-elevated` only for popovers/modals/QR card. No glow shadows.
## Structural Zones

| Zone       | Background      | Border           | Notes                                  |
| ---------- | --------------- | ---------------- | -------------------------------------- |
| Header     | `bg-card`       | `border-b`       | Sticky, brand wordmark + nav           |
| Content    | `bg-background` | —                | Alternating `bg-muted/30` per section  |
| Sidebar    | `bg-sidebar`    | `border-r`       | Enterprise role nav (Thanh toán, Kế toán, Báo cáo) |
| Footer     | `bg-muted/40`   | `border-t`       | Compact, optional on mobile            |
| QR screen  | `bg-background` | —                | Full-bleed, centered QR, no chrome     |
| Partner header lockup | `var(--brand-surface)` | `border-b` | `.brand-header`; logo slot + partner display name + `.brand-partner-chip` |
| Partner notice | `bg-background` | — | `.partner-notice` centered card for unknown/hidden partner — never blank |

### Tenant branding layer (multi-partner)

| Token | Default | Role |
| ----- | ------- | ---- |
| `--brand-primary` | `var(--primary)` | Partner brand color; overridden at runtime |
| `--brand-primary-foreground` | `var(--primary-foreground)` | Text/icon on partner brand color |
| `--brand-accent` | `var(--accent)` | Partner accent rule / highlights |
| `--brand-surface` | `var(--card)` | Partner-branded header surface |
| `--brand-surface-foreground` | `var(--card-foreground)` | Text on partner surface |
| `--brand-on-surface-muted` | `var(--muted-foreground)` | Partner subname / secondary text |
| `--brand-ring` | `var(--ring)` | Focus ring inside partner scope |
| `--brand-logo-size` / `--brand-lockup-gap` | `2.5rem` / `0.75rem` | Header lockup geometry |

- Defaults alias the existing brand tokens → with no partner brand set, the current look is unchanged.
- A partner's brand is applied by setting `--brand-*` on a `.brand-scope` wrapper (inline style or scoped class); descendants use `--brand-*` only.
- Never a blank screen: unknown or hidden slug renders `.partner-notice` with the requested slug in `.partner-notice-slug` and a link home.
- Header lockup: `.brand-lockup` + `.brand-logo-slot` (image, or `.brand-logo-fallback` monogram from the partner name) + `.brand-name` / `.brand-subname` + `.brand-accent-rule`.
## Spacing & Rhythm

Mobile-first: 16px base padding, 24px section gaps; enterprise tables compact 12px row padding; QR screen 32px breathing room; touch targets min 44px on driver flows.
## Component Patterns

- Buttons: primary `bg-primary text-primary-foreground rounded-md`, hover darkens 8%; secondary `bg-secondary`; status confirmations use status colors directly
- Cards: `bg-card rounded-lg border border-border shadow-panel`, 16-20px padding
- Badges: pill `rounded-full border px-2.5 py-0.5 text-xs font-semibold` with `badge-success/warning/info/destructive` utilities
- Tables: `bg-card` header `bg-muted/50`, mono font for ID + amount columns, status badge per row
- Forms: labels `text-sm font-medium`, inputs `bg-input rounded-md`, focus ring `ring-primary`
- QR: centered `bg-card rounded-2xl p-6 shadow-elevated`, code fills 70% viewport on mobile
## Enterprise Screens (`.bbh-enterprise-theme`)

- KPI cards (`.ent-kpi`): `bg-card border shadow-panel`, `font-display` value + small label, `animate-kpi-in`
- Tables (`.ent-table-row/.ent-th/.ent-td`): compact rows, `hover:bg-muted/40`, mono order IDs, per-row status pill
- Toolbar (`.ent-toolbar`): filter/search/action bar on `bg-card` with `shadow-panel`
- Payment queue: success pill for paid, warning pill for awaiting, primary confirm action
- Accounting lookup: shows order + payment verification image (`.badge-info` in-progress)
- Promo/sales reporting: `--chart-*` colors, KPI row + dense table
## Motion

- Entrance: fade + rise, `kpi-in` 300ms for KPI cards, `row-in` 250ms staggered for table rows
- Hover: `transition-smooth` (250ms), primary buttons darken, cards lift `shadow-panel → shadow-panel-hover`
- QR scan success: brief `animate-pulse-soft` on confirmation badge
- Polling status: subtle `animate-pulse` on pending badges only
## Constraints
- All UI labels in Vietnamese (Thanh toán, Kế toán, Báo cáo bán hàng & KM, Hàng đợi, Hoá đơn, Tra cứu đơn)
- Enterprise roles: Hàng đợi thanh toán, Kế toán, Báo cáo bán hàng & KM only — no extra roles
- Menu/restaurant edit stays admin-only; enterprise roles scoped to their attached restaurant
- Status colors are functional only (green=paid, blue=shipping, amber=pending, red=cancelled) — never decorative
- No purple gradients, no full-page gradient backgrounds, no glow shadows
- Token-only styling — never raw hex/rgb in components
- Partner branding overrides `--brand-*` only — never rewrite core tokens or the enterprise theme
- Partner header must always show the partner's logo slot + display name; unknown/hidden slug must render `.partner-notice`, never a blank screen
- Vietnamese language UI; partner slug shown as `<slug>.toidatmon.com`
- No partner self-registration UI and no cross-partner aggregate dashboards
## Signature Detail
The vermillion primary (`0.55 0.22 28`) tuned from Vietnamese flag red into an operational CTA, paired with a warm cream base for ordering and a cooler-neutral `.bbh-enterprise-theme` for admin/accounting surfaces — enterprise screens feel professional and legible while the brand stays unmistakably Bún Bò Huế 65. The multi-partner layer keeps that identity as the default and lets each partner's brand recolor only the header lockup and accent through `--brand-*`, so a partner storefront feels native to the platform rather than a separate app.
