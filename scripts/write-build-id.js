/**
 * Writes a unique build id to dist/build-id.txt so the server can serve it
 * and the client can detect new deploys and force reload.
 * Run after vite build (e.g. from root: node scripts/write-build-id.js).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'dist');

let gitHash = 'nogit';
try {
  gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: root }).trim();
} catch {
  // not a git repo or git unavailable
}

const buildId = `${Date.now()}-${gitHash}`;
mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, 'build-id.txt'), buildId, 'utf8');
console.log('Wrote build-id.txt:', buildId);
