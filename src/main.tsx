import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {initSyncQueue} from './lib/sync-queue';
import {logger} from './lib/logger';
import './index.css';

// Last-resort global handlers for uncaught runtime errors and unhandled promise rejections
// (OBSERVABILITY-CONTRACT §5). Installed BEFORE mount so a failure during boot — including the
// pre-auth window — is captured and routed to logger.critical (which now flushes to the
// service-role log-sink even when signed-out). The ErrorBoundary still catches render errors;
// this covers everything outside React's render tree (event handlers, timers, async).
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e: ErrorEvent) => {
    logger.critical('uncaught_error', e.message || 'Uncaught error', {
      category: 'SYSTEM_HEALTH',
      error: e.error,
      details: { filename: e.filename, lineno: e.lineno, colno: e.colno },
    });
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    logger.critical('unhandled_rejection', 'Unhandled promise rejection', {
      category: 'SYSTEM_HEALTH',
      error: e.reason,
    });
  });
}

// Bind the offline write queue to browser connectivity and drain anything left from a
// previous session (CONTENT-ARCHITECTURE §10). Idempotent; safe under StrictMode double-mount.
initSyncQueue();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
