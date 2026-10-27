import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { runStartupMaintenance } from './utils/startupMaintenance';

// Force unique bundle hash on every deploy - defeats Cloudflare build cache
const BUILD_ID = Date.now().toString(36) + Math.random().toString(36).slice(2);
console.log('[Biscene] Build ID:', BUILD_ID);

// === STARTUP MAINTENANCE (runs once, before React mounts) ===
// Kills stale Service Workers, wipes Cache Storage, trims oversized
// localStorage queue state. Prevents the "slow start / degrading playback"
// symptom after long install sessions. See startupMaintenance.ts.
runStartupMaintenance();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
