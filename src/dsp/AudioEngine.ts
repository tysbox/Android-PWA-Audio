import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  OUTPUT_EQ_OPTIONS,
  SOURCE_EQ_OPTIONS,
  HUM_FILTER_OPTIONS,
  AMBIENCE_OPTIONS,
  CROSSFEED_OPTIONS,
  OUTPUT_EQ_PRESETS,
  SOURCE_EQ_PRESETS,
} from './presets';
import { HEADPHONE_PROFILES } from './headphoneProfiles';
import { HeadphoneProfile } from '../types';

interface DlnaPlaybackPlugin {
  play(options: { url: string; seek?: number; mode?: string; dsp?: string }): Promise<any>;
  stop(): Promise<void>;
  seek?(options: { seconds: number }): Promise<void>;
  pauseDirect?(options?: { [k: string]: unknown }): Promise<void>;
  resumeDirect?(options?: { [k: string]: unknown }): Promise<void>;
  playOpenHome?(): Promise<void>;
  next?(): Promise<void>;
  previous?(): Promise<void>;
  setNativeVolume?(options: { volume: number }): Promise<void>;
  updateDsp?(options: { dsp: string }): Promise<void>;
  status?(options?: { [k: string]: unknown }): Promise<any>;
  addListener(eventName: string, listenerFunc: (data: any) => void): Promise<any>;
}

const DlnaPlayback = registerPlugin<DlnaPlaybackPlugin>('DlnaPlayback');

/**
 * Biscene V4.5.6 - Native Bridge Engine.
 * Direct 96kHz native render path with SID-gated session events, real-time
 * signal-truth metadata, and MusicBrainz production credit delivery.
 */
export class DspAudioEngine {
  // Native session state
  private pcmSessionId = -1;
  private lastAcceptedSid = -1;
  private pcmDirectActive = false;
  private pcmDuration = 0;
  private pcmPlayedSec = 0;
  private directPeakL = 0;
  private directPeakR = 0;
  private currentUrl = '';
  private listenerAttached = false;
  private rendererActive = false;
  public onRendererTrack?: (track: any) => void;
  public onRendererState?: (data: any) => void;
  /** Fired once when the OpenHome renderer queue is exhausted. */
  public onRendererQueueCompleted?: () => void;

  // DSP state
  private activeHeadphoneProfile: HeadphoneProfile = HEADPHONE_PROFILES[0];
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

  // Public real-time signal truth (for UI / Wiki)
  public currentSourceFormat = '';
  public currentSourceRate = 0;
  public currentSourceBits = 0;
  public currentProductionCredits: any = null;

  // [V6.2 N2] LUFS loudness normalization: the measured per-track gain in dB
  // carried into the native preamp stage at update time. 0 = off/unknown.
  public loudnessNormalizationEnabled = false;
  private currentTrackLoudnessDb = 0;

  // Callbacks
  public isUsbDacConnected = false;
  public usbDacName = '';
  public onUsbDacChange?: (connected: boolean, name: string) => void;
  public onTrackEnded?: () => void;
  public onRemoteCommand?: (cmd: string) => void;
  public onMetadataUpdate?: (data: any) => void;
  public onVolumeUpdate?: (level: number) => void;

  constructor() {
    if (Capacitor.isNativePlatform()) {
      this.attachNativeListeners();
    }
  }

