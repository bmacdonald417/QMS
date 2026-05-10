import express from 'express';
import AdmZip from 'adm-zip';
import bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { prisma } from './db.js';
import { requirePermission, requireRoles } from './auth.js';
import { createAuditLog, getAuditContext } from './audit.js';
import { validateReviewResponses } from './lib/reviewQuestions.js';
import { generateDocumentPdf } from './pdf.js';
import { getNextChangeId } from './changeControls.js';
import { computeQmsHash, getRecordVersion } from './governance.js';
import { getMacTechOrgId } from './lib/orgScope.js';
import {
  loadDocumentForLifecycle,
  gateForRecordSIA,
  gateForRelease,
  nextRequiredAction,
} from './lib/documentLifecycle.js';

const router = express.Router();
const DOCUMENT_ENTITY = 'Document';

const DOC_TYPE_PREFIX = {
  SOP: 'SOP',
  POLICY: 'POL',
  WORK_INSTRUCTION: 'WIP',
  FORM: 'FRM',
  IT_SYSTEM: 'IT',
  SECURITY: 'SEC',
  AUDIT_ASSESSMENT: 'AUD',
  INCIDENT_RESPONSE_PLAN: 'IRP',
  CONFIGURATION_MANAGEMENT_PLAN: 'CMP',
  OTHER: 'DOC',
};

/** Document types with display labels for dropdowns. Single source of truth for API. */
export const DOCUMENT_TYPES = [
  { value: 'SOP', label: 'Standard Operating Procedure' },
  { value: 'POLICY', label: 'Policy' },
  { value: 'WORK_INSTRUCTION', label: 'Work Instruction Process' },
  { value: 'FORM', label: 'Form' },
  { value: 'IT_SYSTEM', label: 'IT & System' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'AUDIT_ASSESSMENT', label: 'Audit & Assessment' },
  { value: 'INCIDENT_RESPONSE_PLAN', label: 'Incident Response Plan' },
  { value: 'CONFIGURATION_MANAGEMENT_PLAN', label: 'Configuration Management Plan' },
  { value: 'OTHER', label: 'Other' },
];

function normalizeDocumentType(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replaceAll(' ', '_').replaceAll('-', '_');
  const aliasMap = {
    POL: 'POLICY',
    WIP: 'WORK_INSTRUCTION',
    WORKINSTRUCTION: 'WORK_INSTRUCTION',
    IT: 'IT_SYSTEM',
    ITSYSTEM: 'IT_SYSTEM',
    SEC: 'SECURITY',
    AUD: 'AUDIT_ASSESSMENT',
    AUDITASSESSMENT: 'AUDIT_ASSESSMENT',
    IRP: 'INCIDENT_RESPONSE_PLAN',
    INCIDENTRESPONSEPLAN: 'INCIDENT_RESPONSE_PLAN',
    CMP: 'CONFIGURATION_MANAGEMENT_PLAN',
    CONFIGURATIONMANAGEMENTPLAN: 'CONFIGURATION_MANAGEMENT_PLAN',
  };
  const mapped = aliasMap[normalized] || normalized;
  if (!Object.keys(DOC_TYPE_PREFIX).includes(mapped)) return null;
  return mapped;
}

function normalizeReviewDecision(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replaceAll(' ', '_').replaceAll('-', '_');
  if (normalized === 'REQUIRES_REVISION') return 'REQUIRES_REVISION';
  if (normalized === 'APPROVED_WITH_COMMENTS') return 'APPROVED_WITH_COMMENTS';
  if (normalized === 'APPROVED') return 'APPROVED';
  return null;
}

function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

async function createHistory({
  documentId,
  userId,
  action,
  details = null,
  digitalSignature = null,
}) {
  await prisma.documentHistory.create({
    data: {
      documentId,
      userId,
      action,
      details,
      digitalSignature,
    },
  });
}

async function createNotifications(userIds, message, link) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  await prisma.notification.createMany({
    data: uniqueIds.map((userId) => ({ userId, message, link })),
  });
}

function hasPermission(user, permission) {
  if (user?.roleName === 'Admin') return true;
  return (user?.permissions || []).includes(permission);
}

export async function generateDocumentId(documentType) {
  const prefix = DOC_TYPE_PREFIX[documentType] || 'DOC';
  const existing = await prisma.document.findMany({
    where: { documentType },
    select: { documentId: true },
  });
  let max = 0;
  for (const row of existing) {
    const match = row.documentId?.match(/-(\d+)$/);
    if (!match) continue;
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > max) max = num;
  }
  const next = String(max + 1).padStart(3, '0');
  return `MAC-${prefix}-${next}`;
}

// GET /api/documents/suggest-id?documentType=SOP — next available document ID for type
router.get('/suggest-id', requirePermission('document:view'), async (req, res) => {
  try {
    const raw = req.query.documentType;
    const normalizedType = normalizeDocumentType(typeof raw === 'string' ? raw : 'OTHER');
    const documentId = await generateDocumentId(normalizedType || 'OTHER');
    res.json({ documentId });
  } catch (err) {
    console.error('Suggest document ID error:', err);
    res.status(500).json({ error: 'Failed to suggest document ID' });
  }
});

// GET /api/documents/templates/forms — effective FORM documents for Completed Forms template picker
router.get('/templates/forms', requirePermission('document:view'), async (req, res) => {
  try {
    const documents = await prisma.document.findMany({
      where: { documentType: 'FORM', status: 'EFFECTIVE' },
      orderBy: [{ documentId: 'asc' }, { versionMajor: 'desc' }, { versionMinor: 'desc' }],
      select: { id: true, documentId: true, title: true, versionMajor: true, versionMinor: true },
    });
    res.json({ documents });
  } catch (err) {
    console.error('Form templates list error:', err);
    res.status(500).json({ error: 'Failed to list form templates' });
  }
});

// POST /api/documents/admin/remove-cmmc-tag — remove "CMMC" tag from all documents (System Admin / Admin only)
router.post('/admin/remove-cmmc-tag', requireRoles('System Admin', 'Admin'), async (req, res) => {
  try {
    const docs = await prisma.document.findMany({
      where: { tags: { has: 'CMMC' } },
      select: { id: true, documentId: true, tags: true },
    });
    let updated = 0;
    for (const doc of docs) {
      const newTags = doc.tags.filter((t) => t !== 'CMMC');
      await prisma.document.update({
        where: { id: doc.id },
        data: { tags: newTags },
      });
      updated++;
    }
    res.json({ ok: true, removedFrom: updated, message: `CMMC tag removed from ${updated} document(s).` });
  } catch (err) {
    console.error('Remove CMMC tag error:', err);
    res.status(500).json({ error: 'Failed to remove CMMC tag from documents' });
  }
});

// POST /api/documents/admin/add-cmmc-tag — add "CMMC" tag to all documents that don't have it (System Admin / Admin only)
router.post('/admin/add-cmmc-tag', requireRoles('System Admin', 'Admin'), async (req, res) => {
  try {
    const docs = await prisma.document.findMany({
      select: { id: true, documentId: true, tags: true },
    });
    const toUpdate = docs.filter((doc) => !(doc.tags || []).includes('CMMC'));
    let updated = 0;
    for (const doc of toUpdate) {
      const newTags = [...(doc.tags || []), 'CMMC'];
      await prisma.document.update({
        where: { id: doc.id },
        data: { tags: newTags },
      });
      updated++;
    }
    res.json({ ok: true, addedTo: updated, message: `CMMC tag added to ${updated} document(s).` });
  } catch (err) {
    console.error('Add CMMC tag error:', err);
    res.status(500).json({ error: 'Failed to add CMMC tag to documents' });
  }
});

