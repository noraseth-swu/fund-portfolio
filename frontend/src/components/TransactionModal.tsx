import React, { useState, useEffect } from 'react';
import { X, Search, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { searchFunds, createTransaction, getBrokers, type FundSearchResult, type BrokerItem } from '../lib/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const TransactionModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [platform, setPlatform] = useState('KBANK');
  const [transType, setTransType] = useState('BUY');
  const [transDate, setTransDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [projId, setProjId] = useState('');
  const [fundAbbr, setFundAbbr] = useState('');
  const [units, setUnits] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [fee, setFee] = useState('0');
  const [note, setNote] = useState('');

  // Search state
  const [brokers, setBrokers] = useState<BrokerItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FundSearchResult[]>([]);

  useEffect(() => {
    getBrokers()
      .then(setBrokers)
      .catch((err) => console.error('Could not load brokers:', err));
  }, []);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchFunds(searchQuery);
        setSearchResults(results);
        setShowDropdown(true);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const selectFund = (fund: FundSearchResult) => {
    setProjId(fund.proj_id);
    setFundAbbr(fund.proj_abbr_name || fund.proj_id);
    setSearchQuery(fund.proj_abbr_name || fund.proj_id);
    if (fund.last_nav && !unitPrice) {
      setUnitPrice(fund.last_nav);
    }
    setShowDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetProjId = projId || searchQuery.trim();
    if (!targetProjId) {
      setError('กรุณาเลือกหรือระบุชื่อกองทุน');
      return;
    }

    if (!units || parseFloat(units) <= 0) {
      setError('กรุณาระบุจำนวนหน่วยลงทุนให้ถูกต้อง');
      return;
    }

    if (!unitPrice || parseFloat(unitPrice) <= 0) {
      setError('กรุณาระบุราคาต่อหน่วย (NAV) ให้ถูกต้อง');
      return;
    }

    setLoading(true);
    try {
      await createTransaction({
        proj_id: targetProjId,
        fund_abbr: fundAbbr || searchQuery.trim(),
        platform,
        trans_type: transType,
        trans_date: transDate,
        units,
        unit_price: unitPrice,
        fee: fee || '0',
        note,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const totalCalculated = units && unitPrice ? (parseFloat(units) * parseFloat(unitPrice)).toFixed(2) : '0.00';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-white mb-4">บันทึกธุรกรรมการลงทุน</h2>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
          {/* แพลตฟอร์ม / โบรกเกอร์ (Master Data Dropdown + Quick Select) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-slate-400 font-medium">โบรกเกอร์ / แพลตฟอร์ม (SEC Master Data)</label>
              <span className="text-[11px] text-indigo-400 font-mono">เลือกจากรายการ หรือปุ่มลัด</span>
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
                  className={`py-1 px-2.5 rounded-lg border text-xs font-semibold transition ${
                    platform === item.id
                      ? 'border-indigo-500 bg-indigo-950/60 text-indigo-300 ring-1 ring-indigo-400/40'
                      : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
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
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs sm:text-sm font-medium"
            >
              <optgroup label="🏦 ธนาคาร / โบรกเกอร์ / FinTech">
                {brokers
                  .filter((b) => b.category === 'RETAIL')
                  .map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.code} - {b.name_th}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="🏛️ บริษัทหลักทรัพย์จัดการกองทุน (บลจ. จาก ก.ล.ต.)">
                {brokers
                  .filter((b) => b.category === 'AMC')
                  .map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name_th} ({b.name_en})
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>

          {/* ประเภทธุรกรรม & วันที่ */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1.5">ประเภทธุรกรรม</label>
              <select
                value={transType}
                onChange={(e) => setTransType(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="BUY">ซื้อ (BUY)</option>
                <option value="SELL">ขายคืน (SELL)</option>
                <option value="DIVIDEND">เงินปันผล (DIVIDEND)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1.5">วันที่ทำรายการ</label>
              <input
                type="date"
                value={transDate}
                onChange={(e) => setTransDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* ค้นหากองทุน */}
          <div className="relative">
            <label className="block text-slate-400 font-medium mb-1.5">ชื่อกองทุน / รหัสกองทุน (SEC)</label>
            <div className="relative">
              <input
                type="text"
                placeholder="พิมพ์ค้นหา เช่น K-USA, SCBGOLD..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setProjId('');
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-9 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              {isSearching && (
                <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin absolute right-3 top-3" />
              )}
            </div>

            {/* Dropdown ผลการค้นหา */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-slate-800 border border-slate-700 rounded-xl shadow-xl">
                {searchResults.map((f) => (
                  <button
                    key={f.proj_id}
                    type="button"
                    onClick={() => selectFund(f)}
                    className="w-full text-left px-3 py-2.5 hover:bg-slate-700/60 border-b border-slate-700/40 last:border-0 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-white mr-2">{f.proj_abbr_name || f.proj_id}</span>
                      <span className="text-slate-400 text-xs block truncate max-w-xs">{f.proj_name_th}</span>
                    </div>
                    {f.last_nav && <span className="text-emerald-400 font-mono text-xs">{f.last_nav} THB</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* จำนวนหน่วย & ราคาต่อหน่วย */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1.5">จำนวนหน่วยลงทุน (Units)</label>
              <input
                type="number"
                step="any"
                placeholder="0.0000"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1.5">ราคาต่อหน่วย (NAV)</label>
              <input
                type="number"
                step="any"
                placeholder="0.0000"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* สรุปมูลค่าคำนวณ */}
          <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs">
            <span className="text-slate-400">มูลค่ารวมโดยประมาณ:</span>
            <span className="text-base font-bold text-emerald-400 font-mono">{totalCalculated} THB</span>
          </div>

          {/* ค่าธรรมเนียม & หมายเหตุ */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1.5">ค่าธรรมเนียม (บาท)</label>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-slate-400 font-medium mb-1.5">หมายเหตุ (ถ้ามี)</label>
              <input
                type="text"
                placeholder="เช่น ซื้อ DCA รายเดือน, ซื้อตอนดัชนีปรับฐาน"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* ปุ่ม Submit */}
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition font-medium"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition flex items-center gap-1.5 disabled:opacity-50 shadow-lg shadow-indigo-600/30"
            >
              {loading ? (
                'กำลังบันทึก...'
              ) : (
                <>
                  <Check className="w-4 h-4" /> บันทึกรายการ
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
