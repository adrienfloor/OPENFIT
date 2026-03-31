# OpenFit

Open-source fitness platform that connects wearables via Health Connect + BLE (Android only), tracks workouts (strength training, runs, jiu-jitsu), and displays health analytics on a web dashboard.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | Fastify v5, TypeScript, Prisma, PostgreSQL |
| Web | Next.js 15 (App Router), Tailwind CSS, Recharts |
| Mobile | React Native, Expo (bare workflow), Expo Router — Android only |
| Shared | Turborepo, Zod schemas, shared types + business logic |

## Monorepo Structure

```
openfit/
├── apps/
│   ├── api/             # Fastify backend (port 3001)
│   ├── web/             # Next.js dashboard (port 3000)
│   └── mobile/          # React Native + Expo
├── packages/
│   ├── types/           # Zod schemas & shared TypeScript types
│   ├── db/              # Prisma client, schema & seed script
│   ├── fitness-core/    # Pure business logic (HR zones, pace, calories)
│   └── ui/              # Shared React components
├── ARCHITECTURE.md
└── CLAUDE.md
```

## Prerequisites

- **Node.js** >= 20 (`nvm use 20`)
- **Docker** (for PostgreSQL)
- **npm** >= 10

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/adrienfloor/OPENFIT.git
cd OPENFIT
npm install
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

This starts a PostgreSQL 16 instance on port 5432 with credentials `openfit:openfit`.

### 3. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/mobile/.env.example apps/mobile/.env
```

Edit `apps/api/.env` and set real values for:
- `JWT_ACCESS_SECRET` — any random 32+ char string
- `JWT_REFRESH_SECRET` — a different random 32+ char string

### 4. Set up the database

```bash
npm run db:generate   # Generate Prisma client
npm run db:migrate    # Run migrations (creates tables)
npm run db:seed       # Seed with test data
```

The seed creates:
- 2 test users (`alice@openfit.dev` / `bob@openfit.dev`, password: `Password123`)
- 10 exercises, 3 programs (Push/Pull/Legs, Upper/Lower, Full Body)
- 14 days of synthetic health data per user

### 5. Start development

```bash
npm run dev         # All apps in parallel
npm run dev:api     # API only
npm run dev:web     # Web only
npm run dev:mobile  # Mobile only
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all apps in parallel |
| `npm run dev:api` | Start API server only |
| `npm run dev:web` | Start web dashboard only |
| `npm run dev:mobile` | Start Expo dev server only |
| `npm run build` | Build all packages and apps |
| `npm run test` | Run all test suites |
| `npm run lint` | Lint all packages |
| `npm run typecheck` | TypeScript check all packages |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed database with test data |

## Authentication

Custom JWT implementation with access + refresh token rotation. No third-party auth provider.

- **Access token**: 15-minute lifespan, signed with `JWT_ACCESS_SECRET`
- **Refresh token**: 30-day lifespan, SHA-256 hashed in DB, rotated on every use
- **Mobile**: access token in memory (Zustand), refresh token in `expo-secure-store` (native keychain)
- **Web**: access token in memory, refresh token in `HttpOnly` cookie

### API Endpoints

```
POST /auth/register   # Create account, return tokens
POST /auth/login      # Verify credentials, return tokens
POST /auth/refresh    # Rotate refresh token, return new pair
POST /auth/logout     # Invalidate refresh token
GET  /auth/me         # Return current user profile
```

### Test Users

| Email | Password | Role |
|-------|----------|------|
| `alice@openfit.dev` | `Password123` | user |
| `bob@openfit.dev` | `Password123` | admin |

## Testing

```bash
# All tests
npm run test

# Specific packages
cd packages/fitness-core && npx vitest run   # 11 tests (HR, pace, calories, ACWR)
cd apps/api && npx vitest run                # 11 tests (auth flows, multi-tenancy)
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for:
- System diagram
- Auth flow (register, login, refresh rotation, logout)
- Data flow (wearable -> Health Connect / BLE -> mobile -> API -> DB -> clients)
- Multi-tenancy model
- Key technical decisions with rationale
- Offline-first strategy

## Multi-Tenancy

Every user-owned model has a `userId` foreign key. Every database query is scoped to the authenticated user's ID extracted from the JWT. No global queries on user data.

## Roadmap

### Phase 0 (current) — Foundation
- [x] Monorepo with Turborepo
- [x] Shared types (Zod schemas)
- [x] Fitness-core business logic with tests
- [x] Prisma schema (13 models)
- [x] JWT auth with refresh token rotation
- [x] Web auth pages + dashboard layout
- [x] Mobile auth screens + tab navigation

### Phase 1 — Core Features
- [ ] Health Connect + BLE integration (implemented, needs UI wiring)
- [ ] Workout CRUD (programs, sessions, logs)
- [ ] Run tracking (GPS, pace, elevation)
- [ ] Health dashboard with charts (Recharts)
- [ ] Mobile offline sync (Drizzle + SQLite)

## License

MIT
