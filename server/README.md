# QMS Backend (Node.js + Express + Prisma)

## Prerequisites

- Node.js 18+
- PostgreSQL running locally or remotely

## Setup

1. **Install dependencies**

   ```bash
   cd server && npm install
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and set:

   - **`DATABASE_URL`** — PostgreSQL connection string.
     - **Local / API outside Railway:** Use your Railway **`DATABASE_PUBLIC_URL`** (e.g. `postgresql://postgres:...@maglev.proxy.rlwy.net:53814/railway`) so the app can reach the DB from your machine or another host.
     - **API deployed on Railway (same project):** Use **`DATABASE_URL`** from the Postgres service (internal URL) for in-network access.
   - **`JWT_SECRET`** — Secret for signing JWTs (use a strong value in production).
   - **`PORT`** — Optional; default `3001`.

3. **Create database and run migrations**

   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Seed roles and demo users**

   ```bash
   npm run db:seed
   ```

   This creates 5 roles and 5 users. All demo users use password: **`Password123!`**

   | Role              | Email                     | Name            |
   |-------------------|---------------------------|-----------------|
   | System Administrator | alex.admin@qms.demo    | Alex Admin      |
   | Quality           | brenda.quality@qms.demo  | Brenda Quality  |
   | Manager           | charles.manager@qms.demo | Charles Manager |
   | User              | david.user@qms.demo       | David User      |
   | Read-Only         | evelyn.readonly@qms.demo  | Evelyn Readonly |

## Run

- Development (with watch): `npm run dev`
- Production: `npm start`

API listens on `http://localhost:3001` by default. The frontend proxies `/api` to this server when using `npm run dev` in the project root.

## API

- `POST /api/auth/login` — Body: `{ "email", "password" }`. Returns `{ "token", "user" }`.
- `GET /api/auth/me` — Requires `Authorization: Bearer <token>`. Returns `{ "user" }`.
- `GET /api/health` — Health check.