// GET /api/documents — list all (requires document:view). 
// Query params: ?type=form-template, ?documentType=SOP|POLICY|..., ?status=DRAFT|EFFECTIVE|..., ?tags=tag1,tag2, ?search=query
router.get('/', requirePermission('document:view'), async (req, res) => {
  try {
    const typeFilter = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : '';
    const documentTypeFilter = typeof req.query.documentType === 'string' ? req.query.documentType.trim() : '';
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const tagsParam = typeof req.query.tags === 'string' ? req.query.tags.trim() : '';
    const searchQuery = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    
    const where = {};
    
    // Form template filter
    if (typeFilter === 'form-template') {
      where.documentType = 'FORM';
      where.status = 'EFFECTIVE';
    } else {
      // Document type filter
      if (documentTypeFilter) {
        where.documentType = documentTypeFilter.toUpperCase();
      }
      
      // Status filter
      if (statusFilter) {
        where.status = statusFilter.toUpperCase();
      }
      
      // Tags filter
      if (tagsParam) {
        const tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
        if (tags.length > 0) {
          where.tags = { hasSome: tags };
        }
      }
      
      // Search filter
      if (searchQuery) {
        where.OR = [
          { documentId: { contains: searchQuery, mode: 'insensitive' } },
          { title: { contains: searchQuery, mode: 'insensitive' } },
          { content: { contains: searchQuery, mode: 'insensitive' } },
        ];
      }
    }
    
    const documents = await prisma.document.findMany({
      where,
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: typeFilter === 'form-template'
        ? [{ documentId: 'asc' }, { versionMajor: 'desc' }, { versionMinor: 'desc' }]
        : { updatedAt: 'desc' },
    });
    
    res.json({ documents });
  } catch (err) {
    console.error('List documents error:', err);
    const code = err?.code;
    const meta = err?.meta;
    let message = 'Failed to list documents';
    if (code === 'P2022') {
      message =
        'Database is missing a column the app expects. Run `npx prisma db push` or `prisma migrate deploy` on the server, then restart.';
    } else if (code === 'P2010' || /column .* does not exist/i.test(String(err?.message || ''))) {
      message =
        'Database schema may be out of date. Apply the latest Prisma migrations (or `db push`) against this environment.';
    }
    const body = { error: message };
    if (process.env.NODE_ENV !== 'production' && err?.message) {
      body.details = String(err.message);
    }
    if (meta && process.env.NODE_ENV !== 'production') {
      body.meta = meta;
    }
    res.status(500).json(body);
  }
});

// GET /api/documents/search?query=...&tags=tag1,tag2
router.get('/search', requirePermission('document:view'), async (req, res) => {
  try {
    const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    const tagsParam = typeof req.query.tags === 'string' ? req.query.tags : '';
    const tagsFilter = tagsParam
      ? tagsParam.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    const conditions = [];
    if (tagsFilter.length) {
      conditions.push({ tags: { hasEvery: tagsFilter } });
    }
    if (query) {
      conditions.push({
        OR: [
          { documentId: { contains: query, mode: 'insensitive' } },
          { title: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
        ],
      });
    }
    const where = conditions.length ? (conditions.length === 1 ? conditions[0] : { AND: conditions }) : undefined;

    const documents = await prisma.document.findMany({
      where,
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    res.json({ documents });
  } catch (err) {
    console.error('Search documents error:', err);
    res.status(500).json({ error: 'Failed to search documents' });
  }
});

// PUT /api/documents/comments/:commentId (must be before /:id)
router.put('/comments/:commentId', requirePermission('document:review'), async (req, res) => {
  try {
    const { status } = req.body;
    const normalized = typeof status === 'string' ? status.trim().toUpperCase().replace(/-/g, '_') : '';
    if (!['OPEN', 'RESOLVED', 'REJECTED'].includes(normalized)) {
      return res.status(400).json({ error: 'status must be OPEN, RESOLVED, or REJECTED' });
    }

    const comment = await prisma.documentComment.findUnique({
      where: { id: req.params.commentId },
      include: { document: true },
    });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    const updated = await prisma.documentComment.update({
      where: { id: req.params.commentId },
      data: { status: normalized },
    });
    res.json({ comment: updated });
  } catch (err) {
    console.error('Update comment error:', err);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// GET /api/documents/completed-forms — list form records (alias for client compatibility)
router.get('/completed-forms', requirePermission('document:view'), async (req, res) => {
  try {
    const limitNum = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offsetNum = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
    const templateCode = typeof req.query.templateCode === 'string' ? req.query.templateCode.trim() : undefined;
    const where = {};
    if (status) where.status = status;
    if (templateCode) where.templateCode = templateCode;
    const [records, total] = await Promise.all([
      prisma.formRecord.findMany({
        where,
        skip: offsetNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          templateDocument: { select: { documentId: true, title: true, versionMajor: true, versionMinor: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.formRecord.count({ where }),
    ]);
    res.json({ records, total });
  } catch (err) {
    console.error('List completed forms error:', err);
    res.status(500).json({ error: 'Failed to list completed forms' });
  }
});

// POST /api/documents/export-bundle — selected documents as PDFs in a zip
router.post('/export-bundle', requirePermission('document:view'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.documentIds) ? req.body.documentIds : [];
    const documentIds = ids.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim());
    if (!documentIds.length) {
      return res.status(400).json({ error: 'documentIds array is required and must contain at least one document id' });
    }
    const zip = new AdmZip();
    const seen = new Set();
    for (const id of documentIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const document = await prisma.document.findUnique({
        where: { id },
        include: {
          author: { select: { id: true, firstName: true, lastName: true } },
          signatures: {
            include: { signer: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { signedAt: 'asc' },
          },
        },
      });
      if (!document) continue;
      const revisions = await prisma.documentRevision.findMany({
        where: { document: { documentId: document.documentId } },
        include: { author: { select: { firstName: true, lastName: true } } },
        orderBy: [{ versionMajor: 'asc' }, { versionMinor: 'asc' }, { createdAt: 'asc' }],
      });
      const referenceLinks = await prisma.documentLink.findMany({
        where: { sourceDocumentId: document.id, linkType: 'references' },
        include: {
          targetDocument: {
            select: { documentId: true, versionMajor: true, versionMinor: true, title: true },
          },
        },
      });
      const referenceDocuments = referenceLinks.map((l) => l.targetDocument);
      const pdf = await generateDocumentPdf({
        document,
        signatures: document.signatures,
        revisions,
        referenceDocuments,
        uncontrolled: false,
      });
      const pdfBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
      const filename = `${document.documentId}-v${document.versionMajor}.${document.versionMinor}.pdf`;
      zip.addFile(filename, pdfBuffer);
    }
    const zipBuffer = zip.toBuffer();
    const exportFilename = `documents-export-${new Date().toISOString().slice(0, 10)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename}"`);
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  } catch (err) {
    console.error('Export bundle error:', err);
    res.status(500).json({ error: 'Failed to export document bundle' });
  }
});

// GET /api/documents/:id/pdf
router.get('/:id/pdf', async (req, res) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
        signatures: {
          include: { signer: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { signedAt: 'asc' },
        },
      },
    });
    if (!document) return res.status(404).json({ error: 'Document not found' });

    const revisions = await prisma.documentRevision.findMany({
      where: { document: { documentId: document.documentId } },
      include: { author: { select: { firstName: true, lastName: true } } },
      orderBy: [{ versionMajor: 'asc' }, { versionMinor: 'asc' }, { createdAt: 'asc' }],
    });

    const referenceLinks = await prisma.documentLink.findMany({
      where: { sourceDocumentId: document.id, linkType: 'references' },
      include: {
        targetDocument: {
          select: { documentId: true, versionMajor: true, versionMinor: true, title: true },
        },
      },
    });
    const referenceDocuments = referenceLinks.map((l) => l.targetDocument);

    const uncontrolled =
      String(req.query.uncontrolled || '').toLowerCase() === 'true' ||
      String(req.query.mode || '').toLowerCase() === 'download';

    const pdf = await generateDocumentPdf({
      document,
      signatures: document.signatures,
      revisions,
      referenceDocuments,
      uncontrolled,
    });
    const pdfBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);

    const filename = `${document.documentId}-v${document.versionMajor}.${document.versionMinor}.pdf`;
    const disposition = uncontrolled ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Generate PDF error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// GET /api/documents/:id/download — PDF as attachment (alias for client compatibility)
router.get('/:id/download', async (req, res) => {
  const base = req.originalUrl.replace(/\/download\/?$/, '/pdf');
  const sep = base.includes('?') ? '&' : '?';
  return res.redirect(302, `${base}${sep}mode=download`);
});

// GET /api/documents/:id/template — document as template payload (e.g. for form builder)
router.get('/:id/template', requirePermission('document:view'), async (req, res) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        documentId: true,
        title: true,
        documentType: true,
        versionMajor: true,
        versionMinor: true,
        content: true,
        status: true,
      },
    });
    if (!document) return res.status(404).json({ error: 'Document not found' });
    res.json(document);
  } catch (err) {
    console.error('Get document template error:', err);
    res.status(500).json({ error: 'Failed to get document template' });
  }
});

