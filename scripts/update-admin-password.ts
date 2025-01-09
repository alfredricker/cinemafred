// scripts/update-admin-password.ts
import { hash } from 'bcryptjs';

const updateAdminPassword = async () => {
  // Get username and new password from command line arguments
  const username = process.argv[2];
  const newPassword = process.argv[3];

  if (!username || !newPassword) {
    console.error('Usage: npm run update-admin-password username newPassword');
    process.exit(1);
  }

  try {
    const hashedPassword = await hash(newPassword, 10);

    const { getDB } = await import('../src/lib/db');
    const db = getDB();

    // Verify admin exists
    const admin = await db
      .prepare('SELECT id FROM users WHERE username = ? AND is_admin = 1')
      .bind(username)
      .first();

    if (!admin) {
      console.error('Admin user not found');
      process.exit(1);
    }

    // Update admin password
    await db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(hashedPassword, admin.id)
      .run();

    console.log('Admin password updated successfully');
    process.exit(0);
  } catch (error) {
    console.error('Failed to update admin password:', error);
    process.exit(1);
  }
};

updateAdminPassword();