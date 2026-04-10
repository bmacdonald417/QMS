/**
 * Integration client management (System Admin only).
 * POST create, GET list, PATCH update, POST rotate-secret.
 */

import express from 'express';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { requireSystemRole, auditFromRequest } from '../systemMiddleware.js';
import { VALID_SCOPES } from '../integrations/scopes.js';
const router = express.Router();
const SALT_ROUNDS = 12;

/** Generate a URL-safe client ID (e.g. ic_xxxx) */
function generateClientId() {
  const bytes = randomBytes(16);
  return 'ic_' + bytes.toString('base64url');
}

/** Generate a secure one-time secret */
function generateSecret() {
  return 'sec_' + randomBytes(32).toString('base64url');
}

/** Hash secret for storage (never store plaintext) */
async function hashSecret(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Verify secret against hash */
async function verifySecret(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * POST /api/system/integrations/clients
 * Body: { name, scopes: string[] }
 * Returns: { clientId, clientSecret } - secret shown ONCE only
 */
router.post('/clients', requireSystemRole('System Admin'), async (req, res) => {
  try {
    const { name, scopes } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const scopeList = Array.isArray(scopes) ? scopes.filter((s) => VALID_SCOPES.includes(s)) : [];
    const clientId = generateClientId();
    const clientSecret = generateSecret();
    const secretHash = await hashSecret(clientSecret);

    await prisma.integrationClient.create({
      data: {
        clientId,
        name: name.trim(),
        scopes: scopeList,
        secrets: {
          create: { secretHash },
        },
      },
    });

    await auditFromRequest(req, {
      action: 'INTEGRATION_CLIENT_CREATED',
      entityType: 'IntegrationClient',
      entityId: clientId,
      beforeValue: null,
      afterValue: { clientId, name: name.trim(), scopes: scopeList },
    });

    res.status(201).json({
      clientId,
      clientSecret,
      name: name.trim(),
      scopes: scopeList,
      message: 'Store clientSecret securely. It will not be shown again.',
    });
  } catch (err) {
    console.error('Create integration client error:', err);
    res.status(500).json({ error: 'Failed to create integration client' });
  }
});

/**
 * GET /api/system/integrations/clients
 * List all clients (no secrets)
 */
router.get('/clients', requireSystemRole('System Admin'), async (req, res) => {
  try {
    const clients = await prisma.integrationClient.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        clientId: true,
        name: true,
        scopes: true,
        isActive: true,
        createdAt: true,
        lastRotatedAt: true,
      },
    });
    res.json({ clients });
  } catch (err) {
    console.error('List integration clients error:', err);
    res.status(500).json({ error: 'Failed to list integration clients' });
  }
});

/**
 * PATCH /api/system/integrations/clients/:clientId
 * Body: { name?, scopes?, isActive? }
 */
router.patch('/clients/:clientId', requireSystemRole('System Admin'), async (req, res) => {
  try {
    const { clientId } = req.params;
    const { name, scopes, isActive } = req.body;

    const existing = await prisma.integrationClient.findUnique({
      where: { clientId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Integration client not found' });
    }

    const updates = {};
    if (typeof name === 'string' && name.trim()) updates.name = name.trim();
    if (Array.isArray(scopes)) updates.scopes = scopes.filter((s) => VALID_SCOPES.includes(s));
    if (typeof isActive === 'boolean') updates.isActive = isActive;

    const updated = await prisma.integrationClient.update({
      where: { clientId },
      data: updates,
    });

    await auditFromRequest(req, {
      action: 'INTEGRATION_CLIENT_UPDATED',
      entityType: 'IntegrationClient',
      entityId: clientId,
      beforeValue: { name: existing.name, scopes: existing.scopes, isActive: existing.isActive },
      afterValue: { name: updated.name, scopes: updated.scopes, isActive: updated.isActive },
    });

    res.json({
      clientId: updated.clientId,
      name: updated.name,
      scopes: updated.scopes,
      isActive: updated.isActive,
    });
  } catch (err) {
    console.error('Update integration client error:', err);
    res.status(500).json({ error: 'Failed to update integration client' });
  }
});

/**
 * POST /api/system/integrations/clients/:clientId/rotate-secret
 * Returns new clientSecret ONCE only
 */
router.post('/clients/:clientId/rotate-secret', requireSystemRole('System Admin'), async (req, res) => {
  try {
    const { clientId } = req.params;

    const client = await prisma.integrationClient.findUnique({
      where: { clientId },
      include: { secrets: { where: { isActive: true } } },
    });
    if (!client) {
      return res.status(404).json({ error: 'Integration client not found' });
    }

    const newSecret = generateSecret();
    const secretHash = await hashSecret(newSecret);

    await prisma.$transaction([
      prisma.integrationSecret.updateMany({
        where: { clientId },
        data: { isActive: false },
      }),
      prisma.integrationSecret.create({
        data: { clientId, secretHash },
      }),
      prisma.integrationClient.update({
        where: { clientId },
        data: { lastRotatedAt: new Date() },
      }),
    ]);

    await auditFromRequest(req, {
      action: 'INTEGRATION_SECRET_ROTATED',
      entityType: 'IntegrationClient',
      entityId: clientId,
      beforeValue: null,
      afterValue: { rotatedAt: new Date().toISOString() },
    });

    res.json({
      clientId,
      clientSecret: newSecret,
      message: 'Store the new clientSecret securely. The previous secret is now invalid.',
    });
  } catch (err) {
    console.error('Rotate integration secret error:', err);
    res.status(500).json({ error: 'Failed to rotate secret' });
  }
});

export default router;
