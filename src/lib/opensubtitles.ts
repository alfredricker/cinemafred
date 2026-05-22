export interface SubtitleSearchResult {
  fileId: number;
  language: string;
  release: string;
  hearingImpaired: boolean;
  downloadCount: number;
}

const BASE = 'https://api.opensubtitles.com/api/v1';
const USER_AGENT = 'CinemaFred v1.0';

class OpenSubtitlesService {
  private token: string | null = null;
  private tokenExpiry = 0;

  constructor(private apiKey: string) {}

  private headers(auth?: string | null): Record<string, string> {
    const h: Record<string, string> = {
      'Api-Key': this.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    };
    if (auth) h['Authorization'] = `Bearer ${auth}`;
    return h;
  }

  async login(username?: string, password?: string): Promise<string | null> {
    if (!username || !password) return null;
    if (this.token && Date.now() < this.tokenExpiry) return this.token;

    try {
      const res = await fetch(`${BASE}/login`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      this.token = data.token ?? null;
      this.tokenExpiry = Date.now() + 23 * 3_600_000;
      return this.token;
    } catch {
      return null;
    }
  }

  async search(title: string, year?: number, languages = 'en'): Promise<SubtitleSearchResult[]> {
    try {
      const url = new URL(`${BASE}/subtitles`);
      url.searchParams.set('query', title);
      url.searchParams.set('languages', languages);
      if (year) url.searchParams.set('year', String(year));

      const res = await fetch(url.toString(), { headers: this.headers() });
      if (!res.ok) return [];

      const data = await res.json();
      return (data.data ?? []).flatMap((item: any) =>
        (item.attributes.files ?? []).map((file: any) => ({
          fileId: file.file_id,
          language: item.attributes.language,
          release: item.attributes.release || file.file_name || 'Unknown',
          hearingImpaired: Boolean(item.attributes.hearing_impaired),
          downloadCount: item.attributes.download_count ?? 0,
        }))
      );
    } catch {
      return [];
    }
  }

  async getDownloadLink(fileId: number, token?: string | null): Promise<{ link: string; fileName: string } | null> {
    try {
      const res = await fetch(`${BASE}/download`, {
        method: 'POST',
        headers: this.headers(token),
        body: JSON.stringify({ file_id: fileId }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.link ? { link: data.link, fileName: data.file_name ?? 'subtitle.srt' } : null;
    } catch {
      return null;
    }
  }
}

// Module-level singleton — safe on a long-running server (not serverless)
let _instance: OpenSubtitlesService | null = null;

export function getOpenSubtitlesService(): OpenSubtitlesService | null {
  const apiKey = process.env.OPENSUBTITLES_API_KEY;
  if (!apiKey) return null;
  if (!_instance) _instance = new OpenSubtitlesService(apiKey);
  return _instance;
}
