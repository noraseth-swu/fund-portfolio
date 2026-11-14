import React, { createContext, useContext, useState, useEffect } from 'react';

export type Locale = 'th' | 'en';

const LOCALE_KEY = 'fund_portfolio_locale';
const LOCALE_CHANGE_EVENT = 'fund_portfolio_locale_change';

export const translations = {
  th: {
    appTitle: 'Fund Portfolio',
    appSubtitle: 'รวมพอร์ตการลงทุนกองทุนรวมทุกบลจ. และตัวแทนจำหน่าย (SEC Open API)',
    activeBrokersPrefix: 'แพลตฟอร์มที่ถือครอง: ',
    syncNav: 'ดึงราคาล่าสุด (SEC)',
    syncing: 'กำลังดึงราคา...',
    importData: 'นำเข้าข้อมูล (PDF / CSV)',
    transHistory: 'ประวัติธุรกรรม',
    addTransaction: 'บันทึกธุรกรรม',
    greeting: 'สวัสดี, {name} 👋',
    greetingSubtitle: 'นี่คือภาพรวมพอร์ตการลงทุนของคุณทั้งหมดในปัจจุบัน',
    loadingPortfolio: 'กำลังคำนวณและประมวลผลพอร์ตของคุณ...',
    loadingSecurity: 'กำลังโหลดระบบความปลอดภัย...',
    syncSuccess: 'อัปเดตราคา NAV เรียบร้อย ({count} กองทุน)',
    syncFailed: 'การซิงค์ล้มเหลว กรุณาลองใหม่อีกครั้ง',
    
    // Theme
    themeDark: 'โหมดมืด (Dark)',
    themeLight: 'โหมดสว่าง (Bright)',
    themeAuto: 'ตามระบบ (Auto)',
    privacyModeOn: 'โหมดซ่อนตัวเลข (Privacy Mode: เปิด)',
    privacyModeOff: 'โหมดแสดงตัวเลข (Privacy Mode: ปิด)',
    privacyModeToggle: 'สลับโหมดซ่อนตัวเลข (Privacy)',

    // Metrics
    totalValue: 'มูลค่าพอร์ตลงทุนรวม',
    totalCost: 'ต้นทุนเงินลงทุนรวม',
    unrealizedPl: 'กำไร/ขาดทุนที่ยังไม่เกิดขึ้น',
    totalDividend: 'เงินปันผลสะสมทั้งหมด',
    realizedPl: 'กำไรรับจริง (Realized P/L)',
    currentNav: 'ราคา NAV ล่าสุด',

    // Holdings Table
    holdingsTitle: 'รายการสินทรัพย์ที่ถือครอง (Current Holdings)',
    allPlatforms: 'ทั้งหมด',
    allAssets: 'สินทรัพย์ทั้งหมด',
    mutualFunds: 'กองทุนรวม',
    stocks: 'หุ้น',
    refresh: 'รีเฟรชข้อมูล',
    refreshing: 'กำลังรีเฟรช...',
    refreshSuccess: 'รีเฟรชข้อมูลพอร์ตล่าสุดสำเร็จ',
    fundHeader: 'กองทุน / สินทรัพย์',
    platformHeader: 'แพลตฟอร์ม',
    unitsHeader: 'จำนวนหน่วย',
    avgCostHeader: 'ต้นทุนเฉลี่ย',
    navHeader: 'ราคา NAV / ล่าสุด',
    marketValHeader: 'มูลค่าปัจจุบัน',
    plHeader: 'กำไร/ขาดทุน (P/L)',
    noHoldings: 'ไม่พบรายการกองทุนในพอร์ตของคุณ (สามารถกดปุ่ม "+ บันทึกธุรกรรม" เพื่อเริ่มบันทึกรายการแรก)',
    noPlatformData: 'ยังไม่มีข้อมูล ให้บันทึกรายการก่อน',
    platformOverview: 'ภาพรวมแยกตามแต่ละแพลตฟอร์ม',
    viewHistory: 'ดูประวัติ',
    backToDashboard: 'กลับหน้าภาพรวม',
    navDashboard: 'แดชบอร์ดภาพรวม',
    navHistory: 'ประวัติธุรกรรมทั้งหมด',
    bulkDelete: 'ลบที่เลือก',
    selectedCount: 'เลือกแล้ว {n} รายการ',
    confirmBulkDelete: 'ยืนยันการลบรายการธุรกรรมที่เลือก {n} รายการหรือไม่? (ไม่สามารถย้อนกลับได้)',
    bulkDeleteSuccess: 'ลบรายการธุรกรรม {n} รายการสำเร็จ',
    bulkDeleteFailed: 'เกิดข้อผิดพลาดในการลบรายการ',

    // Allocation
    allocationTitle: 'สัดส่วนพอร์ตตามแพลตฟอร์ม',
    noAllocationData: 'ยังไม่มีข้อมูลสัดส่วนการลงทุน',

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
    btnAnalyzeAi: 'วิเคราะห์รายการ',
    downloadSampleCsv: 'ดาวน์โหลดไฟล์ตัวอย่าง CSV',
    dragCsvHint: 'คลิกเพื่อเลือกไฟล์ หรือลากไฟล์ CSV มาวางที่นี่',
    dragCsvSupport: 'รองรับไฟล์ CSV จาก Excel หรือ Export จากพอร์ตอื่นๆ',
    pdfPasswordRequired: 'ไฟล์ PDF มีการเข้ารหัสผ่าน (Password Protected)',
    pdfPasswordHint: 'เอกสารยืนยันจากธนาคารมักใช้รหัสผ่าน เช่น วันเดือนปีเกิด (DDMMYYYY เช่น 15022538) หรือ เลขบัตรประชาชน 13 หลัก',
    enterPasswordPlaceholder: 'กรอกรหัสผ่านเพื่อปลดล็อก PDF...',
    unlockAndScan: 'ปลดล็อกและเริ่มวิเคราะห์',
    processingAi: 'กำลังอ่านและประมวลผลเอกสาร...',
    colResizeHint: 'ลากขอบหัวตารางเพื่อปรับความกว้างคอลัมน์',
    analyzingPdfStructure: 'กำลังอ่านโครงสร้างเอกสาร PDF...',
    pdfPasswordWrong: 'รหัสผ่าน PDF ไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่อีกครั้ง',
    aiAnalyzingStatement: '🤖 Gemini AI กำลังวิเคราะห์เอกสารและสกัดรายการธุรกรรม...',
    aiOcrAnalyzing: '🤖 Gemini Vision กำลังทำ OCR ตรวจสอบตารางภาพใบยืนยัน...',
    aiAnalyzingPasted: '🤖 Gemini AI กำลังวิเคราะห์ข้อความใบยืนยันรายการ...',
    noTransactionsFoundAi: 'Gemini AI ไม่พบรายการซื้อขายกองทุนในเอกสารนี้ กรุณาตรวจสอบว่ามีข้อมูลรายการธุรกรรมครบถ้วนหรือไม่',
    noTransactionsFoundPasted: 'Gemini AI ไม่พบรายการซื้อขายกองทุนในข้อความที่วาง กรุณาตรวจสอบข้อความ',
    aiParseError: 'เกิดข้อผิดพลาดในการวิเคราะห์ไฟล์ PDF ด้วย AI',
    aiTextParseError: 'เกิดข้อผิดพลาดในการวิเคราะห์ข้อความด้วย AI',
    savingToDb: 'กำลังบันทึกรายการทั้งหมดลงฐานข้อมูล SQLite...',
    noValidRows: 'ไม่มีรายการที่ถูกต้องสำหรับนำเข้า',
    csvNoData: 'ไฟล์ไม่มีข้อมูลหรือมีเพียงบรรทัดหัวตาราง',
    importedFileDefault: 'ไฟล์นำเข้า',
    pasteSource: 'ข้อความที่คัดลอกมา',
    currencyBaht: 'บาท',
    fundNotFound: 'ไม่พบชื่อกองทุน',
    invalidDateFormat: 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)',
    invalidUnits: 'จำนวนหน่วยไม่ถูกต้อง',
    invalidNav: 'ราคา NAV ไม่ถูกต้อง',
    deleteRowTooltip: 'ลบแถวนี้',

    // History Modal
    historyTitle: 'ประวัติธุรกรรมการซื้อขายทั้งหมด',
    noHistory: 'ยังไม่มีประวัติการซื้อขาย',
    transDate: 'วันที่',
    confirmDelete: 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการธุรกรรมนี้?',
    loading: 'กำลังโหลดข้อมูล...',
    deleteFailed: 'ไม่สามารถลบรายการได้',
    actionManage: 'จัดการ',
    deleteTransTooltip: 'ลบรายการ',
    btnClose: 'ปิดหน้าต่าง',
    totalAmount: 'มูลค่ารวม',

    // Transaction Modal
    recordTransaction: 'บันทึกรายการธุรกรรม (Transaction)',
    brokerLabel: 'แพลตฟอร์ม / บัญชีกองทุน',
    brokerMasterSec: 'โบรกเกอร์ / แพลตฟอร์ม (SEC Master Data)',
    quickSelectOrList: 'เลือกจากรายการ หรือปุ่มลัด',
    brokerCategoryRetail: '🏦 ธนาคาร / โบรกเกอร์ / FinTech',
    brokerCategoryAmc: '🏛️ บริษัทหลักทรัพย์จัดการกองทุน (บลจ. จาก ก.ล.ต.)',
    selectFundRequired: 'กรุณาเลือกหรือระบุชื่อกองทุน',
    unitsRequired: 'กรุณาระบุจำนวนหน่วยลงทุนให้ถูกต้อง',
    priceRequired: 'กรุณาระบุราคาต่อหน่วย (NAV) ให้ถูกต้อง',
    saveError: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล',
    transTypeLabel: 'ประเภทธุรกรรม',
    transDateLabel: 'วันที่ทำรายการ',
    fundSearchLabel: 'ชื่อกองทุน / รหัสกองทุน (SEC)',
    fundSearchPlaceholder: 'พิมพ์ค้นหา เช่น K-USA, SCBGOLD...',
    unitsLabel: 'จำนวนหน่วยลงทุน (Units)',
    navLabel: 'ราคาต่อหน่วย (NAV)',
    estTotalAmount: 'มูลค่ารวมโดยประมาณ: ',
    feeLabel: 'ค่าธรรมเนียม (บาท)',
    noteLabel: 'หมายเหตุ (ถ้ามี)',
    notePlaceholder: 'เช่น ซื้อ DCA รายเดือน, ซื้อตอนดัชนีปรับฐาน',
    saveTrans: 'บันทึกรายการ',
    savingTrans: 'กำลังบันทึก...',
    buy: 'ซื้อ (BUY)',
    sell: 'ขายคืน (SELL)',
    dividend: 'เงินปันผล (DIVIDEND)',

    // Settings & Gmail Auto-Sync
    settings: 'ตั้งค่า',
    settingsTitle: 'ตั้งค่าระบบ & Gmail Auto-Sync',
    settingsSubtitle: 'เชื่อมต่อ Gmail และตั้งค่ากุญแจถอดรหัสเอกสารธนาคาร เพื่อกวาด Confirmation Note เข้าพอร์ตอัตโนมัติ',
    tabGmailSync: 'Gmail Auto-Sync',
    tabDecryptionKeys: 'กุญแจถอดรหัสเอกสาร (PDF)',
    tabBankPreview: 'พรีวิวรหัสผ่านธนาคาร',
    gmailAccountLabel: 'บัญชี Gmail',
    gmailPasswordLabel: 'Gmail App Password',
    gmailPasswordHelp: 'สร้างได้จาก Google Account > Security > 2-Step Verification > App Passwords',
    dobLabel: 'วันเดือนปีเกิด (ค.ศ. / พ.ศ.)',
    nationalIdLast5Label: 'เลขบัตรประชาชน 5 หลักสุดท้าย',
    testConnection: 'ทดสอบเชื่อมต่อ',
    testingConnection: 'กำลังทดสอบ...',
    syncNow: 'กวาดอีเมลเข้าพอร์ตเดี๋ยวนี้',
    syncingEmails: 'กำลังกวาดอีเมลและประมวลผล...',
    saveSettings: 'บันทึกการตั้งค่า',
    savingSettings: 'กำลังบันทึก...',
    settingsSaved: 'บันทึกการตั้งค่าเรียบร้อยแล้ว',
    syncCompleted: 'กวาดข้อมูลสำเร็จ: นำเข้าใหม่ {n} รายการ, ข้ามรายการซ้ำ {dup} รายการ',
  },
  en: {
    appTitle: 'Fund Portfolio',
    appSubtitle: 'Universal Thai Mutual Fund Aggregator (SEC Open API)',
    activeBrokersPrefix: 'Holding Platforms: ',
    syncNav: 'Sync NAV (SEC)',
    syncing: 'Syncing...',
    importData: 'Import Data (PDF / CSV)',
    transHistory: 'Transaction History',
    addTransaction: 'New Transaction',
    greeting: 'Hello, {name} 👋',
    greetingSubtitle: 'Here is the current overview of your investment portfolio.',
    loadingPortfolio: 'Calculating and updating your portfolio...',
    loadingSecurity: 'Loading secure session...',
    syncSuccess: 'Successfully updated NAV ({count} funds)',
    syncFailed: 'Sync failed. Please try again.',

    // Theme
    themeDark: 'Dark Mode',
    themeLight: 'Bright Mode',
    themeAuto: 'System (Auto)',
    privacyModeOn: 'Privacy Mode (Mask Amounts: ON)',
    privacyModeOff: 'Privacy Mode (Mask Amounts: OFF)',
    privacyModeToggle: 'Toggle Privacy Mode',

    // Metrics
    totalValue: 'Total Portfolio Value',
    totalCost: 'Total Invested Capital',
    unrealizedPl: 'Unrealized Profit & Loss',
    totalDividend: 'Cumulative Dividends',
    realizedPl: 'Realized Profit & Loss',
    currentNav: 'Latest NAV',

    // Holdings Table
    holdingsTitle: 'Current Holdings',
    allPlatforms: 'All',
    allAssets: 'All Assets',
    mutualFunds: 'Mutual Funds',
    stocks: 'Stocks',
    refresh: 'Refresh Data',
    refreshing: 'Refreshing...',
    refreshSuccess: 'Portfolio data refreshed',
    fundHeader: 'Fund / Asset',
    platformHeader: 'Platform',
    unitsHeader: 'Units',
    avgCostHeader: 'Avg Cost',
    navHeader: 'Current NAV / Price',
    marketValHeader: 'Market Value',
    plHeader: 'Profit/Loss (P/L)',
    noHoldings: 'No fund holdings found in your portfolio (click "+ New Transaction" to record your first transaction)',
    noPlatformData: 'No data yet. Please record a transaction first.',
    platformOverview: 'Platform Breakdown',
    viewHistory: 'View History',
    backToDashboard: 'Back to Dashboard',
    navDashboard: 'Dashboard',
    navHistory: 'Transaction History',
    bulkDelete: 'Delete Selected',
    selectedCount: '{n} selected',
    confirmBulkDelete: 'Are you sure you want to delete {n} selected transactions? This cannot be undone.',
    bulkDeleteSuccess: 'Successfully deleted {n} transactions',
    bulkDeleteFailed: 'Failed to delete transactions',

    // Allocation
    allocationTitle: 'Platform Allocation',
    noAllocationData: 'No allocation data available yet',

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
    btnAnalyzeAi: 'Analyze Text',
    downloadSampleCsv: 'Download Sample CSV',
    dragCsvHint: 'Click to select or drag & drop CSV file here',
    dragCsvSupport: 'Supports CSV files exported from Excel or other portfolio trackers',
    pdfPasswordRequired: 'PDF is Password-Protected',
    pdfPasswordHint: 'Bank confirmation notes typically use passwords like date of birth (DDMMYYYY) or 13-digit National ID',
    enterPasswordPlaceholder: 'Enter password to unlock PDF...',
    unlockAndScan: 'Unlock and Analyze',
    processingAi: 'Processing statement documents...',
    colResizeHint: 'Drag column border to resize width',
    analyzingPdfStructure: 'Reading PDF document structure...',
    pdfPasswordWrong: 'Incorrect PDF password. Please try again.',
    aiAnalyzingStatement: '🤖 Gemini AI is analyzing document and extracting transactions...',
    aiOcrAnalyzing: '🤖 Gemini Vision is performing OCR on confirmation sheet...',
    aiAnalyzingPasted: '🤖 Gemini AI is analyzing confirmation note text...',
    noTransactionsFoundAi: 'Gemini AI found no transactions in this document. Please check the content.',
    noTransactionsFoundPasted: 'Gemini AI found no transactions in pasted text. Please check the text.',
    aiParseError: 'Error occurred while analyzing PDF with AI',
    aiTextParseError: 'Error occurred while analyzing text with AI',
    savingToDb: 'Saving transactions to SQLite database...',
    noValidRows: 'No valid transactions to import',
    csvNoData: 'File contains no data or header only',
    importedFileDefault: 'Imported file',
    pasteSource: 'Pasted text',
    currencyBaht: 'THB',
    fundNotFound: 'Fund name required',
    invalidDateFormat: 'Invalid date format (YYYY-MM-DD)',
    invalidUnits: 'Invalid units',
    invalidNav: 'Invalid NAV',
    deleteRowTooltip: 'Delete this row',

    // History Modal
    historyTitle: 'Complete Transaction History',
    noHistory: 'No transaction history yet',
    transDate: 'Date',
    confirmDelete: 'Are you sure you want to delete this transaction?',
    loading: 'Loading data...',
    deleteFailed: 'Could not delete transaction',
    actionManage: 'Action',
    deleteTransTooltip: 'Delete item',
    btnClose: 'Close',
    totalAmount: 'Total Amount',

    // Transaction Modal
    recordTransaction: 'Record Transaction',
    brokerLabel: 'Platform / Account',
    brokerMasterSec: 'Broker / Platform (SEC Master Data)',
    quickSelectOrList: 'Select from dropdown or quick pills',
    brokerCategoryRetail: '🏦 Commercial Banks / Brokers / FinTech',
    brokerCategoryAmc: '🏛️ Asset Management Companies (SEC AMC)',
    selectFundRequired: 'Please select or enter fund name',
    unitsRequired: 'Please enter valid unit amount',
    priceRequired: 'Please enter valid NAV unit price',
    saveError: 'An error occurred while saving data',
    transTypeLabel: 'Transaction Type',
    transDateLabel: 'Transaction Date',
    fundSearchLabel: 'Fund Name / Ticker (SEC)',
    fundSearchPlaceholder: 'Search e.g. K-USA, SCBGOLD...',
    unitsLabel: 'Units Allocated',
    navLabel: 'Price per Unit (NAV)',
    estTotalAmount: 'Estimated Total Value: ',
    feeLabel: 'Fee (THB)',
    noteLabel: 'Note (Optional)',
    notePlaceholder: 'e.g. Monthly DCA, dip purchase',
    saveTrans: 'Save Transaction',
    savingTrans: 'Saving...',
    buy: 'BUY',
    sell: 'SELL',
    dividend: 'DIVIDEND',

    // Settings & Gmail Auto-Sync
    settings: 'Settings',
    settingsTitle: 'System Settings & Gmail Auto-Sync',
    settingsSubtitle: 'Connect Gmail and configure bank statement decryption keys to automatically import confirmation notes',
    tabGmailSync: 'Gmail Auto-Sync',
    tabDecryptionKeys: 'Decryption Keys (PDF)',
    tabBankPreview: 'Bank Password Preview',
    gmailAccountLabel: 'Gmail Address',
    gmailPasswordLabel: 'Gmail App Password',
    gmailPasswordHelp: 'Generate from Google Account > Security > 2-Step Verification > App Passwords',
    dobLabel: 'Date of Birth (CE / BE)',
    nationalIdLast5Label: 'Last 5 digits of National ID',
    testConnection: 'Test Connection',
    testingConnection: 'Testing...',
    syncNow: 'Scan & Sync Emails Now',
    syncingEmails: 'Scanning emails & extracting statements...',
    saveSettings: 'Save Settings',
    savingSettings: 'Saving...',
    settingsSaved: 'Settings saved successfully',
    syncCompleted: 'Sync completed: Imported {n} new items, skipped {dup} duplicates',
  },
};

