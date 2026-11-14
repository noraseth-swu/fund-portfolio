import React, { useEffect, useState, useRef } from 'react';
import {
  getEmailSyncStatus,
  cancelEmailSync,
  type EmailSyncProgress,
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
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

const PLATFORMS = [
  { key: 'TTB', label: 'ttb', desc: 'TMBThanachart' },
  { key: 'DIME', label: 'Dime!', desc: 'KKP Dime' },
  { key: 'SCB', label: 'SCB', desc: 'SCB Easy / SCBAM' },
  { key: 'KBANK', label: 'KBank', desc: 'Kasikorn Asset' },
  { key: 'KBANK_PVD', label: 'KBank (PVD)', desc: 'Provident Fund' },
];

export const EmailSyncModal: React.FC<Props> = ({ isOpen, onClose, onComplete }) => {
  const [progress, setProgress] = useState<EmailSyncProgress | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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

  // Auto scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [progress?.recent_logs, progress?.log_tail]);

  if (!isOpen) return null;

  const isRunning = progress?.is_running ?? false;
  const isCompleted = progress?.completed && !isRunning;
  const isCancelled = progress?.cancelled && !isRunning;

  const currentBroker = (progress?.broker || '').toUpperCase();
  const currentBrokerIdx = PLATFORMS.findIndex(
    (p) => p.key === currentBroker || (currentBroker === 'KBANK_PVD' && p.key === 'KBANK_PVD')
  );

  // Calculate percentage
  let progressPct = 0;
  if (isCompleted) {
    progressPct = 100;
  } else if (progress?.total_emails && progress.total_emails > 0) {
    const emailRatio = (progress.email_index || 0) / progress.total_emails;
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

  const handleFinish = () => {
    if (onComplete) {
      onComplete();
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
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="ปิดหน้าต่าง (การสแกนยังคงทำงานต่อในพื้นหลัง)"
          >
            <X className="w-5 h-5" />
          </button>
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
              <div className="text-slate-500 dark:text-slate-400 text-[11px]">สแกนแล้ว</div>
              <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-100 mt-0.5">
                {progress?.emails_scanned || 0}
                {progress?.total_emails ? (
                  <span className="text-xs text-slate-400 font-normal"> / {progress.total_emails}</span>
                ) : null}
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

          {/* Live Activity Terminal Window */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                <span>บันทึกการทำงานแบบเรียลไทม์ (Live Logs)</span>
              </span>
              <span className="font-mono text-[10px] text-slate-400">auto-updating</span>
            </div>

            <div className="bg-slate-950 text-slate-200 font-mono text-[11px] p-3.5 rounded-xl border border-slate-800 h-44 overflow-y-auto space-y-1 select-text">
              {displayLogs.length === 0 ? (
                <div className="text-slate-500 italic py-4 text-center">
                  กำลังรอรับข้อมูล Log จาก Email Harvester...
                </div>
              ) : (
                displayLogs.map((log, i) => {
                  const isSuccess = log.includes('[+]') || log.includes('[✓]') || log.includes('COMPLETED');
                  const isWarning = log.includes('[WARNING]') || log.includes('429');
                  const isError = log.includes('[ERROR]') || log.includes('[✗]');

                  return (
                    <div
                      key={i}
                      className={`leading-relaxed truncate ${
                        isSuccess
                          ? 'text-emerald-400'
                          : isWarning
                          ? 'text-amber-400'
                          : isError
                          ? 'text-rose-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {log}
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
          <div>
            {isRunning && (
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline cursor-pointer"
              >
                ย่อหน้าต่าง (ทำงานต่อในพื้นหลัง)
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
              <button
                type="button"
                onClick={handleFinish}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>{isCompleted ? 'เสร็จสิ้น & ดูพอร์ตการลงทุน' : 'ปิดหน้าต่าง'}</span>
                {isCompleted && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
