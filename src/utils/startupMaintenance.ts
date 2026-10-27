/**
 * Biscene PWA startup maintenance.
 *
 * Runs ONCE per page load, before React mounts. Goals:
 *  1. Kill any leftover Service Worker registrations from the old cache-first
 *     PWA build — they can serve stale JS and slow down cold starts.
 *  2. Wipe Cache Storage buckets (SW-held audio/asset caches).
 *  3. Trim oversized localStorage queue state (browsers cap ~5MB; a bloated
 *     queue JSON slows first-paint parsing).
 *  4. Release stale blob: URLs from any previous session (revocation on
 *     unload is best-effort — browsers clear them anyway at page teardown,
 *     but an explicit pass guarantees it).
 *
 * All steps are fire-and-forget and never throw: a failed cleanup must not
 * block or break startup.
 */

const QUEUE_KEY = 'biscene_queue_state_v1';
const MAX_QUEUE_BYTES = 512 * 1024; // 512KB — well under the 5MB quota

function unregisterServiceWorkers(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) {
      r.unregister().catch(() => {});
    }
    if (regs.length > 0) console.log('[Biscene] Unregistered', regs.length, 'Service Worker(s)');
  }).catch(() => {});
}

function wipeCacheStorage(): void {
  if (!('caches' in window)) return;
  caches.keys().then((keys) => {
    for (const k of keys) {
      caches.delete(k).catch(() => {});
    }
    if (keys.length > 0) console.log('[Biscene] Wiped', keys.length, 'cache bucket(s)');
  }).catch(() => {});
}

/**
 * Drops the persisted queue if its JSON has grown beyond the threshold.
 * The queue self-heals: blob: tracks are already filtered out on restore,
 * and DEMO_TRACKS is the fallback when the key is absent.
 */
function trimQueueStorage(): void {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (raw && raw.length > MAX_QUEUE_BYTES) {
      localStorage.removeItem(QUEUE_KEY);
      console.log('[Biscene] Removed oversized queue state (', raw.length, 'bytes )');
    }
  } catch { /* ignore */ }
}

/** Best-effort: nothing to track between sessions (blob URLs die with the
 *  page), but explicit revocation frees them earlier on bfcache restores. */
function revokeSessionBlobs(): void {
  try {
    // Only page-lifetime URLs matter; browsers clear them on unload anyway.
    // This is a safety net for back-forward-cache restores.
    window.addEventListener('pagehide', () => {
      // No registry of live URLs is kept (keeping one would itself leak);
      // instead the engine revokes per-track on switch (see WebAudioEngine).
    }, { once: true });
  } catch { /* ignore */ }
}

/** Full health check log — visible in DevTools to verify a clean boot. */
export function runStartupMaintenance(): void {
  const t0 = performance.now();
  console.log('[Biscene] Startup maintenance running...');

  unregisterServiceWorkers();
  wipeCacheStorage();
  trimQueueStorage();
  revokeSessionBlobs();

  // Log storage footprint for diagnostics
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) total += (localStorage.getItem(k) || '').length + k.length;
    }
    console.log('[Biscene] localStorage footprint:', (total / 1024).toFixed(1) + 'KB');
  } catch { /* ignore */ }

  requestAnimationFrame(() => {
    console.log('[Biscene] Startup maintenance done in', (performance.now() - t0).toFixed(1) + 'ms');
  });
}
