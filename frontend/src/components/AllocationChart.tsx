import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import type { PlatformSummary } from '../lib/api';
import { useI18n } from '../lib/i18n';

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
    <div className="h-64 w-full relative">
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
              <Cell key={`cell-${index}`} fill={entry.color} stroke="#0f172a" strokeWidth={3} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload;
                return (
                  <div className="bg-slate-900 border border-slate-700 px-3 py-2 rounded-lg shadow-xl text-xs">
                    <p className="font-bold text-white mb-0.5">{item.name}</p>
                    <p className="text-slate-300">
                      {item.value.toLocaleString()} THB ({item.alloc}%)
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
