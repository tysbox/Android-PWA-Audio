/**
 * Biscene PWA Web Audio Engine.
 * Complete DSP chain mirroring native C++ V6.5 G1/G2.
 * Runs entirely in AudioWorklet for real-time performance on PWA / Browser.
 * Includes robust fallback to direct HTMLAudioElement playback if Worklet fails.
 */

import type { HeadphoneProfile } from '../types';
import {
  OUTPUT_EQ_OPTIONS,
  SOURCE_EQ_OPTIONS,
  HUM_FILTER_OPTIONS,
  AMBIENCE_OPTIONS,
  CROSSFEED_OPTIONS,
  OUTPUT_EQ_PRESETS,
  SOURCE_EQ_PRESETS,
  AMBIENCE_IR_FILES,
} from './presets';

// ============================================================================
// DSP Parameter Structures (matching native JSON payload)
// ============================================================================

export interface DspPayload {
  bypass: boolean;
  phaseInverted: boolean;
  loudnessDb: number;
  preampDb: number;
  bands: { type: string; freq: number; gain: number; q: number }[];
  srcEqBands: { type: string; freq: number; gain: number; q: number }[];
  outEqBands: { type: string; freq: number; gain: number; q: number }[];
  humFilter: string;
  night: boolean;
  crossfeed: { angle: number; depth: string } | null;
  ambience: { ir: string; intensity: number } | null;
  tube: { enabled: boolean; type: '300B' | 'KT88'; bias: number } | null;
  restoration: boolean;
  calibScale: number;
}

export const GUARD_CEILING_DB = 6.0;
export const EVAL_PTS = 192;
export const MAKEUP_CAP = 3.981; // +12dB

// ============================================================================
// Main WebAudioEngine Class
// ============================================================================

export class WebAudioEngine {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private workletReady: Promise<void>;
  private resolveWorkletReady!: () => void;
  private rejectWorkletReady!: (reason: Error) => void;
  private initializationError: Error | null = null;
  private useFallback = false; // true = bypass worklet, direct audioElement -> destination

  // Playback state
  private isPlaying = false;
  private pcmPlayedSec = 0;
  private pcmDuration = 0;

  // DSP Parameter state (mirrors DspAudioEngine)
  private activeHeadphoneProfile: HeadphoneProfile;
  private isBypassed = false;
  private phaseInverted = false;
  private tubeWarmthActive = false;
  private tubeType: 0 | 1 = 0;
  private tubeBias = 50;
  private restorationEnabled = false;
  private spatialDepth = 'Normal';
  private calibrationIntensity = 0.5;
  private volumeLevel = 12;
  private maxVolume = 15;
  private currentSourceEqIdx = 1;
  private currentOutputEqIdx = 1;
  private currentHumFilterIdx = 0;
  private currentAmbienceIdx = 0;
  private currentAmbienceIntensity = 50;
  private currentCrossfeedIdx = 0;

  // Public properties (matching DspAudioEngine interface for App.tsx)
  public isUsbDacConnected = false;
  public usbDacName = '';
  public currentSourceFormat = 'PWA Web Audio';
  public currentSourceRate = 48000;
  public currentSourceBits = 24;
  public currentProductionCredits: any = null;
  public loudnessNormalizationEnabled = false;
  private currentTrackLoudnessDb = 0;

  // Callbacks
  public onUsbDacChange?: (connected: boolean, name: string) => void;
  public onTrackEnded?: () => void;
  public onRemoteCommand?: (cmd: string) => void;
  public onMetadataUpdate?: (data: any) => void;
  public onVolumeUpdate?: (level: number) => void;
  public onRendererTrack?: (track: any) => void;
  public onRendererState?: (data: any) => void;
  public onRendererQueueCompleted?: () => void;

  // IR cache
  private irCache: Map<string, { left: Float32Array; right: Float32Array }> = new Map();

  constructor() {
    this.activeHeadphoneProfile = {
      id: 'default',
      modelName: 'Default',
      brand: 'Standard',
      targetCurve: 'Flat',
      preampGainDb: 0,
      bands: [],
    };
    this.workletReady = new Promise((resolve, reject) => {
      this.resolveWorkletReady = resolve;
      this.rejectWorkletReady = reject;
    });
    console.log('[WebAudioEngine] Constructor done');
  }

  /** Alias for App.tsx compatibility */
  async initAudioContext(): Promise<void> {
    console.log('[WebAudioEngine] initAudioContext() called');
    await this.initialize();
  }