export function getInitialLocale(): Locale {
  const saved = localStorage.getItem(LOCALE_KEY) as Locale | null;
  if (saved === 'th' || saved === 'en') {
    return saved;
  }
  return 'th';
}

interface I18nContextType {
  locale: Locale;
  setLocale: (newLocale: Locale) => void;
  t: (key: keyof typeof translations['th'], params?: Record<string, string | number>) => string;
}

const defaultContextValue: I18nContextType = {
  locale: 'th',
  setLocale: () => {},
  t: (key, params) => {
    let str = translations['th'][key] || String(key);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, String(v));
      });
    }
    return str;
  },
};

const I18nContext = createContext<I18nContextType>(defaultContextValue);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    const handleSync = (e: any) => {
      if (e.detail && (e.detail === 'th' || e.detail === 'en')) {
        setLocaleState(e.detail);
      }
    };
    window.addEventListener(LOCALE_CHANGE_EVENT, handleSync);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, handleSync);
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(LOCALE_KEY, newLocale);
    window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: newLocale }));
  };

  const t = (key: keyof typeof translations['th'], params?: Record<string, string | number>): string => {
    let str = translations[locale]?.[key] || translations['th'][key] || String(key);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, String(v));
      });
    }
    return str;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n(): I18nContextType {
  return useContext(I18nContext);
}
