import React from 'react';
import { Check, Clock3, Loader2, Search } from 'lucide-react';
import type { SubtitleOption } from '@/hooks/useSubtitles';

interface SubtitleSelectorProps {
  options: SubtitleOption[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string | null) => void;
  onSearch?: () => void;
  onShift?: (offsetMs: number) => Promise<void>;
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
  options, activeId, loading, onSelect, onSearch, onShift, onClose, className,
}) => {
  const [showShiftEditor, setShowShiftEditor] = React.useState(false);
  const [shiftValue, setShiftValue] = React.useState('0');
  const [shiftError, setShiftError] = React.useState<string | null>(null);
  const [shifting, setShifting] = React.useState(false);
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

  async function applyShift() {
    const offset = Number(shiftValue);
    if (!Number.isSafeInteger(offset)) {
      setShiftError('Enter a whole number of milliseconds');
      return;
    }
    setShifting(true);
    setShiftError(null);
    try {
      await onShift?.(offset);
      setShowShiftEditor(false);
    } catch (error) {
      setShiftError(error instanceof Error ? error.message : 'Shift failed');
    } finally {
      setShifting(false);
    }
  }

  return (
    <div className={`z-50 w-72 rounded-lg bg-black/90 backdrop-blur-sm border border-white/10 shadow-2xl overflow-hidden ${className ?? 'absolute top-12 left-0'}`}>
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
        <span className="text-white text-sm font-medium">Subtitles</span>
        {loading && <Loader2 className="w-3.5 h-3.5 text-white/50 animate-spin" />}
      </div>

      <div className="max-h-80 overflow-y-auto py-1">
        <OptionRow active={!activeId} label="Off" onClick={() => pick(null)} />

        {onSearch && (
          <button
            onClick={onSearch}
            disabled={loading}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-300 hover:bg-white/10 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>Search OpenSubtitles</span>
          </button>
        )}

        {activeId && onShift && (
          <>
            <button
              onClick={() => { setShowShiftEditor(value => !value); setShiftError(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
            >
              <Clock3 className="w-3.5 h-3.5" />
              <span>Shift selected subtitle…</span>
            </button>
            {showShiftEditor && (
              <div className="mx-3 mb-2 rounded-md border border-white/10 bg-white/5 p-2.5">
                <label className="block text-xs text-white/50 mb-1.5">Milliseconds (+ later, − earlier)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="1"
                    value={shiftValue}
                    onChange={event => setShiftValue(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') void applyShift(); }}
                    className="min-w-0 flex-1 rounded bg-black/50 border border-white/20 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-400"
                  />
                  <button
                    onClick={() => void applyShift()}
                    disabled={shifting}
                    className="rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-2.5 py-1.5 text-xs text-white"
                  >
                    {shifting ? 'Saving…' : 'Apply'}
                  </button>
                </div>
                {shiftError && <p className="mt-1.5 text-xs text-red-300">{shiftError}</p>}
              </div>
            )}
          </>
        )}

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
