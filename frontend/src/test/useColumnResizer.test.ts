import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type React from 'react';
import { useColumnResizer } from '../components/import/useColumnResizer';
import { DEFAULT_COL_WIDTHS } from '../components/import/types';

describe('useColumnResizer', () => {
  it('initializes with DEFAULT_COL_WIDTHS', () => {
    const { result } = renderHook(() => useColumnResizer());
    expect(result.current.colWidths).toEqual(DEFAULT_COL_WIDTHS);
  });

  it('provides a handleMouseDownResize function', () => {
    const { result } = renderHook(() => useColumnResizer());
    expect(typeof result.current.handleMouseDownResize).toBe('function');
  });

  it('updates width via mouse drag simulation', () => {
    const { result } = renderHook(() => useColumnResizer());
    const initialWidth = result.current.colWidths.fundCode;

    // Simulate mouse down on fundCode column at clientX = 100
    const mockEvent = {
      preventDefault: () => {},
      stopPropagation: () => {},
      clientX: 100,
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleMouseDownResize('fundCode', mockEvent);
    });

    // Simulate mouse move to clientX = 150 (drag 50px to the right)
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150 }));
    });

    expect(result.current.colWidths.fundCode).toBe(initialWidth + 50);

    // Mouse up ends resizing
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    // Further move should have no effect
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }));
    });

    expect(result.current.colWidths.fundCode).toBe(initialWidth + 50);
  });
});
