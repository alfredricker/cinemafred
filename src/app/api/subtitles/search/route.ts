import { NextRequest, NextResponse } from 'next/server';
import { getOpenSubtitlesService } from '@/lib/opensubtitles';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = searchParams.get('title') ?? '';
  const year = parseInt(searchParams.get('year') ?? '0') || undefined;

  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  const service = getOpenSubtitlesService();
  if (!service) return NextResponse.json([]);

  const results = await service.search(title, year, 'en');
  return NextResponse.json(results);
}
