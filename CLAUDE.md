# CLAUDE.md — OpenFit Project Context

## What is OpenFit?
Full-stack open-source fitness platform. Connects wearables via Health Connect + BLE (Android only), tracks workouts (strength, runs, jiu-jitsu), displays health analytics. Multi-tenant — each user has their own data, devices, and programs.

## Tech Stack
- **Monorepo**: Turborepo with npm workspaces
- **API**: Fastify v5 + TypeScript + Prisma + PostgreSQL (port 3001)
- **Web**: Next.js 15 App Router + Tailwind + Recharts (port 3000)
- **Mobile**: React Native + Expo SDK 52 (bare workflow) + Expo Router (Android only)
- **Shared packages**: `@openfit/types` (Zod schemas), `@openfit/db` (Prisma), `@openfit/fitness-core` (pure business logic), `@openfit/ui` (shared components)

## Node Version
This project requires **Node 20+**. Use `nvm use 20` before running commands.

## Key Commands
```bash
npm run dev           # Start all apps in parallel
npm run dev:api       # API only
npm run dev:web       # Web only
npm run dev:mobile    # Mobile only
npm run test          # Run all tests
npm run build         # Build all packages and apps
npm run db:generate   # Generate Prisma client
npm run db:migrate    # Run Prisma migrations
npm run db:seed       # Seed database with test data
```

## Mobile Development
```bash
# Prerequisites
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME=$HOME/Library/Android/sdk

# Connect phone for dev
adb reverse tcp:3001 tcp:3001   # Tunnel API to phone (run each time phone is plugged in)

# Build and run on device
cd apps/mobile
npx expo prebuild --platform android
npx expo run:android

# After prebuild, android/build.gradle may reset minSdk — check gradle.properties has:
# android.minSdkVersion=26
# android.compileSdkVersion=35
```

### Mobile Build Notes
- **Expo SDK 52** with React Native 0.76, React 18.3
- **Android SDK 35** required (install via Android Studio SDK Manager)
- **Java 21** from Android Studio JBR
- **minSdkVersion 26** required by Health Connect
- **No `.js` extensions in imports** — Metro bundler can't resolve them. Use extensionless imports in all shared packages.
- **MainActivity.kt** must register `HealthConnectPermissionDelegate.setPermissionDelegate(this)` in `onCreate`
- **BLE permissions** (BLUETOOTH_SCAN, BLUETOOTH_CONNECT) must be requested at runtime on Android 12+
- **Splash screen**: `android/app/src/main/res/drawable/splashscreen_logo.xml` must exist after prebuild
- **Prebuild manifest quirk**: `react-native-health-connect`'s config plugin pushes an `ACTION_SHOW_PERMISSIONS_RATIONALE` intent-filter without dedup, so every `expo prebuild` adds another duplicate. After each prebuild run `git diff apps/mobile/android/app/src/main/AndroidManifest.xml` and delete any duplicate intent-filter. Avoid `--clean` (nukes MainActivity.kt + splash drawable). `apps/mobile/android/` is gitignored but the manifest and MainActivity are force-tracked — use `git add -f` to commit changes to them.
- **react-native-svg** is a dependency (used by `TodayScoresHeader` rings). Installed via `expo install`; auto-linked by prebuild.

## Architecture Decisions
- **Auth**: Custom JWT with access (15min) + refresh (30d) token rotation. No third-party auth provider. See `apps/api/src/services/auth.service.ts`.
- **Multi-tenancy**: Every DB query scoped to `userId` from JWT. Never query user data without filtering.
- **Token storage**: Mobile stores refresh token in `expo-secure-store` (native keychain). Web uses `of_session` cookie for middleware + in-memory access token. Access token always in memory only.
- **Session restore** (mobile): On app launch, `_layout.tsx` exchanges stored refresh token via `/auth/refresh`, then fetches `/auth/me` for user profile.
- **Offline sync** (mobile): SQLite-backed queue via expo-sqlite, auto-flush on foreground. Not fully tested yet.
- **Two ORMs**: Prisma for PostgreSQL (server), Drizzle for SQLite (mobile). Prisma doesn't support RN SQLite.
- **Unified activity model**: A single `WorkoutLog` with a `type` enum (`strength | run | jiu_jitsu`) holds every trained activity. Run fields (`distanceMeters`, `durationSeconds`, pace, elevation) and `gpsPoints` are nullable; `exerciseLogs` is empty for non-strength. Adding future types (cycling, yoga, hiking) is a one-line enum change. No separate `RunSession` model.
- **Energy estimation**:
  - **BMR** via Mifflin-St Jeor (`packages/fitness-core/src/bmr.ts`) using weight + height + age + sex. Used by the Today tab to derive active daily calories as `TotalCaloriesBurned − bmrCaloriesElapsed(BMR, now)` — the same definition Zepp/Garmin/Whoop use.
  - **Workout calories** via Keytel et al. 2005 (`packages/fitness-core/src/calories.ts`) — a sex-specific regression that maps HR + weight + age to kcal/min. Integrated over the workout's HR samples (uneven sample gaps handled). A MET-based fallback exists for activities without HR.
