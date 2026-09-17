# OpenStudy — Stitch Design Context

### A reverse-engineered X-ray of the existing product, written for AI design tools (Google Stitch), senior designers, frontend engineers, and coding agents

**Prepared from direct inspection of the codebase.** Every claim is grounded in source files read for this document. Where the code does not answer a question, the text says `UNCLEAR FROM CURRENT IMPLEMENTATION`. Work that exists in the data model or plan but not in the UI is `PLANNED / FUTURE`. Everything else is `CURRENT`.

**Inspection scope:** all 19 route files (+ every `loading.tsx` / `error.tsx` boundary), the root layout, sidebar + bottom navigation, 60+ components, the full Dexie schema (v1→v13, 20 tables), all business-logic engines (`fsrs`, `weakness`, `planner`, `exam`, `relations`, `review-queue`, `card-kinds`, `card-status`, `safety-net`, `share`, `pomodoro`), `globals.css` (637 lines: tokens, 12 themes, utilities, RTL, reduced-motion), the i18n dictionary (995 lines, EN/AR), the Zustand preference store, the service worker, the PWA manifest, all 8 API routes, and the test suites (170 unit tests, 3 Playwright specs).

**Stack (verified from `package.json`):** Next.js 16.3.4 (App Router, client-side pages) · React 19 · Tailwind CSS 4 (CSS-first `@theme` tokens) · Dexie 4 over IndexedDB (single source of truth) · Zustand 5 (localStorage prefs) · framer-motion + animejs (motion) · lucide-react (icons) · zod (validation) · date-fns. `gsap` and `react-fast-marquee` are dependencies whose usage was not located in inspected pages — `UNCLEAR FROM CURRENT IMPLEMENTATION`.

---

## 1. What OpenStudy Is (Product Model)

### 1.1 Core concept — `CURRENT`

OpenStudy is a **local-first, offline-first study operating system**: flashcards with a modern spaced-repetition scheduler (FSRS-4.5), notes, subjects/topics, study-session tracking (stopwatch + Pomodoro), goals, exams, a workload planner, a weakness engine, and analytics — all operating on **one shared local database** so each feature influences the others. There is no account, no server database, and no sign-in. The user's entire study life lives in their browser's IndexedDB.

The schema comment states the intent plainly:

> *"Dexie/IndexedDB is the SINGLE source of truth — fully local, fully offline, per-device. No server database anywhere."* (`src/lib/db.ts`)

The UI composition confirms it behaves as one product rather than five mini-apps: the dashboard's "Next Action" card is computed by the same priority engine (`lib/planner.ts` → `nextAction`) that the planner page uses; exam wrong-answers write real FSRS review state; topic rows on the subjects page show live counts pulled from notes, cards, bundles, sessions, weakness signals, and tasks simultaneously.

### 1.2 The main entities — `CURRENT` (from the v13 schema)

| Entity | Table(s) | Notes |
|---|---|---|
| Subject | `subjects` | name, description, **color**, **icon** (lucide picker) |
| Topic | `topics` | belongs to a subject; ordered |
| Resource | `resources` | link/reference attached to a topic (`Partially implemented` — surfaced in subject hub menus, no dedicated page) |
| Note | `notes` + `tags`/`noteTags` | markdown, optional topic link, pinned flag, optional AI `explanation` |
| Bundle (deck) | `bundles` | named card deck with its own color; optional topic/subject link |
| Flashcard | `flashcards` + `cardTags` + `cardImages` | front/back markdown, descriptions, kind (`basic` \| `cloze` \| `choice`), choices for MCQ, SM-2 legacy fields **plus** FSRS state (`fsrsStability/Difficulty/Lapses`), leech flag, images per face (blobs, occlusion-ready `regions` reserved) |
| Review log | `reviewLogs` | one row per review (card, quality 0–5, timestamp) |
| Study session | `studySessions` | title, subject/topic, minutes, completed, started/ended |
| Pomodoro preset | `pomoPresets` | built-in + user-saved configs |
| Goal | `goals` + `milestones` | kanban (backlog/in-progress/done), two horizons (long-term/todo), repeat rules, optional subject link |
| Exam | `exams` | scoped by subjects/topics, question count, time limit, practice flag, score on completion |
| Exam question | `examQuestions` | **build-time snapshots** (front, back, kind, choices, topicId, subjectId) so grade evidence survives card edits/deletion |
| Task | `tasks` | fine-grained study work, traceable to subject/topic/goal/exam, with due date + estimate |
| Wallpaper | `wallpapers` | user-uploaded blobs (plus bundled static/live catalogs in code) |
| Settings | `settings` | key/value — **present in schema but has no accessor** (`Unclear from current implementation`; app prefs actually live in localStorage via Zustand) |

### 1.3 The two conceptual pipelines — `CURRENT`

**Learning pipeline (daily loop):**

```
Subject → Topic → Notes → Flashcards → Reviews → Review Logs
                                    ↓                ↓
                              FSRS scheduler    Weakness engine
                                    ↓                ↓
                              Next due card ← Planner ← Analytics
```

**Examination pipeline:**

```
Subjects/Topics → Exam build (question snapshots) → Timed run
      → Grades → Wrong answers → FSRS lapses (real schedules move)
               → Per-topic breakdown → Weakness signals → Planner practice blocks
```

Both are verified end-to-end by the Playwright spec `e2e/study-os.spec.ts`: a browser-driven exam with all-wrong answers demonstrably moves the four cards' real FSRS schedules.

### 1.4 What the system calculates — `CURRENT`

- **FSRS-4.5 scheduling** (`lib/fsrs.ts`): stability/difficulty per card, three-button grading (Again/Hard/Good mapped from quality 1–2/3/4–5), interval prediction, retrievability. Legacy SM-2 cards migrate lazily on first review (state derived from old ease/interval fields + review history) — non-destructive.
- **Due queue** (`lib/review-queue.ts`): due-now filter + a relearning queue for lapsed cards.
- **Weakness signals** (`lib/weakness.ts`): recency-decayed (14-day window), max 8 signals, from review lapses + exam misses (double-weighted) + overdue burden; improves/fades dynamically. No permanent labels.
- **Planner** (`lib/planner.ts`): daily capacity derived from the user's own session history; distributes review minutes (**protected**), weakness practice first, then tasks by due date; flags overload; `nextAction` priority ladder: due reviews > imminent exam > weakness practice > tasks.
- **Analytics** (`lib/stats/*`, `lib/review-stats.ts`): streak, heatmap, retention curve, forecast (cumulative due), bundle mastery, hardest cards, hour-of-day histogram, per-range time breakdowns (day/week/month/all).

---

## 2. Route-by-Route Inventory

Routes found (`src/app/**/page.tsx`): `/`, `/subjects`, `/bundles`, `/bundles/[id]/cards`, `/flashcards`, `/review`, `/exam`, `/plan`, `/sessions`, `/goals`, `/notes`, `/notes/[id]`, `/stats`, `/settings`, `/sounds`, `/share`, `/share/[id]`, `/offline`. Every segment has `loading.tsx` and/or `error.tsx` except where noted. All pages are `"use client"` — rendering happens client-side against Dexie.

Shell shared by all routes (`layout.tsx`): WallpaperHost (z-0) → Sidebar (desktop) + main scroll area → BottomNav (mobile) + floating overlays: SpotifyMiniPlayer, UndoToastHost, ToastHost, CommandPalette (⌘K), ThemeEffects, VitalsGuard, SwRegister. A no-flash inline script applies theme/language/UI-opacity from localStorage before first paint.

---

## `/` — Dashboard

### Purpose
Single home surface: what to do now, how today is going, and everything at a glance.

### Primary user goal
Decide the next thing to study in under five seconds and start it.

### Main sections (in render order)
1. **TopBar** — time-aware greeting, live clock, search field (routes into ⌘K palette), sidebar toggle on mobile.
2. **Next Action card** — the planner's single recommendation (`nextAction` engine): kind icon (due reviews ⚡ / exam / weakness / task), title, detail, `~Nn` estimate, arrow. Accent-tinted, whole card is a Link.
3. **Due banner** — "N cards due" + **Study all due** button; pulses (`pulse-border` animation) while due > 0.
4. Left column: **FocusZone** (circular Pomodoro ring with breathing conic halo, phase chips focus/break/long-break, presets, soundscapes, remind-me) → **ContinueStudying** (resume last session) → **DeadlineList** (weekly deadlines) → **Upcoming** (goal due dates) → **Subjects grid** (top 4 subjects, color spine, card count + due badge) → **Recent sessions** list (status badge done/active, duration).
5. Right column: **DailyProgress** (cards vs 30, minutes vs 60, streak) → **4 stat cards** (subjects/topics/cards/study time; **zero-value cards turn into setup CTAs** — "+ Add subject", "Make flashcards") → **WeeklyAnalytics** (7-day bars) → **Review activity card** (26-week heatmap + streak badge) → **Goals link card** (kanban summary "N active · M total").

