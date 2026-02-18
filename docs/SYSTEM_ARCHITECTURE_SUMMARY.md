# MacTech QMS — System Architecture Summary

Complete technical overview of the Quality Management System: stack, data model, modules, APIs, auth, and integrations.

---

## 1. Executive Summary

### Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Vite 5, React 18, TypeScript, React Router 6, Tailwind CSS, React Hook Form, Zod, Lucide React |
| **Backend** | Node.js, Express 4, ES modules |
| **Database** | PostgreSQL (via `DATABASE_URL`) |
| **ORM** | Prisma 6; schema at `server/prisma/schema.prisma`; applied with `prisma db push` (no migration history) |
| **Auth** | JWT (Bearer token, `JWT_SECRET`). Login returns token + user (id, name, email, roleName, permissions). No OAuth/SAML. |
| **Storage** | Local filesystem (`UPLOAD_DIR`, default `uploads/`). File metadata in DB (FileAsset, FileLink). No S3/GCS. |
| **PDF** | Puppeteer + HTML generation; Markdown rendered via `marked`. Document PDF in `server/src/pdf.js`; form-record snapshot in same file. |

### Core Domains

1. **Controlled Documents** — SOPs, policies, work instructions, forms (Document lifecycle, assignments, signatures, revision, PDF export).
2. **Completed Forms (Form Records)** — FormRecord: DRAFT/FINAL instances linked to a template Document; payload (JSON), optional PDF; separate from document approval workflow.
3. **CAPA** — Corrective/Preventive Action (CAPA, CapaTask, CapaHistory, CapaSignature, file attachments).
4. **Change Control** — ChangeControl, tasks, approvals, e-signatures, file attachments, links to documents.
5. **Training & Competency** — TrainingModule (linked to Document), UserTrainingRecord, completion tracking.
6. **System / RBAC / Audit** — Users, Roles, Permissions, SecurityPolicy, RetentionPolicy, ESignConfig, AuditLog, reference data (departments, sites, job titles).

### System of Record

- **Controlled documents:** **Document** model (`documents` table). One row per version; `(documentId, versionMajor, versionMinor)` unique. Content in `content` (text). Effective version = row with `status = EFFECTIVE` for that documentId. Revision creates a new row and sets `supersedesDocumentId`.
- **Completed form instances:** **FormRecord** model (`form_records`). Links to template via `templateDocumentId` (Document.id). Stores `payload` (JSON), status DRAFT/FINAL/VOID, optional stored PDF via `pdfFileAssetId`. No QMS approval workflow; governance can supply `approvalTrail`.

---

## 2. Directory Structure

```
QMS/
├── docs/                    # Markdown docs + this summary
├── public/
├── server/                  # Backend
│   ├── prisma/schema.prisma
│   ├── src/
│   │   ├── index.js         # App entry, route mount, requestIdMiddleware
│   │   ├── auth.js          # Login, authMiddleware, requirePermission, requireRoles
│   │   ├── audit.js         # createAuditLog, getAuditContext, requestIdMiddleware
│   │   ├── db.js            # Prisma client
│   │   ├── documents.js     # Document CRUD, lifecycle, suggest-id, templates/forms
│   │   ├── formRecords.js   # FormRecord API (list, create, get, update, finalize, PDF)
│   │   ├── pdf.js           # Document PDF + generateFormRecordPdf
│   │   ├── capas.js, changeControls.js, files.js, notifications.js, tasks.js
│   │   ├── users.js, training.js, periodicReviews.js, dashboard.js
│   │   ├── periodicReviewScheduler.js, seed.js, userAuthz.js
│   │   ├── rbac/            # permissionCatalog, roleCatalog
│   │   ├── system/          # audit, users, roles, security, reference, retention, esign
│   │   └── scripts/         # e.g. migrateRoles.js
├── src/                     # Frontend
│   ├── components/          # layout (Sidebar, Header, MainLayout), ui (Card, Table, Button, Modal, etc.), compliance (SignatureModal, etc.)
│   ├── context/             # AuthContext, AppContext
│   ├── lib/                 # api.ts, sidebarConfig.tsx, schemas
│   ├── pages/               # DocumentControl, DocumentDetail, CompletedForms, CompletedFormDetail, CAPA, ChangeControl, system/*, etc.
│   ├── store/
│   └── types/
├── package.json             # Frontend (Vite, React, TS, Tailwind)
├── server/package.json      # Backend (Express, Prisma, Puppeteer, bcrypt, etc.)
└── vite.config.ts, tailwind.config.js, tsconfig.json
```

