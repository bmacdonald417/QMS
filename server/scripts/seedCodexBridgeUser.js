#!/usr/bin/env node
/**
 * Seed the Codex bridge bot user.
 *
 * Idempotent on email. The bot is the authoring identity for inbound external
 * SSP submissions (POST /api/external-submissions/ssp). It carries the `User`
 * canonical role, which has document:create + document:view but NOT
 * document:approve or document:release — those remain the responsibility of
 * a human walking the Document through QMS's normal SoD chain.
 *
 * Run once per environment after the Phase 2 schema migration lands:
 *   railway run node scripts/seedCodexBridgeUser.js
 *
 * Output: prints the resulting user uuid. Set as CODEX_BRIDGE_USER_ID env var
 * if you want the route handler to skip the email lookup; otherwise the
 * handler resolves by email at runtime (cheap, single-row indexed query).
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

if (process.env.DATABASE_PUBLIC_URL && !process.env.DATABASE_URL?.includes('railway.internal')) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
}

import { prisma } from '../src/db.js';
import { getMacTechOrgId } from '../src/lib/orgScope.js';

const BOT_EMAIL = 'codex-bridge@mactechsolutionsllc.com';
const BOT_FIRST_NAME = 'Trust Codex';
const BOT_LAST_NAME = '(automated)';
const BOT_ROLE_NAME = 'User';
const BOT_JOB_TITLE = 'Automated System Bridge';

async function main() {
  const orgId = getMacTechOrgId();

  // Resolve the canonical User role (created by seed.js on first deploy).
  const role = await prisma.role.findUnique({ where: { name: BOT_ROLE_NAME } });
  if (!role) {
    throw new Error(
      `Role "${BOT_ROLE_NAME}" not found. Run seed.js first so the canonical roles are present.`,
    );
  }

  const user = await prisma.user.upsert({
    where: { email: BOT_EMAIL },
    create: {
      email: BOT_EMAIL,
      firstName: BOT_FIRST_NAME,
      lastName: BOT_LAST_NAME,
      jobTitle: BOT_JOB_TITLE,
      roleId: role.id,
      status: 'ACTIVE',
      mfaEnabled: false,
      // Bot has no password, no Clerk identity. Only callable through the
      // bridge route which authenticates via the shared HMAC, not as the bot.
    },
    update: {
      firstName: BOT_FIRST_NAME,
      lastName: BOT_LAST_NAME,
      jobTitle: BOT_JOB_TITLE,
      roleId: role.id,
      status: 'ACTIVE',
    },
  });

  // Ensure the bot has a membership in the canonical org so cross-org checks pass.
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
    create: { organizationId: orgId, userId: user.id },
    update: {},
  });

  console.log(`Bot user upserted:`);
  console.log(`  id:    ${user.id}`);
  console.log(`  email: ${user.email}`);
  console.log(`  role:  ${BOT_ROLE_NAME}`);
  console.log('');
  console.log('Optional: set CODEX_BRIDGE_USER_ID env var to skip the email lookup at request time:');
  console.log(`  CODEX_BRIDGE_USER_ID=${user.id}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
