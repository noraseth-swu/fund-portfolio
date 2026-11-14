import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Key,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ExternalLink,
  Sparkles,
  Sliders,
} from 'lucide-react';
import {
  getUserSettings,
  updateUserSettings,
  testEmailConnection,
  syncEmailStatements,
  type UserSettings,
  type EmailSyncResult,
} from '../lib/api';
import { useI18n } from '../lib/i18n';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

const MONTHS_EN = [
  { val: '01', abbr: 'Jan', name: 'January (มกราคม)' },
  { val: '02', abbr: 'Feb', name: 'February (กุมภาพันธ์)' },
  { val: '03', abbr: 'Mar', name: 'March (มีนาคม)' },
  { val: '04', abbr: 'Apr', name: 'April (เมษายน)' },
  { val: '05', abbr: 'May', name: 'May (พฤษภาคม)' },
  { val: '06', abbr: 'Jun', name: 'June (มิถุนายน)' },
  { val: '07', abbr: 'Jul', name: 'July (กรกฎาคม)' },
  { val: '08', abbr: 'Aug', name: 'August (สิงหาคม)' },
  { val: '09', abbr: 'Sep', name: 'September (กันยายน)' },
  { val: '10', abbr: 'Oct', name: 'October (ตุลาคม)' },
  { val: '11', abbr: 'Nov', name: 'November (พฤศจิกายน)' },
  { val: '12', abbr: 'Dec', name: 'December (ธันวาคม)' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSyncComplete,
}) => {
  const { t } = useI18n();

  const [settings, setSettings] = useState<UserSettings>({
    user_id: '',
    gmail_account: '',
    gmail_app_password: '',
    dob_day: '01',
    dob_month: '01',
    dob_year_ce: '1980',
    dob_year_be: '2523',
    national_id_last5: '',
    auto_sync_enabled: true,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<EmailSyncResult | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load user settings on modal open
  useEffect(() => {
    if (!isOpen) return;
    const fetchSettings = async () => {
      setLoading(true);
      setTestResult(null);
      setSyncResult(null);
      setStatusMessage(null);
      try {
        const data = await getUserSettings();
        setSettings({
          user_id: data.user_id || '',
          gmail_account: data.gmail_account || '',
          gmail_app_password: data.gmail_app_password || '',
          dob_day: data.dob_day || '01',
          dob_month: data.dob_month || '01',
          dob_year_ce: data.dob_year_ce || '1980',
          dob_year_be: data.dob_year_be || '2523',
          national_id_last5: data.national_id_last5 || '',
          auto_sync_enabled: data.auto_sync_enabled ?? true,
          last_sync_at: data.last_sync_at,
        });
      } catch (e: any) {
        console.error('Failed to load settings:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [isOpen]);

  if (!isOpen) return null;

  // Real-time password calculations for previews
  const dayStr = settings.dob_day ? settings.dob_day.padStart(2, '0') : '01';
  const monthObj = MONTHS_EN.find((m) => m.val === settings.dob_month) || MONTHS_EN[0];
  const yearCE = settings.dob_year_ce || '1980';
  const yearBE = settings.dob_year_be || (parseInt(yearCE, 10) + 543).toString();
  const idLast5 = settings.national_id_last5 || 'XXXXX';

  const previewTtb = `${dayStr}${monthObj.abbr}${yearCE}`;
  const previewDime = `${dayStr}${monthObj.val}${yearCE}`;
  const previewScb = idLast5.padStart(5, '0');
  const previewKassetPvd = `${dayStr}${monthObj.val}${yearBE}`;

  const handleYearCeChange = (ce: string) => {
    const ceNum = parseInt(ce, 10);
    const be = !isNaN(ceNum) ? (ceNum + 543).toString() : '';
    setSettings((prev) => ({ ...prev, dob_year_ce: ce, dob_year_be: be }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      await updateUserSettings(settings);
      setStatusMessage({ type: 'success', text: t('settingsSaved') });
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testEmailConnection({
        gmail_account: settings.gmail_account,
        gmail_app_password: settings.gmail_app_password,
      });
      if (res.success) {
        setTestResult({
          success: true,
          message: res.message || `เชื่อมต่อสำเร็จ (พบ ${res.inbox_messages || 0} ข้อความ)`,
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'ไม่สามารถเชื่อมต่อได้ กรุณาตรวจสอบรหัสผ่าน App Password',
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    setStatusMessage(null);
    try {
      // Auto save latest values before syncing
      await updateUserSettings(settings);
      const res = await syncEmailStatements();
      setSyncResult(res);
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'เกิดข้อผิดพลาดในการกวาดอีเมล' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {t('settingsTitle')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('settingsSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <p className="text-xs">กำลังโหลดข้อมูลการตั้งค่า...</p>
            </div>
          ) : (
            <>
              {statusMessage && (
                <div
                  className={`p-3.5 rounded-xl text-xs font-medium flex items-center gap-2.5 ${
                    statusMessage.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {statusMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{statusMessage.text}</span>
                </div>
              )}

          {/* Section 1: Gmail Account & App Password */}
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {t('tabGmailSync')}
                </h3>
              </div>
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
              >
                <span>สร้าง App Password</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('gmailAccountLabel')}
                </label>
                <input
                  type="email"
                  value={settings.gmail_account || ''}
                  onChange={(e) => setSettings({ ...settings, gmail_account: e.target.value })}
                  placeholder="investor@gmail.com"
                  className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('gmailPasswordLabel')}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={settings.gmail_app_password || ''}
                    onChange={(e) =>
                      setSettings({ ...settings, gmail_app_password: e.target.value })
                    }
                    placeholder="xxxx xxxx xxxx xxxx"
                    className="w-full px-3.5 py-2 pr-10 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              💡 {t('gmailPasswordHelp')} (รหัสผ่านนี้มีไว้สำหรับเข้าอ่าน Confirmation Note ผ่าน IMAP อย่างปลอดภัย)
            </p>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || !settings.gmail_account || !settings.gmail_app_password}
                className="px-3.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin text-indigo-400' : ''}`} />
                <span>{testing ? t('testingConnection') : t('testConnection')}</span>
              </button>

              {testResult && (
                <div
                  className={`text-xs flex items-center gap-1.5 font-medium ${
                    testResult.success
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Decryption Keys */}
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {t('tabDecryptionKeys')}
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  วันเกิด (DD)
                </label>
                <select
                  value={settings.dob_day || '01'}
                  onChange={(e) => setSettings({ ...settings, dob_day: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  {Array.from({ length: 31 }, (_, i) => {
                    const d = (i + 1).toString().padStart(2, '0');
                    return (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  เดือนเกิด (MM)
                </label>
                <select
                  value={settings.dob_month || '01'}
                  onChange={(e) => setSettings({ ...settings, dob_month: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  {MONTHS_EN.map((m) => (
                    <option key={m.val} value={m.val}>
                      {m.val} - {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  ปีเกิด ค.ศ. (CE)
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={settings.dob_year_ce || ''}
                  onChange={(e) => handleYearCeChange(e.target.value)}
                  placeholder="1980"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  เลขท้ายบัตร ปชช. (5 หลัก)
                </label>
                <input
                  type="text"
                  maxLength={5}
                  value={settings.national_id_last5 || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, national_id_last5: e.target.value.replace(/\D/g, '') })
                  }
                  placeholder="12345"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Institution Password Previews */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {t('tabBankPreview')} (ระบบจะจับคู่รหัสผ่านให้อัตโนมัติเมื่อพบเอกสารจากสถาบันนั้นๆ):
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80">
                  <div className="font-semibold text-blue-600 dark:text-blue-400">ttb Smart Port</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">DDMmmYYYY</div>
                  <div className="font-mono font-bold mt-1 text-slate-800 dark:text-slate-200">
                    {previewTtb}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80">
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400">Dime!</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">DDMMYYYY (CE)</div>
                  <div className="font-mono font-bold mt-1 text-slate-800 dark:text-slate-200">
                    {previewDime}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80">
                  <div className="font-semibold text-purple-600 dark:text-purple-400">SCB EASY / SCBAM</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">เลขท้ายบัตร 5 หลัก</div>
                  <div className="font-mono font-bold mt-1 text-slate-800 dark:text-slate-200">
                    {previewScb}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80">
                  <div className="font-semibold text-teal-600 dark:text-teal-400">KASSET PVD</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">DDMMYYYY (พ.ศ.)</div>
                  <div className="font-mono font-bold mt-1 text-slate-800 dark:text-slate-200">
                    {previewKassetPvd}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Live Sync Summary if executed */}
          {syncResult && (
            <div className="p-4 rounded-xl bg-slate-900 border border-indigo-500/30 text-white space-y-2">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <Sparkles className="w-4 h-4" />
                <span>
                  {t('syncCompleted', {
                    n: syncResult.transactions_inserted,
                    dup: syncResult.transactions_skipped,
                  })}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-2">
                <div className="bg-slate-800/80 p-2 rounded-lg">
                  <span className="text-slate-400">สแกนอีเมล:</span>{' '}
                  <span className="font-bold">{syncResult.emails_scanned}</span>
                </div>
                <div className="bg-slate-800/80 p-2 rounded-lg">
                  <span className="text-slate-400">พบไฟล์แนบ:</span>{' '}
                  <span className="font-bold">{syncResult.attachments_found}</span>
                </div>
                <div className="bg-emerald-950/60 text-emerald-300 p-2 rounded-lg border border-emerald-800/50">
                  <span>นำเข้าสำเร็จ:</span>{' '}
                  <span className="font-bold">{syncResult.transactions_inserted}</span>
                </div>
                <div className="bg-amber-950/60 text-amber-300 p-2 rounded-lg border border-amber-800/50">
                  <span>ข้ามรายการซ้ำ:</span>{' '}
                  <span className="font-bold">{syncResult.transactions_skipped}</span>
                </div>
              </div>
              {syncResult.details && syncResult.details.length > 0 && (
                <div className="pt-2 max-h-36 overflow-y-auto space-y-1 text-[11px] font-mono text-slate-300">
                  {syncResult.details.map((d, i) => (
                    <div key={i} className="truncate">
                      • {d}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            {t('btnCancel')}
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing || !settings.gmail_account || !settings.gmail_app_password}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? t('syncingEmails') : t('syncNow')}</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>{saving ? t('savingSettings') : t('saveSettings')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
