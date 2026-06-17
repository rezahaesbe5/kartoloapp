import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initClientLogger } from './shared/lib/logger';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './index.css';

// Logger client: tangkap error JS & kegagalan API, kirim batch ke backend.
initClientLogger();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Element #root tidak ditemukan');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
