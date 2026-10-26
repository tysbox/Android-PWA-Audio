import { HeadphoneProfile } from '../types';

export const HEADPHONE_PROFILES: HeadphoneProfile[] = [
  {
    id: 'flat_bypass',
    modelName: 'Bypass (No Calibration)',
    brand: 'Standard',
    targetCurve: 'Flat Reference',
    preampGainDb: 0.0,
    bands: [],
  },
  {
    id: 'hifiman_deva_pro',
    modelName: 'HIFIMAN Deva Pro',
    brand: 'HIFIMAN',
    targetCurve: 'AutoEQ Harman Over-Ear',
    preampGainDb: -6.5,
    bands: [
      { freq: 105, gain: 7.3, q: 0.70, type: 'lowshelf' },
      { freq: 87, gain: -3.8, q: 0.49, type: 'peaking' },
      { freq: 7039, gain: 3.6, q: 1.30, type: 'peaking' },
      { freq: 1960, gain: 4.9, q: 2.77, type: 'peaking' },
      { freq: 1160, gain: -2.6, q: 0.94, type: 'peaking' },
      { freq: 10000, gain: 0.9, q: 0.70, type: 'highshelf' },
      { freq: 308, gain: -0.8, q: 1.53, type: 'peaking' },
      { freq: 140, gain: 0.6, q: 2.02, type: 'peaking' },
      { freq: 439, gain: 1.0, q: 4.16, type: 'peaking' },
      { freq: 5992, gain: 1.2, q: 6.00, type: 'peaking' },
    ],
  },
  {
    id: 'akg_k702',
    modelName: 'AKG K702',
    brand: 'AKG',
    targetCurve: 'AutoEQ Harman Over-Ear',
    preampGainDb: -6.1,
    bands: [
      { freq: 105, gain: 7.1, q: 0.70, type: 'lowshelf' },
      { freq: 119, gain: -2.7, q: 0.23, type: 'peaking' },
      { freq: 9459, gain: 3.2, q: 3.19, type: 'peaking' },
      { freq: 730, gain: 3.2, q: 1.22, type: 'peaking' },
      { freq: 2241, gain: -3.5, q: 3.80, type: 'peaking' },
      { freq: 10000, gain: -1.7, q: 0.70, type: 'highshelf' },
      { freq: 3721, gain: 3.4, q: 2.02, type: 'peaking' },
      { freq: 5483, gain: -4.7, q: 4.79, type: 'peaking' },
      { freq: 2633, gain: -2.0, q: 5.29, type: 'peaking' },
      { freq: 56, gain: -0.6, q: 2.62, type: 'peaking' },
    ],
  },
  {
    id: 'akg_k371',
    modelName: 'AKG K371',
    brand: 'AKG',
    targetCurve: 'AutoEQ Harman Over-Ear',
    preampGainDb: -5.6,
    bands: [
      { freq: 105, gain: -2.7, q: 0.70, type: 'lowshelf' },
      { freq: 182, gain: -2.3, q: 1.23, type: 'peaking' },
      { freq: 4038, gain: 5.0, q: 3.60, type: 'peaking' },
      { freq: 67, gain: 3.1, q: 1.41, type: 'peaking' },
      { freq: 1066, gain: -0.8, q: 2.57, type: 'peaking' },
      { freq: 10000, gain: 2.4, q: 0.70, type: 'highshelf' },
      { freq: 5564, gain: -1.6, q: 3.89, type: 'peaking' },
      { freq: 4232, gain: 0.9, q: 5.03, type: 'peaking' },
      { freq: 524, gain: 0.3, q: 1.66, type: 'peaking' },
      { freq: 2048, gain: 0.5, q: 4.67, type: 'peaking' },
    ],
  },
  {
    id: 'etymotic_er4sr',
    modelName: 'Etymotic ER4SR',
    brand: 'Etymotic',
    targetCurve: 'AutoEQ Diffuse Field',
    preampGainDb: -6.0,
    bands: [
      { freq: 105, gain: 6.0, q: 0.70, type: 'lowshelf' },
      { freq: 2470, gain: -3.7, q: 0.94, type: 'peaking' },
      { freq: 7389, gain: 6.4, q: 1.15, type: 'peaking' },
      { freq: 77, gain: 1.2, q: 2.20, type: 'peaking' },
      { freq: 1450, gain: -1.8, q: 2.27, type: 'peaking' },
      { freq: 10000, gain: 2.5, q: 0.70, type: 'highshelf' },
      { freq: 269, gain: -0.5, q: 1.17, type: 'peaking' },
      { freq: 745, gain: 0.5, q: 2.09, type: 'peaking' },
      { freq: 7552, gain: -0.8, q: 4.20, type: 'peaking' },
      { freq: 9634, gain: -1.0, q: 5.99, type: 'peaking' },
    ],
  },
  {
    id: 'soundpeats_gofree_2',
    modelName: 'SoundPeats GoFree 2',
    brand: 'SoundPeats',
    targetCurve: 'AutoEQ Open-Ear Target',
    preampGainDb: -6.5,
    bands: [
      { freq: 105, gain: 6.5, q: 0.70, type: 'lowshelf' },
      { freq: 4392, gain: -14.9, q: 1.58, type: 'peaking' },
      { freq: 9735, gain: 7.9, q: 0.24, type: 'peaking' },
      { freq: 1192, gain: 12.2, q: 0.62, type: 'peaking' },
      { freq: 2100, gain: -17.7, q: 0.97, type: 'peaking' },
      { freq: 10000, gain: -0.1, q: 0.70, type: 'highshelf' },
      { freq: 99, gain: 2.2, q: 2.72, type: 'peaking' },
      { freq: 187, gain: -1.2, q: 1.59, type: 'peaking' },
      { freq: 437, gain: 0.7, q: 1.95, type: 'peaking' },
      { freq: 860, gain: -0.5, q: 2.63, type: 'peaking' },
    ],
  },
  {
    id: 'sony_wh1000xm5',
    modelName: 'Sony WH-1000XM5',
    brand: 'Sony',
    targetCurve: 'Harman 2019 Over-Ear',
    preampGainDb: -4.2,
    bands: [
      { freq: 31, gain: -2.5, q: 0.7, type: 'peaking' },
      { freq: 62, gain: -1.8, q: 1.2, type: 'peaking' },
      { freq: 125, gain: -3.2, q: 1.4, type: 'peaking' },
      { freq: 250, gain: 0.5, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 1.8, q: 1.6, type: 'peaking' },
      { freq: 2500, gain: 3.5, q: 2.0, type: 'peaking' },
      { freq: 5000, gain: -2.0, q: 2.5, type: 'peaking' },
      { freq: 8000, gain: 4.0, q: 1.8, type: 'peaking' },
      { freq: 12000, gain: -1.5, q: 1.0, type: 'peaking' },
    ],
  },
  {
    id: 'audio_technica_m50x',
    modelName: 'Audio-Technica ATH-M50x',
    brand: 'Audio-Technica',
    targetCurve: 'Harman 2019 Over-Ear',
    preampGainDb: -4.5,
    bands: [
      { freq: 80, gain: -3.5, q: 1.2, type: 'peaking' },
      { freq: 250, gain: -2.5, q: 1.5, type: 'peaking' },
      { freq: 1500, gain: 2.0, q: 1.8, type: 'peaking' },
      { freq: 4500, gain: 4.0, q: 2.0, type: 'peaking' },
      { freq: 9000, gain: -5.0, q: 3.5, type: 'peaking' },
      { freq: 14000, gain: 2.0, q: 1.0, type: 'peaking' },
    ],
  },
  {
    id: 'sennheiser_hd650',
    modelName: 'Sennheiser HD 650 / 6XX',
    brand: 'Sennheiser',
    targetCurve: 'Harman 2019 Over-Ear',
    preampGainDb: -5.0,
    bands: [
      { freq: 25, gain: 6.5, q: 0.6, type: 'lowshelf' },
      { freq: 50, gain: 4.0, q: 1.0, type: 'peaking' },
      { freq: 100, gain: 1.5, q: 1.4, type: 'peaking' },
      { freq: 3500, gain: 2.0, q: 2.0, type: 'peaking' },
      { freq: 6000, gain: -2.5, q: 3.0, type: 'peaking' },
      { freq: 10000, gain: 1.5, q: 1.2, type: 'highshelf' },
    ],
  },
];

