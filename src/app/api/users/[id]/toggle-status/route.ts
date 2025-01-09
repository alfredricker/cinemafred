// src/app/api/users/[id]/toggle-status/route.ts
import { NextResponse } from 'next/server';
import { validateAdmin } from '@/lib/middleware';
import { getDB } from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Validate admin access
    const validation = await validateAdmin(request);
    if ('error' in validation) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status }
      );
    }

    const userId = params.id;
    const db = getDB();

    // Check if user exists and is not an admin
    const targetUser = await db
      .prepare('SELECT is_admin FROM users WHERE id = ?')
      .bind(userId)
      .first();

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.is_admin) {
      return NextResponse.json(
        { error: 'Cannot toggle admin user status' },
        { status: 403 }
      );
    }

    // Toggle user status
    const result = await db
      .prepare('UPDATE users SET is_active = NOT is_active WHERE id = ?')
      .bind(userId)
      .run();

    if (!result.success) {
      throw new Error('Failed to update user status');
    }

    // Get updated user status
    const updatedUser = await db
      .prepare('SELECT is_active FROM users WHERE id = ?')
      .bind(userId)
      .first();

    return NextResponse.json({
      message: 'User status updated successfully',
      isActive: updatedUser.isActive
    });
  } catch (error) {
    console.error('Error toggling user status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}