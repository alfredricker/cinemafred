// src/lib/db.ts
import { D1Database } from '@cloudflare/workers-types';
import { UserResponse } from '@/types/user';

declare global {
  var db: D1Database | undefined;
}

export function getDB(): D1Database {
  if (!global.db) {
    throw new Error('Database connection not initialized');
  }
  return global.db;
}

export async function getUserByUsername(username: string): Promise<UserResponse | null> {
  const db = getDB();
  const user = await db
    .prepare('SELECT id, email, username, is_admin, is_active, must_reset_password FROM users WHERE username = ?')
    .bind(username)
    .first();
  
  return user ? {
    id: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.is_admin,
    isActive: user.is_active,
    mustResetPassword: user.must_reset_password
  } : null;
}

export async function getUserById(id: string): Promise<UserResponse | null> {
  const db = getDB();
  const user = await db
    .prepare('SELECT id, email, username, is_admin, is_active, must_reset_password FROM users WHERE id = ?')
    .bind(id)
    .first();
  
  return user ? {
    id: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.is_admin,
    isActive: user.is_active,
    mustResetPassword: user.must_reset_password
  } : null;
}

export async function getUserPasswordHash(username: string): Promise<string | null> {
  const db = getDB();
  const user = await db
    .prepare('SELECT password_hash FROM users WHERE username = ?')
    .bind(username)
    .first();
  
  return user?.password_hash || null;
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<boolean> {
  const db = getDB();
  const result = await db
    .prepare('UPDATE users SET password_hash = ?, must_reset_password = false WHERE id = ?')
    .bind(passwordHash, userId)
    .run();
  
  return result.success;
}

export async function getAllUsers(): Promise<UserResponse[]> {
  const db = getDB();
  const users = await db
    .prepare('SELECT id, email, username, is_admin, is_active, must_reset_password FROM users')
    .all();
  
  return users.results.map((user:any) => ({
    id: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.is_admin,
    isActive: user.is_active,
    mustResetPassword: user.must_reset_password
  }));
}

export async function toggleUserStatus(userId: string): Promise<boolean> {
  const db = getDB();
  const result = await db
    .prepare('UPDATE users SET is_active = NOT is_active WHERE id = ?')
    .bind(userId)
    .run();
  
  return result.success;
}