---

## 3. Database & Data Model

**DB:** PostgreSQL. **ORM:** Prisma 6.

### Document & Lifecycle

| Model | Table | Purpose |
|-------|--------|---------|
| **Document** | documents | One version per row. documentId, versionMajor, versionMinor, documentType (SOP, POLICY, WORK_INSTRUCTION, FORM, OTHER), status (DRAFT → IN_REVIEW → APPROVED → EFFECTIVE, etc.), content, authorId, supersedesDocumentId, effectiveDate, tags, nextReviewDate. |
| **DocumentHistory** | document_history | Lifecycle events: documentId, userId, action, timestamp, details (json), digitalSignature (json). |
| **DocumentRevision** | document_revisions | Per-version summary: documentId, versionMajor, versionMinor, effectiveDate, authorId, summaryOfChange. |
| **DocumentSignature** | document_signatures | E-sign per document: documentId, signerId, signatureMeaning, signedAt, documentHash, signatureHash, passwordHash. |
| **DocumentAssignment** | document_assignments | REVIEW / APPROVAL / QUALITY_RELEASE tasks: documentId, assignedToId, assignmentType, status (PENDING, COMPLETED, REJECTED), dueDate, completedAt, comments. |
| **DocumentComment** | document_comments | Comments: documentId, userId, commentText, sectionIdentifier, status (OPEN, RESOLVED, REJECTED). |
| **DocumentLink** | document_links | Links between documents: sourceDocumentId, targetDocumentId, linkType (references, impacts, supersedes). |

### Form Records (Completed Forms)

| Model | Table | Purpose |
|-------|--------|---------|
| **FormRecord** | form_records | Instance of a filled form: recordNumber (unique), templateDocumentId → documents.id, templateCode, templateVersionMajor/Minor, title, status (DRAFT, FINAL, VOID), payload (JSON), approvalTrail (JSON, optional), governanceSource (JSON, optional), relatedEntityType, relatedEntityId, createdBy/updatedBy/finalizedBy, createdAt/updatedAt/finalizedAt/lockedAt, pdfFileAssetId (optional). |
| **FormRecordCounter** | form_record_counters | Compound (prefix, year), nextSeq; used for race-safe record numbers (e.g. FRM-013-2026-000001). |

### CAPA

| Model | Table | Purpose |
|-------|--------|---------|
| **CAPA** | capas | Corrective/preventive action: title, status, initiator, owner, assignee, due dates, etc. |
| **CapaTask** | capa_tasks | Tasks linked to CAPA. |
| **CapaHistory** | capa_history | CAPA lifecycle events. |
| **CapaSignature** | capa_signatures | E-sign for CAPA (signatureMeaning, documentHash, signatureHash, etc.). |

### Change Control

| Model | Table | Purpose |
|-------|--------|---------|
| **ChangeControl** | change_controls | Change record: title, status, initiator, owner, type, risk level, etc. |
| **ChangeControlTask** | change_control_tasks | Tasks. |
| **ChangeControlHistory** | change_control_history | Lifecycle events. |
| **ChangeControlSignature** | change_control_signatures | E-sign for change control. |

### Files

| Model | Table | Purpose |
|-------|--------|---------|
| **FileAsset** | file_assets | storageKey, filename, contentType, sizeBytes, sha256, uploadedById, isDeleted. |
| **FileLink** | file_links | fileAssetId, entityType (DOCUMENT, CAPA, CHANGE_CONTROL, etc.), entityId, purpose. |

