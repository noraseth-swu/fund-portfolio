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
  History,
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
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  LayoutDashboard,
  Calendar,
  X,
} from 'lucide-react';
import { getPortfolio, triggerNavSync, setTokenGetter, getEmailSyncStatus, type PortfolioSummary, type EmailSyncProgress } from './lib/api';
import { MetricCard } from './components/MetricCard';
import { PlatformBadge } from './components/PlatformBadge';
import { AllocationChart } from './components/AllocationChart';
import { useTheme } from './lib/theme';
import { useI18n } from './lib/i18n';

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

  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('ALL');

  // Navigation View
  const [activeView, setActiveView] = useState<'DASHBOARD' | 'HISTORY'>('DASHBOARD');
  const [historyFundFilter, setHistoryFundFilter] = useState<string | null>(null);

  // Asset Filter & Search & Sorting for Holdings
  const [selectedAssetType, setSelectedAssetType] = useState<'ALL' | 'FUND' | 'STOCK' | 'PVD'>('ALL');
  const [holdingsSearch, setHoldingsSearch] = useState('');
  const [holdingsSortField, setHoldingsSortField] = useState<'fund_abbr' | 'platform' | 'total_units' | 'avg_cost' | 'current_nav' | 'market_value' | 'unrealized_pl'>('market_value');
  const [holdingsSortOrder, setHoldingsSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSyncTrackerOpen, setIsSyncTrackerOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState<EmailSyncProgress | null>(null);

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
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadData();
      setSyncMessage(t('refreshSuccess'));
      setTimeout(() => setSyncMessage(null), 3000);
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
    setSyncMessage(null);
    try {
      const res = await triggerNavSync();
      setSyncMessage(t('syncSuccess', { count: res.updated_funds_count }));
      await loadData();
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (e) {
      console.error(e);
      setSyncMessage(t('syncFailed'));
    } finally {
      setSyncing(false);
    }
  };

  const handleImportSuccess = (result?: { inserted_count: number; skipped_count: number }) => {
    if (result) {
      if (result.skipped_count > 0) {
        setSyncMessage(
          locale === 'th'
            ? `นำเข้าสำเร็จ ${result.inserted_count} รายการ (ข้ามรายการซ้ำ ${result.skipped_count} รายการ)`
            : `Imported ${result.inserted_count} transactions (${result.skipped_count} duplicates skipped)`
        );
      } else {
        setSyncMessage(
          locale === 'th'
            ? `นำเข้าข้อมูลสำเร็จ ${result.inserted_count} รายการ`
            : `Successfully imported ${result.inserted_count} transactions`
        );
      }
      setTimeout(() => setSyncMessage(null), 5000);
    }
    loadData();
  };

  const activePlatforms = portfolio?.platforms ? Object.keys(portfolio.platforms) : [];

  const handleHoldingsSort = (field: typeof holdingsSortField) => {
    if (holdingsSortField === field) {
      setHoldingsSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setHoldingsSortField(field);
      setHoldingsSortOrder(field === 'fund_abbr' || field === 'platform' ? 'asc' : 'desc');
    }
  };

  const filteredHoldings = (portfolio?.holdings || [])
    .filter((h) => {
      // Platform filter
      if (selectedPlatform !== 'ALL' && h.platform.toUpperCase() !== selectedPlatform.toUpperCase()) {
        return false;
      }
      // Asset class filter
      if (selectedAssetType === 'FUND' && h.asset_type !== 'FUND') {
        return false;
      }
      if (selectedAssetType === 'STOCK' && h.asset_type !== 'STOCK') {
        return false;
      }
      if (selectedAssetType === 'PVD' && h.asset_type !== 'PVD') {
        return false;
      }
      // Search filter
      if (holdingsSearch.trim()) {
        const q = holdingsSearch.toLowerCase().trim();
        const abbr = (h.fund_abbr || '').toLowerCase();
        const name = (h.fund_name_th || '').toLowerCase();
        const proj = (h.proj_id || '').toLowerCase();
        return abbr.includes(q) || name.includes(q) || proj.includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (holdingsSortField) {
        case 'fund_abbr':
          aVal = (a.fund_abbr || a.proj_id).toLowerCase();
          bVal = (b.fund_abbr || b.proj_id).toLowerCase();
          break;
        case 'platform':
          aVal = a.platform.toLowerCase();
          bVal = b.platform.toLowerCase();
          break;
        case 'total_units':
          aVal = parseFloat(a.total_units) || 0;
          bVal = parseFloat(b.total_units) || 0;
          break;
        case 'avg_cost':
          aVal = parseFloat(a.avg_cost) || 0;
          bVal = parseFloat(b.avg_cost) || 0;
          break;
        case 'current_nav':
          aVal = parseFloat(a.current_nav) || 0;
          bVal = parseFloat(b.current_nav) || 0;
          break;
        case 'market_value':
          aVal = parseFloat(a.market_value) || 0;
          bVal = parseFloat(b.market_value) || 0;
          break;
        case 'unrealized_pl':
          aVal = parseFloat(a.unrealized_pl) || 0;
          bVal = parseFloat(b.unrealized_pl) || 0;
          break;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return holdingsSortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return holdingsSortOrder === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

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

  const formatNavDate = (dStr?: string) => {
    if (!dStr) return '';
    const parts = dStr.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      if (locale === 'th') {
        const beYear = (parseInt(y, 10) + 543).toString().slice(-2);
        const mNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const mThai = mNames[parseInt(m, 10) - 1] || m;
        return `${parseInt(d, 10)} ${mThai} ${beYear}`;
      }
      return `${d}/${m}/${y}`;
    }
    return dStr;
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 sm:gap-4">
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

      {/* Sync toast notification */}
      {syncMessage && (
        <div className="bg-indigo-950/80 border-b border-indigo-800 px-4 py-2 text-center text-xs text-indigo-200 flex items-center justify-center gap-2 transition-all">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Main Content: Dashboard or Full-Page Transaction History */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {loading ? (
          <DashboardSkeleton />
        ) : activeView === 'HISTORY' ? (
          <Suspense fallback={<DashboardSkeleton />}>
            <TransactionHistoryPage
              initialFundFilter={historyFundFilter}
              onBack={() => {
                setActiveView('DASHBOARD');
                setHistoryFundFilter(null);
              }}
              onDataChanged={loadData}
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

            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> {t('holdingsTitle')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {filteredHoldings.length} {locale === 'th' ? 'รายการ' : 'holdings'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Asset Class Filter */}
                  <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                    <button
                      onClick={() => setSelectedAssetType('ALL')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                        selectedAssetType === 'ALL'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {t('allAssets')}
                    </button>
                    <button
                      onClick={() => setSelectedAssetType('FUND')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                        selectedAssetType === 'FUND'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {t('mutualFunds')}
                    </button>
                    <button
                      onClick={() => setSelectedAssetType('STOCK')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                        selectedAssetType === 'STOCK'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {t('stocks')}
                    </button>
                    <button
                      onClick={() => setSelectedAssetType('PVD')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                        selectedAssetType === 'PVD'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {t('assetPvd')}
                    </button>
                  </div>

                  {/* Platform Filter */}
                  <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs filter-tabs-container">
                    {['ALL', ...activePlatforms].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setSelectedPlatform(tab)}
                        className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                          selectedPlatform === tab
                            ? 'bg-indigo-600 text-white shadow-sm tab-btn-active'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 tab-btn-inactive'
                        }`}
                      >
                        {tab === 'ALL' ? t('allPlatforms') : tab}
                      </button>
                    ))}
                  </div>

                  {/* Fund Search */}
                  <div className="relative min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={locale === 'th' ? 'ค้นหากองทุน/สินทรัพย์...' : 'Search asset / fund...'}
                      value={holdingsSearch}
                      onChange={(e) => setHoldingsSearch(e.target.value)}
                      className="w-full pl-8 pr-7 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    />
                    {holdingsSearch && (
                      <button
                        onClick={() => setHoldingsSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800 font-bold select-none">
                    <tr>
                      <th
                        onClick={() => handleHoldingsSort('fund_abbr')}
                        className="py-3 px-4 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                      >
                        <span className="inline-flex items-center">
                          {t('fundHeader')}
                          {holdingsSortField === 'fund_abbr' ? (
                            holdingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-indigo-500" /> : <ArrowDown className="w-3 h-3 ml-1 text-indigo-500" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 ml-1 text-slate-400 opacity-40" />
                          )}
                        </span>
                      </th>
                      <th
                        onClick={() => handleHoldingsSort('platform')}
                        className="py-3 px-4 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                      >
                        <span className="inline-flex items-center">
                          {t('platformHeader')}
                          {holdingsSortField === 'platform' ? (
                            holdingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-indigo-500" /> : <ArrowDown className="w-3 h-3 ml-1 text-indigo-500" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 ml-1 text-slate-400 opacity-40" />
                          )}
                        </span>
                      </th>
                      <th
                        onClick={() => handleHoldingsSort('total_units')}
                        className="py-3 px-4 text-right cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                      >
                        <span className="inline-flex items-center justify-end w-full">
                          {t('unitsHeader')}
                          {holdingsSortField === 'total_units' ? (
                            holdingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-indigo-500" /> : <ArrowDown className="w-3 h-3 ml-1 text-indigo-500" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 ml-1 text-slate-400 opacity-40" />
                          )}
                        </span>
                      </th>
                      <th
                        onClick={() => handleHoldingsSort('avg_cost')}
                        className="py-3 px-4 text-right cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                      >
                        <span className="inline-flex items-center justify-end w-full">
                          {t('avgCostHeader')}
                          {holdingsSortField === 'avg_cost' ? (
                            holdingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-indigo-500" /> : <ArrowDown className="w-3 h-3 ml-1 text-indigo-500" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 ml-1 text-slate-400 opacity-40" />
                          )}
                        </span>
                      </th>
                      <th
                        onClick={() => handleHoldingsSort('current_nav')}
                        className="py-3 px-4 text-right cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                      >
                        <span className="inline-flex items-center justify-end w-full">
                          {t('navHeader')}
                          {holdingsSortField === 'current_nav' ? (
                            holdingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-indigo-500" /> : <ArrowDown className="w-3 h-3 ml-1 text-indigo-500" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 ml-1 text-slate-400 opacity-40" />
                          )}
                        </span>
                      </th>
                      <th
                        onClick={() => handleHoldingsSort('market_value')}
                        className="py-3 px-4 text-right cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                      >
                        <span className="inline-flex items-center justify-end w-full">
                          {t('marketValHeader')}
                          {holdingsSortField === 'market_value' ? (
                            holdingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-indigo-500" /> : <ArrowDown className="w-3 h-3 ml-1 text-indigo-500" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 ml-1 text-slate-400 opacity-40" />
                          )}
                        </span>
                      </th>
                      <th
                        onClick={() => handleHoldingsSort('unrealized_pl')}
                        className="py-3 px-4 text-right cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                      >
                        <span className="inline-flex items-center justify-end w-full">
                          {t('plHeader')}
                          {holdingsSortField === 'unrealized_pl' ? (
                            holdingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-indigo-500" /> : <ArrowDown className="w-3 h-3 ml-1 text-indigo-500" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 ml-1 text-slate-400 opacity-40" />
                          )}
                        </span>
                      </th>
                      <th className="py-3 px-4 text-center w-16">{t('viewHistory')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
                    {filteredHoldings.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                          {t('noHoldings')}
                        </td>
                      </tr>
                    ) : (
                      filteredHoldings.map((h, i) => {
                        const upl = parseFloat(h.unrealized_pl);
                        const isPos = upl >= 0;

                        return (
                          <tr key={`${h.proj_id}-${h.platform}-${i}`} className="hover:bg-indigo-50/40 dark:hover:bg-slate-800/30 transition">
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900 dark:text-white block">{h.fund_abbr}</span>
                                {h.asset_type === 'STOCK' && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                                    {locale === 'th' ? 'หุ้น' : 'Stock'}
                                  </span>
                                )}
                                {h.asset_type === 'PVD' && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                                    PVD
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate max-w-xs" title={h.fund_name_th || h.proj_id}>
                                {h.fund_name_th || h.proj_id}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <PlatformBadge platform={h.platform} />
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                              {isPrivacyMode
                                ? '******'
                                : parseFloat(h.total_units).toLocaleString(undefined, { minimumFractionDigits: 4 })}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                              {isPrivacyMode ? '******' : parseFloat(h.avg_cost).toFixed(4)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-indigo-700 dark:text-indigo-300 font-bold">
                              <div>{parseFloat(h.current_nav).toFixed(4)}</div>
                              {h.nav_date && (
                                <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                                  ({formatNavDate(h.nav_date)})
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                              {formatDisplayMoney(h.market_value)}
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono">
                              <span className={`font-bold ${isPos ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {isPrivacyMode ? '******' : `${isPos ? '+' : ''}${formatMoney(h.unrealized_pl)}`}
                              </span>
                              <span
                                className={`text-[10px] block font-semibold ${
                                  isPos ? 'text-emerald-600 dark:text-emerald-500' : 'text-rose-600 dark:text-rose-500'
                                }`}
                              >
                                {isPos ? '+' : ''}
                                {h.unrealized_pl_pct}%
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              {h.asset_type === 'PVD' ? (
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium select-none" title="PVD position tracks latest certificate snapshot">
                                  Snapshot
                                </span>
                              ) : (
                                <button
                                  onClick={() => {
                                    setHistoryFundFilter(h.fund_abbr);
                                    setActiveView('HISTORY');
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition cursor-pointer"
                                  title={t('viewHistory')}
                                >
                                  <History className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Modals loaded lazily on demand via Suspense */}
      <Suspense fallback={null}>
        {isAddModalOpen && (
          <TransactionModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            onSuccess={loadData}
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
            onSyncComplete={loadData}
          />
        )}
        {isSyncTrackerOpen && (
          <EmailSyncModal
            isOpen={isSyncTrackerOpen}
            onClose={() => setIsSyncTrackerOpen(false)}
            onComplete={loadData}
          />
        )}
      </Suspense>
    </div>
  );
};

export default App;
