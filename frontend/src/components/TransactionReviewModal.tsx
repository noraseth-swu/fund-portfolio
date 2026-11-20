import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  Trash2,
  Plus,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckSquare,
  Building2,
  Layers,
} from 'lucide-react';
import {
  getPendingTransactions,
  updatePendingTransaction,
  deletePendingTransaction,
  batchDeletePending,
  commitPendingTransactions,
  createPendingTransaction,
  getNavByDate,
  searchFunds,
  type PendingTransaction,
} from '../lib/api';
import { FundSearchCombobox } from './FundSearchCombobox';
import { NavDatePicker } from './NavDatePicker';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialPlatform?: string;
}

const PLATFORMS_LIST = [
  { key: 'TTB', label: 'ttb' },
  { key: 'DIME', label: 'Dime!' },
  { key: 'SCB', label: 'SCB' },
  { key: 'KBANK', label: 'KBank' },
  { key: 'KBANK_PVD', label: 'KBank (PVD)' },
];

export const TransactionReviewModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  initialPlatform = 'ALL',
}) => {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<PendingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<{ type: 'commit_all' | 'delete_selected'; count: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedPlatform, setSelectedPlatform] = useState<string>(initialPlatform);
  const [activeTab, setActiveTab] = useState<'ALL' | 'EXACT' | 'FUZZY' | 'NONE'>('ALL');
  const [filterText, setFilterText] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Discovered share classes for proj_id: Record<proj_id, class[]>
  const [projClasses, setProjClasses] = useState<Record<string, string[]>>({});
  // Share class NAV on transaction date: Record<`${itemId}_${class}`, navStr>
  const [classNavs, setClassNavs] = useState<Record<string, string>>({});

  const getCandidateClassesForItem = (it: PendingTransaction): string[] => {
    const set = new Set<string>();

    if (it.candidate_classes && Array.isArray(it.candidate_classes)) {
      it.candidate_classes.forEach((c) => {
        const name = typeof c === 'string' ? c : (c as any).fund_abbr;
        if (name) set.add(name);
      });
    }

    if (it.suggestions && it.suggestions.length > 1) {
      it.suggestions.forEach((s) => {
        if (s.fund_abbr) set.add(s.fund_abbr);
      });
    }

    if (it.proj_id && projClasses[it.proj_id]) {
      projClasses[it.proj_id].forEach((c) => set.add(c));
    }

    if (set.size > 0 && it.fund_abbr) {
      set.add(it.fund_abbr);
    }

    return Array.from(set);
  };

  // Auto-discover candidate classes for items with proj_id
  useEffect(() => {
    if (!isOpen || items.length === 0) return;

    items.forEach(async (it) => {
      const explicitClasses = it.candidate_classes || [];
      const suggestionClasses =
        it.suggestions && it.suggestions.length > 1
          ? it.suggestions.map((s) => s.fund_abbr).filter(Boolean)
          : [];

      if (
        explicitClasses.length === 0 &&
        suggestionClasses.length === 0 &&
        it.proj_id &&
        !projClasses[it.proj_id]
      ) {
        try {
          const baseName = (it.fund_abbr || it.raw_fund_name || '')
            .replace(
              /[-_ ]?(A|D|E|SSF|SSFA|SSF-A|RMF|P|I|X|UH-E|UH-M|UH-SSF|RP|RI|S|\(A\)|\(D\)|\(E\)|\(SSF\)|\(SSFA\)|\(RMF\))$/i,
              ''
            )
            .trim();

          const results = await searchFunds(baseName || it.fund_abbr || it.proj_id);
          const matching = results.filter(
            (r) =>
              r.proj_id === it.proj_id ||
              (baseName &&
                (r.proj_abbr_name || '').toUpperCase().includes(baseName.toUpperCase()))
          );
          const classes = Array.from(
            new Set(matching.map((r) => r.proj_abbr_name || r.proj_id).filter(Boolean))
          );
          if (classes.length > 1) {
            setProjClasses((prev) => ({ ...prev, [it.proj_id!]: classes }));
          }
        } catch {
          // Ignore search error in test/offline environments
        }
      }
    });
  }, [isOpen, items, projClasses]);

  // Fetch NAV on transaction date for candidate classes
  useEffect(() => {
    if (!isOpen || items.length === 0) return;

    items.forEach((it) => {
      const classes = getCandidateClassesForItem(it);
      if (classes.length <= 1) return;

      classes.forEach(async (cls) => {
        const key = `${it.id}_${cls}`;
        if (cls === it.fund_abbr && it.unit_price && parseFloat(it.unit_price) > 0) {
          if (!classNavs[key]) {
            setClassNavs((prev) => ({ ...prev, [key]: it.unit_price }));
          }
          return;
        }

        if (classNavs[key]) return;

        if (it.proj_id) {
          try {
            const navRes = await getNavByDate(it.proj_id, it.trans_date, cls);
            if (navRes && navRes.nav) {
              setClassNavs((prev) => ({ ...prev, [key]: navRes.nav }));
            }
          } catch {
            // Safe ignore
          }
        }
      });
    });
  }, [isOpen, items, projClasses, classNavs]);

  // Handle switching class with 1 click
  const handleClassSwitch = async (id: string, newClass: string, nav?: string) => {
    const target = items.find((i) => i.id === id);
    if (!target) return;

    let unitPrice = nav;
    let navSource = target.nav_source || 'SEC_HISTORY';

    if (!unitPrice && target.proj_id) {
      try {
        const navRes = await getNavByDate(target.proj_id, target.trans_date, newClass);
        if (navRes && navRes.nav) {
          unitPrice = navRes.nav;
          navSource = navRes.nav_source || 'SEC_HISTORY';
        }
      } catch {
        unitPrice = target.unit_price;
      }
    }

    const p = parseFloat(unitPrice || target.unit_price) || 0;
    const existingAmount = parseFloat(target.total_amount) || 0;
    let u = parseFloat(target.units) || 0;
    let totalAmount = target.total_amount;

    if (existingAmount > 0 && p > 0) {
      // Golden Rule: Preserve settled cash amount, adjust units
      u = parseFloat((existingAmount / p).toFixed(4));
      totalAmount = existingAmount.toFixed(2);
    } else if (u > 0 && p > 0) {
      totalAmount = (u * p).toFixed(2);
    }

    const patch: Partial<PendingTransaction> = {
      fund_abbr: newClass,
      unit_price: unitPrice || target.unit_price,
      units: u > 0 ? u.toFixed(4) : target.units,
      total_amount: totalAmount,
      nav_source: navSource,
    };

    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );

    if (unitPrice) {
      setClassNavs((prev) => ({ ...prev, [`${id}_${newClass}`]: unitPrice! }));
    }

    try {
      await updatePendingTransaction(id, patch);
    } catch (err) {
      console.error('Failed to update share class:', err);
    }
  };

  // Sync initial platform when opened
  useEffect(() => {
    if (isOpen) {
      setSelectedPlatform(initialPlatform || 'ALL');
    }
  }, [isOpen, initialPlatform]);

  // New row form state
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newRow, setNewRow] = useState({
    platform: 'KBANK',
    raw_fund_name: '',
    proj_id: '',
    fund_abbr: '',
    trans_type: 'BUY',
    trans_date: new Date().toISOString().split('T')[0],
    units: '',
    unit_price: '',
    total_amount: '',
    fee: '0.00',
    note: '',
  });

  const loadPending = async () => {
    setLoading(true);
    try {
      const data = await getPendingTransactions('PENDING');
      setItems(data);
      // Select all by default
      setSelectedIds(new Set(data.map((d) => d.id)));
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err?.message || 'Failed to load pending transactions' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPending();
      setMessage(null);
    }
  }, [isOpen]);

  // Stats by Platform
  const platformStats = useMemo(() => {
    const map: Record<string, { key: string; label: string; count: number; totalAmount: number }> = {
      TTB: { key: 'TTB', label: 'ttb', count: 0, totalAmount: 0 },
      DIME: { key: 'DIME', label: 'Dime!', count: 0, totalAmount: 0 },
      SCB: { key: 'SCB', label: 'SCB', count: 0, totalAmount: 0 },
      KBANK: { key: 'KBANK', label: 'KBank', count: 0, totalAmount: 0 },
      KBANK_PVD: { key: 'KBANK_PVD', label: 'KBank (PVD)', count: 0, totalAmount: 0 },
    };

    items.forEach((it) => {
      const p = (it.platform || 'OTHER').toUpperCase();
      if (!map[p]) {
        map[p] = { key: p, label: it.platform, count: 0, totalAmount: 0 };
      }
      map[p].count += 1;
      map[p].totalAmount += parseFloat(it.total_amount) || 0;
    });

    return map;
  }, [items]);

  // Counts by confidence (within current platform if filtered, or across all)
  const counts = useMemo(() => {
    const baseItems =
      selectedPlatform === 'ALL'
        ? items
        : items.filter((it) => (it.platform || '').toUpperCase() === selectedPlatform);

    const c = { ALL: baseItems.length, EXACT: 0, FUZZY: 0, NONE: 0 };
    baseItems.forEach((it) => {
      if (it.match_confidence === 'EXACT') c.EXACT++;
      else if (it.match_confidence === 'FUZZY') c.FUZZY++;
      else c.NONE++;
    });
    return c;
  }, [items, selectedPlatform]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (selectedPlatform !== 'ALL') {
        const p = (it.platform || '').toUpperCase();
        if (p !== selectedPlatform) return false;
      }
      if (activeTab !== 'ALL' && it.match_confidence !== activeTab) return false;
      if (filterText.trim()) {
        const q = filterText.toLowerCase();
        const matchName = (it.fund_abbr || it.raw_fund_name).toLowerCase().includes(q);
        const matchFile = (it.source_file || '').toLowerCase().includes(q);
        const matchPlatform = it.platform.toLowerCase().includes(q);
        if (!matchName && !matchFile && !matchPlatform) return false;
      }
      return true;
    });
  }, [items, selectedPlatform, activeTab, filterText]);

  // Selected items in current platform
  const selectedInCurrentPlatform = useMemo(() => {
    return filteredItems.filter((it) => selectedIds.has(it.id));
  }, [filteredItems, selectedIds]);

  const getPlatformBadge = (platform: string) => {
    switch ((platform || '').toUpperCase()) {
      case 'TTB':
        return 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800';
      case 'DIME':
        return 'bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-800';
      case 'SCB':
        return 'bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800';
      case 'KBANK':
        return 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800';
      case 'KBANK_PVD':
        return 'bg-teal-100 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-800';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700';
    }
  };

  const getBankTabStyle = (key: string, isSelected: boolean) => {
    if (!isSelected) {
      return 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500';
    }
    switch (key.toUpperCase()) {
      case 'TTB':
        return 'bg-blue-600 text-white border-blue-600 shadow-sm';
      case 'DIME':
        return 'bg-violet-600 text-white border-violet-600 shadow-sm';
      case 'SCB':
        return 'bg-purple-600 text-white border-purple-600 shadow-sm';
      case 'KBANK':
        return 'bg-emerald-600 text-white border-emerald-600 shadow-sm';
      case 'KBANK_PVD':
        return 'bg-teal-600 text-white border-teal-600 shadow-sm';
      default:
        return 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 shadow-sm';
    }
  };

  // Selection handlers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    const next = new Set(selectedIds);
    filteredItems.forEach((it) => next.add(it.id));
    setSelectedIds(next);
  };

  const deselectAllFiltered = () => {
    const next = new Set(selectedIds);
    filteredItems.forEach((it) => next.delete(it.id));
    setSelectedIds(next);
  };

  // Inline field updates
  const handleFieldChange = async (id: string, field: string, val: any) => {
    const target = items.find((i) => i.id === id);
    if (!target) return;

    let patch: any = { [field]: val };

    // Auto-recalculate total_amount or units
    if (field === 'units' || field === 'unit_price') {
      const u = parseFloat(field === 'units' ? val : target.units) || 0;
      const p = parseFloat(field === 'unit_price' ? val : target.unit_price) || 0;
      patch.total_amount = (u * p).toFixed(2);
    } else if (field === 'total_amount') {
      const tot = parseFloat(val) || 0;
      const p = parseFloat(target.unit_price) || 0;
      if (p > 0) {
        patch.units = (tot / p).toFixed(4);
      }
    }

    // Local update immediately for snappy UI
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
    );

    // Save to server
    try {
      await updatePendingTransaction(id, patch);
    } catch (err) {
      console.error('Failed to patch pending tx:', err);
    }
  };

  // Fund search selection per row
  const handleFundSelect = async (
    id: string,
    fund: { proj_id: string; fund_abbr: string; fund_name_th?: string; fund_name_en?: string; last_nav?: string }
  ) => {
    const target = items.find((i) => i.id === id);
    if (!target) return;

    let newPrice = target.unit_price;
    let navSource = 'SEC_LATEST';

    // Try fetching NAV on transaction date from SEC history
    try {
      const navRes = await getNavByDate(fund.proj_id, target.trans_date);
      if (navRes && navRes.nav) {
        newPrice = navRes.nav;
        navSource = navRes.nav_source;
      }
    } catch {
      // fallback to fund's last_nav if available
      if (fund.last_nav && (!newPrice || parseFloat(newPrice) <= 0)) {
        newPrice = fund.last_nav;
      }
    }

    const u = parseFloat(target.units) || 0;
    const p = parseFloat(newPrice) || 0;
    const existingAmount = parseFloat(target.total_amount) || 0;
    // Golden Rule: If total_amount was already parsed from bank statement/email (e.g. 50,000.00 or 5,000.00),
    // PRESERVE it! Never overwrite actual settled cash amounts with theoretical NAV multiplications.
    const totalAmount = existingAmount > 0 ? existingAmount.toFixed(2) : (u * p).toFixed(2);
    const fee = target.fee ? parseFloat(target.fee).toFixed(2) : '0.00';
    const unitPrice = (existingAmount > 0 && u > 0 && (!p || p <= 0))
      ? (existingAmount / u).toFixed(4)
      : newPrice;

    const patch = {
      proj_id: fund.proj_id,
      fund_abbr: fund.fund_abbr,
      fund_name_th: fund.fund_name_th,
      fund_name_en: fund.fund_name_en,
      match_confidence: 'EXACT' as const,
      unit_price: unitPrice,
      nav_source: navSource,
      total_amount: totalAmount,
      fee: fee,
    };

    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
    );

    try {
      await updatePendingTransaction(id, patch);
    } catch (err) {
      console.error(err);
    }
  };

  // Delete single row
  const handleDeleteRow = async (id: string) => {
    try {
      await deletePendingTransaction(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.info(locale === 'th' ? 'ลบรายการรอตรวจสอบเรียบร้อยแล้ว' : 'Removed pending item');
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Delete failed' });
      toast.error(err?.message || 'Delete failed');
    }
  };

  // Delete selected rows
  const executeDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setSubmitting(true);
    try {
      const count = selectedIds.size;
      await batchDeletePending(Array.from(selectedIds));
      setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
      setSelectedIds(new Set());
      setConfirmAction(null);
      const msg = locale === 'th' ? `ลบรายการรอตรวจสอบ ${count} รายการเรียบร้อยแล้ว` : `Deleted ${count} pending items`;
      setMessage({ type: 'success', text: msg });
      toast.info(msg);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to delete' });
      toast.error(err?.message || 'Failed to delete');
    } finally {
      setSubmitting(false);
    }
  };

  // Commit specific IDs
  const handleCommitIds = async (idsToCommit: string[]) => {
    if (idsToCommit.length === 0) return;

    setSubmitting(true);
    try {
      const res = await commitPendingTransactions({ ids: idsToCommit });
      const msg = locale === 'th' ? `นำเข้า ${res.count} รายการเข้าสู่พอร์ตสำเร็จ!` : `Committed ${res.count} transactions successfully!`;
      setMessage({ type: 'success', text: msg });
      toast.success(msg);
      const committedSet = new Set(idsToCommit);
      setItems((prev) => prev.filter((i) => !committedSet.has(i.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        idsToCommit.forEach((id) => next.delete(id));
        return next;
      });
      onSuccess();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Commit failed' });
      toast.error(err?.message || 'Commit failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Commit selected
  const handleCommitSelected = async () => {
    await handleCommitIds(Array.from(selectedIds));
  };

  // Commit all
  const executeCommitAll = async () => {
    if (items.length === 0) return;

    setSubmitting(true);
    try {
      const res = await commitPendingTransactions({ all: true });
      const msg = locale === 'th' ? `นำเข้าข้อมูลทั้งหมด (${res.count} รายการ) เข้าสู่พอร์ตสำเร็จ!` : `Committed all ${res.count} transactions successfully!`;
      setMessage({ type: 'success', text: msg });
      toast.success(msg);
      setItems([]);
      setSelectedIds(new Set());
      setConfirmAction(null);
      onSuccess();
      setTimeout(() => onClose(), 800);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Commit all failed' });
      toast.error(err?.message || 'Commit all failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Add manual row
  const handleAddNewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRow.raw_fund_name.trim()) return;

    setSubmitting(true);
    try {
      await createPendingTransaction({
        platform: newRow.platform,
        raw_fund_name: newRow.raw_fund_name,
        proj_id: newRow.proj_id || undefined,
        fund_abbr: newRow.fund_abbr || newRow.raw_fund_name,
        trans_type: newRow.trans_type,
        trans_date: newRow.trans_date,
        units: newRow.units || '0',
        unit_price: newRow.unit_price || '0',
        total_amount: newRow.total_amount || undefined,
        fee: newRow.fee || '0.00',
        note: newRow.note || 'Manual pending entry',
      });
      setIsAddingNew(false);
      setNewRow({
        platform: 'KBANK',
        raw_fund_name: '',
        proj_id: '',
        fund_abbr: '',
        trans_type: 'BUY',
        trans_date: new Date().toISOString().split('T')[0],
        units: '',
        unit_price: '',
        total_amount: '',
        fee: '0.00',
        note: '',
      });
      await loadPending();
      setMessage({ type: 'success', text: 'เพิ่มรายการใหม่ลงในรายการรอตรวจสอบแล้ว' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to add manual item' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-[96vw] 2xl:max-w-[1600px] max-h-[94vh] flex flex-col shadow-2xl">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-50/50 via-white to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {t('stagedImportTitle')}
                <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-full">
                  Staged Import ({items.length} {locale === 'th' ? 'รายการ' : 'items'})
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('stagedImportDesc')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bank / Platform Filter Bar */}
        <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mr-1">
              <Building2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>{t('filterByBank')}:</span>
            </span>

            {/* All Banks Button */}
            <button
              type="button"
              onClick={() => setSelectedPlatform('ALL')}
              className={`px-3 py-1 text-xs rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                getBankTabStyle('ALL', selectedPlatform === 'ALL')
              }`}
            >
              <span>{t('allBanks')}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  selectedPlatform === 'ALL'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {items.length}
              </span>
            </button>

            {/* Individual Platforms */}
            {PLATFORMS_LIST.map((p) => {
              const stat = platformStats[p.key];
              const count = stat ? stat.count : 0;
              const isSelected = selectedPlatform === p.key;

              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setSelectedPlatform(p.key)}
                  className={`px-3 py-1 text-xs rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    getBankTabStyle(p.key, isSelected)
                  }`}
                >
                  <span>{p.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : count > 0
                        ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Bank Selection / Deselection and Total Amount */}
          <div className="flex items-center gap-2.5 text-xs">
            {selectedPlatform !== 'ALL' && (
              <span className="text-slate-500 dark:text-slate-400">
                ยอดรวม {platformStats[selectedPlatform]?.label || selectedPlatform}:{' '}
                <b className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">
                  ฿{(platformStats[selectedPlatform]?.totalAmount || 0).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </b>
              </span>
            )}

            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={selectAllFiltered}
                className="px-2.5 py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-md transition cursor-pointer"
                title="เลือกทุกรายการที่แสดงตามตัวกรองนี้"
              >
                {selectedPlatform === 'ALL'
                  ? 'เลือกทั้งหมด'
                  : `เลือกทั้งหมดของ ${platformStats[selectedPlatform]?.label || selectedPlatform}`}
              </button>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <button
                type="button"
                onClick={deselectAllFiltered}
                className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition cursor-pointer"
                title="ยกเลิกการเลือกในกลุ่มนี้"
              >
                ยกเลิกเลือก
              </button>
            </div>
          </div>
        </div>

        {/* Action & Filter Bar */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
          {/* Tabs: ALL / EXACT / FUZZY / NONE */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ทั้งหมด ({counts.ALL})
            </button>
            <button
              onClick={() => setActiveTab('EXACT')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                activeTab === 'EXACT'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              ตรงเป๊ะ ({counts.EXACT})
            </button>
            <button
              onClick={() => setActiveTab('FUZZY')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                activeTab === 'FUZZY'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-amber-600'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              ใกล้เคียง ({counts.FUZZY})
            </button>
            <button
              onClick={() => setActiveTab('NONE')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                activeTab === 'NONE'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-rose-600'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              ต้องเลือกเอง ({counts.NONE})
            </button>
          </div>

          {/* Quick Search in Pending */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="กรองชื่อกองทุน/ไฟล์..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1.5 focus:ring-indigo-500 w-48 font-medium"
              />
            </div>

            <button
              onClick={() => setIsAddingNew(!isAddingNew)}
              className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-indigo-400 text-slate-700 dark:text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-600" />
              เพิ่มแถว
            </button>

            <button
              onClick={loadPending}
              disabled={loading}
              className="p-1.5 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="รีเฟรชรายการ"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Optional Manual Add Row Form */}
        {isAddingNew && (
          <form
            onSubmit={handleAddNewSubmit}
            className="px-6 py-3 bg-indigo-50/50 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/50 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 items-end animate-in fade-in"
          >
            <div>
              <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 uppercase">วันที่</label>
              <input
                type="date"
                required
                value={newRow.trans_date}
                onChange={(e) => setNewRow({ ...newRow, trans_date: e.target.value })}
                className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 uppercase">แพลตฟอร์ม</label>
              <select
                value={newRow.platform}
                onChange={(e) => setNewRow({ ...newRow, platform: e.target.value })}
                className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-800 dark:text-slate-100 font-medium"
              >
                <option value="KBANK">KBANK</option>
                <option value="TTB">TTB</option>
                <option value="DIME">DIME</option>
                <option value="SCB">SCB</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 uppercase">ประเภท</label>
              <select
                value={newRow.trans_type}
                onChange={(e) => setNewRow({ ...newRow, trans_type: e.target.value })}
                className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-800 dark:text-slate-100 font-medium"
              >
                <option value="BUY">ซื้อ (BUY)</option>
                <option value="SELL">ขาย (SELL)</option>
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 uppercase">ค้นหากองทุน (SEC)</label>
              <FundSearchCombobox
                value={newRow.fund_abbr || newRow.raw_fund_name}
                projId={newRow.proj_id}
                onChange={(f) => {
                  setNewRow((prev) => ({
                    ...prev,
                    proj_id: f.proj_id,
                    fund_abbr: f.fund_abbr,
                    raw_fund_name: f.fund_abbr,
                    unit_price: f.last_nav || prev.unit_price,
                  }));
                }}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 uppercase">NAV / ราคา</label>
              <input
                type="number"
                step="0.0001"
                placeholder="0.0000"
                value={newRow.unit_price}
                onChange={(e) => {
                  const p = e.target.value;
                  const u = parseFloat(newRow.units) || 0;
                  const tot = u * (parseFloat(p) || 0);
                  setNewRow({ ...newRow, unit_price: p, total_amount: tot > 0 ? tot.toFixed(2) : newRow.total_amount });
                }}
                className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-800 dark:text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 uppercase">ยอดเงิน (THB)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={newRow.total_amount}
                onChange={(e) => {
                  const tot = e.target.value;
                  const p = parseFloat(newRow.unit_price) || 0;
                  const u = p > 0 ? ((parseFloat(tot) || 0) / p).toFixed(4) : newRow.units;
                  setNewRow({ ...newRow, total_amount: tot, units: u });
                }}
                className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-800 dark:text-slate-100 font-mono"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold shadow-sm transition-colors"
              >
                บันทึก
              </button>
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded border border-slate-300 dark:border-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}

        {/* Notification Toast */}
        {message && (
          <div
            className={`px-6 py-2.5 text-xs font-medium flex items-center justify-between ${
              message.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-b border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-b border-rose-200 dark:border-rose-800'
            }`}
          >
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-current opacity-70 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Table Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <p className="text-xs">กำลังโหลดรายการรอตรวจสอบ...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                ไม่มีรายการค้างรอตรวจสอบ
              </p>
              <p className="text-xs text-slate-400">
                ข้อมูลทุกรายการได้รับการยืนยันเข้าพอร์ตเรียบร้อยแล้ว
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl min-h-[380px] pb-32 overflow-x-auto shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={filteredItems.length > 0 && filteredItems.every((it) => selectedIds.has(it.id))}
                        onChange={(e) => (e.target.checked ? selectAllFiltered() : deselectAllFiltered())}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </th>
                    <th className="p-3 w-36 min-w-[145px]">วันที่</th>
                    <th className="p-3 w-24">Platform</th>
                    <th className="p-3 w-20">ประเภท</th>
                    <th className="p-3 min-w-[340px] xl:min-w-[400px]">ชื่อกองทุนต้นฉบับ & การจับคู่ SEC</th>
                    <th className="p-3 w-28 text-right">จำนวนหน่วย</th>
                    <th className="p-3 w-28 text-right">NAV / หน่วย</th>
                    <th className="p-3 w-28 text-right">ยอดเงินรวม (THB)</th>
                    <th className="p-3 w-28">แหล่งที่มา</th>
                    <th className="p-3 w-16 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredItems.map((it) => {
                    const isSelected = selectedIds.has(it.id);
                    return (
                      <tr
                        key={it.id}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                          isSelected ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(it.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>

                        {/* Date with NAV Trading Days Highlight */}
                        <td className="p-2 min-w-[145px]">
                          <NavDatePicker
                            value={it.trans_date}
                            projId={it.proj_id}
                            fundAbbr={it.fund_abbr}
                            onChange={(newDate, nav) => {
                              handleFieldChange(it.id, 'trans_date', newDate);
                              if (nav) {
                                handleFieldChange(it.id, 'unit_price', nav);
                              }
                            }}
                          />
                        </td>

                        {/* Platform */}
                        <td className="p-3">
                          <select
                            value={it.platform}
                            onChange={(e) => handleFieldChange(it.id, 'platform', e.target.value)}
                            className={`text-xs px-2 py-1 rounded-lg font-bold cursor-pointer transition ${getPlatformBadge(
                              it.platform
                            )}`}
                          >
                            <option value="KBANK">KBank</option>
                            <option value="KBANK_PVD">KBank (PVD)</option>
                            <option value="TTB">ttb</option>
                            <option value="DIME">Dime!</option>
                            <option value="SCB">SCB</option>
                          </select>
                        </td>

                        {/* Trans Type */}
                        <td className="p-3">
                          <span
                            onClick={() =>
                              handleFieldChange(it.id, 'trans_type', it.trans_type === 'BUY' ? 'SELL' : 'BUY')
                            }
                            className={`cursor-pointer px-2 py-0.5 rounded text-[11px] font-bold ${
                              it.trans_type === 'BUY'
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                            }`}
                            title="คลิกเพื่อสลับ BUY/SELL"
                          >
                            {it.trans_type}
                          </span>
                        </td>

                        {/* Fund Mapping & Combobox */}
                        <td className="p-3">
                          <div className="space-y-1">
                            {/* Raw original name label */}
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                              <span className="truncate max-w-[340px]" title={it.raw_fund_name}>
                                PDF: <span className="font-semibold text-slate-700 dark:text-slate-300">{it.raw_fund_name}</span>
                              </span>
                              {it.match_confidence === 'EXACT' && (
                                <span className="px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 rounded text-[10px] font-semibold">
                                  ตรง 100%
                                </span>
                              )}
                              {it.match_confidence === 'FUZZY' && (
                                <span className="px-1.5 py-0.2 bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 rounded text-[10px] font-semibold">
                                  ใกล้เคียง
                                </span>
                              )}
                              {it.match_confidence === 'NONE' && (
                                <span className="px-1.5 py-0.2 bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 rounded text-[10px] font-semibold flex items-center gap-0.5">
                                  <AlertTriangle className="w-2.5 h-2.5" /> ต้องเลือก
                                </span>
                              )}
                            </div>

                            {/* Autocomplete Combobox */}
                            <FundSearchCombobox
                              value={it.fund_abbr || it.raw_fund_name}
                              projId={it.proj_id}
                              suggestions={it.suggestions}
                              onChange={(fund) => handleFundSelect(it.id, fund)}
                            />

                            {/* Interactive Share Class Selector (Task 36.5) */}
                            {(() => {
                              const candidateClasses = getCandidateClassesForItem(it);
                              if (candidateClasses.length <= 1) return null;

                              return (
                                <div
                                  className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800"
                                  data-testid={`share-class-selector-${it.id}`}
                                >
                                  <div className="flex items-center justify-between gap-1 mb-1">
                                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                      <Layers className="w-3 h-3 text-indigo-500" />
                                      <span>{t('shareClasses')}:</span>
                                    </span>
                                    {candidateClasses.length > 3 && (
                                      <select
                                        value={it.fund_abbr || ''}
                                        onChange={(e) => {
                                          const chosen = e.target.value;
                                          const nav = classNavs[`${it.id}_${chosen}`];
                                          handleClassSwitch(it.id, chosen, nav);
                                        }}
                                        data-testid={`share-class-select-${it.id}`}
                                        className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono cursor-pointer"
                                      >
                                        {candidateClasses.map((cls) => {
                                          const nav = classNavs[`${it.id}_${cls}`];
                                          return (
                                            <option key={cls} value={cls}>
                                              {cls} {nav ? `(NAV ฿${nav})` : ''}
                                            </option>
                                          );
                                        })}
                                      </select>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap gap-1" role="group" aria-label={t('shareClasses')}>
                                    {candidateClasses.map((cls) => {
                                      const isSelected = (it.fund_abbr || '').toUpperCase() === cls.toUpperCase();
                                      const nav = classNavs[`${it.id}_${cls}`];

                                      return (
                                        <button
                                          key={cls}
                                          type="button"
                                          onClick={() => handleClassSwitch(it.id, cls, nav)}
                                          data-testid={`share-class-pill-${cls}`}
                                          aria-pressed={isSelected}
                                          className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all flex items-center gap-1 cursor-pointer ${
                                            isSelected
                                              ? 'bg-indigo-600 text-white shadow-xs font-bold'
                                              : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                          }`}
                                          title={t('switchToClass', { name: cls })}
                                        >
                                          <span>{cls}</span>
                                          {nav && (
                                            <span
                                              className={`text-[9px] font-mono ${
                                                isSelected
                                                  ? 'text-indigo-100'
                                                  : 'text-indigo-600 dark:text-indigo-400 font-semibold'
                                              }`}
                                            >
                                              ฿{nav}
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </td>

                        {/* Units */}
                        <td className="p-3 text-right">
                          <input
                            type="number"
                            step="0.0001"
                            value={it.units}
                            onChange={(e) => handleFieldChange(it.id, 'units', e.target.value)}
                            className="w-24 text-right text-xs px-1.5 py-1 bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 rounded focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 font-mono text-slate-800 dark:text-slate-200"
                          />
                        </td>

                        {/* Unit Price (NAV) */}
                        <td className="p-3 text-right">
                          <div className="space-y-0.5">
                            <input
                              type="number"
                              step="0.0001"
                              value={it.unit_price}
                              onChange={(e) => handleFieldChange(it.id, 'unit_price', e.target.value)}
                              className="w-24 text-right text-xs px-1.5 py-1 bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 rounded focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 font-mono font-semibold text-slate-800 dark:text-slate-200"
                            />
                            {it.nav_source && (
                              <div className="text-[10px] text-slate-400">
                                {it.nav_source === 'SEC_HISTORY' ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">NAV วันที่ทำรายการ</span>
                                ) : it.nav_source === 'SEC_LATEST' ? (
                                  <span className="text-amber-600 dark:text-amber-400 font-medium">NAV ล่าสุด</span>
                                ) : (
                                  <span>จาก PDF</span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Total Amount */}
                        <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                          <input
                            type="number"
                            step="0.01"
                            value={it.total_amount}
                            onChange={(e) => handleFieldChange(it.id, 'total_amount', e.target.value)}
                            className="w-28 text-right text-xs px-1.5 py-1 bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 rounded focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 font-mono font-bold text-indigo-600 dark:text-indigo-400"
                          />
                        </td>

                        {/* Source File */}
                        <td className="p-3">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[120px]" title={it.source_file || it.source_email || ''}>
                            {it.source_file || it.source_email || '-'}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(it.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                            title="ลบรายการนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span>
              เลือกอยู่ <b>{selectedIds.size}</b> จาก {items.length} รายการ
            </span>
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => setConfirmAction({ type: 'delete_selected', count: selectedIds.size })}
                disabled={submitting}
                className="text-xs text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 font-medium ml-2 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                ลบรายการที่เลือก
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              ไว้ทำต่อทีหลัง (บันทึกไว้ใน Pending)
            </button>

            {selectedPlatform !== 'ALL' && selectedInCurrentPlatform.length > 0 && (
              <button
                type="button"
                onClick={() => handleCommitIds(selectedInCurrentPlatform.map((i) => i.id))}
                disabled={submitting}
                className="px-4 py-2 text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  ยืนยันเฉพาะ {platformStats[selectedPlatform]?.label || selectedPlatform} ({selectedInCurrentPlatform.length})
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCommitSelected}
              disabled={submitting || selectedIds.size === 0}
              className="px-4 py-2 text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              ยืนยันที่เลือก ({selectedIds.size})
            </button>

            <button
              type="button"
              onClick={() => setConfirmAction({ type: 'commit_all', count: items.length })}
              disabled={submitting || items.length === 0}
              className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              ยืนยันทั้งหมด ({items.length} รายการ)
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Review Actions */}
      {confirmAction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-start gap-3">
              <div
                className={`p-3 rounded-xl shrink-0 ${
                  confirmAction.type === 'commit_all'
                    ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400'
                    : 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400'
                }`}
              >
                {confirmAction.type === 'commit_all' ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  <AlertTriangle className="w-6 h-6" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {confirmAction.type === 'commit_all'
                    ? locale === 'th'
                      ? 'ยืนยันนำเข้าทุกรายการเข้าพอร์ต'
                      : 'Commit All Transactions'
                    : locale === 'th'
                    ? 'ยืนยันลบรายการที่เลือก'
                    : 'Delete Selected Pending Items'}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  {confirmAction.type === 'commit_all'
                    ? locale === 'th'
                      ? `คุณต้องการยืนยันนำเข้าข้อมูลทั้ง ${confirmAction.count} รายการเข้าสู่พอร์ตการลงทุนใช่หรือไม่?`
                      : `Are you sure you want to commit all ${confirmAction.count} transactions into your portfolio?`
                    : locale === 'th'
                    ? `คุณต้องการลบรายการที่เลือก ${confirmAction.count} รายการออกจากคิวรอตรวจสอบใช่หรือไม่?`
                    : `Are you sure you want to delete ${confirmAction.count} selected pending items?`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                {t('btnCancel')}
              </button>
              <button
                type="button"
                onClick={confirmAction.type === 'commit_all' ? executeCommitAll : executeDeleteSelected}
                disabled={submitting}
                className={`px-5 py-2 rounded-xl text-sm font-bold text-white shadow-md transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 ${
                  confirmAction.type === 'commit_all'
                    ? 'bg-indigo-600 hover:bg-indigo-500'
                    : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>กำลังประมวลผล...</span>
                  </>
                ) : confirmAction.type === 'commit_all' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>ยืนยันนำเข้า ({confirmAction.count})</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>ลบรายการ ({confirmAction.count})</span>
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
