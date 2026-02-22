# QMS Architecture Map

**Purpose:** Analysis-only “lay of the land” for the MacTech QMS (TQMS/QAMS) to support architecture assessment and integration planning with a Governance Platform. No code, config, or dependencies were modified.

---

## 1) Executive Summary

### Stack
- **Frontend:** Vite 5, React 18, TypeScript 5.6, React Router 6, Tailwind CSS, Zustand, React Hook Form, Zod, Lucide React.
- **Backend:** Node.js, Express 4, ES modules.
- **Database:** PostgreSQL (via `DATABASE_URL`).
- **ORM:** Prisma 6 (client in `server/node_modules/.prisma2/client`; schema at `server/prisma/schema.prisma`). No migration history; schema applied with `prisma db push`.
- **Auth:** JWT (Bearer token, `JWT_SECRET`). Login returns token + user (id, name, email, roleName, permissions). No OAuth/SAML in codebase.
- **Storage:** Local filesystem for uploads (`UPLOAD_DIR`, default `uploads/` under server cwd). File metadata and links in DB (FileAsset, FileLink). No S3/GCS in code.
- **PDF:** Puppeteer + HTML generation from document content (Markdown rendered via `marked`); see `server/src/pdf.js`.

### Top 5 core domains/modules
1. **Controlled Documents** — SOPs, policies, work instructions, forms (Document + lifecycle, assignments, signatures, PDF export).
2. **CAPA** — Corrective/Preventive Action (CAPA, CapaTask, CapaHistory, CapaSignature, file attachments).
3. **Change Control** — ChangeControl, tasks, approvals, e-signatures, file attachments, links to documents.
4. **Training & competency** — TrainingModule (linked to Document), UserTrainingRecord, completion tracking.
5. **System / RBAC / Audit** — Users, Roles, Permissions, SecurityPolicy, RetentionPolicy, ESignConfig, AuditLog, reference data (departments, sites, job titles).

### System of record for controlled documents and records
- **Controlled documents:** The **Document** model (table `documents`) is the system of record. Each row is one version of a document (documentId + versionMajor + versionMinor unique). Content is in `content` (text/DB). Effective version is the Document row with status EFFECTIVE for that documentId; revision creates a new row (new version) and links via `supersedesDocumentId`. No separate “document library” or file-based document store for body content.
- **Completed records / filled forms:** There is **no dedicated “completed form” or “form record” table**. Document type FORM is a controlled document (blank form template) stored like any other document (content in DB). Where filled-in form instances are stored is **unknown** (no FormRecord/CompletedForm model found); attachments can link to Document via FileLink (entityType DOCUMENT), but there is no POST endpoint in the codebase for uploading files to a document—only to CAPA and Change Control.

---

## 2) Directory Structure Map

