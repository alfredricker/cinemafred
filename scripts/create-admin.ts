// scripts/create-admin.ts
import bcrypt from 'bcryptjs';
import prisma from '../src/lib/db';

const createAdmin = async () => {
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.error('Usage: npm run create-admin username password');
    process.exit(1);
  }

  try {
    const existingAdmin = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { is_admin: true }
        ]
      }
    });

    if (existingAdmin) {
      console.error('An admin user already exists or username is taken');
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        username,
        email: `${username}@admin.local`,
        password_hash: hashedPassword,
        is_active: true,
        is_admin: true,
        must_reset_password: false
      }
    });

    console.log('Admin user created successfully');
    process.exit(0);
  } catch (error) {
    console.error('Failed to create admin user:', error);
    process.exit(1);
  }
};

createAdmin();