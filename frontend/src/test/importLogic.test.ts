import { describe, it, expect } from 'vitest';
import { getRowAmount, type ParsedRow } from '../components/import/types';

describe('Universal Statement Importer Logic', () => {
  describe('getRowAmount', () => {
    it('should use explicit r.amount when provided and valid', () => {
      const row: ParsedRow = {
        date: '2023-12-28',
        platform: 'TTB',
        fundCode: 'EASTSPRING US Information Technology Fund',
        type: 'BUY',
        amount: '625.00',
        units: '46.0992',
        unitPrice: '13.5577',
        fee: '0',
        note: '',
        isValid: true,
      };

      expect(getRowAmount(row)).toBe(625.0);
    });

    it('should calculate units * unitPrice rounded to 2 decimals when r.amount is not provided', () => {
      const row: ParsedRow = {
        date: '2023-12-28',
        platform: 'TTB',
        fundCode: 'TEST',
        type: 'BUY',
        units: '46.0992',
        unitPrice: '13.5577',
        fee: '0',
        note: '',
        isValid: true,
      };

      // 46.0992 * 13.5577 = 624.99812384 -> rounded to 625.00
      expect(getRowAmount(row)).toBe(625.0);
    });

    it('should return 0 when units or unitPrice is invalid', () => {
      const row: ParsedRow = {
        date: '2023-12-28',
        platform: 'TTB',
        fundCode: 'TEST',
        type: 'BUY',
        units: 'abc',
        unitPrice: 'invalid',
        fee: '0',
        note: '',
        isValid: false,
      };

      expect(getRowAmount(row)).toBe(0);
    });

    it('should return exactly 2,800.00 THB for the 8 user statement transactions', () => {
      const statementRows: ParsedRow[] = [
        {
          date: '2023-12-28',
          platform: 'TTB',
          fundCode: 'EASTSPRING US Information Technology Fund',
          type: 'BUY',
          amount: '625.00',
          units: '46.0992',
          unitPrice: '13.5577',
          fee: '0',
          note: '023362010997256',
          isValid: true,
        },
        {
          date: '2023-12-28',
          platform: 'TTB',
          fundCode: 'SCB CHINA A-SHARES FUND (Accumulation)',
          type: 'BUY',
          amount: '150.00',
          units: '20.8657',
          unitPrice: '7.1888',
          fee: '0',
          note: '023362010997305',
          isValid: true,
        },
        {
          date: '2023-12-28',
          platform: 'TTB',
          fundCode: 'TMB US Blue Chip Equity Fund',
          type: 'BUY',
          amount: '125.00',
          units: '5.6802',
          unitPrice: '22.0060',
          fee: '0',
          note: '023362010997255',
          isValid: true,
        },
        {
          date: '2023-12-28',
          platform: 'TTB',
          fundCode: 'TMB German Equity Fund',
          type: 'BUY',
          amount: '150.00',
          units: '9.5681',
          unitPrice: '15.6770',
          fee: '0',
          note: '023362010997242',
          isValid: true,
        },
        {
          date: '2023-12-28',
          platform: 'TTB',
          fundCode: 'TMB EASTSPRING Asia Active Fund',
          type: 'BUY',
          amount: '250.00',
          units: '20.6054',
          unitPrice: '12.1327',
          fee: '0',
          note: '023362010997233',
          isValid: true,
        },
        {
          date: '2023-12-28',
          platform: 'TTB',
          fundCode: 'TMB EASTSPRING Global Core Equity Fund',
          type: 'BUY',
          amount: '700.00',
          units: '52.8529',
          unitPrice: '13.2443',
          fee: '0',
          note: '023362010997306',
          isValid: true,
        },
        {
          date: '2023-12-28',
          platform: 'TTB',
          fundCode: 'EASTSPRING GIS Global Bond Fund (Accumulation)',
          type: 'BUY',
          amount: '300.00',
          units: '24.4466',
          unitPrice: '12.2716',
          fee: '0',
          note: '023362010997315',
          isValid: true,
        },
        {
          date: '2023-12-28',
          platform: 'TTB',
          fundCode: 'EASTSPRING Global Dividend Equity Fund',
          type: 'BUY',
          amount: '500.00',
          units: '48.2081',
          unitPrice: '10.3717',
          fee: '0',
          note: '023362010997314',
          isValid: true,
        },
      ];

      const totalSum = statementRows.reduce((acc, row) => acc + getRowAmount(row), 0);
      expect(totalSum).toBe(2800.0);
    });
  });

  describe('Row Validation Checks', () => {
    const validate = (r: Partial<ParsedRow>) => {
      if (!r.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date.trim())) return false;
      if (!r.fundCode || r.fundCode.trim().length === 0) return false;
      if (!r.units || isNaN(parseFloat(r.units)) || parseFloat(r.units) <= 0) return false;
      if (!r.unitPrice || isNaN(parseFloat(r.unitPrice)) || parseFloat(r.unitPrice) <= 0) return false;
      return true;
    };

    it('should validate complete valid rows', () => {
      expect(
        validate({
          date: '2026-03-01',
          fundCode: 'K-USA',
          units: '100.5',
          unitPrice: '15.2',
        })
      ).toBe(true);
    });

    it('should reject invalid dates', () => {
      expect(validate({ date: '01/03/2026', fundCode: 'K-USA', units: '100', unitPrice: '10' })).toBe(false);
      expect(validate({ date: '', fundCode: 'K-USA', units: '100', unitPrice: '10' })).toBe(false);
    });

    it('should reject empty fundCode', () => {
      expect(validate({ date: '2026-03-01', fundCode: '  ', units: '100', unitPrice: '10' })).toBe(false);
    });

    it('should reject non-positive units or unitPrice', () => {
      expect(validate({ date: '2026-03-01', fundCode: 'K-USA', units: '0', unitPrice: '10' })).toBe(false);
      expect(validate({ date: '2026-03-01', fundCode: 'K-USA', units: '-5', unitPrice: '10' })).toBe(false);
      expect(validate({ date: '2026-03-01', fundCode: 'K-USA', units: '100', unitPrice: '0' })).toBe(false);
    });
  });
});
