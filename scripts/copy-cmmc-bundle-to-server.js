/**
 * Copy root docs/cmmc-extracted/ to server/docs/cmmc-extracted/ so Railway
 * (deploying from server/) ships the latest CMMC bundle. The bundle path
 * resolver in server/src/lib/cmmc/manifest.js prefers the in-server-cwd
 * docs/cmmc-extracted, so this duplicate must stay in sync.
 *
 * Run from project root after touching anything under docs/cmmc-extracted/
 * (new manifest entry, new markdown, etc.):
 *   node scripts/copy-cmmc-bundle-to-server.js
 *
 * Wired into npm run build so a normal local build will mirror it.
 *
 * Skips macOS .DS_Store files. Wipes the destination before copying so
 * removed files in the source don't linger on the deploy.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcDir = join(root, 'docs', 'cmmc-extracted');
const dstDir = join(root, 'server', 'docs', 'cmmc-extracted');

if (!existsSync(srcDir)) {
  console.error(`Source bundle not found: ${srcDir}`);
  process.exit(1);
}

// Wipe destination so deleted files don't linger.
if (existsSync(dstDir)) {
  rmSync(dstDir, { recursive: true, force: true });
}
mkdirSync(dstDir, { recursive: true });

// Recursively copy, skipping .DS_Store junk.
function copyTree(from, to) {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const fromPath = join(from, entry.name);
    const toPath = join(to, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(toPath, { recursive: true });
      copyTree(fromPath, toPath);
    } else {
      cpSync(fromPath, toPath);
    }
  }
}

copyTree(srcDir, dstDir);

// Quick summary so the build output shows what landed.
const fileCount = (() => {
  let n = 0;
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else n += 1;
    }
  }
  walk(dstDir);
  return n;
})();
const manifestPath = join(dstDir, 'qms-ingest-manifest.json');
let manifestSummary = '';
if (existsSync(manifestPath)) {
  try {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifestSummary = ` (manifest: ${Array.isArray(m.documents) ? m.documents.length : 0} entries)`;
  } catch {
    // ignore
  }
}
console.log(`Copied CMMC bundle to ${dstDir} — ${fileCount} files${manifestSummary}`);
