import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { TrackItem } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { NativeImage } from './NativeImage';
import {
  fetchUpnpBrowse,
  parseM3uPlaylist,
  RealAudioItem,
  autoDiscoverWifiMediaServers,
  loadCachedWifiServers,
  saveCachedWifiServers,
  CachedWifiServer,
} from '../utils/upnpClient';
import {
  X,
  Play,
  Folder,
  Music,
  ArrowLeft,
  Server,
  Radio,
  Search,
  PlusCircle,
  Wifi,
  Loader2,
  Trash2,
  AlertCircle,
  HardDrive,
  Info,
  RefreshCw,
} from 'lucide-react';

interface UpnpBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTrack: (track: TrackItem) => void;
  onPlayAll: (tracks: TrackItem[]) => void;
  onAddToQueue?: (tracks: TrackItem[]) => void;
}

export interface DiscoveredServer {
  id: string;
  name: string;
  url: string; // e.g. http://192.168.1.100:9000
  ip: string;
  port: number;
  label: string;
  controlPath?: string;
  online?: boolean;
  lastSeen?: number;
  /**
   * Restored from the localStorage discovery cache and not yet re-confirmed by
   * the current SSDP sweep. Rendered with a "checking" affordance; tapping it
   * still works and still surfaces the normal connection error if it is gone.
   */
  isStale?: boolean;
}

export const VERIFIED_NETWORK_PRESETS = [
  {
    title: 'SomaFM Groove Salad (24/7 Live Stream)',
    artist: 'SomaFM San Francisco',
    album: 'Audiophile Ambient/Downtempo Live',
    url: 'https://ice1.somafm.com/groovesalad-128-mp3',
    albumArtUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=500&auto=format&fit=crop&q=80',
    genre: 'Ambient / Chill',
    quality: '24/7 Icecast Live Stream',
  },
  {
    title: 'SomaFM Secret Agent (24/7 Spy Jazz)',
    artist: 'SomaFM San Francisco',
    album: 'Spy/Lounge/Nu-Jazz Broadcast',
    url: 'https://ice1.somafm.com/secretagent-128-mp3',
    albumArtUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=500&auto=format&fit=crop&q=80',
    genre: 'Lounge / Jazz',
    quality: '24/7 Icecast Live Stream',
  },
  {
    title: 'Swiss Classic Radio (Live Web Stream)',
    artist: 'Radio Swiss Classic',
    album: 'Audiophile Live Stream',
    url: 'https://stream.srg-ssr.ch/m/rsc_de/mp3_128',
    albumArtUrl: 'https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=500&auto=format&fit=crop&q=80',
    genre: 'Live Classical',
    quality: 'SRG SSR Continuous Live Radio',
  },
  {
    title: 'Swiss Jazz Live Broadcast',
    artist: 'Radio Swiss Jazz',
    album: 'Live Broadcast Stream',
    url: 'https://stream.srg-ssr.ch/m/rsj/mp3_128',
    albumArtUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
    genre: 'Live Jazz',
    quality: 'Direct AAC/MP3 Web Stream',
  },
];

const COMMON_UPNP_PATHS = [
  '/upnp/control/content_directory',
  '/ContentDirectory/control',
  '/ctl/ContentDir',
  '/soap/control/ContentDirectory',
  '/upnp/control/cds',
  '/upnp/control/ContentDirectory_1',
  '/dev/1/svc/urn:schemas-upnp-org:service:ContentDirectory:1/action',
  '/dlna/ContentDirectory/control',
  '/ContentDirectory/0/control',
];

const SERVER_TEMPLATES = [
  { name: 'Synology Media Server', port: 5000, defaultPath: '/upnp/control/content_directory' },
  { name: 'MinimServer DLNA', port: 9000, defaultPath: '/upnp/control/content_directory' },
  { name: 'Volumio Audiophile Streamer', port: 50004, defaultPath: '/upnp/control/content_directory' },
  { name: 'MiniDLNA / ReadyDLNA NAS', port: 8200, defaultPath: '/ctl/ContentDir' },
  { name: 'Jellyfin / Emby Media Server', port: 8096, defaultPath: '/dlna/ContentDirectory/control' },
  { name: 'Plex Media Server', port: 32400, defaultPath: '/ContentDirectory/control' },
];

