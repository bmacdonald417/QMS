# MacTech QMS – System Sweep: API & PostgreSQL Database

Complete mapping of **API endpoints** (functions) and their **PostgreSQL tables** (Prisma schema).

---

## 1. PostgreSQL Database (Prisma Schema)

**Datasource:** `postgresql` via `DATABASE_URL`.

### 1.1 Enums

| Enum | Values |
|------|--------|
| `DocumentType` | SOP, POLICY, WORK_INSTRUCTION, FORM, OTHER |
| `DocumentStatus` | DRAFT, IN_REVIEW, APPROVED, PENDING_APPROVAL, PENDING_QUALITY_RELEASE, EFFECTIVE, OBSOLETE, ARCHIVED |
| `AssignmentTaskType` | REVIEW, APPROVAL, QUALITY_RELEASE |
| `AssignmentStatus` | PENDING, COMPLETED, REJECTED |
| `UserStatus` | ACTIVE, INACTIVE, LOCKED |
| `DocumentCommentStatus` | OPEN, RESOLVED, REJECTED |
| `TrainingRecordStatus` | ASSIGNED, IN_PROGRESS, COMPLETED, OVERDUE |
| `PeriodicReviewStatus` | PENDING, COMPLETED, OVERDUE |

### 1.2 Tables (Prisma models → `@@map`)

| Table (DB) | Model | Purpose |
|------------|--------|---------|
| `roles` | Role | Role name + permissions (string array). |
| `permissions` | Permission | Permission code + description (RBAC). |
| `role_permissions` | RolePermission | Many-to-many Role ↔ Permission. |
| `departments` | Department | Department name, code, isActive. |
| `sites` | Site | Site/location name, code, isActive. |
| `job_titles` | JobTitle | Job title name, isActive. |
| `users` | User | User account: name, email, password, roleId, departmentId, siteId, jobTitle, status, mfaEnabled, lastLoginAt, lockedAt, mustChangePassword, invitedAt, tokenVersion. |
| `audit_logs` | AuditLog | Append-only audit: userId, action, entityType, entityId, beforeValue, afterValue, reason, ip, userAgent, requestId, createdAt. |
| `invite_tokens` | InviteToken | Invite token (hashed), email, expiresAt, consumedAt, createdById. |
| `password_reset_tokens` | PasswordResetToken | Reset token (hashed), userId, expiresAt, consumedAt. |
| `security_policies` | SecurityPolicy | Single-row: password/session/MFA policy (length, complexity, lockout, timeout, mfaPolicy, allowedDomains). |
| `retention_policies` | RetentionPolicy | Single-row: auditLogRetentionYears, documentRetentionYears, trainingRetentionYears, capaRetentionYears. |
| `esign_config` | ESignConfig | Single-row: requireForDocumentApproval, requireForCapaClosure, requireForTrainingSignOff. |
| `documents` | Document | Document: documentId, title, documentType, versionMajor, versionMinor, effectiveDate, status, content, authorId, supersedesDocumentId, tags, nextReviewDate, isUnderReview. |
| `document_links` | DocumentLink | Where-used: sourceDocumentId, targetDocumentId, linkType. |
| `document_comments` | DocumentComment | Comment: documentId, userId, commentText, sectionIdentifier, status. |
| `document_history` | DocumentHistory | Document lifecycle events: documentId, userId, action, timestamp, details, digitalSignature. |
| `document_revisions` | DocumentRevision | Revision metadata: documentId, versionMajor/Minor, effectiveDate, authorId, summaryOfChange. |
| `document_signatures` | DocumentSignature | E-sign: documentId, signerId, signatureMeaning, signedAt, documentHash, signatureHash, passwordHash. |
| `document_assignments` | DocumentAssignment | Review/approval/release assignments: documentId, assignedToId, assignmentType, status, dueDate, completedAt, comments. |
| `training_modules` | TrainingModule | Training module: documentId, title, description, requiredRoles, dueDate. |
| `user_training_records` | UserTrainingRecord | User’s training: trainingModuleId, userId, status, completionDate, score, assignedAt. |
| `periodic_reviews` | PeriodicReview | Periodic review: documentId, reviewDate, status, reviewerId, completedAt. |
| `notifications` | Notification | In-app notification: userId, message, read, link. |
| `change_controls` | ChangeControl | Change control record: title, changeId, description, riskAssessment, status, initiatorId. |
| `capas` | CAPA | CAPA record: title, capaId, description, rootCause, status, assigneeId. |

---

## 2. API Endpoints and Database Usage

