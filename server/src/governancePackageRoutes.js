/**
 * Determinate MacTech Vault Governance Package — read-only API.
 *
 * Surfaces the canonical (immutable) governance package version(s) so the
 * /system/governance-package UI page can render the roster every CMMC
 * vault carries. NO write endpoints — versions are published exclusively
 * via the CLI seed script (server/scripts/seedGovernancePackageVersion.js)
 * with break-glass --force semantics for over-writes.
 */
import express from 'express';
import { prisma } from './db.js';
import { authMiddleware } from './auth.js';

const router = express.Router();

router.use(authMiddleware);

/** GET /current — the active version's full envelope + metadata. */
router.get('/current', async (req, res) => {
  try {
    const row = await prisma.governancePackageVersion.findFirst({
      where: { isActive: true },
      orderBy: { publishedAt: 'desc' },
    });
    if (!row) return res.json({ version: null });
    res.json({ version: row });
  } catch (err) {
    console.error('governance-package /current error:', err);
    res.status(500).json({ error: 'Failed to load current package version' });
  }
});

/** GET /versions — chronological list of all published versions (metadata only). */
router.get('/versions', async (req, res) => {
  try {
    const rows = await prisma.governancePackageVersion.findMany({
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        versionLabel: true,
        publishedAt: true,
        publishedBy: true,
        contentHash: true,
        docCount: true,
        controlsTouched: true,
        isActive: true,
        notes: true,
      },
    });
    res.json({ versions: rows });
  } catch (err) {
    console.error('governance-package /versions error:', err);
    res.status(500).json({ error: 'Failed to load package versions' });
  }
});

/** GET /v/:label — full envelope for a specific version. */
router.get('/v/:label', async (req, res) => {
  try {
    const row = await prisma.governancePackageVersion.findUnique({
      where: { versionLabel: String(req.params.label) },
    });
    if (!row) return res.status(404).json({ error: 'version not found' });
    res.json({ version: row });
  } catch (err) {
    console.error('governance-package /v/:label error:', err);
    res.status(500).json({ error: 'Failed to load package version' });
  }
});

export default router;