// GET /api/documents/by-code/:documentId
//
// Permalink lookup by the human-readable code (e.g. MAC-POL-210), not the
// row UUID. The codex CMMC contract permalink uses this to stay stable
// across version-row turnover (each new version is a new row → new UUID,
// but the documentId code is constant). MUST be declared BEFORE `/:id`
// because Express matches in route order.
//
// Returns the row's UUID so the caller (typically the SPA shim at
// /documents/by-code/:code) can navigate to the canonical /documents/:uuid
// detail page.
router.get('/by-code/:documentId', async (req, res) => {
  try {
    const code = String(req.params.documentId || '').trim();
    if (!code) return res.status(400).json({ error: 'documentId is required' });

    const orgId = getMacTechOrgId();
    const row = await prisma.document.findFirst({
      where: { documentId: code, organizationId: orgId },
      select: { id: true, documentId: true, title: true, status: true },
      orderBy: [{ versionMajor: 'desc' }, { versionMinor: 'desc' }, { updatedAt: 'desc' }],
    });
    if (!row) return res.status(404).json({ error: 'Document not found' });
    res.json({ id: row.id, documentId: row.documentId, title: row.title, status: row.status });
  } catch (err) {
    console.error('Document by-code lookup error:', err);
    res.status(500).json({ error: 'Failed to resolve document by code' });
  }
});

