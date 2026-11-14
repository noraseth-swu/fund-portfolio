import React from 'react';

interface Props {
  platform: string;
}

export const PlatformBadge: React.FC<Props> = ({ platform }) => {
  const p = platform.toUpperCase();

  switch (p) {
    case 'KBANK':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-700/50">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
          KBank
        </span>
      );
    case 'KBANK_PVD':
    case 'PVD':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-600/50">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />
          KBank (PVD)
        </span>
      );
    case 'TTB':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-700/50">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5" />
          ttb
        </span>
      );
    case 'DIME':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-600/50">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 mr-1.5" />
          Dime!
        </span>
      );
    case 'SCB':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-700/50">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-1.5" />
          SCB
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
          {platform}
        </span>
      );
  }
};
