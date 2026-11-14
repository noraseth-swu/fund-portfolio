import { useState, useRef, useCallback } from 'react';
import { DEFAULT_COL_WIDTHS, type ColKey, type ColWidths } from './types';

export function useColumnResizer(initialWidths: ColWidths = DEFAULT_COL_WIDTHS) {
  const [colWidths, setColWidths] = useState<ColWidths>(initialWidths);
  const resizingCol = useRef<{ col: ColKey; startX: number; startWidth: number } | null>(null);

  const handleMouseDownResize = useCallback((col: ColKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    resizingCol.current = {
      col,
      startX: e.clientX,
      startWidth: colWidths[col],
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingCol.current) return;
      const delta = moveEvent.clientX - resizingCol.current.startX;
      const newWidth = Math.max(35, resizingCol.current.startWidth + delta);
      setColWidths((prev) => ({
        ...prev,
        [resizingCol.current!.col]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      resizingCol.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [colWidths]);

  return {
    colWidths,
    handleMouseDownResize,
  };
}