// GET /api/documents/:id
router.get('/:id', async (req, res) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignments: {
          include: {
            assignedTo: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        history: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
          orderBy: { timestamp: 'desc' },
        },
        revisions: {
          include: { author: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        signatures: {
          include: { signer: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { signedAt: 'desc' },
        },
        // orderBy must use fields included in select (Prisma requirement)
        trainingModules: {
          select: { id: true, title: true, dueDate: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!document) return res.status(404).json({ error: 'Document not found' });
    document.qmsHash = computeQmsHash('Document', document);
    document.recordVersion = getRecordVersion('Document', document);
    const isAuthor = req.user && document.authorId === req.user.id;
    const hasAssignment = document.assignments?.some((a) => a.assignedToId === req.user?.id);
    document.canAddLinks = !!(req.user && (isAuthor || hasAssignment) && document.status !== 'OBSOLETE');
    // Surface CMMC control mappings on the doc record so the read-only
    // /documents/:id/view page can render them inline. Cheap join — one
    // lookup keyed by document_number.
    try {
      const mapping = await prisma.governanceControlMapping.findUnique({
        where: { documentNumber: document.documentId },
        select: { controlIds: true },
      });
      document.controlsMapped = mapping?.controlIds ?? [];
    } catch {
      document.controlsMapped = [];
    }
    // Look up the SIA recorder + Quality Release stamper users by id.
    // These are scalar foreign keys on the Document model with no Prisma
    // relation — so we do a cheap explicit fetch. The view page renders
    // their names in the SIA section + the metadata grid.
    try {
      const ids = [
        document.securityImpactAnalysisByUserId,
        document.releasedByUserId,
      ].filter((x) => typeof x === 'string' && x);
      if (ids.length > 0) {
        const users = await prisma.user.findMany({
          where: { id: { in: Array.from(new Set(ids)) } },
          select: { id: true, firstName: true, lastName: true, email: true },
        });
        const byId = Object.fromEntries(users.map((u) => [u.id, u]));
        document.securityImpactAnalysisBy = document.securityImpactAnalysisByUserId
          ? byId[document.securityImpactAnalysisByUserId] ?? null
          : null;
        document.releasedBy = document.releasedByUserId
          ? byId[document.releasedByUserId] ?? null
          : null;
      } else {
        document.securityImpactAnalysisBy = null;
        document.releasedBy = null;
      }
    } catch {
      document.securityImpactAnalysisBy = null;
      document.releasedBy = null;
    }
    res.json({ document });
  } catch (err) {
    console.error('Get document error:', err);
    const code = err?.code;
    const meta = err?.meta;
    let message = 'Failed to fetch document';
    if (code === 'P2022') {
      const col = meta?.column ?? meta?.field_name;
      message = col
        ? `Database is missing column: ${col}. On the host running the API, run: npx prisma db push (or prisma migrate deploy), then restart. See server/prisma/sql/fix_common_column_drift.sql for manual SQL.`
        : 'Database is missing a column the app expects. Run npx prisma db push (or prisma migrate deploy) on the server, then restart.';
    }
    const body = { error: message };
    if (err?.message) {
      body.details = String(err.message);
    }
    if (meta && typeof meta === 'object') {
      body.prismaMeta = meta;
    }
    res.status(500).json(body);
  }
});

// GET /api/documents/:id/governance-approval
router.get('/:id/governance-approval', requirePermission('document:view'), async (req, res) => {
  try {
    const { getGovernanceApprovalStatus } = await import('./governance.js');
    const result = await getGovernanceApprovalStatus('Document', req.params.id);
    if (!result) return res.json({ hasArtifact: false, artifact: null, verification: null });
    res.json({
      hasArtifact: true,
      artifact: {
        id: result.artifact.id,
        entityType: result.artifact.entityType,
        entityId: result.artifact.entityId,
        recordVersion: result.artifact.recordVersion,
        qmsHash: result.artifact.qmsHash,
        signedAt: result.artifact.signedAt,
        verifiedAt: result.artifact.verifiedAt,
        verificationStatus: result.artifact.verificationStatus,
      },
      verification: result.verification,
    });
  } catch (err) {
    console.error('Document governance-approval error:', err);
    res.status(500).json({ error: 'Failed to load governance approval' });
  }
});

// GET /api/documents/:id/links
router.get('/:id/links', async (req, res) => {
  try {
    const docId = req.params.id;
    const document = await prisma.document.findUnique({ where: { id: docId } });
    if (!document) return res.status(404).json({ error: 'Document not found' });

    const links = await prisma.documentLink.findMany({
      where: {
        OR: [{ sourceDocumentId: docId }, { targetDocumentId: docId }],
      },
      include: {
        sourceDocument: { select: { id: true, documentId: true, title: true, versionMajor: true, versionMinor: true } },
        targetDocument: { select: { id: true, documentId: true, title: true, versionMajor: true, versionMinor: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ links });
  } catch (err) {
    console.error('Get document links error:', err);
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

// POST /api/documents/:id/link
router.post('/:id/link', requirePermission('document:create'), async (req, res) => {
  try {
    const { sourceDocumentId, targetDocumentId, linkType } = req.body;
    const sourceId = sourceDocumentId || req.params.id;
    if (!targetDocumentId || !linkType || typeof linkType !== 'string') {
      return res.status(400).json({ error: 'targetDocumentId and linkType are required' });
    }
    const doc = await prisma.document.findUnique({ where: { id: sourceId } });
    if (!doc) return res.status(404).json({ error: 'Source document not found' });
    const target = await prisma.document.findUnique({ where: { id: targetDocumentId } });
    if (!target) return res.status(404).json({ error: 'Target document not found' });
    const isAuthor = doc.authorId === req.user.id;
    const hasAssignment = await prisma.documentAssignment.findFirst({
      where: { documentId: sourceId, assignedToId: req.user.id },
    });
    if (!isAuthor && !hasAssignment) {
      return res.status(403).json({
        error: 'Only the author or assigned reviewers/approvers can add links to this document',
      });
    }

    const link = await prisma.documentLink.create({
      data: {
        sourceDocumentId: sourceId,
        targetDocumentId,
        linkType: linkType.trim(),
      },
      include: {
        sourceDocument: { select: { id: true, documentId: true, title: true } },
        targetDocument: { select: { id: true, documentId: true, title: true } },
      },
    });
    res.status(201).json({ link });
  } catch (err) {
    console.error('Create document link error:', err);
    res.status(500).json({ error: 'Failed to create link' });
  }
});

// GET /api/documents/:id/comments
router.get('/:id/comments', async (req, res) => {
  try {
    const docId = req.params.id;
    const document = await prisma.document.findUnique({ where: { id: docId } });
    if (!document) return res.status(404).json({ error: 'Document not found' });

    const comments = await prisma.documentComment.findMany({
      where: { documentId: docId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ comments });
  } catch (err) {
    console.error('Get document comments error:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// POST /api/documents/:id/comment
router.post('/:id/comment', requirePermission('document:review'), async (req, res) => {
  try {
    const { commentText, sectionIdentifier } = req.body;
    if (!commentText || typeof commentText !== 'string' || !commentText.trim()) {
      return res.status(400).json({ error: 'commentText is required' });
    }
    const docId = req.params.id;
    const document = await prisma.document.findUnique({ where: { id: docId } });
    if (!document) return res.status(404).json({ error: 'Document not found' });

    const comment = await prisma.documentComment.create({
      data: {
        documentId: docId,
        userId: req.user.id,
        commentText: commentText.trim(),
        sectionIdentifier: typeof sectionIdentifier === 'string' ? sectionIdentifier.trim() || null : null,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    res.status(201).json({ comment });
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// POST /api/documents/:id/initiate-periodic-review
router.post(
  '/:id/initiate-periodic-review',
  requirePermission('document:review'),
  async (req, res) => {
    try {
      const docId = req.params.id;
      const document = await prisma.document.findUnique({ where: { id: docId } });
      if (!document) return res.status(404).json({ error: 'Document not found' });
      if (document.status !== 'EFFECTIVE') {
        return res.status(400).json({ error: 'Only effective documents can have a periodic review initiated' });
      }

      const existing = await prisma.periodicReview.findFirst({
        where: { documentId: docId, status: { in: ['PENDING', 'OVERDUE'] } },
      });
      if (existing) {
        return res.status(400).json({ error: 'A periodic review is already pending for this document' });
      }

      const reviewDate = document.nextReviewDate || new Date();
      const review = await prisma.periodicReview.create({
        data: {
          documentId: docId,
          reviewDate,
          status: reviewDate < new Date() ? 'OVERDUE' : 'PENDING',
          reviewerId: document.authorId,
        },
        include: { document: { select: { id: true, documentId: true, title: true } } },
      });
      await createNotifications(
        [document.authorId],
        `Document ${document.documentId} periodic review initiated`,
        `/documents/${docId}`
      );
      res.status(201).json({ review });
    } catch (err) {
      console.error('Initiate periodic review error:', err);
      res.status(500).json({ error: 'Failed to initiate periodic review' });
    }
  }
);

// POST /api/documents
router.post('/', requirePermission('document:create'), async (req, res) => {
  try {
    const { title, documentType, content, summaryOfChange, documentId: requestedDocumentId, tags: tagsBody } = req.body;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }
    const normalizedType = normalizeDocumentType(documentType || 'OTHER');
    if (!normalizedType) {
      return res.status(400).json({ error: 'Invalid documentType' });
    }

    let finalDocumentId;
    if (requestedDocumentId != null && String(requestedDocumentId).trim() !== '') {
      const candidate = String(requestedDocumentId).trim();
      if (candidate.length > 120) {
        return res.status(400).json({ error: 'Document ID is too long' });
      }
      const existing = await prisma.document.findFirst({ where: { documentId: candidate }, select: { id: true } });
      if (existing) {
        return res.status(400).json({ error: `Document ID "${candidate}" is already in use` });
      }
      finalDocumentId = candidate;
    } else {
      finalDocumentId = await generateDocumentId(normalizedType);
    }

    const tags = Array.isArray(tagsBody)
      ? tagsBody.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean)
      : [];

    const created = await prisma.document.create({
      data: {
        documentId: finalDocumentId,
        title: title.trim(),
        documentType: normalizedType,
        versionMajor: 1,
        versionMinor: 0,
        status: 'DRAFT',
        content: typeof content === 'string' ? content : '',
        tags,
        authorId: req.user.id,
        organizationId: getMacTechOrgId(),
        revisions: {
          create: {
            versionMajor: 1,
            versionMinor: 0,
            effectiveDate: new Date(),
            authorId: req.user.id,
            summaryOfChange:
              typeof summaryOfChange === 'string' && summaryOfChange.trim()
                ? summaryOfChange.trim()
                : 'Initial draft creation',
          },
        },
      },
    });

    await createHistory({
      documentId: created.id,
      userId: req.user.id,
      action: 'Created Draft',
      details: {
        documentId: created.documentId,
        version: `${created.versionMajor}.${created.versionMinor}`,
      },
    });

    res.status(201).json({ document: created });
  } catch (err) {
    console.error('Create document error:', err);
    res.status(500).json({ error: 'Failed to create draft document' });
  }
});

// PATCH /api/documents/:id/tags — update only tags (any user with document:create, any status)
router.patch('/:id/tags', requirePermission('document:create'), async (req, res) => {
  try {
    const { tags: tagsBody } = req.body;
    const existing = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Document not found' });
    if (!Array.isArray(tagsBody)) {
      return res.status(400).json({ error: 'tags array is required' });
    }
    const tags = tagsBody.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean);
    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: { tags },
    });
    res.json({ document: updated });
  } catch (err) {
    console.error('Update document tags error:', err);
    res.status(500).json({ error: 'Failed to update tags' });
  }
});

// PUT /api/documents/:id
router.put('/:id', requirePermission('document:create'), async (req, res) => {
  try {
    const { title, content, documentType, tags, nextReviewDate, isUnderReview } = req.body;
    const existing = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Document not found' });
    if (existing.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Only the author can update the document' });
    }
    if (!['DRAFT', 'IN_REVIEW'].includes(existing.status)) {
      return res.status(400).json({ error: 'Document can only be updated in Draft or In Review status' });
    }

    const updateData = {};
    if (typeof title === 'string') updateData.title = title.trim();
    if (typeof content === 'string') updateData.content = content;
    if (typeof documentType === 'string') {
      const normalizedType = normalizeDocumentType(documentType);
      if (!normalizedType) return res.status(400).json({ error: 'Invalid documentType' });
      updateData.documentType = normalizedType;
    }
    if (Array.isArray(tags)) updateData.tags = tags.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean);
    if (nextReviewDate !== undefined) {
      const d = nextReviewDate ? new Date(nextReviewDate) : null;
      updateData.nextReviewDate = d && Number.isFinite(d.valueOf()) ? d : null;
    }
    if (typeof isUnderReview === 'boolean') updateData.isUnderReview = isUnderReview;

    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await createHistory({
      documentId: updated.id,
      userId: req.user.id,
      action: 'Updated Document',
      details: { fields: Object.keys(updateData) },
    });

    res.json({ document: updated });
  } catch (err) {
    console.error('Update document error:', err);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// DELETE /api/documents/:id — System Admin only (document:delete)
router.delete('/:id', requirePermission('document:delete'), async (req, res) => {
  try {
    const docId = req.params.id;
    const document = await prisma.document.findUnique({
      where: { id: docId },
      select: { id: true, documentId: true, title: true, versionMajor: true, versionMinor: true },
    });
    if (!document) return res.status(404).json({ error: 'Document not found' });

    const usedAsTemplate = await prisma.formRecord.count({
      where: { templateDocumentId: docId },
    });
    const isSystemAdmin = (req.user.roleName || '').trim() === 'System Admin' || (req.user.roleName || '').trim() === 'Admin';
    if (usedAsTemplate > 0 && !isSystemAdmin) {
      return res.status(400).json({
        error: 'Cannot delete document: it is used as a template by form records. Remove or reassign those form records first.',
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.document.updateMany({
        where: { supersedesDocumentId: docId },
        data: { supersedesDocumentId: null },
      });
      await tx.documentLink.deleteMany({
        where: { OR: [{ sourceDocumentId: docId }, { targetDocumentId: docId }] },
      });
      await tx.documentComment.deleteMany({ where: { documentId: docId } });
      await tx.documentHistory.deleteMany({ where: { documentId: docId } });
      await tx.documentSignature.deleteMany({ where: { documentId: docId } });
      await tx.documentAssignment.deleteMany({ where: { documentId: docId } });
      await tx.documentRevision.deleteMany({ where: { documentId: docId } });
      await tx.periodicReview.deleteMany({ where: { documentId: docId } });
      const modules = await tx.trainingModule.findMany({ where: { documentId: docId }, select: { id: true } });
      for (const m of modules) {
        await tx.userTrainingRecord.deleteMany({ where: { trainingModuleId: m.id } });
      }
      await tx.trainingModule.deleteMany({ where: { documentId: docId } });
      await tx.document.delete({ where: { id: docId } });
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'DOCUMENT_DELETED',
      entityType: DOCUMENT_ENTITY,
      entityId: docId,
      beforeValue: document,
      afterValue: null,
      reason: req.body?.reason || null,
      ...auditCtx,
    });

    res.json({ ok: true, deleted: { id: docId, documentId: document.documentId, title: document.title } });
  } catch (err) {
    console.error('Delete document error:', err);
    const message = err?.message || 'Failed to delete document';
    const isTemplateError = /form_record|template_document|foreign key/i.test(message);
    const userMessage = isTemplateError
      ? 'Cannot delete: this document is used as a template by form records. Delete or reassign those form records first.'
      : message;
    res.status(500).json({ error: userMessage });
  }
});

async function submitForReviewHandler(req, res) {
  try {
    const { reviewerIds = [], approverId, comments, dueDate } = req.body;
    if (!Array.isArray(reviewerIds) || reviewerIds.length === 0) {
      return res.status(400).json({ error: 'reviewerIds is required' });
    }
    if (!approverId) return res.status(400).json({ error: 'approverId is required' });

    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!document) return res.status(404).json({ error: 'Document not found' });
    if (document.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only Draft documents can be submitted for review' });
    }
    // SoD gate is enforced below by filtering reviewer ids against req.user.id
    // (a submitter cannot also be a reviewer). Authorship is no longer a gate
    // here — bridge-authored docs (codex-bridge bot) wouldn't be releasable
    // otherwise, since the bot has no UI session. Any user with
    // document:create may submit a DRAFT for review.

    const uniqueReviewers = [...new Set(reviewerIds.filter(Boolean))].filter((id) => id !== req.user.id);
    if (!uniqueReviewers.length) {
      return res.status(400).json({ error: 'At least one reviewer is required' });
    }

    const parsedDueDate = dueDate ? new Date(dueDate) : null;
    const dueDateValue =
      parsedDueDate && Number.isFinite(parsedDueDate.valueOf()) ? parsedDueDate : null;

    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: document.id },
        data: { status: 'IN_REVIEW' },
      });
      await tx.documentAssignment.deleteMany({
        where: { documentId: document.id, status: 'PENDING' },
      });
      await tx.documentAssignment.createMany({
        data: uniqueReviewers.map((assignedToId) => ({
          documentId: document.id,
          assignedToId,
          assignmentType: 'REVIEW',
          status: 'PENDING',
          dueDate: dueDateValue,
        })),
      });
      await tx.documentAssignment.create({
        data: {
          documentId: document.id,
          assignedToId: approverId,
          assignmentType: 'APPROVAL',
          status: 'PENDING',
          dueDate: dueDateValue,
        },
      });
      await tx.documentHistory.create({
        data: {
          documentId: document.id,
          userId: req.user.id,
          action: 'Submitted for Review',
          details: { reviewerIds: uniqueReviewers, approverId, comments: comments || null },
        },
      });
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'DOCUMENT_SUBMITTED_FOR_REVIEW',
      entityType: DOCUMENT_ENTITY,
      entityId: document.id,
      beforeValue: { status: 'DRAFT' },
      afterValue: { status: 'IN_REVIEW', reviewerIds: uniqueReviewers, approverId },
      reason: req.body.reason || req.body.comments || null,
      ...auditCtx,
    });

    await createNotifications(
      [...uniqueReviewers, approverId],
      `You have been assigned to process document ${document.documentId}.`,
      `/documents/${document.id}`
    );

    res.json({ ok: true, status: 'IN_REVIEW' });
  } catch (err) {
    console.error('Submit review error:', err);
    res.status(500).json({ error: 'Failed to submit document for review' });
  }
}

// POST /api/documents/:id/submit-review
router.post('/:id/submit-review', requirePermission('document:create'), submitForReviewHandler);

// POST /api/documents/:id/review
router.post('/:id/review', requirePermission('document:review'), async (req, res) => {
  try {
    const { decision, comments, reviewResponses, password } = req.body;
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required for digital signature' });
    }
    const normalizedDecision = normalizeReviewDecision(decision);
    if (!normalizedDecision) return res.status(400).json({ error: 'Invalid review decision' });

    const validation = validateReviewResponses(reviewResponses);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    if (validation.requiresRevision && normalizedDecision !== 'REQUIRES_REVISION') {
      return res.status(400).json({
        error: 'One or more questionnaire answers indicate corrections are needed. You must choose "Requires Revision" and send the document back to the author.',
      });
    }

    const trimmedComments = typeof comments === 'string' ? comments.trim() : '';
    if (normalizedDecision === 'REQUIRES_REVISION' && !trimmedComments) {
      return res.status(400).json({
        error: 'Comments are required when sending the document back for revision. Use the review comments field.',
      });
    }
    if (normalizedDecision === 'APPROVED_WITH_COMMENTS' && !trimmedComments) {
      return res.status(400).json({
        error: 'Comments are required when choosing Approve with comments.',
      });
    }

    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!document) return res.status(404).json({ error: 'Document not found' });

    const assignment = await prisma.documentAssignment.findFirst({
      where: {
        documentId: document.id,
        assignedToId: req.user.id,
        assignmentType: 'REVIEW',
        status: 'PENDING',
      },
    });
    if (!assignment) return res.status(403).json({ error: 'No pending review assignment found' });

    const signer = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { password: true },
    });
    const passwordOk = signer ? await bcrypt.compare(password, signer.password) : false;
    if (!passwordOk) return res.status(401).json({ error: 'Password verification failed' });

    const answersArray = [...validation.answersMap.entries()].map(([questionId, a]) => ({
      questionId,
      value: a.value,
      comments: a.comments || undefined,
    }));
    const payloadToStore = {
      answers: answersArray,
      requiresRevision: validation.requiresRevision,
    };

    if (normalizedDecision === 'REQUIRES_REVISION') {
      const questionsWithYes = answersArray.filter((a) => a.value === 'yes').map((a) => a.questionId);

      // draftRound is not a Document column in Prisma; track revision cycle in history details only.
      const lastRejection = await prisma.documentHistory.findFirst({
        where: { documentId: document.id, action: 'Review Rejected' },
        orderBy: { timestamp: 'desc' },
        select: { details: true },
      });
      let lastRound = 1;
      if (lastRejection?.details && typeof lastRejection.details === 'object' && lastRejection.details !== null) {
        const dr = lastRejection.details.draftRound;
        if (typeof dr === 'number' && Number.isFinite(dr)) lastRound = dr;
      }
      const nextDraftRound = lastRound + 1;

      await prisma.$transaction(async (tx) => {
        const now = new Date();
        const documentHash = sha256(document.content || '');
        const passwordHash = await bcrypt.hash(password, 10);
        const signaturePayload = {
          documentId: document.id,
          signerId: req.user.id,
          signatureMeaning: 'Reviewer',
          signedAt: now.toISOString(),
          documentHash,
        };
        const signatureHash = sha256(JSON.stringify(signaturePayload));
        const signature = await tx.documentSignature.create({
          data: {
            documentId: document.id,
            signerId: req.user.id,
            signatureMeaning: 'Reviewer',
            signedAt: now,
            documentHash,
            signatureHash,
            passwordHash,
          },
        });

        await tx.documentAssignment.update({
          where: { id: assignment.id },
          data: {
            status: 'REJECTED',
            completedAt: now,
            comments: trimmedComments,
            reviewResponses: payloadToStore,
          },
        });
        await tx.documentAssignment.updateMany({
          where: { documentId: document.id, status: 'PENDING' },
          data: { status: 'REJECTED', completedAt: now },
        });
        await tx.document.update({
          where: { id: document.id },
          data: { status: 'DRAFT' },
        });
        await tx.documentHistory.create({
          data: {
            documentId: document.id,
            userId: req.user.id,
            action: 'Review Rejected',
            details: {
              comments: trimmedComments,
              reviewResponses: payloadToStore,
              questionsWithYes,
              draftRound: nextDraftRound,
            },
            digitalSignature: {
              signatureId: signature.id,
              signatureMeaning: 'Reviewer',
              documentHash,
              signatureHash,
              signedAt: now.toISOString(),
            },
          },
        });
      });

      const auditCtx = getAuditContext(req);
      await createAuditLog({
        userId: req.user.id,
        action: 'DOCUMENT_REVIEW_REJECTED',
        entityType: DOCUMENT_ENTITY,
        entityId: document.id,
        beforeValue: { status: document.status },
        afterValue: { status: 'DRAFT', draftRound: nextDraftRound },
        reason: req.body.reason || trimmedComments || null,
        ...auditCtx,
      });
      await createNotifications(
        [document.authorId],
        `Document ${document.documentId} requires revision.`,
        `/documents/${document.id}`
      );
      return res.json({ ok: true, status: 'DRAFT' });
    }

    const now = new Date();
    const documentHash = sha256(document.content || '');
    const passwordHash = await bcrypt.hash(password, 10);
    const signaturePayload = {
      documentId: document.id,
      signerId: req.user.id,
      signatureMeaning: 'Reviewer',
      signedAt: now.toISOString(),
      documentHash,
    };
    const signatureHash = sha256(JSON.stringify(signaturePayload));

    await prisma.$transaction(async (tx) => {
      await tx.documentAssignment.update({
        where: { id: assignment.id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          comments: trimmedComments || null,
          reviewResponses: payloadToStore,
        },
      });
      const signature = await tx.documentSignature.create({
        data: {
          documentId: document.id,
          signerId: req.user.id,
          signatureMeaning: 'Reviewer',
          signedAt: now,
          documentHash,
          signatureHash,
          passwordHash,
        },
      });
      await tx.documentHistory.create({
        data: {
          documentId: document.id,
          userId: req.user.id,
          action: 'Review Completed',
          details: {
            comments: trimmedComments || null,
            reviewResponses: payloadToStore,
            reviewDecision: normalizedDecision,
          },
          digitalSignature: {
            signatureId: signature.id,
            signatureMeaning: 'Reviewer',
            documentHash,
            signatureHash,
            signedAt: now.toISOString(),
          },
        },
      });
    });

    const pendingReviewCount = await prisma.documentAssignment.count({
      where: { documentId: document.id, assignmentType: 'REVIEW', status: 'PENDING' },
    });
    let newStatus = document.status;
    if (pendingReviewCount === 0) {
      await prisma.document.update({
        where: { id: document.id },
        data: { status: 'AWAITING_APPROVAL' },
      });
      newStatus = 'AWAITING_APPROVAL';
      const approvers = await prisma.documentAssignment.findMany({
        where: {
          documentId: document.id,
          assignmentType: 'APPROVAL',
          status: 'PENDING',
        },
        select: { assignedToId: true },
      });
      await createNotifications(
        approvers.map((a) => a.assignedToId),
        `Document ${document.documentId} is ready for approval.`,
        `/documents/${document.id}`
      );
      await createHistory({
        documentId: document.id,
        userId: req.user.id,
        action: 'All Reviews Completed',
      });
    }

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'DOCUMENT_REVIEW_COMPLETED',
      entityType: DOCUMENT_ENTITY,
      entityId: document.id,
      beforeValue: { status: document.status },
      afterValue: { status: newStatus },
      reason: req.body.reason || trimmedComments || null,
      ...auditCtx,
    });

    res.json({ ok: true, status: newStatus });
  } catch (err) {
    console.error('Review document error:', err);
    const details = err?.message ? String(err.message) : '';
    const body = { error: 'Failed to complete review' };
    if (process.env.NODE_ENV !== 'production' && details) {
      body.details = details;
    }
    res.status(500).json(body);
  }
});

// POST /api/documents/:id/approve
router.post(
  '/:id/approve',
  requireRoles('Manager', 'Quality Manager', 'System Admin'),
  requirePermission('document:approve'),
  async (req, res) => {
    try {
      const { password, comments } = req.body;
      if (!password) {
        return res.status(400).json({ error: 'Password is required for digital signature' });
      }

      const document = await prisma.document.findUnique({ where: { id: req.params.id } });
      if (!document) return res.status(404).json({ error: 'Document not found' });
      if (document.status !== 'AWAITING_APPROVAL') {
        return res.status(400).json({ error: 'Document must be in Awaiting Approval status to approve' });
      }

      if (req.user.roleName === 'Manager' && document.authorId === req.user.id) {
        return res.status(403).json({ error: 'Manager cannot approve their own document' });
      }

      const approvalAssignment = await prisma.documentAssignment.findFirst({
        where: {
          documentId: document.id,
          assignedToId: req.user.id,
          assignmentType: 'APPROVAL',
          status: 'PENDING',
        },
      });
      if (!approvalAssignment) {
        return res.status(403).json({ error: 'No pending approval assignment found' });
      }

      const pendingReviews = await prisma.documentAssignment.count({
        where: { documentId: document.id, assignmentType: 'REVIEW', status: 'PENDING' },
      });
      if (pendingReviews > 0) {
        return res.status(400).json({ error: 'All reviewers must complete review before approval' });
      }

      const signer = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { password: true },
      });
      const passwordOk = signer ? await bcrypt.compare(password, signer.password) : false;
      if (!passwordOk) return res.status(401).json({ error: 'Password verification failed' });

      const now = new Date();
      const documentHash = sha256(document.content || '');
      const passwordHash = await bcrypt.hash(password, 10);
      const signaturePayload = {
        documentId: document.id,
        signerId: req.user.id,
        signatureMeaning: 'Approver',
        signedAt: now.toISOString(),
        documentHash,
      };
      const signatureHash = sha256(JSON.stringify(signaturePayload));

      await prisma.$transaction(async (tx) => {
        await tx.documentAssignment.update({
          where: { id: approvalAssignment.id },
          data: { status: 'COMPLETED', completedAt: now, comments: comments || null },
        });
        await tx.document.update({
          where: { id: document.id },
          data: { status: 'APPROVED' },
        });
        const signature = await tx.documentSignature.create({
          data: {
            documentId: document.id,
            signerId: req.user.id,
            signatureMeaning: 'Approver',
            signedAt: now,
            documentHash,
            signatureHash,
            passwordHash,
          },
        });
        await tx.documentHistory.create({
          data: {
            documentId: document.id,
            userId: req.user.id,
            action: 'Approved',
            details: { comments: comments || null },
            digitalSignature: {
              signatureId: signature.id,
              signatureMeaning: 'Approver',
              documentHash,
              signatureHash,
              signedAt: now.toISOString(),
            },
          },
        });

        const qualityUsers = await tx.user.findMany({
          where: { role: { name: 'Quality Manager' } },
          select: { id: true },
        });
        for (const qualityUser of qualityUsers) {
          const existing = await tx.documentAssignment.findFirst({
            where: {
              documentId: document.id,
              assignedToId: qualityUser.id,
              assignmentType: 'QUALITY_RELEASE',
              status: 'PENDING',
            },
          });
          if (!existing) {
            await tx.documentAssignment.create({
              data: {
                documentId: document.id,
                assignedToId: qualityUser.id,
                assignmentType: 'QUALITY_RELEASE',
                status: 'PENDING',
              },
            });
          }
        }
      });

      const qualityUsers = await prisma.user.findMany({
        where: { role: { name: 'Quality Manager' } },
        select: { id: true },
      });
      await createNotifications(
        qualityUsers.map((u) => u.id),
        `Document ${document.documentId} is pending quality release.`,
        `/documents/${document.id}`
      );

      const auditCtx = getAuditContext(req);
      await createAuditLog({
        userId: req.user.id,
        action: 'DOCUMENT_APPROVED',
        entityType: DOCUMENT_ENTITY,
        entityId: document.id,
        beforeValue: { status: 'AWAITING_APPROVAL' },
        afterValue: { status: 'APPROVED' },
        reason: req.body.reason || req.body.comments || null,
        ...auditCtx,
      });

      res.json({ ok: true, status: 'APPROVED' });
    } catch (err) {
      console.error('Approve document error:', err);
      res.status(500).json({ error: 'Failed to approve document' });
    }
  }
);

async function qualityReleaseHandler(req, res) {
  try {
    const { password, comments } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required for digital signature' });
    }

    // CMMC L2 alignment — load the doc with signatures and run the
    // release gate. Refuses if SIA missing, no Approver signature, or
    // releaser is the author. See documentLifecycle.js for the full
    // gate matrix; spec at docs/specs/document-approval-cmmc-alignment.md
    // on the codex repo.
    const document = await loadDocumentForLifecycle(req.params.id);
    if (!document) return res.status(404).json({ error: 'Document not found' });
    const gate = gateForRelease(document, req.user.id);
    if (!gate.ok) {
      return res.status(409).json({ error: gate.reason });
    }

    const signer = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { password: true },
    });
    const passwordOk = signer ? await bcrypt.compare(password, signer.password) : false;
    if (!passwordOk) return res.status(401).json({ error: 'Password verification failed' });

    const qualityAssignment = await prisma.documentAssignment.findFirst({
      where: {
        documentId: document.id,
        assignedToId: req.user.id,
        assignmentType: 'QUALITY_RELEASE',
        status: 'PENDING',
      },
    });
    if (!qualityAssignment && req.user.roleName !== 'Admin') {
      return res.status(403).json({ error: 'No pending quality release assignment found' });
    }

    const now = new Date();
    const documentHash = sha256(document.content || '');
    const passwordHash = await bcrypt.hash(password, 10);
    const signaturePayload = {
      documentId: document.id,
      signerId: req.user.id,
      signatureMeaning: 'Quality Release',
      signedAt: now.toISOString(),
      documentHash,
    };
    const signatureHash = sha256(JSON.stringify(signaturePayload));

    await prisma.$transaction(async (tx) => {
      if (qualityAssignment) {
        await tx.documentAssignment.update({
          where: { id: qualityAssignment.id },
          data: { status: 'COMPLETED', completedAt: now, comments: comments || null },
        });
      }
      await tx.document.update({
        where: { id: document.id },
        data: {
          status: 'EFFECTIVE',
          effectiveDate: now,
          // CMMC L2 release-stamp fields. Distinct from the Approver
          // signature already on the doc; this is the Quality Manager's
          // formal "this is now in production" gate (CM.L2-3.4.5 [d]/[h]).
          releasedAt: now,
          releasedByUserId: req.user.id,
        },
      });
      await tx.document.updateMany({
        where: {
          documentId: document.documentId,
          id: { not: document.id },
          status: 'EFFECTIVE',
        },
        data: { status: 'OBSOLETE' },
      });
      await tx.documentSignature.create({
        data: {
          documentId: document.id,
          signerId: req.user.id,
          signatureMeaning: 'Quality Release',
          signedAt: now,
          documentHash,
          signatureHash,
          passwordHash,
        },
      });
      await tx.documentRevision.updateMany({
        where: { documentId: document.id },
        data: { effectiveDate: now },
      });
      await tx.documentHistory.create({
        data: {
          documentId: document.id,
          userId: req.user.id,
          action: 'Quality Released',
          details: { comments: comments || null },
          digitalSignature: {
            signatureMeaning: 'Quality Release',
            documentHash,
            signatureHash,
            signedAt: now.toISOString(),
          },
        },
      });
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'DOCUMENT_QUALITY_RELEASED',
      entityType: DOCUMENT_ENTITY,
      entityId: document.id,
      beforeValue: { status: 'APPROVED' },
      afterValue: { status: 'EFFECTIVE' },
      reason: req.body.reason || req.body.comments || null,
      ...auditCtx,
    });

    const allUsers = await prisma.user.findMany({ select: { id: true } });
    await createNotifications(
      allUsers.map((u) => u.id),
      `Document ${document.documentId} is now effective.`,
      `/documents/${document.id}`
    );

    // Automated Training Trigger: create training module and assign to required roles
    const defaultRequiredRoles = ['User', 'Manager', 'Quality Manager'];
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 30);
    const trainingModule = await prisma.trainingModule.create({
      data: {
        documentId: document.id,
        title: `Training for ${document.documentId} v${document.versionMajor}.${document.versionMinor}`,
        description: `Complete training for document: ${document.title}`,
        requiredRoles: defaultRequiredRoles,
        dueDate,
      },
    });
    const usersToAssign = await prisma.user.findMany({
      where: { role: { name: { in: defaultRequiredRoles } } },
      select: { id: true },
    });
    if (usersToAssign.length) {
      await prisma.userTrainingRecord.createMany({
        data: usersToAssign.map((u) => ({
          trainingModuleId: trainingModule.id,
          userId: u.id,
          status: 'ASSIGNED',
        })),
      });
      await createNotifications(
        usersToAssign.map((u) => u.id),
        `New training assigned: ${document.title}`,
        `/training?module=${trainingModule.id}`
      );
    }

    res.json({ ok: true, status: 'EFFECTIVE' });
  } catch (err) {
    console.error('Quality release error:', err);
    res.status(500).json({ error: 'Failed quality release' });
  }
}

