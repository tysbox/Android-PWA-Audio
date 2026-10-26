import { HeadphoneProfile } from '../types';

/**
 * Parses AutoEq parametric EQ text format (e.g. from GitHub jaakkopasanen/AutoEq or oratory1990)
 * Example input:
 * Preamp: -5.4 dB
 * Filter 1: ON PK Fc 32 Hz Gain 4.8 dB Q 1.41
 * Filter 2: ON LSC Fc 105 Hz Gain 5.5 dB Q 0.71
 * Filter 3: ON PK Fc 1400 Hz Gain -1.8 dB Q 2.2
 */
export function parseAutoEqText(text: string, customName = 'Custom AutoEq Profile'): HeadphoneProfile | null {
  if (!text || text.trim().length === 0) return null;

  const lines = text.split('\n');
  let preampGainDb = 0.0;
  const bands: { freq: number; gain: number; q: number }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Check Preamp
    const preampMatch = line.match(/Preamp:\s*(-?\d+(\.\d+)?)\s*dB/i);
    if (preampMatch) {
      preampGainDb = parseFloat(preampMatch[1]);
      continue;
    }

    // Check Filter lines: Filter X: ON PK/LSC/HSC Fc XXX Hz Gain XXX dB Q XXX
    // e.g., Filter 1: ON PK Fc 32 Hz Gain 4.8 dB Q 1.41
    const filterMatch = line.match(/Fc\s+(\d+(\.\d+)?)\s*Hz\s+Gain\s+(-?\d+(\.\d+)?)\s*dB\s+Q\s+(\d+(\.\d+)?)/i);
    if (filterMatch) {
      const freq = parseFloat(filterMatch[1]);
      const gain = parseFloat(filterMatch[3]);
      const q = parseFloat(filterMatch[5]);

      if (!isNaN(freq) && !isNaN(gain) && !isNaN(q)) {
        bands.push({
          freq: Math.round(freq),
          gain: Number(gain.toFixed(1)),
          q: Number(q.toFixed(2)),
        });
      }
    }
  }

  if (bands.length === 0) {
    return null;
  }

  const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

  return {
    id,
    modelName: customName || 'Custom Headphone',
    brand: 'User Custom',
    targetCurve: 'Harman Target (Custom)',
    preampGainDb: Number(preampGainDb.toFixed(1)),
    bands: bands.slice(0, 10), // Limit to 10 bands
  };
}

const STORAGE_KEY = 'biscene_custom_headphone_profiles';

export function loadSavedCustomProfiles(): HeadphoneProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to load custom headphone profiles', e);
  }
  return [];
}

export function saveCustomProfiles(profiles: HeadphoneProfile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch (e) {
    console.error('Failed to save custom headphone profiles', e);
  }
}
