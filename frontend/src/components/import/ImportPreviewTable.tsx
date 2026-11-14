import React from 'react';
import { RefreshCw, Trash2, Maximize2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { PlatformBadge } from '../PlatformBadge';
import { useI18n } from '../../lib/i18n';
import type { ParsedRow, ColWidths, ColKey } from './types';

interface ImportPreviewTableProps {
  rows: ParsedRow[];
  colWidths: ColWidths;
  onResize: (col: ColKey, e: React.MouseEvent) => void;
  onCellChange: (index: number, field: keyof ParsedRow, value: string) => void;
  onDeleteRow: (index: number) => void;
  onReupload: () => void;
  fileName: string | null;
  validCount: number;
  invalidCount: number;
  totalAmount: number;
  getRowAmount: (r: ParsedRow) => number;
}

export const ImportPreviewTable: React.FC<ImportPreviewTableProps> = ({
  rows,
  colWidths,
  onResize,
  onCellChange,
  onDeleteRow,
  onReupload,
  fileName,
  validCount,
  invalidCount,
  totalAmount,
  getRowAmount,
}) => {
  const { t } = useI18n();

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-3">
      {/* Table Toolbar / Metadata Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-slate-100 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
          <span className="text-slate-500 dark:text-slate-400">{t('dataSource')}:</span>
          <span className="text-slate-900 dark:text-white font-mono font-semibold bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700">
            {fileName || 'data.csv'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{t('validCount', { n: validCount })}</span>
          </span>

          {totalAmount > 0 && (
            <span className="text-slate-700 dark:text-slate-300 font-semibold border-l border-slate-300 dark:border-slate-700 pl-3">
              {t('totalAmountSum')}:{' '}
              <span className="text-emerald-700 dark:text-emerald-400 font-mono font-bold">
                {totalAmount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>{' '}
              {t('currencyBaht')}
            </span>
          )}

          {invalidCount > 0 && (
            <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1 border-l border-slate-300 dark:border-slate-700 pl-3">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{t('invalidCount', { n: invalidCount })}</span>
            </span>
          )}

          <button
            onClick={onReupload}
            className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 px-2.5 py-1 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{t('reupload')}</span>
          </button>
        </div>
      </div>

      {/* Drag resizing hint */}
      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 px-1">
        <Maximize2 className="w-3 h-3 text-slate-400" />
        <span>{t('colResizeHint')}</span>
      </div>

      {/* Editable Preview Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 shadow-sm">
        <table className="w-full text-left text-xs text-slate-800 dark:text-slate-300 border-collapse table-fixed">
          <thead className="bg-slate-100 dark:bg-slate-900 sticky top-0 border-b border-slate-200 dark:border-slate-800 z-10 text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300 font-bold select-none shadow-sm">
            <tr>
              <th style={{ width: colWidths.index }} className="py-2.5 px-2 text-center text-slate-500 dark:text-slate-400 relative">
                #
              </th>

              <th style={{ width: colWidths.date }} className="py-2.5 px-2 whitespace-nowrap relative">
                <span>{t('effectiveDate')}</span>
                <div
                  onMouseDown={(e) => onResize('date', e)}
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/40 z-20"
                />
              </th>

              <th style={{ width: colWidths.platform }} className="py-2.5 px-2 whitespace-nowrap relative">
                <span>{t('platformHeader')}</span>
                <div
                  onMouseDown={(e) => onResize('platform', e)}
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/40 z-20"
                />
              </th>

              <th style={{ width: colWidths.fundCode }} className="py-2.5 px-3 whitespace-nowrap relative">
                <span>{t('fundCodeName')}</span>
                <div
                  onMouseDown={(e) => onResize('fundCode', e)}
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/40 z-20"
                />
              </th>

              <th style={{ width: colWidths.type }} className="py-2.5 px-2 whitespace-nowrap relative">
                <span>{t('transType')}</span>
                <div
                  onMouseDown={(e) => onResize('type', e)}
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/40 z-20"
                />
              </th>

              <th style={{ width: colWidths.amount }} className="py-2.5 px-2.5 text-right whitespace-nowrap relative">
                <span>{t('amountThb')}</span>
                <div
                  onMouseDown={(e) => onResize('amount', e)}
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/40 z-20"
                />
              </th>

              <th style={{ width: colWidths.nav }} className="py-2.5 px-2.5 text-right whitespace-nowrap text-indigo-700 dark:text-indigo-300 font-bold relative">
                <span>{t('navOnEffective')}</span>
                <div
                  onMouseDown={(e) => onResize('nav', e)}
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/40 z-20"
                />
              </th>

              <th style={{ width: colWidths.units }} className="py-2.5 px-2.5 text-right whitespace-nowrap relative">
                <span>{t('unitsHeader')}</span>
                <div
                  onMouseDown={(e) => onResize('units', e)}
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/40 z-20"
                />
              </th>

              <th style={{ width: colWidths.fee }} className="py-2.5 px-2 text-right whitespace-nowrap relative">
                <span>{t('feeThb')}</span>
                <div
                  onMouseDown={(e) => onResize('fee', e)}
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/40 z-20"
                />
              </th>

              <th style={{ width: colWidths.note }} className="py-2.5 px-3 relative">
                <span>{t('noteText')}</span>
                <div
                  onMouseDown={(e) => onResize('note', e)}
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/40 z-20"
                />
              </th>

              <th style={{ width: colWidths.action }} className="py-2.5 px-2 text-center">
                {t('actionDelete')}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-mono text-xs">
            {rows.map((row, idx) => (
              <tr
                key={idx}
                className={`hover:bg-indigo-50/40 dark:hover:bg-slate-800/40 transition ${
                  !row.isValid ? 'bg-rose-50/70 dark:bg-rose-950/20' : idx % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-900/20' : ''
                }`}
              >
                <td style={{ width: colWidths.index }} className="py-2 px-2 text-slate-500 dark:text-slate-400 text-[11px] text-center font-sans font-semibold">
                  {idx + 1}
                </td>

                <td style={{ width: colWidths.date }} className="py-2 px-2">
                  <input
                    type="text"
                    value={row.date}
                    onChange={(e) => onCellChange(idx, 'date', e.target.value)}
                    className="w-full bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700/60 hover:border-slate-400 dark:hover:border-slate-500 focus:border-indigo-500 rounded px-2 py-1 text-slate-900 dark:text-white text-center font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  />
                </td>

                <td style={{ width: colWidths.platform }} className="py-2 px-2 whitespace-nowrap">
                  <PlatformBadge platform={row.platform} />
                </td>

                <td style={{ width: colWidths.fundCode }} className="py-2 px-3">
                  <input
                    type="text"
                    value={row.fundCode}
                    title={row.fundCode}
                    onChange={(e) => onCellChange(idx, 'fundCode', e.target.value)}
                    className={`w-full bg-white dark:bg-slate-900/70 border rounded px-2.5 py-1 font-medium font-sans focus:outline-none focus:ring-1 transition ${
                      !row.fundCode
                        ? 'border-rose-500 text-rose-600 dark:text-rose-300 focus:ring-rose-500/30'
                        : 'border-slate-300 dark:border-slate-700/60 hover:border-slate-400 dark:hover:border-slate-500 focus:border-indigo-500 text-slate-900 dark:text-indigo-300 focus:ring-indigo-500/30 font-semibold'
                    }`}
                  />
                </td>

                <td style={{ width: colWidths.type }} className="py-2 px-2">
                  <select
                    value={row.type}
                    onChange={(e) => onCellChange(idx, 'type', e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-[11px] font-sans font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 cursor-pointer"
                  >
                    <option value="BUY">{t('buy')}</option>
                    <option value="SELL">{t('sell')}</option>
                    <option value="DIVIDEND">{t('dividend')}</option>
                  </select>
                </td>

                <td style={{ width: colWidths.amount }} className="py-2 px-2.5 text-right font-mono text-emerald-700 dark:text-emerald-400 font-bold whitespace-nowrap">
                  {getRowAmount(row) > 0
                    ? getRowAmount(row).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : '-'}
                </td>

                <td style={{ width: colWidths.nav }} className="py-2 px-2.5 text-right">
                  <input
                    type="text"
                    value={row.unitPrice}
                    title={t('navOnEffective')}
                    placeholder="NAV..."
                    onChange={(e) => onCellChange(idx, 'unitPrice', e.target.value)}
                    className={`w-full bg-white dark:bg-slate-900/60 border rounded px-2 py-1 text-right focus:outline-none focus:ring-1 font-mono ${
                      !row.unitPrice || isNaN(parseFloat(row.unitPrice))
                        ? 'border-rose-500 text-rose-600 dark:text-rose-300 focus:ring-rose-500/30'
                        : 'border-slate-300 dark:border-slate-700/60 hover:border-slate-400 dark:hover:border-slate-500 focus:border-indigo-500 text-indigo-700 dark:text-indigo-300 font-bold focus:ring-indigo-500/30'
                    }`}
                  />
                </td>

                <td style={{ width: colWidths.units }} className="py-2 px-2.5 text-right">
                  <input
                    type="text"
                    value={row.units}
                    onChange={(e) => onCellChange(idx, 'units', e.target.value)}
                    className={`w-full bg-white dark:bg-slate-900/60 border rounded px-2 py-1 text-right focus:outline-none focus:ring-1 font-mono ${
                      !row.units || isNaN(parseFloat(row.units))
                        ? 'border-rose-500 text-rose-600 dark:text-rose-300 focus:ring-rose-500/30'
                        : 'border-slate-300 dark:border-slate-700/60 hover:border-slate-400 dark:hover:border-slate-500 focus:border-indigo-500 text-slate-900 dark:text-white font-medium focus:ring-indigo-500/30'
                    }`}
                  />
                </td>

                <td style={{ width: colWidths.fee }} className="py-2 px-2 text-right">
                  <input
                    type="text"
                    value={row.fee}
                    onChange={(e) => onCellChange(idx, 'fee', e.target.value)}
                    className="w-full bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700/60 hover:border-slate-400 dark:hover:border-slate-500 focus:border-indigo-500 rounded px-2 py-1 text-right text-slate-700 dark:text-slate-400 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  />
                </td>

                <td style={{ width: colWidths.note }} className="py-2 px-3">
                  <input
                    type="text"
                    value={row.note}
                    placeholder={`${t('noteText')}...`}
                    onChange={(e) => onCellChange(idx, 'note', e.target.value)}
                    className="w-full bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700/60 hover:border-slate-400 dark:hover:border-slate-500 focus:border-indigo-500 rounded px-2 py-1 text-slate-700 dark:text-slate-300 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  />
                </td>

                <td style={{ width: colWidths.action }} className="py-2 px-2 text-center">
                  <button
                    onClick={() => onDeleteRow(idx)}
                    title={t('actionDelete')}
                    className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
