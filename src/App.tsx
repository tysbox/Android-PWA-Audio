import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AudioChassis } from './components/AudioChassis';
import { UpnpBrowserModal } from './components/UpnpBrowserModal';
import { PresetModals } from './components/PresetModals';
import { WikiModal } from './components/WikiModal';
import { HeadphoneCalibrationDrawer } from './components/HeadphoneCalibrationDrawer';
import { QueDrawer } from './components/QueDrawer';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalBrowserModal } from './components/LocalBrowserModal';
import { filesToTrackItems, isAudioFile } from './utils/localLibrary';
import { extractEmbeddedArtUrl } from './utils/localArt';

const DlnaPlayback = registerPlugin<{
  pickLocalFolder: () => Promise<{ folderName: string; files: { name: string; uri: string }[] }>;
  pickLocalFiles: () => Promise<{ files: { name: string; uri: string }[] }>;
  getMediaMetadata: (options: { uri: string }) => Promise<{ artist: string; title: string; album: string; duration: number }>;
  importLocalFile: (options: { fileName: string; mimeType: string; base64Data: string }) => Promise<{ contentUri: string }>;
  getAlbumArt: (options: { uri: string }) => Promise<{ artBase64: string; mime: string }>;
}>('DlnaPlayback');
import { audioEngine } from './dsp';
import { DEMO_TRACKS } from './data/demoTracks';
import { HEADPHONE_PROFILES } from './dsp/headphoneProfiles';
import { HEADPHONE_CATALOG, catalogEntryToProfile } from './dsp/headphoneCatalog';
import { ORATORY_CRINACLE_ENTRIES } from './dsp/headphoneCatalog_oratory_crinacle';

// Phase 2-⑥: 'Flat Reference' target — applies -listening curve (= flattens the headphone).
// This is distinct from 'Bypass (No Calibration)' which does nothing (raw headphone sound).
// When selected as target, correction = 0 - listening = -listening (flattens the headphone).
const FLAT_REFERENCE_PROFILE: HeadphoneProfile = {
  id: 'flat_reference',
  modelName: 'Flat Reference (ヘッドホン特性をフラット化)',
  brand: 'Standard',
  targetCurve: 'Flat Reference',
  preampGainDb: 0.0,
  bands: [{ freq: 1000, gain: 0.0, q: 1.0, type: 'peaking' }],
};

// Phase 2-⑥: Harman Reference target = the default. When selected,
// correction = Harman - listening (i.e. brings the headphone to Harman target).
// Approximate Harman Over-Ear 2019 target curve (5-band approximation).
const HARMAN_REFERENCE_PROFILE: HeadphoneProfile = {
  id: 'harman_reference',
  modelName: 'Harman Reference (デフォルト)',
  brand: 'Standard',
  targetCurve: 'Harman 2019 Over-Ear',
  preampGainDb: 0.0,
  bands: [
    { freq: 105, gain: 0.0, q: 0.7, type: 'lowshelf' },
    { freq: 1000, gain: 0.0, q: 1.0, type: 'peaking' },
    { freq: 3000, gain: 1.0, q: 4.0, type: 'peaking' },
    { freq: 5000, gain: 0.5, q: 4.0, type: 'peaking' },
    { freq: 10000, gain: -2.0, q: 0.7, type: 'highshelf' },
  ],
};
import { DspPreset, TrackItem, HeadphoneProfile } from './types';
import { triggerHaptic } from './utils/haptics';
import { calculateTotalCurve } from './dsp/totalCurve';
import {
  OUTPUT_EQ_OPTIONS,
  SOURCE_EQ_OPTIONS,
  AMBIENCE_OPTIONS,
  CROSSFEED_OPTIONS,
  HUM_FILTER_OPTIONS,
  SPATIAL_DEPTH_OPTIONS,
} from './dsp/presets';

const PRESETS_STORAGE_KEY = 'biscene_dsp_presets_v2';
const LAST_TRACK_STORAGE_KEY = 'biscene_last_track_uri';
const HEADPHONE_STORAGE_KEY = 'biscene_headphone_profile_v1';
const QUEUE_STORAGE_KEY = 'biscene_queue_state_v1';
const REP_PIN_STORAGE_KEY = 'biscene_rep_pin_track_id';

const DEFAULT_PRESETS: DspPreset[] = [
  {
    name: 'Audiophile Studio Pure',
    outputEqIdx: 1, // STUDIO
    sourceEqIdx: 1, // JAZZ
    humFilterIdx: 0, // NONE
    ambienceIdx: 0, // OFF
    ambienceIntensity: 0,
    crossfeedIdx: 2, // 15°
    crossfeedIntensity: 40,
    headphoneProfileId: 'sennheiser_hd650',
    tubeWarmth: false,
    tubeType: 0,
    tubeBias: 0,
    restoration: false,
    spatialWidth: 30,
    spatialDepth: 'NORMAL',
  },
  {
    name: 'Concert Hall Immersion',
    outputEqIdx: 3, // PLANAR
    sourceEqIdx: 2, // CLASSICAL
    humFilterIdx: 0,
    ambienceIdx: 1, // HALL
    ambienceIntensity: 60,
    crossfeedIdx: 3, // 30°
    crossfeedIntensity: 50,
    headphoneProfileId: 'sony_wh1000xm5',
    tubeWarmth: true,
    tubeType: 0,
    tubeBias: 50,
    restoration: true,
    spatialWidth: 45,
    spatialDepth: 'FAR',
  },
  {
    name: 'Club Bass & Tube Warmth',
    outputEqIdx: 6, // CRYSTAL (TUBE preset removed)
    sourceEqIdx: 3, // ELECTRONIC
    humFilterIdx: 1, // 50HZ
    ambienceIdx: 2, // JAZZ CLUB
    ambienceIntensity: 45,
    crossfeedIdx: 2, // 15°
    crossfeedIntensity: 60,
    headphoneProfileId: 'audio_technica_m50x',
    tubeWarmth: true,
    tubeType: 1,
    tubeBias: 75,
    restoration: false,
    spatialWidth: 15,
    spatialDepth: 'NORMAL',
  },
];

/** Restore the playback queue across restarts (blob: URLs cannot survive). */
const loadPersistedQueue = (): { playlist: TrackItem[]; currentIndex: number } => {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (raw) {
      const st = JSON.parse(raw);
      if (st && Array.isArray(st.playlist)) {
        const restorable = st.playlist.filter(
          (t: TrackItem) => t && typeof t.url === 'string' && !t.url.startsWith('blob:')
        );
        if (restorable.length > 0) {
          let ci = Number.isInteger(st.currentIndex) ? st.currentIndex : 0;
          if (ci < 0 || ci >= restorable.length) ci = 0;
          return { playlist: restorable, currentIndex: ci };
        }
      }
    }
  } catch {
    // Ignored
  }
  return { playlist: DEMO_TRACKS, currentIndex: 0 };
};

/** Launch start position: REP pin > last played > saved position. */
const resolveStartIndex = (playlist: TrackItem[], fallback: number): number => {
  try {
    const pinId = localStorage.getItem(REP_PIN_STORAGE_KEY);
    if (pinId) {
      const i = playlist.findIndex((t) => t.id === pinId);
      if (i !== -1) return i;
    }
    const lastId = localStorage.getItem(LAST_TRACK_STORAGE_KEY);
    if (lastId) {
      const i = playlist.findIndex((t) => t.id === lastId);
      if (i !== -1) return i;
    }
  } catch {
    // Ignored
  }
  return fallback;
};

