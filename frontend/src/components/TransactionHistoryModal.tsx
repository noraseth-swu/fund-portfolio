import React, { useState, useEffect } from 'react';
import { X, Trash2, Calendar, FileText } from 'lucide-react';
import { getTransactions, deleteTransaction, type Transaction } from '../lib/api';
import { PlatformBadge } from './PlatformBadge';
import { useI18n } from '../lib/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export const TransactionHistoryModal: React.FC<Props> = ({ isOpen, onClose, onChanged }) => {
  const { t } = useI18n();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getTransactions();
      setTransactions(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    setDeletingId(id);
    try {
      await deleteTransaction(id);
      await loadData();
      onChanged();
    } catch (e) {
      console.error(e);
      alert(t('deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="modal-card bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl p-6 shadow-2xl relative flex flex-col max-h-[85vh]">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-indigo-400" />
          <h2 className="text-xl font-bold text-white">{t('historyTitle')}</h2>
        </div>

        <div className="overflow-y-auto flex-1 border border-slate-800 rounded-xl">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">{t('loading')}</div>
          ) : transactions.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
              <FileText className="w-8 h-8 text-slate-600" />
              <span>{t('noHistory')}</span>
            </div>
          ) : (
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-950/80 text-slate-400 sticky top-0 border-b border-slate-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">{t('transDate')}</th>
                  <th className="py-3 px-4">{t('transType')}</th>
                  <th className="py-3 px-4">{t('fundHeader')}</th>
                  <th className="py-3 px-4">{t('platformHeader')}</th>
                  <th className="py-3 px-4 text-right">{t('unitsHeader')}</th>
                  <th className="py-3 px-4 text-right">{t('navOnEffective')}</th>
                  <th className="py-3 px-4 text-right">{t('totalAmount')}</th>
                  <th className="py-3 px-4 text-center">{t('actionManage')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {transactions.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4 whitespace-nowrap text-slate-400 font-mono">{item.trans_date}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          item.trans_type === 'BUY'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : item.trans_type === 'SELL'
                            ? 'bg-rose-950 text-rose-400 border border-rose-800/60'
                            : 'bg-amber-950 text-amber-400 border border-amber-800/60'
                        }`}
                      >
                        {item.trans_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">
                      {item.fund_abbr || item.proj_id}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <PlatformBadge platform={item.platform} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                      {parseFloat(item.units).toLocaleString(undefined, { minimumFractionDigits: 4 })}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                      {parseFloat(item.unit_price).toFixed(4)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-white">
                      {parseFloat(item.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-950/30 transition disabled:opacity-50 cursor-pointer"
                        title={t('deleteTransTooltip')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="btn-header-secondary px-4 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer"
          >
            {t('btnClose')}
          </button>
        </div>
      </div>
    </div>
  );
};
