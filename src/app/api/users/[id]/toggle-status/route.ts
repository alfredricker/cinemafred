//src/app/api/users/[id]/toggle-status/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { validateAdmin } from '@/lib/middleware';
import prisma from '@/lib/db';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.url.split('/').pop();
    if (!userId) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const validation = await validateAdmin(request);
    if ('error' in validation) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true, isActive: true }
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.isAdmin) {
      return NextResponse.json(
        { error: 'Cannot toggle admin user status' },
        { status: 403 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isActive: !targetUser.isActive },
      select: { isActive: true }
    });

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