  /** Initialize AudioContext, AudioWorklet and HTML5 Audio pipeline */
  async initialize(): Promise<void> {
    if (this.audioContext) {
      if (this.audioContext.state === 'suspended') {
        console.log('[WebAudioEngine] Resuming existing suspended AudioContext...');
        await this.audioContext.resume();
      }
      if (this.initializationError) throw this.initializationError;
      console.log('[WebAudioEngine] Already initialized');
      return;
    }

    console.log('[WebAudioEngine] Starting initialization...');

    try {
      // 1. Create AudioContext
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 48000 });
      console.log('[WebAudioEngine] AudioContext created, sampleRate:', this.audioContext.sampleRate, 'state:', this.audioContext.state);

      // 2. Create HTML5 Audio element (but DON'T create MediaElementSource yet)
      this.audioElement = new Audio();
      this.audioElement.preload = 'metadata';
      this.audioElement.crossOrigin = 'anonymous';

      this.audioElement.addEventListener('timeupdate', () => {
        if (this.audioElement) {
          this.pcmPlayedSec = this.audioElement.currentTime;
          this.pcmDuration = this.audioElement.duration || 0;
        }
      });

      this.audioElement.addEventListener('ended', () => {
        console.log('[WebAudioEngine] AudioElement ended');
        this.isPlaying = false;
        this.onTrackEnded?.();
      });

      this.audioElement.addEventListener('error', () => {
        console.error('[WebAudioEngine] AudioElement error:', this.audioElement?.error?.message);
        this.isPlaying = false;
      });

      this.audioElement.addEventListener('waiting', () => {
        console.log('[WebAudioEngine] AudioElement waiting...');
      });

      this.audioElement.addEventListener('canplay', () => {
        console.log('[WebAudioEngine] AudioElement canplay, readyState:', this.audioElement?.readyState);
      });

      // 3. Try to load and setup AudioWorklet (with fallback)
      await this.setupWorkletWithFallback();

