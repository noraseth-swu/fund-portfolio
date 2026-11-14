import React, { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  Download,
  Check,
  AlertCircle,
  FileSpreadsheet,
  FileText,
  Sparkles,
  Lock,
  ArrowRight,
  Trash2,
  RefreshCw,
  ClipboardPaste,
  Maximize2,
} from 'lucide-react';
import { createTransactionsBatch, parseStatementAi, type TokenUsage } from '../lib/api';
import { extractTextFromPdf, arrayBufferToBase64 } from '../lib/pdfParser';
import { PlatformBadge } from './PlatformBadge';
import { useI18n } from '../lib/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export interface ParsedRow {
  date: string;
  platform: string;
  fundCode: string;
  type: string;
  units: string;
  unitPrice: string;
  fee: string;
  note: string;
  isValid: boolean;
  error?: string;
}

const DEFAULT_COL_WIDTHS = {
  index: 40,
  date: 115,
  platform: 95,
  fundCode: 340, // 340px default to fit long fund names comfortably
  type: 125,
  amount: 110,
  nav: 140,
  units: 110,
  fee: 85,
  note: 180,
  action: 45,
};

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

  // Resizable column widths
  const [colWidths, setColWidths] = useState(DEFAULT_COL_WIDTHS);
  const resizingCol = useRef<{ col: keyof typeof DEFAULT_COL_WIDTHS; startX: number; startWidth: number } | null>(null);

  // PDF password handling
  const [pendingPdfBuffer, setPendingPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [pdfPassword, setPdfPassword] = useState('');
  const [isPasswordRequired, setIsPasswordRequired] = useState(false);

  // Direct text paste
  const [pastedText, setPastedText] = useState('');

  const csvInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Mouse drag column resizing handler
  const handleMouseDownResize = (col: keyof typeof DEFAULT_COL_WIDTHS, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    resizingCol.current = {
      col,
      startX: e.clientX,
      startWidth: colWidths[col],
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingCol.current) return;
      const delta = moveEvent.clientX - resizingCol.current.startX;
      const newWidth = Math.max(35, resizingCol.current.startWidth + delta);
      setColWidths((prev) => ({
        ...prev,
        [resizingCol.current!.col]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      resizingCol.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  if (!isOpen) return null;

  const downloadSampleTemplate = () => {
    const csvContent =
      'Date,Platform,Fund_Code,Type,Units,Unit_Price,Fee,Note\n' +
      '2026-01-15,KBANK,K-USA-A(A),BUY,500.0,12.5000,0,DCA รายเดือน\n' +
      '2026-01-20,DIME,SCBGOLDH,BUY,1000.0,10.2500,0,ออมทอง Dime!\n' +
      '2026-02-01,TTB,TMBGQG,BUY,300.0,15.1000,0,ซื้อผ่าน ttb touch\n' +
      '2026-02-15,SCB,SCBS&P500,BUY,400.0,20.0000,0,ซื้อผ่าน SCB EASY\n' +
      '2026-03-01,SCB,SCBS&P500,SELL,100.0,22.5000,0,Take profit ขายทำกำไร\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'fund_transactions_sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const normalizePlatform = (raw: string): string => {
    const s = (raw || '').toUpperCase().replace(/[\s!-]/g, '');
    if (s.includes('KBANK') || s.includes('KASIKORN') || s.includes('KPLUS') || s.includes('MYFUNDS')) return 'KBANK';
    if (s.includes('TTB') || s.includes('TMB') || s.includes('SMARTPORT') || s.includes('EASTSPRING')) return 'TTB';
    if (s.includes('DIME') || s.includes('KKP')) return 'DIME';
    if (s.includes('SCB') || s.includes('INNOVESTX')) return 'SCB';
    if (s.includes('KRUNGSRI') || s.includes('BAY') || s.includes('AYUDHYA')) return 'KRUNGSRI';
    if (s.includes('BBL') || s.includes('BUALUANG')) return 'BBLAM';
    return raw || 'OTHER';
  };

  const normalizeType = (raw: string): string => {
    const s = (raw || '').toUpperCase().trim();
    if (s === 'BUY' || s.includes('ซื้อ') || s.includes('SUB') || s.includes('ALLOCAT')) return 'BUY';
    if (s === 'SELL' || s.includes('ขาย') || s.includes('RED') || s.includes('SWITCH_OUT')) return 'SELL';
    if (s === 'DIVIDEND' || s.includes('ปันผล')) return 'DIVIDEND';
    return 'BUY';
  };

  // Convert parsed AI or CSV objects into validated rows
  const validateAndSetRows = (items: Array<{
    date: string;
    platform: string;
    fundCode: string;
    type: string;
    units: string | number;
    unitPrice: string | number;
    fee: string | number;
    note?: string;
  }>) => {
    const parsed: ParsedRow[] = items.map((r) => {
      const fundCode = (r.fundCode || '').trim();
      const units = String(r.units || '').replace(/,/g, '');
      const unitPrice = String(r.unitPrice || '').replace(/,/g, '');
      const fee = String(r.fee || '0').replace(/,/g, '');
      const note = (r.note || '').trim();

      let isValid = true;
      let error: string | undefined;

      if (!fundCode) {
        isValid = false;
        error = t('fundNotFound');
      } else if (!units || isNaN(parseFloat(units)) || parseFloat(units) <= 0) {
        isValid = false;
        error = t('invalidUnits');
      } else if (!unitPrice || isNaN(parseFloat(unitPrice)) || parseFloat(unitPrice) <= 0) {
        isValid = false;
        error = t('invalidNav');
      }

      return {
        date: r.date || new Date().toISOString().split('T')[0],
        platform: normalizePlatform(r.platform),
        fundCode,
        type: normalizeType(r.type),
        units,
        unitPrice,
        fee: fee || '0',
        note,
        isValid,
        error,
      };
    });

    setRows(parsed);
    setErrorMessage(null);
  };

  // Handle CSV file
  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setTokenUsage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCsvText(text);
    };
    reader.readAsText(file, 'utf-8');
  };

  const parseCsvText = (text: string) => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      setErrorMessage(t('csvNoData'));
      return;
    }

    const headerLine = lines[0];
    const delimiter = headerLine.includes('\t') ? '\t' : headerLine.includes(';') ? ';' : ',';
    const headers = headerLine.split(delimiter).map((h) => h.trim().toLowerCase());

    const findIndex = (aliases: string[]) =>
      headers.findIndex((h) => aliases.some((a) => h.includes(a)));

    const dateIdx = findIndex(['date', 'วัน']);
    const platIdx = findIndex(['platform', 'แพลตฟอร์ม', 'แอป', 'channel']);
    const fundIdx = findIndex(['fund', 'กองทุน', 'symbol', 'code']);
    const typeIdx = findIndex(['type', 'ประเภท', 'action']);
    const unitsIdx = findIndex(['unit', 'หน่วย', 'vol']);
    const priceIdx = findIndex(['price', 'ราคา', 'nav', 'cost']);
    const feeIdx = findIndex(['fee', 'ธรรมเนียม']);
    const noteIdx = findIndex(['note', 'หมายเหตุ', 'memo']);

    const rawItems = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));

      rawItems.push({
        date: dateIdx >= 0 && cols[dateIdx] ? cols[dateIdx] : new Date().toISOString().split('T')[0],
        platform: platIdx >= 0 && cols[platIdx] ? cols[platIdx] : 'KBANK',
        fundCode: fundIdx >= 0 && cols[fundIdx] ? cols[fundIdx] : '',
        type: typeIdx >= 0 && cols[typeIdx] ? cols[typeIdx] : 'BUY',
        units: unitsIdx >= 0 && cols[unitsIdx] ? cols[unitsIdx] : '',
        unitPrice: priceIdx >= 0 && cols[priceIdx] ? cols[priceIdx] : '',
        fee: feeIdx >= 0 && cols[feeIdx] ? cols[feeIdx] : '0',
        note: noteIdx >= 0 && cols[noteIdx] ? cols[noteIdx] : '',
      });
    }

    validateAndSetRows(rawItems);
  };

  // Process PDF file with Gemini AI
  const processPdfFile = async (buffer: ArrayBuffer, password?: string) => {
    setLoading(true);
    setLoadingStatus(t('analyzingPdfStructure'));
    setErrorMessage(null);

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
        units: tx.units,
        unitPrice: tx.unit_price,
        fee: tx.fee,
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

  const handlePdfFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPdfPassword('');
    setIsPasswordRequired(false);
    setErrorMessage(null);
    setTokenUsage(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (buffer) {
        setPendingPdfBuffer(buffer.slice(0));
        await processPdfFile(buffer.slice(0));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingPdfBuffer) return;
    await processPdfFile(pendingPdfBuffer.slice(0), pdfPassword);
  };

  // Process text pasted directly by user
  const handleDirectTextSubmit = async () => {
    if (!pastedText.trim()) return;
    setLoading(true);
    setLoadingStatus(t('aiAnalyzingPasted'));
    setErrorMessage(null);

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
        units: tx.units,
        unitPrice: tx.unit_price,
        fee: tx.fee,
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
    const updated = [...rows];
    updated.splice(index, 1);
    setRows(updated);
  };

  const handleCellChange = (index: number, field: keyof ParsedRow, val: string) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: val };

    const r = updated[index];
    let isValid = true;
    let error: string | undefined;
    if (!r.fundCode.trim()) {
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
      const payloads = validRows.map((r) => ({
        proj_id: r.fundCode,
        fund_abbr: r.fundCode,
        platform: r.platform,
        trans_type: r.type,
        trans_date: r.date,
        units: r.units,
        unit_price: r.unitPrice,
        fee: r.fee,
        note: r.note,
      }));

      await createTransactionsBatch(payloads);
      onSuccess();
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
    .filter((r) => r.isValid && !isNaN(parseFloat(r.units)) && !isNaN(parseFloat(r.unitPrice)))
    .reduce((sum, r) => sum + parseFloat(r.units) * parseFloat(r.unitPrice), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div
        className={`modal-card bg-slate-900 border border-slate-800 rounded-2xl w-full p-5 sm:p-6 shadow-2xl relative flex flex-col max-h-[92vh] transition-all duration-300 ${
          rows.length > 0 ? 'max-w-[98vw] xl:max-w-[95vw]' : 'max-w-4xl'
        }`}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pr-8">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
              <h2 className="text-xl font-bold text-white">{t('importerTitle')}</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{t('importerSubtitle')}</p>
          </div>

          {/* Mode Switch Tabs (Only when no rows loaded) */}
          {rows.length === 0 && (
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto filter-tabs-container">
              <button
                onClick={() => setActiveTab('pdf')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  activeTab === 'pdf'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 tab-btn-active'
                    : 'text-slate-400 hover:text-slate-200 tab-btn-inactive'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{t('tabPdf')}</span>
              </button>

              <button
                onClick={() => setActiveTab('paste')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  activeTab === 'paste'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 tab-btn-active'
                    : 'text-slate-400 hover:text-slate-200 tab-btn-inactive'
                }`}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>{t('tabPaste')}</span>
              </button>

              <button
                onClick={() => setActiveTab('csv')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  activeTab === 'csv'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 tab-btn-active'
                    : 'text-slate-400 hover:text-slate-200 tab-btn-inactive'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{t('tabCsv')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="flex-1">{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Password Prompt for Encrypted PDFs */}
        {isPasswordRequired && (
          <div className="mb-4 p-5 rounded-2xl bg-amber-950/30 border border-amber-600/50 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold">
              <Lock className="w-4 h-4" />
              <span>{t('pdfPasswordRequired')}</span>
            </div>
            <p className="text-xs text-slate-300">{t('pdfPasswordHint')}</p>
            <form onSubmit={handlePasswordSubmit} className="flex items-center gap-2 mt-1">
              <input
                type="password"
                placeholder={t('enterPasswordPlaceholder')}
                value={pdfPassword}
                onChange={(e) => setPdfPassword(e.target.value)}
                autoFocus
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={loading || !pdfPassword}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded-xl text-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>{t('unlockAndScan')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-40 rounded-2xl flex flex-col items-center justify-center p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-900/50 border border-indigo-500/50 flex items-center justify-center text-indigo-400 mb-4 animate-bounce">
              <Sparkles className="w-7 h-7" />
            </div>
            <p className="text-base font-bold text-white mb-1.5">{t('processingAi')}</p>
            <p className="text-xs text-indigo-300 animate-pulse">{loadingStatus || 'กำลังประมวลผล...'}</p>
          </div>
        )}

        {/* 1. PDF Upload View */}
        {rows.length === 0 && activeTab === 'pdf' && !isPasswordRequired && (
          <div
            onClick={() => pdfInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition bg-slate-950/40 hover:bg-slate-950/70 text-center"
          >
            <input
              type="file"
              ref={pdfInputRef}
              onChange={handlePdfFileUpload}
              accept=".pdf"
              className="hidden"
            />
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-950 to-purple-950 border border-indigo-700/50 flex items-center justify-center text-indigo-400 mb-3 shadow-lg shadow-indigo-600/20">
              <FileText className="w-7 h-7" />
            </div>
            <p className="text-base font-bold text-white mb-1">{t('dragPdfHint')}</p>
            <p className="text-xs text-slate-400 max-w-lg mb-3">{t('dragPdfSupport')}</p>
            <div className="flex items-center gap-2 text-[11px] text-indigo-400 bg-indigo-950/50 px-3 py-1 rounded-full border border-indigo-800/40">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('dragPdfFeature')}</span>
            </div>
          </div>
        )}

        {/* 2. Direct Text Paste View */}
        {rows.length === 0 && activeTab === 'paste' && (
          <div className="flex flex-col flex-1 gap-3">
            <p className="text-xs text-slate-400">{t('pasteHint')}</p>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder={t('pastePlaceholder')}
              className="w-full flex-1 min-h-[220px] bg-slate-950 border border-slate-700 rounded-xl p-4 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleDirectTextSubmit}
              disabled={loading || !pastedText.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition self-end flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{t('btnAnalyzeAi')}</span>
            </button>
          </div>
        )}

        {/* 3. CSV File Upload View */}
        {rows.length === 0 && activeTab === 'csv' && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <button
                onClick={downloadSampleTemplate}
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold px-3 py-1.5 rounded-lg border border-indigo-500/30 hover:bg-indigo-950/40 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t('downloadSampleCsv')}</span>
              </button>
            </div>

            <div
              onClick={() => csvInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition bg-slate-950/40 hover:bg-slate-950/70 text-center"
            >
              <input
                type="file"
                ref={csvInputRef}
                onChange={handleCsvFileUpload}
                accept=".csv,.txt"
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400 mb-3 shadow-lg shadow-indigo-600/20">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-white mb-1">{t('dragCsvHint')}</p>
              <p className="text-xs text-slate-400">{t('dragCsvSupport')}</p>
            </div>
          </div>
        )}

        {/* 4. Parsed Table Preview View (Shared for both PDF and CSV) */}
        {rows.length > 0 && (
          <div className="flex flex-col flex-1 overflow-hidden space-y-3">
            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between text-xs bg-slate-950/70 px-4 py-2.5 rounded-xl border border-slate-800 gap-2">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{t('dataSource')}:</span>
                <span className="font-semibold text-white font-mono bg-slate-800 px-2 py-0.5 rounded">
                  {fileName || t('importedFileDefault')}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>{t('validCount', { n: validCount })}</span>
                </span>

                {totalAmount > 0 && (
                  <span className="text-slate-300 font-semibold border-l border-slate-700 pl-3">
                    {t('totalAmountSum')}: <span className="text-emerald-400 font-mono">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> {t('currencyBaht')}
                  </span>
                )}

                {invalidCount > 0 && (
                  <span className="text-rose-400 font-semibold flex items-center gap-1 border-l border-slate-700 pl-3">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{t('invalidCount', { n: invalidCount })}</span>
                  </span>
                )}

                <button
                  onClick={() => {
                    setRows([]);
                    setFileName(null);
                    setErrorMessage(null);
                    setTokenUsage(null);
                  }}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>{t('reupload')}</span>
                </button>
              </div>
            </div>

            {/* Hint for dragging columns */}
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 px-1">
              <Maximize2 className="w-3 h-3 text-slate-400" />
              <span>{t('colResizeHint')}</span>
            </div>

            {/* Editable Preview Table with Resizable Columns */}
            <div className="flex-1 overflow-auto rounded-xl border border-slate-800 bg-slate-950/50">
              <table className="w-full text-left text-xs text-slate-300 border-collapse table-fixed">
                <thead className="bg-slate-900 sticky top-0 border-b border-slate-800 z-10 text-[11px] uppercase tracking-wider text-slate-400 font-semibold select-none">
                  <tr>
                    {/* Index */}
                    <th style={{ width: colWidths.index }} className="py-2.5 px-2 text-center text-slate-500 relative">
                      #
                    </th>

                    {/* Date */}
                    <th style={{ width: colWidths.date }} className="py-2.5 px-2 whitespace-nowrap relative">
                      <span>{t('effectiveDate')}</span>
                      <div
                        onMouseDown={(e) => handleMouseDownResize('date', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/50 z-20"
                      />
                    </th>

                    {/* Platform */}
                    <th style={{ width: colWidths.platform }} className="py-2.5 px-2 whitespace-nowrap relative">
                      <span>{t('platformHeader')}</span>
                      <div
                        onMouseDown={(e) => handleMouseDownResize('platform', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/50 z-20"
                      />
                    </th>

                    {/* Fund Code & Name - Resizable column without static highlight */}
                    <th style={{ width: colWidths.fundCode }} className="py-2.5 px-3 whitespace-nowrap relative">
                      <span>{t('fundCodeName')}</span>
                      <div
                        onMouseDown={(e) => handleMouseDownResize('fundCode', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/50 z-20"
                      />
                    </th>

                    {/* Type */}
                    <th style={{ width: colWidths.type }} className="py-2.5 px-2 whitespace-nowrap relative">
                      <span>{t('transType')}</span>
                      <div
                        onMouseDown={(e) => handleMouseDownResize('type', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/50 z-20"
                      />
                    </th>

                    {/* Amount */}
                    <th style={{ width: colWidths.amount }} className="py-2.5 px-2.5 text-right whitespace-nowrap relative">
                      <span>{t('amountThb')}</span>
                      <div
                        onMouseDown={(e) => handleMouseDownResize('amount', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/50 z-20"
                      />
                    </th>

                    {/* NAV on Effective Date */}
                    <th style={{ width: colWidths.nav }} className="py-2.5 px-2.5 text-right whitespace-nowrap text-indigo-300 relative">
                      <span>{t('navOnEffective')}</span>
                      <div
                        onMouseDown={(e) => handleMouseDownResize('nav', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/50 z-20"
                      />
                    </th>

                    {/* Units */}
                    <th style={{ width: colWidths.units }} className="py-2.5 px-2.5 text-right whitespace-nowrap relative">
                      <span>{t('unitsHeader')}</span>
                      <div
                        onMouseDown={(e) => handleMouseDownResize('units', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/50 z-20"
                      />
                    </th>

                    {/* Fee */}
                    <th style={{ width: colWidths.fee }} className="py-2.5 px-2 text-right whitespace-nowrap relative">
                      <span>{t('feeThb')}</span>
                      <div
                        onMouseDown={(e) => handleMouseDownResize('fee', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/50 z-20"
                      />
                    </th>

                    {/* Note */}
                    <th style={{ width: colWidths.note }} className="py-2.5 px-3 relative">
                      <span>{t('noteText')}</span>
                      <div
                        onMouseDown={(e) => handleMouseDownResize('note', e)}
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500/50 z-20"
                      />
                    </th>

                    {/* Action */}
                    <th style={{ width: colWidths.action }} className="py-2.5 px-2 text-center">
                      {t('actionDelete')}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {rows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-800/40 transition ${
                        !row.isValid ? 'bg-rose-950/20' : ''
                      }`}
                    >
                      <td style={{ width: colWidths.index }} className="py-2 px-2 text-slate-500 text-[10px] text-center">
                        {idx + 1}
                      </td>

                      {/* Date */}
                      <td style={{ width: colWidths.date }} className="py-2 px-2">
                        <input
                          type="text"
                          value={row.date}
                          onChange={(e) => handleCellChange(idx, 'date', e.target.value)}
                          className="w-full bg-slate-900/60 border border-slate-700/60 hover:border-slate-600 focus:border-indigo-500 rounded px-2 py-1 text-white text-center focus:outline-none"
                        />
                      </td>

                      {/* Platform */}
                      <td style={{ width: colWidths.platform }} className="py-2 px-2 whitespace-nowrap">
                        <PlatformBadge platform={row.platform} />
                      </td>

                      {/* Fund Code & Name - Full text display & flexible */}
                      <td style={{ width: colWidths.fundCode }} className="py-2 px-3">
                        <input
                          type="text"
                          value={row.fundCode}
                          title={row.fundCode}
                          onChange={(e) => handleCellChange(idx, 'fundCode', e.target.value)}
                          className={`w-full bg-slate-900/70 border rounded px-2.5 py-1 font-medium font-sans focus:outline-none transition ${
                            !row.fundCode
                              ? 'border-rose-500 text-rose-300'
                              : 'border-slate-700/60 hover:border-slate-600 focus:border-indigo-500 text-indigo-300'
                          }`}
                        />
                      </td>

                      {/* Type */}
                      <td style={{ width: colWidths.type }} className="py-2 px-2">
                        <select
                          value={row.type}
                          onChange={(e) => handleCellChange(idx, 'type', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-indigo-500"
                        >
                          <option value="BUY">{t('buy')}</option>
                          <option value="SELL">{t('sell')}</option>
                          <option value="DIVIDEND">{t('dividend')}</option>
                        </select>
                      </td>

                      {/* Total Amount (Units * NAV) */}
                      <td style={{ width: colWidths.amount }} className="py-2 px-2.5 text-right font-mono text-emerald-400 font-semibold whitespace-nowrap">
                        {!isNaN(parseFloat(row.units)) && !isNaN(parseFloat(row.unitPrice))
                          ? (parseFloat(row.units) * parseFloat(row.unitPrice)).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : '-'}
                      </td>

                      {/* NAV on Effective Date */}
                      <td style={{ width: colWidths.nav }} className="py-2 px-2.5 text-right">
                        <input
                          type="text"
                          value={row.unitPrice}
                          title={t('navOnEffective')}
                          placeholder="NAV..."
                          onChange={(e) => handleCellChange(idx, 'unitPrice', e.target.value)}
                          className={`w-full bg-slate-900/60 border rounded px-2 py-1 text-right focus:outline-none ${
                            !row.unitPrice || isNaN(parseFloat(row.unitPrice))
                              ? 'border-rose-500 text-rose-300'
                              : 'border-slate-700/60 hover:border-slate-600 focus:border-indigo-500 text-indigo-300 font-bold'
                          }`}
                        />
                      </td>

                      {/* Units */}
                      <td style={{ width: colWidths.units }} className="py-2 px-2.5 text-right">
                        <input
                          type="text"
                          value={row.units}
                          onChange={(e) => handleCellChange(idx, 'units', e.target.value)}
                          className={`w-full bg-slate-900/60 border rounded px-2 py-1 text-right focus:outline-none ${
                            !row.units || isNaN(parseFloat(row.units))
                              ? 'border-rose-500 text-rose-300'
                              : 'border-slate-700/60 hover:border-slate-600 focus:border-indigo-500 text-white'
                          }`}
                        />
                      </td>

                      {/* Fee */}
                      <td style={{ width: colWidths.fee }} className="py-2 px-2 text-right">
                        <input
                          type="text"
                          value={row.fee}
                          onChange={(e) => handleCellChange(idx, 'fee', e.target.value)}
                          className="w-full bg-slate-900/60 border border-slate-700/60 hover:border-slate-600 focus:border-indigo-500 rounded px-2 py-1 text-right text-slate-400 focus:outline-none"
                        />
                      </td>

                      {/* Note */}
                      <td style={{ width: colWidths.note }} className="py-2 px-3">
                        <input
                          type="text"
                          value={row.note}
                          placeholder={`${t('noteText')}...`}
                          title={row.note}
                          onChange={(e) => handleCellChange(idx, 'note', e.target.value)}
                          className="w-full bg-slate-900/60 border border-slate-700/60 hover:border-slate-600 focus:border-indigo-500 rounded px-2.5 py-1 text-slate-300 text-[11px] focus:outline-none"
                        />
                      </td>

                      {/* Delete Action */}
                      <td style={{ width: colWidths.action }} className="py-2 px-2 text-center">
                        <button
                          onClick={() => handleDeleteRow(idx)}
                          className="text-slate-500 hover:text-rose-400 p-1.5 rounded hover:bg-rose-950/40 transition cursor-pointer"
                          title={t('deleteRowTooltip')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Modal Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-header-secondary px-4 py-2 text-xs font-semibold rounded-xl border transition cursor-pointer"
                >
                  {t('btnCancel')}
                </button>
                {tokenUsage && (
                  <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 border-l border-slate-700 pl-3">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400/80 shrink-0" />
                    <span>
                      {t('geminiTokens')}: {tokenUsage.total_tokens.toLocaleString()} (Prompt: {tokenUsage.prompt_tokens.toLocaleString()} / Output: {tokenUsage.candidates_tokens.toLocaleString()})
                    </span>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleImportSubmit}
                disabled={loading || validCount === 0}
                className="btn-confirm-import flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-900/30 cursor-pointer"
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
