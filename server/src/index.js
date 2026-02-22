import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import authRoutes, { authMiddleware } from './auth.js';
import documentRoutes, { DOCUMENT_TYPES } from './documents.js';
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
app.get('/api/documents/types', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache');
  res.json({ types: DOCUMENT_TYPES });
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
// Try multiple possible paths for dist folder
const possibleDistPaths = [
  join(__dirname, '../../dist'), // From server/src/ to project root
  join(process.cwd(), '../dist'), // From server/ to project root
  join(process.cwd(), 'dist'), // If dist is in server/
  '/app/dist', // Railway absolute path
  '/app/../dist', // Railway from server/ to root
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
  // Serve static assets (no cache for index.html so users get latest build)
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      }
    },
  }));
  // Serve index.html for all non-API routes (SPA routing)
  // This must be last, after all API routes
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api')) {
      return next();
    }
    const indexPath = join(distPath, 'index.html');
    if (existsSync(indexPath)) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
} else {
  console.warn('Dist folder not found. Tried paths:', possibleDistPaths);
  console.warn('Current working directory:', process.cwd());
  console.warn('__dirname:', __dirname);
}

startPeriodicReviewScheduler();

app.listen(PORT, () => {
  console.log(`QMS API listening on http://localhost:${PORT}`);
  if (existsSync(distPath)) {
    console.log(`Serving frontend from ${distPath}`);
  }
});