// POST /api/documents/:id/security-impact-analysis
//
// CMMC CM.L2-3.4.4 — Security Impact Analysis recorded prior to APPROVED
// transition. Body: { securityImpactAnalysis: string }. Enforces SoD via
// gateForRecordSIA — recorder must not be author or any reviewer.
router.post(
  '/:id/security-impact-analysis',
  requireRoles('Quality Manager', 'Manager', 'System Admin'),
  requirePermission('document:review'),
  async (req, res) => {
    try {
      const text = String(req.body?.securityImpactAnalysis ?? '').trim();
      if (!text) {
        return res
          .status(400)
          .json({ error: 'securityImpactAnalysis text is required' });
      }
      const document = await loadDocumentForLifecycle(req.params.id);
      if (!document) return res.status(404).json({ error: 'Document not found' });
      const gate = gateForRecordSIA(document, req.user.id);
      if (!gate.ok) return res.status(409).json({ error: gate.reason });

      const before = {
        securityImpactAnalysis: document.securityImpactAnalysis,
        securityImpactAnalysisAt: document.securityImpactAnalysisAt,
        securityImpactAnalysisByUserId: document.securityImpactAnalysisByUserId,
      };

      const updated = await prisma.document.update({
        where: { id: document.id },
        data: {
          securityImpactAnalysis: text,
          securityImpactAnalysisAt: new Date(),
          securityImpactAnalysisByUserId: req.user.id,
          // If the doc was sitting in plain IN_REVIEW with no SIA, the
          // recording itself doesn't auto-progress — we keep the existing
          // approval submission flow as the next step. This preserves the
          // current submit-for-approval semantics.
        },
        select: {
          id: true,
          securityImpactAnalysis: true,
          securityImpactAnalysisAt: true,
          securityImpactAnalysisByUserId: true,
          status: true,
        },
      });

      await createAuditLog({
        userId: req.user.id,
        action: 'DOCUMENT_SIA_RECORDED',
        entityType: 'Document',
        entityId: document.id,
        beforeValue: before,
        afterValue: {
          length: text.length,
          recordedByUserId: req.user.id,
        },
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        requestId: req.requestId ?? null,
      });

      res.json({ document: updated });
    } catch (err) {
      console.error('Document SIA record error:', err);
      res.status(500).json({ error: 'Failed to record Security Impact Analysis' });
    }
  },
);

