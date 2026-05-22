'use client';
import { useState, useEffect, useMemo } from 'react';

export interface SubtitleOption {
  id: string;
  label: string;
  language: string;
  source: 'local' | 'opensubtitles';
  hearingImpaired?: boolean;
}

export function useSubtitles(title: string, year: number, localUrl?: string | null) {
  const [options, setOptions] = useState<SubtitleOption[]>(() =>
    localUrl ? [{ id: 'local', label: 'Uploaded', language: 'en', source: 'local' }] : []
  );
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(localUrl ? 'local' : null);

  useEffect(() => {
    const initial: SubtitleOption[] = localUrl
      ? [{ id: 'local', label: 'Uploaded', language: 'en', source: 'local' }]
      : [];
    setOptions(initial);
    setActiveId(localUrl ? 'local' : null);

    if (!title) return;

    const ctrl = new AbortController();
    setLoading(true);

    fetch(`/api/subtitles/search?title=${encodeURIComponent(title)}&year=${year}`, {
      signal: ctrl.signal,
    })
      .then(r => r.json())
      .then((results: Array<{ fileId: number; language: string; release: string; hearingImpaired: boolean }>) => {
        if (!Array.isArray(results) || !results.length) return;
        setOptions(prev => [
          ...prev,
          ...results.slice(0, 15).map(r => ({
            id: `os-${r.fileId}`,
            label: r.release.length > 48 ? r.release.slice(0, 45) + '…' : r.release,
            language: r.language,
            source: 'opensubtitles' as const,
            hearingImpaired: r.hearingImpaired,
          })),
        ]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [title, year, localUrl]);

  const activeUrl = useMemo(() => {
    if (!activeId) return null;
    if (activeId === 'local') return localUrl ?? null;
    return `/api/subtitles/download?fileId=${activeId.replace('os-', '')}`;
  }, [activeId, localUrl]);

  return { options, loading, activeId, activeUrl, selectSubtitle: setActiveId };
}