  private attachNativeListeners(): void {
    if (this.listenerAttached) return;
    this.listenerAttached = true;

    DlnaPlayback.addListener('playbackTime', (data: any) => {
      // STRICT SID GATING: Only accept the same or NEWER session data.
      // This prevents "ghost" threads from reverting position or causing peak jitter.
      if (typeof data.sid === 'number') {
        if (data.sid < this.lastAcceptedSid) {
          return; // Physically ignore old thread debris
        }
        this.lastAcceptedSid = data.sid;
        this.pcmSessionId = data.sid;
      }
      if (data.renderer) {
        this.rendererActive = true;
        this.pcmDirectActive = true;
        if (typeof data.sourceUrl === 'string' && data.sourceUrl) this.currentUrl = data.sourceUrl;
      }

      if (typeof data.duration === 'number' && data.duration > 0) {
        this.pcmDuration = data.duration;
      }

      // Signal truth (format / rate / bits) updates
      if (data.format && data.format !== this.currentSourceFormat) {
        this.currentSourceFormat = data.format;
        this.currentSourceRate = data.srcRate || 0;
        this.currentSourceBits = data.srcBits || 0;
        this.onMetadataUpdate?.({
          format: this.currentSourceFormat,
          srcRate: this.currentSourceRate,
          srcBits: this.currentSourceBits,
          duration: this.pcmDuration,
        });
      }

      if (typeof data.played === 'number') {
        this.pcmPlayedSec = data.played;
      }

      // VU Meter Peak Update
      if (typeof data.peakL === 'number') {
        this.directPeakL = data.peakL;
        this.directPeakR = data.peakR || 0;
      }

      // V4.5.7: credits ride along on playbackTime...
      const rideCredits = (data as any).productionCredits;
      if (rideCredits && !this.currentProductionCredits) {
        this.currentProductionCredits = rideCredits;
        this.onMetadataUpdate?.({ credits: rideCredits });
      }

      // [V6.2 N2] LUFS loudness measurement rides playbackTime exactly once
      // per track (a loudness-only event carries sid + loudnessDb and no
      // position/peak fields, so this branch is a cheap type check on every
      // 10Hz tick). setTrackLoudnessDb clamps and respects the user toggle;
      // the gain reaches the native preamp on the next DSP payload.
      if (typeof (data as any).loudnessDb === 'number') {
        this.setTrackLoudnessDb((data as any).loudnessDb);
        // Re-send the payload so the measured gain applies to the CURRENT
        // track immediately (at track start the payload already carried 0;
        // the analysis completes ~5s in, so a re-send is what makes the
        // normalization take effect this session).
        if (this.pcmDirectActive && Capacitor.isNativePlatform()) {
          DlnaPlayback.updateDsp?.({ dsp: this.buildNativeDspPayloadJson() }).catch(() => {});
        }
      }

      if (data.isEnded) {
        this.pcmDirectActive = false;
        if (data.renderer) {
          this.rendererActive = false;
          this.onRendererState?.({ state: 'ENDED', sid: data.sid });
        } else {
          try {
            this.onTrackEnded?.();
          } catch (e) {
            console.error('[EOS] advance handler failed:', e);
          }
        }
      }
    });

    DlnaPlayback.addListener('productionInfo', (data: any) => {
      // V4.5.7 diagnostics: makes SID-gate drops visible in logcat instead of
      // silently losing the credits ("Info WEB 表示ゼロ").
      console.log('[Wiki] productionInfo sid=' + data.sid + ' active=' + this.pcmSessionId
        + ' keys=' + Object.keys(data.credits || {}).length);
      if (data.renderer) {
        if (typeof data.sid === 'number' && data.sid < this.lastAcceptedSid) return;
        this.lastAcceptedSid = typeof data.sid === 'number' ? data.sid : this.lastAcceptedSid;
        this.pcmSessionId = this.lastAcceptedSid;
        this.rendererActive = true;
        this.pcmDirectActive = true;
        if (typeof data.sourceUrl === 'string' && data.sourceUrl) this.currentUrl = data.sourceUrl;
        this.currentProductionCredits = data.credits;
        this.onRendererTrack?.({
          id: `renderer-${data.sid}`,
          url: data.sourceUrl || this.currentUrl,
          title: data.title || '',
          artist: data.artist || '',
          album: data.album || '',
          albumArtUrl: data.albumArtUrl || '',
          duration: typeof data.duration === 'number' ? data.duration : this.pcmDuration,
          format: data.format || '',
          sampleRate: data.srcRate || 0,
          bitDepth: data.srcBits || 0,
          renderer: true,
        });
        this.onMetadataUpdate?.({
          renderer: true,
          sid: data.sid,
          artist: data.artist || '',
          title: data.title || '',
          album: data.album || '',
          albumArtUrl: data.albumArtUrl || '',
          sourceUrl: data.sourceUrl || this.currentUrl,
          duration: typeof data.duration === 'number' ? data.duration : this.pcmDuration,
          credits: data.credits,
        });
        return;
      }
      if (data.sid === this.pcmSessionId) {
        this.currentProductionCredits = data.credits;
        // V4.5.6 FIX: emit under `credits` so the UI merge lands at wikiData.credits
        this.onMetadataUpdate?.({ credits: data.credits });
      }
      // V6.4: signal truth rides productionInfo for BOTH paths now (the native
      // side puts format/srcRate/srcBits outside the renderer branch). Local
      // playback previously never received them — Native Resolution stayed
      // "Detecting..." forever. Purely additive; the credits block above is
      // unchanged, and the renderer branch keeps its own richer handling.
      if (!data.renderer && data.sid === this.pcmSessionId
          && (data.format || data.srcRate || data.srcBits)) {
        this.currentSourceFormat = data.format || this.currentSourceFormat;
        this.currentSourceRate = data.srcRate || this.currentSourceRate;
        this.currentSourceBits = data.srcBits || this.currentSourceBits;
        this.onMetadataUpdate?.({
          format: this.currentSourceFormat,
          srcRate: this.currentSourceRate,
          srcBits: this.currentSourceBits,
          duration: this.pcmDuration,
        });
      }
    });

    DlnaPlayback.addListener('rendererState', (data: any) => {
      if (typeof data?.sid === 'number') {
        if (data.sid < this.lastAcceptedSid) return;
        this.lastAcceptedSid = data.sid;
        this.pcmSessionId = data.sid;
        if (typeof data.sourceUrl === 'string' && data.sourceUrl) this.currentUrl = data.sourceUrl;
      }
      const state = String(data?.state || 'STOPPED');
      const active = state === 'PLAYING' || state === 'PAUSED' || state === 'PREPARING' || state === 'STALLED';
      this.rendererActive = active;
      if (active) this.pcmDirectActive = true;
      if (!active && this.pcmSessionId === data?.sid) this.pcmDirectActive = false;
      this.onRendererState?.({ ...data, state, active });
    });

    DlnaPlayback.addListener('rendererQueueCompleted', () => {
      this.rendererActive = false;
      try {
        this.onRendererQueueCompleted?.();
      } catch (e) {
        console.error('[renderer] queue completion handler failed:', e);
      }
    });

    DlnaPlayback.addListener('remoteCommand', (data: any) => {
      console.log('[Remote] cmd=' + data.command);
      if (data.command) {
        // RESET session ID before executing seek/skip to ensure we adopt the NEW player's SID
        if (data.command === 'next' || data.command === 'previous' || data.command.startsWith('seek:')) {
           this.pcmSessionId = -1;
           this.directPeakL = 0;
           this.directPeakR = 0;
        }
        this.onRemoteCommand?.(data.command);
      }
    });

    DlnaPlayback.addListener('volumeUpdate', (data: any) => {
      if (typeof data.volume === 'number') {
        const level = Math.round(Math.sqrt(data.volume) * this.maxVolume);
        this.volumeLevel = Math.max(0, Math.min(this.maxVolume, level));
        this.onVolumeUpdate?.(this.volumeLevel);
      }
    });

    DlnaPlayback.addListener('usbDacChange', (data: any) => {
      this.isUsbDacConnected = !!data?.connected;
      this.usbDacName = data?.name || '';
      this.onUsbDacChange?.(this.isUsbDacConnected, this.usbDacName);
    });

    if (typeof (DlnaPlayback as any).getUsbDacStatus === 'function') {
      (DlnaPlayback as any).getUsbDacStatus().then((res: any) => {
        if (res) {
          this.isUsbDacConnected = !!res.connected;
          this.usbDacName = res.name || '';
          this.onUsbDacChange?.(this.isUsbDacConnected, this.usbDacName);
        }
      }).catch(() => {});
    }
  }