FormRecord can reference one stored PDF via **pdfFileAssetId** → FileAsset (one-to-one).

### Users & RBAC

| Model | Table | Purpose |
|-------|--------|---------|
| **User** | users | email, password, roleId, firstName, lastName, departmentId, siteId, jobTitle, status (ACTIVE, INACTIVE, LOCKED), mfaEnabled, tokenVersion, etc. |
| **Role** | roles | name (unique), permissions (string[]). Canonical: System Admin, Quality Manager, Manager, User, Read-Only. |
| **Permission** | permissions | code (e.g. document:view, form_records:create), description. |
| **RolePermission** | role_permissions | (roleId, permissionId). Seed/migration syncs with permissionCatalog + roleCatalog. |

### Audit & System

| Model | Table | Purpose |
|-------|--------|---------|
| **AuditLog** | audit_logs | userId, action, entityType, entityId, beforeValue, afterValue (json), reason, ip, userAgent, requestId, createdAt. Append-only. |
| **SecurityPolicy** | security_policies | Policy config. |
| **RetentionPolicy** | retention_policies | Retention config. |
| **ESignConfig** | e_sign_configs | E-sign config. |
| **Department** | departments | Reference. |
| **Site** | sites | Reference. |
| **JobTitle** | job_titles | Reference. |

Other: InviteToken, PasswordResetToken, Notification, TrainingModule, UserTrainingRecord, PeriodicReview, EntityLink.

---

## 4. Document Lifecycle (Controlled Documents)

- **Stored and enforced:** Document status on **Document**; transitions in `server/src/documents.js`.
- **Flow:**
  - **DRAFT** → Submit for review (reviewer + approver IDs) → **IN_REVIEW**. DocumentAssignment rows created (REVIEW, APPROVAL).
  - **IN_REVIEW** → Reviewers POST review (APPROVED_WITH_COMMENTS / REQUIRES_REVISION). If REQUIRES_REVISION → back to DRAFT. When all reviews done, approver POSTs approve (password → e-sign) → **APPROVED** (DocumentSignature created). Manager cannot approve own document.
  - **APPROVED** → Quality release (Quality Manager/System Admin) → **EFFECTIVE** (effectiveDate set).
  - **EFFECTIVE** → Revise (major/minor) → new Document row in **DRAFT** with next version, DocumentRevision record; optional Change Control.
- **Effective version:** Single row with `status = EFFECTIVE` for that documentId (no separate “current” pointer).
- **Hashes:** Document hash = SHA-256 of content at sign time; signature hash = SHA-256 of signature payload. Stored in DocumentSignature; displayed in Approval & Signature History section (not on document body or PDF).

---

## 5. Form Records (Completed Forms) — No QMS Approval Workflow

- **Templates:** EFFECTIVE Document rows with `documentType = FORM` (e.g. MAC-FRM-013). Fetched via GET `/api/documents/templates/forms`.
- **Instances:** **FormRecord** stores filled data (`payload` JSON), links to template via `templateDocumentId`. Status DRAFT (editable) or FINAL (locked). Optional `approvalTrail` / `governanceSource` from governance; QMS does not run approval workflow.
- **Record number:** Generated per template prefix + year (e.g. FRM-013-2026-000001) via FormRecordCounter (transaction-safe).
- **PDF:** On finalize, optional `pdfBase64` can be stored as FileAsset and linked to FormRecord. GET `/api/form-records/:id/pdf` streams stored PDF or generates a simple snapshot (metadata + payload key/value) if none stored.
- **Auth:** JWT or `X-INTEGRATION-KEY` (service integration). RBAC: form_records:view, create, update, finalize, export.

---

## 6. API Route Summary

Base: `/api`. Auth: Bearer JWT (authMiddleware) unless noted. Form records also support `X-INTEGRATION-KEY`.

