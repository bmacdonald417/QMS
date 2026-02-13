# Change Control Compliance Maturity – Deliverables

## 1. Files changed/added and why

| File | Change | Why |
|------|--------|-----|
| **server/prisma/schema.prisma** | Added enums `ChangeType`, `RiskLevel`; added to `ChangeControl`: `changeType`, `riskLevel`, `implementationPlan`, `verificationSummary`, `effectiveDate`, index on `changeType`; added to `ChangeControlTask`: `requiresEsign`; added to `ESignConfig`: `requireForChangeApproval`, `requireForChangeClosure` | Schema upgrades for change type/risk, implementation/verification, effective date, task-level e-sign, and global e-sign policy for approval/closure. |
| **server/src/seed.js** | Added permission codes `change:approve`, `change:esign`; granted `change:approve`, `change:esign` to System Admin, Admin, Quality Manager | RBAC for formal approval and e-sign on change control. |
| **server/src/changeControls.js** | Added `bcrypt`, `createHash`, `sha256`, `hasPermission`; extended task create schema with `requiresEsign`; added **PUT `/:id/tasks/:taskId`** (update task, reason, history TASK_UPDATED, audit, notify on reassign); extended **POST `/:id/tasks/:taskId/complete`** with optional `password`, e-sign when `task.requiresEsign` or esign config for APPROVAL/CLOSURE_REVIEW, create `ChangeControlSignature` when required; added **POST `/:id/approve`** (meaning, reason, password, optional status→IMPLEMENTATION); added **POST `/:id/close`** (readiness: PENDING_CLOSURE, all IMPLEMENTATION completed, effectiveness or waiver, approval signature when required, e-sign when requireForChangeClosure); extended **PUT `/:id`** body with `changeType`, `riskLevel`, `implementationPlan`, `verificationSummary`, `effectiveDate`; **POST `/:id/link`** now creates history `LINK_CREATED`; **POST `/:id/files`** history action set to `FILE_ADDED`; task create notifies owner as well as assignees | Compliance parity with CAPA: regulated actions use transaction, history, audit, reason; e-sign for approval/closure and task completion when configured. |
| **server/src/system/esign.js** | Added `requireForChangeApproval`, `requireForChangeClosure` to update schema and config response | System UI can read/update change-control e-sign settings. |
| **server/src/tasks.js** | Unified GET `/api/tasks` response: added `entityLabel` and `dueDate` (where applicable) to document, CAPA, and change control task items | Single tasks list with type, id, title, dueDate, status, entityLabel, link. |
| **server/src/files.js** | After soft-deleting a file, if `fileLink.entityType === 'CHANGE_CONTROL'`, create `ChangeControlHistory` with action `FILE_DELETED` and details | Audit trail when evidence is removed from a change control (same idea as CAPA). |
| **docs/CHANGE_CONTROL_MATURITY_DELIVERABLES.md** | New | This deliverable: file list and flow guide. |

**Existing behavior retained**

- **server/src/changeControls.js**: GET list, POST create, GET `:id`, PUT `:id`, **POST `/:id/transition`** and `VALID_TRANSITIONS` unchanged; POST `:id/tasks` (batch), POST `:id/tasks/:taskId/complete`, POST `:id/files`, POST `:id/link`, GET `:id/links`, GET `:id/readiness` already present and extended as above.
- **server/src/periodicReviewScheduler.js**: Already marks Change Control tasks OVERDUE and notifies assignee/owner; no change.
- **server/src/files.js**: GET `/api/files/:fileId` already authorizes CHANGE_CONTROL via `change:view` and entity lookup; no change.

**Migration**

- Run: `npx prisma migrate dev --name change_control_maturity_esign_cc_fields` (or `npx prisma db push` in dev) after pulling. New columns and enums will be created.

---

## 2. How to use Change Control (flow guide)

### Permissions

- **change:view** – List and open change controls.
- **change:create** – Create new change control (DRAFT).
- **change:update** – Edit fields, use status **transition** (DRAFT→SUBMITTED→…→PENDING_CLOSURE), add links.
- **change:assign_tasks** – Create/update/complete tasks.
- **change:approve** – Use **approve** endpoint (formal approval + optional e-sign).
- **change:close** – Use **close** endpoint (with readiness and optional e-sign).
- **change:esign** – Provide password/signature when e-sign is required.
- **file:upload** / **file:delete** – Attach/remove evidence files.

