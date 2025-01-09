// scripts/create-admin.ts
import { hash } from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const createAdmin = async () => {
  // Get username and password from command line arguments
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.error('Usage: npm run create-admin username password');
    process.exit(1);
  }

  try {
    const hashedPassword = await hash(password, 10);
    const userId = uuidv4();

    const { getDB } = await import('../src/lib/db');
    const db = getDB();

    // Check if admin already exists
    const existingAdmin = await db
      .prepare('SELECT id FROM users WHERE username = ? OR is_admin = 1')
      .bind(username)
      .first();

    if (existingAdmin) {
      console.error('An admin user already exists or username is taken');
      process.exit(1);
    }

    // Create admin user
    await db
      .prepare(`
        INSERT INTO users (
          id, 
          username, 
          email, 
          password_hash, 
          is_active, 
          is_admin, 
          must_reset_password
        ) 
        VALUES (?, ?, ?, ?, true, true, false)
      `)
      .bind(
        userId,
        username,
        `${username}@admin.local`,
        hashedPassword
      )
      .run();

    console.log('Admin user created successfully');
    process.exit(0);
  } catch (error) {
    console.error('Failed to create admin user:', error);
    process.exit(1);
  }
};

createAdmin();