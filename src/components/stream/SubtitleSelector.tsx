import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { SubtitleOption } from '@/hooks/useSubtitles';

interface SubtitleSelectorProps {
  options: SubtitleOption[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  className?: string;
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ru: 'Russian',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ar: 'Arabic',
};
const langName = (code: string) => LANG_NAMES[code] ?? code.toUpperCase();

export const SubtitleSelector: React.FC<SubtitleSelectorProps> = ({
  options, activeId, loading, onSelect, onClose, className,
}) => {
  const local   = options.filter(o => o.source === 'local');
  const cached  = options.filter(o => o.source === 'cached');
  const online  = options.filter(o => o.source === 'opensubtitles');

  // Group online by language
  const byLang = online.reduce<Record<string, SubtitleOption[]>>((acc, o) => {
    (acc[o.language] ??= []).push(o);
    return acc;
  }, {});

  function pick(id: string | null) { onSelect(id); onClose(); }

  const isEmpty = options.length === 0;

  return (
    <div className={`z-50 w-72 rounded-lg bg-black/90 backdrop-blur-sm border border-white/10 shadow-2xl overflow-hidden ${className ?? 'absolute top-12 left-0'}`}>
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
        <span className="text-white text-sm font-medium">Subtitles</span>
        {loading && <Loader2 className="w-3.5 h-3.5 text-white/50 animate-spin" />}
      </div>

      <div className="max-h-80 overflow-y-auto py-1">
        <OptionRow active={!activeId} label="Off" onClick={() => pick(null)} />

        {/* Saved (previously downloaded from OpenSubtitles) */}
        {cached.length > 0 && (
          <>
            <SectionHeader label="Saved" />
            {cached.map(o => (
              <OptionRow
                key={o.id}
                active={activeId === o.id}
                label={o.label}
                sub={langName(o.language)}
                onClick={() => pick(o.id)}
              />
            ))}
          </>
        )}

        {/* Manually uploaded */}
        {local.length > 0 && (
          <>
            <SectionHeader label="Uploaded" />
            {local.map(o => (
              <OptionRow
                key={o.id}
                active={activeId === o.id}
                label={langName(o.language)}
                onClick={() => pick(o.id)}
              />
            ))}
          </>
        )}

        {/* OpenSubtitles results grouped by language */}
        {Object.entries(byLang).map(([lang, opts]) => (
          <div key={lang}>
            <SectionHeader label={langName(lang)} />
            {opts.map(o => (
              <OptionRow
                key={o.id}
                active={activeId === o.id}
                label={o.label}
                badge={o.hearingImpaired ? 'HI' : undefined}
                onClick={() => pick(o.id)}
              />
            ))}
          </div>
        ))}

        {!loading && isEmpty && (
          <p className="px-3 py-3 text-sm text-white/40 text-center">No subtitles found</p>
        )}
        {loading && isEmpty && (
          <p className="px-3 py-3 text-sm text-white/40 text-center">Searching…</p>
        )}
      </div>
    </div>
  );
};

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pt-2 pb-0.5 text-xs text-white/40 uppercase tracking-wider">{label}</div>
  );
}

function OptionRow({
  active, label, sub, badge, onClick,
}: {
  active: boolean;
  label: string;
  sub?: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-white/10 ${
        active ? 'text-white' : 'text-white/60'
      }`}
    >
      <Check className={`w-3.5 h-3.5 flex-shrink-0 ${active ? 'opacity-100' : 'opacity-0'}`} />
      <span className="truncate flex-1">{label}</span>
      {sub && <span className="text-xs text-white/40 flex-shrink-0">{sub}</span>}
      {badge && <span className="text-xs text-white/30 flex-shrink-0 ml-1">{badge}</span>}
    </button>
  );
}
