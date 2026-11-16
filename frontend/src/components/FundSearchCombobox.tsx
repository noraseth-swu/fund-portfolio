import React, { useState, useEffect, useRef } from 'react';
import { Search, Check, Sparkles, X } from 'lucide-react';
import { searchFunds, type FundSearchResult, type FundSuggestion } from '../lib/api';

interface Props {
  value: string;
  projId?: string;
  suggestions?: FundSuggestion[];
  onChange: (fund: {
    proj_id: string;
    fund_abbr: string;
    fund_name_th?: string;
    fund_name_en?: string;
    last_nav?: string;
  }) => void;
  placeholder?: string;
}

export const FundSearchCombobox: React.FC<Props> = ({
  value,
  projId,
  suggestions = [],
  onChange,
  placeholder = 'ค้นหากองทุน (SEC)...',
}) => {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<FundSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchFunds(query);
        const unique = data.filter(
          (r, idx, arr) =>
            idx ===
            arr.findIndex(
              (x) =>
                x.proj_id === r.proj_id &&
                (x.proj_abbr_name || '').toUpperCase() ===
                  (r.proj_abbr_name || '').toUpperCase()
            )
        );
        setResults(unique);
      } catch (err) {
        console.error('Error searching funds:', err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  const handleSelect = (fund: {
    proj_id: string;
    fund_abbr: string;
    fund_name_th?: string;
    fund_name_en?: string;
    last_nav?: string;
  }) => {
    setQuery(fund.fund_abbr);
    setIsOpen(false);
    onChange(fund);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1.5 focus:ring-indigo-500 font-medium"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setIsOpen(true);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Suggestion Chips when available */}
      {suggestions.length > 0 && !projId && (
        <div className="flex flex-wrap gap-1 mt-1">
          <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
            <Sparkles className="w-2.5 h-2.5" /> แนะนำ:
          </span>
          {suggestions.map((s) => (
            <button
              key={s.proj_id}
              type="button"
              onClick={() =>
                handleSelect({
                  proj_id: s.proj_id,
                  fund_abbr: s.fund_abbr,
                  fund_name_th: s.fund_name_th,
                  fund_name_en: s.fund_name_en,
                  last_nav: s.last_nav,
                })
              }
              className="text-[10px] px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
            >
              {s.fund_abbr}
            </button>
          ))}
        </div>
      )}

      {/* Dropdown Results */}
      {isOpen && (
        <div className="absolute z-[110] left-0 mt-1 min-w-[380px] sm:min-w-[480px] max-w-[90vw] max-h-64 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl text-left ring-1 ring-slate-900/10 dark:ring-white/10 backdrop-blur-md">
          {loading && (
            <div className="p-3 text-xs text-slate-400 text-center">กำลังค้นหาในฐานข้อมูล SEC...</div>
          )}

          {!loading && results.length === 0 && query.trim().length >= 2 && (
            <div className="p-3 text-xs text-slate-400 text-center">ไม่พบกองทุนที่ตรงกัน</div>
          )}

          {!loading &&
            results.map((r) => {
              const abbr = r.proj_abbr_name || r.proj_id;
              const isSelected = r.proj_id === projId;
              return (
                <div
                  key={r.proj_id}
                  onClick={() =>
                    handleSelect({
                      proj_id: r.proj_id,
                      fund_abbr: abbr,
                      fund_name_th: r.proj_name_th,
                      fund_name_en: r.proj_name_en,
                      last_nav: r.last_nav,
                    })
                  }
                  className={`px-3 py-2 text-xs cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-b-0 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors ${
                    isSelected ? 'bg-indigo-50/70 dark:bg-indigo-950/30' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      {abbr}
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </span>
                    {r.last_nav && (
                      <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded">
                        NAV {parseFloat(r.last_nav).toFixed(4)}
                      </span>
                    )}
                  </div>
                  {(r.proj_name_th || r.proj_name_en) && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {r.proj_name_th || r.proj_name_en}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};
