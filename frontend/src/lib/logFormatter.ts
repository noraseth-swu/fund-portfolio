export type LogType = 'success' | 'stock' | 'file' | 'info' | 'skip' | 'pvd' | 'warning' | 'error' | 'complete';

export interface FormattedLog {
  raw: string;
  timestamp?: string;
  type: LogType;
  platform?: string;
  badgeText: string;
  badgeClass: string;
  message: string;
}

function formatAmount(val: string | number): string {
  const n = typeof val === 'number' ? val : parseFloat(val.replace(/,/g, ''));
  if (isNaN(n)) return String(val);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatLiveLog(rawLog: string, locale: 'th' | 'en' = 'th'): FormattedLog {
  const isTh = locale === 'th';
  
  // 1. Extract optional timestamp (e.g. "2026-11-15 15:49:41" or "[15:49:41]")
  let timestamp: string | undefined;
  const tsMatch = rawLog.match(/^(?:(\d{4}-\d{2}-\d{2}\s+)?(\d{2}:\d{2}:\d{2})|\[(\d{2}:\d{2}:\d{2})\])/);
  if (tsMatch) {
    timestamp = tsMatch[2] || tsMatch[3];
  }

  // 2. Extract platform tag if present e.g. "[TTB]", "[SCB]", "[DIME]", "[KBANK]"
  let platform: string | undefined;
  const platMatch = rawLog.match(/\[(TTB|SCB|DIME|KBANK|KBANK_PVD|DIME_STOCK)\]/i);
  if (platMatch) {
    platform = platMatch[1].toUpperCase();
  } else {
    const wordPlat = rawLog.match(/\b(TTB|SCB|DIME|KBANK|KBank|K-Asset)\b/i);
    if (wordPlat) {
      platform = wordPlat[1].toUpperCase();
    }
  }

  // A. Pending Mutual Fund Transaction Inserted
  // e.g. "[+] [PENDING] Inserted 2026-03-30 SCBS&P500E (1000.00 THB) from 1_686340000249.pdf"
  // or "[+] [PENDING] Inserted 2024-01-29 ONE EUROPEAN EQUITY FUND (150.00 THB) from ttb confirmation note e-statement 31-Jan-2024.pdf"
  const pendingMatch = rawLog.match(/\[\+\]\s+\[PENDING\]\s+Inserted\s+(\d{4}-\d{2}-\d{2})\s+(.+?)\s+\(([\d,.]+)\s+THB\)/i);
  if (pendingMatch) {
    const [, date, fund, amount] = pendingMatch;
    const formattedAmt = formatAmount(amount);
    return {
      raw: rawLog,
      timestamp,
      type: 'success',
      platform,
      badgeText: isTh ? 'นำเข้าสำเร็จ' : 'Imported',
      badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/80 font-bold',
      message: isTh
        ? `บันทึกรายการกองทุน ${fund} ยอด ฿${formattedAmt} (วันที่ ${date})`
        : `Imported fund ${fund} amount ฿${formattedAmt} (Date: ${date})`,
    };
  }

  // A2. SEC NAV Price Adjustment
  // e.g. "[INFO] [PENDING] Using SEC NAV 10.8265 instead of raw price 15.6770 for TMBGET8 on 2023-12-28"
  const navAdjMatch = rawLog.match(/Using SEC NAV\s+([\d.]+)\s+instead of raw price\s+([\d.]+)\s+for\s+([^\s]+)(?:\s+on\s+(\d{4}-\d{2}-\d{2}))?/i);
  if (navAdjMatch) {
    const [, secNav, rawPrice, fund, date] = navAdjMatch;
    return {
      raw: rawLog,
      timestamp,
      type: 'info',
      platform,
      badgeText: isTh ? 'SEC NAV' : 'SEC NAV',
      badgeClass: 'bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-500/80 font-bold',
      message: isTh
        ? `ปรับราคา NAV เป็น ${secNav} (เดิม ${rawPrice}) สำหรับกองทุน ${fund}${date ? ` (วันที่ ${date})` : ''}`
        : `Using SEC NAV ${secNav} (raw ${rawPrice}) for ${fund}${date ? ` (${date})` : ''}`,
    };
  }

  // A3. Harvest Initialization & Batch Staging
  if (rawLog.includes('Generated Staging Batch ID:') || rawLog.includes('Starting Gmail harvest')) {
    const isStart = rawLog.includes('Starting Gmail harvest');
    return {
      raw: rawLog,
      timestamp,
      type: 'info',
      platform: platform || 'SYNC',
      badgeText: isStart ? (isTh ? 'เริ่มสแกน' : 'Start Sync') : (isTh ? 'สร้างแบทช์' : 'Batch Created'),
      badgeClass: 'bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-500/80 font-bold',
      message: isStart
        ? (isTh ? 'เริ่มต้นการดึงข้อมูลจากกล่องจดหมาย Gmail...' : 'Starting Gmail statement harvest...')
        : (isTh ? `สร้างชุดข้อมูลนำเข้า (Batch: ${rawLog.replace(/.*Generated Staging Batch ID:\s*/i, '').trim()})` : rawLog.replace(/.*\[INFO\]\s*/i, '')),
    };
  }

  // B. Stock Transaction Inserted
  // e.g. "[+] [STOCK] Inserted 2025-12-17 NVDA (0.1798 shares @ $176.12, 992.97 THB) into stock_transactions from Dime_offshore_...pdf"
  const stockMatch = rawLog.match(/\[\+\]\s+\[STOCK\]\s+Inserted\s+(\d{4}-\d{2}-\d{2})\s+([A-Z0-9]+)\s+\(([\d.]+)\s+shares\s+@\s+\$([\d.]+),\s+([\d.]+)\s+THB\)/i);
  if (stockMatch) {
    const [, date, ticker, shares, priceUsd, amountThb] = stockMatch;
    const formattedThb = formatAmount(amountThb);
    return {
      raw: rawLog,
      timestamp,
      type: 'stock',
      platform: platform || 'DIME',
      badgeText: isTh ? 'นำเข้าหุ้น' : 'Stock Imported',
      badgeClass: 'bg-cyan-100 text-cyan-800 border border-cyan-300 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-500/80 font-bold',
      message: isTh
        ? `บันทึกหุ้น ${ticker} จำนวน ${shares} หุ้น @ $${priceUsd} (ยอด ฿${formattedThb}, วันที่ ${date})`
        : `Imported stock ${ticker} (${shares} shares @ $${priceUsd}, ฿${formattedThb}, Date: ${date})`,
    };
  }

  // C. PVD Positions Synced
  // e.g. "[KBANK_PVD] [✓] Synced latest PVD positions (As of 2026-09-30): 3 policies, Total Value: 407250.92 THB"
  const pvdMatch = rawLog.match(/Synced latest PVD positions.*?As of (\d{4}-\d{2}-\d{2})\)?:\s+(\d+)\s+policies.*?Total Value:\s+([\d.]+)\s+THB/i);
  if (pvdMatch) {
    const [, asOfDate, count, totalVal] = pvdMatch;
    const formattedVal = formatAmount(totalVal);
    return {
      raw: rawLog,
      timestamp,
      type: 'pvd',
      platform: 'KBANK (PVD)',
      badgeText: isTh ? 'ซิงค์ PVD สำเร็จ' : 'PVD Synced',
      badgeClass: 'bg-teal-100 text-teal-800 border border-teal-300 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-500/80 font-bold',
      message: isTh
        ? `ซิงค์ข้อมูลกองทุนสำรองเลี้ยงชีพ PVD (${count} นโยบาย, มูลค่ารวม ฿${formattedVal}, ณ วันที่ ${asOfDate})`
        : `Synced Provident Fund snapshot (${count} policies, total ฿${formattedVal}, as of ${asOfDate})`,
    };
  }

  // D. Regex Fast-Path parsed
  const regexFastMatch = rawLog.match(/Regex Fast-Path parsed\s+(\d+)\s+transactions from\s+'([^']+)'/i);
  if (regexFastMatch) {
    const [, count, filename] = regexFastMatch;
    return {
      raw: rawLog,
      timestamp,
      type: 'success',
      platform,
      badgeText: isTh ? 'อ่านสำเร็จ (0 Token)' : 'Fast-Path Parsed',
      badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/80 font-bold',
      message: isTh
        ? `อ่านข้อมูลสำเร็จ ${count} รายการจากไฟล์ ${filename} (Fast-Path 0 Tokens)`
        : `Parsed ${count} transactions from ${filename} via Fast-Path (0 Tokens)`,
    };
  }

  // E. Decrypted PDF File
  // e.g. "[✓] Decrypted '1_686340000249.pdf' using password '47802'"
  const decryptMatch = rawLog.match(/\[[✓\u2713]\]\s+Decrypted\s+'([^']+)'(?:\s+using password\s+'([^']+)')?/i);
  if (decryptMatch) {
    const [, filename, pwd] = decryptMatch;
    return {
      raw: rawLog,
      timestamp,
      type: 'file',
      platform,
      badgeText: isTh ? 'ถอดรหัสสำเร็จ' : 'Decrypted',
      badgeClass: 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-500/80 font-bold',
      message: isTh
        ? `ถอดรหัสและเปิดไฟล์ PDF สำเร็จ: ${filename}${pwd ? ` (รหัสผ่าน: ${pwd})` : ''}`
        : `Successfully decrypted PDF statement: ${filename}${pwd ? ` (pwd: ${pwd})` : ''}`,
    };
  }

  // F. Queuing or Found New Attachment
  const queueMatch = rawLog.match(/(?:Queuing attachment|Found attachment)\s+'([^']+)'/i);
  if (queueMatch) {
    const [, filename] = queueMatch;
    return {
      raw: rawLog,
      timestamp,
      type: 'file',
      platform,
      badgeText: isTh ? 'ส่งเข้าคิวถอดรหัส' : 'Queued PDF',
      badgeClass: 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-500/80 font-bold',
      message: isTh
        ? `ส่งไฟล์ ${filename} เข้าคิวถอดรหัสและอ่านข้อมูล (ระบบคู่ขนาน)`
        : `Queued ${filename} for parallel decryption and parsing`,
    };
  }

  // G. Scanning or Processing email
  // e.g. "[DIME] [41/135] Processing new email: '[Dime!] Confirmation Note'..."
  const scanMatch = rawLog.match(/\[(\d+)\/(\d+)\]\s+(?:Processing new email:\s+'([^']+)'|([^.\n]+))/i);
  if (scanMatch) {
    const [, current, total, subject1, subject2] = scanMatch;
    const subj = subject1 || subject2 || '';
    return {
      raw: rawLog,
      timestamp,
      type: 'info',
      platform,
      badgeText: isTh ? 'กำลังสแกน' : 'Scanning',
      badgeClass: 'bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-500/80 font-bold',
      message: isTh
        ? `กำลังตรวจสอบอีเมลฉบับที่ ${current}/${total}${subj ? `: ${subj}` : ''}`
        : `Scanning email ${current}/${total}${subj ? `: ${subj}` : ''}`,
    };
  }

  // H. Searching for emails
  const searchMatch = rawLog.match(/(?:Searching for\s+(\w+)\s+emails from\s+([^\s.]+)|กำลังค้นหาอีเมลจาก\s+([^\s.]+))/i);
  if (searchMatch) {
    const broker = searchMatch[1] || platform || '';
    const emailAddr = searchMatch[2] || searchMatch[3] || '';
    return {
      raw: rawLog,
      timestamp,
      type: 'info',
      platform: broker || platform,
      badgeText: isTh ? 'ค้นหาอีเมล' : 'Searching',
      badgeClass: 'bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-500/80 font-bold',
      message: isTh
        ? `กำลังค้นหาอีเมลของ ${broker || 'สถาบัน'} จาก ${emailAddr}...`
        : `Searching for ${broker || ''} emails from ${emailAddr}...`,
    };
  }

  // I. Found N emails for broker
  const foundMatch = rawLog.match(/(?:Found\s+(\d+)\s+emails for\s+(\w+)|พบ\s+(\d+)\s+อีเมล)/i);
  if (foundMatch) {
    const count = foundMatch[1] || foundMatch[3];
    const broker = foundMatch[2] || platform || '';
    return {
      raw: rawLog,
      timestamp,
      type: 'info',
      platform: broker || platform,
      badgeText: isTh ? 'พบอีเมล' : 'Found Emails',
      badgeClass: 'bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-500/80 font-bold',
      message: isTh
        ? `พบ ${count} อีเมลของ ${broker || 'สถาบัน'} กำลังเริ่มตรวจสอบรายการ...`
        : `Found ${count} emails for ${broker || ''}. Scanning transactions...`,
    };
  }

  // J. Skipping already-processed email
  if (rawLog.includes('Skipping already-processed email') || rawLog.includes('ข้ามอีเมลที่เคยสแกนแล้ว')) {
    return {
      raw: rawLog,
      timestamp,
      type: 'skip',
      platform,
      badgeText: isTh ? 'ข้ามรายการซ้ำ' : 'Skipped',
      badgeClass: 'bg-slate-200 text-slate-800 border border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 font-medium',
      message: isTh
        ? 'ข้ามอีเมลที่เคยประมวลผลแล้ว (Fast-Check 0 Tokens)'
        : 'Skipping previously processed email (Fast-Check 0 Tokens)',
    };
  }

  // K. Rate limit or 429 warning
  if (rawLog.includes('Rate limit') || rawLog.includes('429') || rawLog.includes('[WARNING]')) {
    const waitSec = rawLog.match(/(\d+)\s+seconds/i);
    return {
      raw: rawLog,
      timestamp,
      type: 'warning',
      platform,
      badgeText: isTh ? 'รอโควตา API' : 'Rate Limit',
      badgeClass: 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/90 dark:text-amber-200 dark:border-amber-400 font-bold',
      message: isTh
        ? `ถึงขีดจำกัดความเร็ว API ชั่วคราว กำลังรอ ${waitSec ? waitSec[1] : '15'} วินาทีเพื่อลองใหม่...`
        : `Rate limit reached. Backing off for ${waitSec ? waitSec[1] : '15'}s before retry...`,
    };
  }

  // L. Error or Failure
  if (rawLog.includes('[ERROR]') || rawLog.includes('[✗]') || rawLog.includes('Failed to')) {
    return {
      raw: rawLog,
      timestamp,
      type: 'error',
      platform,
      badgeText: isTh ? 'ข้อผิดพลาด' : 'Error',
      badgeClass: 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/80 font-bold',
      message: rawLog.replace(/.*?\[ERROR\]\s*/i, '').replace(/.*?\[✗\]\s*/i, ''),
    };
  }

  // M. Completion Notice
  if (rawLog.includes('COMPLETED') || rawLog.includes('เสร็จสิ้น') || rawLog.includes('🎉')) {
    return {
      raw: rawLog,
      timestamp,
      type: 'complete',
      platform,
      badgeText: isTh ? 'เสร็จสมบูรณ์' : 'Completed',
      badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900 dark:text-emerald-100 dark:border-emerald-400 font-bold',
      message: isTh
        ? 'การสแกนกล่องจดหมายและประมวลผลเอกสารเสร็จสมบูรณ์เรียบร้อยแล้ว'
        : 'Email harvest and document analysis completed successfully',
    };
  }

  // Fallback: Clean Technical Line with High Contrast
  const cleanMessage = rawLog.replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\[\w+\]\s*/, '').replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
  return {
    raw: rawLog,
    timestamp,
    type: 'info',
    platform,
    badgeText: isTh ? 'บันทึก' : 'Log',
    badgeClass: 'bg-slate-200 text-slate-800 border border-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 font-semibold',
    message: cleanMessage,
  };
}