Base URL for API: `/api`. All routes under `/api/*` except `/api/auth/login` and `/api/health` use **auth middleware** (JWT Bearer). System routes additionally use **requestId** and **RBAC** (system role/permission).

---

### 2.1 Auth – `server/src/auth.js`  
**Mount:** `app.use('/api/auth', authRoutes)`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| POST | `/api/auth/login` | Login: validate email/password, check status/lockedAt, set lastLoginAt, issue JWT (userId, roleName, tokenVersion). | **users** (read, update lastLoginAt) |

**Other:** `GET /api/auth/me` is mounted in `index.js` (authMiddleware) → returns `req.user` (from JWT + **users** + **roles**).

---

### 2.2 Documents – `server/src/documents.js`  
**Mount:** `app.use('/api/documents', authMiddleware, documentRoutes)`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/documents` | List all documents with author. | **documents** |
| GET | `/api/documents/search` | Full-text search + optional tag filter (query, tags). | **documents** |
| PUT | `/api/documents/comments/:commentId` | Update comment status (OPEN/RESOLVED/REJECTED). | **document_comments** |
| GET | `/api/documents/:id/pdf` | Generate PDF for document (signatures, revisions). | **documents**, **document_signatures**, **document_revisions** |
| GET | `/api/documents/:id` | Get one document with assignments, history, revisions, signatures, trainingModules. | **documents**, **document_assignments**, **document_history**, **document_revisions**, **document_signatures**, **training_modules** |
| GET | `/api/documents/:id/links` | List links where document is source or target. | **document_links**, **documents** |
| POST | `/api/documents/:id/link` | Create document link (sourceDocumentId, targetDocumentId, linkType). | **document_links** |
| GET | `/api/documents/:id/comments` | List comments for document. | **document_comments** |
| POST | `/api/documents/:id/comment` | Add comment (commentText, sectionIdentifier). | **document_comments** |
| POST | `/api/documents/:id/initiate-periodic-review` | Create PeriodicReview for document, notify reviewer. | **periodic_reviews**, **documents**, **notifications** |
| POST | `/api/documents` | Create new draft document + first revision. | **documents**, **document_revisions**, **document_history** |
| PUT | `/api/documents/:id` | Update document (title, content, documentType, tags, nextReviewDate, isUnderReview). | **documents**, **document_history** |
| POST | `/api/documents/:id/submit-review` or `/submit` | Submit for review: set IN_REVIEW, create REVIEW + APPROVAL assignments. | **documents**, **document_assignments**, **document_history**, **notifications** |
| POST | `/api/documents/:id/review` | Reviewer decision: APPROVED_WITH_COMMENTS or REQUIRES_REVISION; complete assignment. | **documents**, **document_assignments**, **document_history** |
| POST | `/api/documents/:id/approve` | Approver: digital signature, set APPROVED or PENDING_QUALITY_RELEASE. | **documents**, **document_assignments**, **document_signatures**, **document_history** |
| POST | `/api/documents/:id/quality-release` or `/release` | Quality release: signature, set EFFECTIVE; obsolete other versions; create TrainingModule + UserTrainingRecords + notifications. | **documents**, **document_assignments**, **document_signatures**, **document_history**, **document_revisions**, **training_modules**, **user_training_records**, **notifications** |
| POST | `/api/documents/:id/revise` | Create new draft revision (major or minor) from effective document. | **documents**, **document_revisions**, **document_history** |

---

### 2.3 Notifications – `server/src/notifications.js`  
**Mount:** `app.use('/api/notifications', authMiddleware, notificationRoutes)`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/notifications` | List current user’s notifications (take 25), unread count. | **notifications** |
| PUT or PATCH | `/api/notifications/:id/read` | Mark notification as read. | **notifications** |

---

### 2.4 Tasks – `server/src/tasks.js`  
**Mount:** `app.use('/api/tasks', authMiddleware, taskRoutes)`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/tasks` | Pending document assignments for current user (review/approval/release). | **document_assignments**, **documents** |

---

### 2.5 Users (picker) – `server/src/users.js`  
**Mount:** `app.use('/api/users', authMiddleware, userRoutes)`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/users` | List users (id, name, email, roleName, permissions) for assignment pickers. | **users**, **roles** |

---

