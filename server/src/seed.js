import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROLES = [
  {
    name: 'Admin',
    permissions: [
      'document.create',
      'document.review',
      'document.approve',
      'document.release',
      'document.revise.major',
      'document.revise.minor',
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

const DEMO_PASSWORD = 'Password123!';
const SALT_ROUNDS = 10;

const DEMO_USERS = [
  { firstName: 'Admin', lastName: 'User', email: 'admin@mactech.com', roleName: 'Admin' },
  { firstName: 'Quality', lastName: 'Manager', email: 'quality@mactech.com', roleName: 'Quality Manager' },
  { firstName: 'Department', lastName: 'Manager', email: 'manager@mactech.com', roleName: 'Manager' },
  { firstName: 'General', lastName: 'User', email: 'user@mactech.com', roleName: 'User' },

  // Backward-compatible demo users used in previous setup/docs.
  { firstName: 'Alex', lastName: 'Admin', email: 'alex.admin@qms.demo', roleName: 'Admin' },
  { firstName: 'Brenda', lastName: 'Quality', email: 'brenda.quality@qms.demo', roleName: 'Quality Manager' },
  { firstName: 'Charles', lastName: 'Manager', email: 'charles.manager@qms.demo', roleName: 'Manager' },
  { firstName: 'David', lastName: 'User', email: 'david.user@qms.demo', roleName: 'User' },
];

async function main() {
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);

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

  console.log(
    `Seeded ${ROLES.length} roles and ${DEMO_USERS.length} demo users. Password for all: ${DEMO_PASSWORD}`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
