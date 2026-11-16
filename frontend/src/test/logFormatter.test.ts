import { describe, it, expect } from 'vitest';
import { formatLiveLog } from '../lib/logFormatter';

describe('formatLiveLog', () => {
  it('formats pending fund transaction in Thai and English', () => {
    const raw = '2026-11-15 15:49:41 [INFO] [+] [PENDING] Inserted 2026-03-30 SCBS&P500E (1000.00 THB) from 1_686340000249.pdf';
    
    const th = formatLiveLog(raw, 'th');
    expect(th.type).toBe('success');
    expect(th.badgeText).toBe('นำเข้าสำเร็จ');
    expect(th.message).toContain('SCBS&P500E');
    expect(th.message).toContain('1,000.00');
    expect(th.message).toContain('2026-03-30');
    expect(th.timestamp).toBe('15:49:41');

    const en = formatLiveLog(raw, 'en');
    expect(en.type).toBe('success');
    expect(en.badgeText).toBe('Imported');
    expect(en.message).toContain('SCBS&P500E');
    expect(en.message).toContain('1,000.00');
  });

  it('formats stock transaction in Thai and English', () => {
    const raw = '2026-11-15 15:45:57 [INFO] [+] [STOCK] Inserted 2025-12-17 NVDA (0.1798 shares @ $176.12, 992.97 THB) into stock_transactions from Dime_offshore_confirmationNote_DIMEOS20251217024088.pdf';
    
    const th = formatLiveLog(raw, 'th');
    expect(th.type).toBe('stock');
    expect(th.badgeText).toBe('นำเข้าหุ้น');
    expect(th.message).toContain('NVDA');
    expect(th.message).toContain('0.1798');
    expect(th.message).toContain('992.97');

    const en = formatLiveLog(raw, 'en');
    expect(en.type).toBe('stock');
    expect(en.badgeText).toBe('Stock Imported');
    expect(en.message).toContain('NVDA');
  });

  it('formats PDF decryption success', () => {
    const raw = "2026-11-15 15:50:16 [INFO] [SCB] [✓] Decrypted '1_686340000249.pdf' using password '47802'";
    
    const th = formatLiveLog(raw, 'th');
    expect(th.type).toBe('file');
    expect(th.badgeText).toBe('ถอดรหัสสำเร็จ');
    expect(th.message).toContain('1_686340000249.pdf');
    expect(th.platform).toBe('SCB');

    const en = formatLiveLog(raw, 'en');
    expect(en.type).toBe('file');
    expect(en.badgeText).toBe('Decrypted');
  });

  it('formats email scan progress', () => {
    const raw = "2026-11-15 15:44:56 [INFO] [DIME] [41/135] Processing new email: '[Dime!] Confirmation Note'...";
    
    const th = formatLiveLog(raw, 'th');
    expect(th.type).toBe('info');
    expect(th.platform).toBe('DIME');
    expect(th.message).toContain('41/135');

    const en = formatLiveLog(raw, 'en');
    expect(en.type).toBe('info');
    expect(en.message).toContain('41/135');
  });

  it('formats PVD snapshot sync', () => {
    const raw = "2026-11-15 15:40:00 [INFO] [KBANK_PVD] [✓] Synced latest PVD positions (As of 2026-09-30): 3 policies, Total Value: 407250.92 THB (from pvd.pdf)";
    
    const th = formatLiveLog(raw, 'th');
    expect(th.type).toBe('pvd');
    expect(th.badgeText).toBe('ซิงค์ PVD สำเร็จ');
    expect(th.message).toContain('407,250.92');

    const en = formatLiveLog(raw, 'en');
    expect(en.type).toBe('pvd');
    expect(en.badgeText).toBe('PVD Synced');
  });

  it('formats rate limit warnings and errors', () => {
    const rawWarn = "2026-11-15 15:40:00 [WARNING] Rate limit reached. Waiting 15 seconds before retry...";
    const thWarn = formatLiveLog(rawWarn, 'th');
    expect(thWarn.type).toBe('warning');
    expect(thWarn.message).toContain('15');

    const rawErr = "2026-11-15 15:40:00 [ERROR] [✗] Failed to parse statement.pdf via AI";
    const thErr = formatLiveLog(rawErr, 'th');
    expect(thErr.type).toBe('error');
    expect(thErr.badgeText).toBe('ข้อผิดพลาด');
  });

  it('formats fund names with spaces and SEC NAV adjustment', () => {
    const rawFundSpace = '2026-11-15 17:16:48 [INFO] [+] [PENDING] Inserted 2024-01-29 ONE EUROPEAN EQUITY FUND (150.00 THB) from ttb confirmation note e-statement 31-Jan-2024.pdf';
    const thFund = formatLiveLog(rawFundSpace, 'th');
    expect(thFund.type).toBe('success');
    expect(thFund.badgeText).toBe('นำเข้าสำเร็จ');
    expect(thFund.message).toContain('ONE EUROPEAN EQUITY FUND');
    expect(thFund.message).toContain('150.00');

    const rawNav = '2026-11-15 17:16:48 [INFO] [PENDING] Using SEC NAV 10.8265 instead of raw price 15.6770 for TMBGET8 on 2023-12-28';
    const thNav = formatLiveLog(rawNav, 'th');
    expect(thNav.badgeText).toBe('SEC NAV');
    expect(thNav.message).toContain('10.8265');
    expect(thNav.message).toContain('TMBGET8');
  });
});
