'use client';
import { useState, useEffect, useMemo } from 'react';

export interface SubtitleOption {
  id: string;
  label: string;
  language: string;
  source: 'local' | 'cached' | 'opensubtitles';
  url: string;
  hearingImpaired?: boolean;
}

interface CachedRow {
  os_file_id: number;
  path: string;
  language: string;
  label: string;
}

interface SearchRow {
  fileId: number;
  language: string;
  release: string;
  hearingImpaired: boolean;
}

export function useSubtitles(
  title: string,
  year: number,
  movieId: string,
  localUrl?: string | null,
) {
  const [options, setOptions] = useState<SubtitleOption[]>(() =>
    localUrl ? [{ id: 'local', label: 'Uploaded', language: 'en', source: 'local', url: localUrl }] : []
  );
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(localUrl ? 'local' : null);

  useEffect(() => {
    const localOpt: SubtitleOption | null = localUrl
      ? { id: 'local', label: 'Uploaded', language: 'en', source: 'local', url: localUrl }
      : null;

    // Eagerly show local option while remote loads
    setOptions(localOpt ? [localOpt] : []);
    setActiveId(localUrl ? 'local' : null);

    if (!movieId || !title) return;

    const ctrl = new AbortController();
    setLoading(true);

    Promise.all([
      // Cached subtitles for this movie (already downloaded before)
      fetch(`/api/subtitles/cached?movieId=${encodeURIComponent(movieId)}`, { signal: ctrl.signal })
        .then(r => r.json() as Promise<CachedRow[]>)
        .catch(() => [] as CachedRow[]),

      // Fresh search from OpenSubtitles
      fetch(`/api/subtitles/search?title=${encodeURIComponent(title)}&year=${year}`, { signal: ctrl.signal })
        .then(r => r.json() as Promise<SearchRow[]>)
        .catch(() => [] as SearchRow[]),
    ])
      .then(([cachedRows, searchRows]) => {
        const cachedFileIds = new Set(cachedRows.map(r => r.os_file_id));

        const cachedOpts: SubtitleOption[] = cachedRows.map(r => ({
          id: `cached-${r.os_file_id}`,
          label: r.label.length > 48 ? r.label.slice(0, 45) + '…' : r.label,
          language: r.language,
          source: 'cached',
          url: `/api/subtitles/download?fileId=${r.os_file_id}`,
        }));

        const searchOpts: SubtitleOption[] = searchRows
          .filter(r => !cachedFileIds.has(r.fileId))
          .slice(0, 15)
          .map(r => ({
            id: `os-${r.fileId}`,
            label: r.release.length > 48 ? r.release.slice(0, 45) + '…' : r.release,
            language: r.language,
            source: 'opensubtitles',
            url: [
              `/api/subtitles/download?fileId=${r.fileId}`,
              `&movieId=${encodeURIComponent(movieId)}`,
              `&language=${encodeURIComponent(r.language)}`,
              `&label=${encodeURIComponent(r.release)}`,
            ].join(''),
            hearingImpaired: r.hearingImpaired,
          }));

        setOptions([
          ...(localOpt ? [localOpt] : []),
          ...cachedOpts,
          ...searchOpts,
        ]);

        // Auto-select first cached subtitle if nothing is active yet
        if (!localUrl && cachedOpts.length > 0) {
          setActiveId(prev => prev ?? cachedOpts[0].id);
        }
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [title, year, movieId, localUrl]);

  const activeUrl = useMemo(() => {
    if (!activeId) return null;
    return options.find(o => o.id === activeId)?.url ?? null;
  }, [activeId, options]);

  return { options, loading, activeId, activeUrl, selectSubtitle: setActiveId };
}
