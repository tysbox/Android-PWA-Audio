/**
 * Authentic UPnP / DLNA / LAN Audio Client for Biscène
 * Implements real UPnP ContentDirectory:1 SOAP calls, Subnet Probing, DIDL-Lite XML parsing.
 */

export interface RealUpnpDevice {
  id: string;
  name: string;
  baseUrl: string;
  controlUrl: string;
  deviceType?: string;
  manufacturer?: string;
  modelName?: string;
  isAutoDetected?: boolean;
}

export interface RealAudioItem {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  genre?: string;
  duration?: string;
  isContainer: boolean;
  childCount?: number;
  uri?: string;
  albumArtUrl?: string;
}

export function cleanAudioUrl(url: string): string {
  if (!url) return '';
  let trimmed = url.trim();
  try {
    // Unescape XML entities if any
    trimmed = trimmed.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    // Encode spaces and non-ASCII for safe browser handling
    return trimmed.replace(/[^\x21-\x7E]/g, (char) => encodeURIComponent(char));
  } catch {
    return trimmed;
  }
}

export async function fetchAudioViaNative(url: string): Promise<string> {
  // Legacy stubs kept for compatibility but not used in pure local mode
  return url;
}

/**
 * Album art resolution:
 *   1) Native direct fetch (Base64 data URI) - no origin connection contention
 *      with the long-lived PCM stream.
 *   2) Fallback: local stream proxy URL.
 */
/**
 * CRITICAL: NEVER perform blocking HTTP inside a JavascriptInterface call.
 * All bridge calls share ONE serial thread - any HTTP there freezes every
 * feature (browse/play/discovery) for the duration.
 *
 * Art therefore loads through the local proxy URL rendered by <img>, which
 * uses the browser's own async network stack (zero bridge occupancy).
 */
export async function getAlbumArtBase64(url: string): Promise<string> {
  const androidUpnp = (window as any).AndroidUpnp;
  if (androidUpnp && typeof androidUpnp.getProxyUrl === 'function') {
    try {
      return androidUpnp.getProxyUrl(url);
    } catch { }
  }
  return url;
}

/**
 * Parse M3U / M3U8 / PLS text content
 */
export function parseM3uPlaylist(content: string, playlistBaseUrl: string): RealAudioItem[] {
  const lines = content.split('\n');
  const tracks: RealAudioItem[] = [];
  let currentTitle = '';
  let currentArtist = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const commaIdx = line.indexOf(',');
      if (commaIdx !== -1) {
        const info = line.substring(commaIdx + 1);
        if (info.includes(' - ')) {
          const parts = info.split(' - ');
          currentArtist = parts[0].trim();
          currentTitle = parts.slice(1).join(' - ').trim();
        } else {
          currentTitle = info.trim();
        }
      }
    } else if (!line.startsWith('#')) {
      let uri = line;
      if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
        uri = `${playlistBaseUrl.replace(/\/+$/, '')}/${uri.replace(/^\/+/, '')}`;
      }
      tracks.push({
        id: `m3u-${Date.now()}-${tracks.length}`,
        title: currentTitle || line.split('/').pop() || 'Network Stream',
        artist: currentArtist || 'Network Share',
        album: 'M3U Stream',
        isContainer: false,
        uri,
      });
      currentTitle = '';
      currentArtist = '';
    }
  }
  return tracks;
}

export async function fetchUpnpBrowse(
  controlUrl: string,
  objectId: string = '0',
  serverBaseUrl: string,
  onPartial?: (items: RealAudioItem[]) => void
): Promise<RealAudioItem[]> {
  const androidUpnp = (window as any).AndroidUpnp;
  const out: RealAudioItem[] = [];

  if (androidUpnp && typeof androidUpnp.nativeBrowseAll === 'function') {
    // FULL NATIVE PAGINATION: ALL pages fetched in Java, one bridge call.
    // Eliminates the JS→Java Integer marshalling bug entirely.
    try {
      const raw = androidUpnp.nativeBrowseAll(controlUrl, objectId, serverBaseUrl);
      if (!raw || raw.startsWith('ERROR:')) {
        throw new Error(raw || 'Browse failed');
      }
      const items: RealAudioItem[] = JSON.parse(raw);
      onPartial?.(items);
      return items;
    } catch (e) {
      console.error('nativeBrowseAll failed:', e);
      return [];
    }
  } else if (androidUpnp && typeof androidUpnp.nativeBrowseUpnp === 'function') {
    const seenFirstIds = new Set<string>();
    let startIndex = 0;
    let requestedCount = 0;
    let lastPartialMs = 0;
    let zeroRetryDone = false;

    for (let guard = 0; guard < 40; guard++) {
      let raw: string | null = null;
      try {
        raw = androidUpnp.nativeBrowseUpnp(controlUrl, objectId, serverBaseUrl, startIndex, requestedCount);
      } catch (e) {
        console.warn('Native browse failed:', e);
        break;
      }
      if (!raw || raw.startsWith('ERROR:')) {
        if (out.length === 0) throw new Error(raw || 'Native browse failed');
        break;
      }

      let page: { items?: RealAudioItem[]; nextIndex?: number; numberReturned?: number; totalMatches?: number };
      try { page = JSON.parse(raw); } catch { break; }
      const items = Array.isArray(page.items) ? page.items : [];
      if (items.length === 0) {
        if (requestedCount !== 0 && !zeroRetryDone) {
          zeroRetryDone = true;
          requestedCount = 0;
          continue;
        }
        break;
      }

      const firstId = String(items[0]?.id ?? '');
      if (seenFirstIds.has(firstId)) break;
      seenFirstIds.add(firstId);

      out.push(...items);
      const nowMs = Date.now();
      if (!lastPartialMs || nowMs - lastPartialMs >= 400) {
        lastPartialMs = nowMs;
        onPartial?.([...out]);
      }

      startIndex = typeof page.nextIndex === 'number' ? page.nextIndex : startIndex + items.length;
      requestedCount = 400;

      await new Promise((r) => setTimeout(r, 0));
    }

    // Always paint the final state (throttle may have skipped the last page)
    if (out.length > 0) onPartial?.([...out]);
    return out;
  }

  return [];
}

