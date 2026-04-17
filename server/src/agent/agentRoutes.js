import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireRoles } from '../auth.js';
import {
  createSuggestUpdateRequest,
  createBuildWorkflowRequest,
  listAgentRequests,
  getAgentRequestById,
  updateAgentRequestStatus,
} from './agentService.js';
import {
  createAgentRequestSchema,
  patchAgentRequestSchema,
  agentChatBodySchema,
} from './agentSchemas.js';
import { runAgentAssistantChat } from './agentAssistantService.js';

const router = express.Router();

const qmsAgentAccess = requireRoles('System Admin', 'Quality Manager');

const agentChatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many assistant requests. Try again in a few minutes.' },
});

/** POST /api/agent/assistant/chat — conversational coaching; optional OpenAI when configured. */
router.post('/assistant/chat', qmsAgentAccess, agentChatLimiter, express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const parsed = agentChatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() });
    }
    const { mode, routePath, messages } = parsed.data;
    const out = await runAgentAssistantChat({ mode, routePath, messages });
    res.set('Cache-Control', 'no-store');
    res.json(out);
  } catch (err) {
    console.error('Agent assistant chat error:', err);
    res.status(500).json({ error: 'Assistant chat failed' });
  }
});

/** POST /api/agent/requests — create intake (no autonomous implementation). */
router.post('/requests', qmsAgentAccess, express.json({ limit: '14mb' }), async (req, res) => {
  try {
    const parsed = createAgentRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() });
    }
    const body = parsed.data;
    if (body.type === 'SUGGEST_UPDATE') {
      const request = await createSuggestUpdateRequest({ userId: req.user.id, body, req });
      return res.status(201).json({ request: { id: request.id, status: request.status, type: request.type } });
    }
    const request = await createBuildWorkflowRequest({ userId: req.user.id, body, req });
    return res.status(201).json({ request: { id: request.id, status: request.status, type: request.type } });
  } catch (err) {
    console.error('Agent create request error:', err);
    if (err?.code === 'ATTACHMENT_TOO_LARGE') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to create agent request' });
  }
});

/** GET /api/agent/requests — admin list with filters. */
router.get('/requests', qmsAgentAccess, async (req, res) => {
  try {
    const { type, status, priority, moduleName, from, to, limit, offset } = req.query;
    const take = Math.min(parseInt(String(limit || '50'), 10) || 50, 200);
    const skip = Math.max(0, parseInt(String(offset || '0'), 10) || 0);
    const result = await listAgentRequests({
      type: typeof type === 'string' && type ? type : undefined,
      status: typeof status === 'string' && status ? status : undefined,
      priority: typeof priority === 'string' && priority ? priority : undefined,
      moduleName: typeof moduleName === 'string' && moduleName ? moduleName : undefined,
      from: typeof from === 'string' && from ? from : undefined,
      to: typeof to === 'string' && to ? to : undefined,
      take,
      skip,
    });
    res.json(result);
  } catch (err) {
    console.error('Agent list error:', err);
    res.status(500).json({ error: 'Failed to list agent requests' });
  }
});

/** GET /api/agent/requests/:id */
router.get('/requests/:id', qmsAgentAccess, async (req, res) => {
  try {
    const row = await getAgentRequestById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const redacted = {
      ...row,
      attachments: (row.attachments || []).map(({ dataBase64, ...meta }) => ({
        ...meta,
        hasBinaryPayload: Boolean(dataBase64),
      })),
    };
    res.json({ request: redacted });
  } catch (err) {
    console.error('Agent get error:', err);
    res.status(500).json({ error: 'Failed to load agent request' });
  }
});

/** PATCH /api/agent/requests/:id — status transitions (audit logged). */
router.patch('/requests/:id', qmsAgentAccess, express.json(), async (req, res) => {
  try {
    const parsed = patchAgentRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() });
    }
    const { status, reason } = parsed.data;
    const updated = await updateAgentRequestStatus({
      id: req.params.id,
      userId: req.user.id,
      status,
      reason,
      req,
    });
    res.json({ request: updated });
  } catch (err) {
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: 'Not found' });
    console.error('Agent patch error:', err);
    res.status(500).json({ error: 'Failed to update agent request' });
  }
});

/** GET /api/agent/contracts — static contract pointers for agent tooling (JWT). */
router.get('/contracts', qmsAgentAccess, (_req, res) => {
  res.json({
    schemaVersion: 1,
    note: 'See repository docs/agent-mcp/ for JSON samples and Next.js port notes.',
    endpoints: {
      openRequests: { method: 'GET', path: '/api/agent/mcp/open-requests', auth: 'X-Agent-Mcp-Secret' },
      assistantChat: { method: 'POST', path: '/api/agent/assistant/chat', auth: 'Bearer JWT (System Admin or Quality Manager)' },
      createRequest: { method: 'POST', path: '/api/agent/requests', auth: 'Bearer JWT (System Admin or Quality Manager)' },
    },
  });
});

export default router;
