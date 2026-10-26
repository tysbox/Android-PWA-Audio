import { HeadphoneProfile } from '../types';
import { calculateProfileResponseCurve } from './headphoneProfiles';
import { OUTPUT_EQ_PRESETS, SOURCE_EQ_PRESETS } from './presets';

/**
 * Phase 1-②: Total EQ Curve Calculation
 *
 * CamillaDSP-inspired "minimum intervention" UX:
 *   - Aggregates 5 DSP stages into a single combined frequency response curve
 *   - Used by AlbumArtFrame Total Mode to visualize total coloration
 *   - Returns maxAbsDb for over-correction warning (±3 dB threshold)
 */

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const NUM_STEPS = 42;

export interface TotalCurveOptions {
  sourceEqIdx: number;
  outputEqIdx: number;
  humFilterIdx: number;
  crossfeedIdx: number;
  crossfeedIntensity: number;
  headphoneProfile?: HeadphoneProfile | null;
  calibrationIntensity?: number; // 0..1
}

export interface TotalCurvePoint {
  x: number;
  y: number;
  freq: number;
  db: number;
}

export interface TotalCurveResult {
  path: string;
  points: TotalCurvePoint[];
  maxAbsDb: number;
}

interface BandConfig {
  freq: number;
  gain: number;
  q: number;
  type: string;
}

function bandResponseAt(freq: number, band: BandConfig): number {
  const octDiff = Math.log2(freq / band.freq);
  if (band.type === 'lowshelf') {
    return band.gain / (1 + Math.exp(octDiff * 3));
  } else if (band.type === 'highshelf') {
    return band.gain / (1 + Math.exp(-octDiff * 3));
  }
  const bandwidth = 1.0 / (band.q || 1.0);
  return band.gain * Math.exp(-0.5 * Math.pow(octDiff / (bandwidth * 0.5), 2));
}

function eqPresetDbAt(freq: number, bands: BandConfig[] | undefined): number {
  if (!bands || bands.length === 0) return 0;
  let total = 0;
  for (const band of bands) {
    total += bandResponseAt(freq, band);
  }
  return total;
}

/**
 * Approximate crossfeed as a 1st-order HPF gain curve (20-200Hz range).
 * directGainDb is applied as the low-frequency attenuation floor.
 */
function crossfeedDbAt(freq: number, idx: number, intensity: number): number {
  if (idx === 0) return 0; // NONE
  // Direct gain approximation for V4 native spatial
  const lowGain = -1.5 * (intensity / 100.0);
  if (freq >= 200) return 0;
  const t = (freq - 20) / (200 - 20);
  return lowGain * (1 - t);
}

/**
 * Hum Filter approximation: 1st-order notch at 50Hz or 60Hz (±5Hz width).
 */
function humFilterDbAt(freq: number, idx: number): number {
  // idx: 0=NONE, 1=50Hz, 2=60Hz
  if (idx === 1) {
    // 50Hz notch, -6dB at center
    const octDiff = Math.log2(freq / 50);
    return -6 * Math.exp(-0.5 * Math.pow(octDiff / 0.1, 2));
  }
  if (idx === 2) {
    const octDiff = Math.log2(freq / 60);
    return -6 * Math.exp(-0.5 * Math.pow(octDiff / 0.1, 2));
  }
  return 0;
}

const WIDTH = 300;
const HEIGHT = 70;
const MIN_DB = -15;
const MAX_DB = 15;

function pointToSvg(p: TotalCurvePoint): { x: number; y: number } {
  const clampedDb = Math.max(MIN_DB, Math.min(MAX_DB, p.db));
  const x = (Math.log2(p.freq / MIN_FREQ) / Math.log2(MAX_FREQ / MIN_FREQ)) * (WIDTH - 16) + 8;
  const y = HEIGHT - 12 - ((clampedDb - MIN_DB) / (MAX_DB - MIN_DB)) * (HEIGHT - 24);
  return { x, y };
}

export function calculateTotalCurve(opts: TotalCurveOptions): TotalCurveResult | null {
  try {
    const sourceBands = SOURCE_EQ_PRESETS[
      ['NONE', 'JAZZ', 'CLASSICAL', 'ELECTRONIC', 'VOCAL'][opts.sourceEqIdx] || 'NONE'
    ];
    const outputBands = OUTPUT_EQ_PRESETS[
      ['NONE', 'STUDIO', 'JBL', 'PLANAR', 'LOUD', 'CRYSTAL', 'NIGHT'][opts.outputEqIdx] || 'NONE'
    ];

    const points: TotalCurvePoint[] = [];
    let maxAbsDb = 0;

    for (let i = 0; i <= NUM_STEPS; i++) {
      const t = i / NUM_STEPS;
      const freq = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, t);

      let db = 0;
      db += eqPresetDbAt(freq, sourceBands as any);
      db += eqPresetDbAt(freq, outputBands as any);
      db += crossfeedDbAt(freq, opts.crossfeedIdx, opts.crossfeedIntensity);
      db += humFilterDbAt(freq, opts.humFilterIdx);

      // Headphone via existing utility, then scale by calibrationIntensity
      if (opts.headphoneProfile && opts.headphoneProfile.bands.length > 0) {
        const hpCurve = calculateProfileResponseCurve(opts.headphoneProfile, WIDTH, HEIGHT);
        const hpPoint = hpCurve.points[i];
        if (hpPoint) {
          db += hpPoint.db * (opts.calibrationIntensity ?? 1);
        }
      }

      const svg = pointToSvg({ x: 0, y: 0, freq, db });
      points.push({ x: svg.x, y: svg.y, freq, db });
      maxAbsDb = Math.max(maxAbsDb, Math.abs(db));
    }

    // Build SVG path
    let path = '';
    points.forEach((p, idx) => {
      if (idx === 0) {
        path += `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      } else {
        path += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      }
    });

    return { path, points, maxAbsDb };
  } catch (e) {
    console.warn('calculateTotalCurve failed:', e);
    return null;
  }
}