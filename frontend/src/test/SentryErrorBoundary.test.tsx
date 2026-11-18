import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import * as Sentry from '@sentry/react';

// Fallback component mirroring main.tsx
const FallbackError: React.FC<{ resetError?: () => void }> = ({ resetError }) => (
  <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
    <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
      <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto text-xl font-bold">
        !
      </div>
      <h2 className="text-lg font-bold text-white">เกิดข้อผิดพลาดในการแสดงผล</h2>
      <p className="text-xs text-slate-400">
        ระบบบันทึกรายงานข้อผิดพลาดไปยังระบบ Observability เรียบร้อยแล้ว กรุณาลองรีเฟรชหน้าเว็บ
      </p>
      <button
        onClick={() => {
          if (resetError) resetError();
        }}
        className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer"
      >
        รีเฟรชหน้านี้ (Reload)
      </button>
    </div>
  </div>
);

const CrashingComponent = () => {
  throw new Error('Simulated frontend rendering crash');
};

describe('Sentry Error Boundary and Observability Fallback (Slice 31)', () => {
  it('catches runtime component crash and renders styled fallback UI', () => {
    // Suppress React error boundary console output during intentional error test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockReset = vi.fn();
    render(
      <Sentry.ErrorBoundary fallback={({ resetError }) => <FallbackError resetError={() => { mockReset(); resetError(); }} />}>
        <CrashingComponent />
      </Sentry.ErrorBoundary>
    );

    // Error heading and description must be in document
    expect(screen.getByText('เกิดข้อผิดพลาดในการแสดงผล')).toBeInTheDocument();
    expect(screen.getByText(/ระบบบันทึกรายงานข้อผิดพลาดไปยังระบบ Observability/i)).toBeInTheDocument();

    // Click Reload button
    const reloadBtn = screen.getByRole('button', { name: /รีเฟรชหน้านี้/i });
    fireEvent.click(reloadBtn);
    expect(mockReset).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