- **Daily wellness scores** (`packages/fitness-core/src/scores.ts`): transparent published composites, not Zepp reverse-engineering.
  - **`sleepScore`** — 5-component composite: 0.35 · duration + 0.15 · efficiency (docks 5 pts/awakening past the 2nd) + 0.15 · deep-ratio (squared below the 13–23 % sweet spot, 0 at lo/2) + 0.15 · REM-ratio (same curve, 20–25 % sweet spot) + 0.20 · regularity (7-day bedtime stddev; 0 min → 100, 180 min → 0). Missing components renormalise the remaining weights. Default duration target 480 min (8 h). Tuned on 2026-04-23 against Zepp on Bob's data — within ~5 pts.
  - **`effortScore`** — PAI-style. Integrates %HRR (Karvonen) over 24 h HR samples with 5 intensity tiers (<40/40–60/60–80/80–90/≥90 % → 0/1/2/3/4 pts·min). Daily target 100 intensity-minutes → 100. Max HR via Tanaka (`calculateMaxHR`). Device-off gaps >10 min are dropped so idle-strap windows don't fake activity.
  - **`readinessScore`** — weighted composite (0.30 HRV + 0.20 RHR + 0.30 Sleep + 0.20 Load). HRV / RHR scored vs 7-day baselines with "at baseline = 70" anchor. Recent load = last 3 days of earned effort minutes, exponentially decayed (yest ×1, −2d ×0.6, −3d ×0.3). **Intraday drain**: `todayEarnedMinutes × 0.15` capped at 30, subtracted after the weighted mean — matches Zepp's "BioCharge empties as you train" behaviour. Returns `{ score, calibrating, components }`; score → 50 + `calibrating: true` when < 3 days of baseline.
  - **`personalisedEffortTarget`** — daily target from RHR + HRV + age (no VO2max needed). Formula: `20 + max(0, (68−RHR)·0.4) + max(0, (HRV−30)·0.2) − max(0, (age−35)·0.3)`, clamped [20, 120]. On a fit 36yo (RHR 47, HRV 64) = 35; matches Zepp's observed target within ~3 pts. Falls back to 50 when RHR or age is missing.
- **User profile**: `weightKg`, `heightCm`, `sex`, and `dateOfBirth` are required fields. Height isn't needed for Keytel but is needed for BMR, and both are needed so future workouts / runs log real calorie numbers.

## Project Structure
```
apps/api/         — Fastify backend (auth + full CRUD for workouts/health; no separate runs endpoints — runs are WorkoutLog rows)
apps/web/         — Next.js dashboard (auth, dashboard with Recharts, program builder)
apps/mobile/      — Expo app (auth, today stats, unified Workout tab with Strength/Run/Jiu-Jitsu picker, history)
packages/types/   — Zod schemas + TypeScript types (all domain types + input schemas)
packages/db/      — Prisma schema + seed script (2 users, 10 exercises, 3 programs, 60 daily-health rows, 16 strength logs, 12 run logs)
packages/fitness-core/ — Pure business logic (HR zones, pace calc, ACWR, BMR, Keytel calories, sleep score) + Vitest tests
packages/ui/      — Shared React components (scaffold only)
```

