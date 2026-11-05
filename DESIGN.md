# Design Brief

## Direction
Tôi Đặt Món — multi-partner Vietnamese food ordering platform (UI tiếng Việt); brand pages at `toidatmon.vn/<slug>`, plus platform home, partner console `/quan-ly`, staff `/san`, admin `/admin/*`.

## Tone
Confident operations console wearing a fresh street-food brand: brick red authority, lime freshness, white paper surfaces, zero rustic clichés.

## Differentiation
One brand system everywhere — brick red drives every action, lime marks every "active/selected" state (chips, nav indicator, counts).

## Color Palette
| Token | OKLCH light | OKLCH dark | Role |
| --- | --- | --- | --- |
| background | 0.975 0.008 100 | 0.17 0.012 60 | Warm paper / warm charcoal |
| foreground | 0.235 0.028 60 | 0.94 0.01 95 | Deep brown ink |
| card / popover | 1 0 0 | 0.21 0.014 60 | Surfaces |
| primary | 0.472 0.139 30.7 (#9A3426) | 0.64 0.15 33 | Đỏ gạch — CTAs, active text, focus ring |
| accent | 0.814 0.153 117.9 (#BACF50) | 0.82 0.15 118 | Lime — fills only; text on it = accent-foreground olive 0.27 |
| secondary | 0.952 0.035 114 | 0.27 0.035 118 | Lime-soft surface, olive text |
| muted | 0.955 0.008 95 | 0.25 0.012 60 | Quiet fills, table headers, skeleton |
| success / warning / info / destructive | 0.52 0.13 152 / 0.77 0.15 72 / 0.5 0.12 240 / 0.55 0.2 22 | brighter | Status only |
| border / input | 0.905 / 0.88 | 0.31 / 0.34 | Hairlines |

- Contrast: white on brick ΔL 0.52; olive 0.27 on lime ΔL 0.54. Never put lime text on light surfaces, never white text on lime.
- Legacy classes `.bbh-order-theme/.bbh-verify-theme/.bbh-enterprise-theme/.tdm-theme` now inherit `:root` (no overrides). `--tdm-red/--tdm-lime/--tdm-lime-soft/--tdm-olive` are oklch aliases.
- Tenant `--brand-*` default to unified tokens; partners override only on `.brand-scope`.

## Typography
- Display: Space Grotesk — headings (h1–h4 auto), KPI values, prices (`.num` = tabular figures)
- Body: Plus Jakarta Sans — all UI text. Mono: JetBrains Mono — order IDs, codes, slugs
- No serif anywhere (Tailwind `font-display` fallback is sans-serif)
- Scale: page h1 `text-2xl md:text-3xl font-bold`, section h2 `text-lg font-semibold`, label `.section-label`, body `text-sm`/`text-base`

## Elevation & Depth
Borders first, warm-tinted shadows second: `shadow-subtle` (header), `shadow-panel` (cards), `shadow-panel-hover`, `shadow-elevated` (dialogs/sheets), `shadow-bar` (bottom bars), `shadow-cta` (primary floating cart), `shadow-qr`.

## Shape & Spacing Scale
- Radius: `rounded-sm` 8px chips-in-inputs, `rounded-md` 10px buttons/inputs, `rounded-lg` 12px small cards/logo slot, `rounded-xl` 16px cards/KPI/toolbars, `rounded-2xl` 20px state cards/sheets, `rounded-full` pills/chips/avatars
- Spacing: page `px-4 sm:px-6` (`.page-container`), card `p-4`, section gap `space-y-6`, table rows `py-2.5`
- Touch targets ≥ 44px (`.tap-target`); buttons h-10 default, h-11 on mobile primary

## Structural Zones
| Zone | Background | Border | Notes |
| --- | --- | --- | --- |
| Header | `bg-card` (`.app-header` / `.brand-header`) | `border-b` | Sticky, safe-top; menu = icon button `.icon-btn` on mobile |
| Content | `bg-background` | — | Cards `bg-card`; alternate sections `bg-muted/40` |
| Sidebar (admin/console desktop) | `bg-sidebar` | `border-r` | Active item `bg-sidebar-accent` + primary text |
| Bottom nav (mobile) | `bg-card` `.bottom-nav` | `border-t` + `shadow-bar` | Active `.bottom-nav-item-active`: primary text + lime top bar |
| Fixed action/cart bar | `bg-card` `.fixed-bar` or `bg-primary` CTA | `border-t` | Sits above nav with `.bottom-above-nav` |
| Footer | `bg-muted/50` `.brand-footer` | `border-t` | Compact |

## Component Patterns
- Buttons: primary `bg-primary text-primary-foreground rounded-md hover:bg-primary/90`; secondary `bg-secondary text-secondary-foreground`; outline `border bg-card`; lime only for "selected/new" accents. Busy → `.is-busy` + spinner, disabled → `opacity-50`
- Focus: `ring-2 ring-ring ring-offset-2` (`.focus-ring`) on every interactive element
- Inputs: `h-10 rounded-md border-input bg-card`, focus `border-primary ring-ring/30`
- Switches: checked `bg-primary`, unchecked `bg-input`
- Cards: `.surface-card` (+ `.surface-card-hover`); KPI `.ent-kpi`; toolbar `.ent-toolbar`
- Chips: `.chip` / `.chip-active` (lime fill, olive text). Badges: `badge-success/warning/info/destructive/brand/lime` on `ent-pill`
- Tables: `.ent-th` (muted header), `.ent-td`, `.ent-table-row`; numbers `.num`, IDs `font-mono`
- Skeleton: `.skeleton`, `.skeleton-text`, `.skeleton-title`, `.skeleton-circle`, inside `.skeleton-card` — replaces every "Đang tải…"
- State screens (sign-in, no-access, empty, error, partner notice): `.state-screen > .state-card` (or `.state-inline`) → `.state-icon[-muted|-warning|-destructive|-success]` → `.state-title` → `.state-desc` → `.state-actions` (primary + outline)

## Mobile
- `--header-h` 3.5rem, `--bottom-nav-h` 4rem, `--fixed-bar-h` 4.5rem, `--safe-bottom/--safe-top` from env()
- Offsets: `.pb-bottom-nav`, `.pb-fixed-bar`, `.pb-fixed-stack`, `.pb-safe`, `.pt-safe`, `.top-header`
- Never stack two fixed bars without `.bottom-above-nav` + `.pb-fixed-stack`

## Motion
- Entrance `fade-rise` 200ms, `kpi-in` 300ms, `row-in` 250ms, sheets `sheet-up` 220ms
- Hover/press `transition-smooth` 200ms; skeleton `shimmer` 1.4s (off for reduced motion)
- OTP error `otp-shake`; success `pulse-soft`

## Constraints
- Vietnamese UI; keep all routes, copy and features; no new features or backend changes
- Token-only styling; no raw hex/rgb in components; no gradients beyond `bg-gradient-primary` on hero CTA
- Status colors are functional only; brick red never used for errors in place of `destructive`

## Signature Detail
The lime "active bar" — a 4px lime pill marking the selected bottom-nav tab, chip and accent rule — the one fresh note against disciplined brick red and white.
