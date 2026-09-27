// Only same-origin, protected URLs may be sent to a browser. MEDIA_BASE_URL is
// deliberately ignored: redirecting to an unprotected origin bypasses auth.
export function mediaUrl(path: string): string {
  const parts = path.split('/');
  if (!path || parts.some(part => !part || part === '.' || part === '..' || /[\\%?#\x00-\x1f]/.test(part))) {
    throw new Error('Invalid media path');
  }
  return `/media/${parts.map(encodeURIComponent).join('/')}`;
}
