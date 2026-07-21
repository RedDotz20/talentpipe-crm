# Phase 0 — Project Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up full dev environment — Docker infra (Postgres/Redis/MinIO), NestJS backend wiring, Vite/React/Mantine frontend scaffold.

**Architecture:** Backend already scaffolded via NestJS CLI — we add Docker Compose, .env, Drizzle config, and CORS/ConfigModule wiring. Frontend is fresh Vite + Mantine + TanStack stack. All three Docker services run locally for development.

**Tech Stack:** NestJS + PostgreSQL + Drizzle ORM — React + Mantine + TanStack Query + TanStack Router + dnd-kit — Docker Compose (postgres:16, redis:7-alpine, minio/minio)

---

### Task 1: Docker Compose

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: devuser
      POSTGRES_PASSWORD: devpassword
      POSTGRES_DB: talentpipe
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  miniodata:
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "phase0: add Docker Compose with postgres, redis, minio"
```

---

### Task 2: Backend .env

**Files:**
- Create: `backend/.env`

- [ ] **Step 1: Create .env file**

```
DATABASE_URL=postgres://devuser:devpassword@localhost:5432/talentpipe
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-jwt-secret-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

- [ ] **Step 2: Commit**

```bash
git add backend/.env
git commit -m "phase0: add backend .env with dev defaults"
```

---

### Task 3: Backend directory structure + Drizzle config

**Files:**
- Create: `backend/drizzle.config.ts`
- Create dirs: `backend/src/database/`, `backend/src/interceptors/`, `backend/src/repositories/`, `backend/src/shared/`, `backend/drizzle/`

- [ ] **Step 1: Create directories**

```bash
mkdir -p backend/src/database backend/src/interceptors backend/src/repositories backend/src/shared backend/drizzle
```

- [ ] **Step 2: Create drizzle.config.ts**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 3: Create placeholder schema file**

```typescript
// backend/src/database/schema.ts
// Schema will be populated in Phase 1
```

- [ ] **Step 4: Commit**

```bash
git add backend/drizzle.config.ts backend/src/database/ backend/src/interceptors/ backend/src/repositories/ backend/src/shared/ backend/drizzle/
git commit -m "phase0: add drizzle config and backend directory structure"
```

---

### Task 4: NestJS wiring — CORS + ConfigModule

**Files:**
- Modify: `backend/src/main.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Update main.ts — add enableCors()**

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 2: Update app.module.ts — add ConfigModule**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

Note: Removed `AuthModule` import since it will be properly wired in Phase 1.

- [ ] **Step 3: Add typecheck script to package.json**

Modify the `scripts` section in `backend/package.json` — add `"typecheck": "tsc --noEmit"` after the existing lint script.

- [ ] **Step 4: Verify backend compiles**

Run: `cd backend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main.ts backend/src/app.module.ts
git commit -m "phase0: add CORS and ConfigModule to NestJS backend"
```

---

### Task 5: Frontend scaffold

**Files:**
- Create: `frontend/` via Vite template

- [ ] **Step 1: Scaffold Vite + React + TypeScript**

```bash
cd frontend
npm create vite@latest . -- --template react-ts
```

- [ ] **Step 2: Install dependencies**

```bash
cd frontend
npm install @mantine/core @mantine/hooks @mantine/form @mantine/notifications @tabler/icons-react
npm install @tanstack/react-query @tanstack/react-router zustand
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install zod dayjs
```

- [ ] **Step 3: Create frontend directory structure**

```bash
mkdir -p frontend/src/app frontend/src/features frontend/src/shared/components frontend/src/shared/hooks frontend/src/shared/api frontend/src/shared/types
```

- [ ] **Step 4: Verify frontend builds**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "phase0: scaffold Vite + React + Mantine frontend"
```

---

### Task 6: Verify everything works together

- [ ] **Step 1: Start Docker services**

```bash
docker compose up -d
```

Expected: `docker compose ps` shows all 3 services running.

- [ ] **Step 2: Start backend**

```bash
cd backend && npm run start:dev
```

Expected: Console shows `Server Running on http://localhost:3000` (or NestJS default log).

- [ ] **Step 3: Start frontend**

```bash
cd frontend && npm run dev
```

Expected: Vite dev server on `http://localhost:5173`.

- [ ] **Step 4: Final commit — add .gitkeep files for empty dirs if needed**

```bash
git add -A
git commit -m "phase0: NestJS backend + Vite frontend + Docker infra scaffold"
```
