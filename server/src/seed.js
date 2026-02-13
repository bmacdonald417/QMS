import 'dotenv/config';
import bcrypt from 'bcrypt';
import { prisma } from './db.js';

const ROLES = [
  {
    name: 'System Admin',
    permissions: [
      'users:read', 'users:create', 'users:update', 'users:assign_roles:any', 'users:delete', 'users:disable',
      'capa:view', 'capa:create', 'capa:update', 'capa:assign_tasks', 'capa:approve_plan', 'capa:close', 'capa:esign', 'capa:export',
      'change:view', 'change:create', 'change:update', 'change:assign_tasks', 'change:approve', 'change:close', 'change:esign',
      'file:upload', 'file:download', 'file:delete', 'document:view',
      'auditlog:view', 'system:securitypolicy:update', 'system:reference:update',
    ],
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
      'users:assign_roles:any',
      'users:delete',
      'users:disable',
      'auditlog:view',
      'system:securitypolicy:update',
      'system:reference:update',
      'capa:view', 'capa:create', 'capa:update', 'capa:assign_tasks', 'capa:approve_plan', 'capa:close', 'capa:esign', 'capa:export',
      'change:view', 'change:create', 'change:update', 'change:assign_tasks', 'change:approve', 'change:close', 'change:esign',
      'file:upload', 'file:download', 'file:delete', 'document:view',
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
      'users:create',
      'users:update:compliance',
      'users:assign_roles:basic',
      'users:disable',
      'auditlog:view',
      'system:reference:update',
      'capa:view', 'capa:create', 'capa:update', 'capa:assign_tasks', 'capa:approve_plan', 'capa:close', 'capa:esign', 'capa:export',
      'change:view', 'change:create', 'change:update', 'change:assign_tasks', 'change:approve', 'change:close', 'change:esign',
      'file:upload', 'file:download', 'file:delete', 'document:view',
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
      'users:read',
      'users:create',
      'users:update:basic',
      'users:assign_roles:basic',
      'users:disable',
      'capa:view', 'capa:update', 'capa:assign_tasks',
      'change:view', 'change:update', 'change:assign_tasks',
      'file:upload', 'file:download', 'document:view',
    ],
  },
  {
    name: 'User',
    permissions: [
      'document.create',
      'document.review',
      'document.revise.major',
      'document.revise.minor',
      'capa:view',
      'change:view',
      'file:download',
      'document:view',
    ],
  },
];

const PERMISSION_CODES = [
  { code: 'users:read', description: 'View users list and details' },
  { code: 'users:create', description: 'Create and invite users' },
  { code: 'users:update', description: 'Edit any user fields and roles (full)' },
  { code: 'users:update:basic', description: 'Edit basic profile (name, dept, site, status, MFA)' },
  { code: 'users:update:compliance', description: 'Edit compliance-related fields (status, MFA, dept, site)' },
  { code: 'users:assign_roles:basic', description: 'Assign basic roles (User only for Quality; User for Manager)' },
  { code: 'users:assign_roles:any', description: 'Assign any role including privileged' },
  { code: 'users:delete', description: 'Delete users (System Admin only)' },
  { code: 'users:disable', description: 'Deactivate and lock users' },
  { code: 'auditlog:view', description: 'View and export audit log' },
  { code: 'system:securitypolicy:update', description: 'Change security and retention policies' },
  { code: 'system:reference:update', description: 'Manage departments, sites, job titles' },
  { code: 'capa:view', description: 'View CAPA records' },
  { code: 'capa:create', description: 'Create CAPA' },
  { code: 'capa:update', description: 'Update CAPA fields' },
  { code: 'capa:assign_tasks', description: 'Assign and manage CAPA tasks' },
  { code: 'capa:approve_plan', description: 'Approve CAPA plan' },
  { code: 'capa:close', description: 'Close CAPA' },
  { code: 'capa:esign', description: 'Apply e-signature on CAPA' },
  { code: 'capa:export', description: 'Export CAPA data' },
  { code: 'file:upload', description: 'Upload files' },
  { code: 'file:download', description: 'Download files' },
  { code: 'file:delete', description: 'Soft delete files' },
  { code: 'document:view', description: 'View documents and document attachments' },
  { code: 'change:view', description: 'View change control records' },
  { code: 'change:create', description: 'Create change control' },
  { code: 'change:update', description: 'Update change control' },
  { code: 'change:assign_tasks', description: 'Assign and manage change control tasks' },
  { code: 'change:approve', description: 'Approve change control (formal approval/signature)' },
  { code: 'change:close', description: 'Close change control' },
  { code: 'change:esign', description: 'Apply e-signature on change control' },
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
