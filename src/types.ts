export interface DspPreset {
  name: string;
  outputEqIdx: number;
  sourceEqIdx: number;
  humFilterIdx: number;
  ambienceIdx: number;
  ambienceIntensity: number;
  crossfeedIdx: number;
  crossfeedIntensity: number;
  headphoneProfileId?: string;
  tubeWarmth?: boolean;
  // V4 Additions
  tubeType?: 0 | 1; // 0: Triode, 1: Pentode
  tubeBias?: number; // 0-100
  restoration?: boolean;
  spatialWidth?: number; // 15, 30, 45, 60, 90
  spatialDepth?: string; // Intimate, Near, Normal, Far, Deep Space
  spatialDepthIdx?: number;
}

export interface BiquadFilterConfig {
  freq: number;
  q: number;
  gain: number;
  type?: BiquadFilterType;
}

export interface HeadphoneProfile {
  id: string;
  modelName: string;
  brand: string;
  targetCurve: string;
  preampGainDb: number;
  bands: { freq: number; gain: number; q: number; type?: 'peaking' | 'lowshelf' | 'highshelf' }[];
}

export interface TrackItem {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  url: string;
  albumArtUrl?: string;
  isLocal?: boolean;
  genre?: string;
  sampleRate?: number;
  bitDepth?: number;
  format?: string;
  contentUri?: string; // content:// URI for native album art extraction
}

export interface UpnpDevice {
  id: string;
  name: string;
  address: string;
  type: string;
  icon?: string;
}

export interface UpnpItem {
  id: string;
  title: string;
  isContainer: boolean;
  uri?: string;
  artist?: string;
  album?: string;
}

export type PlaybackSource = 'none' | 'file' | 'tone' | 'capture' | 'network';

export type HapticType = 'tick' | 'click' | 'heavy';
