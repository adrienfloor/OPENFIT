# OpenFit Architecture

## System Overview

```
                    +------------------+
                    |   Helio Strap /  |
                    |   Wearable HW    |
                    +--------+---------+
                             |
                             | BLE / Terra RT SDK
                             v
+----------------+   +------+-------+   +----------------+
|                |   |              |   |                |
|  Mobile App    +<->+  Terra API   +-->+  Webhook       |
|  (Expo/RN)     |   |  (Cloud)     |   |  Endpoint      |
|                |   |              |   |                |
+-------+--------+   +--------------+   +-------+--------+
        |                                        |
        | REST API                               | POST /terra/webhook
        v                                        v
+-------+----------------------------------------+--------+
|                                                         |
|                    Fastify API Server                   |
|                    (apps/api)                           |
|                                                         |
|   +----------+  +-----------+  +-----------+            |
|   |  Auth    |  | Workout   |  |  Health   |            |
|   |  Service |  | Service   |  |  Service  |            |
|   +----+-----+  +-----+-----+  +-----+-----+           |
|        |              |              |                   |
|        +------+-------+------+-------+                   |
|               |                                          |
|               v                                          |
|        +------+------+                                   |
|        |   Prisma    |                                   |
|        |   ORM       |                                   |
|        +------+------+                                   |
|               |                                          |
+---------------+------------------------------------------+
                |
                v
         +------+------+
         | PostgreSQL   |
         | (Docker)     |
         +--------------+

+----------------+
|  Web Dashboard |-----> REST API (same Fastify server)
|  (Next.js 15)  |
+----------------+
```

## Authentication Flow

### Register
```
Client                          API                           DB
  |-- POST /auth/register ------>|                             |
  |   { email, password, ... }   |-- validate Zod schema ----->|
  |                              |-- check email uniqueness --->|
  |                              |-- bcrypt hash (12 rounds) -->|
  |                              |-- create User --------------->|
  |                              |-- generate access JWT ------>|
  |                              |-- generate refresh token --->|
  |                              |-- SHA-256 hash refresh ----->|
  |                              |-- store hashed refresh ------>|
  |<-- { accessToken,           |                             |
  |      refreshToken, user } ---|                             |
```

### Login
```
Client                          API                           DB
  |-- POST /auth/login --------->|                             |
  |   { email, password }        |-- find user by email ------->|
  |                              |-- bcrypt.compare ----------->|
  |                              |   (timing-safe: always runs  |
  |                              |    bcrypt even if user null) |
  |                              |-- issue token pair --------->|
  |<-- { accessToken,           |                             |
  |      refreshToken, user } ---|                             |
```

### Access Token Lifecycle
```
Client                          API
  |-- GET /workouts ------------>|
  |   Authorization: Bearer JWT  |-- verify JWT signature
  |                              |-- check expiry (15 min)
  |                              |-- attach request.user
  |<-- 200 { data } ------------|

  ... 15 minutes later ...

  |-- GET /workouts ------------>|
  |   Authorization: Bearer JWT  |-- verify JWT: EXPIRED
  |<-- 401 Unauthorized --------|
```

### Refresh Token Rotation
```
Client                          API                           DB
  |-- POST /auth/refresh ------->|                             |
  |   { refreshToken }           |-- SHA-256 hash token ------>|
  |                              |-- find by hashed token ----->|
  |                              |-- check not expired -------->|
  |                              |-- DELETE old token --------->|
  |                              |-- generate new pair -------->|
  |                              |-- store new hashed token --->|
  |<-- { accessToken,           |                             |
  |      refreshToken } ---------|                             |
```

Key: old refresh token is deleted before new one is created. If a stolen token
is used after rotation, it will not be found in DB (revoked).

### Logout
```
Client                          API                           DB
  |-- POST /auth/logout -------->|                             |
  |   Authorization: Bearer JWT  |-- delete refresh token ----->|
  |   { refreshToken }           |-- clear HttpOnly cookie     |
  |<-- 204 No Content ----------|                             |
```

