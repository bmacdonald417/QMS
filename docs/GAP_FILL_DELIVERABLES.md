# Gap Fill Deliverables – ISO/GxP Inspection Readiness

Summary of files **changed/added** and **why**, for the five priority gap fills.

---

## 1. Change Control module (same maturity as CAPA)

| File | Change | Why |
|------|--------|-----|
| **server/prisma/schema.prisma** | Added enums `ChangeControlStatus`, `ChangeTaskType`, `ChangeTaskStatus`; extended `ChangeControl` (changeId unique, status enum, ownerId, siteId, departmentId, dueDate, closedAt, isArchived); added `ChangeControlTask`, `ChangeControlHistory`, `ChangeControlSignature`; added `changeRetentionYears` to `RetentionPolicy`; added User/Site/Department relations for Change Control. | Full workflow and audit trail for change control. |
| **server/src/changeControls.js** | **New.** List (filters, pagination), create (CC-YYYY-NNNN), get one (with tasks, history, signatures, attachments, links), update (with reason), transition (allowed map), tasks create/complete, file upload (POST :id/files), entity links (POST :id/link, GET :id/links), GET :id/readiness. RBAC (change:view, change:create, change:update, change:assign_tasks, change:close), Zod, createAuditLog + change_control_history, reason on regulated actions. | CAPA-parity API for change control. |
| **server/src/seed.js** | Added permissions: change:view, change:create, change:update, change:assign_tasks, change:close; document:view. Assigned to System Admin, Admin, Quality Manager, Manager (partial), User (view). | RBAC for change control and file/document view. |
| **server/src/index.js** | Mounted `app.use('/api/change-controls', authMiddleware, changeControlRoutes)`. | Expose change control API. |
| **server/src/tasks.js** | Fetches `changeControlTask` where assignedToId = current user and status in PENDING/IN_PROGRESS/OVERDUE; appends to response with `type: 'CHANGE_TASK'`, changeId, link. | Unified “My Tasks” includes change control tasks. |
| **server/src/periodicReviewScheduler.js** | Mark change control tasks overdue (dueDate < now); notify assignee and CC owner. Set `isArchived` for closed change controls older than `changeRetentionYears`. | Overdue and retention for change control. |
| **server/src/system/retention.js** | Added `changeRetentionYears` to update schema for PUT retention. | Configure change control retention. |

---

## 2. Generalize /api/files/:fileId authorization

| File | Change | Why |
|------|--------|-----|
| **server/src/files.js** | GET /:fileId: branch on `link.entityType` — CAPA → require capa:view and CAPA exists; CHANGE_CONTROL → require change:view and ChangeControl exists; DOCUMENT → require document:view and Document exists. DELETE /:fileId: same entity checks for delete permission (capa:update, change:update, document.create). | File downloads work for CAPA, Change Control, and Documents with correct RBAC. |

---

## 3. Expand regulated audit coverage

| File | Change | Why |
|------|--------|-----|
| **server/src/documents.js** | Import `createAuditLog`, `getAuditContext`. After submit-for-review: `DOCUMENT_SUBMITTED_FOR_REVIEW`. After review rejected: `DOCUMENT_REVIEW_REJECTED`. After review completed: `DOCUMENT_REVIEW_COMPLETED`. After approve: `DOCUMENT_APPROVED`. After quality-release: `DOCUMENT_QUALITY_RELEASED`. After revise: `DOCUMENT_REVISION_CREATED`. Reason from req.body.reason or req.body.comments. | Audit trail for document workflow transitions. |
| **server/src/training.js** | Import createAuditLog, getAuditContext. After training complete: `TRAINING_COMPLETED` with before/after, reason (req.body.reason). | Audit for training completion (compliance state). |
| **server/src/periodicReviews.js** | Import createAuditLog, getAuditContext. After periodic review complete: `PERIODIC_REVIEW_COMPLETED` with before/after, reason (req.body.reason). | Audit for periodic review completion. |

---

## 4. Readiness endpoints

| File | Change | Why |
|------|--------|-----|
| **server/src/capas.js** | GET /:id/readiness — returns capaId, capaNumber, status, readyForClosure, unmet[]. Unmet: TASKS_INCOMPLETE, TASKS_OVERDUE, APPROVAL_MISSING (plan approval / closure signature), REQUIREMENT_MISSING (corrective, effectiveness). | Inspector-ready view of CAPA gaps. |
| **server/src/changeControls.js** | GET /:id/readiness — returns changeControlId, changeId, status, readyForClosure, unmet[]. Unmet: TASKS_INCOMPLETE, TASKS_OVERDUE, EVIDENCE_MISSING (no attachments when PENDING_CLOSURE). | Inspector-ready view of change control gaps. |

---

## 5. Dashboard metrics

| File | Change | Why |
|------|--------|-----|
| **server/src/dashboard.js** | CAPA: openByStatus (groupBy status for non-closed), overdueTasks (capa_tasks overdue), averageCycleTimeDays (createdAt to closedAt for CLOSED). Change Control: openByStatus, overdueTasks. Response now includes `capa` and `changeControl` objects. | CAPA and Change Control metrics for dashboards. |

---

## Requirements compliance

- **RBAC:** All CAPA and Change Control endpoints use `requirePermission(...)`; file GET/DELETE enforce entity-specific permissions.
- **Zod:** Change control and CAPA inputs validated with zod; documents/training/periodicReviews use existing validation plus audit.
- **Reason:** Regulated writes (update, transition, task complete, document submit/review/approve/release/revise, training complete, periodic review complete) support reason (body.reason or body.comments) and pass it to createAuditLog where applicable.
- **Append-only history:** capa_history and change_control_history only created (never updated/deleted) from application code.

---

## Migration note

Existing `change_controls` rows have `status` as a string. After applying the schema (e.g. `npx prisma db push`), you may need to backfill status for existing rows to a valid enum value (e.g. DRAFT or CLOSED) if the column is now an enum. Run `npx prisma db push` (or create a migration) and fix any data if needed.