### 2.6 Training – `server/src/training.js`  
**Mount:** `app.use('/api/training', authMiddleware, trainingRoutes)`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/training/modules` | List all training modules with document. | **training_modules**, **documents** |
| GET | `/api/training/my-assignments` | Current user’s training records. | **user_training_records**, **training_modules**, **documents** |
| POST | `/api/training/complete/:assignmentId` | Mark UserTrainingRecord as COMPLETED. | **user_training_records** |

---

### 2.7 Periodic reviews – `server/src/periodicReviews.js`  
**Mount:** `app.use('/api/periodic-reviews', authMiddleware, periodicReviewsRoutes)`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/periodic-reviews/my-reviews` | Periodic reviews assigned to current user. | **periodic_reviews**, **documents** |
| POST | `/api/periodic-reviews/complete/:reviewId` | Mark review COMPLETED, set document nextReviewDate. | **periodic_reviews**, **documents** |

---

### 2.8 Dashboard – `server/src/dashboard.js`  
**Mount:** `app.use('/api/dashboard', authMiddleware, dashboardRoutes)`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/dashboard/metrics` | Quality health: documentsByStatus, overdueTraining, pendingReviews, averageApprovalTimeDays, documentsNearingReview. | **documents**, **periodic_reviews**, **document_history**, **user_training_records**, **training_modules** |

---

### 2.9 System – `server/src/system/index.js` + sub-routers  
**Mount:** `app.use('/api/system', systemRoutes)`  
All system routes use **authMiddleware** and **requestIdMiddleware**; sub-routers add **requireSystemRole** and often **requireSystemPermission**. Sensitive actions use **systemSensitiveLimiter**.

#### 2.9.1 System dashboard – `server/src/system/index.js`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/system/dashboard` | Counts: userCount, roleCount, auditCount. | **users**, **roles**, **audit_logs** |

#### 2.9.2 System users – `server/src/system/users.js`  
**Mount:** `router.use('/users', usersRouter)` → base `/api/system/users`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/system/users` | List users with filters (search, roleId, status, departmentId, siteId), pagination, sort. | **users**, **roles**, **departments**, **sites** |
| POST | `/api/system/users` | Create user (direct) with temporary password; audit. | **users**, **audit_logs** |
| POST | `/api/system/users/invite` | Create invite token, return invite link; audit. | **invite_tokens**, **audit_logs** |
| GET | `/api/system/users/:id` | Get one user (no password). | **users**, **roles**, **departments**, **sites** |
| PUT | `/api/system/users/:id` | Update user (name, department, site, jobTitle, roleId); audit. | **users**, **audit_logs** |
| POST | `/api/system/users/:id/deactivate` | Set user status INACTIVE; audit. | **users**, **audit_logs** |
| POST | `/api/system/users/:id/reactivate` | Set user ACTIVE, clear lockedAt; audit. | **users**, **audit_logs** |
| POST | `/api/system/users/:id/lock` | Set status LOCKED, lockedAt; audit. | **users**, **audit_logs** |
| POST | `/api/system/users/:id/unlock` | Set ACTIVE, clear lockedAt; audit. | **users**, **audit_logs** |
| POST | `/api/system/users/:id/revoke-sessions` | Increment user tokenVersion; audit. | **users**, **audit_logs** |
| POST | `/api/system/users/:id/reset-password` | Create PasswordResetToken, return reset link; audit. | **password_reset_tokens**, **audit_logs** |

#### 2.9.3 System roles – `server/src/system/roles.js`  
**Mount:** `/api/system/roles`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/system/roles` | List roles with permission details. | **roles**, **role_permissions**, **permissions** |
| GET | `/api/system/roles/permission-matrix` | Roles × permissions matrix. | **roles**, **permissions**, **role_permissions** |
| POST | `/api/system/roles` | Create role; audit. | **roles**, **audit_logs** |
| PUT | `/api/system/roles/:id` | Update role (name, permissions); guard last System Admin; audit. | **roles**, **audit_logs** |

#### 2.9.4 System audit – `server/src/system/audit.js`  
**Mount:** `/api/system/audit`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/system/audit` | List audit logs (userId, action, entityType, startDate, endDate), pagination. | **audit_logs**, **users** |
| GET | `/api/system/audit/export` | Export audit log as CSV (same filters + limit). | **audit_logs**, **users** |
| GET | `/api/system/audit/:id` | Get one audit log entry. | **audit_logs**, **users** |

#### 2.9.5 System security policies – `server/src/system/securityPolicies.js`  
**Mount:** `/api/system/security-policies`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/system/security-policies` | Get (or create default) security policy. | **security_policies** |
| PUT | `/api/system/security-policies` | Update policy; audit. | **security_policies**, **audit_logs** |

