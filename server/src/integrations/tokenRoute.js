/**
 * POST /api/integrations/token - Client credentials style token issuance.
 * Body: { clientId, clientSecret }
 * Returns: { access_token, token_type, expires_in, scope }
 */

import express from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../db.js';
import { mintIntegrationToken, isIntegrationAuthEnabled } from './auth.js';

const router = express.Router();
const TTL_MINUTES = Number(process.env.INTEGRATION_TOKEN_TTL_MINUTES) || 10;

router.post('/token', async (req, res) => {
  if (!isIntegrationAuthEnabled()) {
    return res.status(503).json({
      error: 'Integration token auth is disabled. Set INTEGRATION_JWT_SECRET to enable.',
    });
  }

  const { clientId, clientSecret } = req.body;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'clientId and clientSecret are required' });
  }

  try {
    const client = await prisma.integrationClient.findUnique({
      where: { clientId: String(clientId).trim() },
      include: { secrets: { where: { isActive: true } } },
    });

    if (!client || !client.isActive) {
      return res.status(401).json({ error: 'Invalid client credentials' });
    }

    if (!client.secrets || client.secrets.length === 0) {
      return res.status(401).json({ error: 'Invalid client credentials' });
    }

    let matched = false;
    for (const secret of client.secrets) {
      const ok = await bcrypt.compare(String(clientSecret), secret.secretHash);
      if (ok) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      return res.status(401).json({ error: 'Invalid client credentials' });
    }

    const token = mintIntegrationToken({
      clientId: client.clientId,
      scopes: client.scopes || [],
    });

    const expiresIn = TTL_MINUTES * 60;
    res.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope: (client.scopes || []).join(' '),
    });
  } catch (err) {
    console.error('Token issuance error:', err);
    res.status(500).json({ error: 'Failed to issue token' });
  }
});

export default router;
