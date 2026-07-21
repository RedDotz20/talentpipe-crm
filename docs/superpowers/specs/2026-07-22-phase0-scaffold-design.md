# Phase 0 — Project Scaffold (Adapted for NestJS CLI)

**Date:** 2026-07-22
**Status:** Approved

## Objective

Set up the full development environment for TalentPipe: backend (NestJS), frontend (Vite/React/Mantine), and infrastructure (PostgreSQL, Redis, MinIO via Docker Compose).

## Current State

The backend was scaffolded via `nest new` (NestJS CLI), providing:
- NestJS app structure (`main.ts`, `app.module.ts`, `app.controller.ts`, `app.service.ts`)
- `AuthModule` stubs (controller, service, module — empty implementations)
- Full dev tooling: ESLint, Prettier, Jest, tsconfig (with decorators)
- Dependencies installed: NestJS core, JWT, Passport, Argon2, Zod, Drizzle ORM, pg, etc.

The frontend folder is empty. No Docker Compose, .env, or Drizzle config exists.

## Scope

Phase 0 covers only scaffolding — no application logic beyond a bootable NestJS + Vite setup with infrastructure running in Docker.

## Deliverables

### 1. Docker Compose (`docker-compose.yml` at project root)

| Service   | Image             | Ports           | Notes                     |
|-----------|-------------------|-----------------|---------------------------|
| postgres  | postgres:16       | 5432            | User/pass/db: devuser/devpassword/talentpipe |
| redis     | redis:7-alpine    | 6379            | —                         |
| minio     | minio/minio       | 9000 (API), 9001 (Console) | Console on :9001 |

### 2. Backend config (`backend/.env`)

Seven variables: DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY. Dev defaults.

### 3. Drizzle config (`backend/drizzle.config.ts`)

Standard Drizzle Kit config pointing to `src/database/schema.ts` with pg driver.

### 4. Backend directory structure

Create these directories under `backend/src/`: `database/`, `interceptors/`, `repositories/`, `shared/`, and `backend/drizzle/` (migrations output).

### 5. NestJS wiring (minor edits to existing files)

- `src/main.ts` — add `enableCors()`, keep rest
- `src/app.module.ts` — add `ConfigModule.forRoot({ isGlobal: true })` to imports (keep AuthModule)

### 6. Frontend scaffold

- `npm create vite@latest` with `react-ts` template
- Install: @mantine/core, @mantine/hooks, @mantine/form, @mantine/notifications, @tabler/icons-react, @tanstack/react-query, @tanstack/react-router, zustand, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, zod, dayjs
- Create dirs: `src/app`, `src/features`, `src/shared/components`, `src/shared/hooks`, `src/shared/api`, `src/shared/types`

### 7. Verify

- `docker compose up -d` starts all 3 containers
- `cd backend && npm run start:dev` serves on :3000
- `cd frontend && npm run dev` serves on :5173

## Deviations from Implementation Guide

| Guide Step | Adaptation |
|------------|------------|
| 0.1–0.2 (repo init, npm init) | Skipped — NestJS CLI already did this |
| 0.3 (tsconfig.json, main.ts, app.module.ts) | Keep NestJS CLI tsconfig; only add `enableCors()` to main.ts and `ConfigModule` to app.module |
| 0.3 (scripts) | Keep NestJS scripts (`nest start --watch` instead of `tsx watch`); also add `"lint": "tsc --noEmit"` alongside ESLint |

## Skill taxonomy seed

Not part of Phase 0 — deferred to Phase 1 or Phase 2 per the guide.
