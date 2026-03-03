import 'dotenv/config';
import bcrypt from 'bcrypt';
import { prisma } from './db.js';
import { getCanonicalRoleNames, getPermissionsForRole } from './rbac/roleCatalog.js';
import { getPermissionList } from './rbac/permissionCatalog.js';

const DEMO_PASSWORD = 'Password123!';
const SALT_ROUNDS = 10;

const DEMO_USERS = [
  { firstName: 'Brian', lastName: 'MacDonald', email: 'brian.macdonald@mactech.com', roleName: 'System Admin' },
  { firstName: 'Jon', lastName: 'Milso', email: 'jon.milso@mactech.com', roleName: 'Manager' },
  { firstName: 'James', lastName: 'Adams', email: 'james.adams@mactech.com', roleName: 'Quality Manager' },
  { firstName: 'Patrick', lastName: 'Caruso', email: 'patrick.caruso@mactech.com', roleName: 'System Admin' },
];

const OLD_DEMO_EMAILS = [
  'admin@mactech.com',
  'quality@mactech.com',
  'manager@mactech.com',
  'user@mactech.com',
  'alex.admin@qms.demo',
  'brenda.quality@qms.demo',
  'charles.manager@qms.demo',
  'david.user@qms.demo',
];

async function main() {
  for (const p of getPermissionList()) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: p,
      update: { description: p.description },
    });
  }

  const codeToId = new Map(
    (await prisma.permission.findMany({ select: { code: true, id: true } })).map((perm) => [perm.code, perm.id])
  );

  for (const name of getCanonicalRoleNames()) {
    const permissions = getPermissionsForRole(name);
    const role = await prisma.role.upsert({
      where: { name },
      create: { name, permissions },
      update: { permissions },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const code of permissions) {
      const permissionId = codeToId.get(code);
      if (permissionId) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId } },
          create: { roleId: role.id, permissionId },
          update: {},
        });
      }
    }
  }

  const oldUsers = await prisma.user.findMany({
    where: { email: { in: OLD_DEMO_EMAILS } },
    select: { id: true },
  });
  const oldIds = oldUsers.map((u) => u.id);
  if (oldIds.length > 0) {
    await prisma.notification.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.user.deleteMany({ where: { id: { in: oldIds } } });
  }

  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
  for (const u of DEMO_USERS) {
    const role = await prisma.role.findUnique({ where: { name: u.roleName } });
    if (!role) throw new Error(`Role not found: ${u.roleName}`);
    await prisma.user.upsert({
      where: { email: u.email },
      create: {
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        password: hashedPassword,
        roleId: role.id,
      },
      update: { password: hashedPassword, roleId: role.id },
    });
  }

  if (!(await prisma.securityPolicy.findFirst())) {
    await prisma.securityPolicy.create({ data: {} });
  }
  if (!(await prisma.retentionPolicy.findFirst())) {
    await prisma.retentionPolicy.create({ data: {} });
  }
  if (!(await prisma.eSignConfig.findFirst())) {
    await prisma.eSignConfig.create({ data: {} });
  }

  const roleCount = getCanonicalRoleNames().length;
  const permCount = getPermissionList().length;
  console.log(
    `Seeded ${roleCount} canonical roles, ${permCount} permissions, and ${DEMO_USERS.length} demo users. Password for all: ${DEMO_PASSWORD}`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