  /** V4.5.6: on-demand encyclopedia fetch (retry path for the INFO modal).
   *  V6.5.2: carries the album tag so the native album×artist resolution can
   *  anchor on the file's own album (without it the probe degrades to
   *  track-name-only matching and lands on a wrong same-title album). */
  public async fetchWiki(artist: string, title: string, album?: string): Promise<any> {
    if (!Capacitor.isNativePlatform()) return null;
    try {
      const resp: any = await (DlnaPlayback as any).fetchWiki({ artist, title, album: album || '' });
      return resp?.credits || null;
    } catch {
      return null;
    }
  }

  public async initAudioContext(): Promise<void> {
    // Native direct render path manages its own output; no Web Audio context needed.
  }

  public async playTrack(rawUrl: string): Promise<void> {
    if (!Capacitor.isNativePlatform() || !rawUrl) return;

    let url = rawUrl.trim();
    if (!url.startsWith('blob:')) {
      url = url.replace(/[^\x21-\x7E]/g, (char) => encodeURIComponent(char));
    }
    this.currentUrl = url;
    this.rendererActive = false;
    this.pcmSessionId = -1; // re-adopt the fresh session
    this.pcmPlayedSec = 0;
    this.pcmDuration = 0;
    this.pcmDirectActive = true;
    this.currentProductionCredits = null;
    this.currentSourceFormat = '';
    this.currentSourceRate = 0;
    this.currentSourceBits = 0;

    const resp = await DlnaPlayback.play({
      url,
      mode: 'direct',
      dsp: this.buildNativeDspPayloadJson(),
    });

    if (resp && typeof resp.sid === 'number') this.pcmSessionId = resp.sid;
    if (resp && typeof resp.duration === 'number' && resp.duration > 0) {
      this.pcmDuration = resp.duration;
    }
    if (resp && resp.format) {
      this.currentSourceFormat = resp.format;
      this.currentSourceRate = resp.srcRate || 0;
      this.currentSourceBits = resp.srcBits || 0;
    }
    this.onMetadataUpdate?.({
      format: this.currentSourceFormat,
      srcRate: this.currentSourceRate,
      srcBits: this.currentSourceBits,
      duration: this.pcmDuration,
      credits: null, // V4.5.7: clear stale credits from the previous track (8aa78f0 semantics)
    });
  }

