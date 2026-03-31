# OpenFit Architecture

## System Overview

```
+------------------+                +------------------+
|   Helio Strap    |                |   Helio Strap    |
|   (passive)      |                |   (workout)      |
+--------+---------+                +--------+---------+
         |                                   |
         | Zepp background service           | BLE GATT HR (0x180D)
         v                                   v
+--------+---------+                +--------+---------+
|  Health Connect  |                | react-native-    |
|  (Android)       |                | ble-plx          |
+--------+---------+                +--------+---------+
         |                                   |
         | react-native-health-connect       |
         v                                   v
+--------+-----------------------------------+---------+
|                                                      |
|                   Mobile App (Expo/RN)               |
|                   Android only                       |
|                                                      |
+------------------------+-----------------------------+
                         |
                         | REST API
                         v
+------------------------+-----------------------------+
|                                                      |
|                 Fastify API Server                   |
|                 (apps/api)                           |
|                                                      |
|   +----------+  +-----------+  +-----------+         |
|   |  Auth    |  | Workout   |  |  Health   |         |
|   |  Service |  | Service   |  |  Service  |         |
|   +----+-----+  +-----+-----+  +-----+-----+        |
|        |              |              |                |
|        +------+-------+------+-------+                |
|               |                                       |
|               v                                       |
|        +------+------+                                |
|        |   Prisma    |                                |
|        |   ORM       |                                |
|        +------+------+                                |
|               |                                       |
+---------------+---------------------------------------+
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

## Wearable Integration

**Platform: Android only.**

### Passive daily data (sleep, HRV, steps, resting HR, calories, SpO2)
Helio Strap → Zepp (background service) → Health Connect → OpenFit via react-native-health-connect

Zepp does not need to be open. It runs as an Android background service and syncs
Helio data into Health Connect automatically. One-time setup: set Zepp to
"Unrestricted" battery in Android Settings → Apps → Zepp → Battery.

Health Connect must be installed on the device (pre-installed on Android 14+,
available on the Play Store for Android 9+).

### Real-time workout data (live heart rate)
Helio Strap BLE (GATT Heart Rate Service 0x180D) → react-native-ble-plx
→ useRealtimeHeartRate hook → workout screens

Only active during workout sessions. Connects on workout start, disconnects on end.

### GPS
Phone GPS via expo-location. No wearable involved.

### Why not Terra API?
Terra costs $399-499/month. Health Connect + direct BLE achieves identical
functionality for free.

### Why not iOS?
Android-first. iOS support can be added later by reimplementing
src/services/healthConnect.ts using react-native-health (HealthKit).
The BLE service and all hooks are already platform-agnostic.

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
Passive data (daily):
1. Helio Strap syncs to Zepp app (background, automatic)
2. Zepp writes data into Health Connect (background, automatic)
3. Mobile app reads from Health Connect via healthConnect.ts service
4. useDailyStats hook presents data in the UI
5. Mobile app syncs to API via POST /health (offline queue)
6. Web dashboard fetches GET /health (scoped to userId)

Real-time data (workout):
1. User starts a workout in the app
2. useRealtimeHeartRate hook creates BLE service, scans for HR device
3. BLE connects to Helio Strap (GATT Heart Rate Service 0x180D)
4. HR samples stream into the workout screen in real time
5. On workout end, accumulated samples are saved with the workout log
```

## Multi-Tenancy Model

Every user-owned model has a `userId` foreign key:

```
User (1) ---> (*) Program
User (1) ---> (*) WorkoutLog
User (1) ---> (*) RunSession
User (1) ---> (*) DailyHealth
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
Bare workflow gives us access to native modules (BLE via react-native-ble-plx,
Health Connect, Secure Store native keychain) that managed workflow cannot
support. The tradeoff is more complex build configuration, which is acceptable
for a production app.

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