### Primary actions
Study all due · start Pomodoro · open Next Action target · search.
### Secondary actions
Open any linked page (subjects, sessions, goals, stats, review insights).
### Data displayed
Due counts, streak, today's cards/minutes, weekly bars, 26-week heatmap, recent sessions, deadlines, goal counts, subject breakdowns.
### Data created/edited/deleted
Study sessions (via FocusZone timer) — nothing else.
### Connected features
Planner (Next Action), FSRS queue (due counts), weakness engine (indirectly), goals, sessions, heatmap from review logs.
### Navigation entry point
Sidebar "Dashboard" (Insights group), bottom-nav Home, app logo.
### Important states
`PageLoader` skeleton variant "dashboard" while stats load; zero-state stat cards become CTAs; empty recent-sessions card with sparkles icon.
### Responsive
`grid-cols-1 → lg:grid-cols-5` (2/3 split); stat cards `grid-cols-2 sm:grid-cols-4`; padding `p-6 lg:p-10`.
### RTL
Logical properties throughout; Arabic greeting keys exist.
### Keyboard
⌘K search; everything is real links/buttons.
### Animations
Staggered spring entrance for the whole card tree (`staggerChildren: 0.07`); CountUp on stat values; pulse on due banner.
### Visually unique
The only page mixing 11 distinct card types; sets the density/hierarchy tone for the app.
### Must stay consistent with
Accent-tinted "action banner" pattern (also used by exam setup hints, plan overload warning), micro-caps section labels, glass cards.

---

## `/subjects` — Library (the largest page, 1,441 lines)

### Purpose
The knowledge tree: subjects → topics → their notes, bundles, cards, sessions, weakness, tasks.

### Primary user goal
Create/organize study material and jump into any of it.
### Main sections
Subject cards (icon, color, description) → per-subject topic list with **hub rows** (live counts: notes/cards/bundles/sessions; due badges; **weakness chips**; task deep-links) → manage menus per subject/topic (create/edit/delete, resource links) → bundle management per topic (create-from-topic, link, share) → an embedded review flow (this page imports `reviewFlashcardWithLog` and rating buttons — quick-review from a topic) → inline due-review entry.
### Primary actions
Create subject/topic/bundle; review a topic's due cards; open bundle cards; share bundle; manage resources.
### Secondary actions
Edit/delete with undo toasts; icon + color pickers.
### Data
Everything above; deletes cascade (subject → topics → cards with confirm).
### Connected features
Bundles, flashcards, notes, sessions, weakness (hub chips), planner (task links), share.
### States
Skeleton cards; `EmptyState` for no subjects; confirm modals for deletes.
### Responsive
Auto-grids; hub rows wrap; menus collapse.
### Visually unique
Only page with the full hub-row pattern (5+ live counts per row); color/icon identity system.
### UX notes
Extremely dense — the strongest candidate for IA simplification. `Partially implemented`: resources exist in the model and menus but have no dedicated browsing UI.

---

## `/flashcards` — Cards workspace (1,372 lines + `_review-mode.tsx` 411)

### Purpose
Full flashcard workspace with four tabbed modes: **Review**, **Browse**, **Leeches**, **Stats**.

### Mode tabs (sliding accent pill, framer-motion `layoutId`)
- **Review** — see §15 Study Modes (bundle overview grid → session).
- **Browse** — searchable/filterable card table; create/edit modals (front/back markdown + descriptions, kind picker basic/cloze/choice with choices editor, topic/bundle selectors, **front/back image upload** via `CardImage` blobs); bulk actions; CSV/JSON import; per-card edit prefill including image snapshot/restore.
- **Leeches** — problem-card management: list of leeches (repeated lapses), un-leech, **batch reset progress**.
- **Stats** — `_browse-leech-stats`: per-bundle accuracy/leech table with radial color washes.

### Primary actions
Create card (modal), review, bulk reset, import, filter by bundle/topic/due.
### Entry points
`?bundle=`, `?topic=`, `?mode=`, `?q=`, `?all=1` deep links from subjects/topics/dashboard.
### Data
Flashcards + cardImages + reviewLogs (via review actions); offline sync badge in header (`fc.online / offlineQueued / syncing` with pending-deletes count).
### Connected features
Bundles, subjects/topics, weakness (lapses feed it), exams (share the pool), command palette.
### States
Skeletons; per-mode EmptyStates; completion screen after a finished session (success-styled box + Study again/Back).
### Visually unique
The 3D flip card; the four-mode tab system; sync status chip.
### UX notes
Strong feature depth; the create modal is long (kind fields + images + tags + topic) — a wizard or split form is a design opportunity, not a current bug.

---

## `/bundles` and `/bundles/[id]/cards`

