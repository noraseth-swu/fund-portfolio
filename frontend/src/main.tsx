import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './lib/i18n'
import { ToastProvider } from './lib/toast'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || import.meta.env.SENTRY_DSN;
if (SENTRY_DSN && typeof SENTRY_DSN === 'string' && SENTRY_DSN.trim().startsWith('http')) {
  Sentry.init({
    dsn: SENTRY_DSN.trim(),
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.SENTRY_ENVIRONMENT || 'production',
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 0.2,
    beforeSend(event) {
      // PII Redaction: Strip Authorization, tokens and Cookie headers from outbound reports
      if (event.request?.headers) {
        delete event.request.headers['Authorization'];
        delete event.request.headers['authorization'];
        delete event.request.headers['Cookie'];
        delete event.request.headers['cookie'];
      }
      return event;
    },
  });
}

const FallbackError: React.FC<{ error?: unknown; resetError?: () => void }> = ({ resetError }) => (
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
          window.location.reload();
        }}
        className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer"
      >
        รีเฟรชหน้านี้ (Reload)
      </button>
    </div>
  </div>
);

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_dXNlZnVsLW94LTI4MjkuY2xlcmsuYWNjb3VudHMuZGV2JA';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={({ resetError }) => <FallbackError resetError={resetError} />}>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        <I18nProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </I18nProvider>
      </ClerkProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
