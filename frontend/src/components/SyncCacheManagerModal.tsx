import React, { useState, useEffect, useMemo } from 'react';
import {
  getSyncCacheStats,
  resetSyncCache,
  listCachedEmails,
  deleteCachedEmail,
  startEmailSync,
  type SyncCacheStats,
  type CachedEmailItem,
} from '../lib/api';
import {
  RotateCw,
  Trash2,
  X,
  Mail,
  FileCheck2,
  Clock,
  Search,
  Play,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onResyncStarted?: () => void;
}

const BANK_BADGES: Record<string, { label: string; badge: string; bg: string }> = {
  TTB: {
    label: 'ttb',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    bg: 'from-blue-500/10 to-blue-500/5',
  },
  DIME: {
    label: 'Dime!',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    bg: 'from-emerald-500/10 to-emerald-500/5',
  },
  SCB: {
    label: 'SCB',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    bg: 'from-purple-500/10 to-purple-500/5',
  },
  KBANK: {
    label: 'KBank',
    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800',
    bg: 'from-teal-500/10 to-teal-500/5',
  },
};

export const SyncCacheManagerModal: React.FC<Props> = ({ isOpen, onClose, onResyncStarted }) => {
  const [activeTab, setActiveTab] = useState<'reset' | 'list'>('reset');
  const [stats, setStats] = useState<SyncCacheStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Reset form states
  const [selectedBroker, setSelectedBroker] = useState<string>('ALL');
  const [clearAttachments, setClearAttachments] = useState(true);
  const [clearPending, setClearPending] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // List view states
  const [cachedEmails, setCachedEmails] = useState<CachedEmailItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listBrokerFilter, setListBrokerFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const data = await getSyncCacheStats();
      setStats(data);
    } catch (err) {
      console.error('Error fetching cache stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchList = async (broker = listBrokerFilter) => {
    setLoadingList(true);
    try {
      const data = await listCachedEmails(broker === 'ALL' ? undefined : broker, 200);
      setCachedEmails(data);
    } catch (err) {
      console.error('Error fetching cached emails:', err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchStats();
    if (activeTab === 'list') {
      fetchList();
    }
  }, [isOpen, activeTab]);

  const handleReset = async (startSyncAfter = false) => {
    setIsResetting(true);
    setActionSuccess(null);
    try {
      const res = await resetSyncCache({
        broker: selectedBroker,
        clear_attachments: clearAttachments,
        clear_pending: clearPending,
      });

      const bankLabel = selectedBroker === 'ALL' ? 'ทุกธนาคาร' : selectedBroker;
      setActionSuccess(
        `ล้างแคชอีเมล ${bankLabel} สำเร็จ! ลบไปแล้ว ${res.deleted_emails} ฉบับ, ไฟล์แนบ ${res.deleted_attachments} ไฟล์${
          clearPending ? `, รายการรอดำเนินการ ${res.deleted_pending} รายการ` : ''
        }`
      );

      await fetchStats();
      if (activeTab === 'list') {
        await fetchList();
      }

      if (startSyncAfter) {
        await startEmailSync();
        if (onResyncStarted) {
          onResyncStarted();
        }
        onClose();
      }
    } catch (err: any) {
      console.error('Reset error:', err);
      alert(err.message || 'เกิดข้อผิดพลาดในการล้างแคช');
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteSingle = async (messageId: string) => {
    setDeletingId(messageId);
    try {
      await deleteCachedEmail(messageId);
      setCachedEmails((prev) => prev.filter((item) => item.message_id !== messageId));
      fetchStats();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถลบอีเมลออกจากแคชได้');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredList = useMemo(() => {
    let items = cachedEmails;
    if (listBrokerFilter !== 'ALL') {
      items = items.filter((it) => it.broker.toUpperCase() === listBrokerFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (it) => it.subject.toLowerCase().includes(q) || it.message_id.toLowerCase().includes(q)
      );
    }
    return items;
  }, [cachedEmails, listBrokerFilter, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <RotateCw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                จัดการแคชอีเมล & สแกนใหม่ (Sync Cache & Resync)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ล้างบันทึกอีเมลที่เคยสแกนแล้ว เพื่อสั่งให้ระบบอ่านและประมวลผลใหม่อีกครั้ง
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 bg-slate-50/30 dark:bg-slate-900/30 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('reset')}
            className={`py-3 px-4 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'reset'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <RotateCw className="w-4 h-4" />
            <span>สรุปแคชและล้างข้อมูล (Reset & Resync)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('list');
              fetchList();
            }}
            className={`py-3 px-4 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'list'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>รายการอีเมลในแคช ({stats?.total_emails ?? '...'})</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {actionSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">อีเมลที่จำในแคช</div>
                <div className="text-base font-bold text-slate-900 dark:text-white font-mono">
                  {loadingStats ? '...' : (stats?.total_emails ?? 0).toLocaleString()} ฉบับ
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
                <FileCheck2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">ไฟล์แนบ PDF ที่จำในแคช</div>
                <div className="text-base font-bold text-slate-900 dark:text-white font-mono">
                  {loadingStats ? '...' : (stats?.total_attachments ?? 0).toLocaleString()} ไฟล์
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">รายการรอดำเนินการ (Pending)</div>
                <div className="text-base font-bold text-slate-900 dark:text-white font-mono">
                  {loadingStats ? '...' : (stats?.pending_count ?? 0).toLocaleString()} รายการ
                </div>
              </div>
            </div>
          </div>

          {activeTab === 'reset' && (
            <div className="space-y-4">
              {/* Bank Breakdown Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  เลือกธนาคาร / สถาบันการเงินที่ต้องการล้างแคช:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedBroker('ALL')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      selectedBroker === 'ALL'
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-1 ring-indigo-600'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">ทั้งหมด (All)</span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                      {stats?.total_emails ?? 0} ฉบับ
                    </span>
                  </button>

                  {['SCB', 'DIME', 'TTB', 'KBANK'].map((bKey) => {
                    const count = stats?.by_broker[bKey] ?? 0;
                    const bMeta = BANK_BADGES[bKey] || { label: bKey };
                    const isSelected = selectedBroker === bKey;

                    return (
                      <button
                        key={bKey}
                        type="button"
                        onClick={() => setSelectedBroker(bKey)}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-1 ring-indigo-600'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                        }`}
                      >
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{bMeta.label}</span>
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                          {count} ฉบับ
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Options Checkboxes */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-2.5">
                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={clearAttachments}
                    onChange={(e) => setClearAttachments(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                  />
                  <span>
                    <strong>ล้างแคชไฟล์แนบ (Attachment Hash Cache)</strong> — เพื่อให้อ่านไฟล์ PDF ซ้ำแม้แฮชไฟล์จะเคยถูกบันทึกไว้
                  </span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={clearPending}
                    onChange={(e) => setClearPending(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                  />
                  <span>
                    <strong>ล้างรายการรอดำเนินการ (Staged Pending Transactions)</strong> — ล้างรายการในหน้ารอตรวจสอบที่ยังไม่ได้กดยืนยัน
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isResetting}
                  onClick={() => handleReset(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>
                    {isResetting ? 'กำลังล้างแคช...' : `ล้างแคช ${selectedBroker === 'ALL' ? 'ทั้งหมด' : selectedBroker} เท่านั้น`}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isResetting}
                  onClick={() => handleReset(true)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>ล้างแคชและเริ่มสแกนใหม่ทันที (Resync Now)</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'list' && (
            <div className="space-y-3">
              {/* Filter and Search Bar */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหาชื่อหัวข้ออีเมล หรือ Message-ID..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1.5 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex gap-1 overflow-x-auto pb-1">
                  {['ALL', 'SCB', 'DIME', 'TTB', 'KBANK'].map((bKey) => (
                    <button
                      key={bKey}
                      type="button"
                      onClick={() => setListBrokerFilter(bKey)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                        listBrokerFilter === bKey
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {bKey === 'ALL' ? 'ทั้งหมด' : bKey}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table of Emails */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                {loadingList ? (
                  <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>กำลังโหลดรายการอีเมลในแคช...</span>
                  </div>
                ) : filteredList.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    ไม่พบรายการอีเมลในแคช
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 font-semibold sticky top-0">
                      <tr>
                        <th className="p-2.5">ธนาคาร</th>
                        <th className="p-2.5">หัวข้ออีเมล</th>
                        <th className="p-2.5">วันที่</th>
                        <th className="p-2.5 text-right">จำนวน</th>
                        <th className="p-2.5 text-center">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredList.map((item) => {
                        const bMeta = BANK_BADGES[item.broker] || { label: item.broker, badge: 'bg-slate-100 text-slate-700' };
                        const isDeleting = deletingId === item.message_id;

                        return (
                          <tr key={item.message_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                            <td className="p-2.5 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${bMeta.badge}`}>
                                {bMeta.label}
                              </span>
                            </td>
                            <td className="p-2.5 max-w-[280px]">
                              <div className="font-medium text-slate-800 dark:text-slate-200 truncate" title={item.subject}>
                                {item.subject || '(ไม่มีหัวข้อ)'}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono truncate" title={item.message_id}>
                                {item.message_id}
                              </div>
                            </td>
                            <td className="p-2.5 whitespace-nowrap text-slate-500 text-[11px]">
                              {item.email_date}
                            </td>
                            <td className="p-2.5 whitespace-nowrap text-right font-mono text-slate-700 dark:text-slate-300 font-bold">
                              {item.tx_count} รายการ
                            </td>
                            <td className="p-2.5 whitespace-nowrap text-center">
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => handleDeleteSingle(item.message_id)}
                                title="ลบอีเมลนี้ออกจากแคชเพื่อให้สแกนใหม่"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};