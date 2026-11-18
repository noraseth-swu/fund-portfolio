import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  Trash2,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
  RefreshCw,
  AlertTriangle,
  X,
  FileSpreadsheet,
  Edit2,
  Calculator,
  TrendingUp,
  TrendingDown,
  Plus
} from 'lucide-react';
import { getTransactions, deleteTransaction, bulkDeleteTransactions, type Transaction } from '../lib/api';
import { PlatformBadge } from './PlatformBadge';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { TransactionModal } from './TransactionModal';

interface Props {
  initialFundFilter?: string | null;
  onBack: () => void;
  onDataChanged: () => void;
  refreshTrigger?: number;
  isPrivacyMode?: boolean;
}

type SortField = 'trans_date' | 'fund_abbr' | 'platform' | 'trans_type' | 'units' | 'unit_price' | 'total_amount' | 'fee';
type SortOrder = 'asc' | 'desc';

export const TransactionHistoryPage: React.FC<Props> = ({
  initialFundFilter,
  onBack,
  onDataChanged,
  refreshTrigger,
  isPrivacyMode = false,
}) => {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialFundFilter || '');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [deletingSingleId, setDeletingSingleId] = useState<string | null>(null);
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<Transaction | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('trans_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getTransactions();
      setTransactions(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [refreshTrigger]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'trans_date' || field === 'total_amount' ? 'desc' : 'asc');
    }
  };

  // Filter & Sort
  const filteredTransactions = useMemo(() => {
    return transactions.filter(item => {
      // Platform filter
      if (selectedPlatform !== 'ALL' && item.platform.toUpperCase() !== selectedPlatform.toUpperCase()) {
        return false;
      }
      // Type filter
      if (selectedType !== 'ALL' && item.trans_type.toUpperCase() !== selectedType.toUpperCase()) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const abbr = (item.fund_abbr || '').toLowerCase();
        const proj = (item.proj_id || '').toLowerCase();
        const note = (item.note || '').toLowerCase();
        return abbr.includes(q) || proj.includes(q) || note.includes(q);
      }
      return true;
    }).sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortField) {
        case 'trans_date':
          aVal = a.trans_date;
          bVal = b.trans_date;
          break;
        case 'fund_abbr':
          aVal = (a.fund_abbr || a.proj_id).toLowerCase();
          bVal = (b.fund_abbr || b.proj_id).toLowerCase();
          break;
        case 'platform':
          aVal = a.platform.toLowerCase();
          bVal = b.platform.toLowerCase();
          break;
        case 'trans_type':
          aVal = a.trans_type.toLowerCase();
          bVal = b.trans_type.toLowerCase();
          break;
        case 'units':
          aVal = parseFloat(a.units) || 0;
          bVal = parseFloat(b.units) || 0;
          break;
        case 'unit_price':
          aVal = parseFloat(a.unit_price) || 0;
          bVal = parseFloat(b.unit_price) || 0;
          break;
        case 'total_amount':
          aVal = parseFloat(a.total_amount) || 0;
          bVal = parseFloat(b.total_amount) || 0;
          break;
        case 'fee':
          aVal = parseFloat(a.fee) || 0;
          bVal = parseFloat(b.fee) || 0;
          break;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortOrder === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [transactions, selectedPlatform, selectedType, searchQuery, sortField, sortOrder]);

  // Edit Modal State
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const handleOpenEditModal = (tx: Transaction) => {
    setEditingTransaction(tx);
    setIsEditModalOpen(true);
  };

  // Real-Time Grand Total calculations from filteredTransactions
  const grandTotalStats = useMemo(() => {
    const totalCount = filteredTransactions.length;
    let totalBuy = 0;
    let totalSell = 0;
    let totalDividend = 0;
    let totalFee = 0;

    for (const it of filteredTransactions) {
      const amt = parseFloat(it.total_amount) || 0;
      const f = parseFloat(it.fee) || 0;
      totalFee += f;
      if (it.trans_type === 'BUY') {
        totalBuy += amt;
      } else if (it.trans_type === 'SELL') {
        totalSell += amt;
      } else if (it.trans_type === 'DIVIDEND' || it.trans_type === 'DIV') {
        totalDividend += amt;
      }
    }

    const netInvested = totalBuy - totalSell;
    return {
      totalCount,
      totalBuy,
      totalSell,
      totalDividend,
      totalFee,
      netInvested,
    };
  }, [filteredTransactions]);

  // Checkbox Selection
  const allFilteredSelected =
    filteredTransactions.length > 0 &&
    filteredTransactions.every(tx => selectedIds.has(tx.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set(selectedIds);
      filteredTransactions.forEach(tx => next.add(tx.id));
      setSelectedIds(next);
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeletingBulk(true);
    try {
      const idsArray = Array.from(selectedIds);
      const res = await bulkDeleteTransactions(idsArray);
      const msg = t('bulkDeleteSuccess', { n: res.deleted_count }) || (locale === 'th' ? `ลบรายการธุรกรรม ${res.deleted_count} รายการเรียบร้อยแล้ว` : `Successfully deleted ${res.deleted_count} transactions`);
      toast.success(msg);
      setSelectedIds(new Set());
      setShowConfirmModal(false);
      await loadData();
      onDataChanged();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || (locale === 'th' ? 'เกิดข้อผิดพลาดในการลบรายการ' : 'Failed to delete transactions'));
    } finally {
      setIsDeletingBulk(false);
    }
  };

  // Single Delete Confirmation
  const confirmSingleDelete = async () => {
    if (!singleDeleteTarget) return;
    const id = singleDeleteTarget.id;
    setDeletingSingleId(id);
    try {
      await deleteTransaction(id);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setSingleDeleteTarget(null);
      await loadData();
      onDataChanged();
      toast.success(locale === 'th' ? 'ลบรายการธุรกรรมเรียบร้อยแล้ว' : 'Transaction deleted successfully');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || (locale === 'th' ? 'เกิดข้อผิดพลาดในการลบรายการ' : 'Failed to delete transaction'));
    } finally {
      setDeletingSingleId(null);
    }
  };

  const totalFilteredAmount = useMemo(() => {
    return filteredTransactions.reduce((sum, tx) => sum + (parseFloat(tx.total_amount) || 0), 0);
  }, [filteredTransactions]);

  const selectedTotalAmount = useMemo(() => {
    return transactions
      .filter(tx => selectedIds.has(tx.id))
      .reduce((sum, tx) => sum + (parseFloat(tx.total_amount) || 0), 0);
  }, [transactions, selectedIds]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-40 inline-block ml-1" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 inline-block ml-1" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 inline-block ml-1" />
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Top Navigation & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer flex items-center gap-1.5 text-sm font-medium shadow-xs"
            title={t('backToDashboard')}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('backToDashboard')}</span>
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              <span>{t('navHistory')}</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {filteredTransactions.length} {locale === 'th' ? 'รายการที่แสดง' : 'records shown'} (
              {locale === 'th' ? 'ยอดรวม' : 'Total'}: {isPrivacyMode ? '******' : `${totalFilteredAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} THB`})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer flex items-center gap-1.5 text-sm font-semibold shadow-xs"
            title={t('addTransaction')}
          >
            <Plus className="w-4 h-4 text-white" />
            <span className="hidden sm:inline">{t('addTransaction')}</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer flex items-center gap-1.5 text-sm font-medium shadow-xs"
            title={t('refresh')}
          >
            <RefreshCw className={`w-4 h-4 text-indigo-600 dark:text-indigo-400 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('refresh')}</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {statusMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-sm font-medium shadow-sm animate-fade-in flex items-center justify-between">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Controls Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={locale === 'th' ? 'ค้นหาชื่อย่อกองทุน, รหัส หรือหมายเหตุ...' : 'Search fund code, proj_id or note...'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Platform Filter */}
          <div>
            <select
              value={selectedPlatform}
              onChange={e => setSelectedPlatform(e.target.value)}
              aria-label={t('platformHeader')}
              className="w-full py-2 px-3 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition cursor-pointer"
            >
              <option value="ALL">{locale === 'th' ? 'ทุกแพลตฟอร์ม (All Platforms)' : 'All Platforms'}</option>
              <option value="KBANK">KBank (Kasikorn)</option>
              <option value="SCB">SCB (InnovestX)</option>
              <option value="TTB">ttb (Smart Port)</option>
              <option value="DIME">Dime! (KKP)</option>
            </select>
          </div>

          {/* Trans Type Filter */}
          <div>
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              aria-label={t('transType')}
              className="w-full py-2 px-3 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition cursor-pointer"
            >
              <option value="ALL">{locale === 'th' ? 'ทุกประเภทธุรกรรม (All Types)' : 'All Types'}</option>
              <option value="BUY">ซื้อ (BUY)</option>
              <option value="SELL">ขายคืน (SELL)</option>
              <option value="DIVIDEND">เงินปันผล (DIVIDEND)</option>
            </select>
          </div>
        </div>

        {/* Active Filter Indicators */}
        {(searchQuery || selectedPlatform !== 'ALL' || selectedType !== 'ALL') && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">{locale === 'th' ? 'ตัวกรองที่ใช้งาน:' : 'Active filters:'}</span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                "{searchQuery}"
                <button onClick={() => setSearchQuery('')} className="hover:text-indigo-900 dark:hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedPlatform !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                Platform: {selectedPlatform}
                <button onClick={() => setSelectedPlatform('ALL')} className="hover:text-slate-900 dark:hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedType !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                Type: {selectedType}
                <button onClick={() => setSelectedType('ALL')} className="hover:text-slate-900 dark:hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedPlatform('ALL');
                setSelectedType('ALL');
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium ml-1"
            >
              {locale === 'th' ? 'ล้างตัวกรองทั้งหมด' : 'Reset all'}
            </button>
          </div>
        )}
      </div>

      {/* Floating / Sticky Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-4 z-20 bg-indigo-900 dark:bg-indigo-950 text-white rounded-2xl p-4 shadow-xl border border-indigo-700/60 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-600 font-bold text-xs">
              {selectedIds.size}
            </span>
            <div>
              <span className="font-semibold text-sm">
                {t('selectedCount', { n: selectedIds.size })}
              </span>
              <span className="text-xs text-indigo-200 ml-2">
                ({locale === 'th' ? 'ยอดเงินรวม' : 'Total'}: {isPrivacyMode ? '******' : `${selectedTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} THB`})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-indigo-200 hover:text-white hover:bg-indigo-800/60 transition cursor-pointer"
            >
              {locale === 'th' ? 'ยกเลิกการเลือก' : 'Deselect all'}
            </button>
            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={isDeletingBulk}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md transition cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('bulkDelete')} ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Transactions Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold text-[11px] uppercase tracking-wider select-none">
              <tr>
                <th className="py-3.5 px-4 w-10 text-center">
                  <button
                    onClick={toggleSelectAll}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer text-slate-600 dark:text-slate-300"
                    title={allFilteredSelected ? 'Deselect All' : 'Select All'}
                  >
                    {allFilteredSelected ? (
                      <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </th>
                <th
                  onClick={() => handleSort('trans_date')}
                  className="py-3.5 px-4 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                >
                  <span className="inline-flex items-center">
                    {t('transDate')} {renderSortIcon('trans_date')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('fund_abbr')}
                  className="py-3.5 px-4 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                >
                  <span className="inline-flex items-center">
                    {t('fundHeader')} {renderSortIcon('fund_abbr')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('platform')}
                  className="py-3.5 px-4 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                >
                  <span className="inline-flex items-center">
                    {t('platformHeader')} {renderSortIcon('platform')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('trans_type')}
                  className="py-3.5 px-4 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                >
                  <span className="inline-flex items-center">
                    {t('transType')} {renderSortIcon('trans_type')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('units')}
                  className="py-3.5 px-4 text-right cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    {t('unitsHeader')} {renderSortIcon('units')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('unit_price')}
                  className="py-3.5 px-4 text-right cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    {t('navOnEffective')} {renderSortIcon('unit_price')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('total_amount')}
                  className="py-3.5 px-4 text-right cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    {t('totalAmount')} {renderSortIcon('total_amount')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('fee')}
                  className="py-3.5 px-4 text-right cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition hidden md:table-cell"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    {t('feeThb')} {renderSortIcon('fee')}
                  </span>
                </th>
                <th className="py-3.5 px-4 text-center w-16">{t('actionManage')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    <span>{t('loading')}</span>
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-slate-400">
                    <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
                    <p className="font-medium text-slate-600 dark:text-slate-400">{t('noHistory')}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      {searchQuery || selectedPlatform !== 'ALL' || selectedType !== 'ALL'
                        ? locale === 'th' ? 'ลองปรับตัวกรองหรือล้างคำค้นหา' : 'Try adjusting your filters or search query'
                        : ''}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(item => {
                  const isSelected = selectedIds.has(item.id);
                  const isBuy = item.trans_type.toUpperCase() === 'BUY';
                  const isSell = item.trans_type.toUpperCase() === 'SELL';
                  const isStock = item.id.startsWith('tx_stk_') || (item.platform?.toUpperCase() === 'DIME' && !item.proj_id?.startsWith('M'));

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-indigo-50/40 dark:hover:bg-slate-800/40 transition ${
                        isSelected ? 'bg-indigo-50/70 dark:bg-indigo-950/40' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => toggleSelectRow(item.id)}
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300 text-xs">
                        {item.trans_date}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(item)}
                            className="font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline font-mono text-left cursor-pointer transition flex items-center gap-1.5 group"
                            title={locale === 'th' ? 'กดเพื่อแก้ไขรายละเอียดรายการ' : 'Click to edit transaction'}
                          >
                            <span>{item.fund_abbr || item.proj_id}</span>
                            <Edit2 className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity text-slate-400 group-hover:text-indigo-500" />
                          </button>
                          {isStock && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
                              Stock
                            </span>
                          )}
                        </div>
                        {item.note && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate max-w-xs" title={item.note}>
                            {item.note}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <PlatformBadge platform={item.platform} />
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            isBuy
                              ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                              : isSell
                              ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                              : 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-800'
                          }`}
                        >
                          {item.trans_type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                        {isPrivacyMode ? '******' : parseFloat(item.units).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                        {isStock ? `$${parseFloat(item.unit_price).toFixed(2)}` : parseFloat(item.unit_price).toFixed(4)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {isPrivacyMode ? (
                          '******'
                        ) : (
                          <>
                            {parseFloat(item.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {isStock && <span className="text-[10px] text-slate-400 font-normal ml-1">THB</span>}
                          </>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-500 text-xs hidden md:table-cell">
                        {isPrivacyMode ? '******' : parseFloat(item.fee) > 0 ? parseFloat(item.fee).toFixed(2) : '-'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => setSingleDeleteTarget(item)}
                          disabled={deletingSingleId === item.id}
                          className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          title={t('actionDelete')}
                        >
                          {deletingSingleId === item.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-500" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredTransactions.length > 0 && (
              <tfoot className="bg-slate-100/90 dark:bg-slate-800/90 border-t-2 border-slate-300 dark:border-slate-700 font-bold text-xs sticky bottom-0 z-10 backdrop-blur-xs">
                <tr>
                  <td colSpan={5} className="py-3 px-4 text-slate-800 dark:text-slate-100">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-indigo-500" />
                      <span>{locale === 'th' ? `รวมจากรายการที่แสดง (${grandTotalStats.totalCount} รายการ)` : `Total from displayed rows (${grandTotalStats.totalCount} items)`}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-500 dark:text-slate-400">-</td>
                  <td className="py-3 px-4 text-right font-mono text-slate-500 dark:text-slate-400">-</td>
                  <td className="py-3 px-4 text-right font-mono text-sm text-slate-900 dark:text-white">
                    {isPrivacyMode ? '******' : `฿${grandTotalStats.netInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 dark:text-slate-300 hidden md:table-cell">
                    {isPrivacyMode ? '******' : `฿${grandTotalStats.totalFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </td>
                  <td className="py-3 px-4"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Real-Time Grand Total Summary Bar */}
      {filteredTransactions.length > 0 && (
        <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm mt-4">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {locale === 'th' ? 'สรุปยอดรวมคำนวณแบบ Real-Time (Grand Total)' : 'Real-Time Summary (Grand Total)'}
              </h3>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {locale === 'th' ? `คำนวณจาก ${grandTotalStats.totalCount} รายการที่กรองอยู่` : `Calculated from ${grandTotalStats.totalCount} filtered rows`}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Total Items */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                {locale === 'th' ? 'จำนวนรายการ' : 'Total Records'}
              </div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                {grandTotalStats.totalCount.toLocaleString()} <span className="text-xs font-normal text-slate-500">{locale === 'th' ? 'รายการ' : 'items'}</span>
              </div>
            </div>

            {/* Total Buy */}
            <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                <span>{locale === 'th' ? 'ยอดซื้อรวม' : 'Total Buy'}</span>
              </div>
              <div className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400">
                {isPrivacyMode ? '******' : `฿${grandTotalStats.totalBuy.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>

            {/* Total Sell */}
            <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
              <div className="text-[11px] text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" />
                <span>{locale === 'th' ? 'ยอดขายรวม' : 'Total Sell'}</span>
              </div>
              <div className="text-lg font-bold font-mono text-amber-700 dark:text-amber-400">
                {isPrivacyMode ? '******' : `฿${grandTotalStats.totalSell.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>

            {/* Net Amount */}
            <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50">
              <div className="text-[11px] text-indigo-700 dark:text-indigo-400 mb-1">
                {locale === 'th' ? 'ยอดเงินลงทุนสุทธิ' : 'Net Invested'}
              </div>
              <div className="text-lg font-bold font-mono text-indigo-700 dark:text-indigo-400">
                {isPrivacyMode ? '******' : `฿${grandTotalStats.netInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>

            {/* Total Fee */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 col-span-2 sm:col-span-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                {locale === 'th' ? 'ค่าธรรมเนียมรวม' : 'Total Fees'}
              </div>
              <div className="text-lg font-bold font-mono text-slate-700 dark:text-slate-300">
                {isPrivacyMode ? '******' : `฿${grandTotalStats.totalFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Transaction Modal directly from History Page */}
      {isAddModalOpen && (
        <TransactionModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={(payload?: any) => {
            loadData();
            onDataChanged();
            const msg = payload?.message || (locale === 'th' ? 'บันทึกรายการธุรกรรมเรียบร้อยแล้ว' : 'Transaction recorded successfully');
            toast.success(msg);
          }}
        />
      )}

      {/* Edit Transaction Modal */}
      {isEditModalOpen && (
        <TransactionModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingTransaction(null);
          }}
          onSuccess={(payload?: any) => {
            loadData();
            onDataChanged();
            const msg = payload?.message || (locale === 'th' ? 'อัพเดตรายการธุรกรรมเรียบร้อยแล้ว' : 'Transaction updated successfully');
            toast.success(msg);
          }}
          editTransaction={editingTransaction}
        />
      )}

      {/* Confirmation Modal for Single Delete */}
      {singleDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {locale === 'th' ? 'ยืนยันการลบรายการธุรกรรม' : 'Confirm Transaction Deletion'}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  {locale === 'th'
                    ? 'คุณต้องการลบรายการธุรกรรมนี้ออกจากระบบใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้'
                    : 'Are you sure you want to delete this transaction? This action cannot be undone.'}
                </p>
                <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{locale === 'th' ? 'กองทุน:' : 'Fund:'}</span>
                    <span className="font-bold text-slate-900 dark:text-white">{singleDeleteTarget.fund_abbr || singleDeleteTarget.proj_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{locale === 'th' ? 'วันที่:' : 'Date:'}</span>
                    <span className="font-mono text-slate-900 dark:text-white">{singleDeleteTarget.trans_date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{locale === 'th' ? 'จำนวนหน่วย:' : 'Units:'}</span>
                    <span className="font-mono text-slate-900 dark:text-white">{parseFloat(singleDeleteTarget.units).toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{locale === 'th' ? 'มูลค่ารวม:' : 'Total Amount:'}</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{parseFloat(singleDeleteTarget.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} THB</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setSingleDeleteTarget(null)}
                disabled={Boolean(deletingSingleId)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                {t('btnCancel')}
              </button>
              <button
                type="button"
                onClick={confirmSingleDelete}
                disabled={Boolean(deletingSingleId)}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {deletingSingleId ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{locale === 'th' ? 'กำลังลบ...' : 'Deleting...'}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>{t('actionDelete')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Bulk Delete */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {locale === 'th' ? 'ยืนยันการลบรายการที่เลือก' : 'Confirm Bulk Deletion'}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  {t('confirmBulkDelete', { n: selectedIds.size })}
                </p>
                <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between py-1">
                    <span>{locale === 'th' ? 'จำนวนรายการ:' : 'Total Items:'}</span>
                    <span className="font-bold text-slate-900 dark:text-white">{selectedIds.size}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>{locale === 'th' ? 'ยอดเงินรวม:' : 'Total Value:'}</span>
                    <span className="font-bold text-slate-900 dark:text-white">{selectedTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} THB</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isDeletingBulk}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                {t('btnCancel')}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isDeletingBulk}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                {isDeletingBulk ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{locale === 'th' ? 'กำลังลบ...' : 'Deleting...'}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>{t('actionDelete')} ({selectedIds.size})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