export const UpnpBrowserModal: React.FC<UpnpBrowserModalProps> = ({
  isOpen,
  onClose,
  onSelectTrack,
  onPlayAll,
  onAddToQueue,
}) => {
  const [activeTab, setActiveTab] = useState<'home' | 'presets' | 'direct'>('home');

  // Saved Home Servers (User-configured real servers)
  const [servers, setServers] = useState<DiscoveredServer[]>(() => {
    try {
      const stored = localStorage.getItem('biscene_discovered_servers');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Remove any legacy dummy/template servers
          return parsed.filter(
            (s) =>
              s &&
              !s.id?.startsWith('tmpl-') &&
              s.ip !== '192.168.1.100'
          );
        }
      }
    } catch {}
    return [];
  });

  // Current connected server & browse state
  const [connectedServer, setConnectedServer] = useState<DiscoveredServer | null>(null);
  const [navStack, setNavStack] = useState<{ id: string; title: string }[]>([]);
  const [currentItems, setCurrentItems] = useState<RealAudioItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual Add Form
  const [serverNameInput, setServerNameInput] = useState('');
  const [serverIpInput, setServerIpInput] = useState('');
  const [serverPortInput, setServerPortInput] = useState('9000');
  const [showAddForm, setShowAddForm] = useState(false);

  // Direct Stream URL Form
  const [customStreamTitle, setCustomStreamTitle] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  // Auto-Discovered Wi-Fi Servers state.
  //
  // Seeded from the persisted cache so the list paints on the first frame
  // instead of staying empty for the ~6s the SSDP sweep takes. Entries restored
  // this way are marked isStale and are upgraded in place as the sweep confirms
  // them; nothing is trusted for connectivity, so tapping a stale entry behaves
  // exactly as before (loadContainer reports the error if the server is gone).
  const [isScanningWifi, setIsScanningWifi] = useState(false);
  const [detectedWifiServers, setDetectedWifiServers] = useState<DiscoveredServer[]>([]);

  /** Paints the cached list instantly; safe no-op when the cache is empty. */
  const seedDetectedFromCache = () => {
    const cached = loadCachedWifiServers();
    if (cached.length === 0) return;
    setDetectedWifiServers(
      cached.map((c) => ({
        id: c.id,
        name: c.name,
        url: c.url,
        ip: c.ip,
        port: c.port,
        label: c.label,
        controlPath: c.controlPath,
        online: true,
        lastSeen: c.lastSeen,
        isStale: true,
      }))
    );
  };

  /** Persists whatever is currently confirmed (not stale) for the next open. */
  const persistDetected = (list: DiscoveredServer[]) => {
    const payload: CachedWifiServer[] = list
      .filter((s) => !s.isStale)
      .map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        ip: s.ip,
        port: s.port,
        label: s.label,
        controlPath: s.controlPath || '',
        lastSeen: s.lastSeen || Date.now(),
      }));
    saveCachedWifiServers(payload);
  };

  /**
   * Merges one freshly discovered server into the list.
   *
   * <p>An existing entry is upgraded in place (clearing isStale and refreshing
   * the working controlPath) rather than appended, so confirming a cached
   * server does not produce a duplicate row.
   */
  const mergeDiscovered = (found: {
    id: string; name: string; url: string; ip: string; port: number;
    label: string; controlPath: string;
  }) => {
    const now = Date.now();
    setDetectedWifiServers((prev) => {
      const idx = prev.findIndex((s) => s.url === found.url);
      const entry: DiscoveredServer = {
        id: found.id,
        name: found.name,
        url: found.url,
        ip: found.ip,
        port: found.port,
        label: found.label,
        controlPath: found.controlPath,
        online: true,
        lastSeen: now,
        isStale: false,
      };
      if (idx === -1) {
        const next = [...prev, entry];
        persistDetected(next);
        return next;
      }
      // Keep the cached name when the sweep reports an empty one, otherwise the
      // row would blank out mid-scan.
      const merged = [...prev];
      merged[idx] = { ...merged[idx], ...entry, name: entry.name || merged[idx].name };
      persistDetected(merged);
      return merged;
    });
  };

  // Search Filter
  const [searchQuery, setSearchQuery] = useState('');

  // -----------------------------------------------------------------------
  // Section index — ported from legacy bisen-player UpnpBrowserUI.kt:
  // record (leadingChar, firstItemIndex) at every leading-char transition,
  // one tappable letter per section -> jump scrollToItem(index).
  // Single memo pass keeps progressive page loads cheap; hooks stay above
  // the early return for stable hook order.
  // -----------------------------------------------------------------------
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  const { filteredItems, sectionIndex } = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const fi = currentItems.filter(
      (item) =>
        (item.title || '').toLowerCase().includes(q) ||
        (item.artist && item.artist.toLowerCase().includes(q))
    );
    const secs: { char: string; index: number }[] = [];
    fi.forEach((item, i) => {
      const raw = (item.title || '').trim().charAt(0) || '#';
      const ch = /[a-zA-Z]/.test(raw) ? raw.toUpperCase() : raw;
      if (secs.length === 0 || secs[secs.length - 1].char !== ch) {
        secs.push({ char: ch, index: i });
      }
    });
    return { filteredItems: fi, sectionIndex: secs };
  }, [currentItems, searchQuery]);

  const showIndexRail = filteredItems.length > 15;

  const jumpToSection = (index: number) => {
    const container = listScrollRef.current;
    const child = container?.children[index] as HTMLElement | undefined;
    child?.scrollIntoView({ block: 'start', behavior: 'auto' });
  };

  useEffect(() => {
    try {
      localStorage.setItem('biscene_discovered_servers', JSON.stringify(servers));
    } catch {}
  }, [servers]);

  // Automatically scan active Wi-Fi network for media servers when modal opens.
  //
  // The cached list is painted FIRST (synchronously, before the sweep starts) so
  // the user sees their NAS immediately instead of an empty box for ~6s. The
  // sweep then runs exactly as before and confirms/upgrades those rows in place.
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsScanningWifi(true);
    seedDetectedFromCache();

    autoDiscoverWifiMediaServers((found) => {
      if (!isMounted) return;
      mergeDiscovered(found);
    }).then(() => {
      if (isMounted) setIsScanningWifi(false);
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Browse a UPnP container on the target server
  const loadContainer = async (server: DiscoveredServer, objectId: string = '0') => {
    setIsLoading(true);
    setErrorMessage(null);

    const baseUrl = server.url.replace(/\/+$/, '');
    const primaryPath = server.controlPath || '/upnp/control/content_directory';
    const candidatePaths = Array.from(new Set([primaryPath, ...COMMON_UPNP_PATHS]));

    let success = false;
    let lastErr: any = null;

    for (const path of candidatePaths) {
      try {
        const fullControlUrl = `${baseUrl}${path}`;
        // Progressive rendering: paint each page as it arrives (1600+ albums)
        const items = await fetchUpnpBrowse(fullControlUrl, objectId, baseUrl, (partial) => {
          setCurrentItems([...partial]);
          setIsLoading(partial.length === 0);
        });
        setCurrentItems(items);
        success = true;

        // Remember verified working path
        if (!server.controlPath || server.controlPath !== path) {
          const updated = { ...server, controlPath: path, online: true, lastSeen: Date.now() };
          setConnectedServer(updated);
          setServers((prev) =>
            prev.map((s) => (s.id === server.id ? updated : s))
          );
        }
        break;
      } catch (err: any) {
        lastErr = err;
      }
    }

    if (!success) {
      // Fallback: Check if it's an M3U playlist or direct directory
      try {
        let text = '';
        const androidUpnp = (window as any).AndroidUpnp;
        if (androidUpnp && typeof androidUpnp.fetchUrl === 'function') {
          const raw = androidUpnp.fetchUrl(server.url);
          if (raw && !raw.startsWith('ERROR:')) text = raw;
        } else {
          const m3uRes = await fetch(server.url);
          if (m3uRes.ok) text = await m3uRes.text();
        }

        if (text && (text.includes('#EXTM3U') || text.includes('.mp3') || text.includes('.flac'))) {
          const tracks = parseM3uPlaylist(text, baseUrl);
          if (tracks.length > 0) {
            setCurrentItems(tracks);
            success = true;
          }
        }
      } catch {}
    }

    if (!success) {
      const isAndroid = typeof window !== 'undefined' && !!(window as any).AndroidUpnp;
      const isHttpsWeb = typeof window !== 'undefined' && window.location.protocol === 'https:';

      let msg = '';
      if (!isAndroid && isHttpsWeb) {
        msg = `【ブラウザ環境（HTTPS）での接続不可について】\n\n指定されたサーバー（${server.url}）への接続リクエストがWebブラウザによりブロックされました。\n\n■ 理由（ブラウザのセキュリティ仕様）:\n現在表示されているWeb画面（HTTPS環境）から、ローカルLAN内のHTTPアドレス（${server.ip}）へ通信を行うと、モダンブラウザの「Mixed Content (暗号化通信の混在不可)」および「Private Network Access (ローカルネットワーク保護)」規則によりJavaScript（fetch）が強制遮断されます。\n\n■ 実際の環境（Android APK実機アプリ）での動作:\nビルドしたAndroidアプリ（Capacitor APK）では、Androidネイティブのソケット通信（UpnpSsdpBridge）を経由するため、ブラウザ制限を受けずに実際のローカルIPサーバーへ正常に直接接続・操作が行えます。\n\n■ Webブラウザ上でテストする場合:\n「DIRECT URL / IP」タブから、ストリーミング用の直接URL（例: http://${server.ip}:${server.port}/stream.mp3 や M3U URL）を入力して動作をご確認ください。`;
      } else {
        msg = `【接続エラー】\nUPnP/DLNAメディアサーバー（${server.url}）に応答がありませんでした。\n\n・サーバーのIPアドレス（${server.ip}）およびポート番号（${server.port}）が正しいか確認してください。\n・NASやPC上のUPnP / DLNA / ContentDirectory サービスが起動しているかご確認ください。\n・エラー詳細: ${lastErr?.message || 'レスポンスなし'}`;
      }

      setErrorMessage(msg);
      setCurrentItems([]);
    }

    setIsLoading(false);
  };

  const handleConnectServer = (server: DiscoveredServer) => {
    triggerHaptic('click');
    setConnectedServer(server);
    setNavStack([{ id: '0', title: server.name }]);
    loadContainer(server, '0');
  };

  const handleBrowseSubfolder = (containerId: string, title: string) => {
    if (!connectedServer) return;
    triggerHaptic('click');
    setNavStack((prev) => [...prev, { id: containerId, title }]);
    loadContainer(connectedServer, containerId);
  };

  const handleBack = () => {
    if (!connectedServer || navStack.length <= 1) {
      setConnectedServer(null);
      setNavStack([]);
      setCurrentItems([]);
      setErrorMessage(null);
      return;
    }
    triggerHaptic('click');
    const newStack = navStack.slice(0, -1);
    setNavStack(newStack);
    const parent = newStack[newStack.length - 1];
    loadContainer(connectedServer, parent.id);
  };

  const handleAddManualServer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverIpInput.trim()) return;

    let host = serverIpInput.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    let port = parseInt(serverPortInput.trim() || '9000', 10);
    if (host.includes(':')) {
      const parts = host.split(':');
      host = parts[0];
      port = parseInt(parts[1], 10);
    }

    const formattedUrl = `http://${host}:${port}`;
    const newServer: DiscoveredServer = {
      id: `server-${Date.now()}`,
      name: serverNameInput.trim() || `NAS (${host}:${port})`,
      url: formattedUrl,
      ip: host,
      port,
      label: 'Home Media Server',
      online: true,
      lastSeen: Date.now(),
    };

    setServers((prev) => [newServer, ...prev.filter((s) => s.url !== newServer.url)]);
    setServerNameInput('');
    setServerIpInput('');
    setShowAddForm(false);
    handleConnectServer(newServer);
  };

  const handleDeleteServer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('tick');
    setServers((prev) => prev.filter((s) => s.id !== id));
    if (connectedServer?.id === id) {
      setConnectedServer(null);
      setNavStack([]);
      setCurrentItems([]);
    }
  };

  // Play single track
  const handlePlayItem = (item: RealAudioItem) => {
    if (!item.uri) return;
    triggerHaptic('heavy');
    onSelectTrack({
      id: item.id || `upnp-${Date.now()}`,
      title: item.title,
      artist: item.artist || 'Home Network Audio',
      album: item.album || 'DLNA / UPnP Stream',
      url: item.uri,
      albumArtUrl: item.albumArtUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
    });
    onClose();
  };

  // Play verified preset
  const handlePlayPreset = (preset: typeof VERIFIED_NETWORK_PRESETS[0]) => {
    triggerHaptic('heavy');
    onSelectTrack({
      id: `preset-${Date.now()}`,
      title: preset.title,
      artist: preset.artist,
      album: preset.album,
      url: preset.url,
      albumArtUrl: preset.albumArtUrl,
    });
    onClose();
  };

  // Play all audio items in current folder
  const handlePlayAll = () => {
    triggerHaptic('heavy');
    const tracks: TrackItem[] = currentItems
      .filter((item) => !item.isContainer && item.uri)
      .map((item) => ({
        id: item.id,
        title: item.title,
        artist: item.artist || 'Home Network Audio',
        album: item.album || 'DLNA / UPnP Share',
        url: item.uri!,
        albumArtUrl: item.albumArtUrl,
      }));

    if (tracks.length > 0) {
      onPlayAll(tracks);
      onClose();
    }
  };

  // Add all audio items in current folder to Queue
  const handleAddAllToQueue = () => {
    triggerHaptic('heavy');
    const tracks: TrackItem[] = currentItems
      .filter((item) => !item.isContainer && item.uri)
      .map((item) => ({
        id: item.id,
        title: item.title,
        artist: item.artist || 'Home Network Audio',
        album: item.album || 'DLNA / UPnP Share',
        url: item.uri!,
        albumArtUrl: item.albumArtUrl,
      }));

    if (tracks.length > 0) {
      if (onAddToQueue) {
        onAddToQueue(tracks);
      } else {
        onPlayAll(tracks);
      }
      onClose();
    }
  };

  // Add single track to queue
  const handleAddSingleTrackToQueue = (item: RealAudioItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.uri) return;
    triggerHaptic('heavy');
    const trackItem: TrackItem = {
      id: item.id || `upnp-${Date.now()}`,
      title: item.title,
      artist: item.artist || 'Home Network Audio',
      album: item.album || 'DLNA / UPnP Stream',
      url: item.uri,
      albumArtUrl: item.albumArtUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
    };
    if (onAddToQueue) {
      onAddToQueue([trackItem]);
    } else {
      onSelectTrack(trackItem);
    }
  };

  // Add Direct URL
  const handleAddCustomStream = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;
    triggerHaptic('heavy');
    onSelectTrack({
      id: `custom-${Date.now()}`,
      title: customStreamTitle.trim() || 'Direct Network Stream',
      artist: 'Live Online Stream',
      album: 'HTTP / DLNA Direct',
      url: customUrl.trim(),
      albumArtUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop&q=80',
    });
    onClose();
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs select-none">
      <div className="w-full max-w-lg h-[570px] rounded-2xl bg-neutral-900 border border-neutral-700 shadow-2xl flex flex-col overflow-hidden text-neutral-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-3.5 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {connectedServer && (
              <button
                type="button"
                onClick={handleBack}
                className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 cursor-pointer"
                title="Back / Level Up"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h3 className="text-xs font-black font-mono-tech uppercase tracking-wider text-neutral-100 flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                {connectedServer ? connectedServer.name : 'HOME NETWORK & DLNA MEDIA SERVERS'}
              </h3>
              <p className="text-[9.5px] font-mono-tech text-neutral-400 truncate max-w-[280px]">
                {connectedServer
                  ? `/${navStack.map((n) => n.title).join('/')}`
                  : 'UPnP / DLNA ContentDirectory Audio Browser'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connectedServer && currentItems.some((i) => !i.isContainer) && (
              <button
                type="button"
                onClick={handlePlayAll}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[9.5px] font-black font-mono-tech flex items-center gap-1 cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current" />
                PLAY ALL
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        {!connectedServer && (
          <div className="flex border-b border-neutral-800 bg-neutral-950/80 p-1 gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className={`flex-1 py-1.5 rounded text-[10px] font-mono-tech font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'home'
                  ? 'bg-neutral-800 text-emerald-400 border border-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              HOME SERVERS ({servers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              className={`flex-1 py-1.5 rounded text-[10px] font-mono-tech font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'presets'
                  ? 'bg-neutral-800 text-cyan-400 border border-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              LIVE STREAMS
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('direct')}
              className={`flex-1 py-1.5 rounded text-[10px] font-mono-tech font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'direct'
                  ? 'bg-neutral-800 text-purple-400 border border-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              DIRECT URL / IP
            </button>
          </div>
        )}

        {/* Main Content Body */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {connectedServer ? (
            /* Browse Connected Server Hierarchy */
            <div className="space-y-2.5">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
                  <span className="text-xs font-mono-tech text-neutral-400">
                    Communicating with UPnP Server ({connectedServer.name})...
                  </span>
                </div>
              ) : errorMessage ? (
                <div className="p-4 bg-red-950/40 border border-red-800/80 rounded-xl space-y-3 text-left">
                  <div className="flex items-center gap-2 text-red-300 font-bold font-mono-tech text-xs">
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                    <span>Connection Information</span>
                  </div>
                  <p className="text-[10px] font-mono-tech text-neutral-300 leading-relaxed whitespace-pre-line">
                    {errorMessage}
                  </p>
                  <div className="pt-2 flex items-center justify-between border-t border-red-900/40">
                    <button
                      type="button"
                      onClick={() => loadContainer(connectedServer, navStack[navStack.length - 1]?.id || '0')}
                      className="px-3 py-1 bg-red-800 hover:bg-red-700 text-white rounded text-[10px] font-mono-tech font-bold cursor-pointer"
                    >
                      RETRY
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConnectedServer(null);
                        setActiveTab('direct');
                      }}
                      className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-[10px] font-mono-tech font-bold cursor-pointer"
                    >
                      USE DIRECT STREAM
                    </button>
                  </div>
                </div>
              ) : currentItems.length === 0 ? (
                <div className="text-center py-12 text-neutral-500 font-mono-tech text-xs">
                  This container is empty or no audio files were returned by the UPnP server.
                </div>
              ) : (
                <>
                  {/* Folder Controls Banner if audio items are present */}
                  {currentItems.some((i) => !i.isContainer) && (
                    <div className="p-2.5 bg-neutral-950 border border-emerald-900/60 rounded-xl flex items-center justify-between gap-2 shadow-inner">
                      <div className="flex items-center gap-2 min-w-0">
                        <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-[11px] font-mono-tech font-bold text-emerald-300 truncate">
                          フォルダ内: {currentItems.filter((i) => !i.isContainer).length} 曲
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={handlePlayAll}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-mono-tech font-black flex items-center gap-1 cursor-pointer transition-colors"
                          title="フォルダ内の全曲を最初から再生"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          全曲再生
                        </button>
                        <button
                          type="button"
                          onClick={handleAddAllToQueue}
                          className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 border border-emerald-800 rounded text-[10px] font-mono-tech font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          title="現在のキューの末尾に全曲追加"
                        >
                          <PlusCircle className="w-3 h-3" />
                          全曲キュー追加
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                      type="text"
                      placeholder="Filter tracks and folders in this directory..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-neutral-950 border border-neutral-700 rounded text-xs font-mono-tech text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="text-right text-[9px] font-mono-tech text-neutral-500 pb-0.5 pr-1">
                    {filteredItems.length} 件
                  </div>
                  <div className="relative">
                    <div ref={listScrollRef} className={`divide-y divide-neutral-800/70 max-h-80 overflow-y-auto ${showIndexRail ? 'pr-5' : 'pr-1'}`}>
                    {filteredItems.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (item.isContainer) handleBrowseSubfolder(item.id, item.title);
                          else handlePlayItem(item);
                        }}
                        className="p-2 hover:bg-neutral-800/80 rounded flex items-center justify-between group transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {item.albumArtUrl ? (
                            <NativeImage
                              lazy
                              src={item.albumArtUrl}
                              className="w-8 h-8 rounded object-cover border border-neutral-700 shrink-0 bg-neutral-950"
                              fallback={
                                item.isContainer ? (
                                  <div className="w-8 h-8 rounded bg-amber-950/40 border border-amber-800/60 flex items-center justify-center shrink-0">
                                    <Folder className="w-4 h-4 text-amber-400" />
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 rounded bg-emerald-950/40 border border-emerald-800/60 flex items-center justify-center shrink-0">
                                    <Music className="w-4 h-4 text-emerald-400" />
                                  </div>
                                )
                              }
                            />
                          ) : item.isContainer ? (
                            <div className="w-8 h-8 rounded bg-amber-950/40 border border-amber-800/60 flex items-center justify-center shrink-0">
                              <Folder className="w-4 h-4 text-amber-400" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded bg-emerald-950/40 border border-emerald-800/60 flex items-center justify-center shrink-0">
                              <Music className="w-4 h-4 text-emerald-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-mono-tech font-semibold text-neutral-200 group-hover:text-white truncate">
                              {item.title}
                            </p>
                            {item.artist || item.album ? (
                              <p className="text-[9.5px] font-mono-tech text-neutral-500 truncate">
                                {item.artist} {item.album ? `• ${item.album}` : ''}
                              </p>
                            ) : item.childCount !== undefined ? (
                              <p className="text-[9.5px] font-mono-tech text-neutral-500 truncate">
                                {item.childCount} 個の項目
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {!item.isContainer && (
                            <>
                              <button
                                type="button"
                                onClick={() => handlePlayItem(item)}
                                className="px-2 py-0.5 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-700/80 text-[9px] font-mono-tech font-bold transition-colors cursor-pointer"
                                title="この曲を直ちに再生"
                              >
                                ▶ PLAY
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleAddSingleTrackToQueue(item, e)}
                                className="px-2 py-0.5 rounded bg-amber-950 hover:bg-amber-900 text-amber-400 border border-amber-700/80 text-[9px] font-mono-tech font-bold transition-colors cursor-pointer"
                                title="この曲を現在のキューの末尾に追加"
                              >
                                + キュー
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    </div>

                    {/* Legacy-style section index (bisen-player port): one
                        tappable letter per leading-char section -> jump */}
                    {showIndexRail && (
                      <div className="absolute top-0 bottom-0 right-0 w-[18px] flex flex-col justify-center items-center overflow-y-auto z-10 bg-neutral-950/60 rounded">
                        {sectionIndex.map(({ char, index }) => (
                          <button
                            key={`${char}-${index}`}
                            type="button"
                            onClick={() => jumpToSection(index)}
                            className="text-[9px] leading-[10px] font-mono-tech font-bold text-neutral-400 hover:text-emerald-300 active:text-emerald-300 py-[2px] cursor-pointer shrink-0"
                          >
                            {char}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : activeTab === 'home' ? (
            /* Home Network Media Servers List */
            <div className="space-y-3">
              {!Capacitor.isNativePlatform() && (
                <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl flex items-start gap-2.5 text-amber-200 text-[10.5px] font-mono-tech leading-relaxed">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-amber-300">Web PWA環境でのネットワーク接続について</span>
                    ブラウザ（HTTPS）のセキュリティ制限（暗号化通信規則・UDPソケット非対応）のため、ローカルLAN内のDLNA/UPnPサーバー自動検出は <strong>Android APK実機アプリ限定機能</strong> となります。
                    Web PWA版では上部タブの <strong>「LIVE STREAMS」</strong> または <strong>「DIRECT URL / IP」</strong> より各ライブストリームやカスタムURL再生をご利用いただけます。
                  </div>
                </div>
              )}
              {/* Top Banner: Auto-Detect Wi-Fi Status */}
              <div className="p-3 bg-neutral-950 border border-emerald-900/60 rounded-xl flex items-center justify-between shadow-inner">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-700 flex items-center justify-center text-emerald-400 shrink-0">
                    <Wifi className="w-4 h-4 animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10.5px] font-mono-tech font-bold text-emerald-300 block truncate">
                      接続済みWi-Fi上の自動検出デバイス (AUTO-DETECTED ON WI-FI)
                    </span>
                    <span className="text-[9px] font-mono-tech text-neutral-400 block truncate">
                      {isScanningWifi ? 'ネットワーク上のUPnP / DLNAメディアサーバーを検出中...' : '携帯/タブレットが接続中のWi-Fiネットワーク上のデバイスを表示'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsScanningWifi(true);
                      autoDiscoverWifiMediaServers((found) => {
                        mergeDiscovered(found);
                      }).then(() => setIsScanningWifi(false));
                    }}
                    className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 text-emerald-400 text-[9px] font-mono-tech font-bold rounded flex items-center gap-1 cursor-pointer border border-neutral-700"
                  >
                    <RefreshCw className={`w-3 h-3 ${isScanningWifi ? 'animate-spin text-emerald-400' : ''}`} />
                    再検出
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-[9px] font-mono-tech font-bold rounded flex items-center gap-1 cursor-pointer border border-neutral-700"
                  >
                    <PlusCircle className="w-3 h-3" />
                    手動設定
                  </button>
                </div>
              </div>

              {/* Add Server Form */}
              {showAddForm && (
                <div className="p-3 bg-neutral-950 border border-emerald-800/50 rounded-xl space-y-2 animate-in fade-in duration-100">
                  <span className="text-[10px] font-mono-tech font-bold text-emerald-400 uppercase tracking-wider block">
                    手動サーバー接続設定 (Manual Connection)
                  </span>

                  {typeof window !== 'undefined' && !(window as any).AndroidUpnp && window.location.protocol === 'https:' && (
                    <div className="p-2 bg-amber-950/40 border border-amber-800/60 rounded text-[9.5px] font-mono-tech text-amber-200 leading-relaxed">
                      💡 <strong>Webブラウザ（HTTPS）でのテストに関する注意:</strong><br />
                      ブラウザのセキュリティ仕様（Mixed Content）により、Web画面からローカルIP（192.168.x.x）へ直接接続するとブラウザに遮断されます。同じWi-Fi上で実機Androidアプリ（APK）を起動した場合は、ネイティブソケット通信を行うため実際のIPへ問題なく直接接続・操作できます。
                    </div>
                  )}

                  <form onSubmit={handleAddManualServer} className="space-y-2">
                    <input
                      type="text"
                      placeholder="Display Name (e.g. My Synology NAS / MinimServer)"
                      value={serverNameInput}
                      onChange={(e) => setServerNameInput(e.target.value)}
                      className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-xs font-mono-tech text-white focus:outline-none focus:border-emerald-500"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        required
                        placeholder="IP or Host (e.g. 192.168.1.50)"
                        value={serverIpInput}
                        onChange={(e) => setServerIpInput(e.target.value)}
                        className="col-span-2 px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-xs font-mono-tech text-white focus:outline-none focus:border-emerald-500"
                      />
                      <input
                        type="number"
                        placeholder="Port (9000, 5000, 8200)"
                        value={serverPortInput}
                        onChange={(e) => setServerPortInput(e.target.value)}
                        className="col-span-1 px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-xs font-mono-tech text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    {/* Quick Port Templates */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {SERVER_TEMPLATES.map((tmpl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setServerNameInput(tmpl.name);
                            setServerPortInput(tmpl.port.toString());
                          }}
                          className="px-2 py-0.5 bg-neutral-900 hover:bg-neutral-800 text-[8.5px] font-mono-tech text-neutral-400 hover:text-emerald-400 rounded border border-neutral-800"
                        >
                          {tmpl.name} (:{tmpl.port})
                        </button>
                      ))}
                    </div>
                    <button
                      type="submit"
                      className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono-tech font-black rounded cursor-pointer transition-colors"
                    >
                      SAVE & CONNECT TO SERVER
                    </button>
                  </form>
                </div>
              )}

              {/* Auto-Detected Wi-Fi Devices List */}
              {detectedWifiServers.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono-tech font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                      <Wifi className="w-3 h-3" />
                      接続中Wi-Fiの検出済みサーバー ({detectedWifiServers.length}台)
                    </span>
                    <span className="text-[8.5px] font-mono-tech text-emerald-500/80">
                      自動検出済み (登録不要)
                    </span>
                  </div>

                  <div className="grid gap-2 max-h-48 overflow-y-auto pr-0.5">
                    {detectedWifiServers.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => handleConnectServer(s)}
                        className={`p-3 border rounded-xl transition-all cursor-pointer flex items-center justify-between group shadow-sm ${
                          s.isStale
                            ? 'bg-neutral-950/40 border-neutral-800 hover:border-emerald-400/80'
                            : 'bg-emerald-950/30 hover:bg-emerald-900/40 border-emerald-800/60 hover:border-emerald-400/80'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${
                            s.isStale
                              ? 'bg-neutral-950 border-neutral-700 text-neutral-500'
                              : 'bg-emerald-950 border-emerald-700 text-emerald-400'
                          }`}>
                            <Server className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className={`text-xs font-bold font-mono-tech truncate ${
                              s.isStale
                                ? 'text-neutral-400 group-hover:text-neutral-300'
                                : 'text-emerald-200 group-hover:text-emerald-300'
                            }`}>
                              {s.name}
                            </h4>
                            <span className="text-[9.5px] font-mono-tech text-neutral-400 truncate block">
                              {s.url}
                            </span>
                          </div>
                        </div>
                        {s.isStale ? (
                          <span
                            title="前回の検出結果を表示中。タップすると接続可否を確認します。"
                            className="text-[9px] font-mono-tech px-2.5 py-1 bg-neutral-800 text-neutral-300 rounded font-bold shrink-0"
                          >
                            確認中…
                          </span>
                        ) : (
                          <span className="text-[9.5px] font-mono-tech px-2.5 py-1 bg-emerald-600 group-hover:bg-emerald-500 text-white rounded font-bold transition-colors shrink-0">
                            ▶ 接続・参照
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Saved Home Servers List */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono-tech font-bold text-neutral-300 uppercase tracking-wider">
                    ネットワークメディアサーバー ({servers.length})
                  </span>
                  <span className="text-[9px] font-mono-tech text-neutral-500">
                    DLNA / UPnP
                  </span>
                </div>

                {servers.length === 0 && detectedWifiServers.length === 0 ? (
                  <div className="p-6 bg-neutral-950/60 border border-dashed border-neutral-800 rounded-xl text-center space-y-2">
                    <HardDrive className="w-7 h-7 text-neutral-600 mx-auto" />
                    <p className="text-xs font-mono-tech text-neutral-300">
                      Wi-Fi上のメディアサーバーを検索中...
                    </p>
                    <p className="text-[9.5px] font-mono-tech text-neutral-500">
                      NASやPC、DLNA機器が同一Wi-Fiに接続されている場合、自動的にここに表示されます。
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-2 max-h-56 overflow-y-auto pr-0.5">
                    {servers.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => handleConnectServer(s)}
                        className="p-3 bg-neutral-950/90 hover:bg-neutral-800 border border-neutral-800 hover:border-emerald-500/60 rounded-xl transition-all cursor-pointer flex items-center justify-between group shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-neutral-900 border border-neutral-700 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform shrink-0">
                            <Server className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-xs font-bold font-mono-tech text-white group-hover:text-emerald-400 truncate">
                                {s.name}
                              </h4>
                            </div>
                            <span className="text-[9.5px] font-mono-tech text-neutral-400 truncate block">
                              {s.url}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleDeleteServer(s.id, e)}
                            className="p-1.5 text-neutral-600 hover:text-red-400 rounded transition-colors"
                            title="Remove server"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[9.5px] font-mono-tech px-2.5 py-1 bg-emerald-700 group-hover:bg-emerald-600 text-white rounded font-bold transition-colors flex items-center gap-1">
                            CONNECT
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Technical Network Architecture Note */}
              <div className="p-2.5 bg-neutral-950/70 border border-neutral-800/80 rounded-lg flex items-start gap-2 text-neutral-400 text-[9px] font-mono-tech">
                <Info className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Web browser security prevents background UDP multicast packet reception in HTTPS sandbox. Direct UPnP SOAP calls connect instantaneously without infinite port scans.
                </p>
              </div>
            </div>
          ) : activeTab === 'presets' ? (
            /* 24/7 Verified Live Broadcasts */
            <div className="space-y-2">
              <span className="text-[10px] font-mono-tech font-bold text-neutral-400 uppercase tracking-wider block pb-1 border-b border-neutral-800">
                24/7 Verified Live Broadcasts & Master Recordings
              </span>
              <div className="grid gap-1.5">
                {VERIFIED_NETWORK_PRESETS.map((preset, idx) => (
                  <div
                    key={idx}
                    onClick={() => handlePlayPreset(preset)}
                    className="p-2.5 bg-neutral-950/80 hover:bg-neutral-800 border border-neutral-800 hover:border-cyan-500/50 rounded-xl transition-all cursor-pointer flex items-center justify-between group shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={preset.albumArtUrl}
                        alt={preset.title}
                        className="w-10 h-10 rounded object-cover border border-neutral-700 group-hover:scale-105 transition-transform shrink-0"
                      />
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold font-mono-tech text-white group-hover:text-cyan-400 truncate">
                          {preset.title}
                        </h4>
                        <div className="flex items-center gap-2 text-[9.5px] font-mono-tech text-neutral-400">
                          <span className="text-neutral-300 truncate">{preset.artist}</span>
                          <span>•</span>
                          <span className="text-amber-400 shrink-0">{preset.quality}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="px-2.5 py-1 bg-cyan-700/80 group-hover:bg-cyan-500 text-white rounded text-[10px] font-mono-tech font-black flex items-center gap-1 shrink-0 ml-2 cursor-pointer shadow-xs"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      PLAY
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Direct URL / Manual IP Form */
            <div className="space-y-4 pt-1">
              <div>
                <span className="text-[10px] font-mono-tech font-bold text-neutral-300 uppercase tracking-wider block">
                  Connect Manual Server IP or Direct Audio Stream
                </span>
                <p className="text-[9.5px] font-mono-tech text-neutral-400 mt-0.5">
                  Directly input a specific NAS address or online stream URL.
                </p>
              </div>

              {/* Direct Stream URL Form */}
              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2">
                <span className="text-[9.5px] font-mono-tech font-bold text-purple-400 uppercase tracking-wider block">
                  Direct Live Audio URL (FLAC / Icecast / MP3 / M3U)
                </span>
                <form onSubmit={handleAddCustomStream} className="space-y-2">
                  <input
                    type="text"
                    placeholder="Station / Track Name"
                    value={customStreamTitle}
                    onChange={(e) => setCustomStreamTitle(e.target.value)}
                    className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-xs font-mono-tech text-white focus:outline-none focus:border-purple-400"
                  />
                  <div className="flex gap-2">
                    <input
                      type="url"
                      required
                      placeholder="https://stream.url/audio.mp3"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-xs font-mono-tech text-white focus:outline-none focus:border-purple-400"
                    />
                    <button
                      type="submit"
                      disabled={!customUrl.trim()}
                      className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono-tech font-black rounded cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      PLAY
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
