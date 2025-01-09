// scripts/migrate.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

const DB_NAME = 'your-movie-db'; // Change this to your database name

async function getMigrationFiles() {
  const migrationsDir = path.join(process.cwd(), 'migrations');
  const files = await fs.readdir(migrationsDir);
  return files
    .filter(f => f.endsWith('.sql'))
    .sort(); // This ensures migrations run in order
}

async function runMigration(filename: string) {
  const filePath = path.join(process.cwd(), 'migrations', filename);
  console.log(`Running migration: ${filename}`);
  
  try {
    await execAsync(`wrangler d1 execute ${DB_NAME} --file=${filePath}`);
    console.log(`Successfully applied migration: ${filename}`);
  } catch (error) {
    console.error(`Error applying migration ${filename}:`, error);
    throw error;
  }
}

async function migrate() {
  const files = await getMigrationFiles();
  
  for (const file of files) {
    try {
      await runMigration(file);
    } catch (error) {
      console.error('Migration failed. Stopping.');
      process.exit(1);
    }
  }
  
  console.log('All migrations completed successfully!');
}

// Run migrations
migrate().catch(console.error);