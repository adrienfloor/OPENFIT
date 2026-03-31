# CLAUDE.md — OpenFit Project Context

## What is OpenFit?
Full-stack open-source fitness platform. Connects wearables via Health Connect + BLE (Android only), tracks workouts (strength, runs, jiu-jitsu), displays health analytics. Multi-tenant — each user has their own data, devices, and programs.

## Tech Stack
- **Monorepo**: Turborepo with npm workspaces
- **API**: Fastify v5 + TypeScript + Prisma + PostgreSQL (port 3001)
- **Web**: Next.js 15 App Router + Tailwind + Recharts (port 3000)
- **Mobile**: React Native + Expo (bare workflow) + Expo Router (Android only)
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

## Architecture Decisions
- **Auth**: Custom JWT with access (15min) + refresh (30d) token rotation. No third-party auth provider. See `apps/api/src/services/auth.service.ts`.
- **Multi-tenancy**: Every DB query scoped to `userId` from JWT. Never query user data without filtering.
- **Token storage**: Mobile stores refresh token in `expo-secure-store` (native keychain). Web uses HttpOnly cookie. Access token always in memory only.
- **Offline-first** (mobile): Local SQLite via Drizzle ORM, sync queue flushes to API when online.
- **Two ORMs**: Prisma for PostgreSQL (server), Drizzle for SQLite (mobile). Prisma doesn't support RN SQLite.

## Project Structure
```
apps/api/         — Fastify backend (auth fully implemented + tested, other routes stubbed)
apps/web/         — Next.js dashboard (auth pages functional, dashboard stubbed)
apps/mobile/      — Expo app (auth screens functional, tabs stubbed)
packages/types/   — Zod schemas + TypeScript types (all domain types defined)
packages/db/      — Prisma schema + seed script (14 models, 2 test users, 3 programs)
packages/fitness-core/ — Pure business logic (HR zones, pace calc, ACWR, calories) + Vitest tests
packages/ui/      — Shared React components (scaffold only)
```

## Testing
- `packages/fitness-core`: 11 Vitest tests (heart rate, running, workout calculations)
- `apps/api`: 11 Vitest tests (register, login, refresh rotation, logout, multi-tenancy)
- Run with: `cd apps/api && npx vitest run` or `cd packages/fitness-core && npx vitest run`

## Database
- PostgreSQL via Docker: `docker compose up -d`
- Connection: `postgresql://openfit:openfit@localhost:5432/openfit`
- After starting DB: `npm run db:migrate && npm run db:seed`

## Current Phase (Phase 0 — Foundation)
All steps complete:
1. Monorepo scaffolded with Turborepo
2. Shared types package with Zod schemas
3. Fitness-core pure functions with tests
4. Prisma schema with 13 models
5. Fastify API with full auth implementation
6. Next.js web app with auth pages
7. Expo mobile app with auth screens
8. ARCHITECTURE.md populated

## What's Next (Phase 1)
- Workout CRUD (create/read/update programs and workout logs)
- Run tracking (GPS, pace, elevation)
- Health dashboard with Recharts visualizations
- Mobile offline sync with Drizzle/SQLite
- Real-time heart rate via BLE (react-native-ble-plx) — service implemented
- Health Connect daily data integration — service implemented

## Workflow
- Always write specific and clean commits and push to the repo after completing work.

## Code Style
- TypeScript strict mode everywhere. No `any` types.
- No TODO placeholders — implement or don't.
- Zod schemas in `@openfit/types` are the source of truth for all types.
- Services receive `userId` from route handlers, never access request directly.
- Use comments only when the rationale isn't obvious from the code.
