import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  getEmailSyncStatus,
  cancelEmailSync,
  getPendingTransactions,
  type EmailSyncProgress,
  type PendingTransaction,
} from '../lib/api';
import {
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  X,
  StopCircle,
  Sparkles,
  Terminal,
  ArrowRight,
  Building2,
  ChevronRight,
} from 'lucide-react';
import { SyncCacheManagerModal } from './SyncCacheManagerModal';
import { useI18n } from '../lib/i18n';
import { formatLiveLog } from '../lib/logFormatter';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (selectedPlatform?: string) => void;
}

const PLATFORMS = [
  { key: 'TTB', label: 'ttb', desc: 'TMBThanachart' },
  { key: 'DIME', label: 'Dime!', desc: 'KKP Dime' },
  { key: 'SCB', label: 'SCB', desc: 'SCB Easy / SCBAM' },
  { key: 'KBANK', label: 'KBank', desc: 'Kasikorn Asset' },
  { key: 'KBANK_PVD', label: 'KBank (PVD)', desc: 'Provident Fund' },
];

export const EmailSyncModal: React.FC<Props> = ({ isOpen, onClose, onComplete }) => {
  const { locale, t } = useI18n();
  const [progress, setProgress] = useState<EmailSyncProgress | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingTransaction[]>([]);
  const [hasFetchedPending, setHasFetchedPending] = useState(false);
  const [isCacheManagerOpen, setIsCacheManagerOpen] = useState(false);
  const [logViewMode, setLogViewMode] = useState<'friendly' | 'raw'>('friendly');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Poll status while open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const data = await getEmailSyncStatus();
        if (isMounted) {
          setProgress(data);
          setErrorMsg(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err.message || 'ไม่สามารถดึงสถานะการสแกนได้');
        }
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 1500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen]);

  const isRunning = progress?.is_running ?? false;
  const isCompleted = progress?.completed && !isRunning;
  const isCancelled = progress?.cancelled && !isRunning;

  // When completed, fetch pending items grouped by bank
  useEffect(() => {
    if (isCompleted && !hasFetchedPending) {
      getPendingTransactions('PENDING')
        .then((items) => {
          setPendingItems(items);
          setHasFetchedPending(true);
        })
        .catch(() => {});
    }
  }, [isCompleted, hasFetchedPending]);

  // Reset flag when starting a new scan run
  useEffect(() => {
    if (isRunning) {
      setHasFetchedPending(false);
    }
  }, [isRunning]);

  // Auto scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [progress?.recent_logs, progress?.log_tail]);

  const bankStats = useMemo(() => {
    const map: Record<string, { key: string; label: string; count: number; totalAmount: number }> = {};
    PLATFORMS.forEach((p) => {
      map[p.key] = { key: p.key, label: p.label, count: 0, totalAmount: 0 };
    });

    pendingItems.forEach((it) => {
      const p = (it.platform || 'OTHER').toUpperCase();
      if (!map[p]) {
        map[p] = { key: p, label: it.platform, count: 0, totalAmount: 0 };
      }
      map[p].count += 1;
      map[p].totalAmount += parseFloat(it.total_amount) || 0;
    });

    return Object.values(map).filter((b) => b.count > 0);
  }, [pendingItems]);

  const getBankBadgeStyle = (key: string) => {
    switch (key.toUpperCase()) {
      case 'TTB':
        return 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'DIME':
        return 'bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800';
      case 'SCB':
        return 'bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'KBANK':
        return 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'KBANK_PVD':
        return 'bg-teal-100 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  const getTerminalPlatformBadgeStyle = (platform?: string) => {
    switch ((platform || '').toUpperCase()) {
      case 'TTB':
        return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-500/80';
      case 'DIME':
      case 'DIME_STOCK':
        return 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-500/80';
      case 'SCB':
        return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-500/80';
      case 'KBANK':
        return 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-200 dark:border-teal-500/80';
      case 'KBANK_PVD':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-500/80';
      case 'SYNC':
        return 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-200 dark:border-indigo-500/80';
      default:
        return 'bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600';
    }
  };

  const renderRawLogLine = (line: string) => {
    let rest = line;
    let ts: string | null = null;
    const tsMatch = rest.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}|\[\d{2}:\d{2}:\d{2}\])\s*/);
    if (tsMatch) {
      ts = tsMatch[1];
      rest = rest.slice(tsMatch[0].length);
    }

    const tokenRegex = /(\[[^\]]+\]|'[^']+'|\((?:[\d,.]+\s+THB|[\d.]+\s+shares[^\)]*)\)|\b\d{4}-\d{2}-\d{2}\b)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(rest)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`} className="text-slate-800 dark:text-slate-100 font-medium">
            {rest.slice(lastIndex, match.index)}
          </span>
        );
      }
      const token = match[0];
      const key = `token-${match.index}`;

      if (token === '[INFO]') {
        parts.push(<span key={key} className="text-sky-700 dark:text-sky-300 font-bold mr-1">[INFO]</span>);
      } else if (token === '[WARNING]') {
        parts.push(<span key={key} className="text-amber-700 dark:text-amber-300 font-bold mr-1">[WARNING]</span>);
      } else if (token === '[ERROR]') {
        parts.push(<span key={key} className="text-rose-700 dark:text-rose-300 font-bold mr-1">[ERROR]</span>);
      } else if (token === '[+]' || token === '[✓]' || token === '[\u2713]') {
        parts.push(<span key={key} className="text-emerald-700 dark:text-emerald-300 font-bold mr-1">{token}</span>);
      } else if (token === '[✗]') {
        parts.push(<span key={key} className="text-rose-700 dark:text-rose-300 font-bold mr-1">[✗]</span>);
      } else if (token === '[PENDING]') {
        parts.push(<span key={key} className="text-purple-700 dark:text-purple-300 font-bold mr-1">[PENDING]</span>);
      } else if (token === '[STOCK]') {
        parts.push(<span key={key} className="text-cyan-700 dark:text-cyan-300 font-bold mr-1">[STOCK]</span>);
      } else if (token === '[SYNC]') {
        parts.push(<span key={key} className="text-indigo-700 dark:text-indigo-300 font-bold mr-1">[SYNC]</span>);
      } else if (/^\[(TTB|SCB|DIME|KBANK|KBANK_PVD)\]$/i.test(token)) {
        const plat = token.slice(1, -1).toUpperCase();
        let color = 'text-blue-700 dark:text-blue-300';
        if (plat === 'DIME') color = 'text-violet-700 dark:text-violet-300';
        else if (plat === 'SCB') color = 'text-purple-700 dark:text-purple-300';
        else if (plat === 'KBANK') color = 'text-teal-700 dark:text-teal-300';
        else if (plat === 'KBANK_PVD') color = 'text-emerald-700 dark:text-emerald-300';
        parts.push(<span key={key} className={`${color} font-bold mr-1`}>{token}</span>);
      } else if (/^\[\d+\/\d+\]$/.test(token)) {
        parts.push(<span key={key} className="text-amber-700 dark:text-amber-300 font-semibold mr-1">{token}</span>);
      } else if (token.startsWith("'") && token.endsWith("'")) {
        parts.push(<span key={key} className="text-amber-800 dark:text-amber-200 font-medium">{token}</span>);
      } else if (token.startsWith("(") && token.includes("THB")) {
        parts.push(<span key={key} className="text-emerald-700 dark:text-emerald-300 font-bold">{token}</span>);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
        parts.push(<span key={key} className="text-cyan-700 dark:text-cyan-300 font-medium">{token}</span>);
      } else {
        parts.push(<span key={key} className="text-slate-700 dark:text-slate-300">{token}</span>);
      }

      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < rest.length) {
      parts.push(
        <span key={`text-${lastIndex}`} className="text-slate-800 dark:text-slate-100 font-medium">
          {rest.slice(lastIndex)}
        </span>
      );
    }

    return (
      <div className="py-0.5 font-mono text-xs leading-relaxed break-all border-b border-slate-200/80 dark:border-slate-900/60 last:border-b-0">
        {ts && (
          <span className="text-slate-500 dark:text-slate-400 font-semibold select-none mr-2 font-mono">
            {ts}
          </span>
        )}
        {parts}
      </div>
    );
  };

  if (!isOpen) return null;

  const statusMatch = progress?.status_text?.match(/\[([A-Z_]+)\]\s+\[(\d+)\/(\d+)\]/i);
  const parsedBroker = statusMatch ? statusMatch[1].toUpperCase() : '';
  const parsedEmailIndex = statusMatch ? parseInt(statusMatch[2], 10) : 0;
  const parsedTotalEmails = statusMatch ? parseInt(statusMatch[3], 10) : 0;

  const currentBroker = (progress?.broker || parsedBroker || '').toUpperCase();
  const currentBrokerIdx = PLATFORMS.findIndex(
    (p) => p.key === currentBroker || (currentBroker === 'KBANK_PVD' && p.key === 'KBANK_PVD')
  );

  const currentEmailIndex = progress?.email_index ?? (parsedEmailIndex || 0);
  const currentTotalEmails = progress?.total_emails || parsedTotalEmails || 0;

  // Calculate percentage
  let progressPct = 0;
  if (isCompleted) {
    progressPct = 100;
  } else if (currentTotalEmails > 0) {
    const emailRatio = currentEmailIndex / currentTotalEmails;
    const baseBrokerPct = ((currentBrokerIdx >= 0 ? currentBrokerIdx : 0) / PLATFORMS.length) * 100;
    const brokerStepPct = (1 / PLATFORMS.length) * 100;
    progressPct = Math.min(99, Math.round(baseBrokerPct + emailRatio * brokerStepPct));
  } else if (isRunning) {
    progressPct = 15;
  }

  const handleCancelClick = async () => {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setCancelling(true);
    try {
      await cancelEmailSync();
      const updated = await getEmailSyncStatus();
      setProgress(updated);
    } catch (e: any) {
      setErrorMsg(e.message || 'เกิดข้อผิดพลาดในการยกเลิก');
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  };

  const handleFinish = (platform: string = 'ALL') => {
    if (onComplete) {
      onComplete(platform);
    }
    onClose();
  };

  // Combine logs from recent_logs and log_tail
  const displayLogs = [
    ...(progress?.recent_logs || []),
    ...(progress?.log_tail || []).filter((l) => !progress?.recent_logs?.includes(l)),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                isRunning
                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                  : isCompleted
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
              }`}
            >
              {isRunning ? (
                <RotateCw className="w-5 h-5 animate-spin text-indigo-500" />
              ) : isCompleted ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              )}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>ติดตามการสแกนอีเมล</span>
                {isRunning && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                    กำลังทำงาน
                  </span>
                )}
                {isCompleted && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    เสร็จสมบูรณ์
                  </span>
                )}
                {isCancelled && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                    ถูกยกเลิก
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {progress?.status_text || 'กำลังเตรียมข้อมูล...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsCacheManagerOpen(true)}
              className="px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
              title="จัดการแคชอีเมลและรีเซ็ตประวัติเพื่อสแกนใหม่"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ล้างแคช / สแกนใหม่</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="ปิดหน้าต่าง (การสแกนยังคงทำงานต่อในพื้นหลัง)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Platform Stepper */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
              <span>ขั้นตอนการตรวจสอบแพลตฟอร์ม</span>
              <span>{progressPct}%</span>
            </div>

            {/* Stepper Grid */}
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {PLATFORMS.map((p, idx) => {
                const isPassed = isCompleted || (currentBrokerIdx > idx && currentBrokerIdx >= 0);
                const isCurrent = isRunning && (currentBroker === p.key || (idx === currentBrokerIdx));

                return (
                  <div
                    key={p.key}
                    className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 ${
                      isCurrent
                        ? 'border-indigo-500 bg-indigo-500/10 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold shadow-xs'
                        : isPassed
                        ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-center">
                      {isPassed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : isCurrent ? (
                        <RotateCw className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700" />
                      )}
                    </div>
                    <span className="text-[11px] sm:text-xs font-semibold truncate max-w-full">
                      {p.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden mt-3">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  isCompleted
                    ? 'bg-emerald-500'
                    : isCancelled
                    ? 'bg-amber-500'
                    : 'bg-indigo-600'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Real-time Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                {isRunning && currentBroker ? `สแกน ${currentBroker}` : 'สแกนแล้วทั้งหมด'}
              </div>
              <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-100 mt-0.5">
                {isRunning && currentTotalEmails > 0 ? (
                  <>
                    <span>{currentEmailIndex > 0 ? currentEmailIndex : (progress?.emails_scanned || 0)}</span>
                    <span className="text-xs text-slate-400 font-normal"> / {currentTotalEmails}</span>
                  </>
                ) : (
                  <span>{progress?.emails_scanned || 0} ฉบับ</span>
                )}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <div className="text-slate-500 dark:text-slate-400 text-[11px]">พบไฟล์แนบ</div>
              <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-100 mt-0.5">
                {progress?.attachments_found || 0}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
              <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">นำเข้าสำเร็จ</div>
              <div className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-300 mt-0.5">
                +{progress?.transactions_inserted || 0}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300">
              <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">ข้ามรายการซ้ำ</div>
              <div className="text-lg font-bold font-mono text-amber-700 dark:text-amber-300 mt-0.5">
                {progress?.transactions_skipped || 0}
              </div>
            </div>
          </div>

          {/* AI Token Stats if used */}
          {progress?.tokens_used && progress.tokens_used.total_tokens > 0 && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-xs">
              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <span className="font-semibold">โควตา Gemini AI Token ที่ใช้ในรอบนี้:</span>
              </div>
              <div className="font-mono font-bold text-indigo-900 dark:text-indigo-100">
                {progress.tokens_used.total_tokens.toLocaleString()} Tokens
              </div>
            </div>
          )}

          {/* Bank / Platform Breakdown (Appears when completed) */}
          {isCompleted && bankStats.length > 0 && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-purple-50/40 to-slate-50 dark:from-indigo-950/40 dark:via-purple-950/20 dark:to-slate-900/40 border border-indigo-200/80 dark:border-indigo-800/60 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-xs">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      เลือกธนาคาร / สถาบันการเงินที่ต้องการนำเข้า
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      พบรายการรอตรวจสอบทั้งหมด {pendingItems.length} รายการ สามารถคลิกเลือกเฉพาะธนาคารที่ต้องการได้ทันที
                    </p>
                  </div>
                </div>
              </div>

              {/* Grid of Bank Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {bankStats.map((bank) => (
                  <div
                    key={bank.key}
                    className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-indigo-400 dark:hover:border-indigo-600 transition flex items-center justify-between shadow-xs group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${getBankBadgeStyle(bank.key)}`}>
                          {bank.label}
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                          {bank.count} รายการ
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                        ยอดรวม ฿{bank.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleFinish(bank.key)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-600 hover:text-white dark:bg-indigo-950/60 dark:hover:bg-indigo-600 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shrink-0 shadow-2xs group-hover:scale-[1.02]"
                    >
                      <span>เลือก {bank.label}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Activity Terminal Window */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t('liveLogs')}</span>
              </span>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setLogViewMode('friendly')}
                  className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer flex items-center gap-1 ${
                    logViewMode === 'friendly'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <span>{t('logModeFriendly')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLogViewMode('raw')}
                  className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer flex items-center gap-1 ${
                    logViewMode === 'raw'
                      ? 'bg-slate-700 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <span>{t('logModeRaw')}</span>
                </button>
              </div>
            </div>

            {/* Adaptive Terminal Window (Light / Dark compliant) */}
            <div className="bg-slate-50 dark:bg-[#090d16] text-slate-800 dark:text-slate-100 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 ring-1 ring-slate-200/80 dark:ring-slate-800/80 h-52 overflow-y-auto space-y-1.5 select-text shadow-inner">
              {displayLogs.length === 0 ? (
                <div className="text-slate-500 dark:text-slate-400 italic py-6 text-center text-xs">
                  {t('waitingForLogs')}
                </div>
              ) : logViewMode === 'friendly' ? (
                displayLogs.map((log, i) => {
                  const item = formatLiveLog(log, locale);
                  return (
                    <div
                      key={i}
                      className="flex items-start sm:items-center gap-2 py-0.5 text-xs border-b border-slate-200/80 dark:border-slate-900/60 last:border-b-0"
                    >
                      {item.timestamp && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono font-medium shrink-0 select-none pt-0.5 sm:pt-0">
                          {item.timestamp}
                        </span>
                      )}
                      {item.platform && (
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold border shrink-0 ${getTerminalPlatformBadgeStyle(item.platform)}`}>
                          {item.platform}
                        </span>
                      )}
                      <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold shrink-0 ${item.badgeClass}`}>
                        {item.badgeText}
                      </span>
                      <span className="text-slate-800 dark:text-slate-100 font-medium text-xs leading-relaxed break-all flex-1 min-w-0">
                        {item.message}
                      </span>
                    </div>
                  );
                })
              ) : (
                displayLogs.map((log, i) => (
                  <React.Fragment key={i}>
                    {renderRawLogLine(log)}
                  </React.Fragment>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
          <div>
            {isRunning ? (
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline cursor-pointer"
              >
                ย่อหน้าต่าง (ทำงานต่อในพื้นหลัง)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsCacheManagerOpen(true)}
                className="px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/80 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>ล้างประวัติเพื่อสแกนใหม่ (Reset / Resync)</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isRunning && (
              <button
                type="button"
                onClick={handleCancelClick}
                disabled={cancelling}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                  confirmCancel
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-md animate-pulse'
                    : 'border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                }`}
              >
                <StopCircle className="w-4 h-4" />
                <span>
                  {cancelling
                    ? 'กำลังยกเลิก...'
                    : confirmCancel
                    ? 'ยืนยันยกเลิกการสแกนทันที'
                    : 'ยกเลิกการสแกน (Cancel)'}
                </span>
              </button>
            )}

            {!isRunning && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  ไว้ตรวจสอบทีหลัง
                </button>
                <button
                  type="button"
                  onClick={() => handleFinish('ALL')}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>
                    {isCompleted
                      ? pendingItems.length > 0
                        ? `ตรวจสอบและเลือกทุกรายการ (${pendingItems.length} รายการ)`
                        : 'เสร็จสิ้น & ดูพอร์ตการลงทุน'
                      : 'ปิดหน้าต่าง'}
                  </span>
                  {isCompleted && <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <SyncCacheManagerModal
        isOpen={isCacheManagerOpen}
        onClose={() => setIsCacheManagerOpen(false)}
        onResyncStarted={() => {
          // Progress polling will automatically update
        }}
      />
    </div>
  );
};
