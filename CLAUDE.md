# QAGC Platform — Project Instructions

You are working on the QAGC platform: the quality-assurance and governance
platform of مركز ضمان الجودة والحوكمة (People with Disabilities Sector, MOH
Oman). The owner and Director General is the DG; this repository is the
platform's single source of truth AND its live site. Read this file fully
before touching anything — it replaces a long build history you cannot see.

## What this repository is

- `app/index.html` — **the platform itself**: one self-contained HTML file
  (~1.3MB) that is both the source code and the deployed page at
  https://qagc-platform.github.io/app/. There is no build step. Editing this
  file and pushing IS deploying (GitHub Pages CDN lags ~10 minutes; verify
  with a cache-busting query `?cb=...` and tell the user to hard-reload).
- `assistant/Code.gs` — the Google Apps Script API ("the bridge") deployed
  as a web app under the qagcplatform@gmail.com account. The repo copy is
  canonical; deployment is manual (see protocol below).
- `assistant/openapi.yaml` + `assistant/gpt-instructions.md` — the Custom
  GPT's Action schema and instructions ("ChatGPT bridge"). The real
  deployment URL is baked into the yaml; the API key is NEVER in the repo —
  it replaces `PASTE_KEY` only inside the user's ChatGPT.
- `tests/`, `tour/` — the AI test matrix (25 tests) and the beta
  walkthrough, static pages sharing the platform's visual identity.
- `index.html` (root) — deliberately a blank green page for the uninvited.
- `privacy.html` — real bilingual privacy policy (required by Google OAuth).

## Editing protocol for app/index.html — follow exactly

1. **Targeted replacements only.** Use python with exact-match replaces that
   `assert count == 1` before writing. Never regenerate or reformat the file.
2. **After every edit**: extract the last `<script>` block and run
   `node --check` on it. Never push syntactically unverified code.
3. **Test in a real browser before pushing**: serve the folder locally
   (`python3 -m http.server`), sign in (demo accounts below), and exercise
   the changed path end-to-end. For bridge features, stub `window.fetch`.
4. **Known hazards** (each has bitten before):
   - The whole app is one IIFE of `var`s: never call a function at load time
     before the data it reads is declared (hoisting gives `undefined`).
   - `bi(ar, en)` returns HTML with two `<span lang>` elements — assign it
     with `.innerHTML`, never `.textContent` (47 messages once rendered as
     raw markup because of this). Never use `bi()` inside SVG or input values.
   - New STAFF entries need the FULL shape (`dir`, `role`, `taken`,
     `balance`, `since`, `steps`, `desig`) — missing `dir` once crashed the
     platform at load, silently killing every later module.
   - Dynamic screens (Approvals) repaint their headings; owner wording is
     re-applied via `czReapplyHead(id)` — call it in any new draw that
     rewrites `.head` content.
   - Content from the assistant renders with `dir="auto"` per line (mixed
     Arabic/English bidi).
5. **One declared today**: `PLATFORM_TODAY` ("2026-11-20") governs every
   date computation. Never call `new Date()` for "now" — use `platformNow()`.
6. **Bilingual always**: every visible string is `bi(ar, en)` or paired
   `span[lang]` markup. Arabic is primary; English must be real, not filler.
7. **Persistence pattern**: device-level stores in localStorage —
   `qagcSession`, `qagcAiCfg` (bridge key — sensitive), `qagcCustom`
   (wording/order), `qagcPrivs`, `qagcAwards`, `qagcOwnerCfg` (rules,
   weights, criteria, hours), `qagcPlanSheet`, `qagcAiHidden`. The
   settings screen exports/imports all of them as one JSON. Work data
   (submissions, plans, 360 cycles) is in-memory by design until the thin
   backend exists — never promise it persists.

## Apps Script deployment protocol — the ritual that always works

1. Edit `assistant/Code.gs` in the repo first, commit, then copy the WHOLE
   file into the single `Code.gs` at script.google.com (QAGC account).