### Purpose
Deck-centric alternative entry to cards: bundle grid (color-washed spotlight cards, card counts) → per-bundle card page with its own review/browse/manage tooling.
### Primary actions
Create/edit/delete bundle, import cards, share (URL-hash), open cards.
### States
Skeletons, EmptyState, delete confirm modal, undo toast on delete.
### Visually unique
Bundle color identity (`radial-gradient` wash in the bundle's color — a sanctioned pattern); SpotlightCard hover.
### UX notes
Functionality overlaps `/flashcards` review and `/subjects` bundles — three doors to the same objects; an IA simplification opportunity.

---

## `/review` — Study-time insights (263 lines) — *name is misleading*

### Purpose
**Not a review session** — it is the time-tracking insights page: how long you studied, by range and subject.
### Main sections
Range tabs (day/week/month/all, pill tablist with `aria-selected`) → period navigation (prev/next arrows, `aria-live` label) → "currently studying" live banner (if the Pomodoro is active) → **Donut chart** (SVG, subject-colored segments, total HH:MM center) → per-subject breakdown list → per-day bars.
### Primary actions
Switch range, step periods, start a session.
### States
`animate-pulse` skeleton (donut + bar); bespoke empty state ("no study time" + Start session button); currently-studying chip.
### Connected features
Sessions (source data), FocusZone/live Pomodoro, settings link.
### UX notes
"Review" naming collides with flashcard review — an IA confusion point documented in §13.

---

## `/exam` — Exam Mode (488 lines)

### Purpose
Timed, scoped, self-graded/auto-graded exams that affect real learning state.

### Phases (state machine: setup → running → results)
1. **Setup** — title input; subject chips (multi-select, `aria-pressed`); topic chips (filtered by chosen subjects); question count (1–200); time presets (none/5/10/15/30/45/60); **Practice toggle** (practice logs reviews but never moves schedules); live pool-size card ("N cards available"); explainer card ("wrong answers feed your schedule"); exam history list (score, date, delete with confirm modal).
2. **Runner** — top bar: exit (confirm modal), `n / total`, countdown (turns danger under 60s) or practice/real badge; thin progress bar; question card showing build-time snapshot `frontText`; **choice** questions → shuffled options, auto-graded against snapshot `backText`; **basic/cloze** → self-grade with the same three rating buttons as reviews; auto-completes when timer expires.
3. **Results** — big score %, correct/answered + duration; pass/fail color (≥60% success, else warning); **per-topic breakdown** bars (danger <50% / warning <80% / success ≥80%); **wrong-answer review** (front, correct back, your answer); note whether scores were **fed to your schedule** or practice-only; New exam / Back home.

### Data
Creates `exams` + `examQuestions` rows; on grading (non-practice) calls the real `reviewFlashcardWithLog` → FSRS state changes + review logs (feeding rule is structural in `answerExamQuestion`, idempotent per question).
### Connected features
FSRS, weakness engine (exam misses are double-weighted evidence), planner (imminent exams raise priority), topics.
### States
Skeleton per phase; pool-empty EmptyState; exit-confirm; timeout auto-finish.
### UX notes
The runner is intentionally minimal (no palette, no question jump-back — you answer and advance). Design opportunity: question navigator/flag-for-review, currently `PLANNED / FUTURE` (not present).

---

## `/plan` — Study Planner (220 lines)

### Purpose
Render the distributed daily plan computed from real learning data.
### Main sections
**4 stat cards** (daily capacity / review minutes / practice minutes / task minutes — capacity derived from the user's own session history) → **14-day grid** (`sm:grid-cols-2 lg:grid-cols-7`): per-day review load, weakness-practice blocks (weak topic labels), task blocks, exam markers (in-progress exams on their start day), overload warning banner → **Weak topics panel** (signal rows with trend arrows) → **Open tasks panel** (due date, estimate, one-tap done / delete) → Add-task modal (title, date, estimate).
### Primary actions
Add/complete/delete tasks; read the plan; follow practice targets.
### Data
`getPlannerData()` → cards, tasks, weakness, exams, sessions → `buildPlan` (pure).
### Connected features
FSRS (review minutes protected), weakness engine, tasks, exams, session history (capacity).
### States
Single big skeleton; "no weakness"/"no tasks" inline empty lines.
### UX notes
Day cards are compact; editing tasks is modal-based; no drag/reschedule yet (`PLANNED / FUTURE` opportunity).

---

## `/sessions` — Focus timer + history (871 lines)

### Purpose
Start study sessions (stopwatch or Pomodoro) and browse history.
### Main sections
Mode switch (Stopwatch / Pomodoro) → session form (title, subject, topic via `SubjectTopicMenu`) → timer area: stopwatch (start/pause/resume/stop&save) or Pomodoro ring with phase chips + skip; custom preset management (create/delete, stored in Dexie) → **history** with filters (Today / 7d / 30d / All + subject) and per-row delete (shared confirm modal) → stats.
### Data
Creates `studySessions`; reads sessions/subjects/presets via live queries.
### Robustness (notable, evidence-backed)
Re-entrancy guard prevents double-saving; failed saves restore the timer state and show a retry error; started-at fallback attributes midnight-crossing sessions correctly; <3s sessions ignored as accidental taps. (Several past bugs were fixed here — comments document them.)
### Animations
`GravityFall` falling-text timer digits; phase color mapping (accent=focus, flow=break, grow=long break).
### UX notes
Dense page mixing timer, presets, and history; mobile-friendly move buttons exist on kanban here? (No — that's goals.) Save flow is the most defensive in the app.

---

## `/goals` — Kanban goals & todos (806 lines)

### Purpose
Long-term goals + regular todos on a two-horizon × three-status kanban.
### Main sections
Two horizon groups (LONG-TERM / REGULAR) × columns (BACKLOG → IN PROGRESS → DONE); cards with description, subject chip, due date, repeat badge, color accent; **milestone checklists** with progress; GoalModal editor (all fields incl. repeat daily/weekly/monthly); HTML5 drag-and-drop on desktop + explicit move buttons for touch; CSV + JSON import/export with toasts.
### Data
`goals`, `milestones`; completion of repeating goals reschedules.
### Connected features
Subjects (optional link), planner (open tasks summary feeds capacity; goals feed dashboard Upcoming), dashboard card.
### States
Skeleton columns; per-column empty hints.
### Visually unique
The only drag-and-drop surface; kanban columns with count headers.

---

## `/notes` and `/notes/[id]`

### Purpose
Markdown note-taking with tagging, AI explain, and AI card generation.
### List page (655 lines)
Search, pinned-first ordering, topic filter (via `?topic=`), create/edit modal (title, markdown content, tags, topic link, live preview), pin, delete (with **undo toast**), export menu (Markdown / CSV), import, **NoteAiImportButton** per note (send note content to AI card generation targeting a bundle).
### Detail page (`/notes/[id]`)
Full markdown render, edit modal, delete confirm, **NoteExplanation** panel: AI explanation of the note (streamed), persisted on the note record (`explanation`, `explanationUpdatedAt`), regenerate/clear — and a generate-cards entry.
### Connected features
AI routes (explain + generate), bundles (AI import target), topics, command palette, share of note? (No — notes are not shareable; bundles are.)
### States
Skeletons, EmptyState, undo toasts, streaming state in explanation panel.

---

## `/stats` — Analytics (411 lines)

### Purpose
Deep learning analytics.
### Sections
Period selector (7/30/90/365 days + all) → KPI cards row (reviews, accuracy, streak, time — **global, unaffected by period**) → reviews-by-period bar chart → hour-of-day histogram (9:00–17:00 highlighted in accent) → 26-week heatmap (period-aware) → **Retention curve** (accuracy vs days since first review) → **Forecast** (cumulative due; chips: due now / leeches / mastered ≥21d) → **Bundle mastery table** (weakest first) → **Hardest cards table** (min 3 reviews) → footnote clarifying which parts the period filter affects.
### Data
All computed from `reviewLogs`, `flashcards`, `bundles` via `lib/stats/*` and `review-stats`.
### Visually unique
The most chart-dense page; charts are bespoke SVG/div bars (no chart library).
### UX notes
Custom tables here are candidates for the new Table primitives (see §8).

---

## `/settings` (673 lines)

### Purpose
Appearance, wallpapers, interface prefs, data portability.
### Sections (single scroll, max-w-2xl content columns)
1. **Appearance** — language (EN/AR toggle → flips `dir`), 12 theme swatches (live preview, includes light + paper), **Wallpapers**: type tabs None / Static / Live / Custom URL / **Your Uploads** (upload from device, multi-select, thumbnails, apply, delete with confirm; JPG/PNG/WebP/GIF/AVIF ≤8 MB; stored as IDB blobs); per-wallpaper opacity, blur, **rotation** (0/90/180/270 with geometry compensation); **UI opacity** slider (how much surfaces step back for the wallpaper, `--ui-alpha`).
2. **Interface** — reduced-motion toggle (`data-reduced-motion` on `<html>`).
3. **Data** — Export all data (JSON download; walls/care: excludes wallpapers & card images), Import (file picker → `importAllData`; success/danger status banners; backup versioned, additive).
### UX notes
Settings is long and single-page (no tabs in code — section headings only). Uploads tab is the newest UI; delete-active-wallpaper resets preference to None.

---

## `/sounds` — Spotify & focus audio (31 lines)

### Purpose
Zero-auth music: paste a public Spotify playlist/track link → official iframe embed plays globally while you study.
### Details
`SpotifyEmbedPicker` UI; persistent **mini-player** (vinyl spinner) and hidden `SpotifyAudioSource` live in the app shell, so audio survives navigation. A `/api/spotify/search` + `/api/ytmusic/search` route pair exists for search — `Partially implemented` (the page's primary flow is paste-link; search routes are wired `UNCLEAR FROM CURRENT IMPLEMENTATION`). A local **soundscape generator** (white/pink/brown noise, rain, café, waves, fire, wind — pure Web Audio in `lib/soundscapes.ts`) is integrated into FocusZone.

---

## `/share` and `/share/[id]`

### Purpose
Bundle sharing with no server: export bundle → base64url payload in the URL **hash** (`/share#<payload>`, ≤1,800 chars) → recipient opens the link, previews the deck, imports locally. `/share/[id]` is the legacy path that re-encodes to the hash form.
### States
Reading state, INVALID SHARE DATA / NO SHARE DATA error cards, import success.
### Unclear
Nothing — fully implemented and tested.

---

## `/offline`

Service-worker fallback page (network-first nav misses): big "OFFLINE" wordmark, explanation, go-home button. Localized.

## Error & loading boundaries — `CURRENT`

Per-segment `error.tsx` (alert-triangle icon tile, title/body, **retry** + home buttons, error digest code in mono) and `loading.tsx` skeletons; root `global-error.tsx` also exists. `PageLoader` has variants (dashboard default) used by heavy pages.

---

## 3. Core Features (condensed feature catalog)

| Feature | What it does | Access | Consumes | Produces | Consumed by | Completeness |
|---|---|---|---|---|---|---|
| Subjects & topics | Organize everything | Sidebar → Library | — | subjects/topics | cards, notes, exams, planner, weakness | CURRENT (resources partial) |
| Bundles/decks | Card decks with identity | Library, /bundles, palette | topics/subjects | bundles | review, share, stats | CURRENT |
| Flashcards | 3 kinds + images + tags | /flashcards, bundles | topics/bundles | cards, images | review, exams, stats, planner | CURRENT |
| FSRS review | SRS sessions (flip/MCQ/sprint/TTS) | /flashcards review, subjects, bundles, "Study all due" | cards + images | reviewLogs, FSRS state | due counts, forecast, weakness, heatmap | CURRENT |
| Leech management | Identify/fix problem cards | /flashcards Leeches tab | reviewLogs | un-leech/reset | stats | CURRENT |
| Exams | Timed scoped exams | Sidebar → Practice → Exam | cards (+topics/subjects) | exams, examQuestions, FSRS lapses, logs | weakness, planner, dashboard Next Action | CURRENT |
| Weakness engine | Dynamic weak-topic signals | /plan, subject hubs, dashboard | reviewLogs + exam results + overdue | WeaknessSignal[] | planner, hubs | CURRENT |
| Planner | Daily workload distribution | Sidebar → Focus → Plan | cards, tasks, weakness, exams, sessions | plan days, NextAction | dashboard, /plan | CURRENT |
| Tasks | Fine-grained work items | /plan | subject/topic/goal/exam links | tasks | planner, hubs | CURRENT |
| Sessions (stopwatch) | Free timing | /sessions | subjects/topics | studySessions | analytics, capacity, continue-studying | CURRENT |
| Pomodoro | Cycles, presets, phases | FocusZone + /sessions | presets | studySessions | review-page live banner | CURRENT |
| Soundscapes | Generated focus noise | FocusZone | — | audio only | — | CURRENT |
| Spotify | Music while studying | /sounds + mini-player | link paste | none (iframe) | — | CURRENT (search routes unclear) |
| Goals kanban | Long-term + todos | Sidebar → Focus → Goals | subjects | goals/milestones | dashboard upcoming, planner | CURRENT |
| Notes | Markdown + tags | Sidebar → Learn → Notes | topics | notes, tags | AI import, palette | CURRENT |
| AI explain | Streamed note explanation | note detail | note content | persisted explanation | — | CURRENT |
| AI card gen | Text → cards (XML contract) | notes + flashcards | pasted text ≤8k chars | cards after user prunes | bundles | CURRENT |
| TTS read-aloud | Speak card faces | review faces | card text | speech | — | CURRENT |
| Command palette | ⌘K global search | anywhere | subjects/bundles/cards/notes | navigation | — | CURRENT |
| Share links | Serverless deck sharing | bundles | bundle | URL payload | import | CURRENT |
| Import/export | JSON full backup; CSV/MD per-entity | settings + pages | everything (except blobs) | files | importAllData | CURRENT |
| Wallpapers | Static/live/custom/uploads | settings | files/URLs | prefs + blobs | app shell | CURRENT |
| Themes | 12 themes | settings, sidebar | — | data-theme attr | everything | CURRENT |
| Streak/heatmap/forecast/retention/mastery | Analytics | dashboard + /stats | logs/cards | charts | motivation, planner | CURRENT |
| Offline & safety | SW shell, pending-delete queue, DB rescue | automatic | — | — | — | CURRENT |
| Notifications | Reminder scheduling | FocusZone remind-me | setTimeout in-tab | notification | — | PARTIALLY IMPLEMENTED — fires only while tab open (code comments say so) |
| Image occlusion | Regions on card images | — | — | — | — | PLANNED / FUTURE (data model carries `regions`; no UI) |
| Exam question navigator / flags | Jump between questions | — | — | — | — | PLANNED / FUTURE (absent) |
| Cross-device sync | — | — | — | — | — | PLANNED / FUTURE (export/import is the only bridge) |

---

## 4. User Journeys (reconstructed from code)

### 4.1 First launch — `CURRENT` (no onboarding flow exists)
1. App opens on `/` (dashboard). Theme/lang/UI-opacity applied pre-paint from localStorage defaults (Aurora, English, opaque).
2. Everything is zero: four stat cards render **as setup CTAs** ("+ Add subject", "Create a topic", "Make flashcards", "Start studying →") — the empty state *is* the onboarding checklist.
3. Next Action card is absent (no data → no recommendation); due banner absent.
4. No tour, no sample data, no sign-up. `PLANNED / FUTURE`: any guided onboarding.

### 4.2 Creating study material — `CURRENT`
Subjects: `/subjects` → create modal (name, description, **icon picker**, color) → card appears; topic create via subject menu → hub row appears with live zeros. Cards: `/flashcards` → create modal (front/back markdown with optional inline image button, descriptions, kind picker → cloze mask or choices editor, topic/bundle, tags, optional **front/back image upload**) → card saved with FSRS defaults (due immediately). Notes: `/notes` → modal (title, markdown, tags, topic) → list + detail. Task: `/plan` → Add task modal. Goal: `/goals` → GoalModal (horizon, status, due, repeat, subject, color). Feedback: toasts; undo toasts on deletes.

### 4.3 Flashcard review — `CURRENT` (the deepest flow)
1. **Entry**: `/flashcards` (Review tab), or deep link `?bundle=…`/`?topic=…`/`?all=1`, or dashboard "Study all due", or a subject hub row.
2. **Bundle overview** (if no scope): spotlight grid of bundle cards with color wash + card counts; "Open →".
3. **Session bar**: `n reviewed • total`, relearning badge (×N), queue badge, progress bar (1px→accent), **Speed Sprint** toggle (5s answer window with danger countdown bar).
4. **Card**: 3D flip (600ms, `perspective: 1600px`). Front: QUESTION badge + kind badge (cloze/choice), subject › topic breadcrumb, TTS speaker button, front text (cloze masked `[…]`), optional front image, optional front description, MCQ option buttons (stop propagation, click to pick), footer `#id-slice` + "click or press space to reveal".
5. **Reveal**: click card or Space (also Enter) → back face: solid **accent background** (the answer face is the loudest surface in the app), ANSWER badge, TTS, optional back image, correct/incorrect chip for MCQ picks, markdown answer, description, "rate it below" footer.
6. **Grade**: three rating buttons (Again / Hard / Good — colors from `RATING_BUTTONS` semantic map, keyboard `1/2/3`) → `reviewFlashcardWithLog` → FSRS writes next due + review log; lapsed cards enter the relearning queue.
7. **Completion**: success-styled panel ("You reviewed N cards"), Study again / Back to bundles.
Failure states: save errors toast; offline shows sync-queued chip; images load per-card from IDB blobs.

### 4.4 Exam — `CURRENT` (verified end-to-end by e2e)
Setup (scope, count, time, practice) → create (snapshots taken) → runner: answer → `answerExamQuestion` grades + (non-practice) feeds FSRS immediately → next → last answer completes exam → results: score, per-topic bars, wrong-answer review, fed-note → (back home / new exam). Timer expiry auto-completes. Exit requires confirm; abandoned exams marked `abandoned`. Downstream: weakness signals rise within the 14-day window; planner adds practice blocks; dashboard Next Action may flip to that practice.

### 4.5 Planning — `CURRENT`
`/plan` loads → capacity from your session history → day cards show protected review minutes, weakness practice first, then tasks → user adds tasks (title/date/estimate) or completes them inline → overload banner if a day exceeds capacity → dashboard mirrors the same engine via Next Action.

### 4.6 Study session — `CURRENT`
`/sessions` (or FocusZone): stopwatch (needs a title to start) or Pomodoro (presets, phases with distinct colors, skip, auto-advance) → stop & save (min 3s) → session row → feeds daily progress, weekly analytics, review-page donut, streak, planner capacity. Failure: save error restores timer for retry.

### 4.7 Settings journeys — `CURRENT`
Theme switch (instant, pre-paint on next load), language flip (dir swap), wallpaper pipeline (type → source → opacity/blur/rotation → UI opacity), reduced motion, export/import data (versioned JSON; wallpapers/card images excluded by design — device-local decorations).

---

## 5. How OpenStudy Thinks (The Interconnection Model)

This is the product's center of gravity, and it is **implemented, not aspirational** — each edge below names its code:

1. **Exam → FSRS**: `answerExamQuestion` (actions.ts) calls `reviewFlashcardWithLog` for wrong answers on real exams → schedules move. Verified in-browser by e2e.
2. **Exam → Weakness**: `collectExamEvidence` (weakness.ts) counts exam misses per topic, double-weighted.
3. **Reviews → Weakness**: `collectReviewEvidence` — lapses in a 14-day window, recency-decayed.
4. **Overdue → Weakness**: `collectOverdueEvidence` — overdue burden counts as evidence.
5. **Weakness → Planner**: `buildPlan` puts weakness practice first (after protected reviews) on each day.
6. **Weakness → Subject hubs**: `getTopicHubData` returns weakness chips per topic row.
7. **Weakness + exams + tasks → Next Action**: `nextAction` ladder powers the dashboard card: due reviews > imminent exam > weakness practice > tasks.
8. **Sessions → everything numeric**: capacity (`deriveCapacity`), daily progress, weekly analytics, review donut, streak.
9. **Goals ↔ Tasks ↔ Planner**: tasks carry `goalId`; planner totals task minutes; dashboard Upcoming lists goal due dates.
10. **Notes → Cards (AI)**: note content is the source for AI-generated cards targeted at a chosen bundle.
11. **Topics → Bundles → Share**: bundle may be topic-owned; export via URL-hash.
12. **Card deletion ≠ evidence loss**: exam questions keep build-time snapshots (front/back/kind/topic) so history stays explainable.
13. **Everything → Command palette**: subjects, bundles, cards (cloze-aware search), notes.

**The mental model for a designer:** the app is a *closed learning loop*. Every act of studying (review, exam, session) writes evidence; evidence changes three live things (what's due, what you're weak at, what to do next); and one card on the dashboard always names the next move. Visual design should make **state changes ripple visibly**: after a bad exam, the user should see weakness chips, planner blocks, and the Next Action all respond.

---

## 6. Current Design System ("Quietly Premium")

### 6.1 Tokens — `CURRENT` (`globals.css`)

**Surfaces (dark default ramp):** bg `#0B0C0F` · surface `#141519` · surface-raised `#1B1D23` · surface-hover `#23262D` · muted `#23262D` · fg `#ECEDEF` · muted-fg `#9BA1AC` · border `white/7%` · border-strong `white/13%`.
**Signals:** accent `#FF7A72` (Aurora default; per-theme) · accent-soft 12% tint · accent-fg (dark text on accent) · flow `#38BDF8` (in-progress) · grow/success `#34D399` · warning `#F5B544` · danger `#FB4A55` · info `#60A5FA` · on-color.
**Type:** Inter (sans+display; weights 400–800 loaded) · JetBrains Mono (**all numerics**, tabular) · Space Grotesk + Plus Jakarta Sans loaded (round/display accents; usage sparse — `Unclear from current implementation` where intended). Fluid clamp scale `--text-xs…--text-4xl`; micro-caps label style: 10px bold uppercase tracking-widest.
**Radius tokens:** 8/12/16/20px (sm→xl); modals use `rounded-2xl` (mapped). **Spacing:** fluid `--space-3xs…--xl`; Tailwind spacing in components. **Motion tokens:** rise 500ms expo, modal-pop 280ms spring, page-enter 400ms, shimmer 1.6s, pulse-dot 1.6s.

### 6.2 Themes — `CURRENT` (12)
`aurora` (default coral) · midnight · nebula · matrix · ember · rosewood · cyberpunk · arctic · sandstone · mono · **light** · **paper** (the last two override the entire neutral ramp for AA contrast; all others share the dark ramp and vary accent + secondary hues). Legacy zinc/yellow/red/green/blue/slate Tailwind classes are **aliased to theme tokens** in `@theme` — old pages re-theme automatically but new code writes semantic tokens.

### 6.3 Surfaces — the 3-layer model — `CURRENT`
- `glass` (Level 1): panels/cards — color-mixed `surface` at `--ui-alpha`, 1px border, tiny shadow.
- `glass-raised` (Level 2): modals/popovers — raised bg, stronger border, big soft shadow.
- `glass-inset` (Level 0): inputs — recessed.
All respect `--ui-alpha` (wallpaper translucency). `glow-accent` = 1px accent ring for selected. `spotlight-card` = radial accent tint on hover (hero cards only).

### 6.4 Component primitives — `CURRENT` (`ui.tsx`, `states.tsx`)
**Button** (primary/secondary/ghost/danger/success × sm/md/lg/icon + `loading` with spinner & aria-busy) · **IconButton** (label TS-required) · **Card** (hover/glow) · **Badge** (6 semantic variants) · **Input/Textarea** (label, error) · **Select** (native, styled, options-or-children, placeholder) · **Switch** (peer-checked track/knob, role=switch) · **Modal** (portal, focus trap+restore, Escape, backdrop close, labeled X) · **ConfirmDialog** (danger/primary confirm) · **Table set** (Table/THead/TBody/TR/TH/TD) · **EmptyState** · **LoadingState** (skeleton rows) · **ErrorState** (retry) · **SuccessState** · **Spinner** · **Kbd** · **Skeleton** · **RingProgress** (anime.js SVG ring). **Toast** (4 tones, max 3, 5s) + **UndoToast** (delayed-commit deletes) live globally.

Legacy/duplicated: two bespoke stat tables (`hardest-cards-table`, `stats-forecast-mastery`) predate the Table set; ~6 DIY overlay modals remain in bundles/goals/notes/command-palette/spotify/wallpaper pages (see §9).

### 6.5 App chrome — `CURRENT`
- **Sidebar** (desktop, collapsible 240↔68px): grouped nav — Learn (Library, Notes) / Practice (Review, Exam) / Focus (Plan, Sessions, Goals) / Insights (Dashboard, Stats) / Music (Spotify) / System (Settings). Active item: accent text + soft bg + animated 0.5px accent bar (framer `layoutId` spring). Bottom: theme quick-switcher (sun/moon) + version.
- **BottomNav** (mobile): 8 items (Home, Library, Sessions, Review, Plan, Exam, Stats, Settings) — dense; label 10px under 20px icons; accent top-pill on active; safe-area padding.
- **TopBar** (dashboard): greeting, clock, search.
- **PageHeader** component exists (label/title/description/actions) but **adoption is partial** — several pages hand-roll their headers (review, sounds, notes list, exam).

### 6.6 State patterns — `CURRENT`
Empty: `EmptyState` (dashed shell, icon tile, action) in most pages; a few bespoke empties (review page, dashboard recent-sessions). Loading: per-route `loading.tsx` skeletons + `PageLoader` variants + inline `Skeleton`s. Error: route `error.tsx` boundaries with retry + digest. Success: toasts; completion screens (review/exam). Offline: `/offline` + per-page sync chips.

### 6.7 Icons & imagery — `CURRENT`
lucide-react exclusively; 14–20px inline, 48px empty-state; `aria-hidden` on decorative. Bundle/subject color identity: solid color dot/spine + tinted initial-avatar. Wallpapers (static/live/uploaded) sit behind `--ui-alpha`-translucent surfaces.

### 6.8 Charts — `CURRENT`
All bespoke: SVG donut (review page), SVG ring (RingProgress), div-bar histograms (weekly, hour-of-day), CSS heatmap grid (26 weeks), SVG line (retention curve), horizontal bars (forecast/mastery/topic breakdown). No chart library — consistent stroke/tone but re-implemented per chart.

---

## 7. Visual Language (what it currently *feels* like)

- **Density**: medium-high on hub pages (subjects, flashcards browse, stats), low in study modes (runner, flip card are near-empty by design). The system supports both extremes with the same tokens.
- **Hierarchy**: strong 3-step typographic ladder — micro-caps eyebrow labels (10px, widest tracking) → semibold card titles (15–17px tight) → mono numerals (20–36px bold, tabular). Numerals are always mono: counts feel instrument-like.
- **Contrast personality**: dark charcoal surfaces, hairline white/7% borders, one hot accent reserved for action/attention. Light themes flip the ramp but keep the hairline + single-accent personality.
- **Card usage**: the card is the universal container (stat, hub row, panel, modal section). `rounded-xl` (16px) dominates; modals/hero cards 20–24px.
- **Border usage**: 1px everywhere; `border-strong` for raised; dashed only for empty states. No drop shadows except raised/modals + primary button's 1px.
- **Accent discipline**: mostly disciplined — accent = interactive/active/urgent. Exceptions: the review **answer face** floods the entire card with accent (intentional drama), and several hand-rolled accent buttons drift (§9).
- **Motion personality**: confident but restrained — spring pills on nav, staggered dashboard entrance, 3D flip as the signature move, breathing halo in FocusZone. Reduced-motion collapses everything.
- **Navigation feel**: persistent, compact, keyboard-first (⌘K), color-coded by group in the sidebar only.
- **Overall**: "Linear-meets-Anki" — an instrument panel for studying rather than a friendly workbook; monochrome structure, accent signal, numeric authority, and one flamboyant move (the flip).

---

## 8. Design Inconsistencies (evidence-located, not fixed)

| # | Inconsistency | Where | Why it matters |
|---|---|---|---|
| 1 | **Two modal systems**: trapped `Modal` primitive vs ~6 DIY `fixed inset-0` overlays (bundles cards, goals, notes, command-palette, spotify-embed, wallpaper-host) | those files | No trap/Escape/restore in DIY ones; different padding/radius/animation |
| 2 | **Raw `<select>` vs `Select`**: ~10 unstyled native selects (sessions, flashcards browse, subjects, ai-import-modal, bulk-action-bar, subject-topic-select, focus-zone…) | those files | Browser-default chrome inside a themed UI |
| 3 | **47 hand-styled accent buttons** across pages replicate Button primary/ghost with drift (different radii, paddings, hovers) | grep-verified | Same action renders differently page-to-page |
| 4 | **Bespoke tables** (hardest-cards, forecast/mastery) vs new Table set | stats components | Different header/row/hover treatment |
| 5 | **Page header patterns differ**: `PageHeader` component vs hand-rolled headers (review, sounds, exam, notes) | multiple | Inconsistent title/description rhythm |
| 6 | **Naming collision**: `/review` is a time-insights page while card review lives in `/flashcards` | routes | IA confusion; bottom-nav labels it "Review" |
| 7 | **Three doors to decks**: `/bundles`, `/flashcards` review tab, `/subjects` bundle management | routes | Duplicate affordances, different visual treatments of the same object |
| 8 | **Back-face accent flood** is unique in the app (only full-accent surface) | `_review-mode.tsx` | Intentional, but a redesign must decide if it stays the rule or the exception |
| 9 | **Legacy color alias classes** (`text-zinc-400`, `bg-yellow-500`…) coexist with semantic tokens | many pages | Visually themed, but semantically ambiguous for future edits |
| 10 | **~46 hardcoded hex values** in tsx (charts, spotify-embed, bundle defaults `#DFE104`) | grep-verified | Not theme-reactive where used directly |
| 11 | **`!p-5` important-flag padding** sprinkled on Cards | dashboard/stats | Smell of token drift in spacing |
| 12 | **Empty-state variance**: `EmptyState` vs bespoke (review page, dashboard recent sessions, plan inline lines) | several | Same situation, different presentations |
| 13 | **Bottom-nav has 8 items** (spec comment says 4 primary + secondary menu) — all 8 render flat | bottom-nav.tsx | Mobile nav density; likely beyond thumb comfort |
| 14 | **Toggle component is local to settings** (hand-rolled `role="switch"`) while a system `Switch` now exists | settings/page.tsx | Duplicate control implementations |

---

## 9. Responsive Behavior — `CURRENT`

- **Breakpoints**: Tailwind defaults; the operative edges are `md:` (sidebar appears, bottom-nav hides) and `lg:` (dashboard 2/3 split, stats grids, plan 7-col).
- **Sidebar**: hidden below `md`; collapsible (68px rail ↔ 240px) via store; no mobile drawer — mobile nav is bottom-only.
- **BottomNav**: 8 equal columns on phones; safe-area-inset respected; main content adds `pb-[calc(4rem+env(safe-area-inset-bottom))]`.
- **Grids**: `.auto-grid` (290/240/340px min) on card fields; dashboard/stat grids collapse to 1–2 cols; plan day-grid 1→2→7.
- **Tables**: `overflow-x-auto` wrappers (Table set + legacy).
- **Modals**: `p-4` viewport padding, `max-w-md` — fine down to 320px.
- **Flip card**: `min-h-[440px] sm:min-h-[500px]`, text `text-3xl sm:text-4xl` — tall cards on small screens; rating buttons 3-col even on mobile (tight but functional).
- **Charts**: donut fixed 220→260px; heatmap CSS-grid with `aspect-square` cells; bars flex — no cross-resolution data-density switch (`Potential problem`: hour-of-day histogram on narrow phones).
- **Typography**: fluid clamp scale prevents jumps.
- **Risk spots from code**: 8-item bottom nav on 320px (labels truncate); subjects hub rows (many chips) wrap heavily; exam setup two-col grid (`sm:grid-cols-2`) is fine but the sidebar-less mobile loses the group context.

---

## 10. RTL / Arabic — `CURRENT` (unusually thorough)

- **Mechanism**: `lang` pref → `<html dir="rtl" lang="ar">` set pre-paint (no-flash script) and by the store; `useT()` returns translated strings from a 995-line EN/AR dictionary (~470 keys).
- **Layout**: logical properties are used consistently in newer code (`ps/pe/start/end`, `border-e`, `ms-auto`); Tailwind logical variants throughout primitives. Arabic resets: letter-spacing zeroed on headings (Latin tracking harms Arabic), inputs `text-align: start`, `.rtl-flip` utility for directional icons (chevrons, arrows), `kbd` and `.ltr-inline` forced LTR inside RTL.
- **Numbers/dates**: `font-mono` tabular digits everywhere; locale-aware date formatting (`ar-EG` vs `en-US`) in the review page.
- **Mixed content**: markdown content renders in content language regardless of UI language (correct behavior); cloze masks and share payloads are UTF-8-safe (base64url with unescape/encode).
- **Gaps (potential "mirrored English" feel)**: micro-caps eyebrow labels use `tracking-widest` (mitigated by the RTL override to 0.02em but still a Latin idiom); some older components use physical classes (`left/right`, `ml/mr`) — grep shows `.loader-bar-fill` needed a physical RTL fix, indicating leftovers; empty-state illustrations are text-only (no directional imagery to fix). TTS reads English text with Arabic UI — acceptable but noticeable.
- **Fonts**: UI relies on system Arabic fallbacks (Noto Sans Arabic in the stack); **no dedicated Arabic webfont is loaded** — headings in Arabic will render in system Noto/Naskh rather than Inter's Arabic subset. `Unclear from current implementation` whether this is deliberate for weight reasons.

---

## 11. Accessibility — `CURRENT` (strong base, known gaps)

**Implemented:**
- Global `:focus-visible` ring (accent 2px offset-2) — never removed.
- Modal: portal, `role="dialog"`, `aria-modal`, focus trap (Tab/Shift-Tab cycle), focus restore, Escape, labeled close button (`t("common.close")` — a11y bug fixed during the design-system pass).
- Switch: real checkbox + `role="switch"`, `peer-focus-visible` ring.
- Select/Input/Textarea: real elements, label association via `useId`/htmlFor.
- IconButton: `aria-label` **TypeScript-required**.
- Nav: `aria-current="page"`, `aria-label` on landmark navs; bottom-nav items labeled.
- Tabs (review page, flashcards modes): `role="tablist"/tab`, `aria-selected`; flashcards mode tabs additionally use `aria-pressed` chips for exam scope selections.
- Flip card: `role="button"` + `aria-label` (show question/reveal answer); rating buttons carry `[1]/[2]/[3]` hints (visual only — `Gap`: no `aria-keyshortcuts`, and the keyboard handler is window-level without an announcement).
- Live regions: toasts `role="status" aria-live="polite"`; review-page period label `aria-live`.
- Hit targets: `.tap-target` (44px on coarse pointers), `.hit-target` expansion for small controls.
- Reduced motion: OS `prefers-reduced-motion` **and** in-app toggle (`data-reduced-motion`) collapse all animation/transition to 0.01ms; skeletons stop shimmering.
- Contrast: light themes explicitly tuned for AA; dark ramp is high-contrast by construction; accent-fg pairs dark text on bright accent.
- Charts: `role="img"` + `aria-label` on RingProgress/donut (`Gap`: bar charts/heatmap rely on `title` attributes only).

**Gaps:** no skip-link; heatmap cells are `title`-only (not focusable); window-level Space/1-3 shortcuts can hijack typing contexts (guarded by active-element checks in code but not by focus-scoped listeners); color-only status distinctions in some badges (mitigated by text labels mostly).

---

## 12. Motion System — `CURRENT` (every animation inventoried)

| Animation | Where | Trigger | Duration | Purpose | Reduced-motion |
|---|---|---|---|---|---|
| `page-enter` glide | every route via PageTransition | navigation | 400ms expo-out | continuity | killed |
| Staggered spring entrance | dashboard cards | mount | stagger 70ms, spring 260/20 | hierarchy reveal | killed |
| Sidebar active pill (`layoutId`) | sidebar | route change | spring 500/40 | state | killed |
| Bottom-nav pill | bottom-nav | route change | spring 500/40 | state | killed |
| Flashcards mode pill | mode tabs | tab switch | spring 500/40 | state | killed |
| 3D flip card | review session | click/Space | 600ms cubic | **the** interaction | killed |
| `modal-pop` | modals | open | 280ms overshoot spring | arrival | killed |
| rise/fall | toasts | in/out | 200ms | state | killed |
| Breathing conic halo | FocusZone ring | timer running | loop | liveness (state-communicating) | killed |
| `pulse-border` | due banner | due>0 | 2s loop | urgency | killed |
| `pulse-dot` | live indicators | active session | 1.6s loop | liveness | killed |
| shimmer | skeletons | loading | 1.6s loop | progress | → static |
| CountUp | stat numerals | mount/value change | ~1s | emphasis | `Unclear from current implementation` (anime.js path; likely killed) |
| Falling digits (`GravityFall`) | sessions timer | every second tick | spring 420/18 | playfulness | killed |
| Spotlight radial hover | hero bundle cards | hover | 300ms | delight | hover-only (no motion) |
| Retention/donut dash transitions | charts | data change | 600ms ease | comprehension | conditional (`reducedMotion` checks exist) |
| Hover lifts (`-translate-y-0.5`) | cards | hover | 200ms | affordance | killed |
| `word-rise` / `heading-reveal` | RevealHeading, ScrambleSubtitle | mount | 500–550ms | personality | killed |

No animation is purely decorative-without-dismissal: all loops communicate state (running/loading/due). The flip is the only large-scale 3D move and is strongly associated with "answer".

---

## 13. Information Architecture — `CURRENT`

**Actual IA (as coded):**

```
Shell (wallpaper · sidebar/bottom-nav · ⌘K palette · toasts · mini-player)
├── Insights group:  Dashboard (/) · Stats (/stats) · Study-time insights (/review ← misnamed)
├── Learn group:     Library (/subjects + /bundles + /flashcards) · Notes (/notes)
├── Practice group:  Review session (inside /flashcards) · Exam (/exam)
├── Focus group:     Plan (/plan) · Sessions (/sessions) · Goals (/goals)
├── Music:           Spotify (/sounds)
└── System:          Settings (/settings) · Offline (/offline) · Share (/share)
```

**Friction points (observed, not ranked):**
1. `/review` (time insights) sits in the same group concept as flashcard review, under the name "Review" — the single most confusable label.
2. Deck/card surfaces span three routes (`/subjects` hubs, `/bundles`, `/flashcards`) with overlapping capabilities; users can learn one path and never discover the others.
3. Bottom-nav exposes 8 destinations on mobile (code comment says the spec wanted 4 primary + overflow) — a gap between intent and implementation.
4. Settings is one long scroll (Appearance→Wallpapers→Interface→Data) — findable but heavy; no in-page nav.
5. Stats vs dashboard overlap (heatmap, weekly bars appear in both) — duplication reads as intentional (glanceable vs deep) but is unlabeled.
6. Resources (topic links) have no home — created via subject menus, browsable nowhere dedicated.

**Natural grouping the product already grew into** (for a redesign to formalize): Learn / Practice / Focus / Insights — with Dashboard as the always-visible command entry.

---

## 14. Dashboard Analysis

**Composition (verified):** an **overview + command center hybrid** with light recommendation-engine behavior — not an analytics page and not a task manager.

- Command: Next Action (engine-ranked single CTA), Study-all-due banner, FocusZone starter, Continue-studying resume.
- Overview: 4 stat cards (with zero→CTA inversion), weekly bars, 26-week heatmap, streak, recent sessions, subject chips, deadlines, upcoming goals, goals kanban summary.
- Analytics-lite: today's cards/minutes vs fixed goals (30 cards / 60 min — hardcoded in the page, `Unclear from current implementation` whether user-adjustable anywhere: it is not in settings).

**What it prioritizes:** (1) the next action, (2) due urgency, (3) today's momentum, (4) recent continuity, (5) inventory awareness. The user is expected to: start the recommended thing, or start a timer, or resume.

**Powering data:** `getDashboardStats` (counts, due, breakdowns, recent sessions), `getWeeklyAnalytics` (bars + deadlines), `getTodayProgress` (cards/minutes/streak), `getAllReviewLogs` (heatmap/streak), `getGoals` (upcoming), `getPlannerData → nextAction` (the card). All live-updating via Dexie live queries.

**Evidence of "one OS":** the Next Action card is the planner engine speaking on the dashboard; the due banner is the FSRS queue speaking; weaknesses surface through both planner and hubs. Three subsystems, one screen, one visual language.

---

## 15. Study Modes (focused experiences)

### 15.1 Flashcard Review — see §4.3. Controls: click/Space flip, 1/2/3 grade, TTS toggle, sprint toggle. Distractions: none (single-card stage). Completion: success panel + resumption options. Downstream: FSRS, logs, weakness, heatmap. Keyboard-first.

### 15.2 Exam Runner — see §4.4. Controls: option click or 3-button self-grade; exit confirm; countdown visible. No keyboard shortcuts beyond buttons (Space not bound) — `Gap/opportunity`. Progress: thin bar + n/total + answered count. Completion auto on time-out. Downstream: FSRS lapses, weakness, topic breakdown.

### 15.3 FocusZone (dashboard Pomodoro) — circular SVG ring with breathing halo, phase chips (focus/break/long-break with accent/flow/grow colors), presets (built-in + saved), soundscape picker (8 generated textures), remind-me control (tab-open-only notifications), task banner; logs sessions on completion; undo-able stop. Shares the exact engine with `/sessions`.

### 15.4 Speed Sprint — a review-mode modifier (not a page): 5s window per revealed card with danger countdown; auto-advances; aimed at cramming.

**Common pattern across all modes:** minimal chrome, one stage, state badges top, progress thin-bar, completion screen with explicit next actions. This pattern is the app's "study stage" and a redesign should keep it recognizable.

---

## 16. Data Ownership / Local-First — `CURRENT`

- **Storage**: Dexie 4 → IndexedDB, database `studymax`, 20 tables across 13 schema versions (all additive since v2; one table removed at v8 with two no-op recovery versions after).
- **Persistence & recovery**: `versionchange` closes cleanly for other tabs; unopenable DBs (Version/Upgrade/SchemaError) trigger `rescueBeforeReset` — a raw dump + rolling snapshot into a separate recovery DB before any reset, surfaced to the user (StorageGuard UI). A newer-on-disk schema opens read-compatibly (tested).
- **Offline**: service worker (network-first for pages, cache fallback, `/offline` fallback page, static precache); PWA manifest + icons; installable; pending-delete queue replays on reconnect with per-page sync chips; all features work offline except AI/TTS-proxy routes (graceful errors; TTS falls back to local voices).
- **Portability**: full JSON export/import (`exportAllData`/`importAllData`, versioned, additive import of old backups; excludes wallpapers/card-images by design); per-entity CSV/Markdown exports (notes, goals, cards); bundle share via URL hash.
- **Accounts**: none anywhere. No sync targets. `PLANNED / FUTURE`: any cloud/CRDT sync.
- **Network dependencies**: only AI routes (Gemini/Groq server-side), Spotify iframes, and the TTS proxy — everything else runs on-device.

---

## 17. AI Features — `CURRENT` vs `PLANNED`

| Feature | Status | Entry | Input | Output | Persistence | UI/UX notes |
|---|---|---|---|---|---|---|
| Note explanation | **CURRENT** | note detail | note content | streamed explanation | **persisted** on the note (`explanation`, `explanationUpdatedAt`) | streaming panel with regenerate/clear |
| AI card generation | **CURRENT** | notes list (per-note) + flashcards page (pasted text) | ≤8,000 chars of source text | parsed XML card list (Gemini 2.5 Flash primary, Groq fallback) | user prunes → `bulkCreateFlashcards` → real cards | modal with editable results; XML contract chosen deliberately for Arabic token-density robustness (documented in route comments) |
| Image analysis (`/api/ai/analyze-image`) | **PARTIALLY IMPLEMENTED** | route exists; UI entry `Unclear from current implementation` | image | analysis | — | likely groundwork for image occlusion |
| Rate limiting | **CURRENT** | all AI routes | — | per-IP limits | — | protects keys |
| Offline AI / WebLLM | **PLANNED / FUTURE** | — | — | — | — | not present |

---

## 18. What Makes OpenStudy Different (implementation-evidenced differentiators)

1. **A real closed loop**: exam mistakes demonstrably reschedule cards (e2e-proven), weakness recomputes from evidence, and one dashboard card speaks with the planner's voice. Most study apps silo these.
2. **Local-first without accounts**: the entire product works offline, installable, with disaster-recovery tooling (rescue DB) unusual for a study app.
3. **FSRS-4.5 with lazy migration**: modern scheduler with non-destructive SM-2 migration — rare in self-built SRS apps.
4. **Evidence-preserving exams**: question snapshots mean history stays explainable even after cards are edited/deleted — a data-model maturity signal.
5. **Deep bilingual RTL**: not a mirror-afterthought — logical properties, Arabic typography resets, UTF-8-safe sharing, locale dates.
6. **Personalized workload**: planner capacity is derived from the user's own session history, not a global default.
7. **Zero-server sharing**: deck sharing via URL hash — consistent with the no-backend philosophy.
8. **Wallpaper system with UI-opacity**: the interface itself becomes translucent to user imagery — a distinctive, themable identity layer.

The honest caveat for a redesign: the interconnection is real in the data, but **visually subtle** — hub chips, planner blocks, and the Next Action are small text affordances. Communicating the loop visually is the biggest untapped design surface.

---

## 19. Design Opportunities (post-documentation only)

### Critical (comprehension blockers)
- Resolve the `/review` naming collision (time-insights vs card review) in nav + page identity.
- Unify the three deck surfaces' visual grammar so "deck" looks like one object everywhere.
- Make the dashboard's 30-cards/60-min daily goals visible/configurable (they are currently hardcoded and unexplained).
- Give bottom-nav a real 4+overflow IA on mobile (8 flat items).

### High impact
- Formalize Learn/Practice/Focus/Insights groups across sidebar, bottom-nav, and headers.
- Migrate the 6 DIY modals + 10 raw selects + 47 accent buttons to the primitives (consistency + a11y).
- Visualize the interconnection: weakness chips that explain themselves ("why weak?"), planner blocks linking to their evidence, exam results linking to affected cards.
- Onboarding: turn the zero-state dashboard into an explicit 3-step setup flow.

### Polish
- Table set adoption in stats; PageHeader adoption everywhere; retire `!p-5` important flags; replace alias color classes with semantic tokens page-by-page; unify empty states on the state family; Arabic webfont decision (dedicated face vs system).
- Chart components unified (one bar/donut/line primitive) with consistent tooltips.

### Future (requires new functionality — design groundwork exists)
- Image occlusion UI (data model carries `regions`).
- Exam question navigator/flags, question-by-question feedback options.
- Cross-device sync (export/import UI could evolve into a sync surface).
- Configurable daily goals; streak-suspension/vacation; planner drag-reschedule.

---

## 20. Stitch Design Context (the brief)

### Product
OpenStudy — a local-first study OS: FSRS flashcards, notes, subjects/topics, exams, planner, weakness engine, focus timers, goals, analytics, in one offline PWA. Bilingual English/Arabic (full RTL). No accounts, no cloud.

### Users
Self-directed students (high-school → university → self-learners) who study daily, care about retention metrics, and often study in Arabic and English mixed. Power users live in keyboard shortcuts and trust their data staying on-device.

### Core workflows
1. Review due cards (flip → grade) — daily, keyboard-first.
2. Take an exam → see per-topic results → mistakes reshape the schedule.
3. Check the dashboard's Next Action and start it (review/practice/task).
4. Run a focus session (Pomodoro/stopwatch) with music or generated soundscapes.
5. Create material: subject → topic → note → cards (manual or AI).
6. Plan: read the 14-day workload, add/complete tasks.

### Information architecture
Sidebar groups: Learn (Library, Notes) · Practice (Review, Exam) · Focus (Plan, Sessions, Goals) · Insights (Dashboard, Stats) · Music · System (Settings). Mobile: bottom nav. Global ⌘K palette. Keep these groups; fix the `/review` mislabel; consider 4-item mobile nav + overflow.

### Visual identity (current, to be evolved not replaced)
"Quietly Premium": near-black neutral surfaces, hairline 1px borders, one hot accent per theme (12 themes; 2 light), JetBrains Mono numerals, micro-caps eyebrows, glass-like layer system (`glass`/`raised`/`inset`), restrained spring motion, one signature 3D flip. A redesign should keep: the instrument-panel calm, the numeric authority, the single-accent discipline, the study-stage pattern (minimal chrome, one card on stage), and the wallpapery translucency option.

### Design principles to preserve
1. Interconnection visible (state ripples across dashboard/hubs/plan).
2. Clarity & hierarchy before decoration (eyebrow → title → mono number).
3. One accent = action/attention; status colors carry meaning only.
4. Flat surfaces, 1px borders, layered elevation — no glassmorphism shine, no gradient noise.
5. Motion communicates state (running/loading/active); reduced-motion respected.
6. Fully bilingual RTL from the first sketch — logical layouts, Arabic type resets.
7. Keyboard-first study modes; 44px targets on touch.
8. Local-first honesty: data actions (export/import/delete) must feel safe and explicit.

### Things to avoid
- Generic SaaS dashboard clichés (rows of identical metric cards with icons + trend arrows); OpenStudy's cards are varied and purposeful.
- Playful childish accents (stickers, rounded crayon colors) — the tone is a focused instrument.
- Heavy gradients/neumorphism/glass shine; drop shadows as primary depth.
- Duplicating stat tiles between dashboard and stats without a clear "glance vs deep" distinction.
- More than one accent flood moment — the review answer face already owns it.
- 8-item mobile bottom navs; unlabeled icon-only nav.
- LTR-only layouts or tracking-heavy type in Arabic.

### Key screens (all CURRENT)
`/` dashboard · `/subjects` library hub · `/flashcards` (4 modes: review/browse/leeches/stats) · review session stage · `/exam` setup/runner/results · `/plan` 14-day planner · `/sessions` timers+history · `/goals` kanban · `/notes` list + `/notes/[id]` reader · `/stats` analytics · `/settings` (appearance/wallpapers/interface/data) · `/sounds` · `/share` · `/offline` · route error/loading states.

### Important components
Button (5 variants+loading) · IconButton · Card · Badge · Input/Textarea/Select/Switch · Modal · ConfirmDialog · Table set · EmptyState/LoadingState/ErrorState/SuccessState · Toast/UndoToast · RingProgress · Kbd · Skeleton · PageHeader · TopBar · Sidebar/BottomNav · CommandPalette · FocusZone · flip card · heatmap · donut · retention/forecast charts · bundle/subject identity (color+icon) · wallpaper layers.

### Data relationships (design-relevant summary)
Subject→Topic→{Notes, Bundles→Cards, Sessions, Tasks} · Card→{ReviewLogs→FSRS state, CardImages, ExamQuestions snapshots} · Exam→{Questions→grades→(lapses→FSRS + weakness)} · Weakness→{Planner blocks, hub chips, Next Action} · Sessions→{capacity, streak, analytics} · Goals→{milestones, dashboard upcoming, tasks} · All→{command palette, export/import, stats}.

### Responsive requirements
Desktop: persistent sidebar (collapsible), 12-col freedom. Tablet: sidebar collapsed rail, 2-col content. Mobile: bottom nav (aim 4+overflow), single column, sticky study-stage, tables → cards or horizontal scroll, 44px targets, safe areas.

### RTL requirements
`dir` flips globally; logical properties only; Arabic heading tracking resets; forced-LTR numerals/kbd; directional icons mirrored; locale-aware dates; test flip-card animation direction; share/paste content isolation (`dir=auto` candidates).

### Accessibility requirements
Visible focus ring always; modal trap/restore; labeled icon buttons; real form controls; `aria-current` navs; live-region toasts; 44px coarse targets; AA per theme incl. light themes; reduced-motion toggle + OS respect; keyboard-complete review and exam flows.

---

## 21. Screen-by-Screen Design Briefs

**Screen:** Dashboard (`/`)
Purpose: command entry + overview.
Primary user: returning student deciding what's next.
Primary action: start the Next Action / Study all due.
Secondary actions: focus timer, resume session, open any section.
Important information: due count, streak, today vs goals, next action with minutes estimate.
Related entities: FSRS queue, planner, weakness, goals, sessions.
Navigation: sidebar/bottom-nav/logo.
Visual hierarchy: action banner → progress ring/today → stat numerals → charts → lists.
Important states: zero-data (stat cards become setup CTAs), due pulse, loading skeleton.
Mobile behavior: single column, order preserved, bottom-nav.
RTL behavior: logical layout; Arabic greeting; mirrored chevrons.
Design notes: this screen must remain the place where all subsystems are visible at once — resist making it quieter than informative.

**Screen:** Library (`/subjects`)
Purpose: organize + reach everything material.
Primary user: student curating content.
Primary action: create subject/topic; enter a topic's review.
Secondary actions: manage bundles/resources, edit/delete with undo.
Important information: per-topic live counts, due badges, weakness chips.
Related entities: nearly all.
Navigation: sidebar Learn group.
Visual hierarchy: subject identity (color+icon) → topic hub rows (count chips) → actions.
Important states: empty (first subject CTA), delete confirms.
Mobile behavior: hub rows wrap; menus into sheets.
RTL: mirrored; Arabic names truncate-safe.
Design notes: densest screen; a redesign may split "manage" from "study" intents visually.

**Screen:** Cards workspace (`/flashcards`)
Purpose: review/browse/maintain cards.
Primary action: review due cards.
Secondary: create/edit (incl. images, kinds), import, bulk reset.
Important information: sync/offline chip, due counts, leech warnings.
Visual hierarchy: mode tabs → session stage / table.
States: per-mode empties; completion screen.
Mobile: tabs scroll; flip card full-height.
Design notes: the create modal is the widest form in the app — candidate for staged editing.

**Screen:** Review stage (inside /flashcards, deep-linkable)
Purpose: the daily SRS loop.
Primary action: reveal → grade (1/2/3 or tap).
Important information: queue/relearning badges, progress bar, sprint toggle.
Visual hierarchy: card is the only object; accent-flooded answer face.
States: bundle overview → running → completion.
Mobile: identical (this mode is mobile-first by usage).
RTL: cloze mask and flip direction must mirror.
Design notes: protect the zero-chrome stage; the flip is the brand moment.

**Screen:** Exam — setup
Purpose: configure a scoped, timed exam.
Primary action: start.
Important information: live pool size, practice toggle meaning, feeding explanation.
States: pool empty, history rows with delete confirm.
Design notes: chip-based scoping is fast — keep multi-select chips, not dropdowns.

**Screen:** Exam — runner
Purpose: answer under time.
Primary action: pick option / self-grade.
Important information: n/total, countdown (danger <60s), progress bar.
States: timeout auto-complete; exit confirm.
Design notes: deliberately minimal; a question navigator is future scope.

**Screen:** Exam — results
Purpose: understand performance; feel the loop.
Primary action: review wrong answers.
Important information: score, per-topic bars, fed-to-schedule note.
Design notes: per-topic bars are the weakness story — make the downstream effect explicit (e.g., "3 topics added to practice").

**Screen:** Planner (`/plan`)
Purpose: see and shape the next 14 days.
Primary action: add/complete tasks.
Important information: capacity, protected review minutes, weakness blocks, exam markers, overload warning.
States: no weakness/no tasks inline empties.
Mobile: day cards stack.
Design notes: the overload banner is safety-communication, keep it calm but unmissable.

**Screen:** Sessions (`/sessions`)
Purpose: time study; browse history.
Primary action: start/stop session.
Important information: mode, subject/topic, history filters.
States: save-retry error path.
Design notes: falling digits and phase colors are the personality carriers here.

**Screen:** Goals (`/goals`)
Purpose: manage long-term goals + todos.
Primary action: move cards (drag/touch buttons); edit.
Important information: horizon, status, due, repeat, milestone progress.
Design notes: two-horizon × 3-column kanban is information-dense; column headers carry counts.

**Screen:** Notes list + reader
Purpose: capture and study prose.
Primary action: create/edit; AI explain (reader); AI→cards (list).
Important information: tags, topic, pinned, explanation state.
States: streaming explanation; undo deletes.
Design notes: reader is the calmest screen; keep markdown typography generous.

**Screen:** Stats (`/stats`)
Purpose: deep analytics.
Primary action: change period.
Important information: KPIs (global), heatmap, retention, forecast, mastery, hardest cards.
Design notes: the only screen where tables + 5 chart types coexist; needs strongest hierarchy discipline.

**Screen:** Settings
Purpose: appearance/wallpapers/interface/data control.
Primary action: theme/lang/wallpaper; export/import.
States: import success/danger banners; upload validation toasts.
Design notes: wallpaper tab is the most visual part of the app's identity; uploads grid + sliders deserve the polish pass.

**Screen:** Share (`/share`)
Purpose: import a shared deck from URL hash.
States: reading / invalid / success.
Design notes: trust surface — show deck contents before import.

**Screen:** Offline & error boundaries
Purpose: graceful failure.
Design notes: keep the same state-family language (icon tile, title, body, action).

---

## 22. Final Quality Check — coverage statement

☑ Every route (19) · ☑ Major features (32 cataloged) · ☑ Workflows (7 journeys) · ☑ Components (primitive + chrome + charts) · ☑ Design system (tokens/themes/surfaces) · ☑ Visual language · ☑ IA · ☑ Data relationships (13 named edges) · ☑ Dashboard · ☑ Study modes (4) · ☑ Planner · ☑ Exams · ☑ Flashcards · ☑ Notes · ☑ Tasks · ☑ Goals · ☑ Analytics · ☑ Search (palette + per-page) · ☑ AI (2 current, 1 partial) · ☑ Settings · ☑ Onboarding (absence documented) · ☑ Backup/import/export · ☑ Offline/local-first · ☑ Responsive · ☑ RTL · ☑ Accessibility · ☑ Motion (17 inventoried) · ☑ Inconsistencies (14 located) · ☑ Opportunities (4-tier) · ☑ Stitch-specific context (§20).
