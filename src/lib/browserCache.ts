const CACHE_PREFIX = 'cinemafred:http-cache:v1:';
const DEFAULT_TTL_MS = 60 * 60 * 1000;

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

/**
 * Cache stable GET responses in this browser. Unlike the in-memory Next.js
 * router cache, this survives full page reloads and browser restarts.
 */
export async function fetchCachedJson<T>(url: string, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const key = `${CACHE_PREFIX}${url}`;

  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const entry = JSON.parse(cached) as CacheEntry<T>;
      if (entry.expiresAt > Date.now()) return entry.value;
      localStorage.removeItem(key);
    }
  } catch {
    // Storage may be disabled or full; fetching still works normally.
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  const value = await response.json() as T;

  try {
    localStorage.setItem(key, JSON.stringify({ expiresAt: Date.now() + ttlMs, value }));
  } catch {
    // A cache failure must never prevent the library from loading.
  }

  return value;
}
