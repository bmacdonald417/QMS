import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROLES = [
  { name: 'System Administrator' },
  { name: 'Quality' },
  { name: 'Manager' },
  { name: 'User' },
  { name: 'Read-Only' },
];

const DEMO_PASSWORD = 'Password123!';
const SALT_ROUNDS = 10;

const DEMO_USERS = [
  { firstName: 'Alex', lastName: 'Admin', email: 'alex.admin@qms.demo', roleName: 'System Administrator' },
  { firstName: 'Brenda', lastName: 'Quality', email: 'brenda.quality@qms.demo', roleName: 'Quality' },
  { firstName: 'Charles', lastName: 'Manager', email: 'charles.manager@qms.demo', roleName: 'Manager' },
  { firstName: 'David', lastName: 'User', email: 'david.user@qms.demo', roleName: 'User' },
  { firstName: 'Evelyn', lastName: 'Readonly', email: 'evelyn.readonly@qms.demo', roleName: 'Read-Only' },
];

async function main() {
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);

  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { name: r.name },
      create: r,
      update: {},
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

  console.log('Seeded 5 roles and 5 demo users. Password for all: ' + DEMO_PASSWORD);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
