import 'dotenv/config';
import express from 'express';
import { isIntegrationAuthEnabled } from './integrations/auth.js';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import authRoutes, { authMiddleware, trainingAuthMiddleware } from './auth.js';
import documentRoutes, { DOCUMENT_TYPES } from './documents.js';
import notificationRoutes from './notifications.js';
import taskRoutes from './tasks.js';
import userRoutes from './users.js';
import trainingRoutes from './training.js';
import periodicReviewsRoutes from './periodicReviews.js';
import dashboardRoutes from './dashboard.js';
import systemRoutes from './system/index.js';
import capaRoutes from './capas.js';
import auditRoutes from './audits.js';
import changeControlRoutes from './changeControls.js';
import fileRoutes from './files.js';
import formRecordRoutes from './formRecords.js';
import governanceRoutes from './governanceRoutes.js';
import governancePackageRoutes from './governancePackageRoutes.js';
import cmmcRoutes from './cmmc.js';
import cmmcControlsRoutes from './cmmcControls.js';
import cmmcControlTagsRoutes from './cmmcControlTags.js';
import { requestIdMiddleware } from './audit.js';
import { trainingApiLimiter, integrationTokenLimiter } from './systemMiddleware.js';
import integrationTokenRoutes from './integrations/tokenRoute.js';
import { startPeriodicReviewScheduler } from './periodicReviewScheduler.js';
import agentRoutes from './agent/agentRoutes.js';
import agentMcpRoutes from './agent/agentMcpRoutes.js';
import orgQmsAgentRoutes from './orgQmsAgentRoutes.js';
import { getMacTechOrgId } from './lib/orgScope.js';

// Fail loudly at boot if the canonical single-tenant org id isn't set. The helper
// also guards every call site, but startup-throw means we never serve a single
// request in a misconfigured state.
getMacTechOrgId();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Trust Railway's reverse proxy hop. Without this, express-rate-limit can't
// see the real client IP (the connection IP is always Railway's load balancer)
// so all traffic buckets into one global pool, defeating per-IP limits.
// `1` = trust one proxy. Railway terminates TLS at the edge and sets
// X-Forwarded-For to the real client. See ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true }));
// Increase JSON body limit for large document content (default 100kb causes 413)
app.use(express.json({ limit: '15mb' }));
app.use(requestIdMiddleware);

app.use('/api/auth', authRoutes);
app.use('/api/integrations', integrationTokenLimiter, integrationTokenRoutes);
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});
app.get('/api/documents/types', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache');
  res.json({ types: DOCUMENT_TYPES });
});
app.use('/api/documents', authMiddleware, documentRoutes);
app.use('/api/notifications', authMiddleware, notificationRoutes);
app.use('/api/tasks', authMiddleware, taskRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/training', trainingApiLimiter, trainingAuthMiddleware, trainingRoutes);
app.use('/api/periodic-reviews', authMiddleware, periodicReviewsRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/capas', authMiddleware, capaRoutes);
app.use('/api/audits', authMiddleware, auditRoutes);
app.use('/api/change-controls', authMiddleware, changeControlRoutes);
app.use('/api/files', authMiddleware, fileRoutes);
app.use('/api/form-records', formRecordRoutes);
app.use('/api/governance', governanceRoutes);
app.use('/api/governance-package', governancePackageRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/agent/mcp', agentMcpRoutes);
app.use('/api/agent', authMiddleware, agentRoutes);
app.use('/api/org', authMiddleware, orgQmsAgentRoutes);
app.use('/api/cmmc', authMiddleware, cmmcRoutes);
// Phase 6 admin tagging UI — populates the codex-contract junctions.
app.use('/api/cmmc-control-tags', authMiddleware, cmmcControlTagsRoutes);
// Codex CMMC contract — integration-token only (no user JWT). Mounted under /v1
// because the contract is versioned: the v2.1 field shape lives here, and any
// future shape rev would land at /v2 to keep the codex client switchable.
app.use('/api/v1/cmmc', cmmcControlsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Build version: used by frontend to detect new deploys and force reload (avoids stale cache)
app.get('/api/version', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  let buildId = 'dev';
  if (distPath) {
    try {
      const buildIdPath = join(distPath, 'build-id.txt');
      if (existsSync(buildIdPath)) {
        buildId = readFileSync(buildIdPath, 'utf8').trim() || buildId;
      }
    } catch {
      // ignore
    }
  }
  res.json({ buildId });
});

// Serve static frontend files if they exist (for Railway deployment)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Try multiple possible paths for dist folder
// Railway runs "cd server && npm start" so process.cwd()=server/; dist must be in server/dist
const possibleDistPaths = [
  join(process.cwd(), 'dist'), // server/dist - primary for Railway
  join(__dirname, '../../dist'), // From server/src/ to project root
  join(process.cwd(), '../dist'), // From server/ to project root
  '/app/dist',
  '/app/server/dist',
];

let distPath = null;
for (const path of possibleDistPaths) {
  if (existsSync(path)) {
    distPath = path;
    console.log(`Found dist folder at: ${distPath}`);
    break;
  }
}

if (distPath) {
  // Serve static assets (index: false so our handler injects document types into index.html)
  app.use(express.static(distPath, { index: false }));
  // Serve index.html for all non-API routes (SPA routing)
  // Inject document types into HTML so dropdown always has correct options (avoids JS cache issues)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    const indexPath = join(distPath, 'index.html');
    if (!existsSync(indexPath)) return next();
    try {
      let html = readFileSync(indexPath, 'utf8');
      const script = `<script>window.__DOCUMENT_TYPES__=${JSON.stringify(DOCUMENT_TYPES)};</script>`;
      html = html.replace('</head>', `${script}</head>`);
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.type('html').send(html);
    } catch (err) {
      console.error('Error serving index.html:', err);
      res.sendFile(indexPath);
    }
  });
} else {
  console.warn('Dist folder not found. Tried paths:', possibleDistPaths);
  console.warn('Current working directory:', process.cwd());
  console.warn('__dirname:', __dirname);
}

startPeriodicReviewScheduler();

if (!isIntegrationAuthEnabled()) {
  console.warn('[INTEGRATION] Integration token auth disabled: INTEGRATION_JWT_SECRET not set. Set it to enable /api/integrations/token and scoped integration access.');
}

app.listen(PORT, () => {
  console.log(`QMS API listening on http://localhost:${PORT}`);
  if (existsSync(distPath)) {
    console.log(`Serving frontend from ${distPath}`);
  }
});
