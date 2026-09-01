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
   **Gender-neutral always** (her ruling, beta 24): never address the
   reader with a gendered verb or pronoun (no اكتبي/اضغطي/أدخلي, no
   لكِ/أنتِ). Use nominal or passive phrasing — «تشغيل التحرير ثم النقر»,
   «يلزم المفتاح أولاً», «تُضاف القراءات» — or «يمكن …». Role titles that
   name a specific person (المديرة العامة) stay as they are.
7. **Persistence pattern**: device-level stores in localStorage —
   `qagcSession`, `qagcAiCfg` (bridge key — sensitive), `qagcCustom`
   (wording/order), `qagcPrivs`, `qagcAwards`, `qagcOwnerCfg` (rules,
   weights, criteria, hours), `qagcPlanSheet`, `qagcAiHidden`,
   `qagcNotes` (review-mode comments), `qagcGen` (the objective
   generator's objectives — drafts and approved, versioned; bump `v` in
   gxSave/gxLoad whenever the seed shape changes so browsers re-seed). The
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
- Five login roles, one line: `staff` → `head` (department) → `dir`
  (directorate) → `dg`, with `coord` off to the side. The chain lives in
  `SUPERIOR`; a submission carries `supTo` so "sup" resolves to the right
  endorsing desk. A department head decides her department's leave and
  development, endorses upward, never approves a budget — budgets are the
  DG's alone. Her scope is computed from her own `dep`, not a hard-coded
  list, so a second head needs no new code.
- **The organisational structure is data, and it orders everything.** `ORG`
  in app/index.html is the centre's hierarchy as the DG stated it: her
  office and قسم التنسيق والمتابعة report to her directly, then دائرة
  الرقابة والامتثال, دائرة الحوكمة ومعايير الجودة وتطوير الخدمات, دائرة
  الاعتماد والتراخيص, each with its two departments in her order. Never
  hand-write a unit list again — `DEP_ORDER` is derived from `ORG`, and
  `orgRank()` / `planRank()` / `byOrgDep()` order the roster, the register,
  the annual plan and the exported report. A unit not in `ORG` sorts last
  and is flagged on /org rather than folded into a neighbour — a flag that
  means "ask her", never "guess". قسم التدقيق was resolved that way: she
  ruled it IS قسم الرقابة, so AUD is now that department's plan code.
  The roster's names in QARAR128 were transcribed loosely from Decision
  128/2026; she confirmed the correct forms — دائرة الرقابة والامتثال (not
  …المؤسسي) and قسم الاعتماد والتصنيف (not التصنيف والاعتماد).
- Review mode (rail toggle, `qagcNotes`): she clicks any element on the live
  platform and pins a comment to it. A note stores the screen, the nearest
  card heading and the element's own visible text, so it stays meaningful
  even when the thing it pointed at is gone. "Copy all for Claude" emits one
  markdown block grouped by screen — that is how her feedback reaches me
  until the backend exists. Two rules it depends on: read element text with
  `rvText()`, never `textContent` (bi() leaves both languages in the DOM),
  and remember that changing screen only toggles a class, so the pins are
  repainted from a nav click as well as from the MutationObserver.
- **Review notes loop (bridge-backed)**: "Send via the bridge" POSTs unsent
  notes to `fn=addFeedback` on the GAS bridge (they land in a `feedback`
  sheet, shared across every device); sent notes carry a `fid` and show
  "أُرسلت ✓". The panel's "Shared board" button pulls `fn=feedback` and
  shows every note with its state; "عُولجت" calls `fn=resolveFeedback`.
  **Claude sessions close the loop**: if a gitignored `.qagc-key` file
  exists at the repo root — or, failing that, at `~/.qagc-key` (one line:
  the API key — the user creates it, it is NEVER committed), read notes
  with
  `curl '<exec-url>?key=$(cat .qagc-key)&fn=feedback'`, act on the open
  ones **addressed to development** (`to` is `dev` or empty — notes with
  `to: dg` are for the DG herself; leave them alone), then mark each `{"fn":"resolveFeedback","id":…,"state":"done",
  "reply":"<one line saying what was done>"}` via POST. Without the key
  file, ask the user to paste the notes instead. Never print the key.
- The review-board Artifact
  (`claude.ai/code/artifact/9fa37a24-5104-4db7-bb72-2c726689bd82`) remains
  the FALLBACK when no bridge key is configured on the device: the send
  carries notes in the URL fragment and the board saves them on her click.
  **Before ever republishing that artifact from a local file, WebFetch it
  first and merge the notes it already holds into the file** — a plain
  republish silently discards everything she sent. Its state lives in
  `<script id="rv-data">`.
- The owner (DG) customises wording in place (edit mode), reorders the rail
  (drag or arrows), tunes the performance-score weights, the 360 criteria,
  leave rules, working hours — all persisted. Maximising her autonomy is a
  standing goal.
- Demo sign-ins: `dg`, `coord` (نبيلة الصبحي), `dir.gov` (حمود العامري),
  `sd.head` (رحمة الراشدي — department head), `sd.staff` (عبدالناصر الهادي —
  her one report) — password `qagc2027`. The 2FA demo code is displayed
  inside the verification dialog. The last two share قسم تطوير الخدمات on
  purpose: they are the demo's line-manager pair.

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