/**
 * Generates an SVG path string or array of points for the calibration response curve
 */
export function calculateProfileResponseCurve(profile: HeadphoneProfile, width = 120, height = 90): { path: string; points: { x: number; y: number; freq: number; db: number }[] } {
  const minFreq = 20;
  const maxFreq = 20000;
  const minDb = -15;
  const maxDb = 15;
  const numSteps = 42;

  const points: { x: number; y: number; freq: number; db: number }[] = [];

  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps;
    const freq = minFreq * Math.pow(maxFreq / minFreq, t);

    let totalDb = 0;
    if (profile.bands && profile.bands.length > 0) {
      for (const band of profile.bands) {
        const octDiff = Math.log2(freq / band.freq);
        let response = 0;

        if (band.type === 'lowshelf') {
          response = band.gain / (1 + Math.exp(octDiff * 3));
        } else if (band.type === 'highshelf') {
          response = band.gain / (1 + Math.exp(-octDiff * 3));
        } else {
          const bandwidth = 1.0 / (band.q || 1.0);
          response = band.gain * Math.exp(-0.5 * Math.pow(octDiff / (bandwidth * 0.5), 2));
        }
        totalDb += response;
      }
    }

    // Map to SVG coordinate space
    const x = (t * (width - 16)) + 8;
    const clampedDb = Math.max(minDb, Math.min(maxDb, totalDb));
    const y = height - 12 - ((clampedDb - minDb) / (maxDb - minDb)) * (height - 24);

    points.push({ x, y, freq, db: totalDb });
  }

  // Construct SVG Path
  let path = '';
  points.forEach((p, idx) => {
    if (idx === 0) {
      path += `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    } else {
      path += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }
  });

  return { path, points };
}
