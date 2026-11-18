import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavDatePicker } from '../components/NavDatePicker';
import { I18nProvider } from '../lib/i18n';

vi.mock('../lib/api', () => ({
  getNavDatesForMonth: vi.fn().mockResolvedValue({
    nav_dates: {
      '2026-03-15': '12.3456',
    },
  }),
}));

describe('NavDatePicker Hierarchical Calendar Zoom-Out (Slice 29)', () => {
  it('renders trigger with initial date and opens popover on click', () => {
    const handleChange = vi.fn();
    render(
      <I18nProvider>
        <NavDatePicker value="2026-03-15" onChange={handleChange} />
      </I18nProvider>
    );

    const triggerBtn = screen.getByRole('button', { name: /2026-03-15/i });
    expect(triggerBtn).toBeInTheDocument();

    // Click trigger to open popover
    fireEvent.click(triggerBtn);

    // Month / Year header button should appear in day view (2026 + 543 = 2569 in Thai locale)
    expect(screen.getByText(/มีนาคม 2569|March 2026/i)).toBeInTheDocument();
  });

  it('zooms out to month selection grid when clicking the header, and selecting a month returns to days view', () => {
    const handleChange = vi.fn();
    render(
      <I18nProvider>
        <NavDatePicker value="2026-03-15" onChange={handleChange} />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /2026-03-15/i }));

    // Click the month/year header button to zoom out
    const headerBtn = screen.getByText(/มีนาคม 2569|March 2026/i).closest('button');
    expect(headerBtn).toBeInTheDocument();
    fireEvent.click(headerBtn!);

    // Should now show months grid (e.g. ม.ค., ก.พ., มี.ค., ธ.ค. / Jan, Feb, Mar, Dec)
    const monthDecBtn = screen.getByRole('button', { name: /^ธ\.ค\.$|^Dec$/i });
    expect(monthDecBtn).toBeInTheDocument();

    // Selecting December should return to days view for December
    fireEvent.click(monthDecBtn);

    expect(screen.getByText(/ธันวาคม 2569|December 2026/i)).toBeInTheDocument();
  });

  it('zooms out to decade year grid from month view, and allows navigating and selecting years', () => {
    const handleChange = vi.fn();
    render(
      <I18nProvider>
        <NavDatePicker value="2026-03-15" onChange={handleChange} />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /2026-03-15/i }));

    // Click month header to go to months view
    const headerBtn1 = screen.getByText(/มีนาคม 2569|March 2026/i).closest('button');
    fireEvent.click(headerBtn1!);

    // In months view, the year button is shown (2569 in Thai or 2026 in EN)
    const yearHeaderBtn = screen.getByTitle(/เลือกปี|select year/i);
    expect(yearHeaderBtn).toBeInTheDocument();

    // Click year header to zoom out to years/decade view
    fireEvent.click(yearHeaderBtn);

    // Should show 12-year grid
    const targetYearBtn = screen.getByRole('button', { name: /2567|2024/ });
    expect(targetYearBtn).toBeInTheDocument();

    // Click 2024 (2567) -> switches to months view for 2024
    fireEvent.click(targetYearBtn);

    // In months view, header should now display 2567 / 2024
    expect(screen.getByTitle(/เลือกปี|select year/i)).toHaveTextContent(/2567|2024/);

    // Select January -> returns to days view
    const monthJanBtn = screen.getByRole('button', { name: /^ม\.ค\.$|^Jan$/i });
    fireEvent.click(monthJanBtn);

    expect(screen.getByText(/มกราคม 2567|January 2024/i)).toBeInTheDocument();
  });

  it('triggers onChange and closes popover when clicking a day cell', () => {
    const handleChange = vi.fn();
    render(
      <I18nProvider>
        <NavDatePicker value="2026-03-15" onChange={handleChange} />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /2026-03-15/i }));

    // Click day 20
    const day20Btn = screen.getByRole('button', { name: '20' });
    fireEvent.click(day20Btn);

    expect(handleChange).toHaveBeenCalledWith('2026-03-20', undefined);
  });
});
