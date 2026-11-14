import React from 'react';

interface Props {
  platform: string;
}

export const PlatformBadge: React.FC<Props> = ({ platform }) => {
  const p = platform.toUpperCase();

  switch (p) {
    case 'KBANK':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-700/50">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />
          KBank
        </span>
      );
    case 'TTB':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950 text-blue-400 border border-blue-700/50">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5" />
          ttb
        </span>
      );
    case 'DIME':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-950 text-teal-300 border border-teal-600/50">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-300 mr-1.5" />
          Dime!
        </span>
      );
    case 'SCB':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-950 text-purple-300 border border-purple-700/50">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mr-1.5" />
          SCB
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
          {platform}
        </span>
      );
  }
};
