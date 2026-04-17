import express from 'express';
import { listOpenRequestsForMcp } from './agentService.js';

const router = express.Router();

function mcpSecretAuth(req, res, next) {
  const secret = process.env.AGENT_MCP_SECRET || '';
  if (!secret) {
    return res.status(503).json({ error: 'AGENT_MCP_SECRET is not configured on the server' });
  }
  const header = req.headers['x-agent-mcp-secret'];
  if (typeof header === 'string' && header === secret) return next();
  return res.status(401).json({ error: 'Invalid or missing X-Agent-Mcp-Secret' });
}

/**
 * GET /api/agent/mcp/open-requests — no JWT; automation uses shared secret only.
 */
router.get('/open-requests', mcpSecretAuth, async (_req, res) => {
  try {
    const requests = await listOpenRequestsForMcp({ take: 200 });
    res.set('Cache-Control', 'no-store');
    res.json({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      requests,
    });
  } catch (err) {
    console.error('Agent MCP list error:', err);
    res.status(500).json({ error: 'Failed to list open requests' });
  }
});

export default router;