## API Endpoints
```
POST   /auth/register        — Create account
POST   /auth/login           — Login, returns tokens + user
POST   /auth/refresh         — Rotate tokens
POST   /auth/logout          — Revoke refresh token
GET    /auth/me              — Get user profile (authenticated)

GET    /workouts/programs     — List user's programs (nested weeks/sessions/exercises/sets)
GET    /workouts/programs/:id — Get single program
POST   /workouts/programs     — Create program
PATCH  /workouts/programs/:id — Update program name
DELETE /workouts/programs/:id — Delete program
POST   /workouts/programs/:id/swap-exercise — Replace an exercise across every week of a program (body: { sessionName, orderIndex, newExerciseId })
GET    /workouts/exercises    — List all exercises
GET    /workouts/logs              — List user's activity logs (strength + run + jiu-jitsu); ?type= filter
GET    /workouts/logs/:id          — Get single log (with exercises OR GPS + HR, depending on type)
POST   /workouts/logs              — Create activity log; type required; run fields + gpsPoints for type=run
PATCH  /workouts/logs/:id          — Update mutable fields (completedAt, caloriesBurned, run fields)
DELETE /workouts/logs/:id          — Delete log

GET    /health                — List user's daily health records
GET    /health/:date          — Get single day
POST   /health                — Upsert single day
POST   /health/bulk           — Bulk upsert (up to 90 days, for mobile sync)

GET    /coach/profile          — Get stored CoachingProfile (or null)
PUT    /coach/profile          — Save / replace CoachingProfile
POST   /coach/generate-program — Generate a 5-week mesocycle via Claude (Sonnet 4.6) and persist as Program + ProgramGeneration
POST   /coach/adjust-session   — Apply deterministic readiness-based adjustment to a stored session

POST   /nutrition/analyze              — Vision analysis of a meal photo (base64 in JSON, max 8MB body)
POST   /nutrition/logs                 — Confirm an analysis as a FoodLog (or log manually with analysisId=null)
GET    /nutrition/logs?from&to         — List FoodLogs in a date range, ordered loggedAt desc
GET    /nutrition/logs/:id             — Single FoodLog
PATCH  /nutrition/logs/:id             — Update items / mealType / loggedAt; totals recomputed server-side
DELETE /nutrition/logs/:id             — Delete log
GET    /nutrition/photos/:userId/:fn   — Authenticated photo retrieval (URL userId must equal JWT userId)
GET    /nutrition/targets              — Current MacroTargets or null
PUT    /nutrition/targets              — Save / replace MacroTargets
```

## Testing
- `packages/fitness-core`: 135 Vitest tests (heart rate zones, pace, ACWR, BMR Mifflin-St Jeor, Keytel calories, sleep / effort / readiness scores, personalisedEffortTarget, AI coach prompt builder + readiness-based session adjuster, nutrition macro aggregation + calorie balance)
- `apps/api`: 66 Vitest tests (auth, unified workout CRUD, health, multi-tenancy, CoachService prompt-input gathering + Anthropic call mocked + retry-on-validation-failure + GeneratedProgram → CreateProgramInput resolver + program-wide exercise swap propagation + equipment-filter assertion, NutritionService vision retry + photo multi-tenancy + log CRUD + macro targets)
- Run with: `cd apps/api && npx vitest run` or `cd packages/fitness-core && npx vitest run`
- Total: 201 tests passing

## Database
- PostgreSQL via Docker: `docker compose up -d`
- Connection: `postgresql://openfit:openfit@localhost:5432/openfit`
- After starting DB: `npm run db:migrate && npm run db:seed`
- Seed includes: 2 users (Alice f/65/165, Bob m/80/180), 10 exercises, 3 programs, 60 daily-health rows (30/user), 16 strength `WorkoutLog` rows + HR samples (8/user), 12 run `WorkoutLog` rows + Marseille GPS + HR samples (6/user). Every workout log has `caloriesBurned` computed from HR via Keytel.

## Wearable Integration (tested on Galaxy S26 Ultra + Amazfit Helio Strap)
- **Passive data**: Helio Strap → Zepp app → Health Connect → OpenFit (via react-native-health-connect)
- **Live HR**: Helio Strap → BLE GATT 0x180D → react-native-ble-plx → useRealtimeHeartRate hook
- **GPS**: Phone GPS via expo-location (foreground only)
- Health Connect permissions checked on mount via `getGrantedPermissions()`, requested manually via button
- BLE resubscribes to HR notifications on app foreground (Android suspends them on background)

## Completed Phases

### Phase 0 — Foundation (done)
Monorepo, types, fitness-core, Prisma schema, auth API + tests, web auth pages, mobile auth screens.

