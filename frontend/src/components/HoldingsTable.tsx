import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  History,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  GripVertical,
  RotateCcw,
} from 'lucide-react';
import { PlatformBadge } from './PlatformBadge';
import { type HoldingPosition } from '../lib/api';
import { useI18n, type TranslationKey } from '../lib/i18n';
import { useToast } from '../lib/toast';

export type HoldingsColumnKey =
  | 'fund'
  | 'platform'
  | 'total_units'
  | 'avg_cost'
  | 'total_cost'
  | 'current_nav'
  | 'market_value'
  | 'unrealized_pl'
  | 'realized_pl'
  | 'actions';

export type SortField =
  | 'fund_abbr'
  | 'platform'
  | 'total_units'
  | 'avg_cost'
  | 'total_cost'
  | 'current_nav'
  | 'market_value'
  | 'unrealized_pl'
  | 'realized_pl';

interface ColumnDef {
  key: HoldingsColumnKey;
  labelKey: TranslationKey;
  defaultLabel: string;
  align: 'left' | 'right' | 'center';
  sortField?: SortField;
  minWidth?: string;
}

export const ALL_COLUMNS: Record<HoldingsColumnKey, ColumnDef> = {
  fund: {
    key: 'fund',
    labelKey: 'fundHeader',
    defaultLabel: 'Fund / Asset',
    align: 'left',
    sortField: 'fund_abbr',
    minWidth: 'min-w-[180px]',
  },
  platform: {
    key: 'platform',
    labelKey: 'platformHeader',
    defaultLabel: 'Platform',
    align: 'left',
    sortField: 'platform',
    minWidth: 'min-w-[110px]',
  },
  total_units: {
    key: 'total_units',
    labelKey: 'unitsHeader',
    defaultLabel: 'Units',
    align: 'right',
    sortField: 'total_units',
    minWidth: 'min-w-[110px]',
  },
  avg_cost: {
    key: 'avg_cost',
    labelKey: 'avgCostHeader',
    defaultLabel: 'Avg Cost',
    align: 'right',
    sortField: 'avg_cost',
    minWidth: 'min-w-[95px]',
  },
  total_cost: {
    key: 'total_cost',
    labelKey: 'totalCostHeader',
    defaultLabel: 'Cost Basis',
    align: 'right',
    sortField: 'total_cost',
    minWidth: 'min-w-[110px]',
  },
  current_nav: {
    key: 'current_nav',
    labelKey: 'navHeader',
    defaultLabel: 'Current NAV / Price',
    align: 'right',
    sortField: 'current_nav',
    minWidth: 'min-w-[125px]',
  },
  market_value: {
    key: 'market_value',
    labelKey: 'marketValHeader',
    defaultLabel: 'Market Value',
    align: 'right',
    sortField: 'market_value',
    minWidth: 'min-w-[120px]',
  },
  unrealized_pl: {
    key: 'unrealized_pl',
    labelKey: 'unrealizedPlHeader',
    defaultLabel: 'Unrealized P/L',
    align: 'right',
    sortField: 'unrealized_pl',
    minWidth: 'min-w-[130px]',
  },
  realized_pl: {
    key: 'realized_pl',
    labelKey: 'realizedPlHeader',
    defaultLabel: 'Realized P/L',
    align: 'right',
    sortField: 'realized_pl',
    minWidth: 'min-w-[105px]',
  },
  actions: {
    key: 'actions',
    labelKey: 'viewHistory',
    defaultLabel: 'History',
    align: 'center',
    minWidth: 'min-w-[65px]',
  },
};

export const DEFAULT_HOLDINGS_COLUMNS: HoldingsColumnKey[] = [
  'fund',
  'platform',
  'total_units',
  'avg_cost',
  'total_cost',
  'current_nav',
  'market_value',
  'unrealized_pl',
  'realized_pl',
  'actions',
];

