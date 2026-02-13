# CAPA Module – Deliverables

## 1. Files changed/added

### Database (Prisma)
| File | Change |
|------|--------|
| `server/prisma/schema.prisma` | Added enums `CapaStatus`, `CapaTaskType`, `CapaTaskStatus`, `LinkEntityType`; extended `CAPA` model (ownerId, initiatorId, severity, site, department, rootCause, containment/corrective/preventive/effectiveness fields, dueDate, closedAt, isArchived); added `CapaTask`, `CapaHistory`, `CapaSignature`, `FileAsset`, `FileLink`, `EntityLink`; added `requireForCapaPlanApproval` to `ESignConfig`; added User/Site/Department relations for CAPA. |

### Backend
| File | Change |
|------|--------|
| `server/src/capas.js` | **New.** CAPA CRUD, list with filters/pagination, transition, tasks CRUD, task complete, approve-plan, close, file upload (POST :id/files), entity links; RBAC via `requirePermission`; Zod validation; `createAuditLog` + `capa_history` on all writes; reason required on regulated actions; e-sign for approve-plan/close when config requires. |
| `server/src/capas.test.js` | **New.** Unit tests for transition validation (invalid/valid). |
| `server/src/files.js` | **New.** GET /api/files/:fileId (serve file with RBAC), DELETE /api/files/:fileId (soft delete + audit). |
| `server/src/seed.js` | Added permission codes: capa:view, capa:create, capa:update, capa:assign_tasks, capa:approve_plan, capa:close, capa:esign, capa:export, file:upload, file:download, file:delete. Assigned to System Admin, Admin, Quality Manager (and partial for Manager/User). |
| `server/src/tasks.js` | Updated GET /api/tasks to return document assignments and CAPA tasks with unified shape and `type`: 'DOCUMENT_ASSIGNMENT' \| 'CAPA_TASK'. |
| `server/src/periodicReviewScheduler.js` | Mark CAPA tasks overdue when dueDate < now; notify assignee and owner; CAPA retention stub: set `isArchived` for closed CAPAs past `capaRetentionYears`. |
| `server/src/index.js` | Mounted `app.use('/api/capas', authMiddleware, capaRoutes)` and `app.use('/api/files', authMiddleware, fileRoutes)`. |
| `server/src/system/esign.js` | Added `requireForCapaPlanApproval` to GET/PUT schema. |

### Frontend
| File | Change |
|------|--------|
| `src/pages/capas/CAPAList.tsx` | **New.** CAPA list with status/search filters, pagination, create button, row click to detail. |
| `src/pages/capas/CAPANew.tsx` | **New.** Create CAPA form (title, description, status, owner, severity, due date). |
| `src/pages/capas/CAPADetail.tsx` | **New.** CAPA detail with tabs: Overview, Tasks, Evidence/Files, History, Links, Approvals/Closure; reason modal for status transition; e-sign modals for approve-plan and close. |
| `src/pages/capas/index.ts` | **New.** Exports CAPAList, CAPANew, CAPADetail. |
| `src/App.tsx` | Routes: /capas (list), /capas/new (create), /capas/:id (detail); /capa redirects to /capas. |
| `src/lib/sidebarConfig.tsx` | CAPA link path changed from /capa to /capas. |
| `src/pages/placeholders/MyTasks.tsx` | Replaced placeholder with real “My Tasks”: fetches /api/tasks, shows document assignments and CAPA tasks with type discriminator and “Open” link. |

---

## 2. How to use CAPA (walkthrough)

1. **Apply database changes**  
   From `server/`: run `npx prisma db push` (or `npx prisma migrate dev` if you use migrations). Then run `node src/seed.js` to add CAPA/file permissions and assign them to roles.

2. **Create a CAPA**  
   Log in as a user with `capa:create` (e.g. Quality Manager or Admin). Go to **CAPA** in the sidebar → **New CAPA**. Enter title and description, choose Draft or Open, optionally severity/due date/owner → **Create CAPA**. You are taken to the CAPA detail page.

3. **Workflow (status transitions)**  
   On the CAPA detail page, open the **Overview** tab. Use **Change status** to move through lifecycle: e.g. DRAFT → OPEN → CONTAINMENT → INVESTIGATION → RCA_COMPLETE → PLAN_APPROVAL → IMPLEMENTATION → EFFECTIVENESS_CHECK → PENDING_CLOSURE → CLOSED. Each transition requires a **Reason for change** (audit).

4. **Tasks**  
   Use the **Tasks / Actions** tab to see tasks. To add tasks, use the API: `POST /api/capas/:id/tasks` with body `{ "tasks": [{ "taskType": "CORRECTIVE_ACTION", "title": "...", "assignedToId": "user-uuid", "dueDate": "..." }], "reason": "..." }`. Assignees and the CAPA owner get notifications; **My Tasks** shows both document assignments and CAPA tasks.

5. **Evidence / files**  
   Attach files via API: `POST /api/capas/:id/files` (multipart, field `file`). Optionally send `purpose` (e.g. evidence, report). On the **Evidence / Files** tab, use **Download** to retrieve files (authenticated).

6. **Approvals and closure**  
   - **Approve plan:** When status is PLAN_APPROVAL, open **Approvals / Closure** → **Approve plan**. If e-sign is required (system config), enter your password to sign.  
   - **Close CAPA:** When status is PENDING_CLOSURE, ensure at least one corrective action and effectiveness check are completed (or waived with justification). Use **Close CAPA** and, if required, provide e-sign password.

7. **Links**  
   Link a CAPA to documents, change controls, or training via API: `POST /api/capas/:id/link` with `{ "targetType": "DOCUMENT", "targetId": "uuid", "linkType": "related" }`. View links on the **Links** tab.

8. **My Tasks**  
   Go to **My Tasks** (sidebar) to see all pending document assignments and CAPA tasks assigned to you. Use **Open** to go to the document or CAPA.

---

## 3. Environment variables (upload storage)

| Variable | Description | Default |
|----------|-------------|--------|
| `UPLOAD_DIR` | Directory for uploaded files (CAPA attachments). Must be writable by the server. | `./uploads` (relative to server process cwd) |

Files are stored under `UPLOAD_DIR/capa/<capaId>/<uuid>-<filename>`. To switch to S3 later, replace the multer disk storage in `server/src/capas.js` with an S3 upload and keep the same `FileAsset` / `FileLink` records; adjust `server/src/files.js` to generate signed URLs or proxy from S3.

---

## 4. Tests (minimum)

- **Transition validation:** Run `node src/capas.test.js` from `server/`. Checks that invalid transitions (e.g. DRAFT → CLOSED) are rejected and valid ones (e.g. DRAFT → OPEN) are allowed.
- **Permission checks:** CAPA create/update/close require `capa:create`, `capa:update`, `capa:close`; endpoints return 403 when the user lacks the permission.
- **Audit log:** On CAPA update (PUT) and task completion (POST complete), `createAuditLog` is called with before/after and reason; entries appear in `audit_logs` and in CAPA **History** tab.
