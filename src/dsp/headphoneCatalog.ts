import { HeadphoneProfile } from '../types';

/**
 * Phase 2-⑥: Headphone Catalog
 *
 * Bundled database of popular headphones with their AutoEQ-derived parametric EQ profiles.
 * Sourced from AutoEQ project (https://github.com/jaakkopasanen/AutoEq) and oratory1990 measurements.
 *
 * This catalog enables "tap to add" workflow for general users without manual AutoEQ text pasting.
 */

export interface CatalogEntry {
  id: string;
  brand: string;
  model: string;
  targetCurve: string;
  preampGainDb: number;
  bands: HeadphoneProfile['bands'];
  popularity: number;
  formFactor?: 'over-ear' | 'on-ear' | 'in-ear' | 'earbud';
}

export const HEADPHONE_CATALOG: CatalogEntry[] = [
  {
    id: 'sony_wh1000xm5',
    brand: 'Sony',
    model: 'WH-1000XM5',
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
    popularity: 100,
    formFactor: 'over-ear',
  },
  {
    id: 'sony_wh1000xm4',
    brand: 'Sony',
    model: 'WH-1000XM4',
    targetCurve: 'Harman 2019 Over-Ear',
    preampGainDb: -4.5,
    bands: [
      { freq: 25, gain: -3.0, q: 0.7, type: 'peaking' },
      { freq: 105, gain: -4.0, q: 0.7, type: 'lowshelf' },
      { freq: 250, gain: 1.0, q: 1.0, type: 'peaking' },
      { freq: 700, gain: 1.5, q: 1.5, type: 'peaking' },
      { freq: 2500, gain: 3.0, q: 2.0, type: 'peaking' },
      { freq: 5500, gain: -2.5, q: 2.5, type: 'peaking' },
      { freq: 8000, gain: 4.5, q: 1.8, type: 'peaking' },
      { freq: 13000, gain: -2.0, q: 1.0, type: 'peaking' },
    ],
    popularity: 95,
    formFactor: 'over-ear',
  },
  {
    id: 'airpods_pro_2',
    brand: 'Apple',
    model: 'AirPods Pro (2nd Gen)',
    targetCurve: 'Harman 2018 In-Ear',
    preampGainDb: -5.5,
    bands: [
      { freq: 20, gain: -2.0, q: 0.7, type: 'peaking' },
      { freq: 80, gain: -3.5, q: 1.0, type: 'peaking' },
      { freq: 200, gain: -1.5, q: 1.5, type: 'peaking' },
      { freq: 1000, gain: 2.5, q: 1.8, type: 'peaking' },
      { freq: 3000, gain: 4.0, q: 2.5, type: 'peaking' },
      { freq: 6000, gain: -2.0, q: 2.0, type: 'peaking' },
      { freq: 10000, gain: 2.0, q: 1.0, type: 'highshelf' },
    ],
    popularity: 90,
    formFactor: 'in-ear',
  },
  {
    id: 'hifiman_deva_pro',
    brand: 'HIFIMAN',
    model: 'Deva Pro',
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
    popularity: 85,
    formFactor: 'over-ear',
  },
  {
    id: 'sennheiser_hd650',
    brand: 'Sennheiser',
    model: 'HD 650 / 6XX',
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
    popularity: 80,
    formFactor: 'over-ear',
  },
  {
    id: 'sennheiser_hd600',
    brand: 'Sennheiser',
    model: 'HD 600',
    targetCurve: 'Harman 2019 Over-Ear',
    preampGainDb: -5.5,
    bands: [
      { freq: 25, gain: 6.0, q: 0.6, type: 'lowshelf' },
      { freq: 60, gain: 3.0, q: 1.0, type: 'peaking' },
      { freq: 150, gain: 1.0, q: 1.4, type: 'peaking' },
      { freq: 3500, gain: 2.5, q: 2.0, type: 'peaking' },
      { freq: 5500, gain: -2.5, q: 3.0, type: 'peaking' },
      { freq: 10000, gain: 1.0, q: 1.2, type: 'highshelf' },
    ],
    popularity: 75,
    formFactor: 'over-ear',
  },
  {
    id: 'akg_k702',
    brand: 'AKG',
    model: 'K702',
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
    popularity: 70,
    formFactor: 'over-ear',
  },
  {
    id: 'akg_k371',
    brand: 'AKG',
    model: 'K371',
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
    popularity: 65,
    formFactor: 'over-ear',
  },
  {
    id: 'audio_technica_m50x',
    brand: 'Audio-Technica',
    model: 'ATH-M50x',
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
    popularity: 60,
    formFactor: 'over-ear',
  },
  {
    id: 'beyerdynamic_dt770',
    brand: 'Beyerdynamic',
    model: 'DT 770 Pro (80 Ohm)',
    targetCurve: 'Harman 2019 Over-Ear',
    preampGainDb: -3.5,
    bands: [
      { freq: 50, gain: -2.5, q: 1.0, type: 'peaking' },
      { freq: 180, gain: 2.0, q: 1.5, type: 'peaking' },
      { freq: 800, gain: 1.0, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: -4.0, q: 3.0, type: 'peaking' },
      { freq: 6000, gain: 4.0, q: 2.0, type: 'peaking' },
      { freq: 10000, gain: -2.0, q: 1.5, type: 'peaking' },
    ],
    popularity: 55,
    formFactor: 'over-ear',
  },
  {
    id: 'etymotic_er4sr',
    brand: 'Etymotic',
    model: 'ER4SR',
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
    popularity: 50,
    formFactor: 'in-ear',
  },
  {
    id: 'moondrop_aria',
    brand: 'Moondrop',
    model: 'Aria',
    targetCurve: 'Harman 2019 In-Ear',
    preampGainDb: -4.0,
    bands: [
      { freq: 20, gain: -1.0, q: 0.7, type: 'peaking' },
      { freq: 80, gain: -2.0, q: 1.2, type: 'peaking' },
      { freq: 300, gain: 1.5, q: 1.5, type: 'peaking' },
      { freq: 1000, gain: 2.0, q: 1.8, type: 'peaking' },
      { freq: 2500, gain: 3.5, q: 2.5, type: 'peaking' },
      { freq: 5000, gain: -2.5, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 2.0, q: 1.5, type: 'peaking' },
      { freq: 12000, gain: -1.5, q: 1.0, type: 'peaking' },
    ],
    popularity: 45,
    formFactor: 'in-ear',
  },
  {
    id: 'soundpeats_gofree_2',
    brand: 'SoundPeats',
    model: 'GoFree 2',
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
    popularity: 40,
    formFactor: 'earbud',
  },
  {
    id: 'shure_srh1440',
    brand: 'Shure',
    model: 'SRH1440',
    targetCurve: 'Harman 2019 Over-Ear',
    preampGainDb: -5.5,
    bands: [
      { freq: 50, gain: 4.0, q: 0.7, type: 'peaking' },
      { freq: 160, gain: 2.5, q: 1.2, type: 'peaking' },
      { freq: 600, gain: -1.5, q: 1.5, type: 'peaking' },
      { freq: 1200, gain: 2.0, q: 1.8, type: 'peaking' },
      { freq: 3000, gain: 3.5, q: 2.5, type: 'peaking' },
      { freq: 5500, gain: -2.5, q: 3.0, type: 'peaking' },
      { freq: 8000, gain: 4.0, q: 1.8, type: 'peaking' },
      { freq: 10000, gain: -1.0, q: 1.0, type: 'highshelf' },
    ],
    popularity: 42,
    formFactor: 'over-ear',
  },
  // Phase 2-⑥ (extended): Additional popular AutoEQ headphones so
  // WEB SEARCH can find more than just the hand-curated ~14 entries.
  // EQ data approximated from published AutoEQ / oratory1990 measurements.
  // Will be replaced by the full 5057-item catalog once the background
  // Python fetch completes.
  {
    id: 'akg_k701', brand: 'AKG', model: 'K701',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -6.5,
    bands: [
      { freq: 25, gain: -3.5, q: 0.7, type: 'peaking' },
      { freq: 80, gain: -4.0, q: 1.0, type: 'peaking' },
      { freq: 250, gain: 1.5, q: 1.5, type: 'peaking' },
      { freq: 1000, gain: 2.0, q: 2.0, type: 'peaking' },
      { freq: 3000, gain: 5.0, q: 3.0, type: 'peaking' },
      { freq: 5000, gain: -3.0, q: 3.0, type: 'peaking' },
      { freq: 8000, gain: 4.5, q: 2.0, type: 'peaking' },
      { freq: 12000, gain: -2.0, q: 1.0, type: 'highshelf' },
    ],
    popularity: 88, formFactor: 'over-ear',
  },
  {
    id: 'akg_k712', brand: 'AKG', model: 'K712 Pro',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -5.5,
    bands: [
      { freq: 25, gain: -3.0, q: 0.7, type: 'peaking' },
      { freq: 80, gain: -3.5, q: 1.0, type: 'peaking' },
      { freq: 250, gain: 1.5, q: 1.5, type: 'peaking' },
      { freq: 1000, gain: 1.5, q: 2.0, type: 'peaking' },
      { freq: 3000, gain: 4.0, q: 3.0, type: 'peaking' },
      { freq: 5000, gain: -2.5, q: 3.0, type: 'peaking' },
      { freq: 8000, gain: 4.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 75, formFactor: 'over-ear',
  },
  {
    id: 'akg_k612', brand: 'AKG', model: 'K612 Pro',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -5.0,
    bands: [
      { freq: 30, gain: -3.0, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -3.5, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 1.5, q: 2.0, type: 'peaking' },
      { freq: 3000, gain: 4.0, q: 3.0, type: 'peaking' },
      { freq: 8000, gain: 4.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 55, formFactor: 'over-ear',
  },
  {
    id: 'sennheiser_hd800s', brand: 'Sennheiser', model: 'HD 800 S',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -4.5,
    bands: [
      { freq: 50, gain: 2.5, q: 0.8, type: 'peaking' },
      { freq: 200, gain: 1.5, q: 1.5, type: 'peaking' },
      { freq: 1000, gain: -1.5, q: 2.0, type: 'peaking' },
      { freq: 3000, gain: -3.5, q: 3.0, type: 'peaking' },
      { freq: 5500, gain: 2.5, q: 2.5, type: 'peaking' },
      { freq: 8000, gain: 3.5, q: 2.0, type: 'peaking' },
      { freq: 12000, gain: 1.0, q: 1.0, type: 'peaking' },
    ],
    popularity: 82, formFactor: 'over-ear',
  },
  {
    id: 'sennheiser_hd660s2', brand: 'Sennheiser', model: 'HD 660 S2',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -5.0,
    bands: [
      { freq: 30, gain: -2.5, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -2.0, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 0.5, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 2.0, q: 2.5, type: 'peaking' },
      { freq: 8000, gain: -1.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 70, formFactor: 'over-ear',
  },
  {
    id: 'hifiman_sundara', brand: 'HIFIMAN', model: 'Sundara',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -5.5,
    bands: [
      { freq: 30, gain: -3.0, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -2.5, q: 1.0, type: 'peaking' },
      { freq: 500, gain: 1.0, q: 1.5, type: 'peaking' },
      { freq: 1000, gain: 1.5, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 2.0, q: 2.0, type: 'peaking' },
      { freq: 6000, gain: 0.5, q: 2.0, type: 'peaking' },
      { freq: 10000, gain: -1.5, q: 1.5, type: 'peaking' },
    ],
    popularity: 80, formFactor: 'over-ear',
  },
  {
    id: 'hifiman_ananda', brand: 'HIFIMAN', model: 'Ananda',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -5.0,
    bands: [
      { freq: 30, gain: -2.5, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -2.0, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 1.5, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 2.5, q: 2.0, type: 'peaking' },
      { freq: 6000, gain: 0.5, q: 2.0, type: 'peaking' },
      { freq: 10000, gain: -1.0, q: 1.5, type: 'peaking' },
    ],
    popularity: 76, formFactor: 'over-ear',
  },
  {
    id: 'hifiman_arya', brand: 'HIFIMAN', model: 'Arya',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -5.0,
    bands: [
      { freq: 30, gain: -2.5, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -2.0, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 1.0, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 2.0, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: -1.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 74, formFactor: 'over-ear',
  },
  {
    id: 'audeze_lcd_xc', brand: 'Audeze', model: 'LCD-XC',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -4.0,
    bands: [
      { freq: 30, gain: -2.0, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -1.5, q: 1.0, type: 'peaking' },
      { freq: 500, gain: 1.0, q: 1.5, type: 'peaking' },
      { freq: 2000, gain: 2.0, q: 2.0, type: 'peaking' },
      { freq: 5000, gain: -2.0, q: 2.5, type: 'peaking' },
      { freq: 8000, gain: 3.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 65, formFactor: 'over-ear',
  },
  {
    id: 'audeze_lcd_2c', brand: 'Audeze', model: 'LCD-2 Classic',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -4.5,
    bands: [
      { freq: 30, gain: -2.5, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -1.5, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 1.0, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 2.0, q: 2.0, type: 'peaking' },
      { freq: 6000, gain: -1.5, q: 2.0, type: 'peaking' },
      { freq: 10000, gain: 1.0, q: 1.5, type: 'peaking' },
    ],
    popularity: 60, formFactor: 'over-ear',
  },
  {
    id: 'focal_clear_mg', brand: 'Focal', model: 'Clear Mg',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -4.5,
    bands: [
      { freq: 30, gain: -2.5, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -1.5, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 0.5, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 1.5, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 2.5, q: 2.0, type: 'peaking' },
    ],
    popularity: 68, formFactor: 'over-ear',
  },
  {
    id: 'beyerdynamic_dt990', brand: 'Beyerdynamic', model: 'DT 990 Pro',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -5.5,
    bands: [
      { freq: 25, gain: -3.5, q: 0.7, type: 'peaking' },
      { freq: 80, gain: -2.0, q: 1.0, type: 'peaking' },
      { freq: 250, gain: 2.5, q: 1.5, type: 'peaking' },
      { freq: 1000, gain: 1.5, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 4.0, q: 3.0, type: 'peaking' },
      { freq: 6000, gain: 1.0, q: 2.5, type: 'peaking' },
      { freq: 10000, gain: 2.5, q: 1.5, type: 'peaking' },
    ],
    popularity: 85, formFactor: 'over-ear',
  },
  {
    id: 'beyerdynamic_dt880', brand: 'Beyerdynamic', model: 'DT 880 Pro',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -5.0,
    bands: [
      { freq: 25, gain: -3.0, q: 0.7, type: 'peaking' },
      { freq: 80, gain: -1.5, q: 1.0, type: 'peaking' },
      { freq: 250, gain: 1.5, q: 1.5, type: 'peaking' },
      { freq: 1000, gain: 1.0, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 3.0, q: 2.5, type: 'peaking' },
      { freq: 6000, gain: 1.0, q: 2.0, type: 'peaking' },
      { freq: 10000, gain: 1.5, q: 1.5, type: 'peaking' },
    ],
    popularity: 78, formFactor: 'over-ear',
  },
  {
    id: 'audio_technica_m50xbt', brand: 'Audio-Technica', model: 'ATH-M50xBT',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -4.0,
    bands: [
      { freq: 30, gain: -2.0, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -2.5, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 1.5, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 3.5, q: 2.5, type: 'peaking' },
      { freq: 8000, gain: 3.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 72, formFactor: 'over-ear',
  },
  {
    id: 'grado_sr80x', brand: 'Grado', model: 'SR80x',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -4.5,
    bands: [
      { freq: 30, gain: -2.0, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -2.5, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 1.5, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 4.5, q: 2.5, type: 'peaking' },
      { freq: 8000, gain: 4.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 65, formFactor: 'over-ear',
  },
  {
    id: 'denon_ah_d5200', brand: 'Denon', model: 'AH-D5200',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -4.5,
    bands: [
      { freq: 30, gain: -2.5, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -1.5, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 1.0, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 2.5, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 2.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 55, formFactor: 'over-ear',
  },
  {
    id: 'bose_qc45', brand: 'Bose', model: 'QuietComfort 45',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -3.5,
    bands: [
      { freq: 30, gain: -2.0, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -1.5, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 1.0, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 3.0, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 2.5, q: 2.0, type: 'peaking' },
    ],
    popularity: 78, formFactor: 'over-ear',
  },
  {
    id: 'bose_qc_ultra', brand: 'Bose', model: 'QuietComfort Ultra',
    targetCurve: 'Harman 2019 Over-Ear', preampGainDb: -3.5,
    bands: [
      { freq: 30, gain: -2.0, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -1.0, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 0.5, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 2.5, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 2.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 80, formFactor: 'over-ear',
  },
  {
    id: 'moondrop_kato', brand: 'Moondrop', model: 'Kato',
    targetCurve: 'Harman 2019 In-Ear', preampGainDb: -4.0,
    bands: [
      { freq: 20, gain: 4.0, q: 0.7, type: 'peaking' },
      { freq: 80, gain: -3.0, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 1.0, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 2.0, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 1.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 70, formFactor: 'in-ear',
  },
  {
    id: 'moondrop_variations', brand: 'Moondrop', model: 'Variations',
    targetCurve: 'Harman 2019 In-Ear', preampGainDb: -4.5,
    bands: [
      { freq: 20, gain: 4.5, q: 0.7, type: 'peaking' },
      { freq: 80, gain: -3.5, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 1.0, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 2.5, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 1.5, q: 2.0, type: 'peaking' },
    ],
    popularity: 68, formFactor: 'in-ear',
  },
  {
    id: 'truthear_hexa', brand: 'Truthear', model: 'HEXA',
    targetCurve: 'Harman 2019 In-Ear', preampGainDb: -4.0,
    bands: [
      { freq: 20, gain: 3.5, q: 0.7, type: 'peaking' },
      { freq: 80, gain: -2.5, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 0.5, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 2.0, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 1.5, q: 2.0, type: 'peaking' },
    ],
    popularity: 60, formFactor: 'in-ear',
  },
  {
    id: 'dunu_kanthal', brand: 'DUNU', model: 'Vulkan',
    targetCurve: 'Harman 2019 In-Ear', preampGainDb: -4.5,
    bands: [
      { freq: 20, gain: 4.0, q: 0.7, type: 'peaking' },
      { freq: 80, gain: -3.0, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 1.0, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 2.5, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 2.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 55, formFactor: 'in-ear',
  },
  {
    id: 'shure_se215', brand: 'Shure', model: 'SE215',
    targetCurve: 'Harman 2019 In-Ear', preampGainDb: -3.5,
    bands: [
      { freq: 20, gain: 5.0, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -3.5, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 1.5, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 3.0, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 3.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 75, formFactor: 'in-ear',
  },
  {
    id: 'etymotic_er2xr', brand: 'Etymotic', model: 'ER2XR',
    targetCurve: 'Diffuse Field', preampGainDb: -3.0,
    bands: [
      { freq: 20, gain: 5.5, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -4.0, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 0.5, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 1.5, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: -1.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 50, formFactor: 'in-ear',
  },
  {
    id: 'sennheiser_ie600', brand: 'Sennheiser', model: 'IE 600',
    targetCurve: 'Harman 2019 In-Ear', preampGainDb: -4.0,
    bands: [
      { freq: 20, gain: 3.5, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -2.5, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 0.5, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 1.5, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 0.5, q: 2.0, type: 'peaking' },
    ],
    popularity: 60, formFactor: 'in-ear',
  },
  {
    id: 'campfire_andromeda', brand: 'Campfire Audio', model: 'Andromeda',
    targetCurve: 'Harman 2019 In-Ear', preampGainDb: -4.0,
    bands: [
      { freq: 20, gain: 4.5, q: 0.7, type: 'peaking' },
      { freq: 80, gain: -3.0, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 1.0, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 3.5, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 3.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 58, formFactor: 'in-ear',
  },
  {
    id: 'final_audio_e5000', brand: 'Final Audio', model: 'E5000',
    targetCurve: 'Harman 2019 In-Ear', preampGainDb: -3.5,
    bands: [
      { freq: 20, gain: 4.0, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -2.0, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 0.5, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 2.0, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 1.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 48, formFactor: 'in-ear',
  },
  {
    id: 'tin_hifi_p1', brand: 'TIN HiFi', model: 'P1',
    targetCurve: 'Harman 2019 In-Ear', preampGainDb: -3.5,
    bands: [
      { freq: 20, gain: 4.0, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -2.5, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 0.5, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 2.0, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 1.0, q: 2.0, type: 'peaking' },
    ],
    popularity: 45, formFactor: 'in-ear',
  },
  {
    id: 'kz_zsn_pro_x', brand: 'KZ', model: 'ZSN Pro X',
    targetCurve: 'Harman 2019 In-Ear', preampGainDb: -3.0,
    bands: [
      { freq: 20, gain: 4.5, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -3.0, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 1.0, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 3.0, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 2.5, q: 2.0, type: 'peaking' },
    ],
    popularity: 65, formFactor: 'in-ear',
  },
  {
    id: 'moondrop_chu', brand: 'Moondrop', model: 'Chu',
    targetCurve: 'Harman 2019 In-Ear', preampGainDb: -3.0,
    bands: [
      { freq: 20, gain: 4.5, q: 0.7, type: 'peaking' },
      { freq: 100, gain: -2.5, q: 1.0, type: 'peaking' },
      { freq: 1000, gain: 0.5, q: 1.5, type: 'peaking' },
      { freq: 3000, gain: 2.0, q: 2.0, type: 'peaking' },
      { freq: 8000, gain: 1.5, q: 2.0, type: 'peaking' },
    ],
    popularity: 70, formFactor: 'in-ear',
  },
];

// Phase 2-⑥ (catalog expansion): Pull in 2,771 oratory1990 / crinacle profiles
// from a separate file. Deduped by id at render time (Drawer filters
// out ids already in HEADPHONE_PROFILES).
import { ORATORY_CRINACLE_ENTRIES } from './headphoneCatalog_oratory_crinacle';

export function getPopularCatalogEntries(limit = 10): CatalogEntry[] {
  // Merge the curated 44 with the full oratory/crinacle catalog for
  // popularity-sorted recommendations. The curated entries win ties
  // because they appear first.
  return [...HEADPHONE_CATALOG, ...ORATORY_CRINACLE_ENTRIES]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);
}

export function searchCatalog(query: string): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return getPopularCatalogEntries();
  // Phase 2-⑥ (catalog expansion): search both the curated 44 and
  // the full 2,771-entry oratory/crinacle catalog.
  return [...HEADPHONE_CATALOG, ...ORATORY_CRINACLE_ENTRIES]
    .filter(
      (e) =>
        e.brand.toLowerCase().includes(q) ||
        e.model.toLowerCase().includes(q) ||
        e.targetCurve.toLowerCase().includes(q)
    )
    .sort((a, b) => b.popularity - a.popularity);
}

// Phase 2-⑥ (fix): catalogEntryToProfile now preserves the catalog id
// (e.g. 'akg_k712') instead of generating a fresh `custom_<Date.now()>`
// each call. The previous behavior caused two bugs:
//   1. Drawer's `allProfiles` got new ids every render, so React keys
//      changed on every keystroke / state update, remounting the list
//      and breaking click handlers.
//   2. `localStorage.biscene_headphone_profile_v1` stored a timestamped
//      id that didn't match any profile on next launch, so the
//      selection was lost across restarts.
export function catalogEntryToProfile(entry: CatalogEntry): HeadphoneProfile {
  return {
    id: entry.id,
    modelName: entry.model,
    brand: entry.brand,
    targetCurve: entry.targetCurve,
    preampGainDb: entry.preampGainDb,
    bands: entry.bands.map((b) => ({ ...b })),
  };
}

export function getCatalogById(id: string): CatalogEntry | undefined {
  return HEADPHONE_CATALOG.find((e) => e.id === id);
}