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
  Play,
  Pause,
  Database,
  Activity,
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

interface MonthItem {
  val: string;
  abbr: string;
  nameTh: string;
  nameEn: string;
}

const MONTHS_LIST: MonthItem[] = [
  { val: '01', abbr: 'Jan', nameTh: 'มกราคม', nameEn: 'January' },
  { val: '02', abbr: 'Feb', nameTh: 'กุมภาพันธ์', nameEn: 'February' },
  { val: '03', abbr: 'Mar', nameTh: 'มีนาคม', nameEn: 'March' },
  { val: '04', abbr: 'Apr', nameTh: 'เมษายน', nameEn: 'April' },
  { val: '05', abbr: 'May', nameTh: 'พฤษภาคม', nameEn: 'May' },
  { val: '06', abbr: 'Jun', nameTh: 'มิถุนายน', nameEn: 'June' },
  { val: '07', abbr: 'Jul', nameTh: 'กรกฎาคม', nameEn: 'July' },
  { val: '08', abbr: 'Aug', nameTh: 'สิงหาคม', nameEn: 'August' },
  { val: '09', abbr: 'Sep', nameTh: 'กันยายน', nameEn: 'September' },
  { val: '10', abbr: 'Oct', nameTh: 'ตุลาคม', nameEn: 'October' },
  { val: '11', abbr: 'Nov', nameTh: 'พฤศจิกายน', nameEn: 'November' },
  { val: '12', abbr: 'Dec', nameTh: 'ธันวาคม', nameEn: 'December' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSyncComplete,
}) => {
  const { t, locale } = useI18n();
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

  // Historical NAV Backfill State (Slice 30)
  interface BackfillStatus {
    is_running: boolean;
    total_funds: number;
    completed_funds: number;
    pending_funds: number;
    failed_funds: number;
    current_proj_id: string | null;
    current_proj_abbr: string | null;
    percent_completed: number;
    last_updated_at: string | null;
  }
  const [backfillStatus, setBackfillStatus] = useState<BackfillStatus | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
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

  useEffect(() => {
    if (!isOpen) return;
    const fetchBackfill = async () => {
      try {
        const res = await fetch('/api/nav/backfill/status');
        if (res.ok) {
          const data = await res.json();
          setBackfillStatus(data);
        }
      } catch (_err) {
        // Safe catch for test environments
      }
    };
    fetchBackfill();
    const interval = setInterval(fetchBackfill, 3000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const handleToggleBackfill = async () => {
    if (!backfillStatus) return;
    setBackfillLoading(true);
    try {
      const endpoint = backfillStatus.is_running
        ? '/api/nav/backfill/pause'
        : '/api/nav/backfill/start';
      await fetch(endpoint, { method: 'POST' });
      const res = await fetch('/api/nav/backfill/status');
      if (res.ok) {
        const data = await res.json();
        setBackfillStatus(data);
        toast.success(
          data.is_running
            ? t('backfillResumed')
            : t('backfillPaused')
        );
      }
    } catch (err: any) {
      toast.error(err.message || t('backfillToggleError'));
    } finally {
      setBackfillLoading(false);
    }
  };

  if (!isOpen) return null;

  // Real-time password calculations for previews
  const dayStr = settings.dob_day ? settings.dob_day.padStart(2, '0') : '01';
  const monthObj = MONTHS_LIST.find((m) => m.val === settings.dob_month) || MONTHS_LIST[0];
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
      const msg = t('settingsSaved');
      setStatusMessage({ type: 'success', text: msg });
      toast.success(msg);
    } catch (e: any) {
      const err = e.message || t('settingsSaveFailed');
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
        const msg = t('resetBrokersSuccess');
        setStatusMessage({ type: 'success', text: msg });
        toast.success(msg);
      }
    } catch (e: any) {
      const err = e.message || t('resetBrokersFailed');
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
          message: res.message || t('connectionSuccess', { count: res.inbox_messages || 0 }),
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || t('connectionFailedCheckPassword'),
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.message || t('connectionError'),
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
      setStatusMessage({ type: 'error', text: e.message || t('syncStartError') });
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
              <p className="text-xs">{t('loadingSettings')}</p>
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
                <span>{t('createAppPassword')}</span>
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
              💡 {t('gmailPasswordHelp')} ({t('gmailPasswordHelpDetail')})
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
                  {t('dobDay')}
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
                  {t('dobMonth')}
                </label>
                <select
                  value={settings.dob_month || '01'}
                  onChange={(e) => setSettings({ ...settings, dob_month: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  {MONTHS_LIST.map((m) => (
                    <option key={m.val} value={m.val}>
                      {m.val} - {locale === 'th' ? `${m.nameEn} (${m.nameTh})` : m.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t('dobYearCe')}
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
                  {t('nationalIdLast5')}
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
                {t('tabBankPreview')} ({t('tabBankPreviewSubtitle')}):
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
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('idLast5Digits')}</div>
                  <div className="font-mono font-bold mt-1 text-slate-800 dark:text-slate-200">
                    {previewScb}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80">
                  <div className="font-semibold text-teal-600 dark:text-teal-400">KASSET PVD</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('dobFormatBe')}</div>
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
                  {t('masterBrokerRulesTitle')}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleResetBrokers}
                disabled={resettingBrokers}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 font-medium transition cursor-pointer disabled:opacity-50"
                title={t('resetBrokersTooltip')}
              >
                <RotateCcw className={`w-3 h-3 ${resettingBrokers ? 'animate-spin' : ''}`} />
                <span>{t('resetToDefaults')}</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('masterBrokerRulesDesc')}
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
                      {b.extraction_type === 'PDF_ATTACHMENT' && t('extractPdfAttachment')}
                      {b.extraction_type === 'HTML_BODY_TABLE' && t('extractHtmlTable')}
                      {b.extraction_type === 'PDF_POSITION_SNAPSHOT' && t('extractPositionSnapshot')}
                      {!['PDF_ATTACHMENT', 'HTML_BODY_TABLE', 'PDF_POSITION_SNAPSHOT'].includes(b.extraction_type) && b.extraction_type}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mt-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        {t('senderEmailsLabel')}
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
                        {t('passwordPatternsLabel')}
                      </label>
                      <div className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate">
                        {b.password_patterns.length > 0
                          ? b.password_patterns.join(' | ')
                          : t('noPasswordRequired')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2.5: Historical NAV Backfill Progress & Controls (Slice 30) */}
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {t('navBackfillTitle')}
                </h3>
              </div>
              {backfillStatus && (
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      backfillStatus.is_running
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                        : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        backfillStatus.is_running
                          ? 'bg-emerald-500 animate-pulse'
                          : 'bg-amber-500'
                      }`}
                    />
                    {backfillStatus.is_running ? t('backfillRunning') : t('backfillPausedStatus')}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleBackfill}
                    disabled={backfillLoading}
                    className={`px-3 py-1 text-xs rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                      backfillStatus.is_running
                        ? 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                    }`}
                  >
                    {backfillStatus.is_running ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>{t('pauseBackfill')}</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>{t('resumeBackfill')}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {backfillStatus && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>
                    {t('backfillProgress', {
                      completed: backfillStatus.completed_funds.toLocaleString(),
                      total: backfillStatus.total_funds.toLocaleString(),
                    })}
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {backfillStatus.percent_completed.toFixed(1)}%
                  </span>
                </div>

                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, backfillStatus.percent_completed))}%` }}
                  />
                </div>

                {backfillStatus.is_running && backfillStatus.current_proj_id && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5 pt-1">
                    <Activity className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                    <span>{t('processingFund')}:</span>
                    <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                      {backfillStatus.current_proj_abbr || backfillStatus.current_proj_id} ({backfillStatus.current_proj_id})
                    </span>
                  </p>
                )}
              </div>
            )}
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
                  <span className="text-slate-400">{t('emailsScanned')}:</span>{' '}
                  <span className="font-bold">{syncResult.emails_scanned}</span>
                </div>
                <div className="bg-slate-800/80 p-2 rounded-lg">
                  <span className="text-slate-400">{t('attachmentsFound')}:</span>{' '}
                  <span className="font-bold">{syncResult.attachments_found}</span>
                </div>
                <div className="bg-emerald-950/60 text-emerald-300 p-2 rounded-lg border border-emerald-800/50">
                  <span>{t('importedSuccess')}:</span>{' '}
                  <span className="font-bold">{syncResult.transactions_inserted}</span>
                </div>
                <div className="bg-amber-950/60 text-amber-300 p-2 rounded-lg border border-amber-800/50">
                  <span>{t('skippedDuplicates')}:</span>{' '}
                  <span className="font-bold">{syncResult.transactions_skipped}</span>
                </div>
              </div>

              {syncResult.tokens_used && syncResult.tokens_used.total_tokens > 0 && (
                <div className="flex flex-wrap items-center justify-between bg-indigo-950/60 border border-indigo-700/50 rounded-lg px-3 py-2 text-xs text-indigo-200 gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{t('geminiTokensUsed')}:</span>
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
              title={t('manageCacheTooltip')}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>{t('manageCacheResync')}</span>
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
