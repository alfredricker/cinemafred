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

const VTT_TIMESTAMP = /(\d{2,}):(\d{2}):(\d{2})\.(\d{3})/g;

function timestampToMilliseconds(hours: string, minutes: string, seconds: string, milliseconds: string) {
  return Number(hours) * 3_600_000
    + Number(minutes) * 60_000
    + Number(seconds) * 1_000
    + Number(milliseconds);
}

function millisecondsToTimestamp(value: number) {
  const clamped = Math.max(0, value);
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1_000);
  const milliseconds = clamped % 1_000;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

/** Shift every WebVTT cue timestamp, clamping cues that would move before zero. */
export function shiftVTTTimestamps(vttContent: string, offsetMs: number): string {
  if (!Number.isSafeInteger(offsetMs)) throw new Error('Offset must be an integer');

  return vttContent.replace(
    VTT_TIMESTAMP,
    (_match, hours: string, minutes: string, seconds: string, milliseconds: string) =>
      millisecondsToTimestamp(timestampToMilliseconds(hours, minutes, seconds, milliseconds) + offsetMs),
  );
}