export const App: React.FC = () => {
  // Audio playback state (queue persisted across restarts)
  const [playlist, setPlaylist] = useState<TrackItem[]>(() => loadPersistedQueue().playlist);
  const [currentIndex, setCurrentIndex] = useState(() =>
    resolveStartIndex(loadPersistedQueue().playlist, loadPersistedQueue().currentIndex)
  );

  // REP pin UI feedback state
  const [repPinId, setRepPinId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(REP_PIN_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [repJustSet, setRepJustSet] = useState(false);
  const repFlashTimerRef = useRef<number | null>(null);
  const [isFileActive, setIsFileActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rendererTrack, setRendererTrack] = useState<TrackItem | null>(null);
  // True while an OpenHome renderer queue owns playback. Local transport is
  // disabled during this window so the local queue cannot preempt the renderer.
  const [rendererOverlay, setRendererOverlay] = useState(false);
  const rendererOverlayRef = useRef(false);
  const updateRendererOverlay = (value: boolean) => {
    rendererOverlayRef.current = value;
    setRendererOverlay(value);
  };
  const [dspRunning, setDspRunning] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Metering
  const [peakLevels, setPeakLevels] = useState<{ left: number; right: number }>({ left: 0, right: 0 });

  // Feature 1: A/B Instant Bypass (Direct vs DSP)
  const [dspBypassed, setDspBypassed] = useState(false);
  const [phaseInverted, setPhaseInverted] = useState(false);
  const [isUsbConnected, setIsUsbConnected] = useState(false);

  // Feature 2: Analog Tube Warmth
  const [tubeWarmthEnabled, setTubeWarmthEnabled] = useState(false);
  const [tubeType, setTubeType] = useState<0 | 1>(0);
  const [tubeBias, setTubeBias] = useState(50);
  const [restorationEnabled, setRestorationEnabled] = useState(false);
  const [spatialDepthIdx, setSpatialDepthIdx] = useState(2); // Normal

  // Feature 3: Headphone Calibration Strength (Phase 1-①)
  // 0.0 (Bypass) .. 1.0 (Full AutoEQ Apply). Default 0.5 (CamillaDSP "minimum intervention").
  const [calibrationIntensity, setCalibrationIntensity] = useState(0.5);

  // Phase 1-②: Total EQ Curve visibility (album-art-tap driven)
  const [showTotalCurve, setShowTotalCurve] = useState(false);

  // Phase 2-⑦: Preset navigation history (max 3: current + previous 2)
  const [presetHistory, setPresetHistory] = useState<DspPreset[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1); // -1 = no history

  // Headphone / Earphone AutoEq Calibration Feature
  // Phase 2-⑥ (fix): Look up the saved id in BOTH the hard-coded 9-entry
  // HEADPHONE_PROFILES and the 44-entry HEADPHONE_CATALOG. Without this,
  // selecting a listening headphone from the catalog (e.g. AKG K701) would
  // fail to restore on app restart because the saved id wouldn't be found
  // in HEADPHONE_PROFILES alone.
  const [selectedHeadphoneProfile, setSelectedHeadphoneProfile] = useState<HeadphoneProfile>(() => {
    try {
      const saved = localStorage.getItem(HEADPHONE_STORAGE_KEY);
      if (saved) {
        const fromPreset = HEADPHONE_PROFILES.find((p) => p.id === saved);
        if (fromPreset) return fromPreset;
        const fromCatalog = HEADPHONE_CATALOG.find((e) => e.id === saved);
        if (fromCatalog) {
          return catalogEntryToProfile(fromCatalog);
        }
        // Fallback: try the user's local custom profiles
        try {
          const custom = JSON.parse(
            localStorage.getItem('biscene_custom_headphone_profiles') || '[]'
          );
          const fromCustom = custom.find((p: HeadphoneProfile) => p.id === saved);
          if (fromCustom) return fromCustom;
        } catch {
          // Ignored
        }
      }
    } catch {
      // Ignored
    }
    return HEADPHONE_PROFILES[1]; // Default to Sony WH-1000XM5
  });

  const [previewHeadphoneProfile, setPreviewHeadphoneProfile] = useState<HeadphoneProfile | null>(null);
  const [isHoveringHeadphone, setIsHoveringHeadphone] = useState(false);
  const [showHeadphoneDrawer, setShowHeadphoneDrawer] = useState(false);

  // Phase 2-⑥: Target curve (re-calibration destination). Default = flat_bypass (Harman).
  const [targetCurveId, setTargetCurveId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('biscene_target_curve_id');
      if (saved) return saved;
    } catch {
      // Ignored
    }
    return 'harman_reference'; // Default = Harman (ユーザー指示: 元はハーマン ② に戻した)
  });

  // Persist target curve id
  useEffect(() => {
    try {
      localStorage.setItem('biscene_target_curve_id', targetCurveId);
    } catch {
      // Ignored
    }
  }, [targetCurveId]);

  // DSP parameters
  const [outputEqIndex, setOutputEqIndex] = useState(1);
  const [sourceEqIndex, setSourceEqIndex] = useState(1);
  const [humFilterIndex, setHumFilterIndex] = useState(0);
  const [ambienceIndex, setAmbienceIndex] = useState(0);
  const [ambienceIntensity, setAmbienceIntensity] = useState(50);
  const [crossfeedIndex, setCrossfeedIndex] = useState(0);
  const [crossfeedIntensity, setCrossfeedIntensity] = useState(50);
  const [currentPresetName, setCurrentPresetName] = useState('Audiophile Studio Pure');

  // Volume
  const [volume, setVolume] = useState(12);
  const maxVolume = 15;

  // View Panels
  const [showDspPanel, setShowDspPanel] = useState(false); // false: PLY, true: MIX
  const [showUpnpModal, setShowUpnpModal] = useState(false);
  const [showWikiModal, setShowWikiModal] = useState(false);
  const [showQueDrawer, setShowQueDrawer] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);

  // Saved Presets
  const [savedPresets, setSavedPresets] = useState<DspPreset[]>(() => {
    try {
      const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignored
    }
    return DEFAULT_PRESETS;
  });

  const animFrameRef = useRef<number>(0);
  const playlistRef = useRef(playlist);
  useEffect(() => { playlistRef.current = playlist; }, [playlist]);

  // Persist queue + position across restarts.
  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify({ playlist, currentIndex }));
    } catch {
      // Ignored
    }
  }, [playlist, currentIndex]);

  // USB DAC status listener
  useEffect(() => {
    audioEngine.onUsbDacChange = (connected) => {
      setIsUsbConnected(connected);
    };
    setIsUsbConnected(audioEngine.isUsbDacConnected);
  }, []);

  // PWA: Initialize audio engine on mount (lazy init in native)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      audioEngine.initAudioContext().catch((e) => {
        console.error('[App] PWA audio engine init failed:', e);
      });
    }
  }, []);

  // Sync DSP parameters to AudioEngine
  useEffect(() => {
    audioEngine.updateDspParams({
      outputEqIdx: outputEqIndex,
      sourceEqIdx: sourceEqIndex,
      humFilterIdx: humFilterIndex,
      ambienceIdx: ambienceIndex,
      ambienceIntensity: ambienceIntensity,
      crossfeedIdx: crossfeedIndex,
      spatialDepth: SPATIAL_DEPTH_OPTIONS[spatialDepthIdx],
    });
  }, [
    outputEqIndex,
    sourceEqIndex,
    humFilterIndex,
    ambienceIndex,
    ambienceIntensity,
    crossfeedIndex,
    spatialDepthIdx,
  ]);

  // Phase 2-⑥: Compute correction bands = target curve - listening headphone curve
  const computeCorrectionBands = (
    listening: HeadphoneProfile,
    target: HeadphoneProfile
  ): HeadphoneProfile => {
    if (listening.id === target.id) {
      // Same profile: no correction (already at target)
      return { ...listening, bands: [] };
    }
    // Build target band map by freq
    const targetByFreq = new Map<number, number>();
    target.bands.forEach((b) => {
      if (b.type !== 'lowshelf' && b.type !== 'highshelf') {
        targetByFreq.set(Math.round(b.freq), b.gain);
      }
    });
    // Compute correction = -listening.gain (for each band) + target.gain (matched by freq)
    // Simplified: for each listening band, find matching target band and subtract.
    const correctedBands = listening.bands.map((lb) => {
      // Try to find target band at exact same freq, else closest within 5%
      let targetGain = 0;
      const tolerance = lb.freq * 0.05;
      const exact = target.bands.find((tb) => Math.abs(tb.freq - lb.freq) <= tolerance);
      if (exact) {
        targetGain = exact.gain;
      }
      return {
        ...lb,
        gain: targetGain - lb.gain,
      };
    });
    return { ...listening, bands: correctedBands };
  };

  // Phase 2-⑥ (fix): Resolve the target profile by id. Previously the
  // search was limited to HEADPHONE_PROFILES + localStorage custom, so
  // catalog ids like 'oratory1990__over_ear__AKG_K701' silently returned
  // null and the target never took effect. Now we also search the
  // 2,815-entry bundled catalog (curated 44 + oratory1990/crinacle
  // 2,771). Virtual profile ids (harman_reference, flat_reference,
  // flat_bypass) are checked first.
  const resolveProfileById = (id: string): HeadphoneProfile | null => {
    if (id === FLAT_REFERENCE_PROFILE.id) return FLAT_REFERENCE_PROFILE;
    if (id === HARMAN_REFERENCE_PROFILE.id) return HARMAN_REFERENCE_PROFILE;
    if (id === 'flat_bypass') {
      return {
        id: 'flat_bypass',
        modelName: 'Bypass (No Calibration)',
        brand: 'Standard',
        targetCurve: 'Flat Reference',
        preampGainDb: 0,
        bands: [],
      };
    }
    const fromPreset = HEADPHONE_PROFILES.find((p) => p.id === id);
    if (fromPreset) return fromPreset;
    // Search the curated 44 catalog
    const fromCatalog = HEADPHONE_CATALOG.find((e) => e.id === id);
    if (fromCatalog) return catalogEntryToProfile(fromCatalog);
    // Search oratory1990 / crinacle catalog (2,771 entries)
    const fromOratory = ORATORY_CRINACLE_ENTRIES.find((e) => e.id === id);
    if (fromOratory) return catalogEntryToProfile(fromOratory);
    try {
      const custom = JSON.parse(localStorage.getItem('biscene_custom_headphone_profiles') || '[]');
      const found = custom.find((p: HeadphoneProfile) => p.id === id);
      return found ?? null;
    } catch {
      return null;
    }
  };

  // Sync Headphone Profile to Engine (with target curve correction)
  useEffect(() => {
    // Resolve target curve
    const target = resolveProfileById(targetCurveId);
    if (!target) {
      // Fallback: no correction (just listening as-is)
      audioEngine.setHeadphoneProfile(selectedHeadphoneProfile);
    } else {
      const corrected = computeCorrectionBands(selectedHeadphoneProfile, target);
      audioEngine.setHeadphoneProfile(corrected);
    }
    try {
      localStorage.setItem(HEADPHONE_STORAGE_KEY, selectedHeadphoneProfile.id);
    } catch {
      // Ignored
    }
  }, [selectedHeadphoneProfile, targetCurveId]);

  // Sync A/B Bypass & Tube Warmth to Engine
  useEffect(() => {
    audioEngine.setDspBypass(dspBypassed);
  }, [dspBypassed]);

  useEffect(() => {
    audioEngine.setTubeWarmth(tubeWarmthEnabled);
  }, [tubeWarmthEnabled]);

  useEffect(() => {
    audioEngine.setTubeParams(tubeType, tubeBias);
  }, [tubeType, tubeBias]);

  useEffect(() => {
    audioEngine.setRestorationEnabled(restorationEnabled);
  }, [restorationEnabled]);

  useEffect(() => {
    audioEngine.setSpatialDepth(SPATIAL_DEPTH_OPTIONS[spatialDepthIdx]);
  }, [spatialDepthIdx]);

  // Sync Headphone Calibration Strength to Engine (Phase 1-①)
  useEffect(() => {
    audioEngine.setCalibrationIntensity(calibrationIntensity);
  }, [calibrationIntensity]);

  // Volume synchronization
  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  // VU Meter & Playback Time polling loop
  useEffect(() => {
    const updateMeters = () => {
      const levels = audioEngine.getPeakLevels();
      setPeakLevels(levels);
      setDspRunning(audioEngine.isDspRunning());

      if (isFileActive) {
        setCurrentTime(audioEngine.getCurrentTime());
        setDuration(audioEngine.getDuration());
      }

      animFrameRef.current = requestAnimationFrame(updateMeters);
    };

    animFrameRef.current = requestAnimationFrame(updateMeters);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isFileActive]);

  // Track currentIndex in ref for callbacks
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // True Gapless Playback: Pre-queue next track in engine
  useEffect(() => {
    if (playlist.length > 1 && currentIndex < playlist.length - 1) {
      const nextTrack = playlist[currentIndex + 1];
      audioEngine.queueNextTrack(nextTrack.url);
    } else {
      audioEngine.clearNextTrack();
    }
  }, [currentIndex, playlist]);

  // Auto-play track runner
  const playTrackAtIndex = useCallback((index: number) => {
    const currentPlaylist = playlistRef.current;
    if (index >= 0 && index < currentPlaylist.length) {
      // Drop the outgoing track's native metadata / INFO credits so they can
      // never bleed into the next track while its own tags are still loading.
      setRealTimeMeta(null);
      setCurrentIndex(index);
      currentIndexRef.current = index; // sync immediately — avoids stale-index advances
      const track = currentPlaylist[index];
      setRendererTrack(null);
      audioEngine.playTrack(track.url);
      setIsFileActive(true);
      setIsPaused(false);
      try {
        localStorage.setItem(LAST_TRACK_STORAGE_KEY, track.id);
      } catch {
        // Ignored
      }
    }
  }, []);

  // V4.5.6: Real-time metadata bridge (native signal truth + MusicBrainz credits)
  const [realTimeMeta, setRealTimeMeta] = useState<any>(null);
  useEffect(() => {
    audioEngine.onMetadataUpdate = (data: any) => {
      setRealTimeMeta((prev: any) => ({ ...(prev || {}), ...(data || {}) }));
      if (data?.duration) setDuration(data.duration);
    };
  }, []);

  useEffect(() => {
    audioEngine.onRendererTrack = (track: TrackItem) => {
      updateRendererOverlay(true);
      setRendererTrack(track);
      setIsFileActive(true);
      setIsPaused(false);
      if (track.duration) setDuration(track.duration);
      if (track.format) setRealTimeMeta((prev: any) => ({ ...(prev || {}), format: track.format }));
    };
    audioEngine.onRendererState = (data: any) => {
      const active = data?.active === true;
      const state = data?.state;
      if (active) updateRendererOverlay(true);
      // A queue that already completed handed control back to local playback;
      // ignore the trailing ENDED so it cannot clobber the resumed track.
      if (!active && !rendererOverlayRef.current) return;
      setIsFileActive(active);
      setIsPaused(state === 'PAUSED');
      // IDLE / ERROR = explicit stop or failure (not a mid-queue track change).
      if (state === 'IDLE' || state === 'ERROR') updateRendererOverlay(false);
      if (state === 'ENDED' || state === 'IDLE' || state === 'ERROR') {
        setRendererTrack(null);
        setCurrentTime(0);
      }
    };
    // Renderer queue exhausted (natural end of last track): give playback back
    // to the local queue at its preserved index. Local start invalidates the
    // renderer session, so this cannot start the renderer again.
    audioEngine.onRendererQueueCompleted = () => {
      updateRendererOverlay(false);
      setRendererTrack(null);
      setCurrentTime(0);
      const list = playlistRef.current;
      const idx = currentIndexRef.current;
      if (list.length > 0 && idx >= 0 && idx < list.length) {
        playTrackAtIndex(idx);
      } else {
        setIsFileActive(false);
        setIsPaused(false);
      }
    };
  }, [playTrackAtIndex]);

  // Force WikiModal remount when credits arrive (content-based comparison)
  const [forceRemount, setForceRemount] = useState(0);
  const creditsKeyRef = useRef<string>('');
  useEffect(() => {
    if (realTimeMeta?.credits) {
      const newKey = JSON.stringify(Object.keys(realTimeMeta.credits).sort());
      if (newKey !== creditsKeyRef.current) {
        creditsKeyRef.current = newKey;
        setForceRemount(r => r + 1);
      }
    }
  }, [realTimeMeta?.credits]);

  // V4.5.6: On-demand encyclopedia fetch when the INFO modal opens.
  // V6.1 FIX: the old guard was `if (realTimeMeta?.credits) return;`, so once the
  // play-time path delivered ANY keys (often just MB credits), the full 3-source
  // resolve never ran and Wikipedia-derived rows (Album Notes / artist bio /
  // wiki infobox label-genre-studio) stayed "Not catalogued" forever.
  // Now we re-run when the Wiki-side keys are still missing, but:
  //   - at most once per track per modal-open cycle (no retry loop while open),
  //   - the result is MERGED into the existing credits so a sparse/failed manual
  //     fetch can never wipe richer play-time data.
  const wikiFetchInFlightRef = useRef(false);
  const wikiFetchAttemptedKeyRef = useRef('');
  useEffect(() => {
    if (!showWikiModal) {
      // Closing the modal arms the next attempt: an offline-at-start track can be
      // retried when the user reopens INFO later.
      wikiFetchAttemptedKeyRef.current = '';
      return;
    }
    const existing: any = realTimeMeta?.credits;
    const wikiComplete = !!existing
      && Object.keys(existing).length > 0
      && (!!existing.wikiSummary || !!existing.artistBio);
    if (wikiComplete) return;
    const t = rendererTrack || playlistRef.current[currentIndexRef.current];
    if (!t) return;
    const attemptKey = `${t.url}|${t.artist}|${t.title}`;
    if (wikiFetchInFlightRef.current || wikiFetchAttemptedKeyRef.current === attemptKey) return;
    wikiFetchAttemptedKeyRef.current = attemptKey;
    wikiFetchInFlightRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        // V6.5.2: pass the album tag too — the album×artist resolution (Layer
        // A) and the album-cache need the real album name; without it the
        // probe falls into track-name-only matching and lands on a wrong
        // album carrying the same standard title (log-verified: Skylark).
        const credits = await (audioEngine as any).fetchWiki?.(t.artist || '', t.title || '', t.album || '');
        if (!cancelled && credits && Object.keys(credits).length > 0) {
          setRealTimeMeta((prev: any) => ({
            ...(prev || {}),
            credits: { ...((prev as any)?.credits || {}), ...credits },
          }));
        }
      } finally {
        wikiFetchInFlightRef.current = false;
      }
    })();
    return () => { cancelled = true; };
  }, [showWikiModal, currentIndex, rendererTrack, realTimeMeta?.credits]);

  // Transport handlers — supports both local queue and OpenHome renderer playback.
  const handlePlayPause = () => {
    triggerHaptic('click');
    if (rendererOverlay) {
      if (isFileActive && isPaused) {
        audioEngine.play();
        setIsPaused(false);
      } else if (isFileActive && !isPaused) {
        audioEngine.pause();
        setIsPaused(true);
      } else {
        audioEngine.playOpenHome();
      }
      return;
    }
    if (!isFileActive && playlist.length > 0) {
      playTrackAtIndex(currentIndex);
    } else if (isFileActive) {
      if (isPaused) {
        audioEngine.play();
        setIsPaused(false);
      } else {
        audioEngine.pause();
        setIsPaused(true);
      }
    } else if (!isFileActive && rendererTrack) {
      audioEngine.playOpenHome();
    }
  };

  const handleStop = () => {
    triggerHaptic('heavy');
    audioEngine.stopAllPlayback();
    setIsFileActive(false);
    setIsPaused(false);
    setCurrentTime(0);
  };

  const handlePrevTrack = () => {
    triggerHaptic('click');
    if (rendererOverlay) {
      audioEngine.previous();
      return;
    }
    if (playlist.length > 0) {
      const nextIdx = currentIndex > 0 ? currentIndex - 1 : playlist.length - 1;
      playTrackAtIndex(nextIdx);
    }
  };

  const handleNextTrack = () => {
    triggerHaptic('click');
    if (rendererOverlay) {
      audioEngine.next();
      return;
    }
    if (playlist.length > 0) {
      const nextIdx = (currentIndex + 1) % playlist.length;
      playTrackAtIndex(nextIdx);
    }
  };

  // Track ended callback
  useEffect(() => {
    audioEngine.onTrackEnded = () => {
      // Renderer owns playback — never advance the local queue from here.
      if (rendererOverlayRef.current) return;
      const idx = currentIndexRef.current;
      const currentList = playlistRef.current;
      console.log(`[advance] onTrackEnded idx=${idx} listLen=${currentList.length}`);
      if (idx < currentList.length - 1) {
        playTrackAtIndex(idx + 1);
      } else {
        setIsFileActive(false);
        setIsPaused(false);
      }
    };

    audioEngine.onRemoteCommand = (cmd) => {
      if (cmd === 'next') handleNextTrack();
      else if (cmd === 'previous') handlePrevTrack();
      else if (cmd.startsWith('seek:')) {
        const seconds = parseFloat(cmd.split(':')[1]) / 1000;
        audioEngine.seek(seconds);
      }
    };

    audioEngine.onVolumeUpdate = (level) => {
      setVolume(level);
    };
  }, [playTrackAtIndex, handleNextTrack, handlePrevTrack]);

  // Load last bookmarked track on mount
  useEffect(() => {
    try {
      const lastId = localStorage.getItem(LAST_TRACK_STORAGE_KEY);
      if (lastId) {
        const foundIdx = playlist.findIndex((t) => t.id === lastId);
        if (foundIdx !== -1) {
          setCurrentIndex(foundIdx);
        }
      }
    } catch {
      // Ignored
    }
  }, [playlist]);

  // --- SAF local folder playback (Android-native, no popups) ---

  // File Upload / Local audio picker (Direct immediate playback) — prepend to queue like DLNA
  // Uses native AlbumArtProvider (MMR + manual scan + folder search + iTunes fallback) for artwork
  const handlePickFiles = (files: FileList) => {
    triggerHaptic('heavy');
    const audioFiles = Array.from(files).filter(isAudioFile);
    if (audioFiles.length === 0) return;

    const set = filesToTrackItems(audioFiles);

    // Process each file: import to MediaStore, get album art via native provider
    const processFiles = async () => {
      for (let i = 0; i < set.tracks.length; i++) {
        const track = set.tracks[i];
        const file = set.files[i];

        try {
          // Item 3 (P0): For files larger than 5MB, use direct Blob URL to prevent Base64 IPC memory spikes and OOM
          if (file.size > 5 * 1024 * 1024) {
            track.url = URL.createObjectURL(file);
            const fallbackUrl = await extractEmbeddedArtUrl(file);
            if (fallbackUrl) track.albumArtUrl = fallbackUrl;
          } else {
            // Convert small file to base64
            const base64Data = await fileToBase64(file);

            // Import to MediaStore to get content:// URI
            const importResult = await DlnaPlayback.importLocalFile({
              fileName: file.name,
              mimeType: file.type || 'audio/*',
              base64Data
            });

            const contentUri = importResult.contentUri;
            track.contentUri = contentUri; // Store for potential future use

            // Get album art via native AlbumArtProvider
            const artResult = await DlnaPlayback.getAlbumArt({ uri: contentUri });
            if (artResult.artBase64) {
              track.albumArtUrl = `data:${artResult.mime};base64,${artResult.artBase64}`;
            }

            // If contentUri is a MediaStore URI, we can also use the proxy URL for playback
            if (contentUri.startsWith('content://')) {
              track.url = `http://127.0.0.1:${SAF_SERVER_PORT}/contentfile?uri=${encodeURIComponent(contentUri)}`;
              track.albumArtUrl = track.albumArtUrl || `http://127.0.0.1:${SAF_SERVER_PORT}/albumart?uri=${encodeURIComponent(contentUri)}`;
            }
          }
        } catch (e) {
          console.warn('Native album art extraction failed for', file.name, e);
          // Fallback to blob URL and TS-based extraction
          track.url = URL.createObjectURL(file);
          const fallbackUrl = await extractEmbeddedArtUrl(file);
          if (fallbackUrl) track.albumArtUrl = fallbackUrl;
        }
      }

      // Prepend to existing queue (DLNA style), dedupe by id
      setPlaylist((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const newTracks = set.tracks.filter((t) => !existingIds.has(t.id));
        const next = [...newTracks, ...prev];
        playlistRef.current = next;
        setCurrentIndex(0); // play the newly added first track
        return next;
      });
      setTimeout(() => playTrackAtIndex(0), 10);
    };

    processFiles();
  };

  // Helper: Convert File to base64 string
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:...;base64, prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // --- SAF local folder playback (Android-native, no popups) ---
  const SAF_SERVER_PORT = 9600;
  interface SafAlbumData {
    folderName: string;
    files: { name: string; uri: string }[];
    metadataMap?: Map<string, { artist: string; title: string; album: string; duration: number }>;
    loading?: boolean;
  }
  const [safAlbum, setSafAlbum] = useState<SafAlbumData | null>(null);

  const buildSafTracks = (files: { name: string; uri: string }[], folderName: string, metadataMap?: Map<string, { artist: string; title: string; album: string; duration: number }>): TrackItem[] =>
    files.map((f, i) => {
      const meta = metadataMap?.get(f.uri);
      // V6.5.3 SIGNAL-FIRST (provisional): the extension-derived format is a
      // display fallback ONLY until the decoder's measured truth arrives via
      // productionInfo (which then wins everywhere, including here via
      // realTimeMeta). SAF names always carry the extension, so this guess is
      // safe; content URIs without an extension just stay empty and the UI
      // shows 'Detecting...' — never a wrong value.
      const ext = f.name.toLowerCase().split('.').pop() || '';
      const extFormat =
        ext === 'flac' ? 'FLAC' :
        ext === 'dsf' || ext === 'dff' ? 'DSD' :
        ext === 'mp3' ? 'MP3' :
        ext === 'wav' ? 'WAV' :
        ext === 'm4a' || ext === 'm4b' ? 'AAC' :
        ext === 'ogg' || ext === 'opus' ? 'OGG' :
        ext === 'aiff' || ext === 'aif' ? 'AIFF' : '';
      return {
        id: `saf-${Date.now()}-${i}`,
        title: meta?.title || f.name.replace(/\.[^/.]+$/, '').replace(/^\d+\s*[-._]\s*/, ''),
        artist: meta?.artist || 'Unknown Artist',
        album: meta?.album || folderName,
        // 内部プロキシサーバー経由のURLを構築
        url: `http://127.0.0.1:${SAF_SERVER_PORT}/contentfile?uri=${encodeURIComponent(f.uri)}`,
        // アートワークもネイティブプロキシ経由で直接取得（UPnPと同等の仕組み）
        albumArtUrl: `http://127.0.0.1:${SAF_SERVER_PORT}/albumart?uri=${encodeURIComponent(f.uri)}`,
        format: extFormat || undefined,
        isLocal: true,
      };
    });

  const browseLocal = async () => {
    triggerHaptic('heavy');
    if (!Capacitor.isNativePlatform()) {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg,.dsf,.dff,.opus';
      input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
      document.body.appendChild(input);

      const cleanup = () => {
        if (input.parentNode) document.body.removeChild(input);
      };

      const handleChange = async (e: Event) => {
        const target = e.target as HTMLInputElement;
        const files = target.files;
        console.log('[App] onchange fired, files:', files?.length);

        try {
          if (!files || files.length === 0) {
            console.warn('[App] No files selected');
            return;
          }

          const selectedFiles = Array.from(files);
          console.log('[App] Files selected:', selectedFiles.map(f => f.name));

          const audioFiles = selectedFiles.filter(isAudioFile);
          const filesToUse = audioFiles.length > 0 ? audioFiles : Array.from(files);

          if (audioFiles.length === 0 && selectedFiles.length > 0) {
            const fileNames = selectedFiles.map(f => f.name).join(', ');
            alert(`音声ファイルとして認識されませんでしたが、全てキューに追加します。\n${fileNames}`);
          }

          const items: TrackItem[] = await Promise.all(
            filesToUse.map(async (f, idx) => {
              let artUrl: string | undefined;
              try {
                artUrl = await extractEmbeddedArtUrl(f) || undefined;
                console.log('[App] Album art extracted for', f.name, ':', artUrl ? 'SUCCESS' : 'NONE');
              } catch (e) {
                console.warn('[App] extractEmbeddedArtUrl error for', f.name, ':', e);
              }
              return {
                id: `pwa-file-${Date.now()}-${idx}`,
                title: f.name.replace(/\.[^/.]+$/, ''),
                artist: 'ローカルファイル',
                album: 'PWA ライブラリ',
                url: URL.createObjectURL(f),
                albumArtUrl: artUrl,
                format: f.name.split('.').pop()?.toUpperCase() || 'AUDIO',
                isLocal: true,
              };
            })
          );

          if (items.length === 0) return;

          console.log('[App] Created items:', items.map(i => i.title));
          setPlaylist(items);
          playlistRef.current = items;
          setCurrentIndex(0);
          currentIndexRef.current = 0;
          setRendererTrack(null);
          setIsFileActive(true);
          setIsPaused(false);
          audioEngine.playTrack(items[0].url);
        } catch (err) {
          console.error('[App] File processing error:', err);
          alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          cleanup();
        }
      };

      input.addEventListener('change', handleChange, { once: true });

      try {
        input.click();
        console.log('[App] input.click() executed');
      } catch (clickErr) {
        console.error('[App] input.click() failed:', clickErr);
        alert('ファイル選択ダイアログを開けませんでした: ' + clickErr);
        cleanup();
      }
      return;
    }

    try {
      const res = await DlnaPlayback.pickLocalFolder();
      const files = (res?.files as { name: string; uri: string }[] | undefined) ?? [];
      if (files.length === 0) {
        alert('フォルダ内に再生可能な楽曲が見つかりませんでした。');
        return;
      }
      setSafAlbum({
        folderName: (res?.folderName as string) ?? 'Album',
        files,
        metadataMap: undefined,
        loading: true
      });

      const metadataMap = new Map<string, { artist: string; title: string; album: string; duration: number }>();
      for (const f of files) {
        try {
          const meta = await DlnaPlayback.getMediaMetadata({ uri: f.uri });
          metadataMap.set(f.uri, meta);
        } catch (e) {
          console.warn('getMediaMetadata failed for', f.uri, e);
        }
      }
      setSafAlbum(prev => prev ? {
        ...prev,
        metadataMap,
        loading: false
      } : null);
    } catch (e: any) {
      if (e?.message !== 'cancelled') {
        console.error('Local folder pick failed:', e);
      }
    }
  };

  // Update SafAlbumData interface to include loading
  // (already done via interface update above)

  const handleSafPlay = (_startIndex: number, selectedFiles?: { name: string; uri: string }[]) => {
    if (!safAlbum) return;
    const filesToUse = selectedFiles || safAlbum.files;
    const tracks = buildSafTracks(filesToUse, safAlbum.folderName, safAlbum.metadataMap);
    // Prepend to existing queue (DLNA style), dedupe by id
    setPlaylist((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const newTracks = tracks.filter((t) => !existingIds.has(t.id));
      const next = [...newTracks, ...prev];
      playlistRef.current = next;
      setCurrentIndex(0); // play the newly added first track
      return next;
    });
    setTimeout(() => playTrackAtIndex(0), 10);
    setSafAlbum(null);
  };

  const handleSafAdd = (selectedFiles?: { name: string; uri: string }[]) => {
    if (!safAlbum) return;
    const filesToUse = selectedFiles || safAlbum.files;
    const tracks = buildSafTracks(filesToUse, safAlbum.folderName, safAlbum.metadataMap);
    setPlaylist((prev) => {
      const next = [...prev, ...tracks];
      playlistRef.current = next;
      if (prev.length === 0) {
        setCurrentIndex(0);
        setTimeout(() => playTrackAtIndex(0), 10);
      }
      return next;
    });
    setSafAlbum(null);
  };

  const handleAddToQueue = (files: FileList) => {
    triggerHaptic('heavy');
    const audioFiles = Array.from(files).filter(isAudioFile);
    const allFiles = Array.from(files);
    if (audioFiles.length === 0 && allFiles.length > 0) {
      // Fallback: accept all files if filter rejected everything
      alert(`音声ファイルとして認識されませんでしたが、全てキューに追加します。\n${allFiles.map(f => f.name).join(', ')}`);
    }
    const filesToProcess = audioFiles.length > 0 ? audioFiles : allFiles;
    if (filesToProcess.length === 0) return;

    if (!Capacitor.isNativePlatform()) {
      const processWebFiles = async () => {
        try {
          const tracks: TrackItem[] = await Promise.all(
            filesToProcess.map(async (f, idx) => {
              const ext = f.name.split('.').pop()?.toUpperCase() || 'AUDIO';
              let artUrl: string | undefined;
              try {
                artUrl = await extractEmbeddedArtUrl(f) || undefined;
                console.log('[App] Album art extracted for', f.name, ':', artUrl ? 'SUCCESS' : 'NONE');
              } catch (e) {
                console.warn('[App] extractEmbeddedArtUrl error for', f.name, ':', e);
              }
              return {
                id: `pwa-queue-${Date.now()}-${idx}`,
                title: f.name.replace(/\.[^/.]+$/, ''),
                artist: 'ローカルファイル',
                album: 'PWA キュー',
                url: URL.createObjectURL(f),
                albumArtUrl: artUrl,
                format: ext,
                isLocal: true,
              };
            })
          );

          if (tracks.length === 0) {
            alert('トラック作成に失敗しました。');
            return;
          }

          console.log('[App] Adding tracks to queue:', tracks.map(t => t.title));
          setPlaylist((prev) => {
            const next = [...prev, ...tracks];
            playlistRef.current = next;
            if (prev.length === 0) {
              setCurrentIndex(0);
              currentIndexRef.current = 0;
              setIsFileActive(true);
              setIsPaused(false);
              audioEngine.playTrack(next[0].url);
            }
            return next;
          });
        } catch (err) {
          console.error('[App] handleAddToQueue error:', err);
          alert(`キュー追加エラー: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
      processWebFiles();
      return;
    }

    const set = filesToTrackItems(audioFiles);

    // Process each file with native album art extraction
    const processFiles = async () => {
      for (let i = 0; i < set.tracks.length; i++) {
        const track = set.tracks[i];
        const file = set.files[i];

        try {
          const base64Data = await fileToBase64(file);

          const importResult = await DlnaPlayback.importLocalFile({
            fileName: file.name,
            mimeType: file.type || 'audio/*',
            base64Data
          });

          const contentUri = importResult.contentUri;
          track.contentUri = contentUri;

          const artResult = await DlnaPlayback.getAlbumArt({ uri: contentUri });
          if (artResult.artBase64) {
            track.albumArtUrl = `data:${artResult.mime};base64,${artResult.artBase64}`;
          }

          if (contentUri.startsWith('content://')) {
            track.url = `http://127.0.0.1:${SAF_SERVER_PORT}/contentfile?uri=${encodeURIComponent(contentUri)}`;
            track.albumArtUrl = track.albumArtUrl || `http://127.0.0.1:${SAF_SERVER_PORT}/albumart?uri=${encodeURIComponent(contentUri)}`;
          }
        } catch (e) {
          console.warn('Native album art extraction failed for', file.name, e);
          track.url = URL.createObjectURL(file);
          const fallbackUrl = await extractEmbeddedArtUrl(file);
          if (fallbackUrl) track.albumArtUrl = fallbackUrl;
        }
      }

      if (set.tracks.length > 0) {
        setPlaylist((prev) => {
          const next = [...prev, ...set.tracks];
          playlistRef.current = next;
          if (prev.length === 0) {
            setCurrentIndex(0);
            setTimeout(() => playTrackAtIndex(0), 10);
          }
          return next;
        });
      }
    };

    processFiles();
  };

  // Preset Handlers
  const handleSavePreset = (name: string) => {
    const newPreset: DspPreset = {
      name,
      outputEqIdx: outputEqIndex,
      sourceEqIdx: sourceEqIndex,
      humFilterIdx: humFilterIndex,
      ambienceIdx: ambienceIndex,
      ambienceIntensity: ambienceIntensity,
      crossfeedIdx: crossfeedIndex,
      crossfeedIntensity: crossfeedIntensity,
      headphoneProfileId: selectedHeadphoneProfile.id,
      tubeWarmth: tubeWarmthEnabled,
      tubeType: tubeType,
      tubeBias: tubeBias,
      restoration: restorationEnabled,
      spatialDepthIdx: spatialDepthIdx,
    };
    const updated = [...savedPresets, newPreset];
    setSavedPresets(updated);
    setCurrentPresetName(name);
    // Phase 2-⑦: Push to history (newest first, max 3)
    setPresetHistory((prev) => [newPreset, ...prev].slice(0, 3));
    setHistoryIndex(0);
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignored
    }
  };

  const handleLoadPreset = (p: DspPreset) => {
    setOutputEqIndex(p.outputEqIdx);
    setSourceEqIndex(p.sourceEqIdx);
    setHumFilterIndex(p.humFilterIdx);
    setAmbienceIndex(p.ambienceIdx);
    setAmbienceIntensity(p.ambienceIntensity);
    setCrossfeedIndex(p.crossfeedIdx);
    setCrossfeedIntensity(p.crossfeedIntensity);
    if (p.headphoneProfileId) {
      // Phase 2-⑥ (fix): Try preset, then catalog, then custom
      const fromPreset = HEADPHONE_PROFILES.find((h) => h.id === p.headphoneProfileId);
      if (fromPreset) {
        setSelectedHeadphoneProfile(fromPreset);
      } else {
        const fromCatalog = HEADPHONE_CATALOG.find((e) => e.id === p.headphoneProfileId);
        if (fromCatalog) {
          setSelectedHeadphoneProfile(catalogEntryToProfile(fromCatalog));
        }
      }
    }
    if (p.tubeWarmth !== undefined) setTubeWarmthEnabled(p.tubeWarmth);
    if (p.tubeType !== undefined) setTubeType(p.tubeType);
    if (p.tubeBias !== undefined) setTubeBias(p.tubeBias);
    if (p.restoration !== undefined) setRestorationEnabled(p.restoration);
    if (p.spatialDepthIdx !== undefined) setSpatialDepthIdx(p.spatialDepthIdx);
    setCurrentPresetName(p.name);
    // Phase 2-⑦: Push to history if not already present at top
    setPresetHistory((prev) => {
      const filtered = prev.filter((item) => item.name !== p.name);
      return [p, ...filtered].slice(0, 3);
    });
    setHistoryIndex(0);
  };

  // Phase 2-⑦: Apply a preset to DSP state (reuses existing pattern)
  const applyPresetToState = (p: DspPreset) => {
    setOutputEqIndex(p.outputEqIdx);
    setSourceEqIndex(p.sourceEqIdx);
    setHumFilterIndex(p.humFilterIdx);
    setAmbienceIndex(p.ambienceIdx);
    setAmbienceIntensity(p.ambienceIntensity);
    setCrossfeedIndex(p.crossfeedIdx);
    setCrossfeedIntensity(p.crossfeedIntensity);
    if (p.headphoneProfileId) {
      const hp = HEADPHONE_PROFILES.find((h) => h.id === p.headphoneProfileId);
      if (hp) setSelectedHeadphoneProfile(hp);
    }
    if (p.tubeWarmth !== undefined) setTubeWarmthEnabled(p.tubeWarmth);
    if (p.tubeType !== undefined) setTubeType(p.tubeType);
    if (p.tubeBias !== undefined) setTubeBias(p.tubeBias);
    if (p.restoration !== undefined) setRestorationEnabled(p.restoration);
    if (p.spatialDepthIdx !== undefined) setSpatialDepthIdx(p.spatialDepthIdx);
    setCurrentPresetName(p.name);
  };

  // Phase 2-⑦: Navigate preset history via swipe
  // direction='prev' = go to older preset (index+1), 'next' = newer (index-1)
  const navigatePresetHistory = (direction: 'prev' | 'next') => {
    if (presetHistory.length === 0) {
      triggerHaptic('tick');
      return;
    }
    const newIdx = direction === 'prev'
      ? Math.min(historyIndex + 1, presetHistory.length - 1)
      : Math.max(historyIndex - 1, 0);
    if (newIdx === historyIndex) {
      triggerHaptic('tick');
      return;
    }
    setHistoryIndex(newIdx);
    applyPresetToState(presetHistory[newIdx]);
    triggerHaptic('click');
  };

  const handleClearPreset = () => {
    setOutputEqIndex(0);
    setSourceEqIndex(0);
    setHumFilterIndex(0);
    setAmbienceIndex(0);
    setAmbienceIntensity(0);
    setCrossfeedIndex(0);
    setCrossfeedIntensity(0);
    setSelectedHeadphoneProfile(HEADPHONE_PROFILES[0]);
    setTubeWarmthEnabled(false);
    setTubeType(0);
    setTubeBias(50);
    setRestorationEnabled(false);
    setSpatialDepthIdx(2);
    setCalibrationIntensity(0.5);
    setCurrentPresetName('');
    // Phase 2-⑦: Clear preset history
    setPresetHistory([]);
    setHistoryIndex(-1);
  };

  const handleRenamePreset = (p: DspPreset, newName: string) => {
    const updated = savedPresets.map((item) =>
      item.name === p.name ? { ...item, name: newName } : item
    );
    setSavedPresets(updated);
    if (currentPresetName === p.name) setCurrentPresetName(newName);
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignored
    }
  };

  const handleDeletePreset = (p: DspPreset) => {
    const updated = savedPresets.filter((item) => item.name !== p.name);
    setSavedPresets(updated);
    if (currentPresetName === p.name) setCurrentPresetName('');
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignored
    }
  };

  // Stack Refresh handler (amber button)
  const handleRefreshStack = () => {
    triggerHaptic('heavy');
    audioEngine.initAudioContext();
    audioEngine.updateDspParams({
      outputEqIdx: outputEqIndex,
      sourceEqIdx: sourceEqIndex,
      humFilterIdx: humFilterIndex,
      ambienceIdx: ambienceIndex,
      ambienceIntensity: ambienceIntensity,
      crossfeedIdx: crossfeedIndex,
      crossfeedIntensity: crossfeedIntensity,
    });
    audioEngine.setHeadphoneProfile(selectedHeadphoneProfile);
    audioEngine.setDspBypass(dspBypassed);
    audioEngine.setTubeWarmth(tubeWarmthEnabled);
  };

  // Track Bookmark handler (REP button):
  // pins the current track as the START track for the next app launch.
  const handleRepTrack = () => {
    if (playlist.length > 0) {
      triggerHaptic('heavy');
      const track = playlist[currentIndex];
      try {
        localStorage.setItem(REP_PIN_STORAGE_KEY, track.id);
        localStorage.setItem(LAST_TRACK_STORAGE_KEY, track.id);
      } catch {
        // Ignored
      }
      setRepPinId(track.id);
      setRepJustSet(true);
      if (repFlashTimerRef.current !== null) window.clearTimeout(repFlashTimerRef.current);
      repFlashTimerRef.current = window.setTimeout(() => setRepJustSet(false), 1600);
    }
  };

  const currentTrack = rendererTrack || playlist[currentIndex];
  const isPlayingActive = (isFileActive && !isPaused);

  // In-place curve display condition (when hovering model name or settings drawer is open)
  const isCalibratingOrOperating = isHoveringHeadphone || showHeadphoneDrawer;

  // Phase 1-②: Memoized Total EQ Curve calculation
  const totalCurveData = useMemo(() => {
    if (!showTotalCurve) return null;
    try {
      return calculateTotalCurve({
        sourceEqIdx: sourceEqIndex,
        outputEqIdx: outputEqIndex,
        humFilterIdx: humFilterIndex,
        crossfeedIdx: crossfeedIndex,
        crossfeedIntensity,
        headphoneProfile: selectedHeadphoneProfile,
        calibrationIntensity,
      });
    } catch (e) {
      console.warn('Total curve calc failed:', e);
      return null;
    }
  }, [
    showTotalCurve,
    sourceEqIndex,
    outputEqIndex,
    humFilterIndex,
    crossfeedIndex,
    crossfeedIntensity,
    selectedHeadphoneProfile,
    calibrationIntensity,
  ]);

  // Common chassis props
  const chassisCommonProps = {
    dspRunning,
    onRefreshStack: handleRefreshStack,
    peakLevels,
    isPlayingActive,
    currentTrack,
    showDspPanel,
    onToggleDspPanel: () => setShowDspPanel(!showDspPanel),
    isFileActive,
    isPaused,
    totalTracks: playlist.length,
    currentIndex,
    currentPresetName,
    volume,
    maxVolume,
    onPickFiles: handlePickFiles,
    onBrowseLocal: browseLocal,
    onBrowseNetwork: () => setShowUpnpModal(true),
    onQueToggle: () => setShowQueDrawer(true),
    onPrevTrack: handlePrevTrack,
    onNextTrack: handleNextTrack,
    onStopPlayback: handleStop,
    onPlayPauseToggle: handlePlayPause,
    onPresetRequest: () => setShowLoadDialog(true),
    onVolumeChange: (v: number) => setVolume(v),
    currentTime,
    duration,
    onSeek: (sec: number) => audioEngine.seek(sec),
    onRepTrack: handleRepTrack,
  repPinnedToCurrent: !!currentTrack && repPinId === currentTrack.id,
  repJustSet,
    onOpenSaveDialog: () => setShowSaveDialog(true),
    outputEqIndex,
    onOutputEqIdxChange: (i: number) => {
      setOutputEqIndex(i);
      setCurrentPresetName('');
    },
    sourceEqIndex,
    onSourceEqIdxChange: (i: number) => {
      setSourceEqIndex(i);
      setCurrentPresetName('');
    },
    humFilterIndex,
    onHumFilterIdxChange: (i: number) => {
      setHumFilterIndex(i);
      setCurrentPresetName('');
    },
    ambienceIndex,
    onAmbienceIdxChange: (i: number) => {
      setAmbienceIndex(i);
      setCurrentPresetName('');
    },
    ambienceIntensity,
    onAmbienceIntensityChange: (int: number) => {
      setAmbienceIntensity(int);
      setCurrentPresetName('');
    },
    crossfeedIndex,
    onCrossfeedIdxChange: (i: number) => {
      setCrossfeedIndex(i);
      setCurrentPresetName('');
    },
    spatialDepthIdx,
    onSpatialDepthIdxChange: (i: number) => {
      setSpatialDepthIdx(i);
      setCurrentPresetName('');
    },
    // Headphone Calibration & In-Place display props
    activeHeadphoneProfile: selectedHeadphoneProfile,
    previewHeadphoneProfile: previewHeadphoneProfile,
    onOpenHeadphoneCalibration: () => setShowHeadphoneDrawer(true),
    onHoverHeadphoneButton: (hover: boolean) => setIsHoveringHeadphone(hover),
    isCalibratingOrOperating,
    // Phase 2-⑦: Preset navigation history
    presetHistoryLength: presetHistory.length,
    historyIndex,
    canNavigatePrev: historyIndex < presetHistory.length - 1,
    canNavigateNext: historyIndex > 0,
    onSwipePreset: navigatePresetHistory,
    // Feature props
    dspBypassed,
    onToggleDspBypass: () => {
      triggerHaptic('click');
      setDspBypassed(!dspBypassed);
    },
    phaseInverted,
    onTogglePhaseInverted: () => {
      triggerHaptic('click');
      const next = !phaseInverted;
      setPhaseInverted(next);
      audioEngine.setPhaseInverted(next);
    },
    isUsbConnected,
    tubeWarmthEnabled,
    tubeType,
    tubeBias,
    onToggleTubeWarmth: () => {
      triggerHaptic('click');
      setTubeWarmthEnabled(!tubeWarmthEnabled);
    },
    onChangeTubeType: (type: 0 | 1) => {
      triggerHaptic('click');
      setTubeType(type);
    },
    onChangeTubeBias: (bias: number) => {
      setTubeBias(bias);
    },
    restorationEnabled,
    onToggleRestoration: () => {
      triggerHaptic('click');
      setRestorationEnabled(!restorationEnabled);
    },
    onOpenWiki: () => setShowWikiModal(true),
    // Phase 1-②: Total EQ Curve
    showTotalCurve,
    totalCurveData,
    activeSourceEqLabel: SOURCE_EQ_OPTIONS[sourceEqIndex] ?? 'NONE',
    activeOutputEqLabel: OUTPUT_EQ_OPTIONS[outputEqIndex] ?? 'NONE',
    activeCrossfeedLabel: CROSSFEED_OPTIONS[crossfeedIndex] ?? 'NONE',
    activeAmbienceLabel: AMBIENCE_OPTIONS[ambienceIndex] ?? 'NONE',
    activeHumFilterLabel: HUM_FILTER_OPTIONS[humFilterIndex] ?? 'NONE',
    calibrationIntensity,
    onTapArtwork: () => {
      triggerHaptic('click');
      setShowTotalCurve((prev) => !prev);
    },
  };

  return (
    <main className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center select-none font-chakra text-neutral-100 overflow-y-auto">
      {/* Main Authentic Biscène Audio Hardware Chassis */}
      <AudioChassis {...chassisCommonProps} />

      {/* Modals & Drawers */}
      <UpnpBrowserModal
        isOpen={showUpnpModal}
        onClose={() => setShowUpnpModal(false)}
        onSelectTrack={(track) => {
          setPlaylist((prev) => {
            const next = [track, ...prev.filter((t) => t.id !== track.id)];
            playlistRef.current = next;
            return next;
          });
          setCurrentIndex(0);
          setTimeout(() => playTrackAtIndex(0), 10);
          setShowUpnpModal(false);
        }}
        onPlayAll={(tracks) => {
          if (tracks.length > 0) {
            setPlaylist((prev) => {
              const next = [...tracks, ...prev];
              playlistRef.current = next;
              return next;
            });
            setCurrentIndex(0);
            setTimeout(() => playTrackAtIndex(0), 10);
            setShowUpnpModal(false);
          }
        }}
        onAddToQueue={(tracks) => {
          if (tracks.length > 0) {
            setPlaylist((prev) => {
              const next = [...prev, ...tracks];
              playlistRef.current = next;
              if (prev.length === 0) {
                setCurrentIndex(0);
                setTimeout(() => playTrackAtIndex(0), 10);
              }
              return next;
            });
            setShowUpnpModal(false);
          }
        }}
      />

      <LocalBrowserModal
        isOpen={!!safAlbum}
        folderName={safAlbum?.folderName ?? ''}
        files={safAlbum?.files ?? []}
        loading={safAlbum?.loading}
        onPlay={handleSafPlay}
        onAdd={handleSafAdd}
        onClose={() => setSafAlbum(null)}
      />

      <WikiModal
        key={`wiki-${forceRemount}`}
        isOpen={showWikiModal}
        onClose={() => setShowWikiModal(false)}
        currentTrack={currentTrack}
        wikiData={realTimeMeta}
      />

      <QueDrawer
        isOpen={showQueDrawer}
        onClose={() => setShowQueDrawer(false)}
        playlist={playlist}
        currentIndex={currentIndex}
        onPlayIndex={(idx) => {
          setCurrentIndex(idx);
          playTrackAtIndex(idx);
        }}
        onRemoveTrack={(idx) => {
          setPlaylist((prev) => {
            const next = [...prev];
            next.splice(idx, 1);
            playlistRef.current = next;
            return next;
          });
          if (idx === currentIndex) {
            handleStop();
          } else if (idx < currentIndex) {
            setCurrentIndex((prev) => prev - 1);
          }
        }}
        onClearQue={() => {
          setPlaylist([]);
          playlistRef.current = [];
          handleStop();
        }}
        onPickFiles={handleAddToQueue}
        onPickFolder={handleAddToQueue}
      />

      <PresetModals
        showSaveDialog={showSaveDialog}
        showLoadDialog={showLoadDialog}
        onCloseSaveDialog={() => setShowSaveDialog(false)}
        onCloseLoadDialog={() => setShowLoadDialog(false)}
        onSavePreset={handleSavePreset}
        onLoadPreset={handleLoadPreset}
        onClearPreset={handleClearPreset}
        onRenamePreset={handleRenamePreset}
        onDeletePreset={handleDeletePreset}
        savedPresets={savedPresets}
      />

      {/* Headphone Calibration Target Drawer */}
      <HeadphoneCalibrationDrawer
        isOpen={showHeadphoneDrawer}
        onClose={() => {
          setShowHeadphoneDrawer(false);
          setPreviewHeadphoneProfile(null);
        }}
        selectedProfileId={selectedHeadphoneProfile.id}
        onSelectProfile={(profile) => {
          triggerHaptic('click');
          setSelectedHeadphoneProfile(profile);
        }}
        onPreviewHover={(profile) => setPreviewHeadphoneProfile(profile)}
        tubeWarmthEnabled={tubeWarmthEnabled}
        onToggleTubeWarmth={() => {
          triggerHaptic('click');
          setTubeWarmthEnabled(!tubeWarmthEnabled);
        }}
        calibrationIntensity={calibrationIntensity}
        onCalibrationIntensityChange={(v) => {
          setCalibrationIntensity(Math.max(0, Math.min(1, v)));
        }}
        dspBypassed={dspBypassed}
        onToggleDspBypass={() => {
          triggerHaptic('click');
          setDspBypassed(!dspBypassed);
        }}
        // Phase 2-⑥: Target curve selector (re-calibration destination)
        targetCurveId={targetCurveId}
        onSelectTargetCurve={(id) => {
          triggerHaptic('click');
          setTargetCurveId(id);
          // Keep drawer open so user can verify the selection.
          // (User closes manually via DONE button)
        }}
      />
    </main>
  );
};
