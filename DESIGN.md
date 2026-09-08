# StudyMax — "Aurora Glass" Design System

> **v2.0 — Full redesign.** Replaces the ONYX brutalist system (pure-black surfaces,
> 2px borders, 0px radius). Every token below is implemented as a CSS custom
> property in `src/app/globals.css` and consumed through Tailwind v4 `@theme`.

---

## 0. Design Thesis

**Subject:** a study dashboard used for long, focused sessions — the screen stays
open for hours while the brain works.

**Thesis:** *calm depth, one hot signal.* The base world is deep cool slate
(`#0B0F17` → `#1F293D`) with soft glass cards that recede; exactly **one** hot
color per theme carries energy (focus, due-cards, active timer). Secondary cyan /
mint is reserved exclusively for *progress & flow* — never decoration. Motion is
soft-spring and physical: things float in with stagger, rings fill like liquid,
bars grow from their baseline. Corners are generous (12–20px) because focus mode
should never feel sharp or aggressive.

**The signature:** the **Focus Zone** — a large circular Pomodoro ring with a
breathing conic glow while running, surrounded by micro-particles when
concentration is high. It's the emotional center of every dashboard view.

---

## 1. Color Tokens

### 1.1 Core semantic tokens (theme-remapped at runtime)

| Token | Default (AURORA) | Role |
|---|---|---|
| `--color-bg` | `#0B0F17` | App background — deep matte slate |
| `--color-bg-raised` | `#111827` | Raised surface (sidebar, topbar) |
| `--color-muted` | `#1F293D` | Interactive surface / hover wash |
| `--color-fg` | `#E7EDF7` | Primary text (WCAG AAA on bg: 13.9:1) |
| `--color-muted-fg` | `#94A3B8` | Secondary text (7.1:1 on bg) |
| `--color-border` | `rgba(255,255,255,0.08)` | Hairline card borders |
| `--color-accent` | `#FF7A72` | **Primary hot signal** — coral, softened from `#FF5E57` per contrast audit |
| `--color-accent-soft` | `#FF7A72` @ 14% | Accent washes, glows |
| `--color-accent-fg` | `#1A0505` | Text on accent fills |
| `--color-flow` | `#00E5FF` | Progress, rings, "in flow" state |
| `--color-grow` | `#10B981` | Growth/success, streaks |
| `--color-danger` | `#FB4A55` | Errors, overdue |
| `--color-warning` | `#FCD34D` | Medium urgency |
| `--color-on-color` | `#0B0F17` | Text on saturated fills |

### 1.2 Subject badge pastels

`--badge-lavender #C084FC`, `--badge-yellow #FCD34D`, `--badge-rose #FDA4AF`,
`--badge-mint #6EE7B7`, `--badge-sky #7DD3FC` — always used at 15% opacity bg +
full color text + full color dot.

### 1.3 Contrast guarantees (WCAG)

- Body text on all dark themes ≥ 10:1 (AAA).
- Muted text ≥ 5.5:1 on `bg` (AA+ even for small caps labels).
- Every theme's `accent-fg` was picked against its own accent, not assumed.
- Focus ring: 2-layer ring (`bg` gap + accent halo), 3px total, visible on
  every surface.

---

## 2. Themes (12)

All themes override only `--color-*`; layout/typography/motion are shared.
Dark themes carry `color-scheme: dark`; LIGHT/AURORA-LIGHT flip to light.

| Theme | bg | accent | flow | Character |
|---|---|---|---|---|
| `aurora` ★ default | `#0B0F17` | `#FF7A72` coral | `#00E5FF` | The flagship — warm signal on cold slate |
| `midnight` | `#030712` | `#60A5FA` blue | `#22D3EE` | Classic calm blue night |
| `nebula` | `#0D0716` | `#C084FC` violet | `#F0ABFC` | Purple cosmos |
| `matrix` | `#02100B` | `#34D399` green | `#A7F3D0` | Terminal mint |
| `ember` | `#140808` | `#FB923C` orange | `#FCD34D` | Warm hearth |
| `rosewood` | `#12070C` | `#FB7185` rose | `#FDA4AF` | Soft red-pink |
| `cyberpunk` | `#0A0A12` | `#FCEE0A` acid yellow | `#00E5FF` | Neon city |
| `arctic` | `#07111E` | `#38BDF8` sky | `#99F6E4` | Ice blue-teal |
| `sandstone` | `#151210` | `#E8B45C` gold | `#A5B48C` | Warm library paper |
| `mono` | `#09090B` | `#FFFFFF` white | `#A1A1AA` | Pure grayscale focus |
| `light` | `#F1F5F9` | `#B91C1C` red-700 | `#0891B2` | Clean daylight |
| `paper` | `#FAF7F2` | `#9A3412` burnt sienna | `#0F766E` | Warm cream study desk |

★ = shipped default. Legacy names (`onyx→mono`, `void→midnight`, etc.) map in
the theme-init script so existing localStorage prefs keep working.

---

## 3. Typography

| Role | Face | Usage |
|---|---|---|
| Display | **Space Grotesk** (700/900) | Page headings, wordmark, big numerals — geometric, slightly techy, distinctive vs Inter-everywhere |
| Body/UI | **Inter** (400–900) | All body copy, buttons, labels |
| Data/Mono | **JetBrains Mono** | Timers, counts, timestamps, tabular digits |

