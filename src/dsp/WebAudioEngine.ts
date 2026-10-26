/**
 * Biscene PWA Web Audio Engine.
 * Complete DSP chain mirroring native C++ V6.5 G1/G2.
 * Runs entirely in AudioWorklet for real-time performance.
 */

// NOTE: DSP block processing lives in public/dsp-processor.js (AudioWorklet).
// This module only builds/sends parameters, IRs and volume to the worklet.
// The biquad/tube/spatial/ambience TS modules are the reference (non-worklet)
// implementations kept for testing and future OfflineAudioContext use.

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

// ============================================================================
// Headroom Guard (V6.5 G1)
// ============================================================================

// NOTE: The guard/makeup math runs inside the AudioWorklet at params-receipt
// time (see public/dsp-processor.js `_applyParams`). The constants below are
// kept here for reference and parity tests.

export const GUARD_CEILING_DB = 6.0;
export const EVAL_PTS = 192;
export const MAKEUP_CAP = 3.981; // +12dB

// ============================================================================
// Main WebAudioEngine Class
// ============================================================================

export class WebAudioEngine {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletReady: Promise<void>;
  private resolveWorkletReady!: () => void;

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

  // LUFS loudness normalization
  public loudnessNormalizationEnabled = false;
  private currentTrackLoudnessDb = 0;

  // Callbacks
  public onTrackEnded?: () => void;
  public onMetadataUpdate?: (data: any) => void;
  public onVolumeUpdate?: (level: number) => void;
  public onPeakUpdate?: (left: number, right: number) => void;

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
    this.workletReady = new Promise(resolve => { this.resolveWorkletReady = resolve; });
  }

  /** Initialize AudioContext and load DSP worklet */
  async initialize(): Promise<void> {
    if (this.audioContext) return;

    this.audioContext = new AudioContext({ sampleRate: 48000 }); // Prefer 48kHz
    // Load worklet module
    await this.audioContext.audioWorklet.addModule('/dsp-processor.js');
    this.resolveWorkletReady();
  }

  /** Ensure worklet is ready */
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
      bands: (prof?.bands ?? []).map(b => ({
        type: (b.type || 'peaking') as string,
        freq: b.freq,
        gain: b.gain * this.calibrationIntensity,
        q: b.q,
      })),
      srcEqBands: (SOURCE_EQ_PRESETS[srcId] ?? []).map(b => ({
        type: (b.type || 'peaking') as string,
        freq: b.freq,
        gain: b.gain,
        q: b.q,
      })),
      outEqBands: (OUTPUT_EQ_PRESETS[outId] ?? []).map(b => ({
        type: (b.type || 'peaking') as string,
        freq: b.freq,
        gain: b.gain,
        q: b.q,
      })),
      humFilter: humId,
      night: outId === 'NIGHT',
      crossfeed: (cfLabel !== 'OFF' || this.spatialDepth !== 'OFF') ? {
        angle,
        depth: this.spatialDepth === 'OFF' ? 'NORMAL' : this.spatialDepth,
      } : null,
      ambience: ambId !== 'OFF' ? {
        ir: ambId,
        intensity: this.currentAmbienceIntensity / 100, // 0-1
      } : null,
      tube: this.tubeWarmthActive ? {
        enabled: true,
        type: this.tubeType === 0 ? '300B' : 'KT88',
        bias: this.tubeBias / 100,
      } : null,
      restoration: this.restorationEnabled,
      calibScale: this.calibrationIntensity,
    };
  }

  /** Send parameter update to worklet */
  private async sendParams(): Promise<void> {
    await this.ensureReady();
    if (!this.workletNode) return;

    const payload = this.buildDspPayload();
    this.workletNode.port.postMessage({ type: 'params', payload });
  }

  // ============================================================================
  // Public API (matches DspAudioEngine)
  // ============================================================================

  async playTrack(url: string): Promise<void> {
    // In PWA, we use the existing pcm-stream-worker + pcm-processor chain
    // This would integrate with the existing streaming infrastructure
    // For now, this is a placeholder - actual playback uses existing system
    console.log('[WebAudioEngine] playTrack:', url);
  }

  stopAllPlayback(): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'stop' });
    }
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'resume' });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'pause' });
  }

  seek(seconds: number): void {
    this.workletNode?.port.postMessage({ type: 'seek', seconds });
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
    if (params.ambienceIntensity !== undefined) this.currentAmbienceIntensity = params.ambienceIntensity;
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
    // Volume is applied in worklet (master volume stage)
    this.workletNode?.port.postMessage({
      type: 'volume',
      volume: Math.pow(this.volumeLevel / this.maxVolume, 2),
    });
    this.onVolumeUpdate?.(this.volumeLevel);
  }

  // LUFS loudness normalization
  setTrackLoudnessDb(gainDb: number): void {
    const safe = Number.isFinite(gainDb) ? Math.max(-12, Math.min(12, gainDb)) : 0;
    this.currentTrackLoudnessDb = this.loudnessNormalizationEnabled ? safe : 0;
    this.sendParams();
  }

  getTrackLoudnessDb(): number {
    return this.currentTrackLoudnessDb;
  }

  getVolume(): number { return this.volumeLevel; }
  getMaxVolume(): number { return this.maxVolume; }

  /** Load IR file for ambience */
  async loadIr(irName: string): Promise<{ left: Float32Array; right: Float32Array } | null> {
    if (this.irCache.has(irName)) return this.irCache.get(irName)!;

    const url = AMBIENCE_IR_FILES[irName];
    if (!url) return null;

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);

      // Convert to Float32Array (stereo)
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.numberOfChannels > 1
        ? audioBuffer.getChannelData(1)
        : left; // Mono fallback

      // Copy to new arrays (AudioBuffer data may be reused)
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
    // Send IRs to worklet
    for (const [name, data] of this.irCache) {
      this.workletNode!.port.postMessage({
        type: 'ir',
        name,
        left: data.left,
        right: data.right,
      }, [data.left.buffer, data.right.buffer]); // Transfer ownership
    }
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

export const webAudioEngine = new WebAudioEngine();