### Auth
| Method | Path | Purpose |
|--------|------|---------|
| POST | /auth/login | Login → token + user |
| GET | /auth/me | Current user (auth) |

### Documents
| Method | Path | Purpose |
|--------|------|---------|
| GET | /documents | List all |
| GET | /documents/suggest-id?documentType= | Next suggested document ID for type |
| GET | /documents/templates/forms | List EFFECTIVE FORM documents (template picker) |
| GET | /documents/search | Search by query/tags |
| GET | /documents/:id | Detail (assignments, history, revisions, signatures, links, comments) |
| GET | /documents/:id/pdf | Generate document PDF |
| GET | /documents/:id/links | List links |
| POST | /documents/:id/link | Create link |
| GET | /documents/:id/comments | List comments |
| POST | /documents/:id/comment | Add comment |
| PUT | /documents/comments/:commentId | Update comment |
| POST | /documents | Create draft (optional documentId override) |
| PUT | /documents/:id | Update draft |
| POST | /documents/:id/submit-review, /submit | Submit for review |
| POST | /documents/:id/review | Complete review |
| POST | /documents/:id/approve | Approve (e-sign) |
| POST | /documents/:id/quality-release, /release | Quality release |
| POST | /documents/:id/initiate-periodic-review | Start periodic review |
| POST | /documents/:id/revise | New version (major/minor) |

### Form Records
| Method | Path | Purpose |
|--------|------|---------|
| GET | /form-records | List (templateCode, status, q, startDate, endDate, page, limit) |
| POST | /form-records | Create DRAFT (templateDocumentId or templateCode, optional relatedEntity*) |
| GET | /form-records/:id | Get one |
| PUT | /form-records/:id | Update DRAFT (payload, title, etc.) |
| POST | /form-records/:id/finalize | Set FINAL; optional payload, pdfBase64, approvalTrail |
| GET | /form-records/:id/pdf | Stream stored PDF or generate snapshot (export) |

### CAPA, Change Control, Files, Training, Periodic Reviews
- CAPA: /api/capas (CRUD, transition, tasks, files, approve-plan, close, link, readiness).
- Change Control: /api/change-controls (CRUD, transition, tasks, approve, close, files, link, readiness).
- Files: /api/files (stream/delete by fileId; upload via CAPA/Change Control endpoints).
- Training: /api/training/modules, /my-assignments, /complete/:assignmentId.
- Periodic reviews: /api/periodic-reviews (my-reviews, complete).

### System
- Audit: GET /system/audit (list), /system/audit/export (csv/json), /system/audit/:id.
- Users: GET/POST/PUT/DELETE /system/users, invite.
- Roles: GET/POST/PUT /system/roles.
- Security, reference (departments, sites, job titles), retention, e-sign, dashboard: under /system.

### Other
- /api/notifications, /api/tasks, /api/dashboard/metrics, /api/users, /api/health.

---

## 7. Audit Trail & Compliance

- **Where:** **AuditLog** (audit_logs). Written via `createAuditLog()` in `server/src/audit.js` (append-only).
- **What:** userId, action, entityType, entityId, beforeValue, afterValue (json), reason, ip, userAgent, requestId, createdAt. requestId from header or generated (requestIdMiddleware).
- **Document actions:** e.g. DOCUMENT_SUBMITTED_FOR_REVIEW, DOCUMENT_APPROVED, DOCUMENT_REVISION_CREATED.
- **FormRecord actions:** FORM_RECORD_CREATED, FORM_RECORD_UPDATED, FORM_RECORD_FINALIZED, FORM_RECORD_VIEWED, FORM_RECORD_EXPORTED.
- **Retrieval:** GET /system/audit (paginated filters: entityType, entityId, userId, action, startDate, endDate); export CSV/JSON. Requires auditlog:view.

---

## 8. RBAC (Roles & Permissions)

