# Run doc — OpenStudy (Next.js 16 + Turbopack)

Worktree: `/home/zer0/Desktop/Projects/OpenStudy` (main checkout)
Package manager: **npm** (`package-lock.json` is the only lockfile — do not use pnpm/yarn/bun)

---

## 1. Reproduce the uncommitted artifacts

A fresh checkout needs these before the server is useful. All are PROCEDURES — no secret
values belong in this file.

### 1.1 Dependencies

```bash
npm install
```

`node_modules/` is already present in the main checkout; only run this in a new worktree.

### 1.2 Environment file

```bash
cp /home/zer0/Desktop/Projects/OpenStudy/.env.local .env.local
```

- **Copy, never symlink.** The values are per-environment and a symlink would make a
  worktree silently share (and mutate) the main checkout's config.
- Skip it for a different worktree only if you already know the values; otherwise copy.
- What breaks without it: `/api/ai/*` returns 503 `NO_API_KEY`, and
  `/api/spotify/{search,playlist}` falls back to iTunes previews. Every other page works,
  because data is local-first (Dexie/IndexedDB) and needs no server.
- `.env.local` is git-ignored. `.env.example` is tracked and lists all five variables the
  code actually reads — use it as the contract, not this doc.
- **Never commit `.env.local`.** Keys live there, not here.

### 1.3 Nothing else

No codegen, no database, no migration step. IndexedDB is created in the browser on first
load.

---

## 2. Run the server

```bash
npm run dev -- -p 3000
```

Two things that will otherwise waste your time:

- **Pass `-p 3000` explicitly.** `npm run dev` with no port, and even `PORT=3000 npm run dev`,
  can auto-select a random free port in this environment. The `--` is required to forward the
  flag through npm.
- **Detach with `setsid`, not just `nohup`.** `nohup … & disown` gets reaped when the command
  runner exits, so the server dies seconds after starting:

```bash
LOG=/home/zer0/Desktop/Projects/OpenStudy/.freebuff/preview-<id>.log
{ setsid nohup npm run dev -- -p 3000 > "$LOG" 2>&1 < /dev/null & echo "pid=$!"; disown; }
```

Then confirm it survived and answers:

```bash
sleep 8; pgrep -af next-server          # expect a `next-server (v16.3.4)` line
curl -s -o /dev/null -w "%{http_code}\n" --max-time 40 http://localhost:3000/
```

Ready in ~200ms once `Ready` appears in the log. Ports: 3000 is the project default and is
usually free; if taken, pick another and use it consistently for the preview URL.

Register the preview with the **`next-server` child pid**, not the npm wrapper pid.

---

## 3. Known gotchas in this app

### 3.1 First visit to a route shows the loader for a while

Each route has a `loading.tsx` whose `PageLoader` is the Suspense fallback. On a cold
Turbopack compile the streamed page HTML arrives inside `<div hidden id="S:n">` and stays
hidden until client hydration swaps it in — visible as a permanent "Loading OpenStudy…" plus
dimmed content. **Re-navigate to the URL once and it renders.** Confirmed on `/settings`:
first load stayed hidden past 8s, an immediate re-navigation rendered fully in ~500ms. Not a
code defect — `curl` shows the complete page (200, slider markup present) on the first try.

### 3.2 "Found a local backup" banner

`StorageGuard` shows a non-blocking banner when `localStorage['studymax:autobackup']` exists
but IndexedDB has no subjects/bundles. On a fresh origin this appears on the *second* page
load, because the first load writes the auto-backup 2.5s after mount. It is expected, has no
dismiss button, and clears once data exists. Do not "fix" it by deleting storage — that may
be the user's real study data.

### 3.3 IndexedDB is origin-scoped — port changes reset the app's data

Dev server storage is keyed by full origin (scheme + host + **port**), so each new port looks
like a brand-new empty install. Browsing the same app on `127.0.0.1:P` vs `localhost:P` is
*also* two different origins with two separate databases.

### 3.4 A stale higher-version database bricks every data page

If an origin already holds a `studymax` database at a **higher schema version** than the code
declares (the code currently maxes at `version(10)` in `src/lib/db.ts`), Dexie throws
`VersionError: The requested version (10) is less than the existing version (100)` and every
Dexie-backed page hangs on skeletons forever, with no error in the UI. Diagnose with:

```js
indexedDB.databases()   // in the page console
```

Fix by using a different origin (new port or other loopback hostname) — **not** by deleting
the database, which may hold real data.
