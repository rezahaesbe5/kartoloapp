import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './index.css';

// Client logger DINONAKTIFKAN: frontend tidak lagi mencatat/mengirim log ke
// backend. Kode logger.ts & route gateway /logs/client dibiarkan dormant.

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Element #root tidak ditemukan');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