interface Props {
  holdings: HoldingPosition[];
  selectedPlatform: string;
  onSelectPlatform: (platform: string) => void;
  activePlatforms: string[];
  selectedAssetType: 'ALL' | 'FUND' | 'STOCK' | 'PVD';
  onSelectAssetType: (type: 'ALL' | 'FUND' | 'STOCK' | 'PVD') => void;
  isPrivacyMode: boolean;
  userId?: string;
  onViewHistory: (fundAbbr: string) => void;
}

export const HoldingsTable: React.FC<Props> = ({
  holdings,
  selectedPlatform,
  onSelectPlatform,
  activePlatforms,
  selectedAssetType,
  onSelectAssetType,
  isPrivacyMode,
  userId = 'default',
  onViewHistory,
}) => {
  const { t, locale } = useI18n();
  const toast = useToast();
  const storageKey = `fund_portfolio_holdings_col_order_${userId}`;

  // Column Ordering with user-specific persistence
  const [columnOrder, setColumnOrder] = useState<HoldingsColumnKey[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === DEFAULT_HOLDINGS_COLUMNS.length) {
          const isValid = DEFAULT_HOLDINGS_COLUMNS.every((k) => parsed.includes(k));
          if (isValid) return parsed as HoldingsColumnKey[];
        }
      }
    } catch {
      // ignore JSON parse error
    }
    return DEFAULT_HOLDINGS_COLUMNS;
  });

  // Keep columnOrder synced when userId changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`fund_portfolio_holdings_col_order_${userId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === DEFAULT_HOLDINGS_COLUMNS.length) {
          const isValid = DEFAULT_HOLDINGS_COLUMNS.every((k) => parsed.includes(k));
          if (isValid) {
            setColumnOrder(parsed as HoldingsColumnKey[]);
            return;
          }
        }
      }
    } catch {
      // ignore
    }
    setColumnOrder(DEFAULT_HOLDINGS_COLUMNS);
  }, [userId]);

  const saveColumnOrder = (newOrder: HoldingsColumnKey[]) => {
    setColumnOrder(newOrder);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newOrder));
    } catch {
      // ignore
    }
  };

  const handleResetColumns = () => {
    setColumnOrder(DEFAULT_HOLDINGS_COLUMNS);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    toast.info(locale === 'th' ? 'คืนค่าลำดับคอลัมน์เริ่มต้นแล้ว' : 'Reset column order to default');
  };

  const isCustomOrder = JSON.stringify(columnOrder) !== JSON.stringify(DEFAULT_HOLDINGS_COLUMNS);

  // Search & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('market_value');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Drag and Drop state
  const [draggedCol, setDraggedCol] = useState<HoldingsColumnKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<HoldingsColumnKey | null>(null);
  const isDraggingRef = useRef(false);

  const handleSort = (field: SortField) => {
    // If a drag operation just finished, do not trigger sort
    if (isDraggingRef.current) return;

    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'fund_abbr' || field === 'platform' ? 'asc' : 'desc');
    }
  };

  const handleDragStart = (e: React.DragEvent, colKey: HoldingsColumnKey) => {
    isDraggingRef.current = true;
    setDraggedCol(colKey);
    e.dataTransfer.setData('text/plain', colKey);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, colKey: HoldingsColumnKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== colKey) {
      setDragOverCol(colKey);
    }
  };

  const handleDragLeave = (_e: React.DragEvent, colKey: HoldingsColumnKey) => {
    if (dragOverCol === colKey) {
      setDragOverCol(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetColKey: HoldingsColumnKey) => {
    e.preventDefault();
    if (!draggedCol || draggedCol === targetColKey) {
      setDraggedCol(null);
      setDragOverCol(null);
      return;
    }

    const newOrder = [...columnOrder];
    const fromIdx = newOrder.indexOf(draggedCol);
    const toIdx = newOrder.indexOf(targetColKey);

    if (fromIdx !== -1 && toIdx !== -1) {
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, draggedCol);
      saveColumnOrder(newOrder);
    }

    setDraggedCol(null);
    setDragOverCol(null);
  };

  const handleDragEnd = () => {
    setDraggedCol(null);
    setDragOverCol(null);
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 150);
  };

  // Formatting helpers
  const formatMoney = (val?: string) => {
    if (!val) return '0.00';
    return parseFloat(val).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatDisplayMoney = (val?: string) => {
    if (isPrivacyMode) return '******';
    return formatMoney(val);
  };

  const formatNavDate = (dStr?: string) => {
    if (!dStr) return '';
    const parts = dStr.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return dStr;
  };

  // Filter & Sort Holdings
  const filteredHoldings = holdings
    .filter((h) => {
      // Platform filter
      if (selectedPlatform !== 'ALL' && h.platform.toUpperCase() !== selectedPlatform.toUpperCase()) {
        return false;
      }
      // Asset Type filter
      if (selectedAssetType === 'STOCK' && h.asset_type !== 'STOCK') return false;
      if (selectedAssetType === 'PVD' && h.asset_type !== 'PVD') return false;
      if (selectedAssetType === 'FUND' && (h.asset_type === 'STOCK' || h.asset_type === 'PVD')) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const abbr = (h.fund_abbr || '').toLowerCase();
        const name = (h.fund_name_th || '').toLowerCase();
        const proj = (h.proj_id || '').toLowerCase();
        return abbr.includes(q) || name.includes(q) || proj.includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortField) {
        case 'fund_abbr':
          aVal = (a.fund_abbr || a.proj_id).toLowerCase();
          bVal = (b.fund_abbr || b.proj_id).toLowerCase();
          break;
        case 'platform':
          aVal = a.platform.toLowerCase();
          bVal = b.platform.toLowerCase();
          break;
        case 'total_units':
          aVal = parseFloat(a.total_units) || 0;
          bVal = parseFloat(b.total_units) || 0;
          break;
        case 'avg_cost':
          aVal = parseFloat(a.avg_cost) || 0;
          bVal = parseFloat(b.avg_cost) || 0;
          break;
        case 'total_cost':
          aVal = parseFloat(a.total_cost) || 0;
          bVal = parseFloat(b.total_cost) || 0;
          break;
        case 'current_nav':
          aVal = parseFloat(a.current_nav) || 0;
          bVal = parseFloat(b.current_nav) || 0;
          break;
        case 'market_value':
          aVal = parseFloat(a.market_value) || 0;
          bVal = parseFloat(b.market_value) || 0;
          break;
        case 'unrealized_pl':
          aVal = parseFloat(a.unrealized_pl) || 0;
          bVal = parseFloat(b.unrealized_pl) || 0;
          break;
        case 'realized_pl':
          aVal = parseFloat(a.realized_pl) || 0;
          bVal = parseFloat(b.realized_pl) || 0;
          break;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortOrder === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

  // Cell Renderer
  const renderCell = (colKey: HoldingsColumnKey, h: HoldingPosition, _idx: number) => {
    switch (colKey) {
      case 'fund':
        return (
          <td key={colKey} className="py-3 px-3 sm:px-4 whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-900 dark:text-white block">{h.fund_abbr}</span>
              {h.asset_type === 'STOCK' && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                  {locale === 'th' ? 'หุ้น' : 'Stock'}
                </span>
              )}
              {h.asset_type === 'PVD' && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                  PVD
                </span>
              )}
            </div>
            <span
              className="text-[11px] text-slate-500 dark:text-slate-400 block truncate max-w-xs xl:max-w-md"
              title={h.fund_name_th || h.proj_id}
            >
              {h.fund_name_th || h.proj_id}
            </span>
          </td>
        );

      case 'platform':
        return (
          <td key={colKey} className="py-3 px-3 sm:px-4 whitespace-nowrap">
            <PlatformBadge platform={h.platform} />
          </td>
        );

      case 'total_units':
        return (
          <td key={colKey} className="py-3 px-3 sm:px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
            {isPrivacyMode
              ? '******'
              : parseFloat(h.total_units).toLocaleString(undefined, { minimumFractionDigits: 4 })}
          </td>
        );

      case 'avg_cost':
        return (
          <td key={colKey} className="py-3 px-3 sm:px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
            {isPrivacyMode ? (
              '******'
            ) : h.asset_type === 'STOCK' && h.avg_cost_foreign ? (
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {`$${parseFloat(h.avg_cost_foreign).toFixed(2)}`}
                </span>
                <span className="text-[10px] block text-slate-500 dark:text-slate-400 font-normal">
                  {`(฿${parseFloat(h.avg_cost).toFixed(2)})`}
                </span>
              </div>
            ) : (
              parseFloat(h.avg_cost).toFixed(4)
            )}
          </td>
        );

      case 'total_cost':
        return (
          <td key={colKey} className="py-3 px-3 sm:px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
            {isPrivacyMode ? '******' : formatDisplayMoney(h.total_cost)}
          </td>
        );

      case 'current_nav':
        return (
          <td key={colKey} className="py-3 px-3 sm:px-4 text-right font-mono text-indigo-700 dark:text-indigo-300 font-bold tabular-nums">
            {h.asset_type === 'STOCK' ? (
              <div>
                <span className="font-bold text-slate-900 dark:text-white">
                  {`$${parseFloat(h.price_foreign || h.current_nav).toFixed(2)}`}
                </span>
                {h.exchange_rate && (
                  <span className="text-[10px] block text-slate-500 dark:text-slate-400 font-normal">
                    {`(฿${(parseFloat(h.price_foreign || h.current_nav) * parseFloat(h.exchange_rate)).toFixed(2)})`}
                  </span>
                )}
                {h.nav_date && (
                  <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                    ({formatNavDate(h.nav_date)})
                  </div>
                )}
              </div>
            ) : (
              <>
                <div>{parseFloat(h.current_nav).toFixed(4)}</div>
                {h.nav_date && (
                  <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                    ({formatNavDate(h.nav_date)})
                  </div>
                )}
              </>
            )}
          </td>
        );

      case 'market_value':
        return (
          <td key={colKey} className="py-3 px-3 sm:px-4 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
            {formatDisplayMoney(h.market_value)}
          </td>
        );

      case 'unrealized_pl': {
        const upl = parseFloat(h.unrealized_pl);
        const isPos = upl >= 0;
        return (
          <td key={colKey} className="py-3 px-3 sm:px-4 text-right whitespace-nowrap font-mono tabular-nums">
            <span
              className={`font-bold ${
                isPos ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {isPrivacyMode ? '******' : `${isPos ? '+' : ''}${formatMoney(h.unrealized_pl)}`}
            </span>
            <span
              className={`text-[10px] block font-semibold ${
                isPos ? 'text-emerald-600 dark:text-emerald-500' : 'text-rose-600 dark:text-rose-500'
              }`}
            >
              {isPos ? '+' : ''}
              {h.unrealized_pl_pct}%
            </span>
          </td>
        );
      }

      case 'realized_pl':
        return (
          <td key={colKey} className="py-3 px-3 sm:px-4 text-right whitespace-nowrap font-mono tabular-nums">
            <span
              className={`font-semibold ${
                parseFloat(h.realized_pl) > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : parseFloat(h.realized_pl) < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {isPrivacyMode
                ? '******'
                : `${parseFloat(h.realized_pl) > 0 ? '+' : ''}${formatMoney(h.realized_pl)}`}
            </span>
          </td>
        );

      case 'actions':
        return (
          <td key={colKey} className="py-3 px-3 sm:px-4 text-center">
            {h.asset_type === 'PVD' ? (
              <span
                className="text-[10px] text-slate-400 dark:text-slate-500 font-medium select-none"
                title="PVD position tracks latest certificate snapshot"
              >
                Snapshot
              </span>
            ) : (
              <button
                onClick={() => onViewHistory(h.fund_abbr)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition cursor-pointer"
                title={t('viewHistory')}
              >
                <History className="w-4 h-4" />
              </button>
            )}
          </td>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4 w-full">
      {/* Top Filter and Controls Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            {t('holdingsTitle')}
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            ({filteredHoldings.length} {locale === 'th' ? 'รายการ' : 'holdings'})
          </span>

          {isCustomOrder && (
            <button
              onClick={handleResetColumns}
              className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-slate-700/80 rounded-md transition cursor-pointer border border-slate-200 dark:border-slate-700"
              title={t('resetColumns')}
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t('resetColumns')}</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Asset Type Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs filter-tabs-container">
            <button
              onClick={() => onSelectAssetType('ALL')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                selectedAssetType === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {t('allAssets')}
            </button>
            <button
              onClick={() => onSelectAssetType('FUND')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                selectedAssetType === 'FUND'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {t('mutualFunds')}
            </button>
            <button
              onClick={() => onSelectAssetType('STOCK')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                selectedAssetType === 'STOCK'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {t('stocks')}
            </button>
            <button
              onClick={() => onSelectAssetType('PVD')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                selectedAssetType === 'PVD'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {t('assetPvd')}
            </button>
          </div>

          {/* Platform Filter */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs filter-tabs-container">
            {['ALL', ...activePlatforms].map((tab) => (
              <button
                key={tab}
                onClick={() => onSelectPlatform(tab)}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  selectedPlatform === tab
                    ? 'bg-indigo-600 text-white shadow-xs tab-btn-active'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 tab-btn-inactive'
                }`}
              >
                {tab === 'ALL' ? t('allPlatforms') : tab}
              </button>
            ))}
          </div>

          {/* Fund / Asset Search */}
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={locale === 'th' ? 'ค้นหากองทุน/สินทรัพย์...' : 'Search asset / fund...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reorderable Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-xs">
        <table className="w-full text-left text-xs sm:text-sm border-collapse">
          <thead className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800 font-bold select-none">
            <tr>
              {columnOrder.map((colKey) => {
                const col = ALL_COLUMNS[colKey];
                const isSortable = !!col.sortField;
                const isCurrentSort = isSortable && sortField === col.sortField;
                const isDragged = draggedCol === colKey;
                const isTarget = dragOverCol === colKey && draggedCol !== colKey;

                return (
                  <th
                    key={colKey}
                    draggable
                    onDragStart={(e) => handleDragStart(e, colKey)}
                    onDragOver={(e) => handleDragOver(e, colKey)}
                    onDragLeave={(e) => handleDragLeave(e, colKey)}
                    onDrop={(e) => handleDrop(e, colKey)}
                    onDragEnd={handleDragEnd}
                    onClick={() => isSortable && handleSort(col.sortField!)}
                    title={t('dragToReorder')}
                    className={`group py-3 px-3 sm:px-4 transition-all duration-150 cursor-grab active:cursor-grabbing ${col.minWidth || ''} ${
                      isTarget
                        ? 'border-l-4 border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                        : isDragged
                        ? 'opacity-40 bg-slate-200 dark:bg-slate-800'
                        : 'hover:bg-slate-200/60 dark:hover:bg-slate-900 hover:text-indigo-600 dark:hover:text-indigo-400'
                    }`}
                  >
                    <div
                      className={`flex items-center gap-1.5 ${
                        col.align === 'right'
                          ? 'justify-end'
                          : col.align === 'center'
                          ? 'justify-center'
                          : 'justify-start'
                      }`}
                    >
                      <GripVertical className="w-3 h-3 text-slate-400 dark:text-slate-500 opacity-40 group-hover:opacity-100 transition shrink-0" />
                      <span className="truncate">{t(col.labelKey) || col.defaultLabel}</span>
                      {isSortable && (
                        <span className="shrink-0">
                          {isCurrentSort ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3 h-3 text-indigo-500" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-indigo-500" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-30 group-hover:opacity-70 transition" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
            {filteredHoldings.length === 0 ? (
              <tr>
                <td colSpan={columnOrder.length} className="py-12 text-center text-slate-500 text-xs">
                  {t('noHoldings')}
                </td>
              </tr>
            ) : (
              filteredHoldings.map((h, i) => (
                <tr
                  key={`${h.proj_id}-${h.platform}-${i}`}
                  className="hover:bg-indigo-50/40 dark:hover:bg-slate-800/30 transition"
                >
                  {columnOrder.map((colKey) => renderCell(colKey, h, i))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