#### 2.9.6 System reference – `server/src/system/reference.js`  
**Mount:** `/api/system/reference`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/system/reference/departments` | List departments. | **departments** |
| POST | `/api/system/reference/departments` | Create department; audit. | **departments**, **audit_logs** |
| PUT | `/api/system/reference/departments/:id` | Update department; audit. | **departments**, **audit_logs** |
| GET | `/api/system/reference/sites` | List sites. | **sites** |
| POST | `/api/system/reference/sites` | Create site; audit. | **sites**, **audit_logs** |
| PUT | `/api/system/reference/sites/:id` | Update site; audit. | **sites**, **audit_logs** |
| GET | `/api/system/reference/job-titles` | List job titles. | **job_titles** |
| POST | `/api/system/reference/job-titles` | Create job title; audit. | **job_titles**, **audit_logs** |
| PUT | `/api/system/reference/job-titles/:id` | Update job title; audit. | **job_titles**, **audit_logs** |

#### 2.9.7 System retention – `server/src/system/retention.js`  
**Mount:** `/api/system/retention`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/system/retention` | Get (or create default) retention policy. | **retention_policies** |
| PUT | `/api/system/retention` | Update retention policy; audit. | **retention_policies**, **audit_logs** |
| GET | `/api/system/retention/last-backup` | Stub: last backup time (returns null). | — |

#### 2.9.8 System e-sign – `server/src/system/esign.js`  
**Mount:** `/api/system/esign`

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/system/esign` | Get (or create default) e-sign config. | **esign_config** |
| PUT | `/api/system/esign` | Update e-sign config; audit. | **esign_config**, **audit_logs** |

---

### 2.10 Health (no auth)

| Method | Path | Function | PostgreSQL tables |
|--------|------|----------|--------------------|
| GET | `/api/health` | Liveness check. | — |

---

## 3. Background / Schedulers

| Location | Function | PostgreSQL tables |
|----------|----------|--------------------|
| `server/src/periodicReviewScheduler.js` | Run on startup + daily: find documents with nextReviewDate within 30 days or overdue → create **PeriodicReview** if none open, notify reviewer; mark overdue **UserTrainingRecord** as OVERDUE. | **documents**, **periodic_reviews**, **notifications**, **user_training_records**, **training_modules** |

---

## 4. Shared / Non-route Code

| File | Function | PostgreSQL / usage |
|------|----------|--------------------|
| `server/src/db.js` | Prisma client export (generated client from `.prisma2/client`). | All tables via Prisma |
| `server/src/audit.js` | `createAuditLog()`, `requestIdMiddleware`, `getAuditContext()`. | **audit_logs** (create only) |
| `server/src/systemMiddleware.js` | `requireSystemRole`, `requireSystemPermission`, `systemSensitiveLimiter`, `auditFromRequest`, `countUsersWithRole`. | **users**, **roles** (for guards) |
| `server/src/pdf.js` | `generateDocumentPdf()` – used by GET `/api/documents/:id/pdf`. | — (receives data from caller) |
| `server/src/seed.js` | Seed roles, permissions, users, SecurityPolicy, RetentionPolicy, ESignConfig. | **permissions**, **roles**, **users**, **security_policies**, **retention_policies**, **esign_config** |

---

## 5. Quick Reference: Table → Main API Entry Points

| Table | Main API(s) |
|-------|-------------|
| users | `/api/auth/login`, `/api/users`, `/api/system/users` |
| roles | `/api/users` (via include), `/api/system/roles` |
| documents | `/api/documents`, `/api/documents/:id`, `/api/documents/search` |
| document_assignments | `/api/documents` (submit-review, review, approve, quality-release), `/api/tasks` |
| document_history | Written by document lifecycle (documents.js) |
| document_signatures | `/api/documents/:id/approve`, `/api/documents/:id/quality-release` |
| document_comments | `/api/documents/:id/comments`, PUT `/api/documents/comments/:commentId` |
| document_links | `/api/documents/:id/links`, POST `/api/documents/:id/link` |
| training_modules | `/api/training/modules`, created on quality-release |
| user_training_records | `/api/training/my-assignments`, `/api/training/complete/:id` |
| periodic_reviews | `/api/periodic-reviews`, `/api/documents/:id/initiate-periodic-review`, scheduler |
| notifications | Created by documents + system; `/api/notifications` |
| audit_logs | Append-only from system routes; `/api/system/audit` (read, export) |
| departments, sites, job_titles | `/api/system/reference/*` |
| security_policies, retention_policies, esign_config | `/api/system/security-policies`, `/api/system/retention`, `/api/system/esign` |
| invite_tokens, password_reset_tokens | `/api/system/users/invite`, `/api/system/users/:id/reset-password` |
| change_controls, capas | Schema only; no document-control API in this sweep (separate modules). |

This completes the system sweep of **functions and their locations in the API and PostgreSQL database**.
