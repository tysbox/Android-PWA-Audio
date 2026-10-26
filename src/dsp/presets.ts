import { BiquadFilterConfig } from '../types';

export const OUTPUT_EQ_OPTIONS = [
  'OFF',
  'STUDIO',
  'JBL',
  'PLANAR',
  'LOUD',
  'CRYSTAL',
  'NIGHT',
] as const;

export const SOURCE_EQ_OPTIONS = [
  'OFF',
  'JAZZ',
  'CLASSICAL',
  'ELECTRONIC',
  'VOCAL',
] as const;

export const HUM_FILTER_OPTIONS = [
  'OFF',
  '50HZ',
  '60HZ',
] as const;

export const AMBIENCE_OPTIONS = [
  'OFF',
  'HALL',
  'JAZZ CLUB',
  'LARGE HALL',
  'CHURCH',
] as const;

export const CROSSFEED_OPTIONS = [
  'OFF',
  '15°',
  '30°',
  '45°',
  '60°',
  '90°',
] as const;

export const SPATIAL_DEPTH_OPTIONS = [
  'OFF',
  'INTIMATE',
  'NEAR',
  'NORMAL',
  'FAR',
  'DEEP',
] as const;

export const OUTPUT_EQ_PRESETS: Record<string, BiquadFilterConfig[]> = {
  OFF: [],
  STUDIO: [
    { freq: 80, q: 0.8, gain: 3.0, type: 'peaking' },
    { freq: 2500, q: 1.0, gain: -0.8, type: 'peaking' },
    { freq: 20000, q: 1.0, gain: 3.0, type: 'peaking' },
  ],
  JBL: [
    { freq: 70, q: 0.7, gain: 3.0, type: 'peaking' },
    { freq: 1200, q: 1.0, gain: -2.0, type: 'peaking' },
    { freq: 13000, q: 0.8, gain: 5.0, type: 'peaking' },
  ],
  PLANAR: [
    { freq: 30, q: 0.7, gain: 1.0, type: 'peaking' },
    { freq: 180, q: 0.9, gain: -1.0, type: 'peaking' },
    { freq: 15000, q: 0.8, gain: 1.0, type: 'peaking' },
  ],
  LOUD: [
    { freq: 70, q: 0.7, gain: 4.0, type: 'peaking' },
    { freq: 300, q: 1.0, gain: 1.0, type: 'peaking' },
    { freq: 8000, q: 0.7, gain: 4.0, type: 'peaking' },
    { freq: 16000, q: 0.9, gain: 2.5, type: 'peaking' },
  ],
  CRYSTAL: [
    { freq: 100, q: 1.2, gain: -2.0, type: 'peaking' },
    { freq: 8000, q: 0.7, gain: 4.0, type: 'peaking' },
    { freq: 16000, q: 0.9, gain: 2.5, type: 'peaking' },
  ],
  NIGHT: [
    // V6.2.1: gains softened after device verification - the original +5.5dB
    // bass boost clipped on bass-rich DSD sources (measured peak 0.93 pre-EQ,
    // 0.93 x 1.75 = 1.63 into the soft-clip knee = audible distortion).
    // New net boost +1.5dB keeps the night character with ~2.5dB more headroom.
    { freq: 60, q: 0.7, gain: 3.0, type: 'peaking' },
    { freq: 250, q: 1.0, gain: 1.0, type: 'peaking' },
    { freq: 2500, q: 1.2, gain: 2.0, type: 'peaking' },
    { freq: 14000, q: 0.8, gain: -4.5, type: 'peaking' },
  ],
};

export const SOURCE_EQ_PRESETS: Record<string, BiquadFilterConfig[]> = {
  OFF: [],
  JAZZ: [
    { freq: 80, q: 0.9, gain: 2.5, type: 'peaking' },
    { freq: 300, q: 1.0, gain: 1.0, type: 'peaking' },
    { freq: 7000, q: 0.8, gain: 0.7, type: 'peaking' },
  ],
  CLASSICAL: [
    { freq: 60, q: 0.7, gain: 1.0, type: 'peaking' },
    { freq: 400, q: 0.9, gain: -0.5, type: 'peaking' },
    { freq: 8000, q: 0.8, gain: 1.0, type: 'peaking' },
  ],
  ELECTRONIC: [
    { freq: 50, q: 0.8, gain: 4.0, type: 'peaking' },
    { freq: 400, q: 1.2, gain: -2.0, type: 'peaking' },
    { freq: 10000, q: 0.9, gain: 2.5, type: 'peaking' },
  ],
  VOCAL: [
    { freq: 150, q: 1.0, gain: -1.0, type: 'peaking' },
    { freq: 1000, q: 0.8, gain: 3.0, type: 'peaking' },
    { freq: 3000, q: 0.9, gain: 2.0, type: 'peaking' },
  ],
};

export interface CrossfeedConfig {
  directGainDb: number;
  crossGainDb: number;
}

export function getCrossfeedConfig(id: string, intensity: number): CrossfeedConfig | null {
  const normIntensity = Math.max(0, Math.min(100, intensity));
  const factor = normIntensity / 100.0;

  switch (id.toUpperCase()) {
    // Ranges widened +20% for more expressive control
    case 'LIGHT':
      return {
        directGainDb: 0.0 + (factor * -1.8),   // 0 .. -1.8dB
        crossGainDb: -46.8 + (factor * 31.2),  // -46.8dB up to -15.6dB
      };
    case 'NORMAL':
      return {
        directGainDb: -1.5 + (factor * -2.4),  // -1.5dB down to -3.9dB
        crossGainDb: -16.8 + (factor * 5.4),   // -16.8dB up to -11.4dB
      };
    default:
      return null;
  }
}

export const AMBIENCE_IR_FILES: Record<string, string> = {
  HALL: '/ir/hall.wav',
  'JAZZ CLUB': '/ir/jazz_club.wav',
  'LARGE HALL': '/ir/large_bottle_hall.wav',
  // st_nicolaes_church.wav IS shipped in public/ir, so CHURCH must map to it.
  // The old '/ir/hall.wav' fallback was stale and made CHURCH render the HALL
  // room. Mirrors the native mapping in DlnaPlaybackPlugin.irAssetFile().
  CHURCH: '/ir/st_nicolaes_church.wav',
};
