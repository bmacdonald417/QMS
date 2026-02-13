import 'dotenv/config';
import bcrypt from 'bcrypt';
import { prisma } from './db.js';

const ROLES = [
  {
    name: 'System Admin',
    permissions: [],
  },
  {
    name: 'Admin',
    permissions: [
      'document.create',
      'document.review',
      'document.approve',
      'document.release',
      'document.revise.major',
      'document.revise.minor',
      'users:read',
      'users:create',
      'users:update',
      'users:disable',
      'auditlog:view',
      'system:securitypolicy:update',
      'system:reference:update',
    ],
  },
  {
    name: 'Quality Manager',
    permissions: [
      'document.create',
      'document.review',
      'document.approve',
      'document.release',
      'document.revise.major',
      'document.revise.minor',
      'users:read',
      'users:update',
      'auditlog:view',
      'system:reference:update',
    ],
  },
  {
    name: 'Manager',
    permissions: [
      'document.create',
      'document.review',
      'document.approve',
      'document.revise.major',
      'document.revise.minor',
    ],
  },
  {
    name: 'User',
    permissions: [
      'document.create',
      'document.review',
      'document.revise.major',
      'document.revise.minor',
    ],
  },
];

const PERMISSION_CODES = [
  { code: 'users:read', description: 'View users list and details' },
  { code: 'users:create', description: 'Create and invite users' },
  { code: 'users:update', description: 'Edit users, reactivate, unlock' },
  { code: 'users:disable', description: 'Deactivate and lock users' },
  { code: 'auditlog:view', description: 'View and export audit log' },
  { code: 'system:securitypolicy:update', description: 'Change security and retention policies' },
  { code: 'system:reference:update', description: 'Manage departments, sites, job titles' },
];

const DEMO_PASSWORD = 'Password123!';
const SALT_ROUNDS = 10;

const DEMO_USERS = [
  { firstName: 'Admin', lastName: 'User', email: 'admin@mactech.com', roleName: 'System Admin' },
  { firstName: 'Quality', lastName: 'Manager', email: 'quality@mactech.com', roleName: 'Quality Manager' },
  { firstName: 'Department', lastName: 'Manager', email: 'manager@mactech.com', roleName: 'Manager' },
  { firstName: 'General', lastName: 'User', email: 'user@mactech.com', roleName: 'User' },

  // Backward-compatible demo users used in previous setup/docs.
  { firstName: 'Alex', lastName: 'Admin', email: 'alex.admin@qms.demo', roleName: 'System Admin' },
  { firstName: 'Brenda', lastName: 'Quality', email: 'brenda.quality@qms.demo', roleName: 'Quality Manager' },
  { firstName: 'Charles', lastName: 'Manager', email: 'charles.manager@qms.demo', roleName: 'Manager' },
  { firstName: 'David', lastName: 'User', email: 'david.user@qms.demo', roleName: 'User' },
];

async function main() {
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);

  for (const p of PERMISSION_CODES) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: p,
      update: { description: p.description },
    });
  }

  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { name: r.name },
      create: r,
      update: { permissions: r.permissions },
    });
  }

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

  console.log(
    `Seeded ${ROLES.length} roles, ${PERMISSION_CODES.length} permissions, and ${DEMO_USERS.length} demo users. Password for all: ${DEMO_PASSWORD}`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