### Repo tree (top 3 levels)
```
QMS/
├── docs/                    # Markdown docs (CAPA, Change Control, GAP, RBAC, System Management, etc.)
├── public/
├── server/                  # Backend (Node/Express)
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
├── src/                     # Frontend (Vite/React)
│   ├── components/
│   ├── context/
│   ├── lib/
│   ├── pages/
│   ├── store/
│   └── types/
├── index.html
├── package.json             # Frontend (Vite, React, TS, Tailwind)
├── server/package.json      # Backend (Express, Prisma, Puppeteer, etc.)
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

### Backend (`server/src`)
- **Root:** `index.js` (app entry, mounts routes, requestIdMiddleware, periodic review scheduler), `auth.js` (login, authMiddleware, requirePermission, requireRoles), `audit.js` (createAuditLog, getAuditContext, requestIdMiddleware), `db.js` (Prisma client), `documents.js`, `capas.js`, `changeControls.js`, `files.js`, `notifications.js`, `tasks.js`, `users.js`, `dashboard.js`, `training.js`, `periodicReviews.js`, `periodicReviewScheduler.js`, `pdf.js` (HTML→PDF for documents), `seed.js`, `userAuthz.js`.
- **rbac:** `permissionCatalog.js`, `roleCatalog.js`, `roleCatalog.test.js`.
- **system:** `index.js` (system routes + dashboard), `audit.js` (audit list/export/detail), `users.js`, `roles.js`, `securityPolicies.js`, `reference.js` (departments, sites, job titles), `retention.js`, `esign.js`, `systemMiddleware.js`.
- **scripts:** `migrateRoles.js` (RBAC seed/normalization).

No dedicated **documents**, **templates**, **forms**, **records**, or **approvals** folders; document and approval logic live in `documents.js` and in CAPA/ChangeControl routes.

### Database / Prisma
- **Location:** `server/prisma/schema.prisma`.
- **Migrations:** None (repo uses `prisma db push`). No `migrations/` directory.

### Frontend (`src`)
- **Root:** `main.tsx`, `App.tsx`, `index.css`, `vite-env.d.ts`.
- **components:** `layout/` (Header, Sidebar, MainLayout, NotificationBell, ProtectedLayout), `ui/` (Badge, Button, Card, Input, Modal, Table), `modules/compliance/` (TraceLink, AuditTrailPanel, SignatureModal), `PlaceholderPage.tsx`.
- **context:** `AuthContext.tsx`, `AppContext.tsx`.
- **lib:** `api.ts`, `sidebarConfig.tsx`, `schemas/index.ts`.
- **pages:** DocumentControl, DocumentDetail, ExecutiveDashboard, QualityHealthDashboard, SearchPage, TrainingCompetency, PeriodicReviewsPage, AuditManagement, CAPA (list/new/detail), ChangeControl (list/new/detail), RiskManagement, EquipmentAssets, SupplierQuality, LoginScreen; **system/** (SystemDashboard, SystemUsers, SystemRoles, SystemAudit, SystemSecurityPolicies, SystemReference, SystemRetention, SystemESign, SystemManagementLayout); **placeholders/** (TeamDocuments, TeamTraining, Approvals, MyTasks, MyTraining).
- **store:** `useQmsStore.ts`.
- **types:** `audit.ts`.

There are no **documents**, **templates**, **forms**, **records**, or **approvals** subfolders; document and approval UIs are under `pages/` (DocumentControl, DocumentDetail, etc.).

---

## 3) Database & Data Model Map

- **DB type:** PostgreSQL.
- **ORM:** Prisma 6.

### Tables/models relevant to controlled documents, versioning, approvals, audit, users

**Document (table `documents`)**
- **PK:** `id` (uuid).
- **Unique:** `(documentId, versionMajor, versionMinor)`.
- **Index:** `documentId`.
- **FKs:** `authorId` → users, `supersedesDocumentId` → documents (self).
- **Key fields:** documentId (e.g. MAC-SOP-014), title, documentType (enum: SOP, POLICY, WORK_INSTRUCTION, FORM, OTHER), versionMajor, versionMinor, effectiveDate, status (enum: DRAFT, IN_REVIEW, APPROVED, PENDING_APPROVAL, PENDING_QUALITY_RELEASE, EFFECTIVE, OBSOLETE, ARCHIVED), content (text), authorId, supersedesDocumentId, tags[], nextReviewDate, isUnderReview.

**DocumentHistory (table `document_history`)**
- **PK:** id. **FKs:** documentId → documents, userId → users.
- **Key fields:** documentId, userId, action, timestamp, details (json), digitalSignature (json).

**DocumentRevision (table `document_revisions`)**
- **PK:** id. **FKs:** documentId → documents, authorId → users.
- **Key fields:** documentId, versionMajor, versionMinor, effectiveDate, authorId, summaryOfChange.

**DocumentSignature (table `document_signatures`)**
- **PK:** id. **FKs:** documentId → documents, signerId → users.
- **Key fields:** documentId, signerId, signatureMeaning, signedAt, documentHash, signatureHash, passwordHash.

**DocumentAssignment (table `document_assignments`)**
- **PK:** id. **FKs:** documentId → documents, assignedToId → users.
- **Key fields:** documentId, assignedToId, assignmentType (REVIEW, APPROVAL, QUALITY_RELEASE), status (PENDING, COMPLETED, REJECTED), dueDate, completedAt, comments.

**DocumentComment (table `document_comments`)**
- **PK:** id. **FKs:** documentId → documents, userId → users.
- **Key fields:** documentId, userId, commentText, sectionIdentifier, status (OPEN, RESOLVED, REJECTED).

**DocumentLink (table `document_links`)**
- **PK:** id. **FKs:** sourceDocumentId, targetDocumentId → documents.
- **Key fields:** linkType (e.g. references, impacts, supersedes).

**Templates**
- **Unknown.** There is no separate Template table. A “form template” is a Document with documentType = FORM; content is stored in Document.content.

**Completed records (filled forms)**
- **Unknown.** No FormRecord, CompletedForm, or similar table. FileAsset + FileLink can attach files to entityType DOCUMENT, but there is no API in the codebase to upload a file to a document (upload exists only for CAPA and Change Control).

**Versioning / revision**
- **Document:** Each row is one version; (documentId, versionMajor, versionMinor) unique. Revision creates a new Document row with incremented version and supersedesDocumentId set.
- **DocumentRevision:** Summary records for each version (effectiveDate, summaryOfChange, authorId).

**Approvals / e-signatures**
- **DocumentSignature:** Stores signer, meaning, signedAt, documentHash, signatureHash, passwordHash per document.
- **DocumentAssignment:** REVIEW and APPROVAL assignments; status COMPLETED when done.
- **ChangeControlSignature / CapaSignature:** Similar pattern for change control and CAPA.

**Audit**
- **AuditLog (table `audit_logs`)**
  - **PK:** id (uuid).
  - **Indexes:** userId, entityType, createdAt.
  - **FK:** userId → users.
  - **Key fields:** userId, action, entityType, entityId, beforeValue (json), afterValue (json), reason, ip, userAgent, requestId, createdAt.

**Users / RBAC**
- **User (table `users`):** id (uuid), email (unique), password, roleId, firstName, lastName, departmentId, siteId, jobTitle, status (ACTIVE, INACTIVE, LOCKED), mfaEnabled, lastLoginAt, lockedAt, mustChangePassword, tokenVersion, etc. **FKs:** roleId → roles, departmentId → departments, siteId → sites.
- **Role (table `roles`):** id (autoincrement), name (unique), permissions (string[]).
- **Permission (table `permissions`):** id (uuid), code (unique), description.
- **RolePermission (table `role_permissions`):** composite PK (roleId, permissionId). **FKs:** roleId → roles, permissionId → permissions.

Other tables: Department, Site, JobTitle, InviteToken, PasswordResetToken, SecurityPolicy, RetentionPolicy, ESignConfig, Notification, TrainingModule, UserTrainingRecord, PeriodicReview, ChangeControl, ChangeControlTask, ChangeControlHistory, ChangeControlSignature, CAPA, CapaTask, CapaHistory, CapaSignature, FileAsset, FileLink, EntityLink.

---

## 4) Controlled Document Lifecycle (Actual)

- **Stored and enforced:** Document status is on the **Document** model (`status`). Transitions are enforced in `server/src/documents.js` (e.g. only DRAFT can be submitted for review; only IN_REVIEW can be approved; Manager cannot approve own document; all reviewers must complete before approval).
- **Flow (actual):**
  - **DRAFT** → Author submits for review (submit-review) with reviewer and approver IDs → **IN_REVIEW**. DocumentAssignment rows created (REVIEW for reviewers, APPROVAL for approver).
  - **IN_REVIEW** → Reviewers POST review (decision: APPROVED_WITH_COMMENTS or REQUIRES_REVISION). If REQUIRES_REVISION → back to **DRAFT**. If all reviews completed → approver is notified; approver POSTs approve (with password for e-sign) → **APPROVED** (DocumentSignature created).
  - **APPROVED** → Quality release (quality-release) by Quality Manager/Admin → **EFFECTIVE** (effectiveDate set). Optional: nextReviewDate.
  - **EFFECTIVE** → Revise (revise) with revisionType major/minor → creates a **new** Document row in **DRAFT** with next version (supersedesDocumentId set), and a DocumentRevision record; optionally a Change Control is auto-created. Old row remains EFFECTIVE until the new version becomes EFFECTIVE (no automatic obsoletion in code).
- **Obsolete/Archive:** Status values OBSOLETE and ARCHIVED exist; where and when they are set in the app is not fully traced in this analysis (infer: manual or future use).
- **Effective version:** The single Document row with status EFFECTIVE for a given documentId. There is no separate “current version” pointer; “effective” is derived by querying status = EFFECTIVE for that documentId.
- **Trigger for new revision:** User initiates POST `/api/documents/:id/revise` with revisionType (major/minor) and summaryOfChange; only allowed when document status is EFFECTIVE.

---

## 5) Forms (FRMs) Architecture

- **Are forms stored as PDF/DOCX/HTML/JSON templates?**  
  Forms are a **document type** (DocumentType FORM, prefix FRM). The form “template” is the same as any document: **content** is stored as **text** in `Document.content` (likely Markdown or plain text). There are no PDF/DOCX/HTML/JSON template files in a dedicated store; PDF is **generated on demand** from document content via `server/src/pdf.js` (HTML built from content, then Puppeteer to PDF).

- **Where are templates stored?**  
  In the **database**: Document rows with documentType = FORM. No separate filesystem or S3 template directory.

- **How are completed forms stored?**  
  **Unknown.** There is no table or API in the codebase for “completed form” or “form instance” records. FileAsset + FileLink can link files to entityType DOCUMENT, but there is **no upload endpoint for documents** (only for CAPA and Change Control). So either: (1) completed forms are not stored in this app, or (2) they are stored elsewhere/not yet implemented, or (3) they are stored as file attachments via a path not found in this analysis.

- **How are form fields defined?**  
  **Unknown.** Document.content is freeform text. There is no schema, JSON schema, or hardcoded form-definition structure found for FRM documents.

---

## 6) Audit Trail & Compliance Evidence

- **Where recorded:** Table **audit_logs** (model AuditLog). Written via **server/src/audit.js** `createAuditLog()` (append-only; no update/delete in application code).
- **What is logged:** userId, action (e.g. DOCUMENT_SUBMITTED_FOR_REVIEW, DOCUMENT_REVIEW_COMPLETED, DOCUMENT_APPROVED, DOCUMENT_REVISION_CREATED, CHANGE_CONTROL_CREATED, FILE_DELETED, USER_CREATED), entityType (e.g. Document, ChangeControl, FileAsset), entityId, beforeValue (json), afterValue (json), reason (text), ip, userAgent, requestId, createdAt. requestId is set by requestIdMiddleware (from header or generated).
- **Retrieval for a document or form record:**
  - **Document:** Query AuditLog where entityType = 'Document' and entityId = document.id. List/export APIs: GET `/api/system/audit` (paginated, filter by entityType, entityId, userId, action, startDate, endDate) and GET `/api/system/audit/export?format=csv&...` (same filters). Both require system role and auditlog:view.
  - **Form record:** There is no “form record” entity; if a form instance were represented by a Document or another entity, the same audit filter by entityType and entityId would apply.

---

## 7) API Route Inventory

Base URL for API: `/api`. All routes below are under that prefix. Auth: Bearer JWT via authMiddleware unless noted.

### Documents
| Method | Path | Purpose | Tables touched |
|--------|------|---------|----------------|
| GET | /documents | List all documents | documents |
| GET | /documents/search?query=&tags= | Search by query/tags | documents |
| GET | /documents/:id | Document detail (assignments, history, revisions, signatures, links, comments) | documents, document_assignments, document_history, document_revisions, document_signatures, document_links, document_comments |
| GET | /documents/:id/pdf | Generate PDF (optional ?uncontrolled=true) | documents, document_signatures, document_revisions |
| GET | /documents/:id/links | List links for document | document_links |
| POST | /documents/:id/link | Create link to another document | document_links |
| GET | /documents/:id/comments | List comments | document_comments |
| POST | /documents/:id/comment | Add comment | document_comments |
| PUT | /documents/comments/:commentId | Update comment status | document_comments |
| POST | /documents | Create draft document | documents, document_history, audit_logs |
| PUT | /documents/:id | Update document (e.g. title, content) | documents, audit_logs |
| POST | /documents/:id/submit-review, /documents/:id/submit | Submit for review | documents, document_assignments, document_history, audit_logs, notifications |
| POST | /documents/:id/review | Complete review (approve/reject) | document_assignments, document_history, audit_logs, notifications |
| POST | /documents/:id/approve | Approve (e-sign) | documents, document_assignments, document_signatures, document_history, audit_logs, notifications |
| POST | /documents/:id/quality-release, /documents/:id/release | Quality release → EFFECTIVE | documents, document_assignments, document_history, audit_logs, notifications |
| POST | /documents/:id/initiate-periodic-review | Start periodic review | periodic_reviews, document_history, notifications |
| POST | /documents/:id/revise | Create new version (major/minor) | documents, document_revisions, document_history, change_controls, change_control_history, audit_logs |

### Templates
- **No API routes** for a separate “template” resource. Templates are Documents (e.g. documentType FORM).

### Forms
- **No dedicated form APIs.** Create/read/update of form “templates” use document APIs above. No API found for “get blank template by form number” or “submit completed form instance.”

### Records (completed forms / form instances)
- **No API routes** for form records or completed form storage.

### Approvals
- Document approvals: see POST /documents/:id/approve, /documents/:id/review, /documents/:id/quality-release above.
- **Change Control:** POST /api/change-controls/:id/approve, POST /api/change-controls/:id/close (with e-sign).
- **CAPA:** POST /api/capas/:id/approve-plan, POST /api/capas/:id/close (with e-sign).

### Audit
| Method | Path | Purpose | Tables |
|--------|------|---------|--------|
| GET | /system/audit | List audit logs (paginated, filters) | audit_logs |
| GET | /system/audit/export | Export audit (csv or json) | audit_logs |
| GET | /system/audit/:id | Single log detail | audit_logs |

### Users / RBAC
| Method | Path | Purpose | Tables |
|--------|------|---------|--------|
| POST | /auth/login | Login (returns token, user) | users |
| GET | /auth/me | Current user (auth) | users |
| GET | /users | List users | users |
| GET | /system/users | List users (system) | users, roles |
| POST | /system/users | Create user | users, audit_logs |
| POST | /system/users/invite | Invite user | users, invite_tokens, audit_logs |
| GET | /system/users/:id | User detail | users |
| PUT | /system/users/:id | Update user | users, audit_logs |
| DELETE | /system/users/:id | Delete user | users, audit_logs |
| GET | /system/roles | List roles with permissions | roles, role_permissions, permissions |
| POST | /system/roles | Create role | roles |
| PUT | /system/roles/:id | Update role permissions | roles, role_permissions, audit_logs |

Other routes: /api/notifications, /api/tasks, /api/dashboard/metrics, /api/training/modules, /api/training/my-assignments, /api/training/complete/:assignmentId, /api/periodic-reviews/my-reviews, /api/periodic-reviews/:id/complete, /api/capas (CRUD, transition, tasks, files, approve-plan, close, link, readiness), /api/change-controls (CRUD, transition, tasks, approve, close, files, link, readiness), /api/files/:fileId (GET stream, DELETE soft), /api/system/security-policies, /api/system/reference (departments, sites, job-titles), /api/system/retention, /api/system/esign, /api/system/dashboard, /api/health.

---

## 8) Integration Readiness for Governance Platform

- **REST:** Yes. Express JSON APIs under `/api`; JWT Bearer auth.
- **DB access:** Possible only if Governance Platform has DB credentials; Prisma schema is the single source of truth. No public DB API.
- **Export:** Audit export (CSV/JSON) via GET `/api/system/audit/export`. Document content is in DB; PDF is generated on demand (GET `/api/documents/:id/pdf`). No bulk “export all documents” or “export all forms” endpoint found.
- **Webhooks/events:** None found in codebase.

**Simplest first integration (and gaps):**
- **“Pull latest blank template for MAC-FRM-013”:**  
  - **Gap:** There is no API that returns “template by document number.” You can list documents (GET /documents) and filter client-side by documentId (e.g. MAC-FRM-013), or add a new endpoint e.g. GET /documents/by-code/:documentId that returns the effective (or latest) document by documentId. Today: use GET /documents and filter by documentId, or GET /documents/:id if you already have the row id.
- **“Store completed form record and link back”:**  
  - **Gap:** No “form record” or “completed form” table or API. Options: (1) Add a FormRecord (or similar) table and POST endpoint for the Governance Platform to submit completed form data; (2) Or store completed forms as file uploads—but there is no POST /documents/:id/files; only CAPA and Change Control have file upload. So either add document file upload + use FileLink to Document, or add a dedicated completed-form API and table.

**Recommendation:** Add (1) a stable “get document by code” (and optionally by code+version) endpoint, and (2) a small “form record” or “document attachment” API for storing completed form instances or files linked to a document, so the Governance Platform can push records back into the QMS.

---

## 9) Redundancy / Misalignment / Risks

- **Duplicate/overlapping:**  
  - **Role.permissions** (string[]) and **RolePermission + Permission:** Both exist; migration/seed normalizes to RolePermission; Role.permissions may be legacy.  
  - **Document “version”:** Version is (versionMajor, versionMinor) on the same table; each version is a new row. DocumentRevision is a summary table; no separate versioned_content table. Clear but must be understood when querying “current” or “effective” version.  
  - **History:** DocumentHistory (document lifecycle events) vs AuditLog (system-wide audit). Both exist; DocumentHistory is document-centric, AuditLog is global and used for compliance. Not redundant but two places to look for “what happened to this document.”

- **Integration pain:**  
  - **No template-by-code API:** Hard to resolve “MAC-FRM-013” to a single template without listing or adding an endpoint.  
  - **No completed form / form record API:** Cannot push filled form data back into QMS without new design.  
  - **No document file upload API:** Attachments for documents (if needed) require new endpoint (today only CAPA and Change Control accept file uploads).  
  - **Versioning:** “Effective” is by status; if multiple rows exist for same documentId (old EFFECTIVE and new DRAFT), client must know to treat EFFECTIVE as current.  
  - **Audit:** EntityType and entityId are strings; filtering by documentId requires entityType = Document and then joining to documents to filter by documentId, or storing documentId in afterValue/beforeValue (currently not guaranteed).

---

## 10) Exact Files to Share With ChatGPT

- **Schema / DB**  
  - `server/prisma/schema.prisma`

- **Document / form services and workflow**  
  - `server/src/documents.js`  
  - `server/src/pdf.js`

- **Template rendering**  
  - `server/src/pdf.js` (HTML generation from document content; no separate template engine for “forms”)

- **Approval workflow**  
  - `server/src/documents.js` (submit-review, review, approve, quality-release)  
  - `server/src/changeControls.js` (approve, close, e-sign)  
  - `server/src/capas.js` (approve-plan, close, e-sign)

- **Audit logging**  
  - `server/src/audit.js` (createAuditLog, getAuditContext, requestIdMiddleware)  
  - `server/src/system/audit.js` (list, export, detail)  
  - Any middleware that calls createAuditLog: e.g. `server/src/documents.js`, `server/src/changeControls.js`, `server/src/capas.js`, `server/src/system/users.js`, `server/src/files.js`, `server/src/systemMiddleware.js` (if used for audit)

- **Auth / RBAC**  
  - `server/src/auth.js`  
  - `server/src/rbac/permissionCatalog.js`  
  - `server/src/rbac/roleCatalog.js`  
  - `server/src/systemMiddleware.js`  
  - `server/src/userAuthz.js`

- **File storage**  
  - `server/src/files.js` (serve, soft-delete)  
  - File upload: `server/src/capas.js`, `server/src/changeControls.js` (multer + FileAsset + FileLink)

- **App entry and routes**  
  - `server/src/index.js`

---

*End of QMS Architecture Map. No code or config was changed.*
