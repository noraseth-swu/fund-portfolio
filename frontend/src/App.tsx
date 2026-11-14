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
  Laptop,
  Globe,
} from 'lucide-react';
import { getPortfolio, triggerNavSync, setTokenGetter, type PortfolioSummary } from './lib/api';
import { MetricCard } from './components/MetricCard';
import { PlatformBadge } from './components/PlatformBadge';
import { AllocationChart } from './components/AllocationChart';
import { useTheme } from './lib/theme';
import { useI18n } from './lib/i18n';

// React.lazy for heavy modal chunks to minimize initial bundle size
const TransactionModal = lazy(() =>
  import('./components/TransactionModal').then((m) => ({ default: m.TransactionModal }))
);
const TransactionHistoryModal = lazy(() =>
  import('./components/TransactionHistoryModal').then((m) => ({ default: m.TransactionHistoryModal }))
);
const CsvImportModal = lazy(() =>
  import('./components/CsvImportModal').then((m) => ({ default: m.CsvImportModal }))
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
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('ALL');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

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

  const activePlatforms = portfolio?.platforms ? Object.keys(portfolio.platforms) : [];

  const filteredHoldings = (portfolio?.holdings || []).filter((h) => {
    if (selectedPlatform === 'ALL') return true;
    return h.platform.toUpperCase() === selectedPlatform.toUpperCase();
  });

  const formatMoney = (val?: string) => {
    if (!val) return '0.00';
    return parseFloat(val).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
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
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm logo-container select-none">
              <span className="font-mono text-sm font-extrabold tracking-tight text-white">FP</span>
            </div>
            <div>
              <h1 className="font-bold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                {t('appTitle')}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 font-mono font-medium">
                  SEC API v2
                </span>
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {activePlatforms.length > 0 ? (
                  <>
                    <span>{t('activeBrokersPrefix')}</span>
                    {activePlatforms.map((plat, idx) => (
                      <span key={plat}>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{plat}</span>
                        {idx < activePlatforms.length - 1 && ' • '}
                      </span>
                    ))}
                  </>
                ) : (
                  <span>{t('noPlatformData')}</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="flex items-center bg-slate-100 border border-slate-200 dark:bg-slate-900 dark:border-slate-700/60 rounded-xl p-0.5 text-xs theme-switcher-container">
              <button
                onClick={() => setTheme('light')}
                className={`min-w-[32px] min-h-[32px] p-1.5 rounded-lg transition cursor-pointer theme-switcher-btn flex items-center justify-center focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  theme === 'light' ? 'bg-indigo-600 text-white shadow-sm active' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
                title={t('themeLight')}
                aria-label={t('themeLight')}
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`min-w-[32px] min-h-[32px] p-1.5 rounded-lg transition cursor-pointer theme-switcher-btn flex items-center justify-center focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  theme === 'dark' ? 'bg-indigo-600 text-white shadow-sm active' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
                title={t('themeDark')}
                aria-label={t('themeDark')}
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setTheme('auto')}
                className={`min-w-[32px] min-h-[32px] p-1.5 rounded-lg transition cursor-pointer theme-switcher-btn flex items-center justify-center focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  theme === 'auto' ? 'bg-indigo-600 text-white shadow-sm active' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
                title={t('themeAuto')}
                aria-label={t('themeAuto')}
              >
                <Laptop className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Language Switcher [TH | EN] */}
            <button
              onClick={() => setLocale(locale === 'th' ? 'en' : 'th')}
              className="btn-header-secondary px-2 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/60 text-xs font-bold text-slate-300 hover:text-white transition flex items-center gap-1 shadow-sm cursor-pointer"
              title="สลับภาษา / Switch Language (TH / EN)"
            >
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              <span>{locale.toUpperCase()}</span>
            </button>

            {/* Sync NAV button */}
            <button
              onClick={handleSyncNav}
              disabled={syncing}
              className="btn-header-secondary px-2.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700/60 text-xs font-medium transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              title={t('syncNav')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-indigo-400' : ''}`} />
              <span className="hidden md:inline">{syncing ? t('syncing') : t('syncNav')}</span>
            </button>

            <button
              onClick={() => setIsCsvModalOpen(true)}
              className="btn-importer px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-950/80 to-purple-950/80 hover:from-indigo-900/90 hover:to-purple-900/90 text-indigo-200 border border-indigo-700/50 text-xs font-semibold transition flex items-center gap-1.5 shadow-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500"
              title={t('importerSubtitle')}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span className="hidden sm:inline">{t('importData')}</span>
            </button>

            {/* History button */}
            <button
              onClick={() => setIsHistoryModalOpen(true)}
              className="btn-header-secondary px-2.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700/60 text-xs font-medium transition flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('transHistory')}</span>
            </button>

            {/* Add Transaction button */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="btn-primary-indigo px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-white" />
              <span className="hidden sm:inline text-white">{t('addTransaction')}</span>
            </button>

            {/* Clerk User Avatar & Profile Management */}
            <div className="pl-1.5 border-l border-slate-800 flex items-center">
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

      {/* Main Dashboard Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {loading ? (
          <DashboardSkeleton />
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
                value={formatMoney(portfolio?.market_value)}
                trend="neutral"
                icon={<Wallet className="w-4 h-4" />}
              />
              <MetricCard
                title={t('totalCost')}
                value={formatMoney(portfolio?.total_cost)}
                trend="neutral"
                icon={<Layers className="w-4 h-4" />}
              />
              <MetricCard
                title={t('unrealizedPl')}
                value={formatMoney(portfolio?.total_unrealized_pl)}
                subValue={`${portfolio?.total_unrealized_pl_pct || '0'}%`}
                trend={getUnrealizedTrend(portfolio?.total_unrealized_pl)}
                icon={<TrendingUp className="w-4 h-4" />}
              />
              <MetricCard
                title={t('realizedPl')}
                value={formatMoney(portfolio?.total_realized_pl)}
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
                                {p ? formatMoney(p.market_value) : '0.00'}{' '}
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
                                {p ? `${isPos ? '+' : ''}${formatMoney(upl)} (${uplPct}%)` : '-'}
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> {t('holdingsTitle')}
                </h3>

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
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800 font-bold select-none">
                    <tr>
                      <th className="py-3 px-4">{t('fundHeader')}</th>
                      <th className="py-3 px-4">{t('platformHeader')}</th>
                      <th className="py-3 px-4 text-right">{t('unitsHeader')}</th>
                      <th className="py-3 px-4 text-right">{t('avgCostHeader')}</th>
                      <th className="py-3 px-4 text-right">{t('navHeader')}</th>
                      <th className="py-3 px-4 text-right">{t('marketValHeader')}</th>
                      <th className="py-3 px-4 text-right">{t('plHeader')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
                    {filteredHoldings.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
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
                              <span className="font-bold text-slate-900 dark:text-white block">{h.fund_abbr}</span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate max-w-xs" title={h.fund_name_th || h.proj_id}>
                                {h.fund_name_th || h.proj_id}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <PlatformBadge platform={h.platform} />
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                              {parseFloat(h.total_units).toLocaleString(undefined, { minimumFractionDigits: 4 })}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                              {parseFloat(h.avg_cost).toFixed(4)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-indigo-700 dark:text-indigo-300 font-bold">
                              {parseFloat(h.current_nav).toFixed(4)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                              {formatMoney(h.market_value)}
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono">
                              <span className={`font-bold ${isPos ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {isPos ? '+' : ''}
                                {formatMoney(h.unrealized_pl)}
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
        {isHistoryModalOpen && (
          <TransactionHistoryModal
            isOpen={isHistoryModalOpen}
            onClose={() => setIsHistoryModalOpen(false)}
            onChanged={loadData}
          />
        )}
        {isCsvModalOpen && (
          <CsvImportModal
            isOpen={isCsvModalOpen}
            onClose={() => setIsCsvModalOpen(false)}
            onSuccess={loadData}
          />
        )}
      </Suspense>
    </div>
  );
};

export default App;