- **Catalog:** `server/src/rbac/permissionCatalog.js` (code + description). `roleCatalog.js` maps canonical role names to permission codes.
- **Canonical roles:** System Admin, Quality Manager, Manager, User, Read-Only. System Admin has all permissions. Quality Manager has document, CAPA, change, users, audit, file, form_records (view, create, update, finalize, export), etc.
- **Enforcement:** `requirePermission(code)` and `requireRoles(...names)` in auth.js. Form records use `formRecordAuth` + `requireFormRecordPermission(code)` (or integration key bypass with audit user).
- **Permission examples:** document:view, document:create, document:approve, document:release; form_records:view, form_records:create, form_records:update, form_records:finalize, form_records:export; capa:*, change:*, users:*, auditlog:view, file:upload, etc.

---

## 9. Frontend Structure

- **Routing:** React Router in App.tsx. Paths: /, /login, /documents, /documents/:id, /completed-forms, /completed-forms/:id, /capas, /change-control, /training, /periodic-reviews, /audits, /system/*, etc.
- **Sidebar:** Role-based via `getSidebarItemsForRole(roleName)` (sidebarConfig.tsx). “Completed Forms” for Quality Manager, Manager, System Admin.
- **Auth:** AuthContext (token, user, login). Protected routes use ProtectedLayout; API calls send Bearer token.
- **Key pages:** DocumentControl (list + create draft), DocumentDetail (lifecycle, review, approve, release, revise, Approval & Signature History with hash display), CompletedForms (list + filters + new from template), CompletedFormDetail (payload editor, save draft, finalize, export PDF), CAPAList/CAPADetail, ChangeControl list/detail, System (users, roles, audit, security, reference, retention, e-sign).

---

## 10. PDF Generation

- **Documents:** `server/src/pdf.js` — buildHtml from document content (Markdown), signatures, revisions; Puppeteer with displayHeaderFooter (header: title/doc id, footer: Page X of Y). @page margin and body layout keep content out of header/footer.
- **Form record snapshot:** `generateFormRecordPdf(record)` — simple HTML: metadata (templateCode, recordNumber, status, created) + payload as key/value table; Puppeteer to PDF. Used when GET /form-records/:id/pdf has no stored PDF.

---

## 11. Integration Notes

- **REST:** JSON APIs under /api; JWT Bearer. Form records also accept `X-INTEGRATION-KEY` (env INTEGRATION_KEY) for service calls; audit uses INTEGRATION_AUDIT_USER_ID or first System Admin.
- **Templates by code:** GET /documents/templates/forms returns EFFECTIVE FORM documents. Resolve by documentId (e.g. MAC-FRM-013) via list or by adding a by-code endpoint if needed.
- **Completed form storage:** FormRecord API (POST /form-records, PUT, POST finalize) stores instances; link to template via templateDocumentId. No QMS approval; approvalTrail can be supplied by governance.
- **Webhooks/events:** None in codebase.
- **Export:** Audit export (CSV/JSON). Document PDF on demand. Form record PDF stream or generated snapshot.

---

## 12. File Inventory (Key Files)

| Area | Files |
|------|--------|
| **Schema / DB** | server/prisma/schema.prisma |
| **Document workflow** | server/src/documents.js, server/src/pdf.js |
| **Form records** | server/src/formRecords.js |
| **Auth / RBAC** | server/src/auth.js, server/src/rbac/permissionCatalog.js, server/src/rbac/roleCatalog.js |
| **Audit** | server/src/audit.js, server/src/system/audit.js |
| **CAPA / Change** | server/src/capas.js, server/src/changeControls.js |
| **Files** | server/src/files.js (serve/delete); upload in capas.js, changeControls.js, formRecords.js (finalize with pdfBase64) |
| **App entry** | server/src/index.js |
| **Frontend** | src/App.tsx, src/lib/sidebarConfig.tsx, src/pages/DocumentDetail.tsx, CompletedForms.tsx, CompletedFormDetail.tsx, capas/, system/ |

---

*End of System Architecture Summary. Reflects current codebase including FormRecord, Completed Forms UI, document templates/forms endpoint, suggest-id, and signature hash display in approvals.*
