import { NextResponse } from 'next/server';
import { mediaUrl } from '@/lib/media';

function convertSRTtoVTT(srtContent: string): string {
  let vttContent = 'WEBVTT\n\n';
  const lines = srtContent.split('\n');
  let i = 0;

  while (i < lines.length) {
    while (i < lines.length && !lines[i].trim()) i++;
    if (i >= lines.length) break;

    i++; // skip subtitle number
    if (i >= lines.length) break;

    const timestampLine = lines[i];
    if (timestampLine) {
      vttContent += timestampLine.replace(/,/g, '.') + '\n';
    }
    i++;

    while (i < lines.length && lines[i].trim()) {
      vttContent += lines[i] + '\n';
      i++;
    }

    vttContent += '\n';
  }

  return vttContent;
}

export async function GET(req: Request, { params }: { params: { file: string[] } }) {
  const filePath = params.file.join('/');

  if (!filePath) {
    return NextResponse.json({ error: 'Invalid file path.' }, { status: 400 });
  }

  // SRT files need server-side conversion to VTT — fetch from Nginx and convert
  if (filePath.endsWith('.srt')) {
    try {
      const response = await fetch(mediaUrl(filePath));
      if (!response.ok) {
        return NextResponse.json({ error: 'File not found.' }, { status: 404 });
      }
      const srtContent = await response.text();
      return new Response(convertSRTtoVTT(srtContent), {
        headers: { 'Content-Type': 'text/vtt' },
      });
    } catch {
      return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    }
  }

  // All other files redirect directly to Nginx
  return NextResponse.redirect(mediaUrl(filePath));
}
