import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TransactionHistoryPage } from '../components/TransactionHistoryPage';
import { I18nProvider } from '../lib/i18n';
import { ToastProvider } from '../lib/toast';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  getTransactions: vi.fn(),
  deleteTransaction: vi.fn(),
  bulkDeleteTransactions: vi.fn(),
  getBrokers: vi.fn().mockResolvedValue([
    { code: 'KBANK', name_th: 'กสิกรไทย', name_en: 'Kasikornbank', category: 'RETAIL' },
  ]),
  getNavByDate: vi.fn().mockResolvedValue({ nav: '10.0' }),
  getNavDatesForMonth: vi.fn().mockResolvedValue({ nav_dates: {} }),
}));

describe('TransactionHistoryPage Reactive Updates and Confirmation Actions', () => {
  const mockTransactions = [
    {
      id: 'tx_1',
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
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getTransactions as any).mockResolvedValue([...mockTransactions]);
  });

  it('renders transactions and automatically refetches when refreshTrigger changes', async () => {
    const { rerender } = render(
      <I18nProvider>
        <ToastProvider>
          <TransactionHistoryPage
            refreshTrigger={0}
            onBack={vi.fn()}
            onDataChanged={vi.fn()}
          />
        </ToastProvider>
      </I18nProvider>
    );

    // Initial load
    expect(await screen.findByText('SCBS&P500E')).toBeInTheDocument();
    expect(api.getTransactions).toHaveBeenCalledTimes(1);

    // New transaction added in background / modal -> refreshTrigger increments
    const updatedList = [
      ...mockTransactions,
      {
        id: 'tx_2',
        proj_id: 'M0002_2558',
        fund_abbr: 'K-WPSPEEDUP',
        platform: 'KBANK',
        trans_type: 'BUY',
        trans_date: '2026-11-10',
        units: '493.6273',
        unit_price: '10.1291',
        total_amount: '5000.00',
        fee: '0.00',
      },
    ];
    (api.getTransactions as any).mockResolvedValueOnce(updatedList);

    // Re-render with incremented refreshTrigger
    rerender(
      <I18nProvider>
        <ToastProvider>
          <TransactionHistoryPage
            refreshTrigger={1}
            onBack={vi.fn()}
            onDataChanged={vi.fn()}
          />
        </ToastProvider>
      </I18nProvider>
    );

    // Should automatically fetch and display K-WPSPEEDUP without leaving the page
    expect(await screen.findByText('K-WPSPEEDUP')).toBeInTheDocument();
    expect(api.getTransactions).toHaveBeenCalledTimes(2);
  });

  it('opens styled confirmation modal before deleting a single transaction', async () => {
    const mockOnDataChanged = vi.fn();
    (api.deleteTransaction as any).mockResolvedValueOnce({ success: true });

    render(
      <I18nProvider>
        <ToastProvider>
          <TransactionHistoryPage
            refreshTrigger={0}
            onBack={vi.fn()}
            onDataChanged={mockOnDataChanged}
          />
        </ToastProvider>
      </I18nProvider>
    );

    await screen.findByText('SCBS&P500E');

    // Click trash button on row
    const deleteBtns = screen.getAllByRole('button', { name: /^ลบ$|^actionDelete$/i });
    fireEvent.click(deleteBtns[0]);

    // Styled confirmation modal should appear (not browser window.confirm)
    expect(await screen.findByText(/ยืนยันการลบรายการธุรกรรม|Confirm Transaction Deletion/i)).toBeInTheDocument();
    expect(screen.getByText(/คุณต้องการลบรายการธุรกรรมนี้ออกจากระบบใช่หรือไม่/i)).toBeInTheDocument();

    // Confirm deletion inside modal (the modal delete button is the second "ลบ" button)
    const modalDeleteBtns = screen.getAllByRole('button', { name: /^ลบ$|^actionDelete$/i });
    fireEvent.click(modalDeleteBtns[modalDeleteBtns.length - 1]);

    await waitFor(() => {
      expect(api.deleteTransaction).toHaveBeenCalledWith('tx_1');
    });

    expect(mockOnDataChanged).toHaveBeenCalled();
  });

  it('allows recording a new transaction directly from the History page', async () => {
    render(
      <I18nProvider>
        <ToastProvider>
          <TransactionHistoryPage
            refreshTrigger={0}
            onBack={vi.fn()}
            onDataChanged={vi.fn()}
          />
        </ToastProvider>
      </I18nProvider>
    );

    await screen.findByText('SCBS&P500E');

    // Click "+ Add Transaction" button in header of History Page
    const addBtn = screen.getByRole('button', { name: /บันทึกธุรกรรม|addTransaction/i });
    fireEvent.click(addBtn);

    // TransactionModal should open
    expect(await screen.findByRole('heading', { name: /บันทึกรายการธุรกรรม|Record Transaction/i })).toBeInTheDocument();
  });

  it('masks sensitive financial data when isPrivacyMode is true while keeping public quotes and dates visible', async () => {
    const { rerender } = render(
      <I18nProvider>
        <ToastProvider>
          <TransactionHistoryPage
            refreshTrigger={0}
            onBack={vi.fn()}
            onDataChanged={vi.fn()}
            isPrivacyMode={true}
          />
        </ToastProvider>
      </I18nProvider>
    );

    await screen.findByText('SCBS&P500E');

    // Sensitive data must be masked as '******'
    const maskedElements = screen.getAllByText('******');
    expect(maskedElements.length).toBeGreaterThanOrEqual(3);

    // Units (24.6504) and Total Amount (1000.00) should NOT appear as plain text
    expect(screen.queryByText('24.6504')).not.toBeInTheDocument();
    expect(screen.queryByText('1,000.00')).not.toBeInTheDocument();

    // Public market quote and trans date MUST remain visible
    expect(screen.getByText('2026-01-16')).toBeInTheDocument();
    expect(screen.getByText('40.5673')).toBeInTheDocument();

    // When toggling privacy mode OFF, plain values should appear
    rerender(
      <I18nProvider>
        <ToastProvider>
          <TransactionHistoryPage
            refreshTrigger={0}
            onBack={vi.fn()}
            onDataChanged={vi.fn()}
            isPrivacyMode={false}
          />
        </ToastProvider>
      </I18nProvider>
    );

    expect(await screen.findByText('24.6504')).toBeInTheDocument();
    expect(screen.getByText('1,000.00')).toBeInTheDocument();
  });
});