## Data Flow: Wearable -> Dashboard

```
1. User pairs wearable in mobile app
2. Mobile app calls POST /terra/auth-token (authenticated)
3. API generates Terra session token, stores TerraConnection mapping
4. Terra SDK initializes on mobile with session token
5. Background: Terra cloud syncs wearable data
6. Terra sends webhook POST /terra/webhook with health data
7. API validates webhook signature (TERRA_WEBHOOK_SECRET)
8. API maps Terra user_id -> OpenFit userId via TerraConnection
9. API upserts data into DailyHealth / HeartRateSample tables
10. Web dashboard fetches GET /health (scoped to userId)
11. Mobile app fetches on foreground via useDailyStats hook
```

## Multi-Tenancy Model

Every user-owned model has a `userId` foreign key:

```
User (1) ---> (*) Program
User (1) ---> (*) WorkoutLog
User (1) ---> (*) RunSession
User (1) ---> (*) DailyHealth
User (1) ---> (*) TerraConnection
User (1) ---> (*) RefreshToken
```

**Enforcement rules:**
- Every service method receives `userId` from the authenticated JWT payload
- Every Prisma query includes `where: { userId }` — no global queries on user data
- The `authenticate` Fastify plugin extracts `request.user.sub` (userId) from JWT
- API routes pass `request.user.sub` to service methods — services never read from request directly
- Auth tests verify that accessing another user's data returns 403/404

## Key Technical Decisions

### JWT over sessions
Sessions require server-side state (Redis/DB lookup on every request). JWTs are
stateless and verified via signature alone. The tradeoff is that JWTs can't be
instantly revoked — we mitigate this with short-lived access tokens (15 min) and
refresh token rotation.

### Refresh token rotation
Each refresh creates a new token pair and invalidates the old. If an attacker
steals a refresh token and uses it after the legitimate user has already rotated,
the stolen token will be missing from DB. This is defense-in-depth against token
theft.

### Bcrypt over Argon2
Bcrypt is battle-tested, widely supported, and has no native compilation issues
across platforms. Argon2 is theoretically stronger but introduces build
complexity. We use 12 rounds (cost factor) which takes ~250ms on modern hardware.

### Expo bare workflow
Bare workflow gives us access to native modules (Terra RT BLE SDK, Secure Store
native keychain) that managed workflow cannot support. The tradeoff is more
complex build configuration, which is acceptable for a production app.

### Drizzle (local SQLite) + Prisma (remote PostgreSQL)
Two ORMs for two different databases with different requirements:
- **Prisma** for PostgreSQL: excellent migration tooling, type-safe queries, proven at scale
- **Drizzle** for SQLite on mobile: lightweight, designed for edge/embedded, works with expo-sqlite
The alternative (Prisma for both) doesn't work because Prisma doesn't support SQLite on React Native.

### Fastify over Express
Fastify v5 is 2-3x faster than Express, has built-in schema validation, first-class
TypeScript support, and a plugin architecture that maps cleanly to our service structure.

## Offline-First Strategy

```
Mobile App                    Local SQLite              API (PostgreSQL)
  |                           (Drizzle ORM)              |
  |-- log workout ----------->|                          |
  |   (write locally first)   |-- queue sync item ------>|
  |                           |                          |
  |   ... offline period ...  |                          |
  |                           |                          |
  |-- app comes online ------>|                          |
  |                           |-- flush sync queue ----->|
  |                           |   POST /workouts/logs    |
  |                           |   POST /runs             |
  |                           |-- mark synced ---------->|
  |                           |                          |
  |-- pull latest data ------>|                          |
  |   (React Query refetch)   |<-- GET /health ----------|
  |<-- update local cache ----|                          |
```

Sync queue is processed FIFO. Failed items are retried with exponential backoff.
Conflict resolution: server timestamp wins (last-write-wins for health data,
append-only for workout logs).
