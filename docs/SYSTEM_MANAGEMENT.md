# System Management Module – Implementation Summary

## Current stack (pre-implementation scan)

- **Frontend:** Vite 5, React 18, TypeScript, React Router v6, Tailwind CSS, Framer Motion, React Hook Form, Zod, Lucide React. **Not** Next.js.
- **Backend:** Node.js (ESM), Express, JWT auth, bcrypt. **Not** Next.js API routes.
- **Database:** PostgreSQL, Prisma ORM (client generated to `server/node_modules/.prisma2/client`).
- **Auth:** JWT in `Authorization: Bearer <token>`. Login returns `token` and `user` (id, firstName, lastName, email, roleName, permissions). Single role per user via `User.roleId` → `Role`. Role has `permissions: String[]`.
- **UI:** Dark theme (surface, mactech-blue), shared components: Card, Button, Input, Modal, Table, Badge, PageShell.
- **Routing:** React Router; `/system` was a placeholder. Sidebar by role (Admin, Quality Manager, Manager, User).
- **Audit:** Only document-level history (`DocumentHistory`). No global append-only audit log.

---

## Files changed / added

### Schema (Prisma)

- **`server/prisma/schema.prisma`**
  - **Enums:** `UserStatus` (ACTIVE, INACTIVE, LOCKED).
  - **User:** Added `departmentId`, `siteId`, `jobTitle`, `status`, `mfaEnabled`, `lastLoginAt`, `lockedAt`, `mustChangePassword`, `invitedAt`, `tokenVersion`. Relations to `Department`, `Site`.
  - **New models:** `Permission`, `RolePermission` (RBAC), `Department`, `Site`, `JobTitle`, `AuditLog` (append-only), `InviteToken`, `PasswordResetToken`, `SecurityPolicy`, `RetentionPolicy`, `ESignConfig`.
  - **Role:** Relation to `RolePermission`.

### Backend (server)

- **`server/src/audit.js`** (new) – `createAuditLog()`, `requestIdMiddleware`, `getAuditContext()`.
- **`server/src/systemMiddleware.js`** (new) – `requireSystemRole`, `requireSystemPermission`, `systemSensitiveLimiter`, `auditFromRequest`, `countUsersWithRole`.
- **`server/src/system/users.js`** (new) – User list (search, filters, pagination), create, invite, get, update, deactivate, reactivate, lock, unlock, revoke-sessions, reset-password. All with reason and audit where required.
- **`server/src/system/roles.js`** (new) – List roles and permissions, permission matrix, create/update role. Guard: cannot remove last System Admin.
- **`server/src/system/audit.js`** (new) – List audit logs (filters, pagination), get one, export CSV.
- **`server/src/system/securityPolicies.js`** (new) – Get/put security policy (password, session, MFA). Audited.
- **`server/src/system/reference.js`** (new) – CRUD for departments, sites, job titles. Audited.
- **`server/src/system/retention.js`** (new) – Get/put retention policy; stub last-backup.
- **`server/src/system/esign.js`** (new) – Get/put e-sign config (document approval, CAPA closure, training sign-off). Audited.
- **`server/src/system/index.js`** (new) – Mounts all system routes under `/api/system`, requestId + auth, dashboard summary.
- **`server/src/auth.js`** – Login: reject if `status !== ACTIVE` or `lockedAt` set; update `lastLoginAt`; include `tokenVersion` in JWT. Middleware: reject if user inactive, locked, or `tokenVersion` mismatch (session revoked).
- **`server/src/index.js`** – `requestIdMiddleware` at app level; mount `/api/system`, systemRoutes.
- **`server/src/seed.js`** – Uses `prisma` from `db.js`. Adds `System Admin` role, `Permission` records, system permission codes to `Admin` and `Quality Manager`. Admin demo users use `System Admin` role. Seeds `SecurityPolicy`, `RetentionPolicy`, `ESignConfig` if missing.

### Frontend

