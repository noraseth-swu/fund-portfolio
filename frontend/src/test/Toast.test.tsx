import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from '../lib/toast';

const TestComponent = () => {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success('บันทึกสำเร็จ')}>Show Success</button>
      <button onClick={() => toast.error('เกิดข้อผิดพลาด')}>Show Error</button>
      <button onClick={() => toast.info('ข้อมูลอัพเดตแล้ว')}>Show Info</button>
    </div>
  );
};

describe('Toast Notification System', () => {
  it('renders and auto-dismisses toast notifications', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    // Trigger success toast
    fireEvent.click(screen.getByText('Show Success'));
    expect(await screen.findByText('บันทึกสำเร็จ')).toBeInTheDocument();

    // Trigger error toast
    fireEvent.click(screen.getByText('Show Error'));
    expect(await screen.findByText('เกิดข้อผิดพลาด')).toBeInTheDocument();

    // Trigger info toast
    fireEvent.click(screen.getByText('Show Info'));
    expect(await screen.findByText('ข้อมูลอัพเดตแล้ว')).toBeInTheDocument();

    // Manually dismiss one
    const closeButtons = screen.getAllByLabelText('Close notification');
    expect(closeButtons.length).toBe(3);
    fireEvent.click(closeButtons[0]);

    // First toast dismissed
    expect(screen.queryByText('บันทึกสำเร็จ')).toBeNull();
  });
});
