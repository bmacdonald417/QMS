import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { prisma } from './db.js';
import { requirePermission } from './auth.js';
import { createAuditLog, getAuditContext } from './audit.js';

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

function hasPermission(req, code) {
  if (req.user?.roleName === 'Admin' || req.user?.roleName === 'System Admin') return true;
  return (req.user?.permissions || []).includes(code);
}

// GET /api/files/:fileId — stream file; authorize by entity type (CAPA, CHANGE_CONTROL, DOCUMENT)
router.get('/:fileId', async (req, res) => {
  try {
    const fileAsset = await prisma.fileAsset.findUnique({
      where: { id: req.params.fileId },
    });
    if (!fileAsset || fileAsset.isDeleted) {
      return res.status(404).json({ error: 'File not found' });
    }
    const link = await prisma.fileLink.findFirst({
      where: { fileAssetId: fileAsset.id },
    });
    if (!link) return res.status(404).json({ error: 'File not found' });

    if (link.entityType === 'CAPA') {
      if (!hasPermission(req, 'capa:view')) return res.status(403).json({ error: 'Access denied' });
      const capa = await prisma.cAPA.findUnique({ where: { id: link.entityId } });
      if (!capa) return res.status(404).json({ error: 'File not found' });
    } else if (link.entityType === 'CHANGE_CONTROL') {
      if (!hasPermission(req, 'change:view')) return res.status(403).json({ error: 'Access denied' });
      const cc = await prisma.changeControl.findUnique({ where: { id: link.entityId } });
      if (!cc) return res.status(404).json({ error: 'File not found' });
    } else if (link.entityType === 'DOCUMENT') {
      if (!hasPermission(req, 'document:view')) return res.status(403).json({ error: 'Access denied' });
      const doc = await prisma.document.findUnique({ where: { id: link.entityId } });
      if (!doc) return res.status(404).json({ error: 'File not found' });
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = path.join(UPLOAD_DIR, fileAsset.storageKey);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on storage' });
    }
    res.setHeader('Content-Type', fileAsset.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileAsset.filename}"`);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    console.error('Get file error:', err);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

// DELETE /api/files/:fileId — soft delete
router.delete('/:fileId', requirePermission('file:delete'), async (req, res) => {
  try {
    const fileAsset = await prisma.fileAsset.findUnique({
      where: { id: req.params.fileId },
      include: { fileLinks: true },
    });
    if (!fileAsset) return res.status(404).json({ error: 'File not found' });
    if (fileAsset.isDeleted) return res.status(400).json({ error: 'File already deleted' });

    const link = fileAsset.fileLinks?.[0];
    if (link?.entityType === 'CAPA' && !hasPermission(req, 'capa:update')) {
      return res.status(403).json({ error: 'Cannot delete file from this CAPA' });
    }
    if (link?.entityType === 'CHANGE_CONTROL' && !hasPermission(req, 'change:update')) {
      return res.status(403).json({ error: 'Cannot delete file from this change control' });
    }
    if (link?.entityType === 'DOCUMENT' && !hasPermission(req, 'document:create')) {
      return res.status(403).json({ error: 'Cannot delete file from this document' });
    }

    const now = new Date();
    await prisma.fileAsset.update({
      where: { id: fileAsset.id },
      data: { isDeleted: true, deletedAt: now },
    });

    const auditCtx = getAuditContext(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'FILE_SOFT_DELETED',
      entityType: 'FileAsset',
      entityId: fileAsset.id,
      beforeValue: { storageKey: fileAsset.storageKey, filename: fileAsset.filename },
      afterValue: { isDeleted: true, deletedAt: now },
      reason: null,
      ...auditCtx,
    });

    if (link?.entityType === 'CHANGE_CONTROL' && link.entityId) {
      await prisma.changeControlHistory.create({
        data: {
          changeControlId: link.entityId,
          userId: req.user.id,
          action: 'FILE_DELETED',
          details: { fileAssetId: fileAsset.id, filename: fileAsset.filename },
        },
      });
    }

    res.json({ ok: true, message: 'File deleted' });
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
export { UPLOAD_DIR };
