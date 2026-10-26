import React, { useState } from 'react';
import { X, Globe, Mic, Disc3, Waves, Pencil } from 'lucide-react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { TrackItem } from '../types';
import { triggerHaptic } from '../utils/haptics';

/** V6.4 Phase 0-D UI: user pin bridge (native-only; fails soft on web). */
const DlnaPlaybackForPin = registerPlugin<{ setInfoPin?: (o: { artist: string; title: string; album: string; pin: string }) => Promise<void> }>('DlnaPlayback');

interface WikiModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrack?: TrackItem;
  wikiData?: any;
}

const NOT_IN_DB = 'Not catalogued';

export const WikiModal: React.FC<WikiModalProps> = ({ isOpen, onClose, currentTrack, wikiData }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [pinState, setPinState] = useState<'idle' | 'saved' | 'error'>('idle');

  /** Phase 0-D: persist the user's correction for THIS track (native only). */
  const savePin = async (pin: string) => {
    triggerHaptic('click');
    if (!Capacitor.isNativePlatform()) return;
    try {
      await DlnaPlaybackForPin.setInfoPin?.({
        artist: c?.artistName || currentTrack?.artist || '',
        title: c?.trackTitle || currentTrack?.title || '',
        album: c?.albumTitle || currentTrack?.album || '',
        pin,
      });
      setPinState('saved');
    } catch {
      setPinState('error');
    }
  };

  // Debug: Log mount and data received
  React.useEffect(() => {
    console.log('[WikiModal] MOUNTED:', {
      hasWikiData: !!wikiData,
      hasCredits: !!wikiData?.credits,
      creditsKeys: wikiData?.credits ? Object.keys(wikiData.credits) : [],
      wikiDataKeys: wikiData ? Object.keys(wikiData) : [],
    });
    return () => console.log('[WikiModal] UNMOUNTED');
  }, [wikiData?.credits]);

  if (!isOpen) return null;

  // V4.5.6 FIX: credits arrive at wikiData.credits (play-time) — productionCredits kept as legacy fallback
  // Merge credits from different sources, normalizing keys for both MB and Discogs formats
  const rawCredits = wikiData?.credits || wikiData?.productionCredits || {};

  const c = {
    // Artist fields
    artistName: rawCredits.artistName || rawCredits.artist || '',
    artistDisambiguation: rawCredits.artistDisambiguation || '',
    artistBio: rawCredits.artistBio || '',
    artistCountry: rawCredits.artistCountry || rawCredits.country || '',

    // Track fields
    trackTitle: rawCredits.trackTitle || rawCredits.title || '',
    trackLengthMs: rawCredits.trackLengthMs || rawCredits.duration || 0,

    // Album fields
    albumTitle: rawCredits.albumTitle || rawCredits.album || '',
    releaseDate: rawCredits.releaseDate || rawCredits.year || '',
    releaseCountry: rawCredits.releaseCountry || rawCredits.country || '',

    // Credits fields
    producers: rawCredits.producers || '',
    engineers: rawCredits.engineers || '',
    composers: rawCredits.composers || '',
    performers: rawCredits.performers || '',

    // Album metadata
    label: rawCredits.label || '',
    studios: rawCredits.studios || '',
    recordedAt: rawCredits.recordedAt || rawCredits.recorded || '',

    // Discogs-specific
    discogsReleaseId: rawCredits.discogs_release_id || '',
    discogsUri: rawCredits.discogs_uri || '',
    // V6.5.3 SIGNAL-FIRST: the physical release medium. Discogs used to write
    // this as `format`, which collided with the decoder's signal format —
    // renamed to `releaseMedium` on the native side (DiscogsClient).
    // `rawCredits.format` is kept as a legacy fallback for cached payloads.
    releaseMedium: rawCredits.releaseMedium || rawCredits.format || '',
    genre: rawCredits.genre || '',
    year: rawCredits.year || '',

    // V6.4 Phase 1-F: extra MusicBrainz items (new keys — absent = '' = Not catalogued)
    isrcs: rawCredits.isrcs || '',
    firstReleaseYear: rawCredits.firstReleaseYear || '',
    catalogNumber: rawCredits.catalogNumber || '',
    tracklist: rawCredits.tracklist || '',

    // Discogs-specific instrument credits
    keyboards: rawCredits.keyboards || '',
    trumpet: rawCredits.trumpet || '',
    bass: rawCredits.bass || '',
    drums: rawCredits.drums || '',
    guitar: rawCredits.guitar || '',
    saxophone: rawCredits.saxophone || '',
    violin: rawCredits.violin || '',
    cello: rawCredits.cello || '',

    // Wiki
    wikiSummary: rawCredits.wikiSummary || '',

    // Other fields from raw credits (catch-all)
    ...rawCredits,
  };
  const formatTime = (ms?: number) => {
    if (!ms || ms <= 0) return null;
    const total = Math.round(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };

  /** Opens the system browser (Capacitor Custom Tab); falls back to window.open on web. */
  const openExternal = async (query: string) => {
    if (!query.trim()) return;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    if (Capacitor.isNativePlatform()) {
      try {
        // V4.5.7: official @capacitor/browser API -> Chrome Custom Tab. The tab
        // has its own close button and system-Back returns straight to the app
        // (the registerPlugin proxy could silently fail and drop us into the
        // window.open fallback, which navigated the WebView away with no way back).
        await Browser.open({ url });
        return;
      } catch {
        // fall through to the in-place fallback below
      }
    }
    window.open(url, '_blank');
  };

  /** Tap: real values search themselves; uncatalogued rows search artist + track. */
  const handleTap = (value: string, isReal: boolean) => {
    const artist = c.artistName || currentTrack?.artist || '';
    const album = c.albumTitle || currentTrack?.album || '';
    const track = c.trackTitle || currentTrack?.title || '';
    if (isReal && value && value !== NOT_IN_DB && !value.startsWith('Not ')) {
      void openExternal(value);
    } else {
      void openExternal(`${artist} ${album || track} producer studio recording`);
    }
  };

  const artistLine = c.artistName
    ? c.artistDisambiguation
      ? `${c.artistName} — ${c.artistDisambiguation}`
      : c.artistName
    : (currentTrack?.artist || 'Unknown');

  const sections = [
    {
      short: 'People',
      icon: <Mic className="w-3 h-3" />,
      items: [
        { label: 'Artist', value: artistLine, isReal: true, search: c.artistName || artistLine },
        { label: 'About the Artist', value: c.artistBio || NOT_IN_DB, isReal: !!c.artistBio, search: c.artistName || '' },
        { label: 'Producers', value: c.producers || NOT_IN_DB, isReal: !!c.producers, search: c.producers || '' },
        { label: 'Engineers', value: c.engineers || NOT_IN_DB, isReal: !!c.engineers, search: c.engineers || '' },
        { label: 'Composers', value: c.composers || NOT_IN_DB, isReal: !!c.composers, search: c.composers || '' },
        { label: 'Performers', value: c.performers || NOT_IN_DB, isReal: !!c.performers, search: c.performers || '' },
        { label: 'Keyboards', value: c.keyboards || NOT_IN_DB, isReal: !!c.keyboards, search: c.keyboards || '' },
        { label: 'Trumpet', value: c.trumpet || NOT_IN_DB, isReal: !!c.trumpet, search: c.trumpet || '' },
        { label: 'Bass', value: c.bass || NOT_IN_DB, isReal: !!c.bass, search: c.bass || '' },
        { label: 'Drums', value: c.drums || NOT_IN_DB, isReal: !!c.drums, search: c.drums || '' },
        { label: 'Guitar', value: c.guitar || NOT_IN_DB, isReal: !!c.guitar, search: c.guitar || '' },
        { label: 'Saxophone', value: c.saxophone || NOT_IN_DB, isReal: !!c.saxophone, search: c.saxophone || '' },
        { label: 'Violin', value: c.violin || NOT_IN_DB, isReal: !!c.violin, search: c.violin || '' },
        { label: 'Cello', value: c.cello || NOT_IN_DB, isReal: !!c.cello, search: c.cello || '' },
      ],
    },
    {
      short: 'Album',
      icon: <Disc3 className="w-3 h-3" />,
      items: [
        { label: 'Album', value: c.albumTitle || currentTrack?.album || NOT_IN_DB, isReal: !!c.albumTitle, search: `${c.albumTitle || ''} ${c.artistName || ''}` },
        { label: 'Release Date', value: c.releaseDate || NOT_IN_DB, isReal: !!c.releaseDate, search: `${c.albumTitle || currentTrack?.album || ''} ${c.releaseDate || ''}` },
        { label: 'Recorded', value: c.studios || c.recordedAt || NOT_IN_DB, isReal: !!(c.studios || c.recordedAt), search: c.studios || c.recordedAt || '' },
        { label: 'Label', value: c.label || NOT_IN_DB, isReal: !!c.label, search: c.label || '' },
        { label: 'Country', value: c.releaseCountry || c.artistCountry || NOT_IN_DB, isReal: !!(c.releaseCountry || c.artistCountry), search: '' },
        { label: 'Duration', value: formatTime(c.trackLengthMs) || '—', isReal: !!c.trackLengthMs, search: '' },
        { label: 'Release Medium', value: c.releaseMedium || NOT_IN_DB, isReal: !!c.releaseMedium, search: c.releaseMedium || '' },
        { label: 'Genre', value: c.genre || NOT_IN_DB, isReal: !!c.genre, search: c.genre || '' },
        { label: 'Year', value: c.year || NOT_IN_DB, isReal: !!c.year, search: c.year || '' },
        { label: 'Discogs ID', value: c.discogsReleaseId || NOT_IN_DB, isReal: !!c.discogsReleaseId, search: c.discogsReleaseId || '' },
        { label: 'Discogs URI', value: c.discogsUri || NOT_IN_DB, isReal: !!c.discogsUri, search: '' },
        { label: 'Catalog No.', value: c.catalogNumber || NOT_IN_DB, isReal: !!c.catalogNumber, search: c.catalogNumber || '' },
        { label: 'ISRC', value: c.isrcs || NOT_IN_DB, isReal: !!c.isrcs, search: c.isrcs || '' },
        { label: 'First Released', value: c.firstReleaseYear || NOT_IN_DB, isReal: !!c.firstReleaseYear, search: '' },
      ],
    },
    {
      short: 'Signal',
      icon: <Waves className="w-3 h-3" />,
      items: [
        // V6.5.3 SIGNAL-FIRST: Source Format shows ONLY the decoder's
        // measured signal format (PCM/DSD/FLAC...). The `format` key inside
        // credits/Discogs data is the PHYSICAL RELEASE MEDIUM (Vinyl, CD,
        // 'V6.1' edition names) — it must never masquerade as the signal.
        // wikiData.format/srcRate/srcBits are fed by productionInfo from the
        // native TrackMetadata (decoder-measured), so they are signal truth;
        // currentTrack.* is the fallback for pre-play states.
        { label: 'Source Format', value: (wikiData?.format || currentTrack?.format || 'Detecting...').toString().toUpperCase(), isReal: true, search: '' },
        { label: 'Native Resolution', value: (() => {
            const fmt = (wikiData?.format || currentTrack?.format || '').toString().toUpperCase();
            const sr = wikiData?.srcRate || currentTrack?.sampleRate || 0;
            const bd = wikiData?.srcBits ?? currentTrack?.bitDepth ?? 0;
            if (fmt.includes('DSD') || bd === 1) return '1-bit DSD Bitstream';
            if (sr > 0 && bd > 0) return `${(sr / 1000).toFixed(1)}kHz / ${bd}-bit`;
            if (sr > 0) return `${(sr / 1000).toFixed(1)}kHz`;
            return 'Detecting...';
          })(), isReal: true, search: '' },
        { label: 'Internal Path', value: '96kHz / 32-bit Float DSP Chain', isReal: true, search: '' },
        // The physical release medium (Discogs) — labeled for what it IS.
        { label: 'Release Medium', value: c.releaseMedium || NOT_IN_DB, isReal: !!c.releaseMedium, search: c.releaseMedium || '' },
      ],
    },
  ];

  const longTextRows = new Set(['About the Artist', 'Tracklist']);
  const tracklistRow = c.tracklist
    ? { label: 'Tracklist', value: c.tracklist, isReal: true, search: '' }
    : null;
  const summaryRow = c.wikiSummary
    ? { label: 'Album Notes', value: c.wikiSummary, isReal: true, search: `${c.albumTitle || ''} ${c.artistName || ''}` }
    : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[540px]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-neutral-800 border-b border-neutral-700">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-neutral-200 to-neutral-400 rounded flex items-center justify-center shadow-sm">
               <span className="text-[10px] font-black text-neutral-900">W</span>
            </div>
            <h2 className="text-sm font-bold font-mono-tech tracking-tighter text-white uppercase">Listening Wiki</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors text-neutral-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-white/5 bg-black/20">
          {sections.map((section, idx) => (
            <button
              key={idx}
              onClick={() => { triggerHaptic('tick'); setActiveTab(idx); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 transition-all ${
                activeTab === idx
                  ? 'bg-white/5 border-b-2 border-cyan-500 text-cyan-400'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {section.icon}
              <span className="text-[10px] font-black uppercase tracking-widest">{section.short}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {sections[activeTab].items.map((item, i) => {
              const isLong = longTextRows.has(item.label);
              return (
                <div
                  key={i}
                  className="flex flex-col group cursor-pointer active:opacity-60 transition-opacity"
                  onClick={() => handleTap(item.search, item.isReal)}
                >
                  <span className="text-[8px] font-bold text-neutral-600 uppercase mb-1">{item.label}</span>
                  <div className="flex items-start justify-between group-hover:bg-white/5 p-2 -mx-2 rounded transition-all border-b border-transparent group-hover:border-cyan-500/30">
                    <span className={`group-hover:text-cyan-300 transition-colors ${
                      isLong ? 'text-[11px] leading-snug' : 'text-sm'
                    } font-medium ${item.isReal ? 'text-neutral-200' : 'text-neutral-600 italic'}`}>
                      {item.value}
                    </span>
                    {item.isReal && (
                      <div className="flex items-center gap-1.5 opacity-20 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                         <Globe className="w-3.5 h-3.5 text-cyan-500" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {activeTab === 1 && summaryRow && (
              <div
                className="flex flex-col group cursor-pointer active:opacity-60 transition-opacity"
                onClick={() => handleTap(summaryRow.search, true)}
              >
                <span className="text-[8px] font-bold text-neutral-600 uppercase mb-1">{summaryRow.label} · Wikipedia</span>
                <div className="group-hover:bg-white/5 p-2 -mx-2 rounded transition-all border-b border-transparent group-hover:border-cyan-500/30">
                  <span className="text-[11px] leading-snug font-medium text-neutral-300 group-hover:text-cyan-300 transition-colors">
                    {summaryRow.value}
                  </span>
                </div>
              </div>
            )}
            {activeTab === 1 && tracklistRow && (
              <div className="flex flex-col">
                <span className="text-[8px] font-bold text-neutral-600 uppercase mb-1">{tracklistRow.label} · MusicBrainz</span>
                <div className="p-2 -mx-2 rounded border-b border-transparent">
                  <span className="text-[11px] leading-snug font-medium text-neutral-300">
                    {tracklistRow.value}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-neutral-800/50 border-t border-neutral-700 flex flex-col items-center gap-2">
          {Capacitor.isNativePlatform() && (
            <div className="w-full flex items-center justify-between gap-2 mb-1">
              <span className="text-[8px] text-neutral-500 uppercase tracking-widest flex items-center gap-1">
                <Pencil className="w-2.5 h-2.5" /> Wrong match?
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => void savePin('skip')}
                  className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors"
                >
                  No info
                </button>
                <button
                  onClick={() => {
                    const id = window.prompt('MusicBrainz Recording MBID\n(e.g. 03e5e326-4e68-4d5a-9f27-fd9be9e5f2f5)');
                    if (id && id.trim()) void savePin(`mbid:${id.trim()}`);
                  }}
                  className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors"
                >
                  Set MBID
                </button>
                {pinState === 'saved' && <span className="text-[9px] text-cyan-400 font-bold uppercase">Pinned</span>}
                {pinState === 'error' && <span className="text-[9px] text-red-400 font-bold uppercase">Failed</span>}
              </div>
            </div>
          )}
          <p className="text-[7px] text-neutral-600 uppercase tracking-widest italic">
            Live: MusicBrainz + Wikipedia · Tap any row to explore
          </p>
          <button
            onClick={onClose}
            className="w-full py-2 bg-neutral-200 hover:bg-white text-neutral-900 rounded font-bold text-xs uppercase transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};