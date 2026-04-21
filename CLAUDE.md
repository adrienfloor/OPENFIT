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

## Architecture Decisions
- **Auth**: Custom JWT with access (15min) + refresh (30d) token rotation. No third-party auth provider. See `apps/api/src/services/auth.service.ts`.
- **Multi-tenancy**: Every DB query scoped to `userId` from JWT. Never query user data without filtering.
- **Token storage**: Mobile stores refresh token in `expo-secure-store` (native keychain). Web uses `of_session` cookie for middleware + in-memory access token. Access token always in memory only.
- **Session restore** (mobile): On app launch, `_layout.tsx` exchanges stored refresh token via `/auth/refresh`, then fetches `/auth/me` for user profile.
- **Offline sync** (mobile): SQLite-backed queue via expo-sqlite, auto-flush on foreground. Not fully tested yet.
- **Two ORMs**: Prisma for PostgreSQL (server), Drizzle for SQLite (mobile). Prisma doesn't support RN SQLite.

## Project Structure
```
apps/api/         — Fastify backend (auth + full CRUD for workouts, runs, health)
apps/web/         — Next.js dashboard (auth, dashboard with Recharts, program builder)
apps/mobile/      — Expo app (auth, today stats, workout logging with BLE HR, run GPS, history)
packages/types/   — Zod schemas + TypeScript types (all domain types + input schemas)
packages/db/      — Prisma schema + seed script (15 models, 2 users, 3 programs, workout/run/health seed data)
packages/fitness-core/ — Pure business logic (HR zones, pace calc, ACWR, calories) + Vitest tests
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
GET    /workouts/exercises    — List all exercises
GET    /workouts/logs         — List user's workout logs
GET    /workouts/logs/:id     — Get single workout log
POST   /workouts/logs         — Create workout log (with exercise logs, sets, optional HR samples)
DELETE /workouts/logs/:id     — Delete workout log

GET    /runs                  — List user's run sessions
GET    /runs/:id              — Get single run
POST   /runs                  — Create run (with GPS points, optional HR samples)
PATCH  /runs/:id              — Update run
DELETE /runs/:id              — Delete run

GET    /health                — List user's daily health records
GET    /health/:date          — Get single day
POST   /health                — Upsert single day
POST   /health/bulk           — Bulk upsert (up to 90 days, for mobile sync)
```

## Testing
- `packages/fitness-core`: 30 Vitest tests (heart rate, running, workout calculations)
- `apps/api`: 44 Vitest tests (auth, workout CRUD, run CRUD, health, multi-tenancy)
- Run with: `cd apps/api && npx vitest run` or `cd packages/fitness-core && npx vitest run`
- Total: 74 tests passing

## Database
- PostgreSQL via Docker: `docker compose up -d`
- Connection: `postgresql://openfit:openfit@localhost:5432/openfit`
- After starting DB: `npm run db:migrate && npm run db:seed`
- Seed includes: 2 users, 10 exercises, 3 programs, 30 days health data, 8 workout logs + HR samples, 6 run sessions + GPS + HR per user

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
- Mobile run screen (GPS tracking, timer with pause/resume, save to API)
- Mobile history tab (expandable workout/run cards)
- Mobile Health Connect integration (daily stats on Today tab)
- Session restore on mobile (refresh token + profile fetch)

## What's Next (Phase 2)
- Offline sync testing and hardening
- Jiu-jitsu session tracking
- Exercise-specific progress charts (e.g. bench press 1RM trend)
- Weekly/monthly summaries and streak tracking
- Exercise library CRUD (add custom exercises from app)
- Web dashboard token refresh interceptor
- Error boundaries and loading skeletons
- Production builds and deployment

## Workflow
- Always write specific and clean commits and push to the repo after completing work.

## Code Style
- TypeScript strict mode everywhere. No `any` types.
- No TODO placeholders — implement or don't.
- Zod schemas in `@openfit/types` are the source of truth for all types.
- Services receive `userId` from route handlers, never access request directly.
- Use comments only when the rationale isn't obvious from the code.
- No `.js` extensions in imports within shared packages (breaks Metro bundler).
