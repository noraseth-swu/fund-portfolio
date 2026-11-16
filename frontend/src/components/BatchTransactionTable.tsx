import React from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { FundSearchCombobox } from './FundSearchCombobox';
import { NavDatePicker } from './NavDatePicker';
import { getNavByDate, type BrokerItem } from '../lib/api';
import { useI18n } from '../lib/i18n';

export interface BatchItem {
  id: string;
  platform: string;
  transDate: string;
  projId: string;
  fundAbbr: string;
  fundName: string;
  transType: 'BUY' | 'SELL';
  units: string;
  unitPrice: string;
  fee: string;
  note: string;
  navLoading?: boolean;
  error?: string;
}

interface Props {
  rows: BatchItem[];
  onChange: (rows: BatchItem[]) => void;
  brokers: BrokerItem[];
  defaultPlatform: string;
}

export const BatchTransactionTable: React.FC<Props> = ({
  rows,
  onChange,
  brokers,
  defaultPlatform,
}) => {
  const { t } = useI18n();

  const handleAddRow = () => {
    const lastRow = rows[rows.length - 1];
    const newRow: BatchItem = {
      id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      platform: lastRow?.platform || defaultPlatform || 'KBANK',
      transDate: lastRow?.transDate || new Date().toISOString().split('T')[0],
      projId: '',
      fundAbbr: '',
      fundName: '',
      transType: 'BUY',
      units: '',
      unitPrice: '',
      fee: '0',
      note: '',
    };
    onChange([...rows, newRow]);
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length <= 1) return;
    onChange(rows.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, patch: Partial<BatchItem>) => {
    onChange(
      rows.map((r) => {
        if (r.id !== id) return r;
        return { ...r, ...patch };
      })
    );
  };

  const handleFundChange = async (id: string, fund: { proj_id: string; fund_abbr: string; last_nav?: string }) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;

    let targetPrice = row.unitPrice;
    let loadingNav = false;

    // Auto lookup NAV for date if date and proj_id are present
    if (fund.proj_id && row.transDate) {
      loadingNav = true;
      updateRow(id, {
        projId: fund.proj_id,
        fundAbbr: fund.fund_abbr,
        navLoading: true,
      });

      try {
        const navRes = await getNavByDate(fund.proj_id, row.transDate);
        if (navRes?.nav) {
          targetPrice = navRes.nav.toString();
        } else if (fund.last_nav && !targetPrice) {
          targetPrice = fund.last_nav;
        }
      } catch (e) {
        if (fund.last_nav && !targetPrice) targetPrice = fund.last_nav;
      } finally {
        loadingNav = false;
      }
    }

    updateRow(id, {
      projId: fund.proj_id,
      fundAbbr: fund.fund_abbr,
      unitPrice: targetPrice,
      navLoading: loadingNav,
      error: undefined,
    });
  };

  const handleDateChange = async (id: string, newDate: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;

    updateRow(id, { transDate: newDate });

    if (row.projId && newDate) {
      updateRow(id, { navLoading: true });
      try {
        const navRes = await getNavByDate(row.projId, newDate);
        if (navRes?.nav) {
          updateRow(id, { unitPrice: navRes.nav.toString(), navLoading: false });
        } else {
          updateRow(id, { navLoading: false });
        }
      } catch (e) {
        updateRow(id, { navLoading: false });
      }
    }
  };

  const handleDateNavChange = (id: string, newDate: string, nav?: string) => {
    if (nav) {
      updateRow(id, {
        transDate: newDate,
        unitPrice: nav,
        navLoading: false,
      });
    } else {
      handleDateChange(id, newDate);
    }
  };

  return (
    <div className="space-y-3">
      {/* Table Container with ample height and padding for dropdown popovers */}
      <div className="overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-950/60 max-h-[64vh] min-h-[380px] pb-32 overflow-y-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-800/90 sticky top-0 z-20 text-slate-300 font-semibold border-b border-slate-700">
            <tr>
              <th className="py-2.5 px-3 w-10 text-center">#</th>
              <th className="py-2.5 px-3 min-w-[150px]">{t('transDate') || 'วันที่'}</th>
              <th className="py-2.5 px-3 min-w-[130px]">{t('platform') || 'แพลตฟอร์ม'}</th>
              <th className="py-2.5 px-3 min-w-[340px] xl:min-w-[380px]">{t('fundSearch') || 'กองทุน (SEC)'}</th>
              <th className="py-2.5 px-3 w-28 text-center">{t('transType') || 'ประเภท'}</th>
              <th className="py-2.5 px-3 w-28 text-right">{t('units') || 'หน่วย'}</th>
              <th className="py-2.5 px-3 w-28 text-right">{t('price') || 'ราคา/NAV'}</th>
              <th className="py-2.5 px-3 w-28 text-right">{t('totalAmount') || 'มูลค่ารวม'}</th>
              <th className="py-2.5 px-3 w-24 text-right">{t('fee') || 'ค่าธรรมเนียม'}</th>
              <th className="py-2.5 px-3 min-w-[130px]">{t('note') || 'บันทึก'}</th>
              <th className="py-2.5 px-2 w-12 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((row, idx) => {
              const u = parseFloat(row.units) || 0;
              const p = parseFloat(row.unitPrice) || 0;
              const f = parseFloat(row.fee) || 0;
              const total = u > 0 && p > 0 ? (u * p + f).toFixed(2) : '-';

              return (
                <tr key={row.id} className="hover:bg-slate-800/40 transition group">
                  {/* Row index */}
                  <td className="py-2 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>

                  {/* Date with NAV Trading Days Highlight */}
                  <td className="py-2 px-2">
                    <NavDatePicker
                      value={row.transDate}
                      projId={row.projId}
                      fundAbbr={row.fundAbbr}
                      onChange={(d, nav) => handleDateNavChange(row.id, d, nav)}
                    />
                  </td>

                  {/* Platform */}
                  <td className="py-2 px-2">
                    <select
                      value={row.platform}
                      onChange={(e) => updateRow(row.id, { platform: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
                    >
                      <option value="KBANK">KBank</option>
                      <option value="TTB">ttb</option>
                      <option value="DIME">Dime!</option>
                      <option value="SCB">SCB</option>
                      <option value="INNOVESTX">InnovestX</option>
                      <option value="FINNOMENA">Finnomena</option>
                      {brokers
                        .filter((b) => !['KBANK', 'TTB', 'DIME', 'SCB', 'INNOVESTX', 'FINNOMENA'].includes(b.code))
                        .map((b) => (
                          <option key={b.code} value={b.code}>
                            {b.name_th || b.code}
                          </option>
                        ))}
                    </select>
                  </td>

                  {/* Fund Combobox */}
                  <td className="py-2 px-2">
                    <FundSearchCombobox
                      value={row.fundAbbr || ''}
                      projId={row.projId}
                      onChange={(fund) => handleFundChange(row.id, fund)}
                      placeholder={t('searchFund') || 'ค้นหากองทุน...'}
                    />
                  </td>

                  {/* Type */}
                  <td className="py-2 px-2 text-center">
                    <div className="inline-flex rounded-lg border border-slate-700 p-0.5 bg-slate-900">
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { transType: 'BUY' })}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                          row.transType === 'BUY'
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        BUY
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { transType: 'SELL' })}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                          row.transType === 'SELL'
                            ? 'bg-rose-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        SELL
                      </button>
                    </div>
                  </td>

                  {/* Units */}
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      step="any"
                      placeholder="0.0000"
                      value={row.units}
                      onChange={(e) => updateRow(row.id, { units: e.target.value })}
                      className="w-full text-right bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                    />
                  </td>

                  {/* Unit Price */}
                  <td className="py-2 px-2">
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        placeholder="0.0000"
                        value={row.unitPrice}
                        onChange={(e) => updateRow(row.id, { unitPrice: e.target.value })}
                        className="w-full text-right bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs pr-6"
                      />
                      {row.navLoading && (
                        <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin absolute right-2 top-2" />
                      )}
                    </div>
                  </td>

                  {/* Total */}
                  <td className="py-2 px-3 text-right font-mono font-medium text-emerald-400">
                    {total !== '-' ? Number(total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                  </td>

                  {/* Fee */}
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      step="any"
                      placeholder="0"
                      value={row.fee}
                      onChange={(e) => updateRow(row.id, { fee: e.target.value })}
                      className="w-full text-right bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                    />
                  </td>

                  {/* Note */}
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      placeholder={t('notePlaceholder') || 'บันทึกเพิ่มเติม...'}
                      value={row.note}
                      onChange={(e) => updateRow(row.id, { note: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </td>

                  {/* Delete */}
                  <td className="py-2 px-2 text-center">
                    <button
                      type="button"
                      disabled={rows.length <= 1}
                      onClick={() => handleRemoveRow(row.id)}
                      className="p-1 text-slate-400 hover:text-rose-400 disabled:opacity-30 disabled:hover:text-slate-400 transition cursor-pointer"
                      title={t('removeRow') || 'ลบแถว'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Action Toolbar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleAddRow}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold transition cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('addRow') || 'เพิ่มแถว'}</span>
        </button>
      </div>
    </div>
  );
};
