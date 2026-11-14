import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface Props {
  title: string;
  value: string;
  subValue?: string;
  trend?: 'positive' | 'negative' | 'neutral';
  icon?: React.ReactNode;
}

export const MetricCard: React.FC<Props> = ({ title, value, subValue, trend, icon }) => {
  return (
    <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition relative overflow-hidden">
      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
        {icon && (
          <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-slate-800 dark:text-slate-300 border border-indigo-100 dark:border-slate-700/60 flex items-center justify-center">
            {icon}
          </div>
        )}
      </div>

      <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-1">
        {value} <span className="text-sm font-normal text-slate-400">THB</span>
      </div>

      {subValue && (
        <div className="flex items-center text-xs font-semibold mt-1">
          {trend === 'positive' && (
            <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400">
              <ArrowUpRight className="w-4 h-4 mr-0.5" />
              {subValue}
            </span>
          )}
          {trend === 'negative' && (
            <span className="inline-flex items-center text-rose-600 dark:text-rose-400">
              <ArrowDownRight className="w-4 h-4 mr-0.5" />
              {subValue}
            </span>
          )}
          {trend === 'neutral' && (
            <span className="inline-flex items-center text-slate-500 dark:text-slate-400">
              <Minus className="w-4 h-4 mr-0.5" />
              {subValue}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
