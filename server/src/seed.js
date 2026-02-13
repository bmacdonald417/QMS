import 'dotenv/config';
import bcrypt from 'bcrypt';
import { prisma } from './db.js';
import { getCanonicalRoleNames, getPermissionsForRole } from './rbac/roleCatalog.js';
import { getPermissionList } from './rbac/permissionCatalog.js';

const DEMO_PASSWORD = 'Password123!';
const SALT_ROUNDS = 10;

const DEMO_USERS = [
  { firstName: 'Admin', lastName: 'User', email: 'admin@mactech.com', roleName: 'System Admin' },
  { firstName: 'Quality', lastName: 'Manager', email: 'quality@mactech.com', roleName: 'Quality Manager' },
  { firstName: 'Department', lastName: 'Manager', email: 'manager@mactech.com', roleName: 'Manager' },
  { firstName: 'General', lastName: 'User', email: 'user@mactech.com', roleName: 'User' },
  { firstName: 'Alex', lastName: 'Admin', email: 'alex.admin@qms.demo', roleName: 'System Admin' },
  { firstName: 'Brenda', lastName: 'Quality', email: 'brenda.quality@qms.demo', roleName: 'Quality Manager' },
  { firstName: 'Charles', lastName: 'Manager', email: 'charles.manager@qms.demo', roleName: 'Manager' },
  { firstName: 'David', lastName: 'User', email: 'david.user@qms.demo', roleName: 'User' },
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
