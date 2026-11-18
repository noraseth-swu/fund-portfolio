import React, { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, Sparkles } from 'lucide-react';
import { getNavDatesForMonth } from '../lib/api';
import { useI18n } from '../lib/i18n';

interface Props {
  value: string; // YYYY-MM-DD
  projId?: string;
  fundAbbr?: string;
  onChange: (date: string, nav?: string) => void;
  className?: string;
}

type CalendarView = 'days' | 'months' | 'years';

export const NavDatePicker: React.FC<Props> = ({
  value,
  projId,
  fundAbbr,
  onChange,
  className = '',
}) => {
  const { locale } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [calendarView, setCalendarView] = useState<CalendarView>('days');
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial view year and month
  const initialDate = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value) : new Date();
  const [viewYear, setViewYear] = useState(() => initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => initialDate.getMonth()); // 0-11
  const [decadeStart, setDecadeStart] = useState(() => Math.floor(initialDate.getFullYear() / 10) * 10);

  // NAV dates map: { "2026-11-02": "9.8676" }
  const [navMap, setNavMap] = useState<Record<string, string>>({});
  const [loadingNav, setLoadingNav] = useState(false);

  // Close when clicking outside and reset view to days
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setCalendarView('days');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Sync view when value changes and popover is closed
  useEffect(() => {
    if (!isOpen && value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
        setDecadeStart(Math.floor(d.getFullYear() / 10) * 10);
      }
    }
  }, [value, isOpen]);

  // Sync decadeStart when viewYear changes
  useEffect(() => {
    setDecadeStart(Math.floor(viewYear / 10) * 10);
  }, [viewYear]);

  // Fetch NAV dates for current viewed month if projId or fundAbbr exists
  useEffect(() => {
    const targetId = (projId || fundAbbr || '').trim();
    if (!targetId) {
      setNavMap({});
      return;
    }

    const monthStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
    let isCancelled = false;

    setLoadingNav(true);
    getNavDatesForMonth(targetId, monthStr, fundAbbr)
      .then((res) => {
        if (!isCancelled) {
          setNavMap(res.nav_dates || {});
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setNavMap({});
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setLoadingNav(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [viewYear, viewMonth, projId, fundAbbr]);

  // Month navigation
  const prevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const setToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const today = new Date();
    const dStr = today.toISOString().split('T')[0];
    const nav = navMap[dStr];
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setCalendarView('days');
    onChange(dStr, nav);
    setIsOpen(false);
  };

  // Calendar calculations
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday

  // Month names
  const monthNamesTh = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];
  const monthNamesEn = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const shortMonthNamesTh = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
  ];
  const shortMonthNamesEn = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const currentMonthName = locale === 'th' ? monthNamesTh[viewMonth] : monthNamesEn[viewMonth];
  const shortMonthNames = locale === 'th' ? shortMonthNamesTh : shortMonthNamesEn;
  const displayYear = locale === 'th' ? viewYear + 543 : viewYear;

  // Decade years (12 items)
  const decadeYears = Array.from({ length: 12 }, (_, i) => decadeStart + i);
  const decadeStartDisplay = locale === 'th' ? decadeStart + 543 : decadeStart;
  const decadeEndDisplay = locale === 'th' ? decadeStart + 11 + 543 : decadeStart + 11;

  const weekdayNames = locale === 'th'
    ? ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
    : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const tradingDaysCount = Object.keys(navMap).length;
  const hasFund = Boolean(projId || fundAbbr);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-[42px] flex items-center justify-between gap-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white transition font-mono group cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs"
      >
        <div className="flex items-center gap-2 truncate">
          <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-indigo-500 shrink-0" />
          <span className="font-semibold text-slate-900 dark:text-white">{value || 'YYYY-MM-DD'}</span>
        </div>
        {value && navMap[value] && parseFloat(navMap[value]) > 0 ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 text-[11px] font-bold shrink-0" title={`NAV: ${navMap[value]}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>NAV {parseFloat(navMap[value]).toFixed(4)}</span>
          </span>
        ) : (
          hasFund && <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
        )}
      </button>

      {/* Calendar Popover */}
      {isOpen && (
        <div className="absolute z-[120] left-0 mt-1 w-72 sm:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3.5 text-slate-800 dark:text-slate-200 animate-fade-in backdrop-blur-xl ring-1 ring-slate-900/10 dark:ring-white/10">
          {/* Header Navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              aria-label="Previous"
              onClick={(e) => {
                e.stopPropagation();
                if (calendarView === 'days') prevMonth(e);
                else if (calendarView === 'months') setViewYear((y) => y - 1);
                else setDecadeStart((d) => d - 10);
              }}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {calendarView === 'days' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCalendarView('months');
                }}
                className="px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-800 dark:text-white transition cursor-pointer flex items-center gap-1 group"
                title={locale === 'th' ? 'คลิกเพื่อเลือกเดือน' : 'Click to select month'}
              >
                <span>{currentMonthName} {displayYear}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
              </button>
            )}

            {calendarView === 'months' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCalendarView('years');
                }}
                className="px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-800 dark:text-white transition cursor-pointer flex items-center gap-1 group"
                title={locale === 'th' ? 'คลิกเพื่อเลือกปี' : 'Click to select year'}
              >
                <span>{displayYear}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
              </button>
            )}

            {calendarView === 'years' && (
              <span className="text-xs font-bold font-mono text-slate-800 dark:text-white px-2 py-1">
                {decadeStartDisplay} - {decadeEndDisplay}
              </span>
            )}

            <button
              type="button"
              aria-label="Next"
              onClick={(e) => {
                e.stopPropagation();
                if (calendarView === 'days') nextMonth(e);
                else if (calendarView === 'months') setViewYear((y) => y + 1);
                else setDecadeStart((d) => d + 10);
              }}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Month Selection Grid View */}
          {calendarView === 'months' && (
            <div className="grid grid-cols-3 gap-2 py-2">
              {shortMonthNames.map((name, idx) => {
                const isSelected = viewMonth === idx;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewMonth(idx);
                      setCalendarView('days');
                    }}
                    className={`h-11 rounded-xl text-xs font-medium flex items-center justify-center transition cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-bold shadow-sm'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Year/Decade Selection Grid View */}
          {calendarView === 'years' && (
            <div className="grid grid-cols-3 gap-2 py-2">
              {decadeYears.map((y) => {
                const isSelected = viewYear === y;
                const yearLabel = locale === 'th' ? y + 543 : y;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewYear(y);
                      setCalendarView('months');
                    }}
                    className={`h-11 rounded-xl text-xs font-mono font-medium flex items-center justify-center transition cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-bold shadow-sm'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {yearLabel}
                  </button>
                );
              })}
            </div>
          )}

          {/* Days Grid View */}
          {calendarView === 'days' && (
            <>
              {/* Status Banner */}
              {hasFund ? (
                <div className="mb-2.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center justify-between shadow-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>วันที่มี NAV: <strong className="font-mono text-emerald-900 dark:text-emerald-100">{tradingDaysCount} วัน</strong></span>
                  </span>
                  {loadingNav && (
                    <span className="text-slate-400 text-[10px] animate-spin font-sans">กำลังดึง SEC...</span>
                  )}
                </div>
              ) : (
                <div className="mb-2.5 px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-1.5 shadow-xs">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>เลือกกองทุนก่อนเพื่อไฮไลท์วันที่มีราคา NAV</span>
                </div>
              )}

              {/* Weekday Labels */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                {weekdayNames.map((w, idx) => (
                  <div key={w} className={idx === 0 || idx === 6 ? 'text-slate-400 dark:text-slate-500' : ''}>
                    {w}
                  </div>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty slots for start padding */}
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                  <div key={`empty_${i}`} className="h-8" />
                ))}

                {/* Day Cells */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isSelected = value === dateStr;
                  const nav = navMap[dateStr];
                  const dayOfWeek = (firstDayIndex + i) % 7;
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => {
                        onChange(dateStr, nav);
                        setIsOpen(false);
                      }}
                      title={nav ? `วันที่ ${dateStr} • NAV: ${nav}` : dateStr}
                      className={`h-8 rounded-lg text-xs font-mono flex flex-col items-center justify-center relative transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white font-bold ring-2 ring-indigo-400 shadow-md'
                          : nav
                          ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-2 border-emerald-500 dark:bg-emerald-950/70 dark:hover:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-500 font-bold shadow-xs'
                          : isWeekend
                          ? 'text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{day}</span>
                      {nav && !isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400 absolute bottom-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Footer Shortcuts */}
          <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={setToday}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold transition cursor-pointer"
            >
              {locale === 'th' ? 'วันนี้' : 'Today'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setCalendarView('days');
              }}
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition cursor-pointer"
            >
              {locale === 'th' ? 'ปิด' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
