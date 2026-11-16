import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (type: ToastType, message: string, title?: string, duration?: number) => void;
  success: (message: string, title?: string, duration?: number) => void;
  error: (message: string, title?: string, duration?: number) => void;
  info: (message: string, title?: string, duration?: number) => void;
  warning: (message: string, title?: string, duration?: number) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, title?: string, duration = 4000) => {
      const id = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const newToast: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }
    },
    [dismissToast]
  );

  const success = useCallback(
    (message: string, title?: string, duration = 4000) => showToast('success', message, title, duration),
    [showToast]
  );
  const error = useCallback(
    (message: string, title?: string, duration = 5000) => showToast('error', message, title, duration),
    [showToast]
  );
  const info = useCallback(
    (message: string, title?: string, duration = 4000) => showToast('info', message, title, duration),
    [showToast]
  );
  const warning = useCallback(
    (message: string, title?: string, duration = 4500) => showToast('warning', message, title, duration),
    [showToast]
  );

  const contextValue = useMemo(
    () => ({ toasts, showToast, success, error, info, warning, dismissToast }),
    [toasts, showToast, success, error, info, warning, dismissToast]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* Global Floating Toast Container */}
      <div
        className="fixed top-4 right-4 z-[999999] flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none px-3 sm:px-0"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          let bgClass = 'bg-slate-900/95 border-slate-700 text-slate-100';
          let icon = <Info className="w-5 h-5 text-indigo-400 shrink-0" />;

          if (toast.type === 'success') {
            bgClass =
              'bg-emerald-950/95 dark:bg-emerald-950/95 border-emerald-600/50 text-emerald-100 shadow-emerald-950/40';
            icon = <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
          } else if (toast.type === 'error') {
            bgClass =
              'bg-rose-950/95 dark:bg-rose-950/95 border-rose-600/50 text-rose-100 shadow-rose-950/40';
            icon = <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />;
          } else if (toast.type === 'warning') {
            bgClass =
              'bg-amber-950/95 dark:bg-amber-950/95 border-amber-600/50 text-amber-100 shadow-amber-950/40';
            icon = <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />;
          } else if (toast.type === 'info') {
            bgClass =
              'bg-indigo-950/95 dark:bg-slate-900/95 border-indigo-500/50 text-indigo-100 shadow-indigo-950/40';
            icon = <Info className="w-5 h-5 text-indigo-400 shrink-0" />;
          }

          return (
            <div
              key={toast.id}
              role="alert"
              className={`pointer-events-auto flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-3 ${bgClass}`}
            >
              <div className="pt-0.5">{icon}</div>
              <div className="flex-1 min-w-0 pr-1">
                {toast.title && (
                  <h4 className="text-xs font-bold uppercase tracking-wider opacity-90 mb-0.5">
                    {toast.title}
                  </h4>
                )}
                <p className="text-xs sm:text-sm font-medium leading-relaxed break-words">
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="opacity-70 hover:opacity-100 p-1 rounded-lg hover:bg-white/10 transition cursor-pointer shrink-0 -mr-1 -mt-1"
                aria-label="Close notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    // Graceful fallback if called outside provider (e.g. isolated test)
    return {
      toasts: [],
      showToast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
      warning: () => {},
      dismissToast: () => {},
    };
  }
  return context;
};
