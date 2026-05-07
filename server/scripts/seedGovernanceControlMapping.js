/**
 * Upserts governance_control_mapping from scripts/governance-control-mapping.json
 * Usage: cd server && node scripts/seedGovernanceControlMapping.js
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

async function main() {
  const jsonPath = join(__dirname, '../../scripts/governance-control-mapping.json');
  const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
  let n = 0;
  for (const [documentNumber, controlIds] of Object.entries(raw)) {
    if (!Array.isArray(controlIds)) continue;
    await prisma.governanceControlMapping.upsert({
      where: { documentNumber },
      create: { documentNumber, controlIds },
      update: { controlIds },
    });
    n++;
  }
  console.log(`Upserted ${n} governance_control_mapping rows from ${jsonPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
