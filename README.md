# MacTech TQMS/QAMS

Integrated **Total Quality Management System** and **Quality Assurance Management System** for MacTech Solutions LLC — GxP and ISO compliant, built for internal enterprise use and future commercialization.

## Stack

- **React 18** (functional components) + **TypeScript** (strict)
- **Vite** — build and dev server
- **Tailwind CSS** — dark theme, MacTech palette
- **React Router v6** — module navigation
- **Zustand** — QMS data state
- **Zod** — schema validation (GxP-ready forms)
- **Framer Motion** — transitions (modals, layout)
- **Lucide React** — icons

## Design

- **Theme:** Dark (surface `#0A0A0A`, elevated `#121212`), MacTech Blue `#007AFF`, Compliance Green `#28CD41`
- **Layout:** Collapsible sidebar, breadcrumb header, global search
- **Compliance:** Immutable audit trail, 21 CFR Part 11-style electronic signature modal, traceability (CAPA ↔ Audit Finding ↔ Document)

## Modules

1. **Executive Dashboard** — KPIs, Action Required queue, compliance health
2. **Document Control** — Lifecycle (Draft → Review → Approved → Retired), PDF placeholder, e-signature
3. **Training & Competency** — Assignments, certifications
4. **Audit Management** — Scheduling, findings, CAPA linkage
5. **CAPA** — Initiation → Investigation → Root Cause → Action Plan → Verification
6. **Change Control** — Impact assessment, approval gates
7. **Risk Management** — FMEA, RPN
8. **Equipment & Assets** — Calibration, maintenance, validation
9. **Supplier Quality** — Tiers, scorecards, audit logs

## Backend (API + Auth)

The app uses a Node.js/Express API with PostgreSQL and Prisma for auth and QMS data. See **`server/README.md`** for setup.

**Demo users** (password for all: **`Password123!`**):

| Role                | Email                      |
|---------------------|----------------------------|
| System Administrator | alex.admin@qms.demo     |
| Quality             | brenda.quality@qms.demo   |
| Manager             | charles.manager@qms.demo  |
| User                | david.user@qms.demo       |
| Read-Only           | evelyn.readonly@qms.demo  |

Sidebar navigation is **role-based**: each user sees only the links allowed for their role (e.g. System Admin sees only System Management; Quality sees all QMS modules; Read-Only sees only Documents).

## Commands

**Frontend (from project root):**

```bash
npm install
npm run dev      # http://localhost:5173 (proxies /api to backend)
npm run build
npm run preview
```

**Backend (from `server/`):**

```bash
cd server && npm install
# Set DATABASE_URL and JWT_SECRET in .env, then:
npx prisma generate && npx prisma db push
npm run db:seed
npm run dev      # http://localhost:3001
```

## Structure

- `src/components/ui` — Button, Card, Table, Badge, Modal, Input
- `src/components/layout` — MainLayout, Sidebar, Header
- `src/components/modules/compliance` — SignatureModal, TraceLink, AuditTrailPanel
- `src/pages` — All 9 module pages + PageShell
- `src/store` — Zustand QMS store
- `src/lib/schemas` — Zod schemas (documents, CAPA, change, risk)
- `src/types` — Audit trail types

---

*Built to feel like a pro-level tool an auditor would trust and an engineer would love to use.*
