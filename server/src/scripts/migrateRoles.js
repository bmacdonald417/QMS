/**
 * RBAC role migration: ensure canonical roles exist, migrate users off deprecated roles,
 * delete deprecated roles, normalize role_permissions. Idempotent; safe to run multiple times.
 *
 * Run: node server/src/scripts/migrateRoles.js (from repo root) or via node with proper path to load dotenv.
 */
import 'dotenv/config';
import { prisma } from '../db.js';
import {
  getCanonicalRoleNames,
  getPermissionsForRole,
  resolveToCanonical,
  isCanonicalRoleName,
} from '../rbac/roleCatalog.js';
import { getPermissionList, isValidCode } from '../rbac/permissionCatalog.js';

const MIGRATION_REASON = 'RBAC role consolidation';

async function ensureCanonicalRolesExist() {
  const codeToId = new Map();
  for (const p of getPermissionList()) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      create: p,
      update: { description: p.description },
    });
    codeToId.set(p.code, perm.id);
  }

  const roleByName = new Map();
  for (const name of getCanonicalRoleNames()) {
    const permissions = getPermissionsForRole(name);
    const role = await prisma.role.upsert({
      where: { name },
      create: { name, permissions },
      update: { permissions },
    });
    roleByName.set(name, role);

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const code of permissions) {
      const permId = codeToId.get(code);
      if (permId) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permId } },
          create: { roleId: role.id, permissionId: permId },
          update: {},
        });
      }
    }
  }
  return { codeToId, roleByName };
}

async function getMigrationActorId() {
  const user = await prisma.user.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
  return user?.id ?? null;
}

async function run() {
  console.log('--- RBAC migration: before ---');
  const rolesBefore = await prisma.role.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { users: true } } },
  });
  rolesBefore.forEach((r) => {
    console.log(`  Role: "${r.name}" (id=${r.id}) users=${r._count.users}`);
  });

  const { roleByName } = await ensureCanonicalRolesExist();
  const actorId = await getMigrationActorId();

  const deprecatedRoles = await prisma.role.findMany({
    where: { name: { notIn: getCanonicalRoleNames() } },
    include: { users: true },
  });

  const migrationCounts = {};
  for (const role of deprecatedRoles) {
    const canonicalName = resolveToCanonical(role.name);
    if (!isCanonicalRoleName(role.name)) {
      console.log(`Migrating deprecated role "${role.name}" -> "${canonicalName}" (${role.users.length} users)`);
    }
    const canonical = roleByName.get(canonicalName);
    if (!canonical) {
      console.warn(`  Skip: canonical role "${canonicalName}" not found`);
      continue;
    }
    migrationCounts[`${role.name} -> ${canonicalName}`] = 0;

    for (const user of role.users) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { roleId: canonical.id },
        });
        if (actorId) {
          await tx.auditLog.create({
            data: {
              userId: actorId,
              action: 'ROLE_MIGRATION',
              entityType: 'USER',
              entityId: user.id,
              beforeValue: { roleId: role.id, roleName: role.name },
              afterValue: { roleId: canonical.id, roleName: canonicalName },
              reason: MIGRATION_REASON,
            },
          });
        }
      });
      migrationCounts[`${role.name} -> ${canonicalName}`]++;
    }

    const remaining = await prisma.user.count({ where: { roleId: role.id } });
    if (remaining === 0) {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.role.delete({ where: { id: role.id } });
      console.log(`  Deleted deprecated role "${role.name}" (id=${role.id})`);
    }
  }

  for (const name of getCanonicalRoleNames()) {
    const role = await prisma.role.findUnique({ where: { name } });
    if (!role) continue;
    const desired = getPermissionsForRole(name).filter(isValidCode);
    const existing = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      include: { permission: true },
    });
    const existingCodes = new Set(existing.map((rp) => rp.permission.code));
    const toAdd = desired.filter((c) => !existingCodes.has(c));
    const permissions = await prisma.permission.findMany({ where: { code: { in: toAdd } } });
    for (const p of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
        create: { roleId: role.id, permissionId: p.id },
        update: {},
      });
    }
    const toRemove = existing.filter((rp) => !desired.includes(rp.permission.code));
    for (const rp of toRemove) {
      await prisma.rolePermission.delete({
        where: { roleId_permissionId: { roleId: role.id, permissionId: rp.permissionId } },
      });
    }
    await prisma.role.update({
      where: { id: role.id },
      data: { permissions: desired },
    });
  }

  console.log('--- RBAC migration: after ---');
  const rolesAfter = await prisma.role.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { users: true } } },
  });
  rolesAfter.forEach((r) => {
    console.log(`  Role: "${r.name}" (id=${r.id}) users=${r._count.users}`);
  });
  console.log('--- User migration counts ---');
  Object.entries(migrationCounts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  return { rolesBefore, rolesAfter, migrationCounts };
}

run()
  .then((out) => {
    console.log('Migration completed.');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
