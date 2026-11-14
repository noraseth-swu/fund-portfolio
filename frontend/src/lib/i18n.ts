import { useState } from 'react';

export type Locale = 'th' | 'en';

const LOCALE_KEY = 'fund_portfolio_locale';

export const translations = {
  th: {
    appTitle: 'Fund Portfolio Manager',
    appSubtitle: 'รวมพอร์ตลงทุนกองทุนรวม KBank, ttb, Dime! และ SCB',
    syncNav: 'ดึงราคาล่าสุด (SEC)',
    syncing: 'กำลังดึงราคา...',
    importData: 'นำเข้าข้อมูล (PDF / CSV)',
    transHistory: 'ประวัติธุรกรรม',
    addTransaction: 'บันทึกธุรกรรม',
    
    // Theme
    themeDark: 'โหมดมืด (Dark)',
    themeLight: 'โหมดสว่าง (Bright)',
    themeAuto: 'ตามระบบ (Auto)',

    // Metrics
    totalValue: 'มูลค่าพอร์ตลงทุนรวม',
    totalCost: 'ต้นทุนเงินลงทุนรวม',
    unrealizedPl: 'กำไร/ขาดทุนที่ยังไม่เกิดขึ้น',
    totalDividend: 'เงินปันผลสะสมทั้งหมด',
    realizedPl: 'กำไรรับจริง (Realized P/L)',
    currentNav: 'ราคา NAV ล่าสุด',

    // Holdings Table
    holdingsTitle: 'รายการกองทุนคงค้างในพอร์ต',
    allPlatforms: 'ทุกแพลตฟอร์ม',
    fundHeader: 'กองทุน',
    platformHeader: 'แพลตฟอร์ม',
    unitsHeader: 'จำนวนหน่วย',
    avgCostHeader: 'ต้นทุนเฉลี่ย',
    navHeader: 'ราคา NAV',
    marketValHeader: 'มูลค่าปัจจุบัน',
    plHeader: 'กำไร/ขาดทุน (P/L)',
    noHoldings: 'ไม่พบรายการกองทุนในพอร์ตของคุณ (กดปุ่ม "+ บันทึกธุรกรรม" เพื่อเริ่มบันทึกรายการ)',

    // Allocation
    allocationTitle: 'สัดส่วนพอร์ตตามแพลตฟอร์ม',

    // Universal Statement Importer
    importerTitle: 'Universal Statement Importer',
    importerSubtitle: 'นำเข้าประวัติธุรกรรมอัตโนมัติจากใบยืนยันการจัดสรร (PDF / Email) ผ่าน Gemini AI หรือนำเข้าจาก CSV',
    tabPdf: 'PDF Statement (AI)',
    tabPaste: 'วางข้อความ',
    tabCsv: 'CSV File',
    dataSource: 'แหล่งข้อมูล',
    validCount: 'ถูกต้อง: {n} รายการ',
    invalidCount: 'ไม่ถูกต้อง: {n} รายการ',
    totalAmountSum: 'ยอดเงินรวม',
    geminiTokens: 'Token ที่ใช้',
    reupload: 'อัปโหลดใหม่',
    effectiveDate: 'วันที่มีผล',
    fundCodeName: 'รหัส / ชื่อกองทุน',
    transType: 'ประเภท',
    amountThb: 'ยอดเงิน (บาท)',
    navOnEffective: 'NAV ณ วันที่ทำรายการมีผล',
    feeThb: 'ค่าธรรมเนียม',
    noteText: 'หมายเหตุ',
    actionDelete: 'ลบ',
    btnCancel: 'ยกเลิก',
    btnConfirmImport: 'ยืนยันบันทึก {n} รายการเข้าพอร์ต',
    dragPdfHint: 'คลิกเพื่อเลือกไฟล์ หรือลากไฟล์ PDF ใบยืนยันรายการ / Statement มาวางที่นี่',
    dragPdfSupport: 'รองรับไฟล์ PDF ทุกรูปแบบจาก KBank (K-My Funds), ttb smart port, Dime!, InnovestX, SCBAM, Krungsri ฯลฯ',
    dragPdfFeature: 'รองรับทั้ง PDF ที่มีรหัสผ่าน, เอกสารดิจิทัล และใบเสร็จสแกน (OCR)',
    pasteHint: 'คัดลอกข้อความจากอีเมลยืนยันรายการ หรือจากแอปธนาคาร แล้ววางลงในกล่องข้อความด้านล่าง AI จะสกัดรายการให้อัตโนมัติ:',
    pastePlaceholder: 'ตัวอย่าง:\nใบยืนยันการจัดสรรหน่วยลงทุน ธนาคารกสิกรไทย\nวันที่ทำรายการ: 15/02/2569\nกองทุน K-USA-A(A) ซื้อ 656.4049 หน่วย NAV 15.2345 ยอดเงิน 10,000.00 บาท',
    btnAnalyzeAi: 'วิเคราะห์ข้อความด้วย Gemini AI',
    downloadSampleCsv: 'ดาวน์โหลดไฟล์ตัวอย่าง CSV',
    dragCsvHint: 'คลิกเพื่อเลือกไฟล์ หรือลากไฟล์ CSV มาวางที่นี่',
    dragCsvSupport: 'รองรับไฟล์ CSV จาก Excel หรือ Export จากพอร์ตอื่นๆ',
    pdfPasswordRequired: 'ไฟล์ PDF มีการเข้ารหัสผ่าน (Password Protected)',
    pdfPasswordHint: 'เอกสารยืนยันจากธนาคารมักใช้รหัสผ่าน เช่น วันเดือนปีเกิด (DDMMYYYY เช่น 15022538) หรือ เลขบัตรประชาชน 13 หลัก',
    unlockAndScan: 'ปลดล็อก & วิเคราะห์ด้วย AI',
    processingAi: 'ประมวลผลข้อมูลอัจฉริยะ',
    colResizeHint: 'ลากขอบหัวตารางเพื่อปรับความกว้างคอลัมน์',

    // History Modal
    historyTitle: 'ประวัติธุรกรรมการซื้อขายทั้งหมด',
    noHistory: 'ยังไม่มีประวัติการซื้อขาย',
    transDate: 'วันที่',
    confirmDelete: 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการธุรกรรมนี้?',
  },
  en: {
    appTitle: 'Fund Portfolio Manager',
    appSubtitle: 'Aggregate Thai Mutual Funds across KBank, ttb, Dime!, and SCB',
    syncNav: 'Sync NAV (SEC)',
    syncing: 'Syncing...',
    importData: 'Import Data (PDF / CSV)',
    transHistory: 'Transaction History',
    addTransaction: 'New Transaction',

    // Theme
    themeDark: 'Dark Mode',
    themeLight: 'Bright Mode',
    themeAuto: 'System (Auto)',

    // Metrics
    totalValue: 'Total Portfolio Value',
    totalCost: 'Total Invested Capital',
    unrealizedPl: 'Unrealized Profit & Loss',
    totalDividend: 'Cumulative Dividends',
    realizedPl: 'Realized Profit & Loss',
    currentNav: 'Latest NAV',

    // Holdings Table
    holdingsTitle: 'Current Portfolio Holdings',
    allPlatforms: 'All Platforms',
    fundHeader: 'Fund',
    platformHeader: 'Platform',
    unitsHeader: 'Units',
    avgCostHeader: 'Avg Cost',
    navHeader: 'Current NAV',
    marketValHeader: 'Market Value',
    plHeader: 'Profit/Loss (P/L)',
    noHoldings: 'No fund holdings found in your portfolio (click "+ New Transaction" to get started)',

    // Allocation
    allocationTitle: 'Platform Allocation',

    // Universal Statement Importer
    importerTitle: 'Universal Statement Importer',
    importerSubtitle: 'Automated mutual fund statement parsing from PDF & email confirmation notes via Gemini AI or CSV',
    tabPdf: 'PDF Statement (AI)',
    tabPaste: 'Paste Text',
    tabCsv: 'CSV File',
    dataSource: 'Source File',
    validCount: 'Valid: {n} items',
    invalidCount: 'Invalid: {n} items',
    totalAmountSum: 'Total Value',
    geminiTokens: 'Tokens Used',
    reupload: 'Upload New',
    effectiveDate: 'Effective Date',
    fundCodeName: 'Fund Code / Name',
    transType: 'Type',
    amountThb: 'Amount (THB)',
    navOnEffective: 'NAV on Effective Date',
    feeThb: 'Fee',
    noteText: 'Note',
    actionDelete: 'Del',
    btnCancel: 'Cancel',
    btnConfirmImport: 'Confirm & Import {n} Transactions',
    dragPdfHint: 'Click to select or drag & drop PDF Confirmation Note / Statement here',
    dragPdfSupport: 'Supports all Thai institutions: KBank (K-My Funds), ttb smart port, Dime!, InnovestX, SCBAM, Krungsri, etc.',
    dragPdfFeature: 'Supports password-protected PDFs, digital statements, and scanned documents (OCR)',
    pasteHint: 'Copy confirmation text from email or online banking and paste below for instant AI parsing:',
    pastePlaceholder: 'Example:\nConfirmation Note Kasikorn Asset Management\nDate: 15/02/2026\nFund K-USA-A(A) BUY 656.4049 units NAV 15.2345 Amount 10,000.00 THB',
    btnAnalyzeAi: 'Analyze Text with Gemini AI',
    downloadSampleCsv: 'Download Sample CSV',
    dragCsvHint: 'Click to select or drag & drop CSV file here',
    dragCsvSupport: 'Supports CSV files exported from Excel or other portfolio trackers',
    pdfPasswordRequired: 'PDF is Password-Protected',
    pdfPasswordHint: 'Bank confirmation notes typically use passwords like date of birth (DDMMYYYY) or 13-digit National ID',
    unlockAndScan: 'Unlock & Analyze with AI',
    processingAi: 'AI Intelligent Processing',
    colResizeHint: 'Drag column border to resize width',

    // History Modal
    historyTitle: 'Complete Transaction History',
    noHistory: 'No transaction history yet',
    transDate: 'Date',
    confirmDelete: 'Are you sure you want to delete this transaction?',
  },
};

export function getInitialLocale(): Locale {
  const saved = localStorage.getItem(LOCALE_KEY) as Locale | null;
  if (saved === 'th' || saved === 'en') {
    return saved;
  }
  return 'th';
}

export function useI18n() {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);

  const changeLocale = (newLocale: Locale) => {
    setLocale(newLocale);
    localStorage.setItem(LOCALE_KEY, newLocale);
  };

  const t = (key: keyof typeof translations['th'], params?: Record<string, string | number>): string => {
    let str = translations[locale][key] || translations['th'][key] || String(key);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, String(v));
      });
    }
    return str;
  };

  return { locale, setLocale: changeLocale, t };
}
