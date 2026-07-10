import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {initSyncQueue} from './lib/sync-queue';
import './index.css';

// Bind the offline write queue to browser connectivity and drain anything left from a
// previous session (CONTENT-ARCHITECTURE §10). Idempotent; safe under StrictMode double-mount.
initSyncQueue();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