**مولّد الأهداف (beta 27)** — rail screen `#gen`, code prefixed `gx*` at
the end of the IIFE: the objective as a row on a fitted calendar
(year/quarter/month/week), phases and steps nested in strict periods,
scope and assignment from `STAFF`/`ROLE` by line of management (DG and
coordinator reach everyone), KPI cards on the MoH guideline's Appendix 6
with plan-driven auto-drafting, and a readings feeder (on-site table with
formulas/pivot, CSV drop, Sheet link). One department objective per
directorate is seeded as an editable draft and one directorate objective
per directorate as approved/tracked with ready readings and steps
assigned to real heads and staff. Access: drafts only to their drafter
(`S.by`); approved ones to the DG's office (track), the owning line
(track + verify), and assigned staff (feed only). Completion dates,
expenses and verification are entered in the feeder and feed the
completion KPIs; drafts carry no readings. Every «هدف جديد» button
opens the generator; tracked objectives get a «المتابعة» tab in the
annual plan. Submitting a draft is in-memory until the backend exists.
Beta 30 additions: every roster member has a demo account (username =
roster id m1…m20, same password) and the rail's "view as" can pick a
person; the annual plan's «المتابعة» tab embeds the generator's own
timeline (`gxEmbedDraw`, `.gx-scope` styles) and its KPI tab the same
KPI panel (`gxKPlanHTML`); the readings tool sits on the KPI card and is
build-only until approval; chart types line/bars/dots/area; each KPI
exports a one-slide PPTX written by `gxPptxBuild` (store-only zip +
minimal OOXML, validated with python-pptx — keep the part set intact).

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

## Definition of done — in this project, pushing IS deploying

This repo has standing authorization to publish: a platform change is not
finished until it is committed and **pushed** — the push is the deployment
to the live site. The full cycle, every time:

1. `git pull --rebase` before starting (two people work on this repo).
0. **Bump the version stamp** with any app/index.html change: the
   `<meta name="qagc-ver" content="beta N">` tag near the top of the file
   (increment N). The running platform re-fetches its own first bytes and
   shows every user an update banner when the deployed stamp is newer —
   an unbumped push means nobody is told to reload.
2. Edit → `node --check` → verify in a local browser.
3. Commit with a message that explains the decision (commit messages are
   the shared project memory) and **push without waiting to be asked**.
4. Tell the user it is live, that the CDN lags ~10 minutes, and to
   hard-reload. If the push is rejected (non-fast-forward), pull --rebase
   and push again; if it fails with an auth error, the machine needs
   `gh auth login` once with an account in the QAGC-platform org.

The only changes that still wait for explicit confirmation: anything in
`assistant/` that requires a manual Apps Script redeploy (say so plainly),
and anything that would publish new personal data.

## Working with the user

The DG (or her husband, the platform's builder) gives short, direct
requests, often several at once, in Arabic-mixed English. Build, verify in
the browser, publish (push), and summarise honestly — including what was
NOT done and any caveats. When she reports a bug, reproduce it before
fixing. Log significant decisions briefly in commit messages; they are the
project's memory.

## Attestation chain (beta 32)
Feeding is restricted to the step's assignee or the plan owner (`gxCanFeedStep`). An entry goes «إرسال للتوثيق» to the feeder's own line manager (`gxVerifierOf`: staff → department head → director → DG; the DG has none), who verifies or returns with a note. No manager override except the DG, with a recorded reason (`t.override`). Plans scoped «هدفي», and anything fed by the DG, are self-attested (`verifiedBy:"self"`). Progress and charts count verified entries only; pending shows as a hatched bar / `+n%` / `⏳` on the «المهام والأهداف» badge. KPI readings: manual rows carry `fd.meta[r]={pending,verified,by}`; Google-Sheet rows are system-sourced and skip verification. The manager's queue (`gxQueue`, `#mineVerifyQ`) is rendered outside `#gen`, so its `[data-gxvq]` handler is a page-wide listener. Seed is `qagcGen v:9`: approved directorate objectives belong to their director (`S.by`), seeded readings are pre-verified.

## Edit lock on approved objectives (beta 35)
Approved objectives — including their KPI cards, milestones and thresholds — are read-only (`gxEditable`/`gxRO`). Only the plan owner can request an edit (`S.editReq={by,at}` via «طلب تعديل»); the request lands in the owner's line manager's queue (`gxQueue` kind `editreq`, rendered in `#mineVerifyQ`) for approve/decline. Approval sets `S.editGrant` + `editGrantBy` and unlocks editing until the owner clicks «إقفال التعديل». Personal objectives (scope `mine`) are excluded — their owner always edits. The DG at the top of the chain unlocks her own plans immediately. Feeding results (the feeder pane and its verification chain) is never locked. KPI pane lock = `.gx-klock` class hiding save/auto/new/delete and disabling card fields.

## Work mail — operational highlight lane (beta 36)
Distinct from review mode (which is build feedback): highlight any content text, right-click → `#qcm` menu routed by the business object under the selection (`ibResolve`: generator rows/embeds/plan panes → objective `S`, step `t`). «ملاحظة» goes to the step assignee or objective owner (`ibRecipient`); «اقتراح لجدول أعمال» always goes to the coordination department (`ibCoord`, dep matching التنسيق); «نسخ مع المرجع» copies quote+ref. Items live in localStorage `qagcInbox` v1 (demo boundary — bridge lane pending). Inbox card `#mineInbox` sits directly under `#mineMode` in «المهام والأهداف» (both modes), with reply / acknowledge / open-source (marks read). Attention: gold floating strip `#ibStrip` (bottom) while unread, `.badge.ib` on the mine rail button, sign-in spotlight `#ibSpot` (also fired from module init for restored sessions — the boot path runs before the module loads). `applyRole` is wrapped to refresh attention on any role/person switch. Debug hooks: `window.__ib`. Senders see read receipts («فُتح»/«لم يُفتح بعد») in the «ما أرسلتُه» details.
