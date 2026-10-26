import { Capacitor } from '@capacitor/core';
import { audioEngine as nativeAudioEngine } from './AudioEngine';
import { webAudioEngine } from './WebAudioEngine';

/**
 * Platform facade for Biscene Audio Engine.
 * Returns Native Audio Engine on Capacitor (Android) platform,
 * or WebAudioEngine (AudioWorklet DSP chain) on PWA / Browser platform.
 */
export const audioEngine = Capacitor.isNativePlatform()
  ? nativeAudioEngine
  : (webAudioEngine as unknown as typeof nativeAudioEngine);

export { nativeAudioEngine, webAudioEngine };
