# Ahlan HSE

HSE (Health, Safety & Environment) management, inspection and assurance for tournament stadiums.

Venue Inspectors run checklist inspections and discipline-based observations with photo evidence,
and submit End-of-Day reports. Non-compliances become findings with corrective actions. HSE
Administrators review everything, manage users, stadiums and checklists, and generate Weekly,
Cumulative and End of Tournament reports.

> Step-by-step setup for a new machine (Roman Urdu): [`SETUP-GUIDE.txt`](./SETUP-GUIDE.txt).

---

## Getting started

```bash
# 1. Install
pnpm install

# 2. Environment
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env

# 3. Local services: postgres:5432, redis:6379, minio:9000 (console 9001), mailpit:8025
docker compose up -d
#    No Docker? A locally installed PostgreSQL works the same - create the
#    database and point DATABASE_URL in apps/api/.env at it, e.g.
#    postgresql://postgres:<password>@localhost:5433/ahlan_hse?schema=public
#    (the Windows installer picks 5433 when something already holds 5432).
#    Storage installed by hand (no minio-init)? Create the buckets once with
#    pnpm --filter api storage:init

# 4. Database
pnpm --filter api prisma migrate dev
pnpm --filter api db:seed

# 5. Chromium, for PDF rendering (once)
pnpm --filter api browsers:install

# 6. Run
pnpm --filter api dev            # http://localhost:3000, Swagger at /docs
pnpm --filter api dev:worker     # reports, AI, notifications, reminders
pnpm --filter mobile android     # builds and installs the dev client
pnpm --filter mobile start       # Metro, for an existing dev build

# Browser preview of the UI (no Android SDK needed). The default API URL is the
# Android emulator's, so point it at localhost for this one:
EXPO_PUBLIC_API_URL=http://localhost:3000 pnpm --filter mobile web
```

**Expo Go is not supported.** WatermelonDB, Skia and the camera are native modules, so the app only
runs in a dev build.

### Pointing the app at the API

| Target | `EXPO_PUBLIC_API_URL` |
|---|---|
| Android emulator | `http://10.0.2.2:3000` (the default) |
| iOS simulator | `http://localhost:3000` |
| Physical device | `http://<your-machine-LAN-IP>:3000` |
| Web (UI review only) | `http://localhost:3000` |

### Seeded logins

Password for all of them: `Stadium2026!` (see `apps/api/prisma/seed.ts`).

| Email | Role | Scope |
|---|---|---|
| `admin@ahlan.local` | HSE Administrator | everything |
| `inspector1@ahlan.local` | Venue Inspector | Lusail, Al Bayt |
| `inspector2@ahlan.local` | Venue Inspector | Al Thumama |
| `inspector3@ahlan.local` | Venue Inspector | Education City, Al Janoub |
| `pending@ahlan.local` | — | a pending access request; cannot sign in yet |

The seed deliberately leaves **today's** EOD reports unsubmitted, so the admin chase-up list has
rows, and spreads two weeks of inspections with an improving compliance trend so the dashboards and
reports have something real to show.

---

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test
```

`pnpm test:e2e` runs the API's Supertest suite against Postgres; it tells you what to start if
the database is not up. Point it at a throwaway database - each suite truncates every table:

```bash
DATABASE_URL='postgresql://postgres:<password>@localhost:5433/ahlan_hse_test?schema=public'   pnpm --filter api test:e2e
``` Maestro flows are in [`apps/mobile/.maestro`](./apps/mobile/.maestro).

---

## What is where

```
apps/
  api/                     NestJS, Node 22, TypeScript strict
    prisma/                schema.prisma, migrations, seed.ts
    src/common/            guards, the Zod validation pipe, the error envelope
    src/modules/           one module per domain (18 of them)
    src/queues/            BullMQ queue + job names
    src/worker.ts          the background worker entry point
    test/                  Supertest e2e specs
  mobile/                  Expo SDK 57, Expo Router, TypeScript strict
    app/(auth)/            login, access request
    app/(inspector)/       the Venue Inspector workspace
    app/(admin)/           the HSE Administrator workspace
    src/components/        the design system
    src/db/                WatermelonDB schema, models, sync
    src/features/          feature logic and hooks
    src/i18n/              en.json, ar.json
    .maestro/              end-to-end flows
packages/
  shared/                  Zod schemas, enums, KPI formulas, the status machine
