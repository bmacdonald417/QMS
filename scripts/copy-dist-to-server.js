/**
 * Copy root dist/ to server/dist/ so Railway (deploying from server/) serves the latest frontend.
 * Run after vite build (e.g. from root: node scripts/copy-dist-to-server.js).
 */
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcDir = join(root, 'dist');
const serverDistDir = join(root, 'server', 'dist');

const toCopy = ['index.html', 'build-id.txt', 'favicon.svg'];

mkdirSync(serverDistDir, { recursive: true });
const assetsDir = join(serverDistDir, 'assets');
mkdirSync(assetsDir, { recursive: true });
try {
  const existing = readdirSync(assetsDir, { withFileTypes: true });
  for (const e of existing) {
    rmSync(join(assetsDir, e.name), { recursive: true });
  }
} catch {
  // ignore
}
const srcAssets = readdirSync(join(srcDir, 'assets'), { withFileTypes: true });
for (const e of srcAssets) {
  cpSync(join(srcDir, 'assets', e.name), join(assetsDir, e.name), { recursive: true });
}
for (const name of toCopy) {
  cpSync(join(srcDir, name), join(serverDistDir, name));
}
console.log('Copied dist to server/dist');
