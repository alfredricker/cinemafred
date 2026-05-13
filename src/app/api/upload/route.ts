import { NextResponse } from 'next/server';
import { validateAdmin } from '@/lib/middleware';
import jwt from 'jsonwebtoken';

type FileType = 'video' | 'image' | 'subtitles';

const allowedExtensions: Record<FileType, string[]> = {
  video: ['mp4'],
  image: ['jpg', 'jpeg', 'png'],
  subtitles: ['srt', 'vtt'],
};

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export async function POST(request: Request) {
  const validation = await validateAdmin(request);
  if ('error' in validation) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const { filename, type, contentType } = await request.json();

  if (!filename || !type || !contentType) {
    return NextResponse.json({ error: 'Filename, type, and contentType are required' }, { status: 400 });
  }

  if (!['video', 'image', 'subtitles'].includes(type)) {
    return NextResponse.json({ error: 'Invalid file type. Must be video, image, or subtitles' }, { status: 400 });
  }

  const extension = filename.split('.').pop()?.toLowerCase();
  const validType = type as FileType;

  if (!extension || !allowedExtensions[validType].includes(extension)) {
    return NextResponse.json({
      error: `Invalid file type for ${type}. Allowed: ${allowedExtensions[validType].join(', ')}`,
    }, { status: 400 });
  }

  let organizedPath: string;
  switch (type) {
    case 'video':     organizedPath = `movies/${filename}`;    break;
    case 'image':     organizedPath = `images/${filename}`;    break;
    case 'subtitles': organizedPath = `subtitles/${filename}`; break;
    default:          organizedPath = filename;
  }

  // Sign a short-lived token so the save endpoint can verify this upload was authorized
  const uploadToken = jwt.sign({ path: organizedPath }, JWT_SECRET, { expiresIn: '2h' });
  const presignedUrl = `/api/upload/save?path=${encodeURIComponent(organizedPath)}&token=${uploadToken}`;

  return NextResponse.json({ presignedUrl, filename, organizedPath });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
