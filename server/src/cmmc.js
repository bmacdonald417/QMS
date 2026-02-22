import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import { prisma } from './db.js';
import { authMiddleware, requirePermission, requireRoles } from './auth.js';
import { createAuditLog } from './audit.js';
import { loadManifest, getDocumentFromManifest, getDocumentsByCategory } from './lib/cmmc/manifest.js';
import { readDocumentFile, getDocumentMetadata } from './lib/cmmc/docParser.js';
import { normalizeMarkdown } from './lib/cmmc/canonicalize.js';
import {
  computeContentHash,
  computeManifestHash,
  computeSigningHash,
  verifySigningHash,
} from './lib/cmmc/hashing.js';

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const CMMC_BUNDLE_DIR = path.join(UPLOAD_DIR, 'cmmc-bundles');

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(CMMC_BUNDLE_DIR)) {
  fs.mkdirSync(CMMC_BUNDLE_DIR, { recursive: true });
}

// Multer configuration for zip upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, CMMC_BUNDLE_DIR);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `cmmc-bundle-${timestamp}.zip`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'));
    }
  },
});

/**
 * GET /api/cmmc/documents
 * List all CMMC documents with optional filters
 */
router.get('/documents', async (req, res) => {
  try {
    const { search, kind, status, reviewCadence } = req.query;

    const where = {};
    if (kind) where.kind = kind;
    if (status) where.status = status;
    if (reviewCadence) where.reviewCadence = reviewCadence;

    const documents = await prisma.cmmcDocument.findMany({
      where,
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: {
          select: { signatures: true },
        },
      },
      orderBy: { code: 'asc' },
    });

    // Filter by search if provided
    let filtered = documents;
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = documents.filter(
        (doc) =>
          doc.code.toLowerCase().includes(searchLower) ||
          doc.title.toLowerCase().includes(searchLower)
      );
    }

    res.json({ documents: filtered });
  } catch (error) {
    console.error('Error fetching CMMC documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

/**
 * GET /api/cmmc/documents/by-category
 * Get documents grouped by category folder
 */
router.get('/documents/by-category', async (req, res) => {
  try {
    const categories = await getDocumentsByCategory();
    const dbDocuments = await prisma.cmmcDocument.findMany({
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const dbMap = new Map(dbDocuments.map((d) => [d.code, d]));

    // Merge manifest data with DB data
    const result = {};
    for (const [category, manifestDocs] of Object.entries(categories)) {
      result[category] = manifestDocs.map((manifestDoc) => {
        const dbDoc = dbMap.get(manifestDoc.code);
        return {
          ...manifestDoc,
          status: dbDoc?.status || 'DRAFT',
          latestRevision: dbDoc?.revisions[0] || null,
        };
      });
    }

    res.json({ categories: result });
  } catch (error) {
    console.error('Error fetching documents by category:', error);
    res.status(500).json({ error: 'Failed to fetch documents by category' });
  }
});

/**
 * GET /api/cmmc/documents/:code
 * Get document details and current revision
 */
router.get('/documents/:code', async (req, res) => {
  try {
    const { code } = req.params;

    // Get from manifest
    const manifestDoc = await getDocumentFromManifest(code);
    if (!manifestDoc) {
      return res.status(404).json({ error: 'Document not found in manifest' });
    }

    // Get from DB
    let dbDoc = await prisma.cmmcDocument.findUnique({
      where: { code },
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            signatures: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
              orderBy: { signedAt: 'desc' },
            },
          },
        },
      },
    });

    // If not in DB, create placeholder
    if (!dbDoc) {
      dbDoc = {
        id: null,
        code,
        title: manifestDoc.title,
        kind: manifestDoc.kind,
        path: manifestDoc.path,
        qmsDocType: manifestDoc.qms_doc_type,
        reviewCadence: manifestDoc.review_cadence || null,
        status: 'DRAFT',
        revisions: [],
      };
    }

    // Extract signatures from latest revision
    const latestRevision = dbDoc.revisions?.[0];
    const signatures = latestRevision?.signatures || [];

    // Get parsed metadata from file
    let fileMetadata = null;
    try {
      fileMetadata = await getDocumentMetadata(manifestDoc.path);
    } catch (error) {
      console.warn(`Failed to parse metadata for ${code}:`, error.message);
    }

    res.json({
      document: {
        ...dbDoc,
        signatures,
        manifest: manifestDoc,
        fileMetadata,
      },
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

/**
 * GET /api/cmmc/documents/:code/content
 * Get markdown content
 */
router.get('/documents/:code/content', async (req, res) => {
  try {
    const { code } = req.params;
    const manifestDoc = await getDocumentFromManifest(code);
    if (!manifestDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const { content, metadata, body } = readDocumentFile(manifestDoc.path);

    res.json({
      content,
      metadata,
      body,
    });
  } catch (error) {
    console.error('Error reading document content:', error);
    res.status(500).json({ error: 'Failed to read document content' });
  }
});

/**
 * GET /api/cmmc/documents/:code/revisions
 * Get revision history
 */
router.get('/documents/:code/revisions', async (req, res) => {
  try {
    const { code } = req.params;
    const document = await prisma.cmmcDocument.findUnique({
      where: { code },
      include: {
        revisions: {
          include: {
            signatures: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ revisions: document.revisions });
  } catch (error) {
    console.error('Error fetching revisions:', error);
    res.status(500).json({ error: 'Failed to fetch revisions' });
  }
});

/**
 * POST /api/cmmc/documents/sync
 * Admin: sync manifest + files
 */
// Sync endpoint - require admin role or system admin
router.post('/documents/sync', requireRoles('System Admin', 'Admin', 'System Administrator'), async (req, res) => {
  try {
    let manifest, metadata;
    try {
      const result = await loadManifest();
      manifest = result.documents;
      metadata = result.metadata;
    } catch (error) {
      console.error('Failed to load manifest:', error);
      return res.status(500).json({
        error: 'Failed to load manifest',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
    const summary = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: [],
    };

    for (const manifestDoc of manifest) {
      try {
        summary.processed++;

        // Read and parse file
        const { content, metadata: fileMetadata, body } = readDocumentFile(manifestDoc.path);
        const normalizedBody = normalizeMarkdown(body);
        const contentHash = computeContentHash(normalizedBody);
        const manifestHash = computeManifestHash(manifestDoc);

        // Check if document exists
        const existing = await prisma.cmmcDocument.findUnique({
          where: { code: manifestDoc.code },
          include: {
            revisions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });

        if (!existing) {
          // Create new document
          await prisma.cmmcDocument.create({
            data: {
              code: manifestDoc.code,
              title: manifestDoc.title,
              kind: manifestDoc.kind,
              path: manifestDoc.path,
              qmsDocType: manifestDoc.qms_doc_type,
              reviewCadence: manifestDoc.review_cadence || null,
              status: 'DRAFT',
              revisions: {
                create: {
                  revisionLabel: fileMetadata.version || '1.0',
                  date: fileMetadata.date || new Date().toISOString().split('T')[0],
                  classification: fileMetadata.classification || null,
                  framework: fileMetadata.framework || null,
                  reference: fileMetadata.reference || null,
                  appliesTo: fileMetadata.appliesTo || null,
                  contentHash,
                  manifestHash,
                },
              },
            },
          });
          summary.created++;
        } else {
          // Check if content changed
          const latestRevision = existing.revisions[0];
          const contentChanged = !latestRevision || latestRevision.contentHash !== contentHash;

          if (contentChanged) {
            // Create new revision
            await prisma.cmmcRevision.create({
              data: {
                documentId: existing.id,
                revisionLabel: fileMetadata.version || '1.0',
                date: fileMetadata.date || new Date().toISOString().split('T')[0],
                classification: fileMetadata.classification || null,
                framework: fileMetadata.framework || null,
                reference: fileMetadata.reference || null,
                appliesTo: fileMetadata.appliesTo || null,
                contentHash,
                manifestHash,
              },
            });
            summary.updated++;
          }

          // Update document metadata if needed
          if (
            existing.title !== manifestDoc.title ||
            existing.kind !== manifestDoc.kind ||
            existing.path !== manifestDoc.path ||
            existing.qmsDocType !== manifestDoc.qms_doc_type ||
            existing.reviewCadence !== (manifestDoc.review_cadence || null)
          ) {
            await prisma.cmmcDocument.update({
              where: { code: manifestDoc.code },
              data: {
                title: manifestDoc.title,
                kind: manifestDoc.kind,
                path: manifestDoc.path,
                qmsDocType: manifestDoc.qms_doc_type,
                reviewCadence: manifestDoc.review_cadence || null,
              },
            });
          }
        }
      } catch (error) {
        summary.errors.push({
          code: manifestDoc.code,
          error: error.message,
        });
      }
    }

    await createAuditLog({
      userId: req.user.id,
      action: 'CMMC_SYNC',
      entityType: 'CmmcDocument',
      entityId: null,
      afterValue: summary,
    });

    res.json({ summary });
  } catch (error) {
    console.error('Error syncing documents:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to sync documents',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      bundlePath: process.env.CMMC_BUNDLE_PATH || 'default',
      cwd: process.cwd(),
    });
  }
});

/**
 * POST /api/cmmc/documents/:code/sign
 * Sign a revision
 */
router.post('/documents/:code/sign', async (req, res) => {
  try {
    const { code } = req.params;
    const { method, role, signatureData, password } = req.body;

    if (!method || !role || !signatureData) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get document with latest revision and existing signatures
    const document = await prisma.cmmcDocument.findUnique({
      where: { code },
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            signatures: {
              where: { userId: req.user.id },
            },
          },
        },
      },
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const latestRevision = document.revisions[0];
    if (!latestRevision) {
      return res.status(400).json({ error: 'No revision found for document' });
    }

    // Check if user has already signed this revision
    const existingSignature = latestRevision.signatures.find((sig) => sig.userId === req.user.id);
    if (existingSignature) {
      return res.status(400).json({ error: 'You have already signed this revision' });
    }

    // Get manifest and file data
    const manifestDoc = await getDocumentFromManifest(code);
    if (!manifestDoc) {
      return res.status(404).json({ error: 'Document not found in manifest' });
    }

    const { metadata: fileMetadata, body } = readDocumentFile(manifestDoc.path);
    const normalizedBody = normalizeMarkdown(body);

    // Compute signing hash
    const { hash: signingHash, payload, canonicalJson } = computeSigningHash({
      docCode: code,
      title: manifestDoc.title,
      kind: manifestDoc.kind,
      qmsDocType: manifestDoc.qms_doc_type,
      reviewCadence: manifestDoc.review_cadence || null,
      version: fileMetadata.version || '1.0',
      date: fileMetadata.date || new Date().toISOString().split('T')[0],
      classification: fileMetadata.classification || '—',
      framework: fileMetadata.framework || '—',
      reference: fileMetadata.reference || '—',
      appliesTo: fileMetadata.appliesTo || null,
      normalizedMarkdownBody: normalizedBody,
    });

    // Update revision with signing hash and snapshot if not already set
    if (!latestRevision.signingHash) {
      await prisma.cmmcRevision.update({
        where: { id: latestRevision.id },
        data: {
          signingHash: signingHash,
          snapshotJson: payload,
        },
      });
    } else if (latestRevision.signingHash !== signingHash) {
      return res.status(400).json({
        error: 'Document content has changed. A new revision must be created before signing.',
      });
    }

    // Verify password if provided (for typed signatures)
    if (method === 'TYPED' && password) {
      // In a real implementation, verify password here
      // For now, we'll just check that it's provided
    }

    // Create signature
    const signature = await prisma.cmmcSignature.create({
      data: {
        revisionId: latestRevision.id,
        documentId: document.id,
        userId: req.user.id,
        method,
        role,
        signatureData,
        signingHash,
        userAgent: req.headers['user-agent'] || null,
        ip: req.ip || null,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'CMMC_SIGN',
      entityType: 'CmmcDocument',
      entityId: document.id,
      afterValue: {
        code,
        revisionId: latestRevision.id,
        method,
        role,
      },
    });

    res.json({ signature });
  } catch (error) {
    console.error('Error signing document:', error);
    res.status(500).json({ error: 'Failed to sign document' });
  }
});

/**
 * GET /api/cmmc/documents/:code/evidence
 * Get evidence page data
 */
router.get('/documents/:code/evidence', async (req, res) => {
  try {
    const { code } = req.params;

    const document = await prisma.cmmcDocument.findUnique({
      where: { code },
      include: {
        revisions: {
          include: {
            signatures: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
              orderBy: { signedAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const latestRevision = document.revisions[0];
    if (!latestRevision) {
      return res.json({
        document,
        revision: null,
        signatures: [],
        tamperCheck: null,
      });
    }

    // Check for tampering (compare current file hash vs signed revision hash)
    let tamperCheck = null;
    try {
      const manifestDoc = await getDocumentFromManifest(code);
      if (manifestDoc) {
        const { body } = readDocumentFile(manifestDoc.path);
        const normalizedBody = normalizeMarkdown(body);
        const currentContentHash = computeContentHash(normalizedBody);
        const signedContentHash = latestRevision.contentHash;

        tamperCheck = {
          currentHash: currentContentHash,
          signedHash: signedContentHash,
          matches: currentContentHash === signedContentHash,
        };
      }
    } catch (error) {
      console.warn('Error checking tamper:', error);
    }

    res.json({
      document,
      revision: latestRevision,
      signatures: latestRevision.signatures,
      tamperCheck,
    });
  } catch (error) {
    console.error('Error fetching evidence:', error);
    res.status(500).json({ error: 'Failed to fetch evidence' });
  }
});

/**
 * GET /api/cmmc/documents/:code/verify
 * Verify hash against current file
 */
router.get('/documents/:code/verify', async (req, res) => {
  try {
    const { code } = req.params;

    const document = await prisma.cmmcDocument.findUnique({
      where: { code },
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!document || !document.revisions[0]) {
      return res.status(404).json({ error: 'Document or revision not found' });
    }

    const revision = document.revisions[0];
    const manifestDoc = await getDocumentFromManifest(code);
    if (!manifestDoc) {
      return res.status(404).json({ error: 'Document not found in manifest' });
    }

    const { metadata: fileMetadata, body } = readDocumentFile(manifestDoc.path);
    const normalizedBody = normalizeMarkdown(body);

    // Verify content hash
    const currentContentHash = computeContentHash(normalizedBody);
    const contentMatches = currentContentHash === revision.contentHash;

    // Verify signing hash if present
    let signingMatches = null;
    if (revision.signingHash) {
      const { hash: currentSigningHash } = computeSigningHash({
        docCode: code,
        title: manifestDoc.title,
        kind: manifestDoc.kind,
        qmsDocType: manifestDoc.qms_doc_type,
        reviewCadence: manifestDoc.review_cadence || null,
        version: fileMetadata.version || '1.0',
        date: fileMetadata.date || new Date().toISOString().split('T')[0],
        classification: fileMetadata.classification || '—',
        framework: fileMetadata.framework || '—',
        reference: fileMetadata.reference || '—',
        appliesTo: fileMetadata.appliesTo || null,
        normalizedMarkdownBody: normalizedBody,
      });
      signingMatches = currentSigningHash === revision.signingHash;
    }

    res.json({
      contentHash: {
        current: currentContentHash,
        signed: revision.contentHash,
        matches: contentMatches,
      },
      signingHash: revision.signingHash
        ? {
            current: signingMatches !== null ? 'computed' : null,
            signed: revision.signingHash,
            matches: signingMatches,
          }
        : null,
    });
  } catch (error) {
    console.error('Error verifying document:', error);
    res.status(500).json({ error: 'Failed to verify document' });
  }
});

/**
 * PATCH /api/cmmc/documents/:code/status
 * Update document status (admin only)
 */
// Status update - require admin role
router.patch('/documents/:code/status', requireRoles('System Admin', 'Admin', 'System Administrator'), async (req, res) => {
  try {
    const { code } = req.params;
    const { status } = req.body;

    if (!['DRAFT', 'IN_REVIEW', 'EFFECTIVE', 'RETIRED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const document = await prisma.cmmcDocument.update({
      where: { code },
      data: { status },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'CMMC_STATUS_UPDATE',
      entityType: 'CmmcDocument',
      entityId: document.id,
      afterValue: { status },
    });

    res.json({ document });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

export default router;