### Typical flow

1. **Create** – `POST /api/change-controls` with title, description, optional riskAssessment, ownerId, dueDate, etc. Status is DRAFT.
2. **Edit** – `PUT /api/change-controls/:id` (requires `reason`). In DRAFT (and other open statuses) you can set changeType, riskLevel, implementationPlan, verificationSummary, effectiveDate, owner, site, department, dueDate.
3. **Status progression** – `POST /api/change-controls/:id/transition` with `{ toStatus, reason }`. Allowed transitions are in `VALID_TRANSITIONS` (e.g. DRAFT→SUBMITTED→REVIEW→APPROVAL→IMPLEMENTATION→EFFECTIVENESS→PENDING_CLOSURE→CLOSED; CANCELLED/ARCHIVED as needed).
4. **Tasks**  
   - Create: `POST /api/change-controls/:id/tasks` with `{ tasks: [{ taskType, title, description?, assignedToId?, dueDate?, requiresEsign?, stepNumber? }], reason }`.  
   - Update: `PUT /api/change-controls/:id/tasks/:taskId` with `{ title?, description?, assignedToId?, dueDate?, status?, reason }`.  
   - Complete: `POST /api/change-controls/:id/tasks/:taskId/complete` with `{ completionNotes?, reason, password? }`. If the task has `requiresEsign` or is APPROVAL/CLOSURE_REVIEW and system e-sign is on, `password` is required.
5. **Formal approval** – When in APPROVAL (or when your process expects it), `POST /api/change-controls/:id/approve` with `{ meaning: 'APPROVAL'|'QUALITY_APPROVAL'|'SECURITY_APPROVAL', reason, password? }`. If `requireForChangeApproval` is true, password is required. Optionally moves status to IMPLEMENTATION when current status is APPROVAL.
6. **Close** – When status is PENDING_CLOSURE and readiness is met:  
   - All IMPLEMENTATION tasks completed.  
   - At least one EFFECTIVENESS_CHECK completed or `waiverJustification` provided.  
   - If e-sign is required for closure, at least one approval signature must exist.  
   Then `POST /api/change-controls/:id/close` with `{ reason, password?, waiverJustification? }`. If `requireForChangeClosure` is true, password is required. Sets status to CLOSED and `closedAt`.
7. **Evidence** – `POST /api/change-controls/:id/files` (multipart, `file` + optional `purpose`) to attach files; GET `:id` includes `attachments`. Delete via `DELETE /api/files/:fileId` (writes CHANGE_CONTROL history when the file is linked to a CC).
8. **Links** – `POST /api/change-controls/:id/link` with `{ targetType, targetId, linkType }` (e.g. to CAPA, DOCUMENT, TRAINING_MODULE). `GET /api/change-controls/:id/links` returns links.
9. **Readiness** – `GET /api/change-controls/:id/readiness` returns `readyForClosure` and `unmet` (e.g. tasks incomplete, overdue, missing evidence in PENDING_CLOSURE).

### E-sign config (system)

- **requireForChangeApproval** – When true, approve endpoint and completion of APPROVAL tasks require e-sign (password).
- **requireForChangeClosure** – When true, close endpoint requires e-sign and at least one approval signature.  
Configure via `PUT /api/system/esign` (and read via `GET /api/system/esign`).

### Unified tasks (My Tasks)

- `GET /api/tasks` returns current user’s document assignments, CAPA tasks, and change control tasks in one list. Each item has `type`, `id`, `title`, `dueDate`, `status`, `entityLabel`, `link` (and type-specific fields). Use `entityLabel` (e.g. changeId, capaId, documentId) for display.

### Conventions

- All write endpoints that change data require **reason** in the body where specified and create both **ChangeControlHistory** and **createAuditLog** with **getAuditContext(req)**.  
- Writes use **prisma.$transaction** where multiple records are updated.  
- Notifications are sent to assignees and/or owner as described (e.g. task created, task completed, status change, closed).  
- API responses use `res.json({ ok: true, ... })` or `res.json({ changeControl: ... })` / `res.status(201).json({ tasks: ... })` etc.; errors use `res.status(4xx|5xx).json({ error: '...' })`.
