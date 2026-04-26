/**
 * Copy root dist/ to server/dist/ so Railway (deploying from server/) serves the latest frontend.
 * Run after vite build (e.g. from root: node scripts/copy-dist-to-server.js).
 *
 * Mirrors the entire dist/ tree — top-level files (index.html, favicon.svg,
 * mactech.png, anything else added to public/) plus the hashed assets/ dir.
 */
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcDir = join(root, 'dist');
const serverDistDir = join(root, 'server', 'dist');

mkdirSync(serverDistDir, { recursive: true });

// Wipe assets/ so stale hashed bundles don't pile up.
const assetsDir = join(serverDistDir, 'assets');
mkdirSync(assetsDir, { recursive: true });
try {
  for (const e of readdirSync(assetsDir, { withFileTypes: true })) {
    rmSync(join(assetsDir, e.name), { recursive: true });
  }
} catch {
  // ignore
}

// Copy everything in dist/ to server/dist/, preserving structure.
for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
  const from = join(srcDir, entry.name);
  const to = join(serverDistDir, entry.name);
  if (entry.isDirectory()) {
    cpSync(from, to, { recursive: true });
  } else {
    cpSync(from, to);
  }
}

console.log('Copied dist to server/dist (' + readdirSync(srcDir).length + ' top-level entries)');