- **`src/pages/system/SystemDashboard.tsx`** (new) – System Management landing: stats (users, roles, audit count) and cards linking to sub-pages.
- **`src/pages/system/SystemManagementLayout.tsx`** (new) – Left nav (Dashboard, Users, Roles, Audit, Security Policies, Reference Data, E-Signature, Retention) + `<Outlet />`.
- **`src/pages/system/SystemUsers.tsx`** (new) – Users table with search, role/status filters, pagination; Add User modal (direct create with temp password); access actions (deactivate, reactivate, lock, unlock, revoke sessions) with reason modal.
- **`src/pages/system/SystemRoles.tsx`** (new) – Roles table and list of permission codes.
- **`src/pages/system/SystemAudit.tsx`** (new) – Audit log table with date/action filters, pagination, Export CSV (fetch + blob download).
- **`src/pages/system/SystemSecurityPolicies.tsx`** (new) – Form for password, lockout, session, MFA policy; save with reason.
- **`src/pages/system/SystemReference.tsx`** (new) – Tabs: Departments, Sites, Job titles; tables (read-only list; create/edit can be added later).
- **`src/pages/system/SystemRetention.tsx`** (new) – Retention policy form; last backup stub.
- **`src/pages/system/SystemESign.tsx`** (new) – E-sign toggles for document approval, CAPA closure, training sign-off; save with reason.
- **`src/pages/system/index.ts`** (new) – Exports all system pages.
- **`src/App.tsx`** – Replaced single `SystemManagement` route with nested routes under `SystemManagementLayout`: index → `SystemDashboard`, `users`, `roles`, `audit`, `security-policies`, `reference`, `retention`, `esign`.
- **`src/lib/sidebarConfig.tsx`** – `System Admin` and `Quality Manager` get System Management link.
- **`src/components/layout/Header.tsx`** – Breadcrumb labels for system sub-routes.

### Dependencies

- **`server/package.json`** – Added `express-rate-limit`, `zod`.

---

## How to use

1. **Apply schema and seed**
   - From repo root: `cd server && npx prisma db push && node src/seed.js`
   - Ensures `System Admin`, permissions, demo users (e.g. `alex.admin@qms.demo` / `Password123!`), and policy rows exist.

2. **Start backend and frontend**
   - Backend: `cd server && npm run dev`
   - Frontend: `npm run dev`
   - Log in as a user with **System Admin** or **Admin** (or **Quality Manager** for limited system access).

3. **System Management**
   - Open **System Management** from the sidebar (Admin / System Admin / Quality Manager).
   - **Dashboard:** Counts and links to Users, Roles, Audit, Security Policies, Reference Data, E-Signature, Retention.
   - **Users:** Search/filter, pagination, **Add User** (direct create with temporary password), **Edit** (future), and access actions: Deactivate, Reactivate, Lock, Unlock, Revoke sessions (each requires a reason; recorded in audit log).
   - **Roles & Permissions:** View roles and permission codes. Create/update roles and matrix (API in place; UI can be extended).
   - **Audit Logs:** Filter by date/action, paginate, **Export CSV** (download).
   - **Security Policies:** Set password rules, lockout, session timeouts, MFA policy; save with reason.
   - **Reference Data:** View Departments, Sites, Job titles (CRUD API ready; UI currently list view).
   - **E-Signature:** Toggle e-sign for document approval, CAPA closure, training; save with reason.
   - **Retention:** Set retention years; last backup is a stub.

4. **Guardrails**
   - Cannot deactivate or lock your own account.
   - Cannot deactivate the last System Admin.
   - Cannot change a user’s role from System Admin to another if they are the last System Admin.
   - Sensitive actions (invite, reset password, lock/unlock, deactivate) require a **reason** (stored in audit log).
   - Rate limiting on sensitive system endpoints (e.g. invite, reset, lock).

---

## Env vars

- **`DATABASE_URL`** – PostgreSQL connection string (required for server).
- **`JWT_SECRET`** – Secret for signing JWTs (default dev value used if unset).
- **`APP_URL`** – Base URL for invite and reset links (e.g. `https://app.example.com`). Optional; defaults to `http://localhost:5173` in link generation.
- **`PORT`** – Server port (default 3001).

Email sending for invites is not implemented; the API returns the invite link in the response so an admin can share it manually. To send email, integrate a provider (SendGrid, SES, etc.) and call it from the invite handler.

---

## Testing

No test runner was present. Recommended when adding one (e.g. Vitest/Jest):

- **Unit:** Permission checks (`requireSystemPermission` / `requireSystemRole`) and `createAuditLog` (e.g. mock Prisma, assert audit record created with correct fields).
- **Integration:** POST `/api/system/users` with valid body and System Admin token; assert user created and audit log entry exists.

---

## E-Signature and document workflow

The e-sign **configuration** (which actions require e-sign) is stored and audited. The existing document approval flow already uses password re-entry and `DocumentSignature`; the new **ESignConfig** (document approval, CAPA closure, training sign-off) can be read in those flows to enforce “e-sign required” and to record printed name, meaning, timestamp, and auth step in signature records. The current codebase leaves that gate as a future hook (config is in place).