### Phase 1 — Core Features (done)
- Workout CRUD API (programs, logs, exercises)
- Run tracking API (GPS points, HR samples)
- Health sync API (single + bulk upsert)
- Web dashboard with Recharts (today, workouts, runs, health, program builder)
- Mobile workout screen (program browser, set logging, live BLE HR from Helio Strap)
- Mobile run screen (background GPS via expo-task-manager foreground service, timer with pause/resume)
- Mobile history tab (expandable workout/run cards, MapLibre route maps with Marseille seed data)
- Mobile Health Connect integration (daily stats on Today tab, permission flow)
- Session restore on mobile (refresh token + profile fetch)
- BLE Helio Strap live HR during workouts (with foreground/background resilience)
- Run screen redesign: avg pace, current pace, current HR, avg HR, distance, time

### Phase 1.5 — Testing & Polish (done)
- Full mobile app tested on Galaxy S26 Ultra with Amazfit Helio Strap
- Health Connect ↔ Zepp integration confirmed working (steps, calories, HR, HRV, sleep)
- BLE HR confirmed working during workouts
- Background GPS confirmed working (expo-task-manager foreground service)
- Auth flow: login, register, session restore, logout all working
- MapLibre maps with OpenFreeMap tiles (no API key), route glow + start/end markers
- Seed data: 6 realistic Marseille running routes (Corniche, Vieux-Port, Borély, Calanques, Prado, Panier)

