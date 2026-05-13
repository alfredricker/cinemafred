import fs from 'fs/promises';
import path from 'path';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const MEDIA_ROOT = process.env.MEDIA_ROOT || '/data/cinemafred';

export async function PUT(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const filePath = url.searchParams.get('path');

  if (!token || !filePath) {
    return new Response('Unauthorized', { status: 401 });
  }

  let verified: { path: string };
  try {
    verified = jwt.verify(token, JWT_SECRET) as { path: string };
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  if (verified.path !== filePath) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Prevent path traversal
  const fullPath = path.resolve(MEDIA_ROOT, filePath);
  if (!fullPath.startsWith(path.resolve(MEDIA_ROOT) + path.sep)) {
    return new Response('Forbidden', { status: 403 });
  }

  const body = await request.arrayBuffer();
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, Buffer.from(body));

  return new Response(null, { status: 200 });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