2. If the change adds Google scopes: Run ▶ any function touching the new
   service, approve consent as the QAGC account (Advanced → Allow).
   The manifest (appsscript.json) already declares spreadsheets, calendar,
   drive, script.scriptapp; timeZone Asia/Muscat.
3. Deploy → **Manage deployments → pencil ✏️ → New version → Deploy**.
   **NEVER "New deployment"** — that mints a new URL and breaks everything.
4. Probe: `…/exec?key=KEY&fn=changes` → `{"ok":true,…}` = live.
   The one deployment URL ends `…s_s1-5R8wvPQmQIQxgg`.

## Security rules — non-negotiable

- The API key never enters the repo, a commit message, or a chat. It lives
  in the GPT instructions and users' devices only.
- Roles/permissions are enforced client-side: this is an explicitly
  declared DEMO boundary (stated on the sign-in gate). No real sensitive
  data before the server backend exists.
- The staff names come from published Ministerial Decision 128/2026; no
  other personal data may be added to this public repo.
- Google Sheets are currently link-editable (flagged to tighten); the
  DG-calendar privacy (busy-only for 🔒 events) is enforced server-side in
  Code.gs — keep it there, never move it to the client.

## Product philosophy — decisions already made, do not relitigate

- One approval gate: objectives/KPIs/budgets enter as PACKAGES, decided
  component by component by the DG; the assistant proposes, never decides.
- The ChatGPT bridge pushes six kinds (objective/task/agenda/pdp/digest/
  report) plus CPD activities; everything dated is clash-checked; named
  owners pre-select assignees; nothing enters untagged.
- Line managers decide their team's development requests; the DG oversees
  and comments on everything.
- The owner (DG) customises wording in place (edit mode), reorders the rail
  (drag or arrows), tunes the performance-score weights, the 360 criteria,
  leave rules, working hours — all persisted. Maximising her autonomy is a
  standing goal.
- Demo sign-ins: `dg`, `coord` (نبيلة الصبحي), `dir.gov` (حمود العامري),
  `sd.head` (رحمة الراشدي) — password `qagc2027`. The 2FA demo code is
  displayed inside the verification dialog.

## Visual identity

Paper `#f7f3ea`, deep green `#14522e`, gold `#8a6a1f`; Arabic-first RTL;
IBM Plex Sans Arabic body, Noto Kufi Arabic display on companion pages.
Gold = tentative, theme green = confirmed (CPD and calendars).

## Current state (2026-08-21) and open items

Everything in the repo is live and browser-tested: packages with action
plans, KPI grid + two-way Google Sheets sync + AI analysis, DG & centre
calendars with privacy and clash detection, meetings from my-calendar,
Training & Development hub (CPD + 3 plan tiers), 360°, performance score,
weekly digest + compiled bilingual reports (.doc), roster from Decision
128/2026, owner customisation + settings export/import.

Open, in priority order:
1. **Thin backend** — the one big remaining step: real persistence for work
   data, real accounts/TOTP, server-side roles. The legacy repo
   (QAGC-platform/QAGC) holds the intended storage/ledger modules.
2. The DG's own Custom GPT setup on her account (schema + instructions from
   this repo; fresh chat to test; matrix at /tests).
3. Her Google-calendar share (`QAGC_DG_CAL` property) if not yet done.
4. P2 audit backlog: unified "today queue" on the command centre, inline
   comment fields (replace prompt()), decision-log export, GAS objectives
   fed from exportPlan instead of the hand-copied five, read/write key
   split, Sheets sharing tightened to named accounts.

## Working with the user

The DG (or her husband, the platform's builder) gives short, direct
requests, often several at once, in Arabic-mixed English. Build, verify in
the browser, publish (push), and summarise honestly — including what was
NOT done and any caveats. When she reports a bug, reproduce it before
fixing. Log significant decisions briefly in commit messages; they are the
project's memory.
