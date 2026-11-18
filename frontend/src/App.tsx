import React, { useState, useEffect, lazy, Suspense } from 'react';
import {
  SignIn,
  UserButton,
  useAuth,
  useUser,
} from '@clerk/react';
import {
  Wallet,
  TrendingUp,
  RefreshCw,
  Plus,
  Layers,
  PieChart as PieIcon,
  CheckCircle2,
  ShieldCheck,
  KeyRound,
  FileSpreadsheet,
  Sun,
  Moon,
  Globe,
  Eye,
  EyeOff,
  Sliders,
  RotateCw,
  LayoutDashboard,
  Calendar,
  CheckSquare,
} from 'lucide-react';
import { getPortfolio, triggerNavSync, setTokenGetter, getEmailSyncStatus, getPendingTransactions, type PortfolioSummary, type EmailSyncProgress } from './lib/api';
import { MetricCard } from './components/MetricCard';
import { PlatformBadge } from './components/PlatformBadge';
import { AllocationChart } from './components/AllocationChart';
import { HoldingsTable } from './components/HoldingsTable';
import { useTheme } from './lib/theme';
import { useI18n } from './lib/i18n';
import { useToast } from './lib/toast';

// React.lazy for heavy modal and page chunks to minimize initial bundle size
const TransactionModal = lazy(() =>
  import('./components/TransactionModal').then((m) => ({ default: m.TransactionModal }))
);
const TransactionHistoryPage = lazy(() =>
  import('./components/TransactionHistoryPage').then((m) => ({ default: m.TransactionHistoryPage }))
);
const CsvImportModal = lazy(() =>
  import('./components/CsvImportModal').then((m) => ({ default: m.CsvImportModal }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const EmailSyncModal = lazy(() =>
  import('./components/EmailSyncModal').then((m) => ({ default: m.EmailSyncModal }))
);
const TransactionReviewModal = lazy(() =>
  import('./components/TransactionReviewModal').then((m) => ({ default: m.TransactionReviewModal }))
);

const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse">
    <div className="h-9 w-56 bg-slate-200 dark:bg-slate-800 rounded-xl" />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="h-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm" />
      <div className="lg:col-span-2 h-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm" />
    </div>
    <div className="h-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm" />
  </div>
);

export const App: React.FC = () => {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const toast = useToast();
  const [dataVersion, setDataVersion] = useState(0);

  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('ALL');

  // Navigation View
  const [activeView, setActiveView] = useState<'DASHBOARD' | 'HISTORY'>('DASHBOARD');
  const [historyFundFilter, setHistoryFundFilter] = useState<string | null>(null);

  // Asset Filter for Holdings
  const [selectedAssetType, setSelectedAssetType] = useState<'ALL' | 'FUND' | 'STOCK' | 'PVD'>('ALL');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSyncTrackerOpen, setIsSyncTrackerOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewPlatformFilter, setReviewPlatformFilter] = useState<string>('ALL');
  const [pendingCount, setPendingCount] = useState(0);
  const [syncProgress, setSyncProgress] = useState<EmailSyncProgress | null>(null);

  const checkPendingCount = async () => {
    try {
      const pendingList = await getPendingTransactions('PENDING');
      setPendingCount(pendingList.length);
    } catch {
      // ignore
    }
  };

  // Background monitor for running email harvester
  useEffect(() => {
    let active = true;
    const checkSync = async () => {
      try {
        const s = await getEmailSyncStatus();
        if (active) {
          setSyncProgress(s);
        }
      } catch {
        // ignore
      }
    };
    checkSync();
    const interval = setInterval(checkSync, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const loadData = async () => {
    try {
      const data = await getPortfolio();
      setPortfolio(data);
      await checkPendingCount();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const triggerDataRefresh = async () => {
    setDataVersion((v) => v + 1);
    await loadData();
    await checkPendingCount();
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await triggerDataRefresh();
      toast.success(t('refreshSuccess') || (locale === 'th' ? 'รีเฟรชข้อมูลพอร์ตล่าสุดเรียบร้อยแล้ว' : 'Portfolio data refreshed'));
    } catch (e) {
      toast.error(locale === 'th' ? 'เกิดข้อผิดพลาดในการรีเฟรชข้อมูล' : 'Failed to refresh data');
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  useEffect(() => {
    setTokenGetter(getToken);
    if (isSignedIn) {
      loadData();
    }
  }, [isSignedIn, getToken]);

  const handleSyncNav = async () => {
    setSyncing(true);
    try {
      const res = await triggerNavSync();
      const dateMsg = res.latest_nav_date
        ? (locale === 'th' ? ` (ข้อมูลล่าสุดถึง ${res.latest_nav_date})` : ` (As of ${res.latest_nav_date})`)
        : '';
      const msg = (t('syncSuccess', { count: res.updated_funds_count }) || `ซิงค์ NAV สำเร็จ (${res.updated_funds_count} กองทุน)`) + dateMsg;
      toast.success(msg);
      await triggerDataRefresh();
    } catch (e) {
      console.error(e);
      toast.error(t('syncFailed') || (locale === 'th' ? 'การซิงค์ราคา NAV ขัดข้อง' : 'NAV sync failed'));
    } finally {
      setSyncing(false);
    }
  };

  const handleImportSuccess = (result?: { inserted_count: number; skipped_count: number }) => {
    if (result && result.inserted_count > 0) {
      toast.success(
        locale === 'th'
          ? `นำเข้าข้อมูล ${result.inserted_count} รายการเข้าสู่คิวรอตรวจสอบเรียบร้อยแล้ว กรุณาตรวจสอบความถูกต้อง`
          : `Queued ${result.inserted_count} transactions for review. Please verify before committing.`
      );
      setIsReviewModalOpen(true);
    }
    triggerDataRefresh();
  };

  const activePlatforms = portfolio?.platforms ? Object.keys(portfolio.platforms) : [];

  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => {
    return localStorage.getItem('fund_portfolio_privacy_mode') === 'true';
  });

  const togglePrivacyMode = () => {
    setIsPrivacyMode((prev) => {
      const next = !prev;
      localStorage.setItem('fund_portfolio_privacy_mode', String(next));
      return next;
    });
  };

  const formatMoney = (val?: string) => {
    if (!val) return '0.00';
    return parseFloat(val).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatDisplayMoney = (val?: string) => {
    if (isPrivacyMode) return '******';
    return formatMoney(val);
  };

  const getUnrealizedTrend = (val?: string) => {
    if (!val) return 'neutral';
    const num = parseFloat(val);
    if (num > 0) return 'positive';
    if (num < 0) return 'negative';
    return 'neutral';
  };

  // รอให้ Clerk โหลดข้อมูลสถานะ
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        {t('loadingSecurity')}
      </div>
    );
  }

  // 1. กรณีที่ยังไม่ได้เข้าสู่ระบบ (Signed Out View)
  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
        <div className="max-w-md w-full text-center mb-8 relative z-10">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 shadow-sm mb-4 logo-container select-none">
            <span className="font-mono text-lg font-extrabold tracking-tight text-white">FP</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
            {t('appTitle')}
          </h1>
          <p className="text-slate-400 text-sm">
            {t('appSubtitle')}
          </p>

          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-slate-400 font-medium">
            <span className="flex items-center gap-1">
              <KeyRound className="w-3.5 h-3.5 text-indigo-400" /> Passkey (Touch ID)
            </span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> MFA / TOTP
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" /> Google SSO
            </span>
          </div>
        </div>

        <div className="relative z-10 w-full flex justify-center">
          <SignIn routing="hash" />
        </div>
      </div>
    );
  }

  // 2. กรณีที่เข้าสู่ระบบเรียบร้อยแล้ว (Signed In Dashboard View)
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header Navigation */}
      <header className="border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 transition-colors">
        <div className="max-w-[1720px] 2xl:max-w-[1840px] w-full mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 sm:gap-4">
          {/* Left: Brand Logo, Title & Main Nav Tabs */}
          <div className="flex items-center gap-3 sm:gap-6 min-w-0 shrink-0">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-xs select-none shrink-0">
                <span className="font-mono text-xs font-black tracking-tight text-white">FP</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                  {t('appTitle')}
                </span>
                <span className="hidden sm:inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-mono font-medium whitespace-nowrap">
                  SEC v2
                </span>
              </div>
            </div>

            {/* Main Navigation Segmented Switcher */}
            <nav className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs shrink-0">
              <button
                onClick={() => {
                  setActiveView('DASHBOARD');
                  setHistoryFundFilter(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeView === 'DASHBOARD'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>{t('navDashboard')}</span>
              </button>
              <button
                onClick={() => setActiveView('HISTORY')}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeView === 'HISTORY'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{t('navHistory')}</span>
              </button>
            </nav>
          </div>

          {/* Right: Actions & Tools */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Cluster 1: Data Quick Actions */}
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs">
              {/* Refresh Dashboard Data */}
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing || loading}
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
                title={t('refresh')}
                aria-label={t('refresh')}
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
              </button>

              {/* Sync SEC NAV */}
              <button
                onClick={handleSyncNav}
                disabled={syncing}
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
                title={t('syncNav')}
                aria-label={t('syncNav')}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
              </button>

              {/* Privacy Mode Toggle */}
              <button
                onClick={togglePrivacyMode}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isPrivacyMode
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800'
                }`}
                title={isPrivacyMode ? t('privacyModeOn') : t('privacyModeOff')}
                aria-label={t('privacyModeToggle')}
              >
                {isPrivacyMode ? <EyeOff className="w-3.5 h-3.5 text-amber-500" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Import Statement (PDF / CSV) */}
            <button
              onClick={() => setIsCsvModalOpen(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
              title={t('importerSubtitle')}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span className="hidden lg:inline">{t('importData')}</span>
            </button>

            {/* Primary CTA "+ Record Transaction" */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
              <span className="hidden md:inline text-white">{t('addTransaction')}</span>
            </button>

            {/* Staged Import / Review Pending Button */}
            {pendingCount > 0 && (
              <button
                onClick={() => setIsReviewModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-amber-500/15 dark:bg-amber-950/60 border border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-300 text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer hover:bg-amber-500/25 animate-pulse"
                title={t('reviewPendingTitle')}
              >
                <CheckSquare className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>{t('reviewPending', { n: pendingCount })}</span>
              </button>
            )}

            {/* Live Email Harvester Activity Pill (Visible whenever sync is actively running) */}
            {syncProgress?.is_running && (
              <button
                onClick={() => setIsSyncTrackerOpen(true)}
                className="px-2.5 py-1.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-950/60 border border-indigo-500/40 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-indigo-500/20 transition shadow-xs animate-pulse"
                title="คลิกเพื่อดูความคืบหน้าการสแกน หรือกดยกเลิก"
              >
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping shrink-0" />
                <span className="hidden sm:inline">
                  {locale === 'th' ? 'สแกนเมลอยู่' : 'Syncing'} ({syncProgress.broker || '...'})
                </span>
                <span className="sm:hidden text-[10px]">Syncing</span>
              </button>
            )}

            {/* Divider */}
            <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 sm:mx-1 hidden sm:block" />

            {/* Settings Modal */}
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition cursor-pointer"
              title={t('settings')}
              aria-label={t('settings')}
            >
              <Sliders className="w-4 h-4" />
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition cursor-pointer"
              title={theme === 'dark' ? t('themeLight') : t('themeDark')}
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>

            {/* Language Toggle [TH | EN] */}
            <button
              onClick={() => setLocale(locale === 'th' ? 'en' : 'th')}
              className="px-2 py-1.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition flex items-center gap-1 cursor-pointer"
              title="สลับภาษา (TH / EN)"
            >
              <Globe className="w-3 h-3 text-indigo-500" />
              <span>{locale.toUpperCase()}</span>
            </button>

            {/* Clerk User Avatar */}
            <div className="pl-1 flex items-center">
              <UserButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content: Dashboard or Full-Page Transaction History */}
      <main className="flex-1 max-w-[1720px] 2xl:max-w-[1840px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {loading ? (
          <DashboardSkeleton />
        ) : activeView === 'HISTORY' ? (
          <Suspense fallback={<DashboardSkeleton />}>
            <TransactionHistoryPage
              refreshTrigger={dataVersion}
              initialFundFilter={historyFundFilter}
              isPrivacyMode={isPrivacyMode}
              onBack={() => {
                setActiveView('DASHBOARD');
                setHistoryFundFilter(null);
              }}
              onDataChanged={triggerDataRefresh}
            />
          </Suspense>
        ) : (
          <>
            {/* Greeting banner */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {t('greeting', { name: user?.firstName || user?.username || (locale === 'th' ? 'นักลงทุน' : 'Investor') })}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('greetingSubtitle')}</p>
              </div>
            </div>

            {/* Top 4 Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title={t('totalValue')}
                value={formatDisplayMoney(portfolio?.market_value)}
                trend="neutral"
                icon={<Wallet className="w-4 h-4" />}
              />
              <MetricCard
                title={t('totalCost')}
                value={formatDisplayMoney(portfolio?.total_cost)}
                trend="neutral"
                icon={<Layers className="w-4 h-4" />}
              />
              <MetricCard
                title={t('unrealizedPl')}
                value={formatDisplayMoney(portfolio?.total_unrealized_pl)}
                subValue={`${portfolio?.total_unrealized_pl_pct || '0'}%`}
                trend={getUnrealizedTrend(portfolio?.total_unrealized_pl)}
                icon={<TrendingUp className="w-4 h-4" />}
              />
              <MetricCard
                title={t('realizedPl')}
                value={formatDisplayMoney(portfolio?.total_realized_pl)}
                trend={getUnrealizedTrend(portfolio?.total_realized_pl)}
                icon={<TrendingUp className="w-4 h-4" />}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <PieIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> {t('allocationTitle')}
                  </h3>
                </div>
                <AllocationChart platforms={portfolio?.platforms || {}} />
              </div>

              <div className="lg:col-span-2 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">{t('platformOverview')}</h3>
                {activePlatforms.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activePlatforms.map((plat) => {
                      const p = portfolio?.platforms[plat];
                      const upl = p?.unrealized_pl || '0';
                      const uplPct = p?.unrealized_pl_pct || '0';
                      const isPos = parseFloat(upl) >= 0;

                      return (
                        <div
                          key={plat}
                          onClick={() => setSelectedPlatform(selectedPlatform === plat ? 'ALL' : plat)}
                          className={`p-4 rounded-xl border cursor-pointer transition ${
                            selectedPlatform === plat
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20 shadow-sm'
                              : 'border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <PlatformBadge platform={plat} />
                            <span className="text-xs font-mono text-slate-400">
                              {p ? `${p.allocation_pct}%` : '0%'}
                            </span>
                          </div>
                          <div className="flex justify-between items-end">
                            <div>
                              <div className="text-xs text-slate-400">{t('marketValHeader')}</div>
                              <div className="text-base font-bold text-slate-900 dark:text-white font-mono">
                                {p ? formatDisplayMoney(p.market_value) : '0.00'}{' '}
                                <span className="text-[10px] text-slate-400">THB</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-slate-400">{t('plHeader')}</div>
                              <div
                                className={`text-xs font-bold font-mono ${
                                  isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {p
                                  ? isPrivacyMode
                                    ? `****** (${isPos ? '+' : ''}${uplPct}%)`
                                    : `${isPos ? '+' : ''}${formatMoney(upl)} (${uplPct}%)`
                                  : '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded-xl my-auto">
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-3">{t('noPlatformData')}</p>
                    <button
                      onClick={() => setIsAddModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer shadow-sm btn-primary-indigo"
                    >
                      <Plus className="w-3.5 h-3.5 text-white" />
                      <span className="text-white">{t('addTransaction')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <HoldingsTable
              holdings={portfolio?.holdings || []}
              selectedPlatform={selectedPlatform}
              onSelectPlatform={setSelectedPlatform}
              activePlatforms={activePlatforms}
              selectedAssetType={selectedAssetType}
              onSelectAssetType={setSelectedAssetType}
              isPrivacyMode={isPrivacyMode}
              userId={user?.id}
              onViewHistory={(fundAbbr) => {
                setHistoryFundFilter(fundAbbr);
                setActiveView('HISTORY');
              }}
            />
          </>
        )}
      </main>

      {/* Modals loaded lazily on demand via Suspense */}
      <Suspense fallback={null}>
        {isAddModalOpen && (
          <TransactionModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            onSuccess={(payload?: any) => {
              triggerDataRefresh();
              const msg = payload?.message || (locale === 'th' ? 'บันทึกรายการธุรกรรมเรียบร้อยแล้ว' : 'Transaction saved successfully');
              toast.success(msg);
            }}
            onOpenReview={() => setIsReviewModalOpen(true)}
          />
        )}
        {isCsvModalOpen && (
          <CsvImportModal
            isOpen={isCsvModalOpen}
            onClose={() => setIsCsvModalOpen(false)}
            onSuccess={handleImportSuccess}
          />
        )}
        {isSettingsModalOpen && (
          <SettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            onSyncComplete={triggerDataRefresh}
          />
        )}
        {isSyncTrackerOpen && (
          <EmailSyncModal
            isOpen={isSyncTrackerOpen}
            onClose={() => setIsSyncTrackerOpen(false)}
            onComplete={(chosenPlatform) => {
              setReviewPlatformFilter(chosenPlatform || 'ALL');
              setIsReviewModalOpen(true);
              triggerDataRefresh();
              toast.info(locale === 'th' ? 'ซิงค์อีเมลเสร็จสิ้น กำลังเปิดหน้าตรวจสอบรายการ' : 'Email sync complete. Opening review...');
            }}
          />
        )}
        {isReviewModalOpen && (
          <TransactionReviewModal
            isOpen={isReviewModalOpen}
            initialPlatform={reviewPlatformFilter}
            onClose={() => setIsReviewModalOpen(false)}
            onSuccess={() => {
              triggerDataRefresh();
            }}
          />
        )}
      </Suspense>
    </div>
  );
};

export default App;