// GET /api/documents/:id/workflow-state
//
// Read-only diagnostic surface for the WorkflowStepper UI. Returns
// the current status, the next-required-action descriptor, and a
// release-readiness boolean. No auth changes beyond the parent
// authMiddleware on /api/documents.
router.get('/:id/workflow-state', async (req, res) => {
  try {
    const document = await loadDocumentForLifecycle(req.params.id);
    if (!document) return res.status(404).json({ error: 'Document not found' });
    const next = nextRequiredAction(document);
    const releaseGate = gateForRelease(document, req.user?.id ?? '');
    const callerId = req.user?.id ?? '';
    // Caller-specific assignment flags. The CmmcGatePanel uses these to
    // decide whether to render the action button for the current step
    // (e.g. only show "Sign as Reviewer" when the user has a pending
    // REVIEW assignment). Server endpoints still enforce gates; this is
    // purely UI-routing data.
    const assignments = document.assignments ?? [];
    const callerHasPendingReview = assignments.some(
      (a) => a.assignmentType === 'REVIEW' && a.status === 'PENDING' && a.assignedToId === callerId,
    );
    const callerHasPendingApproval = assignments.some(
      (a) => a.assignmentType === 'APPROVAL' && a.status === 'PENDING' && a.assignedToId === callerId,
    );
    res.json({
      status: document.status,
      hasSIA: Boolean(document.securityImpactAnalysis?.trim()),
      releasedAt: document.releasedAt,
      releasedByUserId: document.releasedByUserId,
      reviewerSignerCount: (document.signatures ?? []).filter((s) =>
        /^reviewer$|^review$/i.test(s.signatureMeaning),
      ).length,
      approverSignerCount: (document.signatures ?? []).filter((s) =>
        /^approver$|approve|release/i.test(s.signatureMeaning),
      ).length,
      nextRequiredAction: next,
      // Release-readiness for the *current caller*. Useful for
      // disabling the Release button with the right tooltip.
      releaseReadyForCaller: releaseGate.ok,
      releaseGateReason: releaseGate.ok ? null : releaseGate.reason,
      // Caller-specific UI routing flags (server gates still enforced)
      callerHasPendingReview,
      callerHasPendingApproval,
    });
  } catch (err) {
    console.error('Document workflow-state error:', err);
    res.status(500).json({ error: 'Failed to load workflow state' });
  }
});

