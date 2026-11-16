import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Check, AlertCircle, RefreshCw, Layers, Sparkles } from 'lucide-react';
import {
  searchFunds,
  createTransaction,
  updateTransaction,
  createTransactionsBatch,
  createPendingTransactionsBatch,
  getBrokers,
  getNavByDate,
  type FundSearchResult,
  type BrokerItem,
} from '../lib/api';
import { useI18n } from '../lib/i18n';
import { BatchTransactionTable, type BatchItem } from './BatchTransactionTable';
import { NavDatePicker } from './NavDatePicker';
import { useToast } from '../lib/toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (payload?: any) => void;
  onOpenReview?: () => void;
  editTransaction?: any | null;
}

export const TransactionModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, onOpenReview, editTransaction }) => {
  const { locale, t } = useI18n();
  const toast = useToast();
  const [entryMode, setEntryMode] = useState<'single' | 'batch'>('single');

  // Single Entry state
  const [platform, setPlatform] = useState('KBANK');
  const [transType, setTransType] = useState('BUY');
  const [transDate, setTransDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [projId, setProjId] = useState('');
  const [fundAbbr, setFundAbbr] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [units, setUnits] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [fee, setFee] = useState('0');
  const [note, setNote] = useState('');
  const [loadingNavDate, setLoadingNavDate] = useState(false);

  // Batch Entry state
  const [batchRows, setBatchRows] = useState<BatchItem[]>([
    {
      id: 'row_1',
      platform: 'KBANK',
      transDate: new Date().toISOString().split('T')[0],
      projId: '',
      fundAbbr: '',
      fundName: '',
      transType: 'BUY',
      units: '',
      unitPrice: '',
      fee: '0',
      note: '',
    },
  ]);

  // Search state
  const [brokers, setBrokers] = useState<BrokerItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FundSearchResult[]>([]);

  useEffect(() => {
    getBrokers()
      .then(setBrokers)
      .catch((err) => console.error('Could not load brokers:', err));
  }, []);

  useEffect(() => {
    if (editTransaction) {
      setEntryMode('single');
      setPlatform(editTransaction.platform || 'KBANK');
      setTransType(editTransaction.trans_type || 'BUY');
      const dt = editTransaction.trans_date || new Date().toISOString().split('T')[0];
      setTransDate(dt);
      const pid = editTransaction.proj_id || '';
      setProjId(pid);
      const abbr = editTransaction.fund_abbr || editTransaction.proj_id || '';
      setFundAbbr(abbr);
      setSearchQuery(abbr);
      setTotalAmount(editTransaction.total_amount ? editTransaction.total_amount.toString() : '');
      setUnits(editTransaction.units ? editTransaction.units.toString() : '');
      const storedPrice = editTransaction.unit_price ? editTransaction.unit_price.toString() : '';
      setUnitPrice(storedPrice);
      setFee(editTransaction.fee ? editTransaction.fee.toString() : '0');
      setNote(editTransaction.note || '');

      // ตรวจสอบราคา NAV ทางการจาก SEC ณ วันที่ทำรายการ หากคลาดเคลื่อนเพียงเศษทศนิยมปัดเศษ (< 0.05) ให้ปรับเป็น NAV ทางการทันที
      if (pid && dt) {
        getNavByDate(pid, dt, abbr)
          .then((res) => {
            if (res && res.nav && parseFloat(res.nav) > 0) {
              const secPrice = parseFloat(res.nav);
              const curPrice = parseFloat(storedPrice);
              if (!storedPrice || isNaN(curPrice) || Math.abs(curPrice - secPrice) < 0.05) {
                setUnitPrice(secPrice.toFixed(4));
              }
            }
          })
          .catch(() => {});
      }
    } else {
      setPlatform('KBANK');
      setTransType('BUY');
      setTransDate(new Date().toISOString().split('T')[0]);
      setProjId('');
      setFundAbbr('');
      setSearchQuery('');
      setTotalAmount('');
      setUnits('');
      setUnitPrice('');
      setFee('0');
      setNote('');
    }
  }, [editTransaction, isOpen]);

  // AIMC Standard: truncate units to 4 decimal places
  const truncate4 = (num: number): string => {
    if (isNaN(num) || !isFinite(num)) return '';
    return (Math.floor(num * 10000) / 10000).toFixed(4);
  };

  const handleTotalAmountChange = (val: string) => {
    setTotalAmount(val);
    const amt = parseFloat(val);
    const p = parseFloat(unitPrice);
    const f = parseFloat(fee) || 0;
    if (!isNaN(amt) && amt > 0 && !isNaN(p) && p > 0) {
      const netAmt = Math.max(0, amt - f);
      setUnits(truncate4(netAmt / p));
    }
  };

  const handleUnitsChange = (val: string) => {
    setUnits(val);
    const u = parseFloat(val);
    const p = parseFloat(unitPrice);
    const f = parseFloat(fee) || 0;
    if (!isNaN(u) && u > 0 && !isNaN(p) && p > 0) {
      setTotalAmount((u * p + f).toFixed(2));
    }
  };

  const handleUnitPriceChange = (val: string) => {
    setUnitPrice(val);
    const p = parseFloat(val);
    const amt = parseFloat(totalAmount);
    const u = parseFloat(units);
    const f = parseFloat(fee) || 0;
    if (!isNaN(p) && p > 0) {
      if (!isNaN(amt) && amt > 0) {
        const netAmt = Math.max(0, amt - f);
        setUnits(truncate4(netAmt / p));
      } else if (!isNaN(u) && u > 0) {
        setTotalAmount((u * p + f).toFixed(2));
      }
    }
  };

  const handleFeeChange = (val: string) => {
    setFee(val);
    const f = parseFloat(val) || 0;
    const amt = parseFloat(totalAmount);
    const p = parseFloat(unitPrice);
    if (!isNaN(amt) && amt > 0 && !isNaN(p) && p > 0) {
      const netAmt = Math.max(0, amt - f);
      setUnits(truncate4(netAmt / p));
    }
  };

  const fetchNavForDate = async (targetProjId?: string, targetFundAbbr?: string, targetDate?: string) => {
    const pid = (targetProjId || projId || fundAbbr || searchQuery).trim();
    const fabbr = (targetFundAbbr || fundAbbr || searchQuery).trim();
    const dt = (targetDate || transDate).trim();
    if (!pid || !dt) return;

    setLoadingNavDate(true);
    try {
      const res = await getNavByDate(pid, dt, fabbr);
      if (res && res.nav && parseFloat(res.nav) > 0) {
        handleUnitPriceChange(res.nav.toString());
        toast.success(
          locale === 'th'
            ? `ดึงราคา NAV สำเร็จ: ${parseFloat(res.nav).toFixed(4)} บาท`
            : `Fetched NAV: ${parseFloat(res.nav).toFixed(4)}`
        );
      } else {
        toast.warning(
          locale === 'th'
            ? `ไม่พบราคา NAV ณ วันที่ ${dt} (อาจเป็นวันหยุดทำการ)`
            : `No NAV record found for ${dt}`
        );
      }
    } catch (e) {
      console.warn('Could not fetch NAV for date:', e);
      toast.error(locale === 'th' ? 'เกิดข้อผิดพลาดในการดึงราคา NAV' : 'Failed to fetch NAV');
    } finally {
      setLoadingNavDate(false);
    }
  };

  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  useEffect(() => {
    const cleanQuery = searchQuery.trim();
    // Do not trigger search or pop open dropdown if query is empty or matches already selected fundAbbr
    if (!cleanQuery || cleanQuery.length < 2 || cleanQuery.toUpperCase() === fundAbbr.trim().toUpperCase()) {
      if (cleanQuery.toUpperCase() === fundAbbr.trim().toUpperCase()) {
        setShowDropdown(false);
      } else {
        setSearchResults([]);
      }
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchFunds(cleanQuery);
        setSearchResults(results);
        if (results.length > 0) {
          setShowDropdown(true);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, fundAbbr]);

  const selectFund = (fund: FundSearchResult) => {
    setProjId(fund.proj_id);
    const abbr = fund.proj_abbr_name || fund.proj_id;
    setFundAbbr(abbr);
    setSearchQuery(abbr);
    setShowDropdown(false);
    // Fetch NAV for current transDate
    fetchNavForDate(fund.proj_id, abbr, transDate);
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetProjId = (projId || searchQuery).trim();
    if (!targetProjId) {
      setError(locale === 'th' ? 'กรุณาระบุหรือเลือกกองทุน' : 'Please select or enter a fund');
      return;
    }

    let finalUnits = units;
    let finalUnitPrice = unitPrice;
    let finalAmount = totalAmount;

    const parsedAmount = parseFloat(finalAmount);
    const parsedPrice = parseFloat(finalUnitPrice);
    const parsedUnits = parseFloat(finalUnits);
    const parsedFee = parseFloat(fee) || 0;

    // Smart auto-calculation if units is missing but totalAmount & unitPrice are present
    if ((!finalUnits || isNaN(parsedUnits) || parsedUnits <= 0) && !isNaN(parsedAmount) && parsedAmount > 0 && !isNaN(parsedPrice) && parsedPrice > 0) {
      const netAmt = Math.max(0, parsedAmount - parsedFee);
      finalUnits = truncate4(netAmt / parsedPrice);
      setUnits(finalUnits);
    }

    // Smart auto-calculation if totalAmount is missing but units & unitPrice are present
    if ((!finalAmount || isNaN(parsedAmount) || parsedAmount <= 0) && !isNaN(parsedUnits) && parsedUnits > 0 && !isNaN(parsedPrice) && parsedPrice > 0) {
      finalAmount = (parsedUnits * parsedPrice + parsedFee).toFixed(2);
      setTotalAmount(finalAmount);
    }

    if (!finalUnits || isNaN(parseFloat(finalUnits)) || parseFloat(finalUnits) <= 0) {
      setError(locale === 'th' ? 'กรุณาระบุจำนวนหน่วยลงทุน (หรือระบุยอดเงินลงทุนและ NAV)' : 'Units Allocated is required');
      return;
    }

    if (!finalUnitPrice || isNaN(parseFloat(finalUnitPrice)) || parseFloat(finalUnitPrice) <= 0) {
      setError(locale === 'th' ? 'กรุณาระบุราคาต่อหน่วย (NAV)' : 'Unit Price (NAV) is required');
      return;
    }

    const calculatedTotal = finalAmount && parseFloat(finalAmount) > 0
      ? parseFloat(finalAmount).toFixed(2)
      : (parseFloat(finalUnits) * parseFloat(finalUnitPrice) + parsedFee).toFixed(2);

    setLoading(true);
    try {
      if (editTransaction && editTransaction.id) {
        await updateTransaction(editTransaction.id, {
          proj_id: targetProjId,
          fund_abbr: fundAbbr || searchQuery.trim(),
          platform,
          trans_type: transType,
          trans_date: transDate,
          units: finalUnits,
          unit_price: finalUnitPrice,
          total_amount: calculatedTotal,
          fee: fee || '0',
          note,
        });
      } else {
        await createTransaction({
          proj_id: targetProjId,
          fund_abbr: fundAbbr || searchQuery.trim(),
          platform,
          trans_type: transType,
          trans_date: transDate,
          units: finalUnits,
          unit_price: finalUnitPrice,
          total_amount: calculatedTotal,
          fee: fee || '0',
          note,
        });
      }

      onSuccess({
        type: editTransaction && editTransaction.id ? 'update' : 'create',
        message: editTransaction && editTransaction.id
          ? (locale === 'th' ? 'อัพเดตรายการธุรกรรมเรียบร้อยแล้ว' : 'Transaction updated successfully')
          : (locale === 'th' ? 'บันทึกรายการธุรกรรมเรียบร้อยแล้ว' : 'Transaction saved successfully'),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || (locale === 'th' ? 'เกิดข้อผิดพลาดในการบันทึกรายการ' : 'Failed to save transaction'));
    } finally {
      setLoading(false);
    }
  };

  const handleBatchSaveDirect = async () => {
    setError(null);
    const validRows = batchRows.filter((r) => r.fundAbbr.trim() && parseFloat(r.units) > 0 && parseFloat(r.unitPrice) > 0);
    if (validRows.length === 0) {
      setError(locale === 'th' ? 'กรุณากรอกข้อมูลกองทุน หน่วย และราคาให้ครบถ้วนอย่างน้อย 1 รายการ' : 'Please fill fund, units, and price for at least 1 row');
      return;
    }

    setLoading(true);
    try {
      const payloads = validRows.map((r) => {
        const u = parseFloat(r.units) || 0;
        const p = parseFloat(r.unitPrice) || 0;
        const f = parseFloat(r.fee) || 0;
        return {
          proj_id: r.projId || r.fundAbbr,
          fund_abbr: r.fundAbbr,
          platform: r.platform,
          trans_type: r.transType,
          trans_date: r.transDate,
          units: r.units,
          unit_price: r.unitPrice,
          total_amount: (u * p + f).toFixed(2),
          fee: r.fee || '0',
          note: r.note,
        };
      });

      await createTransactionsBatch(payloads);
      onSuccess({
        type: 'batch',
        count: validRows.length,
        message: locale === 'th' ? `บันทึกรายการธุรกรรมสำเร็จ ${validRows.length} รายการ` : `Saved ${validRows.length} transactions successfully`,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || t('saveError'));
    } finally {
      setLoading(false);
    }
  };

  const handleBatchStageReview = async () => {
    setError(null);
    const validRows = batchRows.filter((r) => r.fundAbbr.trim() && parseFloat(r.units) > 0 && parseFloat(r.unitPrice) > 0);
    if (validRows.length === 0) {
      setError(locale === 'th' ? 'กรุณากรอกข้อมูลกองทุน หน่วย และราคาให้ครบถ้วนอย่างน้อย 1 รายการ' : 'Please fill fund, units, and price for at least 1 row');
      return;
    }

    setLoading(true);
    try {
      const payloads = validRows.map((r) => {
        const u = parseFloat(r.units) || 0;
        const p = parseFloat(r.unitPrice) || 0;
        const f = parseFloat(r.fee) || 0;
        return {
          platform: r.platform,
          raw_fund_name: r.fundAbbr,
          proj_id: r.projId || undefined,
          fund_abbr: r.fundAbbr,
          trans_type: r.transType,
          trans_date: r.transDate,
          units: r.units,
          unit_price: r.unitPrice,
          total_amount: (u * p + f).toFixed(2),
          fee: r.fee || '0',
          note: r.note,
          sync_batch_id: 'manual_batch',
          source_file: 'MANUAL_BATCH_ENTRY',
        };
      });

      await createPendingTransactionsBatch(payloads);
      onSuccess();
      onClose();
      if (onOpenReview) {
        onOpenReview();
      }
    } catch (err: any) {
      setError(err.message || t('saveError'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const totalCalculated = totalAmount && parseFloat(totalAmount) > 0
    ? parseFloat(totalAmount).toFixed(2)
    : (units && unitPrice ? (parseFloat(units) * parseFloat(unitPrice) + (parseFloat(fee) || 0)).toFixed(2) : '0.00');

  const batchTotalAmount = batchRows.reduce((sum, r) => {
    const u = parseFloat(r.units) || 0;
    const p = parseFloat(r.unitPrice) || 0;
    const f = parseFloat(r.fee) || 0;
    return sum + (u > 0 && p > 0 ? u * p + f : 0);
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div
        className={`modal-card bg-slate-900 border border-slate-800 rounded-2xl w-full p-5 sm:p-6 shadow-2xl relative transition-all duration-300 ${
          entryMode === 'batch' ? 'max-w-[96vw] 2xl:max-w-[1600px]' : 'max-w-lg'
        }`}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header with Mode Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pr-8">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>
                {editTransaction
                  ? (locale === 'th' ? 'แก้ไขรายการธุรกรรม' : 'Edit Transaction')
                  : t('recordTransaction')}
              </span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {editTransaction
                ? (locale === 'th' ? 'แก้ไขข้อมูลกองทุน วันที่ จำนวนหน่วย ราคา หรือค่าธรรมเนียม' : 'Update fund details, date, units, price, or fees')
                : entryMode === 'batch'
                ? (locale === 'th' ? 'กรอกรายการหลายแถวพร้อมกัน ค้นหากองทุน SEC อัตโนมัติ' : 'Enter multiple transactions at once with SEC fund lookup')
                : (locale === 'th' ? 'กรอกรายการทีละหนึ่งรายการเข้าสู่พอร์ต' : 'Enter a single transaction into portfolio')}
            </p>
          </div>

          {/* Mode Switcher Tabs (Only shown when not editing) */}
          {!editTransaction && (
            <div className="inline-flex bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setEntryMode('single')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  entryMode === 'single'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t('singleEntry')}
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('batch')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  entryMode === 'batch'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{t('batchEntry')}</span>
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* MODE 1: SINGLE ENTRY */}
        {entryMode === 'single' && (
          <form onSubmit={handleSingleSubmit} noValidate className="space-y-4 text-xs sm:text-sm">
            {/* แพลตฟอร์ม / โบรกเกอร์ (Master Data Dropdown + Quick Select) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-slate-400 font-medium">{t('brokerMasterSec')}</label>
                <span className="text-[11px] text-indigo-400 font-mono">{t('quickSelectOrList')}</span>
              </div>

              {/* Quick Select Pills */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[
                  { id: 'KBANK', label: 'KBank' },
                  { id: 'TTB', label: 'ttb' },
                  { id: 'DIME', label: 'Dime!' },
                  { id: 'SCB', label: 'SCB' },
                  { id: 'INNOVESTX', label: 'InnovestX' },
                  { id: 'FINNOMENA', label: 'Finnomena' },
                ].map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setPlatform(item.id)}
                    className={`py-1 px-2.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                      platform === item.id
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 ring-1 ring-indigo-400/40'
                        : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Comprehensive Master Data Dropdown */}
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 text-xs sm:text-sm font-medium shadow-xs"
              >
                <optgroup label={t('brokerCategoryRetail')}>
                  {brokers
                    .filter((b) => b.category === 'RETAIL')
                    .map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.code} - {locale === 'en' ? (b.name_en || b.name_th) : b.name_th}
                      </option>
                    ))}
                </optgroup>
                <optgroup label={t('brokerCategoryAmc')}>
                  {brokers
                    .filter((b) => b.category === 'AMC')
                    .map((b) => (
                      <option key={b.code} value={b.code}>
                        {locale === 'en' ? (b.name_en || b.name_th) : b.name_th} ({b.code})
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>

            {/* ประเภทธุรกรรม & วันที่ */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1.5">{t('transTypeLabel')}</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTransType('BUY')}
                    className={`flex-1 py-2 rounded-xl font-bold border transition cursor-pointer ${
                      transType === 'BUY'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-500/20 dark:border-emerald-500 dark:text-emerald-400'
                        : 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransType('SELL')}
                    className={`flex-1 py-2 rounded-xl font-bold border transition cursor-pointer ${
                      transType === 'SELL'
                        ? 'bg-rose-50 border-rose-500 text-rose-700 dark:bg-rose-500/20 dark:border-rose-500 dark:text-rose-400'
                        : 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
                    }`}
                  >
                    SELL
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1.5">{t('transDateLabel')}</label>
                <NavDatePicker
                  value={transDate}
                  projId={projId}
                  fundAbbr={fundAbbr}
                  onChange={(d, nav) => {
                    setTransDate(d);
                    if (nav && parseFloat(nav) > 0) {
                      handleUnitPriceChange(nav);
                    } else {
                      fetchNavForDate(projId, fundAbbr, d);
                    }
                  }}
                />
              </div>
            </div>

            {/* ค้นหากองทุน */}
            <div ref={searchContainerRef} className="relative">
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1.5">{t('fundSecLabel')}</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder={t('searchFundPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => {
                    if (searchResults.length > 0 && searchQuery.trim().toUpperCase() !== fundAbbr.trim().toUpperCase()) {
                      setShowDropdown(true);
                    }
                  }}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 pl-9 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 shadow-xs"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                {isSearching && (
                  <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin absolute right-3 top-3" />
                )}
              </div>

              {/* Dropdown ผลการค้นหา (UI/UX Pro Max) */}
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-h-60 overflow-y-auto z-[999] ring-1 ring-black/5 dark:ring-white/10 divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in zoom-in-95 duration-150">
                  {searchResults.map((f) => (
                    <div
                      key={f.proj_id}
                      onClick={() => selectFund(f)}
                      className="p-3 hover:bg-indigo-50/80 dark:hover:bg-slate-800/80 transition-colors cursor-pointer group flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white text-sm tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {f.proj_abbr_name}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            {f.proj_id}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-medium">
                          {f.proj_name_th || f.proj_name_en}
                        </div>
                      </div>

                      {f.last_nav && (
                        <div className="shrink-0 text-right">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700/60 text-emerald-800 dark:text-emerald-300 font-mono font-bold text-xs shadow-xs">
                            <span className="text-[10px] font-normal uppercase opacity-75">NAV</span>
                            <span>{parseFloat(f.last_nav).toFixed(4)}</span>
                          </span>
                          {f.last_nav_date && (
                            <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 font-mono">
                              {f.last_nav_date}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ยอดเงินลงทุน (Total Amount) & ค่าธรรมเนียม (Fee) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1.5">
                  {t('amountThb') || 'ยอดเงินลงทุน (บาท)'}
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={totalAmount}
                  onChange={(e) => handleTotalAmountChange(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono shadow-xs font-bold text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1.5">
                  {t('feeLabel') || 'ค่าธรรมเนียม (บาท)'}
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={fee}
                  onChange={(e) => handleFeeChange(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono shadow-xs"
                />
              </div>
            </div>

            {/* ราคาต่อหน่วย (NAV) พร้อมปุ่มดึงราคา & จำนวนหน่วย (Units Allocated) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-700 dark:text-slate-300 font-medium">
                    {t('navPriceLabel') || 'ราคาต่อหน่วย (NAV)'} <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => fetchNavForDate()}
                    disabled={loadingNavDate || !transDate || !(projId || fundAbbr || searchQuery)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:hover:bg-indigo-900 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer disabled:opacity-40 shadow-2xs"
                    title="ดึงราคา NAV ของกองทุน ณ วันที่ทำรายการจากฐานข้อมูล"
                  >
                    {loadingNavDate ? (
                      <RefreshCw className="w-3 h-3 animate-spin text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    )}
                    <span>{locale === 'th' ? 'ดึงราคา NAV' : 'Fetch NAV'}</span>
                  </button>
                </div>
                <input
                  type="number"
                  step="any"
                  placeholder="0.0000"
                  value={unitPrice}
                  onChange={(e) => handleUnitPriceChange(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono shadow-xs"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-700 dark:text-slate-300 font-medium">
                    {t('unitsLabel') || 'จำนวนหน่วยลงทุน'} <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">AIMC 4-Dec</span>
                </div>
                <input
                  type="number"
                  step="any"
                  placeholder="0.0000"
                  value={units}
                  onChange={(e) => handleUnitsChange(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono shadow-xs font-semibold"
                />
              </div>
            </div>

            {/* หมายเหตุ */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1.5">{t('noteLabel')}</label>
              <input
                type="text"
                placeholder={t('notePlaceholder')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 shadow-xs"
              />
            </div>

            {/* Inline validation / error feedback right above submit buttons */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span className="font-semibold">{error}</span>
              </div>
            )}

            {/* ปุ่ม Submit */}
            <div className="pt-2 flex justify-between items-center">
              <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                {t('totalAmount') || 'มูลค่ารวม'}: <span className="font-bold text-slate-900 dark:text-white text-sm">฿{totalCalculated}</span>
              </span>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-header-secondary px-4 py-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer"
                >
                  {t('btnCancel')}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary-indigo px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition flex items-center gap-1.5 disabled:opacity-50 shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  {loading ? (
                    t('savingTrans')
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-white" /> {t('saveTrans')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* MODE 2: BATCH ENTRY */}
        {entryMode === 'batch' && (
          <div className="space-y-4">
            <BatchTransactionTable
              rows={batchRows}
              onChange={setBatchRows}
              brokers={brokers}
              defaultPlatform={platform}
            />

            {/* Batch Bottom Toolbar */}
            <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-xs text-slate-300">
                <span>
                  {locale === 'th' ? 'จำนวนแถว' : 'Rows'}: <span className="font-bold text-white font-mono">{batchRows.length}</span>
                </span>
                <span>
                  {t('totalAmount') || 'มูลค่ารวม'}:{' '}
                  <span className="font-bold text-emerald-400 font-mono text-sm">
                    ฿{batchTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-header-secondary px-4 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer"
                >
                  {t('btnCancel')}
                </button>

                {/* Send to Staged Review */}
                <button
                  type="button"
                  onClick={handleBatchStageReview}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>{t('sendToReview')}</span>
                </button>

                {/* Direct Save */}
                <button
                  type="button"
                  onClick={handleBatchSaveDirect}
                  disabled={loading}
                  className="btn-primary-indigo px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50 shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  {loading ? (
                    t('savingTrans')
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>{t('saveBatchTransactions')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
