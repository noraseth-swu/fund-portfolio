import React from 'react';
import { Lock } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

interface PasswordPromptCardProps {
  pdfPassword: string;
  onPasswordChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
}

export const PasswordPromptCard: React.FC<PasswordPromptCardProps> = ({
  pdfPassword,
  onPasswordChange,
  onSubmit,
  loading,
}) => {
  const { t } = useI18n();

  return (
    <div className="mb-4 p-5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-600/40 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-300 text-sm font-bold">
        <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-700 flex items-center justify-center text-amber-700 dark:text-amber-300">
          <Lock className="w-4 h-4" />
        </div>
        <span>{t('pdfPasswordRequired')}</span>
      </div>
      <p className="text-xs text-amber-800 dark:text-slate-300 leading-relaxed font-normal">
        {t('pdfPasswordHint')}
      </p>
      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 mt-1">
        <input
          type="password"
          placeholder={t('enterPasswordPlaceholder')}
          value={pdfPassword}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoFocus
          className="flex-1 bg-white dark:bg-slate-950 border border-amber-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 font-mono shadow-sm"
        />
        <button
          type="submit"
          disabled={loading || !pdfPassword}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:shadow active:scale-[0.99]"
        >
          <Lock className="w-4 h-4" />
          <span>{t('unlockAndScan')}</span>
        </button>
      </form>
    </div>
  );
};
