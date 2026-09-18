# Ruvren

**A local-first Study OS — FSRS flashcards, notes, subjects/topics, exams, planner, weakness engine, focus timers, goals and analytics in one interconnected, offline PWA.** Bilingual English/Arabic (full RTL). No accounts, no cloud — your study life lives in your browser's IndexedDB.

> **Note on the name:** Ruvren was previously developed as "OpenStudy" / "StudyMax". Only user-facing branding changed. The Dexie database name (`studymax`), `openstudy.*` localStorage keys, the `openstudy-sync` export format tag, and the `.studymax-bundle.json` share extension are **intentionally unchanged** so existing installs keep their data and old backup/share files keep importing.

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | Adaptive "Next Action" hero (priority engine), due-card widget, daily review heatmap, streak counter, Focus Zone Pomodoro |
| **Library** | Subjects → topics → decks, per-subject progress, custom color + icon pickers, FSRS review runner |
| **Flashcards** | FSRS-4.5 scheduler (Again/Hard/Good/Easy), card images, cloze & multiple-choice kinds, leech detection |
| **Exams** | Timed or untimed, scoped to subjects/topics, auto-graded choice questions, per-topic breakdown, wrong answers feed real FSRS state |
| **Planner** | Day-by-day plan from due reviews, weakness practice, tasks and exam dates — with capacity, horizon and study-day settings |
| **Weakness Engine** | Deterministic signals from review history + exam mistakes drive practice and the planner |
| **Notes** | Markdown notes linked to subjects; AI import generates flashcards |
| **Sessions** | Focus sessions linked to subject/topic/task/goal; completing one closes the task |
| **Goals** | Kanban goals with milestones |
| **Stats** | 52-week heatmap, retention curve, hardest cards, forecast, per-bundle mastery |
| **Data ownership** | Full export/restore, rolling local backups, per-device sync foundation (export/merge by file), tombstoned deletes |
| **Offline-first** | Dexie/IndexedDB — everything lives in the browser, works without internet |
| **PWA** | Installable app with manifest + offline fallback route |

## 🎨 Design System

Ruvren's visual identity: **Sora** typeface; palette `#0A84FF` (primary) · `#0B1220` (dark) · `#1E293B` (surface) · `#F8FAFC` (light); the "Knowledge Flow" connection-line pattern (the default live wallpaper); and the RUVREN — *Your Knowledge OS* lockup. All tokens are CSS custom properties consumed through Tailwind v4 `@theme` (`src/app/globals.css`), catalogued in `src/lib/themes.ts`. The default "Aurora" and Light themes carry the brand; the other ten themes are intentional variety. A deeper, code-grounded design X-ray lives in [`OPENSTUDY_STITCH_DESIGN_CONTEXT.md`](OPENSTUDY_STITCH_DESIGN_CONTEXT.md).

## 🧱 Tech Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Dexie.js** (IndexedDB — local-first data)
- **Zustand** (UI state)
- **GSAP** + **Framer Motion** + **anime.js** (motion)
- **Tailwind CSS v4**
- **Zod** (validation)
- Fonts: Inter, JetBrains Mono, Plus Jakarta Sans, Space Grotesk

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No account, no server — data stays in your browser.

## 📄 License

MIT — see [LICENSE](LICENSE).
