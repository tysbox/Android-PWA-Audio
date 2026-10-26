import { HapticType } from '../types';

/**
 * Tactile feedback ONLY (vibration).
 *
 * The former WebAudio oscillator "relay click" was removed permanently:
 * it mixed into music playback on its own AudioContext and polluted
 * critical listening. Vibration preserves the tactile dial feel silently.
 */
export function triggerHaptic(type: HapticType = 'click'): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    switch (type) {
      case 'tick':
        navigator.vibrate(8);
        break;
      case 'click':
        navigator.vibrate(18);
        break;
      case 'heavy':
        navigator.vibrate([30, 20, 30]);
        break;
    }
  } catch {
    // Ignored
  }
}
