// Seed the `mactech-codex` IntegrationClient row + bcrypt-hashed secret
// for the codex CMMC contract. Idempotent: re-running rotates the secret
// (deactivates prior, inserts new) and updates scopes.
//
// Run via:
//   railway run --service QMS -- bash -c 'DATABASE_URL=$DATABASE_PUBLIC_URL \
//     node scripts/seedMactechCodexClient.js'
//
// Reads MACTECH_CODEX_CLIENT_SECRET from env if set; otherwise generates a
// 32-byte url-safe base64 secret. The raw secret is printed to stdout ONCE
// — capture it from the operator's terminal and stash it on the codex
// Railway service as QMS_INTEGRATION_CLIENT_SECRET. It cannot be recovered
// after this run.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

const CLIENT_ID = 'mactech-codex';
const CLIENT_NAME = 'MacTech Codex (CMMC compliance plane)';
const SCOPES = ['cmmc:read'];
const BCRYPT_ROUNDS = 12;

function generateSecret() {
  return randomBytes(32).toString('base64url');
}

async function main() {
  const prisma = new PrismaClient();
  const rawSecret = process.env.MACTECH_CODEX_CLIENT_SECRET || generateSecret();
  const hash = await bcrypt.hash(rawSecret, BCRYPT_ROUNDS);

  const result = await prisma.$transaction(async (tx) => {
    const client = await tx.integrationClient.upsert({
      where: { clientId: CLIENT_ID },
      update: {
        name: CLIENT_NAME,
        scopes: SCOPES,
        isActive: true,
        lastRotatedAt: new Date(),
      },
      create: {
        clientId: CLIENT_ID,
        name: CLIENT_NAME,
        scopes: SCOPES,
        isActive: true,
      },
    });

    // Rotate: deactivate any previous secrets so this run's secret is the
    // only valid one. Token issuance loops through active secrets, so
    // deactivating old ones is the cleanest cut.
    const deactivated = await tx.integrationSecret.updateMany({
      where: { clientId: CLIENT_ID, isActive: true },
      data: { isActive: false },
    });

    const inserted = await tx.integrationSecret.create({
      data: {
        clientId: CLIENT_ID,
        secretHash: hash,
        isActive: true,
      },
    });

    return { client, deactivated: deactivated.count, inserted };
  });

  console.log('---');
  console.log('IntegrationClient seeded:');
  console.log('  clientId    :', result.client.clientId);
  console.log('  name        :', result.client.name);
  console.log('  scopes      :', result.client.scopes.join(', '));
  console.log('  active      :', result.client.isActive);
  console.log('  prev secrets deactivated:', result.deactivated);
  console.log('  new secret id:', result.inserted.id);
  console.log('');
  console.log('Raw client secret (capture now — not recoverable):');
  console.log(rawSecret);
  console.log('---');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