// POST /api/documents/:id/submit-for-approval
//
// Manual transition IN_REVIEW → AWAITING_APPROVAL when the auto-flip in
// /review didn't fire (rare edge case: SIA recorded before the last
// reviewer signature, or assignment cleanup leaves a doc with reviewer
// signatures but no PENDING review assignments). Idempotent on already-
// AWAITING_APPROVAL state.
router.post(
  '/:id/submit-for-approval',
  requirePermission('document:review'),
  async (req, res) => {
    try {
      const document = await loadDocumentForLifecycle(req.params.id);
      if (!document) return res.status(404).json({ error: 'Document not found' });
      if (document.status === 'AWAITING_APPROVAL' || document.status === 'PENDING_APPROVAL') {
        return res.json({ ok: true, status: document.status, idempotent: true });
      }
      if (document.status !== 'IN_REVIEW') {
        return res.status(400).json({
          error: `Cannot submit for approval — document status is ${document.status}, expected IN_REVIEW`,
        });
      }
      const reviewerSigCount = (document.signatures ?? []).filter((s) =>
        /^reviewer$|^review$/i.test(s.signatureMeaning),
      ).length;
      if (reviewerSigCount < 1) {
        return res.status(400).json({
          error: 'At least one Reviewer signature is required before submitting for approval.',
        });
      }
      if (!document.securityImpactAnalysis?.trim()) {
        return res.status(400).json({
          error:
            'Security Impact Analysis (CMMC CM.L2-3.4.4) must be recorded before submitting for approval.',
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.document.update({
          where: { id: document.id },
          data: { status: 'AWAITING_APPROVAL' },
        });
        await tx.documentHistory.create({
          data: {
            documentId: document.id,
            userId: req.user.id,
            action: 'Submitted for Approval',
            details: { reviewerSigCount, hasSIA: true },
          },
        });
      });

      const auditCtx = getAuditContext(req);
      await createAuditLog({
        userId: req.user.id,
        action: 'DOCUMENT_SUBMITTED_FOR_APPROVAL',
        entityType: DOCUMENT_ENTITY,
        entityId: document.id,
        beforeValue: { status: 'IN_REVIEW' },
        afterValue: { status: 'AWAITING_APPROVAL' },
        ...auditCtx,
      });

      res.json({ ok: true, status: 'AWAITING_APPROVAL' });
    } catch (err) {
      console.error('Submit for approval error:', err);
      res.status(500).json({ error: 'Failed to submit for approval' });
    }
  },
);

// POST /api/documents/:id/quality-release
router.post(
  '/:id/quality-release',
  requireRoles('Quality Manager', 'System Admin'),
  requirePermission('document:release'),
  qualityReleaseHandler
);

// POST /api/documents/:id/revise
router.post('/:id/revise', requirePermission('document:create'), async (req, res) => {
  try {
    const { revisionType, summaryOfChange } = req.body;
    const normalized = typeof revisionType === 'string' ? revisionType.trim().toLowerCase() : '';
    if (!['major', 'minor'].includes(normalized)) {
      return res.status(400).json({ error: 'revisionType must be "major" or "minor"' });
    }

    const permission =
      normalized === 'major' ? 'document:revise:major' : 'document:revise:minor';
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ error: `Missing permission: ${permission}` });
    }

    const source = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!source) return res.status(404).json({ error: 'Document not found' });
    if (source.status !== 'EFFECTIVE') {
      return res.status(400).json({ error: 'Only effective documents can be revised' });
    }

    const nextMajor = normalized === 'major' ? source.versionMajor + 1 : source.versionMajor;
    const nextMinor = normalized === 'major' ? 0 : source.versionMinor + 1;

    const revisedDraft = await prisma.document.create({
      data: {
        documentId: source.documentId,
        title: source.title,
        documentType: source.documentType,
        versionMajor: nextMajor,
        versionMinor: nextMinor,
        status: 'DRAFT',
        content: source.content || '',
        authorId: req.user.id,
        // Inherit org from the doc being revised; falls through to the helper if source predates the column.
        organizationId: source.organizationId || getMacTechOrgId(),
        supersedesDocumentId: source.id,
        revisions: {
          create: {
            versionMajor: nextMajor,
            versionMinor: nextMinor,
            effectiveDate: source.effectiveDate || new Date(),
            authorId: req.user.id,
            summaryOfChange:
              typeof summaryOfChange === 'string' && summaryOfChange.trim()
                ? summaryOfChange.trim()
                : `${normalized === 'major' ? 'Major' : 'Minor'} revision from ${source.versionMajor}.${source.versionMinor}`,
          },
        },
      },
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'DOCUMENT_REVISION_CREATED',
      entityType: DOCUMENT_ENTITY,
      entityId: revisedDraft.id,
      beforeValue: { sourceId: source.id, version: `${source.versionMajor}.${source.versionMinor}` },
      afterValue: { revisedId: revisedDraft.id, version: `${nextMajor}.${nextMinor}`, revisionType: normalized },
      reason: req.body.reason || summaryOfChange || null,
      ...auditCtx,
    });

    await createHistory({
      documentId: revisedDraft.id,
      userId: req.user.id,
      action: 'Revision Created',
      details: {
        revisionType: normalized,
        previousDocumentInternalId: source.id,
        previousVersion: `${source.versionMajor}.${source.versionMinor}`,
        newVersion: `${revisedDraft.versionMajor}.${revisedDraft.versionMinor}`,
      },
    });

    // Auto-create a Change Control record linked to this document revision
    try {
      const changeId = await getNextChangeId();
      const prevVersion = `${source.versionMajor}.${source.versionMinor}`;
      const newVersion = `${revisedDraft.versionMajor}.${revisedDraft.versionMinor}`;
      const ccTitle = `Document Revision: ${source.documentId} - ${source.title}`;
      const ccDescription =
        `Initiated for revision of document ${source.documentId} from version ${prevVersion} to ${newVersion} (Type: ${normalized === 'major' ? 'Major' : 'Minor'}). ` +
        `Related document (revised draft): ${revisedDraft.id}.`;
      const cc = await prisma.changeControl.create({
        data: {
          changeId,
          title: ccTitle,
          description: ccDescription,
          status: 'DRAFT',
          initiatorId: req.user.id,
          ownerId: req.user.id,
        },
      });
      await prisma.changeControlHistory.create({
        data: {
          changeControlId: cc.id,
          userId: req.user.id,
          action: 'CREATED',
          details: {
            changeId: cc.changeId,
            title: cc.title,
            source: 'document_revision',
            documentId: source.documentId,
            revisedDocumentId: revisedDraft.id,
            revisionType: normalized,
          },
        },
      });
    } catch (ccErr) {
      console.error('Auto-create change control on document revise:', ccErr);
      // Document revision already succeeded; do not fail the request
    }

    res.status(201).json({ document: revisedDraft });
  } catch (err) {
    console.error('Revise document error:', err);
    res.status(500).json({ error: 'Failed to create revised document' });
  }
});

export default router;
