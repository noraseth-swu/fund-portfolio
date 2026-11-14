import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import type { PlatformSummary } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../lib/theme';

interface Props {
  platforms: Record<string, PlatformSummary>;
}

const PLATFORM_COLORS: Record<string, string> = {
  KBANK: '#10b981', // emerald
  TTB: '#3b82f6',   // blue
  DIME: '#14b8a6',  // teal
  SCB: '#a855f7',   // purple
  OTHER: '#64748b', // slate
};

export const AllocationChart: React.FC<Props> = ({ platforms }) => {
  const { t } = useI18n();
  const { theme } = useTheme();

  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const data = Object.values(platforms)
    .filter((p) => parseFloat(p.market_value) > 0)
    .map((p) => ({
      name: p.platform,
      value: parseFloat(p.market_value),
      alloc: p.allocation_pct,
      color: PLATFORM_COLORS[p.platform.toUpperCase()] || PLATFORM_COLORS.OTHER,
    }));

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
        {t('noAllocationData')}
      </div>
    );
  }

  return (
    <div className="h-64 w-full relative flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={95}
            paddingAngle={4}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} stroke={isDark ? '#0f172a' : '#ffffff'} strokeWidth={3} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload;
                return (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl shadow-xl text-xs">
                    <p className="font-bold text-slate-900 dark:text-white mb-0.5">{item.name}</p>
                    <p className="text-slate-600 dark:text-slate-300 font-mono">
                      {item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB ({item.alloc}%)
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Centered Portfolio Quick Stat */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Platforms</span>
        <span className="text-base font-bold text-slate-900 dark:text-white font-mono">{data.length}</span>
      </div>
    </div>
  );
};