Scale: `display 3rem–6rem · h2 1.5rem · h3 1.125rem · body 0.9375rem · caption 0.6875rem uppercase tracking-widest`.
Line-height 1.5 body / 1.05 display. Headings use `-0.03em` tracking; NO
uppercase body text (legacy system uppercased everything — reserved now for
eyebrows/badges only).

> **Known exception (Phase 8):** page display headings (`SUBJECTS`,
> `FLASHCARDS`, … via `RevealHeading`) stay all-caps app-wide. They are
> set in Space Grotesk display size, not body text, and changing one page
> alone would break cross-page consistency. Source strings elsewhere are
> normal-case with eyebrow styling applied via CSS.

---

## 4. Surface System (Glass + Neumorphic depth)

Three elevations, all built on `--glass-*` utilities:

```css
.glass        { background: rgba(255,255,255,0.05); backdrop-blur-md;
                border: 1px solid rgba(255,255,255,0.08);
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.06),
                            0 8px 24px -12px rgb(0 0 0 / 0.5); }
.glass-raised { + stronger shadow, hover lift }
.glass-inset  { neumorphic pressed well: inner shadows both directions }
```

Radius scale: `--radius-sm 8px · --radius-md 12px · --radius-lg 16px · --radius-xl 24px`.
Cards never exceed `xl`. Pills are fully rounded.

Glow language: interactive elements glow with `color-mix(accent 25%, transparent)`
at up to `40px` blur — only on hover/active, never idle (idle glow = noise).

---

## 5. Spacing & Density

4px base grid; dashboard density: section gaps 32–40px, card padding 20–24px,
grid gaps 16–20px. Max content width 1440px centered with 32–48px gutters.

---

## 6. Component Architecture

| Component | Spec |
|---|---|
| **Sidebar** | Glass rail on `bg-raised`, icon+label, animated active pill (`layoutId` spring), grouped sections (Learn/Focus/Insights/System), Dark/Light quick toggle + "All →" link to full picker in Settings, collapse toggle. Mobile: BottomNav with all 8 routes (icon-only inactive, labeled active) |
| **TopBar** (dashboard) | Greeting + date, global search trigger (⌘K overlay ready), quick actions |
| **Focus Zone** | Circular SVG Pomodoro: 270° track + gradient progress stroke (coral→cyan), breathing conic glow when running, phase chips, presets, current-task banner, soundscape selector slot, particle field when running |
| **Daily Progress** | Triple-ring SVG (cards reviewed = coral, time = cyan, goal = mint) with staggered dash animation + CountUp centers |
| **Weekly Analytics** | 7 bars scaleY-staggered from baseline, today highlighted, hover tooltips, mono hour labels |
| **Subject Cards** | Glass grid shortcuts, subject-color edge bar, count + mastery % |
| **Deadlines** | Urgency-coded rows: HIGH = danger pulse dot, MED = warning, LOW = muted; relative dates ("in 3d") |
| **Buttons** | Pill radius; primary = accent fill w/ shine sweep; secondary = glass outline; ghost; danger |
| **Badges** | Pastel chip system (§1.2); urgency variants reuse danger/warning tokens |
| **Inputs** | Glass wells, soft inner shadow, accent focus border + halo |

---

## 7. Motion Architecture

### Framer Motion — layout & state
- Dashboard entry: container `staggerChildren: 0.07`, children rise 16px + fade.
- Spring spec everywhere: `{ type: "spring", stiffness: 260, damping: 20 }`.
- Card hover: `whileHover={{ scale: 1.02, y: -4 }}` + shadow bloom.
- Tab/view switches: shared `layoutId` morphing pill (sidebar, mode toggles).

### Anime.js — SVG data-viz
- `ProgressRing`: animates `stroke-dashoffset` with `anime({ easing: 'easeOutExpo' })`.
- Weekly bars: staggered `scaleY` morph via `anime.stagger`.
- Focus particles: ~14 tiny dots on slow randomized SVG paths around the ring,
  opacity pulsing, only while the timer runs (killed on pause).

### CSS ambient
- Breathing conic glow behind the running timer (`@keyframes breathe`, 4s).
- Marquee-free: legacy ticker removed — replaced by quiet stat strip.
- All motion collapses under `[data-reduced-motion]` and
  `prefers-reduced-motion` (existing global rules kept).

---

## 8. Accessibility

- Contrast: §1.3 — all body text AAA on every shipped theme.
- Touch targets ≥ 44px; nav rows 44px min height.
- Focus-visible rings on ALL interactives (global rule retained).
- Rings/charts carry `role="img"` + `aria-label` summaries.
- Reduced-motion kills springs, particles, marquee, breathing.
- Icon-only controls always carry `aria-label`.

---

## 9. Anti-Slop Rules (what we deliberately avoid)

- No purple-to-blue default gradients; gradients only coral→cyan inside data-viz strokes.
- No glassmorphism without function — blur is reserved for overlays + sidebar.
- No gratuitous scroll animation; motion is entry/hover/state only.
- No emoji icons — lucide-react only.
- No raw hex in components — everything reads a token.
