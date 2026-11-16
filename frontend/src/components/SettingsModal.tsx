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
  RotateCw,
  Building2,
  RotateCcw,
} from 'lucide-react';
import {
  getUserSettings,
  updateUserSettings,
  testEmailConnection,
  startEmailSync,
  getEmailBrokerConfigs,
  updateEmailBrokerConfigs,
  resetEmailBrokerConfigs,
  type UserSettings,
  type EmailSyncResult,
  type EmailBrokerConfig,
} from '../lib/api';
import { EmailSyncModal } from './EmailSyncModal';
import { SyncCacheManagerModal } from './SyncCacheManagerModal';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';

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
  const toast = useToast();

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
  const [isSyncTrackerOpen, setIsSyncTrackerOpen] = useState(false);
  const [isCacheManagerOpen, setIsCacheManagerOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [brokerConfigs, setBrokerConfigs] = useState<EmailBrokerConfig[]>([]);
  const [resettingBrokers, setResettingBrokers] = useState(false);

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

        const brokers = await getEmailBrokerConfigs();
        if (Array.isArray(brokers)) {
          setBrokerConfigs(brokers);
        }
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
      if (brokerConfigs.length > 0) {
        await updateEmailBrokerConfigs(brokerConfigs);
      }
      const msg = t('settingsSaved') || 'บันทึกการตั้งค่าเรียบร้อยแล้ว';
      setStatusMessage({ type: 'success', text: msg });
      toast.success(msg);
    } catch (e: any) {
      const err = e.message || 'Failed to save settings';
      setStatusMessage({ type: 'error', text: err });
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleResetBrokers = async () => {
    setResettingBrokers(true);
    try {
      const defaults = await resetEmailBrokerConfigs();
      if (Array.isArray(defaults)) {
        setBrokerConfigs(defaults);
        const msg = 'รีเซ็ตการตั้งค่าสถาบันการเงินเป็นค่าเริ่มต้นแล้ว';
        setStatusMessage({ type: 'success', text: msg });
        toast.success(msg);
      }
    } catch (e: any) {
      const err = e.message || 'ไม่สามารถรีเซ็ตการตั้งค่าได้';
      setStatusMessage({ type: 'error', text: err });
      toast.error(err);
    } finally {
      setResettingBrokers(false);
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
      await startEmailSync();
      setIsSyncTrackerOpen(true);
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'เกิดข้อผิดพลาดในการเริ่มสแกนอีเมล' });
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

          {/* Section 3: Master Broker Rules & Dynamic Extraction Configuration */}
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-sky-500" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  การตั้งค่าสถาบันการเงิน & กฎการสแกน (Master Broker Rules)
                </h3>
              </div>
              <button
                type="button"
                onClick={handleResetBrokers}
                disabled={resettingBrokers}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 font-medium transition cursor-pointer disabled:opacity-50"
                title="คืนค่าการตั้งค่าสถาบันการเงินเป็นค่าเริ่มต้นทั้งหมด"
              >
                <RotateCcw className={`w-3 h-3 ${resettingBrokers ? 'animate-spin' : ''}`} />
                <span>รีเซ็ตเป็นค่าเริ่มต้น</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              เปิด/ปิดการสแกนเฉพาะสถาบันที่ใช้งาน หรือแก้ไขที่อยู่อีเมลผู้ส่ง (Sender Emails) เพื่อความแม่นยำสูงสุด
            </p>

            <div className="space-y-3">
              {brokerConfigs.map((b, idx) => (
                <div
                  key={b.key}
                  className={`p-3.5 rounded-xl border transition ${
                    b.enabled
                      ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700/80 shadow-sm'
                      : 'bg-slate-100/70 dark:bg-slate-900/40 border-dashed border-slate-300 dark:border-slate-800 opacity-60'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={b.enabled}
                          onChange={(e) => {
                            const updated = [...brokerConfigs];
                            updated[idx] = { ...b, enabled: e.target.checked };
                            setBrokerConfigs(updated);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                      </label>
                      <span className="font-semibold text-xs text-slate-900 dark:text-white">
                        {b.name}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                        {b.key}
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60">
                      {b.extraction_type === 'PDF_ATTACHMENT' && '📄 แนบไฟล์ PDF'}
                      {b.extraction_type === 'HTML_BODY_TABLE' && '📧 ตารางในเนื้อหาเมล'}
                      {b.extraction_type === 'PDF_POSITION_SNAPSHOT' && '📊 สรุปพอร์ตยอดสะสม'}
                      {!['PDF_ATTACHMENT', 'HTML_BODY_TABLE', 'PDF_POSITION_SNAPSHOT'].includes(b.extraction_type) && b.extraction_type}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mt-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        อีเมลผู้ส่ง (Sender Emails คั่นด้วยจุลภาค)
                      </label>
                      <input
                        type="text"
                        value={b.sender_emails.join(', ')}
                        disabled={!b.enabled}
                        onChange={(e) => {
                          const emails = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                          const updated = [...brokerConfigs];
                          updated[idx] = { ...b, sender_emails: emails };
                          setBrokerConfigs(updated);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                        placeholder="example@bank.com"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        รูปแบบรหัสผ่านที่ระบบใช้ (Password Patterns)
                      </label>
                      <div className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate">
                        {b.password_patterns.length > 0
                          ? b.password_patterns.join(' | ')
                          : 'ไม่ต้องใช้รหัสผ่าน (No Password)'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
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

              {syncResult.tokens_used && syncResult.tokens_used.total_tokens > 0 && (
                <div className="flex flex-wrap items-center justify-between bg-indigo-950/60 border border-indigo-700/50 rounded-lg px-3 py-2 text-xs text-indigo-200 gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Gemini AI Token ที่ใช้:</span>
                  </div>
                  <div className="font-mono font-bold text-white">
                    {syncResult.tokens_used.total_tokens.toLocaleString()}{' '}
                    <span className="font-normal text-[11px] text-indigo-300">
                      (Prompt: {syncResult.tokens_used.prompt_tokens.toLocaleString()} / Output: {syncResult.tokens_used.candidates_tokens.toLocaleString()})
                    </span>
                  </div>
                </div>
              )}

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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              {t('btnCancel')}
            </button>
            <button
              type="button"
              onClick={() => setIsCacheManagerOpen(true)}
              className="px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              title="จัดการแคชอีเมลและล้างประวัติเพื่อสแกนใหม่"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>จัดการแคช / สแกนใหม่</span>
            </button>
          </div>

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

      {/* Real-time Email Sync Progress Tracker Popup with Cancel Button */}
      <EmailSyncModal
        isOpen={isSyncTrackerOpen}
        onClose={() => setIsSyncTrackerOpen(false)}
        onComplete={() => {
          if (onSyncComplete) onSyncComplete();
        }}
      />

      {/* Sync Cache & Resync Manager Popup */}
      <SyncCacheManagerModal
        isOpen={isCacheManagerOpen}
        onClose={() => setIsCacheManagerOpen(false)}
        onResyncStarted={() => {
          setIsSyncTrackerOpen(true);
        }}
      />
    </div>
  );
};