```

### The parts worth knowing before you change anything

**`packages/shared` is the contract.** Compliance %, the finding status machine, the EOD window rule
and every request schema live there, and both the API and the app import them. That is why the figure
on an inspector's phone matches the figure in the PDF, and why the app can never offer a status
change the server will refuse. Changing a formula or a transition there changes both sides at once —
which is the point, and why those files have the heaviest test coverage.

**Offline is the normal case, not a fallback.** Inspectors work in stadium basements. Every field
record is written to WatermelonDB first with a device-minted UUID v7, and synced afterwards; each row
shows its own sync state. `POST /sync/push` does not write rows directly — it rebuilds the normal
submit payload and hands it to the same service an online submit uses, so a record that arrives
through sync goes through identical rules (a `NO` still needs a photo, the EOD window still applies,
compliance is still recomputed server-side).

**Photos never pass through the API.** The device compresses to ~1600px JPEG, stores the file
locally, then asks for a presigned PUT and uploads straight to object storage. Uploads run *before*
the record push, because the API rejects a `NO` whose photo has not landed yet.

**Admin screens are deliberately online-only.** They read the API through React Query. The
aggregates span a whole tournament, and report generation and AI review are server-side by design,
so caching them on a phone would add a sync surface for no benefit.

**Nothing long-running happens in a request.** Report PDFs and AI insights are BullMQ jobs. Run
`dev:worker` alongside the API, or leave `QUEUE_CONCURRENCY` non-zero to process them in-process
during development.

**AI output is never published automatically.** The model only ever sees aggregated figures from our
own database, the snapshot it was given is stored alongside the insight, every insight is labelled
AI-generated, and an administrator has to approve one before it can appear in an official report.
`AI_PROVIDER=local` is the development default and makes no network calls at all, so the whole
pipeline works without a key.

---

## Current state

| Area | State |
|---|---|
| `packages/shared` | Complete. 85 tests across KPI maths, the status machine, EOD windows, decimals, UUID v7, time zones and schemas. |
| API | All 18 modules implemented, with guards, the audit trail, queues, the PDF renderer and Swagger. 70 unit tests. 119 routes; Swagger documents 98 paths. |
| Mobile | Both workspaces, the design system, offline sync, photo pipeline, i18n (en/ar), light/dark/high-contrast. 37 tests; three Maestro flows. |

### The design system

The UI is built around one brand identity, applied through tokens only:

- **Brand: midnight navy, royal blue, safety gold.** Navy-to-royal gradient
  hero surfaces carry the moments that matter (sign-in, the day's compliance
  figure, the admin headline); royal blue is the action colour; safety gold -
  the colour of HSE signage - is the signature accent on the logo, the
  compliance ring and highlight pills. Gold is decorative only and never
  encodes a status.
- **Status colours** (success, amber warning, crimson danger, info) were run
  through a palette validator in both modes rather than chosen by eye; red and
  amber stay distinguishable at normal vision, and every status also carries a
  text label so colour-blind users lose nothing.
- **Logo.** A safety shield, a stadium roofline and a check, drawn once in
  `assets/brand/mark.svg`. The `LogoMark` component renders the same geometry,
  and the app icon, Android adaptive icon, splash and favicon are rendered from
  it (`assets/brand/*.png`) - one drawing everywhere.
- **Motion.** Screens assemble with a short staggered rise-and-fade
  (`Appear`), the compliance ring sweeps to its value, progress and metric bars
  glide, the active tab grows a springy indicator pill, and buttons and cards
  compress on press. Everything runs on the UI thread and honours the OS
  "reduce motion" setting. Entrances use shared values rather than Reanimated's
  `entering` layout animations, which on web can leave content permanently
  hidden.
- **Inter** is the only typeface, one named file per weight, so a weight
  renders identically on iOS, Android and web.
- **One centred column** (600px, 840px for dashboards) so the same screens
  hold together in a desktop browser.

### What has actually been run

The stack now runs against a locally installed **PostgreSQL 18** (the machine has
no Docker). The committed migration applied cleanly, the seed produced the demo
tournament, and the API serves the full surface against it. **The whole e2e suite
- all 52 tests across auth, inspections/findings/scoping and EOD - passes against
real Postgres**, including every behavioural check the earlier WASM stand-in
could not carry.

Before that, the first bring-up used [PGlite](https://pglite.dev) - real Postgres
compiled to WebAssembly - served over the wire protocol. On that:

- the committed migration **applied cleanly** and the seed produced 140
  inspections, 181 findings and 65 EOD reports
- the API booted and served the full surface; Swagger rendered at `/docs`
- the rules were driven over real HTTP: the approval gate, stadium scoping in both
  directions, role gates, a `NO` rejected without a photo and accepted with one,
  the finding it raises (`F-BYT-00041`, CRITICAL from the item default), locking,
  an audited admin correction, the whole corrective-action lifecycle to `CLOSED`
  including the admin-only and closure-evidence rules, the EOD window in all four
  states, one-report-per-inspector-per-day, and fixed-point man-hours
  (`192.00 + 88.50 = 280.50`)
- the dashboard aggregates were checked by hand: `530/(530+142) = 78.87%` with the
  80 NA answers excluded, and `8 × 200000 / 40104 = 39.9` for the incident rate
- the **auth e2e suite passes 17/17**

The app itself was then run and driven in a browser. Expo's web target is a
**UI-review build, not a shipping platform** - the camera, SQLite JSI, haptics
and SecureStore have `.web` stand-ins beside them, and Skia is drawn with SVG
instead of CanvasKit - but it renders the real screens, components, design
tokens, themes and translations against the real API. Both workspaces were
walked through end to end: sign-in, the inspector home, inspections, findings
and a finding detail, End of Day, settings, all three themes, Arabic with RTL,
and the administrator's dashboard, access requests and reports. Six of the
defects in the table below came out of that pass and nothing else had found
them.

```bash
pnpm --filter mobile web      # http://localhost:8081
```

Two things PGlite could not carry, which are stand-in limits rather than app
defects:

- the **inspections e2e suite** fails in its `beforeEach`, every failure a
  `Server has closed the connection` or `unexpected message from server` from the
  WASM wire protocol - zero assertion failures, so it never reaches a behavioural
  check. The EOD suite gets 11-12 of 14 through before the same thing happens.
- the heavy dashboard needs `connection_limit=1` to survive, because
  `KpisService.dashboard()` fans out roughly 190 mostly-concurrent queries on a
  30-day, 5-stadium window (`trend()` alone issues four per day, and
  `byStadium`/`byDiscipline` recompute a full summary per row). Real Postgres
  serves it, but this is the first thing to profile before 500 users.

**Run `pnpm test:e2e` against the docker Postgres to get a real result.**

### Bugs that running it found

| Where | What |
|---|---|
| `common/guards/jwt-auth.guard.ts` | `handleRequest` discarded the error `JwtStrategy.validate()` threw, flattening `TOKEN_REVOKED`, `ACCOUNT_SUSPENDED` and `ACCOUNT_PENDING_APPROVAL` into a generic `UNAUTHENTICATED`. The app maps codes to localised copy, so a suspended user read as "please sign in again" and the pending-approval message could never reach anyone. Fixed, with a regression test. |
| `queues/enqueue.ts` (new) | BullMQ requires `maxRetriesPerRequest: null`, so with Redis down `queue.add` never settles and the request **hangs** rather than failing - the `try/catch` around it never fired. Every enqueue now races a 5s deadline: notifications degrade quietly, a report request tells the admin. |
| `prisma/seed.ts` | The seed wrote finding references directly but never seeded `reference_counters`, so the first finding raised through the API collided with `F-<CODE>-00001`. Any seeded environment - the demo and the e2e suite - broke on its first real finding. |
| `babel.config.js` | WatermelonDB's decorated fields used `!`, which Babel rejects, so the app did not bundle at all. The definite assignments are gone and `strictPropertyInitialization` is off for this package; the config explains why the class-properties plugin cannot be enabled globally or scoped with `overrides`. |
| `test/jest-e2e.json` | The regex escape was mangled into invalid JSON, so the e2e suite could not even be parsed. |
| Throttling | The e2e suite signs in dozens of times a minute and tripped the deliberately tight login limit, failing on 429 instead of on its assertions. Throttling is now configurable and off under `NODE_ENV=test`. |
| `app.config.ts` | Expo's own validation caught `newArchEnabled` and top-level `splash` being gone in SDK 57, and an iOS deployment target below the required 16.4. |
| `theme/theme-provider.tsx` | **Dark and high-contrast mode never reached the stylesheet.** `global.css` declares those tokens under `.dark:root` and `:root[data-theme='…']`, but nothing ever set either, so every surface stayed on the light tokens while `usePalette()` handed components the dark ones - a dark-mode browser drew near-white icons on a white card. `applyDocumentTheme()` now writes the resolved theme to the document root (a no-op on native), and `darkMode: 'class'` was missing from the Tailwind config, which also made NativeWind reject the theme toggle outright. |
| `components/kpi-card.tsx` | The compliance ring's animation was dead code: `useAnimatedStyle` returned a constant `opacity: 1` and never read the shared value it was driving, so the arc snapped. It now animates `strokeDashoffset` through `useAnimatedProps` on an animated `Circle`. Its percentage label was also an absolute child with no insets, so it sat at the corner rather than in the middle. |
| `modules/sync/sync.service.ts` | The first pull returned records in the `created` bucket while the client syncs with `sendCreatedAsUpdated`, which is a two-way contract - WatermelonDB logged a diagnostic error on every pull. Everything now goes in `updated`, which it creates locally anyway. |
| `app/(inspector)/findings/[id].tsx` | The row labelled "Discipline" showed the finding's *source*, so a Work at Height finding read "Discipline: Inspections". It now resolves the real discipline and shows the source on its own row. The empty corrective-action state was a muted caption reading "Assign corrective action" - a call to action for something an inspector cannot do - now a proper empty state explaining that an administrator assigns it. |
| `app/(inspector)/index.tsx` | The compliance card reused the checklist-progress string, rendering "4 of 2 answered" from inspections-today over stadium-count. The date beside it was formatted with the platform default locale, so an Arabic session showed an English weekday; the same applied to "last synced at". |
| `src/db/models/*` | **No model declared `static associations`**, so the first `@children` access or `Q.on` join threw ("relation that's not has_many") - answering the first checklist item crashed the inspection screen, on any platform. |
| `modules/sync/sync.service.ts` | **Every synced inspection was rejected.** The mapper's `str(x) ?? undefined` was dead code (`str` never returns null), so a device null arrived at the schema as `''` and `responses[].severity` failed the enum - failing the whole inspection. Optional fields now map through `optStr`. |
| Sync protocol | Responses sync ahead of their draft inspection, so by submit time they were marked synced and the submitted inspection arrived child-less - "responses: at least 1 element", forever. Submit now forces the children back into the same push; a rejected inspection re-dirties them for the retry; and the server checks idempotency **before** validation so a re-send of something it already holds is a no-op, not an error. |
| `src/db/sync.ts` | Marking a record SYNCED re-dirtied it, so every sync re-pushed what the previous sync had just accepted, indefinitely. The bookkeeping write now stays out of sync tracking. Rejections are also applied after the sync session (inside it, WatermelonDB counted the write as already-pushed and the record never retried), and the catch that swallowed marking errors now logs. |
| `components/*` web renderer | A `className` on a Reanimated `Animated.View` is dropped on web: metric-bar fills had zero height and the segmented thumb vanished. Both are styled inline now. `Alert.alert` is a silent no-op on web, which made Sign out and every submit confirmation a dead button - all dialogs go through a `confirmDialog`/`infoDialog` helper with a browser fallback. |
| `shared/schemas/common.ts` | GPS `accuracyM` was capped at 10 km, so a browser's IP fix - or a basement cell-tower fix - rejected the entire record to protect a diagnostic field. The bound now only rejects garbage. |
| `hooks/use-location.ts` | Starting an inspection awaited a GPS fix with **no deadline** - a permission prompt nobody answered, or a basement with no fix, left the inspector unable to start work at all. Capture now uses a recent last-known fix when there is one and gives up after 6s; the record is stored without a location rather than not at all. |
| `test/helpers.ts` + `setup-e2e.ts` | Test users' emails were built from the **head** of a UUIDv7 - the timestamp half, identical for ~65 s - so every user seeded in a run collided. Suites also assumed a clean database but never cleaned it; setup now truncates per suite. With both fixed, the full e2e suite runs green on real Postgres. |

### Not yet done

- **The app has not been built onto a device.** It bundles, lints, typechecks and
  its tests pass, but `expo run:android` has never run here - there is no Android
  SDK on this machine - so Gradle, pods and WatermelonDB's JSI setup are
  unverified. That is the main remaining risk.
- **Admin screens for users, stadiums and checklist authoring** are not built. The
  API endpoints exist and are tested; the mobile screens are not. Checklist
  authoring in particular wants a web admin rather than a phone form.
- **MinIO was never running**, so the presigned PUT and `/evidence/:id/complete`
  (which HEADs the object before trusting it) are unexercised. Presigning itself
  works - it is a local signature.
- **Redis was never running**, so no BullMQ job has been processed: no report PDF
  has been rendered and no AI insight generated. The PDF template has only been
  reviewed as HTML.
- **Push notifications** are wired end to end but have never been sent to a real
  device token.
