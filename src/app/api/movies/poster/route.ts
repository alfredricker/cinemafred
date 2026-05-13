import { NextResponse } from 'next/server';
import { validateAdmin } from '@/lib/middleware';
import fs from 'fs/promises';
import path from 'path';

const MEDIA_ROOT = process.env.MEDIA_ROOT || '/data/cinemafred';

export async function POST(request: Request) {
  const validation = await validateAdmin(request);
  if ('error' in validation) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const { imageUrl } = await request.json();
  if (!imageUrl) {
    return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
  }

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    return NextResponse.json({ error: 'Failed to download image from TMDB' }, { status: 500 });
  }

  const imageData = await imageResponse.arrayBuffer();

  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(7);
  const filename = `poster_${timestamp}_${randomString}.jpg`;
  const organizedPath = `images/${filename}`;
  const fullPath = path.join(MEDIA_ROOT, organizedPath);

  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, Buffer.from(imageData));

  return NextResponse.json({ filename, path: organizedPath });
}

export const runtime = 'nodejs';
