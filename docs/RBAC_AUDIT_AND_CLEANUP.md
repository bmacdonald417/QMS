# RBAC Audit and Cleanup

## Step 0 — Repo + DB shape audit

### Prisma schema
- **Role**: `id` (Int), `name` (String, unique), **`permissions` (String[])** — legacy array; **`rolePermissions` (RolePermission[])** — join table. Both exist; app currently uses **Role.permissions** for checks.
- **Permission**: `id` (uuid), `code` (String, unique), `description`. Stored in `permissions` table.
- **RolePermission**: `roleId`, `permissionId`; composite PK; maps to `role_permissions`. Exists but **seed does not populate it**; some roles API reads use it in parallel with Role.permissions.
- **User**: `roleId` (Int, single role per user), FK to Role.

### Seed (server/src/seed.js)
- **ROLES**: Array of `{ name, permissions: string[] }`. Upserts Role by **name**; **create/update sets Role.permissions** only. Does not create or update RolePermission rows.
- **PERMISSION_CODES**: Upserts into Permission table by **code**. Used for reference; seed does not link Role → Permission via RolePermission.
- **DEMO_USERS**: Assign users to roles by role **name** (System Admin, Quality Manager, Manager, User). No "Admin", "Read-Only", "System Administrator", "Quality" in current seed.

### Middleware / permission checks
- **auth.js**: Loads `role: { select: { name: true, permissions: true } }`; sets `req.user.permissions = user.role.permissions`. **Source: Role.permissions array only.**
- **systemMiddleware.js**: `requireSystemRole(...)` allows "System Admin" and "Admin" as full bypass. `requireSystemPermission(code)` and `requireAnySystemPermission(...)` use `req.user.permissions` array.
- **documents.js, capas.js, changeControls.js, files.js**: Use `req.user.permissions` or equivalent (permissions array).

### Legacy vs join table
- **Role.permissions (String[])** is the **current source of truth** for permission checks everywhere (auth, systemMiddleware, modules).
- **role_permissions** join table exists and is read in GET /api/system/roles and /permission-matrix (for display and “granted” check), but **not used for auth**. Role updates (PUT) write only to **Role.permissions**.
- **Conclusion**: Use RolePermission as single source of truth; refactor auth (and any reader) to resolve permissions from role_permissions; then seed/migration write only to RolePermission. Role.permissions can be deprecated or synced from RolePermission for backward compat (we will sync from catalog in seed so one write path).

### Canonical roles (after cleanup)
- **Keep**: System Admin, Quality Manager, Manager, User, Read-Only.
- **Deprecate / remove**: Admin, System Administrator, Quality, and any other name not in the keep list.

### Migration approach
- Script **migrateRoles.js**: Ensure canonical roles exist; for each deprecated role, reassign users to canonical (with audit); delete deprecated role; normalize RolePermission for canonical roles. Idempotent and transaction-safe.

---

## Deliverables (RBAC cleanup)

### Roles before / after
- **Before**: Whatever exists in DB (e.g. Admin, System Admin, System Administrator, Quality, Quality Manager, Manager, User, Read-Only).
- **After**: Only **System Admin**, **Quality Manager**, **Manager**, **User**, **Read-Only**. The migration script prints roles before/after and user migration counts to the console.

### How to run
1. **Seed (idempotent)**: From `server`: `npm run db:seed`. Creates/updates only canonical roles and syncs `role_permissions` and `Role.permissions`.
2. **Migration**: From `server`: `npm run db:migrate-roles`. Ensures canonical roles exist, migrates users off deprecated roles (with audit log), deletes deprecated roles, normalizes permissions. Safe to run multiple times.
3. **Unit test**: From `server`: `node src/rbac/roleCatalog.test.js`. Asserts canonical list and deprecated→canonical mapping.

### User migration summary
- The script prints **User migration counts** per mapping (e.g. `Admin -> System Admin: 2`).
- Each migrated user gets an audit log entry: `entityType=USER`, `action=ROLE_MIGRATION`, `reason=RBAC role consolidation`.

### Files changed and why
| File | Why |
|------|-----|
| `docs/RBAC_AUDIT_AND_CLEANUP.md` | Audit summary and deliverable notes. |
| `server/src/rbac/roleCatalog.js` | Canonical role names, deprecated→canonical map, permissions per role. |
| `server/src/rbac/permissionCatalog.js` | Valid permission codes (colon-separated); used by seed and normalization. |
| `server/src/rbac/roleCatalog.test.js` | Unit tests for catalog (no DB). |
| `server/src/scripts/migrateRoles.js` | Migration: create canonical roles, migrate users, delete deprecated, normalize role_permissions. |
| `server/src/seed.js` | Idempotent seed from catalogs; only canonical roles; syncs RolePermission and Role.permissions. |
| `server/src/auth.js` | Load permissions from role_permissions join (fallback to Role.permissions); requirePermission bypass only System Admin. |
| `server/src/systemMiddleware.js` | Bypass only System Admin; SYSTEM_ACCESS_ROLES canonical. |
| `server/src/users.js` | Picker: permissions from join table. |
| `server/src/system/roles.js` | GET returns isCanonical, canonicalRoleNames; POST/PUT only canonical names; sync RolePermission; last System Admin guard. |
| `server/src/system/users.js` | requireSystemRole uses only canonical names; existing “last System Admin” guard kept. |
| `server/src/system/retention.js` | requireSystemRole canonical. |
| `server/src/system/esign.js` | requireSystemRole canonical. |
| `server/src/system/reference.js` | requireSystemRole canonical. |
| `server/src/system/securityPolicies.js` | requireSystemRole canonical. |
| `server/src/system/audit.js` | requireSystemRole canonical. |
| `server/src/system/index.js` | requireSystemRole canonical. |
| `server/src/userAuthz.js` | SYS_ADMIN_NAMES = System Admin only; PRIVILEGED_ROLE_NAMES canonical; BASIC_ROLE_NAMES include Read-Only. |
| `src/pages/system/SystemRoles.tsx` | Show only canonical roles; permissionDetails from API; warning banner if non-canonical roles exist. |
| `server/package.json` | Added `db:migrate-roles` script. |

### Safety checks
- **Last System Admin**: Cannot reduce System Admin role permissions when only one user has that role; cannot change a user’s role from System Admin to another when they are the only System Admin; cannot delete or deactivate the last System Admin user (existing guards in `system/users.js` and `system/roles.js`).
- **System routes**: requireSystemPermission and requireAnySystemPermission still enforce permission codes; System Admin bypasses. Permissions are loaded from `role_permissions` (join) with fallback to `Role.permissions`.

### App boot and permission matrix
- After running seed and/or migration, start the app and open **System → Roles & Permissions**. Only canonical roles should appear; if any non-canonical roles remain, a warning banner is shown. The permission matrix API (`GET /api/system/roles/permission-matrix`) uses `role_permissions` as source of truth (with fallback to `Role.permissions`).
