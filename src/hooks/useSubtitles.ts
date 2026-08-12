'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface SubtitleOption {
  id: string;
  label: string;
  language: string;
  source: 'local' | 'cached' | 'opensubtitles';
  url: string;
  fileId?: number;
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
  searchOnLoad = true,
) {
  const localOption = useMemo<SubtitleOption | null>(() => localUrl ? {
    id: 'local', label: 'Uploaded', language: 'en', source: 'local', url: localUrl,
  } : null, [localUrl]);
  const [options, setOptions] = useState<SubtitleOption[]>(localOption ? [localOption] : []);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(localUrl ? 'local' : null);
  const [trackVersion, setTrackVersion] = useState(0);

  const loadCached = useCallback(async (signal?: AbortSignal) => {
    if (!movieId) return [] as SubtitleOption[];
    const rows = await fetch(`/api/subtitles/cached?movieId=${encodeURIComponent(movieId)}`, { signal })
      .then(r => r.ok ? r.json() as Promise<CachedRow[]> : [])
      .catch(() => [] as CachedRow[]);
    return rows.map(r => ({
      id: `cached-${r.os_file_id}`,
      fileId: r.os_file_id,
      label: r.label.length > 48 ? `${r.label.slice(0, 45)}…` : r.label,
      language: r.language,
      source: 'cached' as const,
      url: `/api/subtitles/download?fileId=${r.os_file_id}`,
    }));
  }, [movieId]);

  const searchOpenSubtitles = useCallback(async () => {
    if (!movieId || !title) return;
    setLoading(true);
    try {
      const [cachedOpts, searchRows] = await Promise.all([
        loadCached(),
        fetch(`/api/subtitles/search?title=${encodeURIComponent(title)}&year=${year}`)
          .then(r => r.ok ? r.json() as Promise<SearchRow[]> : []),
      ]);
      const cachedIds = new Set(cachedOpts.map(o => o.fileId));
      const onlineOpts: SubtitleOption[] = searchRows
        .filter(r => !cachedIds.has(r.fileId))
        .slice(0, 15)
        .map(r => ({
          id: `os-${r.fileId}`,
          fileId: r.fileId,
          label: r.release.length > 48 ? `${r.release.slice(0, 45)}…` : r.release,
          language: r.language,
          source: 'opensubtitles',
          url: `/api/subtitles/download?fileId=${r.fileId}&movieId=${encodeURIComponent(movieId)}&language=${encodeURIComponent(r.language)}&label=${encodeURIComponent(r.release)}`,
          hearingImpaired: r.hearingImpaired,
        }));
      setOptions([...(localOption ? [localOption] : []), ...cachedOpts, ...onlineOpts]);
    } finally {
      setLoading(false);
    }
  }, [loadCached, localOption, movieId, title, year]);

  useEffect(() => {
    const ctrl = new AbortController();
    setOptions(localOption ? [localOption] : []);
    setActiveId(localOption ? 'local' : null);
    if (!movieId || !title) return () => ctrl.abort();

    if (searchOnLoad) {
      void searchOpenSubtitles();
    } else {
      setLoading(true);
      loadCached(ctrl.signal).then(cachedOpts => {
        setOptions([...(localOption ? [localOption] : []), ...cachedOpts]);
        if (!localOption && cachedOpts.length > 0) setActiveId(cachedOpts[0].id);
      }).finally(() => setLoading(false));
    }
    return () => ctrl.abort();
  }, [loadCached, localOption, movieId, searchOnLoad, searchOpenSubtitles, title]);

  const activeOption = useMemo(
    () => options.find(option => option.id === activeId) ?? null,
    [activeId, options],
  );
  const activeUrl = useMemo(() => {
    if (!activeOption) return null;
    const separator = activeOption.url.includes('?') ? '&' : '?';
    return `${activeOption.url}${separator}v=${trackVersion}`;
  }, [activeOption, trackVersion]);

  const shiftActiveSubtitle = useCallback(async (offsetMs: number) => {
    if (!activeOption?.fileId) throw new Error('Only saved OpenSubtitles subtitles can be shifted');

    // Ensure a newly selected search result has finished downloading and saving first.
    if (activeOption.source === 'opensubtitles') {
      const download = await fetch(activeOption.url);
      if (!download.ok) throw new Error('Subtitle could not be saved before shifting');
    }

    const response = await fetch('/api/subtitles/shift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movieId, fileId: activeOption.fileId, offsetMs }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? 'Failed to shift subtitle');
    setTrackVersion(version => version + 1);
  }, [activeOption, movieId]);

  return {
    options, loading, activeId, activeUrl,
    activeOption,
    selectSubtitle: setActiveId,
    searchOpenSubtitles,
    shiftActiveSubtitle,
  };
}