  public stopAllPlayback(): void {
    this.pcmDirectActive = false;
    this.rendererActive = false;
    this.pcmSessionId = -1;
    this.pcmPlayedSec = 0;
    if (Capacitor.isNativePlatform()) {
      DlnaPlayback.stop().catch(() => {});
    }
  }

  public play(): void {
    if (this.pcmDirectActive) {
      DlnaPlayback.resumeDirect?.();
    }
  }

  public playOpenHome(): void {
    if (Capacitor.isNativePlatform()) {
      DlnaPlayback.playOpenHome?.().catch(() => {});
    }
  }

  public pause(): void {
    if (this.pcmDirectActive) {
      DlnaPlayback.pauseDirect?.();
    }
  }

  public next(): void {
    if (Capacitor.isNativePlatform()) {
      DlnaPlayback.next?.().catch(() => {});
    }
  }

  public previous(): void {
    if (Capacitor.isNativePlatform()) {
      DlnaPlayback.previous?.().catch(() => {});
    }
  }

  public seek(seconds: number): void {
    if (!this.pcmDirectActive || !this.currentUrl) return;
    const safeSeconds = Math.max(0, seconds);
    if (this.rendererActive && typeof DlnaPlayback.seek === 'function') {
      DlnaPlayback.seek({ seconds: safeSeconds }).catch(() => {});
      this.pcmPlayedSec = safeSeconds;
      return;
    }
    this.pcmSessionId = -1; // new session after restart-at-position
    this.pcmPlayedSec = safeSeconds;
    DlnaPlayback.play({
      url: this.currentUrl,
      seek: safeSeconds,
      mode: 'direct',
      dsp: this.buildNativeDspPayloadJson(),
    })
      .then((resp: any) => {
        if (resp && typeof resp.sid === 'number') this.pcmSessionId = resp.sid;
        if (resp && typeof resp.duration === 'number' && resp.duration > 0) {
          this.pcmDuration = resp.duration;
        }
      })
      .catch(() => {});
  }

