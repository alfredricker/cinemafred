// src/app/api/users/route.ts
import jwt from 'jsonwebtoken';
import { validateAdmin, validateInput } from '@/lib/middleware';  // Add this import
import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDB } from '@/lib/db';
import { DBUser } from '@/types/db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Utility function to validate JWT token
async function validateToken(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { isAdmin: boolean };
    if (!decoded.isAdmin) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

// Generate a random password
function generateTemporaryPassword() {
  const length = 5;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}

// GET handler to list all users
export async function GET(request: Request) {
  try {
    const user = await validateToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDB();
    const users = await db.prepare(`
      SELECT 
        id, 
        email, 
        username,
        is_active,
        is_admin,
        must_reset_password,
        date_created,
        updated_at
      FROM users
      ORDER BY date_created DESC
    `).all();

    return NextResponse.json(users.results.map((user:any) => ({
      id: user.id,
      email: user.email,
      username: user.username,
      isActive: user.is_active,
      isAdmin: user.is_admin,
      mustResetPassword: user.must_reset_password,
      dateCreated: user.date_created,
      updatedAt: user.updated_at
    })));
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST handler to create a new user
export async function POST(request: Request) {
  try {
    const validation = await validateAdmin(request);
    if ('error' in validation) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status }
      );
    }

    const data = await request.json();
    
    // Validate input
    const validationErrors = validateInput(data, {
      email: {
        required: true,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        maxLength: 255,
      }
    });

    if (validationErrors) {
      return NextResponse.json({ errors: validationErrors }, { status: 400 });
    }

    const { email } = await request.json();
    
    // Basic email validation
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const db = getDB();

    // Check if user already exists
    const existingUser = await db
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();

    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    // Generate base username from email
    let baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Check username uniqueness and append numbers if needed
    let username = baseUsername;
    let counter = 1;
    
    while (true) {
      const existingUsername = await db
        .prepare('SELECT id FROM users WHERE username = ?')
        .bind(username)
        .first();
        
      if (!existingUsername) break;
      username = `${baseUsername}${counter}`;
      counter++;
    }
    
    // Generate temporary password and hash it
    const tempPassword = generateTemporaryPassword();
    const hashedPassword = await hash(tempPassword, 10);
    const userId = uuidv4();

    // Create the user
    await db.prepare(`
      INSERT INTO users (
        id,
        email,
        username,
        password_hash,
        is_active,
        is_admin,
        must_reset_password
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      email,
      username,
      hashedPassword,
      true, // is_active
      false, // is_admin
      true // must_reset_password
    ).run();

    // In a production environment, you would send an email here with the temporary password
    // For development, we'll return it in the response
    return NextResponse.json({
      message: 'User created successfully',
      userId,
      tempPassword, // Only include this in development
      username
    });

  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}