export async function autoDiscoverWifiMediaServers(onServerDiscovered?: (server: AutoDetectedWifiServer) => void): Promise<AutoDetectedWifiServer[]> {
  const androidUpnp = (window as any).AndroidUpnp;
  const found = new Map<string, AutoDetectedWifiServer>();

  if (androidUpnp) {
    if (typeof androidUpnp.startSsdpDiscovery === 'function') androidUpnp.startSsdpDiscovery();
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 400));
      const json = androidUpnp.getDiscoveredServersJson();
      if (json) {
        try {
          const list = JSON.parse(json);
          list.forEach((s: any) => {
            if (!found.has(s.url)) {
              const server = { id: s.id, name: s.name, url: s.url, ip: s.ip || '', port: s.port || 0, label: 'Wi-Fi ネットワーク自動検出', controlPath: s.controlPath || '', isWifiDetected: true, type: 'DLNA' };
              found.set(s.url, server);
              onServerDiscovered?.(server);
            }
          });
        } catch {}
      }
    }
  }
  return Array.from(found.values());
}

/**
 * Cached Wi-Fi discovery results.
 *
 * The SSDP sweep in {@link autoDiscoverWifiMediaServers} costs up to 6s (15 x
 * 400ms of multicast M-SEARCH), so the list is empty for that whole window and
 * the modal looks broken on a NAS library. The last known set is persisted
 * here and re-hydrated on open, so the list paints immediately and the sweep
 * then upgrades entries in place.
 *
 * This is a DISPLAY CACHE only: nothing here is trusted for connectivity. A
 * stale entry can still be tapped, and a dead server is reported by the
 * existing loadContainer() connection-error path exactly as before.
 */
const WIFI_CACHE_KEY = 'biscene_wifi_servers_cache_v1';

/** Entries older than this are dropped on load; a NAS moved months ago is noise. */
const WIFI_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Bound on persisted entries, newest first. */
const WIFI_CACHE_MAX = 12;

export interface CachedWifiServer {
  id: string;
  name: string;
  url: string;
  ip: string;
  port: number;
  label: string;
  controlPath: string;
  lastSeen: number;
}

/**
 * Reads the persisted discovery result, dropping anything expired or malformed.
 *
 * <p>Never throws: a corrupt or unavailable localStorage must degrade to "no
 * cache" so the modal still works exactly as it did before this cache existed.
 */
export function loadCachedWifiServers(now: number = Date.now()): CachedWifiServer[] {
  try {
    const raw = localStorage.getItem(WIFI_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const out: CachedWifiServer[] = [];
    for (const s of parsed) {
      if (!s || typeof s.url !== 'string' || !s.url) continue;
      const lastSeen = typeof s.lastSeen === 'number' ? s.lastSeen : 0;
      if (now - lastSeen > WIFI_CACHE_TTL_MS) continue;
      out.push({
        id: typeof s.id === 'string' ? s.id : s.url,
        name: typeof s.name === 'string' && s.name ? s.name : s.url,
        url: s.url,
        ip: typeof s.ip === 'string' ? s.ip : '',
        port: typeof s.port === 'number' ? s.port : 0,
        label: typeof s.label === 'string' ? s.label : 'Wi-Fi ネットワーク自動検出',
        controlPath: typeof s.controlPath === 'string' ? s.controlPath : '',
        lastSeen,
      });
    }
    return out.slice(0, WIFI_CACHE_MAX);
  } catch {
    return [];
  }
}

/** Persists the current discovery result. Failures are ignored by design. */
export function saveCachedWifiServers(servers: CachedWifiServer[]): void {
  try {
    const trimmed = servers
      .filter((s) => s && typeof s.url === 'string' && s.url)
      .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
      .slice(0, WIFI_CACHE_MAX);
    localStorage.setItem(WIFI_CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    /* private mode / quota exceeded: the cache is optional */
  }
}

export interface AutoDetectedWifiServer { id: string; name: string; url: string; ip: string; port: number; label: string; controlPath: string; isWifiDetected: boolean; type: string; }
