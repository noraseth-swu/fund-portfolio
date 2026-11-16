import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  FileSpreadsheet,
  X,
  Check,
  RefreshCw,
  AlertCircle,
  Sparkles,
  ClipboardPaste,
  Activity,
} from 'lucide-react';
import { createPendingTransactionsBatch, parseStatementAi, type TokenUsage } from '../lib/api';
import { extractTextFromPdf, arrayBufferToBase64 } from '../lib/pdfParser';
import { useI18n } from '../lib/i18n';
import { type ParsedRow, getRowAmount } from './import/types';
import { useColumnResizer } from './import/useColumnResizer';
import { PasswordPromptCard } from './import/PasswordPromptCard';
import { ImportPreviewTable } from './import/ImportPreviewTable';

export type { ParsedRow } from './import/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (res?: { inserted_count: number; skipped_count: number }) => void;
}

export const CsvImportModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<'pdf' | 'csv' | 'paste'>('pdf');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Gemini Token Usage
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);

  // Resizable column widths custom hook
  const { colWidths, handleMouseDownResize } = useColumnResizer();

  // PDF password handling
  const [pendingPdfBuffer, setPendingPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [pdfPassword, setPdfPassword] = useState('');
  const [isPasswordRequired, setIsPasswordRequired] = useState(false);

  // Direct text paste
  const [pastedText, setPastedText] = useState('');

  const csvInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const downloadSampleTemplate = () => {
    const csvContent =
      'Date,Platform,Fund_Code,Type,Units,Unit_Price,Fee,Note\n' +
      '2026-01-15,KBANK,K-USA-A(A),BUY,500.0,12.5000,0,DCA รายเดือน\n' +
      '2026-02-15,SCB,SCBGOLD,BUY,300.0,24.0000,0,ออมทองคำ\n' +
      '2026-03-01,DIME,TMBGQG,SELL,100.0,14.2000,0,ขายทำกำไร';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'fund_transactions_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const validateAndSetRows = (rawRows: Omit<ParsedRow, 'isValid' | 'error'>[]) => {
    const validated: ParsedRow[] = rawRows.map((r) => {
      let isValid = true;
      let error = '';

      if (!r.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date.trim())) {
        isValid = false;
        error = t('invalidDateFormat');
      } else if (!r.fundCode || r.fundCode.trim().length === 0) {
        isValid = false;
        error = t('fundNotFound');
      } else if (!r.units || isNaN(parseFloat(r.units)) || parseFloat(r.units) <= 0) {
        isValid = false;
        error = t('invalidUnits');
      } else if (!r.unitPrice || isNaN(parseFloat(r.unitPrice)) || parseFloat(r.unitPrice) <= 0) {
        isValid = false;
        error = t('invalidNav');
      }

      return {
        ...r,
        isValid,
        error,
      };
    });

    setRows(validated);
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrorMessage(null);
    setTokenUsage(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (lines.length <= 1) {
        setErrorMessage(t('csvNoData'));
        return;
      }

      const parsed: Omit<ParsedRow, 'isValid' | 'error'>[] = [];
      const headerLine = lines[0].toLowerCase();
      const hasHeader =
        headerLine.includes('date') ||
        headerLine.includes('fund') ||
        headerLine.includes('units') ||
        headerLine.includes('nav');
      const startIdx = hasHeader ? 1 : 0;

      for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim());
        if (parts.length >= 6) {
          parsed.push({
            date: parts[0] || '',
            platform: parts[1] || 'OTHERS',
            fundCode: parts[2] || '',
            type: (parts[3] || 'BUY').toUpperCase(),
            units: parts[4] || '0',
            unitPrice: parts[5] || '0',
            fee: parts[6] || '0',
            note: parts[7] || '',
          });
        }
      }

      validateAndSetRows(parsed);
    };

    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const processPdfBuffer = async (buffer: ArrayBuffer, password?: string) => {
    setLoading(true);
    setLoadingStatus(t('analyzingPdfStructure'));
    setErrorMessage(null);
    setTokenUsage(null);

    try {
      const parseResult = await extractTextFromPdf(buffer, password);

      if (parseResult.needsPassword) {
        setIsPasswordRequired(true);
        setPendingPdfBuffer(buffer.slice(0));
        if (password) {
          setErrorMessage(t('pdfPasswordWrong'));
        }
        setLoading(false);
        return;
      }

      setIsPasswordRequired(false);
      setLoadingStatus(t('aiAnalyzingStatement'));

      let response;
      if (parseResult.text && parseResult.text.length > 50) {
        response = await parseStatementAi({ text: parseResult.text });
      } else {
        setLoadingStatus(t('aiOcrAnalyzing'));
        const base64 = arrayBufferToBase64(buffer.slice(0));
        response = await parseStatementAi({ pdf_base64: base64 });
      }

      if (response.usage) {
        setTokenUsage(response.usage);
      }

      if (!response.transactions || response.transactions.length === 0) {
        setErrorMessage(t('noTransactionsFoundAi'));
        return;
      }

      const mapped = response.transactions.map((tx) => ({
        date: tx.trans_date,
        platform: tx.platform,
        fundCode: tx.fund_abbr,
        type: tx.trans_type,
        units: tx.units.toString(),
        unitPrice: tx.unit_price.toString(),
        fee: (tx.fee ?? 0).toString(),
        note: tx.note || '',
      }));

      validateAndSetRows(mapped);
    } catch (err: any) {
      console.error('PDF parsing error:', err);
      setErrorMessage(err.message || t('aiParseError'));
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

  const handlePdfFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setPendingPdfBuffer(null);
    setPdfPassword('');
    setIsPasswordRequired(false);

    const buffer = await file.arrayBuffer();
    processPdfBuffer(buffer);
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingPdfBuffer || !pdfPassword) return;
    processPdfBuffer(pendingPdfBuffer, pdfPassword);
  };

  const handlePasteSubmit = async () => {
    if (!pastedText.trim()) return;

    setLoading(true);
    setLoadingStatus(t('aiAnalyzingPasted'));
    setErrorMessage(null);
    setTokenUsage(null);

    try {
      const response = await parseStatementAi({ text: pastedText });
      if (response.usage) {
        setTokenUsage(response.usage);
      }

      if (!response.transactions || response.transactions.length === 0) {
        setErrorMessage(t('noTransactionsFoundPasted'));
        return;
      }

      setFileName(t('pasteSource'));
      const mapped = response.transactions.map((tx) => ({
        date: tx.trans_date,
        platform: tx.platform,
        fundCode: tx.fund_abbr,
        type: tx.trans_type,
        units: tx.units.toString(),
        unitPrice: tx.unit_price.toString(),
        fee: (tx.fee ?? 0).toString(),
        note: tx.note || '',
      }));

      validateAndSetRows(mapped);
    } catch (err: any) {
      setErrorMessage(err.message || t('aiTextParseError'));
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

  const handleDeleteRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleCellChange = (index: number, field: keyof ParsedRow, value: string) => {
    const updated = [...rows];
    const r = { ...updated[index], [field]: value };

    let isValid = true;
    let error = '';

    if (!r.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date.trim())) {
      isValid = false;
      error = t('invalidDateFormat');
    } else if (!r.fundCode || r.fundCode.trim().length === 0) {
      isValid = false;
      error = t('fundNotFound');
    } else if (!r.units || isNaN(parseFloat(r.units)) || parseFloat(r.units) <= 0) {
      isValid = false;
      error = t('invalidUnits');
    } else if (!r.unitPrice || isNaN(parseFloat(r.unitPrice)) || parseFloat(r.unitPrice) <= 0) {
      isValid = false;
      error = t('invalidNav');
    }
    r.isValid = isValid;
    r.error = error;

    updated[index] = r;
    setRows(updated);
  };

  const handleImportSubmit = async () => {
    const validRows = rows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setErrorMessage(t('noValidRows'));
      return;
    }

    setLoading(true);
    setLoadingStatus(t('savingToDb'));
    try {
      const payloads = validRows.map((r) => {
        const amt = getRowAmount(r);
        return {
          platform: r.platform,
          raw_fund_name: r.fundCode,
          fund_abbr: r.fundCode,
          trans_type: r.type,
          trans_date: r.date,
          units: r.units,
          unit_price: r.unitPrice,
          total_amount: amt.toFixed(2),
          fee: r.fee,
          note: r.note,
          sync_batch_id: 'universal_import',
          source_file: fileName || 'STATEMENT_IMPORT',
        };
      });

      const res = await createPendingTransactionsBatch(payloads);
      onSuccess({ inserted_count: res.inserted_count, skipped_count: 0 });
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || t('saveError'));
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

  const validCount = rows.filter((r) => r.isValid).length;
  const invalidCount = rows.length - validCount;
  const totalAmount = rows
    .filter((r) => r.isValid)
    .reduce((sum, r) => sum + getRowAmount(r), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div
        className={`modal-card bg-slate-900 border border-slate-800 rounded-2xl w-full p-5 sm:p-6 shadow-2xl relative flex flex-col max-h-[92vh] transition-all duration-300 ${
          rows.length > 0 ? 'max-w-[98vw] xl:max-w-[95vw]' : 'max-w-4xl'
        }`}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 dark:bg-indigo-600/20 dark:border-indigo-500/30 dark:text-indigo-400 flex items-center justify-center shadow-sm">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{t('importerTitle')}</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">{t('importerSubtitle')}</p>
          </div>
        </div>

        {/* Source Mode Tabs */}
        {rows.length === 0 && (
          <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 gap-2">
            <button
              onClick={() => {
                setActiveTab('pdf');
                setErrorMessage(null);
              }}
              className={`pb-3 px-4 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
                activeTab === 'pdf'
                  ? 'border-indigo-600 text-indigo-700 dark:border-indigo-500 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>{t('tabPdf')}</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('paste');
                setErrorMessage(null);
              }}
              className={`pb-3 px-4 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
                activeTab === 'paste'
                  ? 'border-indigo-600 text-indigo-700 dark:border-indigo-500 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>{t('tabPaste')}</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('csv');
                setErrorMessage(null);
              }}
              className={`pb-3 px-4 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
                activeTab === 'csv'
                  ? 'border-indigo-600 text-indigo-700 dark:border-indigo-500 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>{t('tabCsv')}</span>
            </button>
          </div>
        )}

        {/* Error Alert Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-4 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs sm:text-sm flex items-start gap-2.5 shadow-sm animate-fade-in"
          >
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="flex-1 font-medium">{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-600 hover:text-rose-900 dark:text-rose-400 dark:hover:text-white transition p-0.5"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Password Prompt Subcomponent */}
        {isPasswordRequired && (
          <PasswordPromptCard
            pdfPassword={pdfPassword}
            onPasswordChange={setPdfPassword}
            onSubmit={handlePasswordSubmit}
            loading={loading}
          />
        )}

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-white/95 dark:bg-slate-950/85 backdrop-blur-sm z-40 rounded-2xl flex flex-col items-center justify-center p-6 text-center shadow-lg">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 dark:bg-indigo-900/50 dark:border-indigo-500/50 dark:text-indigo-400 flex items-center justify-center mb-4 shadow-sm animate-bounce">
              <RefreshCw className="w-7 h-7 animate-spin" />
            </div>
            <p className="text-base font-bold text-slate-900 dark:text-white mb-1.5">{loadingStatus}</p>
            <p className="text-xs text-indigo-700 dark:text-indigo-400 font-medium flex items-center gap-1.5">
              <span>🤖</span>
              <span>{t('processingAi')}</span>
            </p>
          </div>
        )}

        {/* Upload State: PDF Tab */}
        {rows.length === 0 && activeTab === 'pdf' && !isPasswordRequired && (
          <div
            onClick={() => pdfInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition bg-slate-50/80 hover:bg-slate-100/80 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:bg-slate-950/70 text-center"
          >
            <input
              type="file"
              ref={pdfInputRef}
              onChange={handlePdfFileUpload}
              accept=".pdf"
              className="hidden"
            />
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 dark:bg-gradient-to-tr dark:from-indigo-950 dark:to-purple-950 dark:border-indigo-700/50 dark:text-indigo-400 flex items-center justify-center mb-3 shadow-md">
              <FileText className="w-7 h-7" />
            </div>
            <p className="text-base font-bold text-slate-800 dark:text-white mb-1">{t('dragPdfHint')}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-lg mb-3">{t('dragPdfSupport')}</p>
            <div className="flex items-center gap-2 text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 dark:text-indigo-400 dark:bg-indigo-950/50 dark:border-indigo-800/40 px-3 py-1 rounded-full">
              <Check className="w-3.5 h-3.5" />
              <span>{t('dragPdfFeature')}</span>
            </div>
          </div>
        )}

        {/* Upload State: Paste Text Tab */}
        {rows.length === 0 && activeTab === 'paste' && (
          <div className="flex flex-col gap-3">
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder={t('pastePlaceholder')}
              rows={9}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-4 text-xs font-mono text-slate-900 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 resize-none shadow-sm"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">{t('pasteHint')}</span>
              <button
                type="button"
                onClick={handlePasteSubmit}
                disabled={!pastedText.trim() || loading}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition flex items-center gap-2 cursor-pointer shadow-sm hover:shadow"
              >
                <Sparkles className="w-4 h-4" />
                <span>{t('btnAnalyzeAi')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Upload State: CSV Tab */}
        {rows.length === 0 && activeTab === 'csv' && (
          <div
            onClick={() => csvInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition bg-slate-50/80 hover:bg-slate-100/80 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:bg-slate-950/70 text-center"
          >
            <input
              type="file"
              ref={csvInputRef}
              onChange={handleCsvFileUpload}
              accept=".csv"
              className="hidden"
            />
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 dark:bg-gradient-to-tr dark:from-indigo-950 dark:to-purple-950 dark:border-indigo-700/50 dark:text-indigo-400 flex items-center justify-center mb-3 shadow-md">
              <Upload className="w-7 h-7" />
            </div>
            <p className="text-base font-bold text-slate-800 dark:text-white mb-1">{t('dragCsvHint')}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mb-4">{t('dragCsvSupport')}</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                downloadSampleTemplate();
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
            >
              <span>{t('downloadSampleCsv')}</span>
            </button>
          </div>
        )}

        {/* Data Preview State with Subcomponents */}
        {rows.length > 0 && (
          <div className="flex-1 flex flex-col min-h-0 space-y-3">
            <ImportPreviewTable
              rows={rows}
              colWidths={colWidths}
              onResize={handleMouseDownResize}
              onCellChange={handleCellChange}
              onDeleteRow={handleDeleteRow}
              onReupload={() => {
                setRows([]);
                setFileName(null);
                setErrorMessage(null);
                setTokenUsage(null);
              }}
              fileName={fileName}
              validCount={validCount}
              invalidCount={invalidCount}
              totalAmount={totalAmount}
              getRowAmount={getRowAmount}
            />

            {/* Modal Bottom Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-header-secondary px-4 py-2 text-xs font-semibold rounded-xl border transition cursor-pointer"
                >
                  {t('btnCancel')}
                </button>
                {tokenUsage && (
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 font-mono flex items-center gap-1.5 border-l border-slate-300 dark:border-slate-700 pl-3">
                    <Activity className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>
                      {t('geminiTokens')}: <span className="font-bold text-slate-900 dark:text-white">{tokenUsage.total_tokens.toLocaleString()}</span> (Prompt: {tokenUsage.prompt_tokens.toLocaleString()} / Output: {tokenUsage.candidates_tokens.toLocaleString()}
                      {tokenUsage.thoughts_tokens && tokenUsage.thoughts_tokens > 0 ? ` / Thinking: ${tokenUsage.thoughts_tokens.toLocaleString()}` : ''})
                    </span>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleImportSubmit}
                disabled={loading || validCount === 0}
                className="btn-confirm-import flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{t('btnConfirmImport', { n: validCount })}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
