export function convertSRTtoVTT(srtContent: string): string {
  let vtt = 'WEBVTT\n\n';
  const lines = srtContent.split('\n');
  let i = 0;

  while (i < lines.length) {
    while (i < lines.length && !lines[i].trim()) i++;
    if (i >= lines.length) break;

    i++; // subtitle number
    if (i >= lines.length) break;

    const timestamp = lines[i];
    if (timestamp) vtt += timestamp.replace(/,/g, '.') + '\n';
    i++;

    while (i < lines.length && lines[i].trim()) {
      vtt += lines[i] + '\n';
      i++;
    }

    vtt += '\n';
  }

  return vtt;
}