### Phase 2.1 — Today tab data validation (done)
Compared every Today-tab metric against Zepp (source of truth) and Health Connect (raw storage) via on-device screenshot triangulation.
- **Steps**: `aggregateRecord('Steps')` instead of summing raw records (avoids double-counting when phone pedometer + Zepp both write overlapping windows). OpenFit matches HC exactly.
- **Sleep**: `getSleepSummary` now returns session bounds + `durationMinutes = sessionSpan − awakeMinutes` (matches Zepp's "time asleep," not "time in bed"). Fixed a `Math.round` vs `Math.floor` bug on the hours display. OpenFit matches Zepp exactly.
- **Active calories**: Zepp writes only explicit workouts to `ActiveCaloriesBurned`, so reading it gave a big undercount. Switched to Mifflin-St Jeor BMR ourselves (Zepp doesn't write `BasalMetabolicRate` to HC) and compute `active = TotalCaloriesBurned − bmrCaloriesElapsed(BMR, now)`. Within ~15 % of Zepp's number (expected — their proprietary BMR variant differs; Mifflin is the clinical consensus default).
- **Resting HR**: switched to `aggregateRecord('RestingHeartRate').BPM_AVG`. 1-bpm delta vs Zepp's trend chart is a Zepp-side smoothing step we can't reach — we faithfully report what HC contains.
- **HRV**: no aggregate API exists, so we now average all `HeartRateVariabilityRmssd` records **within the sleep session window** (fallback: 22:00 prev → 08:00 current). Matches Zepp. Individual RMSSD samples bounce 40–100 ms per minute — mean is the meaningful value, last-sample was arbitrary.
- Added `heightCm` and `sex` (male/female) to `User` model with a new `Sex` enum, exposed through register / `/auth/me`, required on registration.

### Phase 2.2 — Today tab rework, Slice 1: Sleep score (done)
First of three Zepp-style wellness rings shipped on the Today tab.
- **Sleep score algorithm**: published composite (see Architecture Decisions / `scores.ts`). 18 Vitest tests covering duration, efficiency, stage sweet spots, realistic night scenarios.
- **UI**: new `TodayScoresHeader` + reusable `ScoreRing` components (`apps/mobile/src/components/`). Three rings side-by-side: Sleep (blue, lit), Effort (orange, "Soon"), BioCharge (green, "Soon"). Old "Recovery" grid card removed — the header replaces it.
- **Data flow**: `getDailyStats` now computes `sleepScore` from the already-parsed stage breakdown and stamps it into the returned `DailyHealth.sleepScore`. No DB persistence yet (deferred to Slice 3 when readiness needs the history).
- **Dep added**: `react-native-svg` for the arc rings.

### Phase 2.2 — Today tab rework, Slice 3: BioCharge + personalised target (done)
All three rings live. Data flow:
- New `getTodayDashboard(profile)` in `healthConnect.ts` — single entry point that pulls the last 7 days of stats from HC, derives HRV + RHR baselines, computes readiness, and rescales effort against a personalised target (`max(30, median(7d earned) × 1.5)`).
- `useDailyStats` now calls `getTodayDashboard` instead of single-day `getDailyStats`.
- `DailyHealth.recoveryScore` holds the readiness score (persistable); `effortEarnedMinutes` is a new Float? column used for the rolling median.
- First run (<3 baseline days): readiness returns `{ score: 50, calibrating: true }`. The green ring shows 50 with tier `CAL.` (ScoreRing's new `tierOverride` prop) and caption `X/7 days`.
- Sequential 7× HC reads make the first Today-tab load ~2 s. Not optimised yet; bulk-sync via `/health/bulk` is a natural follow-up if it becomes annoying.

### Phase 2.2 — Today tab rework, Slice 2: Effort score (done)
Second ring lit. PAI-style algorithm in `scores.ts`, data flow:
- Schema cleanup: `DailyHealth.strainScore` (unused, 0–21 Whoop scale) renamed to `effortScore` (0–100 Zepp scale). One-column Prisma rename; migrations aren't versioned in this repo, so `cd packages/db && npx prisma migrate dev` regenerates locally.
- `getDayHRSamples(date)` flattens Health Connect `HeartRate` record samples into `EffortHRSample[]` for the integrator.
- `getDailyStats` computes effort alongside sleep; requires user profile (age → Tanaka max HR) and resting HR, else null.
- UI: orange ring in `TodayScoresHeader` now renders `today.effortScore`.

### Phase 2.3 — Unified workout model + Jiu-Jitsu type + HR calories (done)
Bigger than the originally-scoped jiu-jitsu addition: consolidated the entire activity data model.
- **Data model**: deleted `RunSession` entirely. A single `WorkoutLog` with a `WorkoutType` enum (`strength | run | jiu_jitsu`) holds every trained activity. Run fields (`distanceMeters`, `durationSeconds`, pace, elevation) and `gpsPoints` are nullable; `exerciseLogs` can be empty for non-strength. `HeartRateSample` and `GPSPoint` FK now points at `workoutLogId` directly. Seed migrated.
- **API**: `/runs/*` endpoints removed. Everything flows through `/workouts/logs` with an optional `?type=` filter. New `PATCH /workouts/logs/:id`.
- **Calories**: new `packages/fitness-core/src/calories.ts` with Keytel et al. (2005) — sex-specific HR-based regression giving kcal/min. `computeCaloriesFromHRSamples` integrates over the workout's samples with median-gap padding for the last interval. Every workout screen computes calories on finish and includes it in the POST payload; every history card shows it.
- **Mobile navigation**: the `Run` tab is gone. The `Workout` tab is now a 3-card picker (Strength / Run / Jiu-Jitsu) that routes into `workout/strength.tsx`, `workout/run.tsx`, `workout/jiujitsu.tsx`. History is a single unified list with type-chip filtering (All / Strength / Run / Jiu-Jitsu) and per-type card rendering (sets+volume / map+pace / duration+HR).
- **Jiu-Jitsu**: new `workout/jiujitsu.tsx` — start button auto-connects BLE, timer + live HR + avg/max, pause/resume, save → POST with `type='jiu_jitsu'`.

## What's Next (Phase 2)

### 2.2 — Today Tab Rework (done)
All three rings shipped across slices 1–3. Philosophy remained: transparent published algorithms, not Zepp reverse-engineering. Computed on mobile, not server.

### 2.4 — AI Coach (in progress)
Bevel-style integrated coach that generates personalised mesocycles from the user's
goals + recent activity + readiness, then adjusts each session for today's BioCharge.
Architecture: ~10 % LLM (program generation, called once per cycle), ~90 % deterministic
fitness-core logic (daily adjustments, load balancing). LLM = Claude Sonnet 4.6 via
Anthropic SDK, structured output via tool-use trick constrained to `GeneratedProgramSchema`.

**Slice 1 — schemas + pure logic (done)**
- `@openfit/types/coach.ts`: `CoachingProfile`, `GeneratedProgram` (mirrors Program/Week/Session
  shape but adds `phase`, `rationale`, `loadPctOf1RM`), `CoachPromptInput`,
  `CoachAdjustmentContext`.
- `fitness-core/coach-prompt.ts`: pure `buildCoachPrompt()` returning `{ system, user }`.
- `fitness-core/coach-adjust.ts`: pure `adjustSession()` rule engine — readiness-driven
  volume cuts (<40 / <55), boost (>85) only during intensification, never during deload.

**Slice 2 — backend integration (done)**
- Prisma: `User.coachingProfile Json?`, new `ProgramGeneration` model (1:1 with `Program`,
  stores raw LLM output + prompt input + model name for traceability + future regeneration).
- `apps/api/services/coach.service.ts`: `gatherPromptInput()` (DB → CoachPromptInput, computes
  ACWR + top 1RMs via Epley + 7d readiness avg + 30d activity counts), `generateProgram()`
  (calls Claude, validates with Zod, retries once on parse failure, persists Program +
  ProgramGeneration), `adjustSessionForToday()` (loads stored generation, applies rule
  engine with phase awareness), `resolveGeneratedProgram()` (strips coach metadata,
  resolves `loadPctOf1RM` × user 1RM → kg rounded to 2.5).
- Anthropic structured output via tool-use: hand-written JSON Schema mirror of
  `GeneratedProgramSchema` (kept manually since `zod-to-json-schema` isn't a dep).
- Routes: `GET/PUT /coach/profile`, `POST /coach/generate-program`, `POST /coach/adjust-session`.
- `ANTHROPIC_API_KEY` env var required for live generation; service constructed with
  placeholder when missing in test mode.

**Slice 3 — mobile entry point (done)**
- New `Coach` tab between `Workout` and `History`.
- `apps/mobile/src/services/coach.ts` — typed wrappers around `/coach/profile`,
  `/coach/generate-program`, `/coach/adjust-session`.
- `(tabs)/coach.tsx` — full CoachingProfile editor (goal, experience, sessions/duration
  pickers, equipment / emphasis chip multi-select, secondary-sport rows for jiu-jitsu
  and running, injury notes textarea), Save and Generate-Program CTAs, and a
  generated-program preview with phase chips per week and per-exercise rationale lines.
- The persisted `Program` already renders in the existing `Strength` screen — no new
  program-execution surface needed.

**Slice 4 — guided session execution UI (done)**
Reworked the active strength-session screen so coach-generated programs are
actually usable. Issue: the original `isActive` view was free-form (single
input + library chip strip) and ignored the prescription entirely.
- `workout.store.ts` now also holds `plannedExercises: PlannedExerciseSpec[]`
  and `sessionName` when started from a saved Session. Free workouts pass
  empty array.
- `useRestTimer` hook (`apps/mobile/src/hooks`): start/skip/adjust/setRemaining,
  vibrate at 0, foreground-only (good enough for typical 1–3 min lifting rests).
- `workout/strength.tsx` active view: header with session name + elapsed +
  X/Y-sets pill, kept HR card, editable rest timer card (±15/±30s, skip,
  vibrates at zero), then a vertical list of planned-exercise cards. Each
  set row is `pending` (greyed) / `current` (inline reps/weight/RPE inputs
  pre-filled from the prescription + plan reminder + Log Set button) /
  `completed` (green check + actual values). Logging the current set
  auto-advances and starts the rest timer using `restSeconds` for that set.
  Tap any card to refocus it (manual override of auto-advance). Free-workout
  flow falls through to the original input form unchanged. No images/videos
  (Exercise model has no asset URLs).

**Slice 4b — polish from on-device testing (done)**
Three fixes after Bob's first real session with a generated program:
- Equipment leak: LLM was prescribing cable exercises to a barbell+dumbbell-only
  user. `CoachService.loadExerciseLibrary` now filters by `availableEquipment`
  before sending the list to Claude, plus a HARD CONSTRAINT block in the prompt.
  The model literally cannot reach for cable exercises if cables aren't on the
  list.
- max_tokens truncation: 5-week × 4-day programs were exceeding 8k output
  tokens, leaving the SDK with a partial tool input (no `weeks` key). Bumped to
  16k and added stop_reason / output_tokens logging on every call.
- Exercise swap mid-session: Swap button on each planned-exercise card opens a
  bottom-sheet modal listing the **full library** (88 exercises) grouped by
  primary muscle group (Chest → Back → Shoulders → ... → Full Body, anatomical
  order). Selecting an alternative calls `workout.store.swapExercise(idx, …)`
  to update today's session AND fires `POST /workouts/programs/:id/swap-exercise`
  to propagate the change to every week of the program (matched by session.name
  + orderIndex). Swap is disabled once any set on the slot is logged.

**Slice 4c — exercise library expansion (done)**
Old seed had 10 exercises, too thin once equipment filtering kicks in. Added a
canonical 88-exercise default library covering chest, back, shoulders, biceps,
triceps, forearms, core, quads, hamstrings, glutes, calves, and full-body /
Olympic movements across barbell / dumbbell / kettlebell / cable / machine /
bodyweight.
- `packages/db/src/exercises.ts`: `DEFAULT_EXERCISES`, single source of truth.
- `packages/db/src/seed-exercises.ts`: idempotent upsert script — adds missing
  exercises without touching users / programs / logs. Run with
  `npm run db:seed-exercises` (safe on live DB).
- `seed.ts` now sources from the same list; fresh seed gets all 88.

**Slice 5 — daily adjustment banner (done)**
- New `AdjustForTodayBanner` component (`apps/mobile/src/components/`) renders
  above the planned-exercise list whenever the active session was launched
  from a generated program AND no set has been logged yet. It pulls today's
  BioCharge from `useDailyStats` (also exposes `recentLoad` now), POSTs to
  `/coach/adjust-session`, and swaps the displayed prescription in place.
  The original prescription is snapshot at session start (and re-snapshotted
  on user swaps) so "Revert" restores it.
- `workout.store.ts`: added `weekNumber`, `sessionIndex`, `originalPlannedExercises`,
  `applyAdjustedPlan`, `revertAdjustedPlan`. `startWorkout` now takes the
  generated-program coordinates; free workouts pass nulls. `swapExercise` also
  updates the snapshot so reverting an adjustment doesn't undo a user swap.
- Adjusted `CoachSession` carries `loadPctOf1RM`, not absolute kg, so the
  banner inherits weight from the matching original set — works because the
  rule engine only truncates from the back or appends a duplicate of the
  last set.
- API: `WorkoutService` now does `orderBy: { id: 'asc' }` on session includes;
  cuid v1 IDs are time-sortable so insert order (= GeneratedProgram session
  index) is preserved deterministically. The service used to rely on
  Postgres' implicit row-return order.
- `getTodayDashboard` now also returns `recentLoad` so the banner can pass
  the same exponentially-decayed 3-day load that fed today's readiness.

### 2.5 — UI Overhaul
- Dark mode (system preference or manual toggle)
- Icon set for navigation tabs, workout types, stats
- Redesigned cards, typography, spacing
- Consistent color palette across all screens
- Animations and transitions (react-native-reanimated)
- Polished splash screen and app icon

### 2.6 — Nutrition Tracking (AI Food Photo Analysis) — in progress
Log food and track macros by snapping a meal photo. Architecture mirrors the AI
coach: ~10% LLM (Claude vision per meal), ~90% deterministic (totals math, day
aggregation, calorie balance). No separate `Nutrition` tab — a card on the
Today tab opens the capture flow.

**Slice 1 — schemas + Prisma + helpers (done)**
- `@openfit/types/nutrition.ts`: `FoodItem`, `FoodAnalysis`, `FoodLog`,
  `MacroTotals`, `MacroTargets`, `ConfirmFoodLogInput`,
  `VisionAnalysisOutput`. Per-item macros are absolute (already multiplied by
  portion) so summing is direct.
- Prisma: `FoodLog` (confirmed) + `FoodAnalysis` (raw vision output, nullable
  FK back to its FoodLog when the user confirms). `MealType` enum.
  `User.macroTargets Json?` so goals evolve without migrations. Items kept as
  Json columns (user-edited, not relational).
- `fitness-core/nutrition.ts`: `sumItems`, `sumDayTotals`, `calorieBalance`
  (BMR-prorated for mid-day reads), `defaultMacroTargets` (30/40/30 P/C/F).
  12 Vitest tests.

**Slice 2 — backend vision API + persistence (done)**
- `NutritionService` mirrors `CoachService`: Anthropic vision via tool-use
  trick (`submit_food_analysis` tool whose `input_schema` mirrors
  `VisionAnalysisOutputSchema`), Zod validation, single retry on parse
  failure with the error fed back to the model.
- Photos as base64 in JSON (no multipart) — Anthropic vision takes base64
  directly so the server doesn't transcode. 8 MB body limit on `/analyze`
  accommodates uncompressed phone photos.
- Storage: `apps/api/uploads/{userId}/{cuid}.{ext}`, served via authenticated
  `GET /nutrition/photos/:userId/:filename` (URL userId must equal JWT
  userId; filename regex blocks path-traversal). `apps/api/uploads/` added
  to `.gitignore`.
- Totals always recomputed server-side from items so the client can't
  desync. 20 Vitest tests covering vision retry, photo multi-tenancy, log
  CRUD multi-tenancy, totals recomputation, macro targets.
- `ANTHROPIC_API_KEY` already configured for the coach — same key is reused.

**Slice 3 — mobile capture + confirm + Today card (done)**
- `services/nutrition.ts`: typed wrappers for the eight nutrition endpoints.
- `hooks/useTodayNutrition.ts`: pulls today's logs + targets, exposes
  `sumDayTotals` totals. Drives the Today card.
- `components/NutritionCard.tsx`: day totals (kcal big number + P/C/F bars),
  meal-photo thumbnail strip, "+ Log meal" CTA. Lives at the bottom of the
  Today tab, no new tab navigation.
- `components/AuthedImage.tsx`: thin wrapper around RN `<Image>` that
  forwards the JWT bearer header — needed because photos are auth-gated.
- `app/nutrition/capture.tsx`: camera or gallery picker via
  `expo-image-picker`, compresses to 1024px JPEG q=70 via
  `expo-image-manipulator` (a 4 MB iPhone photo lands at ~150-300 KB),
  uploads base64 to `/analyze`, stashes the result in a Zustand store, and
  navigates to confirm.
- `app/nutrition/confirm.tsx`: AI items in editable rows (name + grams +
  kcal + P/C/F), low-confidence flag, add/remove items, meal-type chips,
  Save → POST `/logs`. Time-of-day suggests the meal type
  (breakfast/lunch/dinner/snack).
- `stores/nutrition.store.ts`: in-memory `pendingAnalysis` only; cleared on
  save/cancel, never persisted.
- `app.json` + AndroidManifest: `CAMERA` and `READ_MEDIA_IMAGES`
  permissions added; `expo-image-picker` plugin entry with photos/camera
  rationales.

**Slice 4 — macro targets editor + Today balance pill (done)**
- `app/nutrition/targets.tsx`: full kcal + P/C/F targets editor. Suggestion
  button computes BMR × 1.5 (light-active multiplier) and runs through
  `defaultMacroTargets` (30/40/30 P/C/F split). Live "macros add up to X kcal
  but target is Y" drift warning when the two diverge by > 50 kcal.
- `NutritionCard` extension:
  - "Edit targets" / "Set targets" link in the header → opens the editor.
  - Calorie-balance pill rendered when there's at least one logged meal
    today AND user profile is loaded. Computed via `calorieBalance` with
    BMR-prorated `dayFraction` and Health Connect's `caloriesActive` for
    the active component. Surplus = orange, deficit = green (greater
    deficit usually means a workout day or low-intake morning).
- Vision prompt tuned (slice 3 polish): explicit cooking-fat handling
  (glossy/oil-slicked surfaces, browned starches, skin-on poultry, sautéed
  veg). Sanity-check rule: a typical full lunch/dinner plate is rarely
  under 600 kcal or over 1500 kcal — if the sum lands far outside that,
  re-check portions and added oil before submitting.
- Safe-area insets: SafeAreaProvider wired into root layout
  (`app/_layout.tsx`); nutrition capture/confirm/targets screens now use
  `useSafeAreaInsets()` instead of hardcoded `paddingTop: 56` so the
  Samsung gesture-bar pill no longer overlaps the header. Other screens
  still use the hardcoded value — fold into 2.5 UI overhaul later.

**Slice 5 — polish + history (next)**
- `app/nutrition/log/[id].tsx`: tap a thumbnail → see the photo full-size,
  edit items, delete the log.
- Past-day browse screen.
- Manual entry mode (skip the photo, type items directly).

### Phase 3 (future)
- Offline sync testing and hardening
- Exercise-specific progress charts (e.g. bench press 1RM trend over time)
- Weekly/monthly summary reports with streak tracking
- Exercise library CRUD (add custom exercises)
- Web dashboard token refresh interceptor
- Production builds, deployment, and CI/CD

## Workflow
- Always write specific and clean commits and push to the repo after completing work.

## Code Style
- TypeScript strict mode everywhere. No `any` types.
- No TODO placeholders — implement or don't.
- Zod schemas in `@openfit/types` are the source of truth for all types.
- Services receive `userId` from route handlers, never access request directly.
- Use comments only when the rationale isn't obvious from the code.
- No `.js` extensions in imports within shared packages (breaks Metro bundler).
