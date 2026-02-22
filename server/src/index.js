import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import authRoutes, { authMiddleware } from './auth.js';
import documentRoutes from './documents.js';
import notificationRoutes from './notifications.js';
import taskRoutes from './tasks.js';
import userRoutes from './users.js';
import trainingRoutes from './training.js';
import periodicReviewsRoutes from './periodicReviews.js';
import dashboardRoutes from './dashboard.js';
import systemRoutes from './system/index.js';
import capaRoutes from './capas.js';
import changeControlRoutes from './changeControls.js';
import fileRoutes from './files.js';
import formRecordRoutes from './formRecords.js';
import governanceRoutes from './governanceRoutes.js';
import cmmcRoutes from './cmmc.js';
import { requestIdMiddleware } from './audit.js';
import { startPeriodicReviewScheduler } from './periodicReviewScheduler.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(requestIdMiddleware);

app.use('/api/auth', authRoutes);
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});
app.use('/api/documents', authMiddleware, documentRoutes);
app.use('/api/notifications', authMiddleware, notificationRoutes);
app.use('/api/tasks', authMiddleware, taskRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/training', authMiddleware, trainingRoutes);
app.use('/api/periodic-reviews', authMiddleware, periodicReviewsRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/capas', authMiddleware, capaRoutes);
app.use('/api/change-controls', authMiddleware, changeControlRoutes);
app.use('/api/files', authMiddleware, fileRoutes);
app.use('/api/form-records', formRecordRoutes);
app.use('/api/governance', governanceRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/cmmc', authMiddleware, cmmcRoutes);

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Serve static frontend files if they exist (for Railway deployment)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distPath = join(__dirname, '../../dist');
if (existsSync(distPath)) {
  // Serve static assets
  app.use(express.static(distPath));
  // Serve index.html for all non-API routes (SPA routing)
  // This must be last, after all API routes
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(join(distPath, 'index.html'));
  });
}

startPeriodicReviewScheduler();

app.listen(PORT, () => {
  console.log(`QMS API listening on http://localhost:${PORT}`);
  if (existsSync(distPath)) {
    console.log(`Serving frontend from ${distPath}`);
  }
});