      console.log('[WebAudioEngine] Initialization complete, useFallback:', this.useFallback);
      this.resolveWorkletReady();

    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error('[WebAudioEngine] Initialization failed:', err);
      this.initializationError = err;
      this.rejectWorkletReady(err);
      throw err;
    }
  }

  /** Setup AudioWorklet with automatic fallback to direct playback on failure.
   *  MediaElementSource is created HERE (once) after we know which mode we're in. */
  private async setupWorkletWithFallback(): Promise<void> {
    if (!this.audioContext || !this.audioElement) return;

    try {
      console.log('[WebAudioEngine] Loading worklet module /dsp-processor.js...');
      await this.audioContext.audioWorklet.addModule('/dsp-processor.js');
      console.log('[WebAudioEngine] Worklet module loaded successfully');

      this.workletNode = new AudioWorkletNode(this.audioContext, 'dsp-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      console.log('[WebAudioEngine] AudioWorkletNode created');

      // NOW create MediaElementSource and connect (Worklet mode)
      this.mediaSourceNode = this.audioContext.createMediaElementSource(this.audioElement!);
      this.mediaSourceNode.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);
      console.log('[WebAudioEngine] Audio graph connected (Worklet mode)');

      // Send initial params after a brief delay to ensure worklet port is ready
      setTimeout(() => this.sendParams(), 50);

    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.warn('[WebAudioEngine] Worklet setup failed, falling back to direct playback:', err);
      this.initializationError = err;
      this.useFallback = true;

      // Fallback: direct audioElement -> destination (no DSP)
      // Create MediaElementSource HERE (first and only time)
      if (this.audioContext && this.audioElement) {
        try {
          this.mediaSourceNode = this.audioContext.createMediaElementSource(this.audioElement);
          this.mediaSourceNode.connect(this.audioContext.destination);
          console.log('[WebAudioEngine] Fallback audio graph connected (Direct mode)');
        } catch (fallbackErr) {
          console.error('[WebAudioEngine] Even fallback connection failed:', fallbackErr);
          throw fallbackErr;
        }
      }
    }
  }

  /** Ensure worklet is ready (or fallback is active) */
  private async ensureReady(): Promise<void> {
    await this.workletReady;
  }

  /** Build DSP payload matching native format */
  private buildDspPayload(): DspPayload {
    if (this.isBypassed) {
      return {
        bypass: true,
        phaseInverted: this.phaseInverted,
        preampDb: 0,
        bands: [],
        srcEqBands: [],
        outEqBands: [],
        humFilter: 'NONE',
        night: false,
        crossfeed: null,
        ambience: null,
        tube: null,
        restoration: false,
        calibScale: this.calibrationIntensity,
        loudnessDb: 0,
      };
    }

    const prof = this.activeHeadphoneProfile;
    const cfLabel = CROSSFEED_OPTIONS[this.currentCrossfeedIdx] || 'OFF';
    const angle = parseInt(cfLabel) || 0;

    const ambId = AMBIENCE_OPTIONS[this.currentAmbienceIdx] || 'OFF';
    const srcId = SOURCE_EQ_OPTIONS[this.currentSourceEqIdx] || 'OFF';
    const outId = OUTPUT_EQ_OPTIONS[this.currentOutputEqIdx] || 'OFF';
    const humId = HUM_FILTER_OPTIONS[this.currentHumFilterIdx] || 'OFF';

    return {
      bypass: false,
      phaseInverted: this.phaseInverted,
      loudnessDb: this.currentTrackLoudnessDb,
      preampDb: prof?.preampGainDb ?? 0,
      bands: (prof?.bands ?? []).map((b) => ({
        type: (b.type || 'peaking') as string,
        freq: b.freq,
        gain: b.gain * this.calibrationIntensity,
        q: b.q,
      })),
      srcEqBands: (SOURCE_EQ_PRESETS[srcId] ?? []).map((b) => ({
        type: (b.type || 'peaking') as string,
        freq: b.freq,
        gain: b.gain,
        q: b.q,
      })),
      outEqBands: (OUTPUT_EQ_PRESETS[outId] ?? []).map((b) => ({
        type: (b.type || 'peaking') as string,
        freq: b.freq,
        gain: b.gain,
        q: b.q,
      })),
      humFilter: humId,
      night: outId === 'NIGHT',
      crossfeed:
        cfLabel !== 'OFF' || this.spatialDepth !== 'OFF'
          ? {
              angle,
              depth: this.spatialDepth === 'OFF' ? 'NORMAL' : this.spatialDepth,
            }
          : null,
      ambience:
        ambId !== 'OFF'
          ? {
              ir: ambId,
              intensity: this.currentAmbienceIntensity / 100, // 0-1
            }
          : null,
      tube: this.tubeWarmthActive
        ? {
            enabled: true,
            type: this.tubeType === 0 ? '300B' : 'KT88',
            bias: this.tubeBias / 100,
          }
        : null,
      restoration: this.restorationEnabled,
      calibScale: this.calibrationIntensity,
    };
  }

  /** Send parameter update to worklet */
  private async sendParams(): Promise<void> {
    await this.ensureReady();
    if (!this.workletNode || this.useFallback) return;

    const payload = this.buildDspPayload();
    this.workletNode.port.postMessage({ type: 'params', payload });
    console.log('[WebAudioEngine] Initial params sent to worklet');
  }

  // ============================================================================
  // Public API (matches DspAudioEngine)
  // ============================================================================

  async playTrack(url: string): Promise<void> {
    console.log('[WebAudioEngine] playTrack:', url);
    await this.initialize();
    if (this.initializationError) throw this.initializationError;
    if (!this.audioElement || !this.audioContext) {
      throw new Error('[WebAudioEngine] Audio engine not initialized');
    }

    try {
      // Handle cross-origin for blob: URLs vs HTTP(S)
      if (url.startsWith('http:') || url.startsWith('https:')) {
        this.audioElement.crossOrigin = 'anonymous';
      } else {
        this.audioElement.removeAttribute('crossorigin');
      }

      this.audioElement.src = url;
      this.pcmPlayedSec = 0;
      this.pcmDuration = 0;

      // Ensure AudioContext is running (must be in user gesture context)
      if (this.audioContext.state === 'suspended') {
        console.log('[WebAudioEngine] Resuming suspended AudioContext...');
        await this.audioContext.resume();
      }

      // Wait for metadata to load (duration) and enough data to start playback
      // For blob URLs, this should be nearly instant
      await new Promise<void>((resolve, reject) => {
        if (this.audioElement!.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && isFinite(this.audioElement!.duration)) {
          console.log('[WebAudioEngine] Already have enough data and duration:', this.audioElement!.duration);
          this.onMetadataUpdate?.({
            format: 'PWA Web Audio' + (this.useFallback ? ' (Direct)' : ' (Worklet)'),
            srcRate: this.audioContext?.sampleRate || 48000,
            srcBits: 24,
            duration: this.audioElement!.duration || 0,
          });
          resolve();
          return;
        }
        let resolved = false;
        const tryResolve = () => {
          if (resolved) return;
          if (this.audioElement!.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
            resolved = true;
            console.log('[WebAudioEngine] Ready to play, duration:', this.audioElement!.duration);
            this.onMetadataUpdate?.({
              format: 'PWA Web Audio' + (this.useFallback ? ' (Direct)' : ' (Worklet)'),
              srcRate: this.audioContext?.sampleRate || 48000,
              srcBits: 24,
              duration: this.audioElement!.duration || 0,
            });
            resolve();
          }
        };
        const onLoadedMetadata = () => {
          console.log('[WebAudioEngine] loadedmetadata fired, duration:', this.audioElement!.duration);
          this.audioElement!.removeEventListener('loadedmetadata', onLoadedMetadata);
          this.audioElement!.removeEventListener('error', onError);
          // Immediately notify App of duration so UI doesn't show LIVE
          this.onMetadataUpdate?.({
            format: 'PWA Web Audio' + (this.useFallback ? ' (Direct)' : ' (Worklet)'),
            srcRate: this.audioContext?.sampleRate || 48000,
            srcBits: 24,
            duration: this.audioElement!.duration || 0,
          });
          tryResolve();
        };
        const onCanPlay = () => {
          console.log('[WebAudioEngine] canplay fired');
          this.audioElement!.removeEventListener('canplay', onCanPlay);
          this.audioElement!.removeEventListener('error', onError);
          tryResolve();
        };
        const onError = () => {
          const msg = this.audioElement?.error?.message || 'Unknown error';
          console.error('[WebAudioEngine] AudioElement load error:', msg);
          this.audioElement!.removeEventListener('loadedmetadata', onLoadedMetadata);
          this.audioElement!.removeEventListener('canplay', onCanPlay);
          this.audioElement!.removeEventListener('error', onError);
          reject(new Error('AudioElement load error: ' + msg));
        };
        this.audioElement!.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
        this.audioElement!.addEventListener('canplay', onCanPlay, { once: true });
        this.audioElement!.addEventListener('error', onError, { once: true });
        setTimeout(() => {
          this.audioElement!.removeEventListener('loadedmetadata', onLoadedMetadata);
          this.audioElement!.removeEventListener('error', onError);
          reject(new Error('AudioElement load timeout (10s)'));
        }, 10000);
      });

      console.log('[WebAudioEngine] Starting playback...');
      await this.audioElement!.play();
      this.isPlaying = true;
      console.log('[WebAudioEngine] Playback started successfully');
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error('[WebAudioEngine] playTrack failed:', err);
      this.isPlaying = false;
      throw err;
    }
  }

  stopAllPlayback(): void {
    console.log('[WebAudioEngine] stopAllPlayback');
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    this.isPlaying = false;
    this.pcmPlayedSec = 0;
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'stop' });
    }
  }

  play(): void {
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
    if (this.audioElement) {
      this.audioElement.play().catch((e) => console.warn('[WebAudioEngine] play() failed:', e));
      this.isPlaying = true;
    }
    this.workletNode?.port.postMessage({ type: 'resume' });
  }

  pause(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.isPlaying = false;
    }
    this.workletNode?.port.postMessage({ type: 'pause' });
  }

  seek(seconds: number): void {
    const safeSec = Math.max(0, seconds);
    if (this.audioElement) {
      this.audioElement.currentTime = safeSec;
      this.pcmPlayedSec = safeSec;
    }
    this.workletNode?.port.postMessage({ type: 'seek', seconds: safeSec });
  }

  playOpenHome(): void {
    this.play();
  }

  next(): void {
    this.onRemoteCommand?.('next');
  }

  previous(): void {
    this.onRemoteCommand?.('previous');
  }

  queueNextTrack(_url: string): void {}
  clearNextTrack(): void {}

  /** PWA: Fetch MusicBrainz + Wikipedia metadata (artist bio, album notes, credits, tracklist) */
  async fetchWiki(artist: string, title: string, album?: string): Promise<any> {
    console.log('[WebAudioEngine] fetchWiki called:', { artist, title, album });
    if (!artist || !title) {
      console.log('[WebAudioEngine] fetchWiki: missing artist or title');
      return null;
    }

    try {
      // 1. Search MusicBrainz for recording
      console.log('[WebAudioEngine] fetchWiki: searching MusicBrainz recording...');
      const recording = await this.searchMusicBrainzRecording(artist, title, album);
      console.log('[WebAudioEngine] fetchWiki: recording result:', recording ? 'FOUND' : 'NOT FOUND');
      if (!recording) return null;

      const releaseId = recording.releases?.[0]?.id;
      const artistId = recording['artist-credit']?.[0]?.artist?.id;
      console.log('[WebAudioEngine] fetchWiki: releaseId=', releaseId, 'artistId=', artistId);

      // 2. Fetch parallel data
      console.log('[WebAudioEngine] fetchWiki: fetching parallel data...');
      const [
        releaseInfo,
        artistInfo,
        wikiSummary,
        wikiTracklist
      ] = await Promise.all([
        releaseId ? this.fetchMusicBrainzRelease(releaseId) : Promise.resolve(null),
        artistId ? this.fetchMusicBrainzArtist(artistId) : Promise.resolve(null),
        this.fetchWikipediaSummary(artist, album || '', title),
        releaseId ? this.fetchWikipediaTracklist(artist, album || '') : Promise.resolve(null)
      ]);
      console.log('[WebAudioEngine] fetchWiki: parallel results:', { releaseInfo: !!releaseInfo, artistInfo: !!artistInfo, wikiSummary: !!wikiSummary, wikiTracklist: !!wikiTracklist });

      // 3. Build credits object — MUST match native Android format exactly.
      // Native returns the credits object DIRECTLY (resp.credits), and
      // WikiModal reads flat keys: producers/engineers/composers/performers
      // (plural, lowercase), artistName/artistBio, wikiSummary, etc.
      const credits: any = {};

      // Identity from MusicBrainz (recording-level)
      if (recording.title) credits.trackTitle = recording.title;
      if (recording['artist-credit']?.[0]?.artist?.name) {
        credits.artistName = recording['artist-credit'][0].artist.name;
      }
      if (recording.length) credits.trackLengthMs = recording.length;

      // Wiki data
      if (wikiSummary) credits.wikiSummary = wikiSummary;
      if (artistInfo) {
        // MusicBrainz artist detail: use 'disambiguation', biography comes from Wikipedia
        if (artistInfo.disambiguation) credits.artistDisambiguation = artistInfo.disambiguation;
        const artistWikiBio = await this.fetchWikipediaSummary(
          recording['artist-credit']?.[0]?.artist?.name || artist, '', ''
        );
        if (artistWikiBio) credits.artistBio = artistWikiBio;
        if (artistInfo.country) credits.artistCountry = artistInfo.country;
        if (artistInfo['life-span']?.begin) credits.lifeDates = artistInfo['life-span'].begin;
        if (artistInfo['life-span']?.end) credits.lifeDates += (credits.lifeDates ? ' – ' : '') + artistInfo['life-span'].end;
        if (artistInfo.officialSite) credits.officialSite = artistInfo.officialSite;
      }

      // Release-level facts
      if (releaseInfo) {
        if (releaseInfo.title) credits.albumTitle = releaseInfo.title;
        if (releaseInfo.date) {
          credits.releaseDate = releaseInfo.date;
          credits.firstReleaseYear = releaseInfo.date.substring(0, 4);
        }
        if (releaseInfo.country) credits.releaseCountry = releaseInfo.country;
        if (releaseInfo.status) credits.releaseMedium = releaseInfo.status;
        if (releaseInfo['label-info']?.[0]?.label?.name) {
          credits.label = releaseInfo['label-info'][0].label.name;
        }
        if (releaseInfo['catalog-number'] || releaseInfo['label-info']?.[0]?.['catalog-number']) {
          credits.catalogNumber = releaseInfo['label-info']?.[0]?.['catalog-number'] || '';
        }
        if (releaseInfo.media?.[0]?.format) credits.releaseMedium = releaseInfo.media[0].format;
        if (releaseInfo.disambiguation) credits.albumDisambiguation = releaseInfo.disambiguation;
      }

      // Tracklist from release media
      const releaseTracks: string[] = [];
      if (releaseInfo?.media) {
        for (const medium of releaseInfo.media) {
          for (const track of medium.tracks || []) {
            const t = track.title || '';
            if (t) releaseTracks.push(`${track.position || ''} ${t}`.trim());
          }
        }
      }
      if (releaseTracks.length > 0) credits.tracklist = releaseTracks.join(', ');

      // Production credits from MusicBrainz relationships — native key format:
      // producers / engineers / performers (with role in parens) / composers
      if (releaseInfo?.relations) {
        this.parseRelationsNative(releaseInfo.relations, credits);
      }
      if (recording.relations) {
        this.parseRelationsNative(recording.relations, credits);
      }

      console.log('[WebAudioEngine] fetchWiki: final credits keys:', Object.keys(credits));
      return credits;
    } catch (e) {
      console.error('[WebAudioEngine] fetchWiki error:', e);
      return null;
    }
  }

  /** Shared User-Agent — Wikipedia/MusicBrainz may reject empty/none. */
  private static readonly UA = 'BiscenePWA/1.0 (https://github.com/tysbox/Android-PWA-Audio)';

  /** Search MusicBrainz for a recording (with artist-credit so artistName is available) */
  private async searchMusicBrainzRecording(artist: string, title: string, album?: string): Promise<any> {
    try {
      // Clean up title: remove track number prefix (e.g., "01. ", "02. ")
      const cleanTitle = title.replace(/^\d+[.\s]+/, '').trim();

      // Skip fallback values that won't match anything in MusicBrainz
      const fallbackArtist = artist === 'ローカルファイル' || artist === 'Local File' || !artist.trim();
      const fallbackAlbum = album === 'PWA ライブラリ' || album === 'PWA Library' || album === 'PWA キュー' || album === 'PWA Queue' || !album?.trim();

      const cleanArtist = fallbackArtist ? '' : artist;
      const cleanAlbum = fallbackAlbum ? '' : album;

      // Build query with only meaningful terms
      const parts = [`recording:"${cleanTitle}"`];
      if (cleanArtist) parts.push(`artist:"${cleanArtist}"`);
      if (cleanAlbum) parts.push(`release:"${cleanAlbum}"`);

      if (parts.length === 0) {
        console.log('[WebAudioEngine] searchMusicBrainzRecording: no valid search terms');
        return null;
      }

      const query = parts.join(' AND ');
      const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=1&inc=artist-credits+releases`;
      console.log('[WebAudioEngine] searchMusicBrainzRecording: URL=', url);
      const resp = await fetch(url, { headers: { 'User-Agent': WebAudioEngine.UA } });
      console.log('[WebAudioEngine] searchMusicBrainzRecording: resp.ok=', resp.ok, 'status=', resp.status);
      if (!resp.ok) return null;
      const data = await resp.json();
      console.log('[WebAudioEngine] searchMusicBrainzRecording: recordings count=', data.recordings?.length || 0);
      return data.recordings?.[0] || null;
    } catch (e) {
      console.error('[WebAudioEngine] searchMusicBrainzRecording error:', e);
      return null;
    }
  }

  /** Fetch MusicBrainz release info — VALID inc params only (annotations is NOT valid for release) */
  private async fetchMusicBrainzRelease(releaseId: string): Promise<any> {
    try {
      const url = `https://musicbrainz.org/ws/2/release/${releaseId}?fmt=json&inc=labels+media+artist-credits+recordings+artist-rels+url-rels`;
      console.log('[WebAudioEngine] fetchMusicBrainzRelease: URL=', url);
      const resp = await fetch(url, { headers: { 'User-Agent': WebAudioEngine.UA } });
      console.log('[WebAudioEngine] fetchMusicBrainzRelease: resp.ok=', resp.ok, 'status=', resp.status);
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      console.error('[WebAudioEngine] fetchMusicBrainzRelease error:', e);
      return null;
    }
  }

  /** Fetch MusicBrainz artist info — artist-rels for lifeDates, url-rels for officialSite */
  private async fetchMusicBrainzArtist(artistId: string): Promise<any> {
    try {
      const url = `https://musicbrainz.org/ws/2/artist/${artistId}?fmt=json&inc=aliases+tags+ratings+artist-rels+url-rels`;
      console.log('[WebAudioEngine] fetchMusicBrainzArtist: URL=', url);
      const resp = await fetch(url, { headers: { 'User-Agent': WebAudioEngine.UA } });
      console.log('[WebAudioEngine] fetchMusicBrainzArtist: resp.ok=', resp.ok, 'status=', resp.status);
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      console.error('[WebAudioEngine] fetchMusicBrainzArtist error:', e);
      return null;
    }
  }

  /** Fetch Wikipedia summary (artist bio or album notes) */
  private async fetchWikipediaSummary(artist: string, album: string, _title: string): Promise<string | null> {
    try {
      let resp: Response | null = null;
      // Try album page first
      if (album) {
        const albumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(album)}_(${encodeURIComponent(artist)})`;
        console.log('[WebAudioEngine] fetchWikipediaSummary: album URL=', albumUrl);
        resp = await fetch(albumUrl);
        console.log('[WebAudioEngine] fetchWikipediaSummary: album resp.ok=', resp.ok);
        if (resp.ok) {
          const data = await resp.json();
          if (data.extract) return data.extract;
        }
      }
      // Fallback to artist page
      const artistUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artist)}`;
      console.log('[WebAudioEngine] fetchWikipediaSummary: artist URL=', artistUrl);
      resp = await fetch(artistUrl);
      console.log('[WebAudioEngine] fetchWikipediaSummary: artist resp.ok=', resp?.ok);
      if (resp?.ok) {
        const data = await resp.json();
        return data.extract || null;
      }
      return null;
    } catch (e) {
      console.error('[WebAudioEngine] fetchWikipediaSummary error:', e);
      return null;
    }
  }

  /** Fetch Wikipedia tracklist */
  private async fetchWikipediaTracklist(artist: string, album: string): Promise<string[] | null> {
    if (!album) return null;
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(album)}_(${encodeURIComponent(artist)})`;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const html = await resp.text();
      // Simple extraction of tracklist from HTML
      const trackMatches = html.match(/<td class=\"tracklist[^\"]*\">[^<]*<\/td>/gi);
      if (trackMatches) {
        return trackMatches.map(t => t.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Extract production credits — native Android MetadataParser.parseRelations format:
   *  producers / engineers / studios / performers (name (role)) / composers,
   *  comma-separated with dedup. */
  private parseRelationsNative(relations: any[], credits: Record<string, string>): void {
    for (const rel of relations || []) {
      const type = rel.type?.toLowerCase() || '';
      const name = rel.artist?.name;
      if (!type || !name) continue;

      if (type.includes('producer')) {
        this.addCredit('producers', name, credits);
      } else if (type.includes('engineer') || type.includes('mix') || type.includes('mastering')) {
        this.addCredit('engineers', name, credits);
      } else if (type.includes('studio') || type.includes('recorded at')) {
        this.addCredit('studios', name, credits);
      } else if (type.includes('performer') || type.includes('instrument') || type.includes('vocal')) {
        const attrs = rel.attributes || [];
        const role = attrs.length > 0 ? ` (${attrs[0]})` : ` (${type})`;
        this.addCredit('performers', name + role, credits);
      } else if (type.includes('writer') || type.includes('composer') || type.includes('lyricist')) {
        this.addCredit('composers', name, credits);
      }
    }
  }

  /** Add a credit with native-style dedup (name containment check). */
  private addCredit(category: string, name: string, credits: Record<string, string>): void {
    if (!name || !credits) return;
    const existing = credits[category] || '';
    const bareName = name.replace(/\s*\(.*?\)/g, '').trim().toLowerCase();
    if (existing.toLowerCase().includes(bareName)) return;
    credits[category] = existing ? existing + ', ' + name : name;
  }

  updateDspParams(params: {
    outputEqIdx?: number;
    sourceEqIdx?: number;
    humFilterIdx?: number;
    ambienceIdx?: number;
    ambienceIntensity?: number;
    crossfeedIdx?: number;
    crossfeedIntensity?: number;
    spatialDepth?: string;
  }): void {
    if (params.outputEqIdx !== undefined) this.currentOutputEqIdx = params.outputEqIdx;
    if (params.sourceEqIdx !== undefined) this.currentSourceEqIdx = params.sourceEqIdx;
    if (params.humFilterIdx !== undefined) this.currentHumFilterIdx = params.humFilterIdx;
    if (params.ambienceIdx !== undefined) this.currentAmbienceIdx = params.ambienceIdx;
    if (params.ambienceIntensity !== undefined)
      this.currentAmbienceIntensity = params.ambienceIntensity;
    if (params.crossfeedIdx !== undefined) this.currentCrossfeedIdx = params.crossfeedIdx;
    if (params.spatialDepth !== undefined) this.spatialDepth = params.spatialDepth;
    this.sendParams();
  }

  setHeadphoneProfile(profile: HeadphoneProfile): void {
    this.activeHeadphoneProfile = profile;
    this.sendParams();
  }

  getActiveHeadphoneProfile(): HeadphoneProfile {
    return this.activeHeadphoneProfile;
  }

  setDspBypass(bypass: boolean): void {
    this.isBypassed = bypass;
    this.sendParams();
  }

  getDspBypassed(): boolean {
    return this.isBypassed;
  }

  setPhaseInverted(inverted: boolean): void {
    this.phaseInverted = inverted;
    this.sendParams();
  }

  getPhaseInverted(): boolean {
    return this.phaseInverted;
  }

  setTubeWarmth(enable: boolean): void {
    this.tubeWarmthActive = enable;
    this.sendParams();
  }

  setTubeParams(type: 0 | 1, bias: number): void {
    this.tubeType = type;
    this.tubeBias = bias;
    this.sendParams();
  }

  setRestorationEnabled(enabled: boolean): void {
    this.restorationEnabled = enabled;
    this.sendParams();
  }

  setSpatialDepth(depth: string): void {
    this.spatialDepth = depth;
    this.sendParams();
  }

  setCalibrationIntensity(v: number): void {
    this.calibrationIntensity = Math.max(0, Math.min(1, v));
    this.sendParams();
  }

  setVolume(level: number): void {
    this.volumeLevel = Math.max(0, Math.min(this.maxVolume, level));
    const volSq = Math.pow(this.volumeLevel / this.maxVolume, 2);
    if (this.audioElement) {
      this.audioElement.volume = volSq;
    }
    this.workletNode?.port.postMessage({
      type: 'volume',
      volume: volSq,
    });
    this.onVolumeUpdate?.(this.volumeLevel);
  }

  setTrackLoudnessDb(gainDb: number): void {
    const safe = Number.isFinite(gainDb) ? Math.max(-12, Math.min(12, gainDb)) : 0;
    this.currentTrackLoudnessDb = this.loudnessNormalizationEnabled ? safe : 0;
    this.sendParams();
  }

  getTrackLoudnessDb(): number {
    return this.currentTrackLoudnessDb;
  }

  getVolume(): number {
    return this.volumeLevel;
  }

  getMaxVolume(): number {
    return this.maxVolume;
  }

  getPeakLevels(): { left: number; right: number } {
    if (!this.isPlaying) return { left: 0, right: 0 };
    const now = Date.now() / 150;
    const l = Math.abs(Math.sin(now * 1.3) * 0.7 + Math.cos(now * 2.1) * 0.2);
    const r = Math.abs(Math.cos(now * 1.5) * 0.7 + Math.sin(now * 1.9) * 0.2);
    return { left: l, right: r };
  }

  getCurrentTime(): number {
    return this.pcmPlayedSec;
  }

  getDuration(): number {
    return this.pcmDuration;
  }

  isDspRunning(): boolean {
    return this.isPlaying;
  }

  isRendererActive(): boolean {
    return false;
  }

  /** Load IR file for ambience */
  async loadIr(irName: string): Promise<{ left: Float32Array; right: Float32Array } | null> {
    if (this.irCache.has(irName)) return this.irCache.get(irName)!;

    const url = AMBIENCE_IR_FILES[irName];
    if (!url) return null;

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);

      const left = audioBuffer.getChannelData(0);
      const right =
        audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;

      const leftCopy = new Float32Array(left);
      const rightCopy = new Float32Array(right);

      this.irCache.set(irName, { left: leftCopy, right: rightCopy });
      return { left: leftCopy, right: rightCopy };
    } catch (e) {
      console.error('[WebAudioEngine] Failed to load IR:', irName, e);
      return null;
    }
  }

  /** Preload all IRs */
  async preloadIrs(): Promise<void> {
    await this.ensureReady();
    for (const irName of Object.values(AMBIENCE_IR_FILES)) {
      await this.loadIr(irName);
    }
    for (const [name, data] of this.irCache) {
      if (this.workletNode && !this.useFallback) {
        this.workletNode.port.postMessage(
          {
            type: 'ir',
            name,
            left: data.left,
            right: data.right,
          },
          [data.left.buffer, data.right.buffer]
        );
      }
    }
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

export const webAudioEngine = new WebAudioEngine();