  /** Gapless pre-queue hook (native prefetch; harmless if unsupported). */
  public queueNextTrack(_url: string): void {
    if (this.pcmDirectActive && typeof (DlnaPlayback as any).prepareNext === 'function') {
      (DlnaPlayback as any)
        .prepareNext({ url: _url, mode: 'direct', dsp: this.buildNativeDspPayloadJson() })
        .catch(() => {
          // V4.6: prepareNext is a reserved gapless hook — not implemented on
          // android yet. Swallow the "not implemented" rejection (it fired an
          // uncaught promise error on every track advance).
        });
    }
  }

  public clearNextTrack(): void {
    // Reserved for native gapless prefetch
  }

  public updateDspParams(params: {
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
    if (params.ambienceIntensity !== undefined) this.currentAmbienceIntensity = params.ambienceIntensity;
    if (params.crossfeedIdx !== undefined) this.currentCrossfeedIdx = params.crossfeedIdx;
    if (params.spatialDepth !== undefined) this.spatialDepth = params.spatialDepth;
    this.dispatchNativeDsp();
  }

  public setHeadphoneProfile(profile: HeadphoneProfile): void {
    this.activeHeadphoneProfile = profile;
    this.dispatchNativeDsp();
  }

  public getActiveHeadphoneProfile(): HeadphoneProfile {
    return this.activeHeadphoneProfile;
  }

  public setDspBypass(bypass: boolean): void {
    this.isBypassed = bypass;
    this.dispatchNativeDsp();
  }

  public getDspBypassed(): boolean {
    return this.isBypassed;
  }

  public setPhaseInverted(inverted: boolean): void {
    this.phaseInverted = inverted;
    this.dispatchNativeDsp();
  }

  public getPhaseInverted(): boolean {
    return this.phaseInverted;
  }

  public setTubeWarmth(enable: boolean): void {
    this.tubeWarmthActive = enable;
    this.dispatchNativeDsp();
  }

  public setTubeParams(type: 0 | 1, bias: number): void {
    this.tubeType = type;
    this.tubeBias = bias;
    this.dispatchNativeDsp();
  }

  public setRestorationEnabled(enabled: boolean): void {
    this.restorationEnabled = enabled;
    this.dispatchNativeDsp();
  }

  public setSpatialDepth(depth: string): void {
    this.spatialDepth = depth;
    this.dispatchNativeDsp();
  }

  public setCalibrationIntensity(v: number): void {
    this.calibrationIntensity = Math.max(0, Math.min(1, v));
    this.dispatchNativeDsp();
  }

  public setVolume(level: number): void {
    this.volumeLevel = Math.max(0, Math.min(this.maxVolume, level));
    if (!Capacitor.isNativePlatform()) return;
    if (typeof (DlnaPlayback as any).setNativeVolume === 'function') {
      (DlnaPlayback as any).setNativeVolume({ volume: Math.pow(this.volumeLevel / this.maxVolume, 2.0) });
    }
  }

  private dispatchNativeDsp(): void {
    if (!Capacitor.isNativePlatform()) return;
    if (typeof (DlnaPlayback as any).updateDsp !== 'function') return;
    try {
      (DlnaPlayback as any).updateDsp({ dsp: this.buildNativeDspPayloadJson() });
    } catch (e) {
      console.warn('Native DSP live update failed:', e);
    }
  }

  private buildNativeDspPayloadJson(): string {
    if (this.isBypassed) {
      // PHASE 3: explicit bypass flag lets the native layer switch the USB
      // DAC to bit-perfect output (source rate, no DSP, no resampler).
      return JSON.stringify({ bypass: true, phaseInverted: this.phaseInverted, preampDb: 0, bands: [], srcEqBands: [], outEqBands: [], humFilter: 'NONE', crossfeed: null, ambience: null });
    }
    const prof = this.activeHeadphoneProfile;
    const cfLabel = CROSSFEED_OPTIONS[this.currentCrossfeedIdx] || 'OFF';
    const angle = parseInt(cfLabel) || 0;

    const ambId = AMBIENCE_OPTIONS[this.currentAmbienceIdx] || 'OFF';
    const srcId = SOURCE_EQ_OPTIONS[this.currentSourceEqIdx] || 'OFF';
    const outId = OUTPUT_EQ_OPTIONS[this.currentOutputEqIdx] || 'OFF';
    const humId = HUM_FILTER_OPTIONS[this.currentHumFilterIdx] || 'OFF';

    const dspPayload = {
      bypass: false,
      phaseInverted: this.phaseInverted,
      // [V6.2 N2] LUFS loudness normalization: the prewarm thread measures the
      // next track's level (LoudnessAnalyzer) and this field carries the
      // ReplayGain-style track gain. The native side adds it to the preamp
      // stage at update time; 0 when the track gain is unknown or the user
      // has loudness normalization off.
      loudnessDb: this.currentTrackLoudnessDb,
      preampDb: prof?.preampGainDb ?? 0,
      bands: (prof?.bands ?? []).map((b) => ({
        type: b.type, freq: b.freq, gain: b.gain * this.calibrationIntensity, q: b.q,
      })),
      srcEqBands: SOURCE_EQ_PRESETS[srcId] ?? [],
      outEqBands: OUTPUT_EQ_PRESETS[outId] ?? [],
      humFilter: humId,
      // [V6.2 N1] NIGHT: dynamic night-mode compressor enabled only when the
      // Output EQ dial is on NIGHT. bypass:true path never reaches here, so
      // bit-perfect purity is preserved by construction.
      night: outId === 'NIGHT',
      crossfeed: (cfLabel !== 'OFF' || this.spatialDepth !== 'OFF') ? {
        directGainDb: 0.0,
        crossGainDb: -40.0,
        angle: angle,
        depth: this.spatialDepth === 'OFF' ? 'NORMAL' : this.spatialDepth,
      } : null,
      ambience: ambId !== 'OFF'
        ? { ir: ambId, intensity: this.currentAmbienceIntensity }
        : null,
      tube: this.tubeWarmthActive,
      tube_v4: {
        enabled: this.tubeWarmthActive,
        type: this.tubeType === 0 ? '300B' : 'KT88',
        bias: this.tubeBias / 100.0,
      },
      restoration: this.restorationEnabled,
      calibScale: this.calibrationIntensity,
    };
    return JSON.stringify(dspPayload);
  }

  /**
   * [V6.2 N2] Sets the measured per-track loudness gain (dB) from the
   * prewarm thread's LoudnessAnalyzer result. Respects the user toggle:
   * normalization off → gain 0 (payload sends loudnessDb: 0). The gain is
   * added to the preamp stage at update time on the native side (never per
   * audio block). Callers re-send the DSP payload after this when playback
   * is live; at track start the payload already carries it.
   */
  public setTrackLoudnessDb(gainDb: number): void {
    const safe = Number.isFinite(gainDb)
      ? Math.max(-12, Math.min(12, gainDb))
      : 0;
    this.currentTrackLoudnessDb = this.loudnessNormalizationEnabled ? safe : 0;
  }

  /** @return the current track gain being applied (dB, for UI display). */
  public getTrackLoudnessDb(): number {
    return this.currentTrackLoudnessDb;
  }

  public getPeakLevels(): { left: number; right: number } {
    return { left: this.directPeakL, right: this.directPeakR };
  }

  public getCurrentTime(): number {
    return this.pcmPlayedSec;
  }

  public getDuration(): number {
    return this.pcmDuration;
  }

  public isDspRunning(): boolean {
    return this.pcmDirectActive;
  }

  public isRendererActive(): boolean {
    return this.rendererActive;
  }

  public getVolume(): number {
    return this.volumeLevel;
  }

  public getMaxVolume(): number {
    return this.maxVolume;
  }
}

// Global Singleton instance for React components
export const audioEngine = new DspAudioEngine();
