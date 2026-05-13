export const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL || '').replace(/\/$/, '');

export function mediaUrl(path: string): string {
  return `${MEDIA_BASE_URL}/${path}`;
}
