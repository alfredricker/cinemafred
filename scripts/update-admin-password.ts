// scripts/update-admin-password.ts
import { hash } from 'bcryptjs';
import prisma from '../src/lib/db';

const updatePassword = async () => {
  const username = process.argv[2];
  const newPassword = process.argv[3];

  if (!username || !newPassword) {
    console.error('Usage: npm run update-admin-password username newPassword');
    process.exit(1);
  }

  try {
    const hashedPassword = await hash(newPassword, 10);
    await prisma.user.update({
      where: { username },
      data: {
        password_hash: hashedPassword,
        mustResetPassword: false
      }
    });

    console.log('Admin password updated successfully');
    process.exit(0);
  } catch (error) {
    console.error('Failed to update admin password:', error);
    process.exit(1);
  }
};

updatePassword();