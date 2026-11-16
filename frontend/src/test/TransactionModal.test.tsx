import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TransactionModal } from '../components/TransactionModal';
import { I18nProvider } from '../lib/i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  searchFunds: vi.fn().mockResolvedValue([
    {
      proj_id: 'M0001_2557',
      proj_abbr_name: 'SCBS&P500E',
      proj_name_th: 'กองทุนเปิดไทยพาณิชย์หุ้นยูเอส (ช่องทางอิเล็กทรอนิกส์)',
      last_nav: '40.5673',
      last_nav_date: '2026-01-16',
    },
  ]),
  getBrokers: vi.fn().mockResolvedValue([
    { code: 'KBANK', name_th: 'กสิกรไทย', name_en: 'Kasikornbank', category: 'RETAIL' },
    { code: 'SCB', name_th: 'ไทยพาณิชย์', name_en: 'Siam Commercial Bank', category: 'RETAIL' },
  ]),
  getNavByDate: vi.fn().mockResolvedValue({ nav: '40.5673', nav_date: '2026-01-16' }),
  getNavDatesForMonth: vi.fn().mockResolvedValue({ nav_dates: {} }),
  createTransactionsBatch: vi.fn().mockResolvedValue({ success: true, inserted_count: 1, skipped_count: 0 }),
}));

describe('TransactionModal Submission and Real-time Calculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Record Transaction modal with Single Entry active by default', () => {
    render(
      <I18nProvider>
        <TransactionModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      </I18nProvider>
    );

    // Modal Title
    expect(screen.getByRole('heading', { name: /บันทึกรายการธุรกรรม|Record Transaction/i })).toBeInTheDocument();
    // Fund input
    expect(screen.getByPlaceholderText(/K-USA/i)).toBeInTheDocument();
    // Save button
    expect(screen.getByRole('button', { name: /บันทึกรายการ$|Save Transaction$/i })).toBeInTheDocument();
  });

  it('successfully submits when user enters Units & Price without typing Total Amount', async () => {
    const mockOnSuccess = vi.fn();
    const mockOnClose = vi.fn();
    (api.createTransaction as any).mockResolvedValueOnce({ id: 'tx_123' });

    render(
      <I18nProvider>
        <TransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      </I18nProvider>
    );

    // 1. Enter fund search
    const fundInput = screen.getByPlaceholderText(/K-USA/i);
    fireEvent.change(fundInput, { target: { value: 'SCBS&P500E' } });

    // 2. Enter Price and Units
    const zeroInputs = screen.getAllByPlaceholderText('0.0000');
    const priceInput = zeroInputs[0];
    const unitInput = zeroInputs[1];

    fireEvent.change(priceInput, { target: { value: '40.5673' } });
    fireEvent.change(unitInput, { target: { value: '24.6504' } });

    // Click Save Transaction button
    const saveBtn = screen.getByRole('button', { name: /บันทึกรายการ$|Save Transaction$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.createTransaction).toHaveBeenCalledTimes(1);
    });

    expect(api.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        proj_id: 'SCBS&P500E',
        units: '24.6504',
        unit_price: '40.5673',
        total_amount: (24.6504 * 40.5673).toFixed(2), // 1000.00
      })
    );
    expect(mockOnSuccess).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('successfully submits when user enters Total Amount & Unit Price (auto-computes units)', async () => {
    const mockOnSuccess = vi.fn();
    const mockOnClose = vi.fn();
    (api.createTransaction as any).mockResolvedValueOnce({ id: 'tx_124' });

    render(
      <I18nProvider>
        <TransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      </I18nProvider>
    );

    // 1. Enter fund
    const fundInput = screen.getByPlaceholderText(/K-USA/i);
    fireEvent.change(fundInput, { target: { value: 'SCBS&P500E' } });

    // 2. Enter Total Amount: 1000
    const amountInputs = screen.getAllByPlaceholderText('0.00');
    const totalAmountInput = amountInputs[0];
    fireEvent.change(totalAmountInput, { target: { value: '1000' } });

    // 3. Enter Price: 40.5673
    const zeroInputs = screen.getAllByPlaceholderText('0.0000');
    const priceInput = zeroInputs[0];
    fireEvent.change(priceInput, { target: { value: '40.5673' } });

    // Units should auto calculate: 1000 / 40.5673 = 24.6503 (AIMC 4-dec truncation)
    const unitInput = zeroInputs[1];
    expect((unitInput as HTMLInputElement).value).toBe('24.6503');

    // Click Save
    const saveBtn = screen.getByRole('button', { name: /บันทึกรายการ$|Save Transaction$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.createTransaction).toHaveBeenCalledTimes(1);
    });

    expect(api.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        proj_id: 'SCBS&P500E',
        units: '24.6503',
        unit_price: '40.5673',
        total_amount: '1000.00',
      })
    );
  });

  it('displays visible inline validation error when required fields are missing', async () => {
    render(
      <I18nProvider>
        <TransactionModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      </I18nProvider>
    );

    // Click Save immediately without filling anything
    const saveBtn = screen.getByRole('button', { name: /บันทึกรายการ$|Save Transaction$/i });
    fireEvent.click(saveBtn);

    // Error should be visible and not silent
    await waitFor(() => {
      const errorElements = screen.getAllByText(/กรุณาระบุหรือเลือกกองทุน|Please select or enter a fund/i);
      expect(errorElements.length).toBeGreaterThan(0);
    });
    expect(api.createTransaction).not.toHaveBeenCalled();
  });

  it('updates existing transaction when editTransaction prop is provided', async () => {
    const mockOnSuccess = vi.fn();
    const mockOnClose = vi.fn();
    (api.updateTransaction as any).mockResolvedValueOnce({ id: 'tx_existing' });

    const existingTx = {
      id: 'tx_existing',
      proj_id: 'M0001_2557',
      fund_abbr: 'SCBS&P500E',
      platform: 'SCB',
      trans_type: 'BUY',
      trans_date: '2026-01-16',
      units: '24.6504',
      unit_price: '40.5673',
      total_amount: '1000.00',
      fee: '0.45',
      note: 'DCA',
    };

    render(
      <I18nProvider>
        <TransactionModal
          isOpen={true}
          editTransaction={existingTx}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      </I18nProvider>
    );

    const saveBtn = screen.getByRole('button', { name: /บันทึกรายการ$|Save Transaction$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateTransaction).toHaveBeenCalledWith('tx_existing', expect.objectContaining({
        proj_id: 'M0001_2557',
        fund_abbr: 'SCBS&P500E',
        units: '24.6504',
        unit_price: '40.5673',
      }));
    });
    expect(mockOnSuccess).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });
});
