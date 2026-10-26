import { TrackItem } from '../types';

// Fallback procedural audio generator in case external URLs fail or are blocked by browser CORS/offline
export function createSynthesizedMusicDataUrl(type: 'jazz' | 'classical' | 'electronic' | 'vocal' | 'hum_test'): string {
  const sampleRate = 22050;
  const duration = 12; // 12 seconds loopable demo
  const totalSamples = sampleRate * duration;
  const numChannels = 2;

  // WAV header helper
  const buffer = new ArrayBuffer(44 + totalSamples * numChannels * 2);
  const view = new DataView(buffer);

  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * numChannels * 2, true);
  writeString(8, 'WAVE');
  // FMT sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true); // 16 bits per sample
  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, totalSamples * numChannels * 2, true);

  let offset = 44;
  const bpm = 90;
  const beatDuration = 60 / bpm;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beat = t / beatDuration;

    let left = 0;
    let right = 0;

    if (type === 'jazz') {
      // Jazz chord progression + walking bass + cymbal
      const bassFreqs = [55, 65.4, 73.4, 82.4, 98, 87.3, 73.4, 65.4];
      const bassNote = bassFreqs[Math.floor(beat) % bassFreqs.length];
      const bassEnv = Math.exp(-3 * (beat % 1));
      const bass = Math.sin(2 * Math.PI * bassNote * t) * bassEnv * 0.4;

      // Piano chords (Cmaj7 / Am7 / Dm7 / G7)
      const chordNotes = [[261.6, 329.6, 392.0, 493.8], [220.0, 261.6, 329.6, 392.0], [293.6, 349.2, 440.0, 523.2], [196.0, 246.9, 293.6, 349.2]];
      const currentChord = chordNotes[Math.floor(beat / 2) % chordNotes.length];
      let chord = 0;
      for (const f of currentChord) {
        chord += Math.sin(2 * Math.PI * f * t) * 0.08;
      }

      // Ride cymbal tick
      const cymbalNoise = (Math.random() * 2 - 1) * Math.exp(-12 * ((beat * 2) % 1)) * 0.05;

      left = (bass * 0.8 + chord * 0.9 + cymbalNoise * 0.4);
      right = (bass * 0.6 + chord * 1.1 + cymbalNoise * 0.8);
    } else if (type === 'electronic') {
      // 4-on-the-floor kick + sawtooth arpeggio
      const kickEnv = Math.exp(-15 * (beat % 1));
      const kick = Math.sin(2 * Math.PI * (120 - 70 * (beat % 1)) * t) * kickEnv * 0.6;
      
      const arpFreqs = [220, 277, 330, 440, 554, 659, 880, 659];
      const arpFreq = arpFreqs[Math.floor(beat * 4) % arpFreqs.length];
      const arpEnv = Math.exp(-4 * ((beat * 4) % 1));
      const saw = (((t * arpFreq) % 1) * 2 - 1) * arpEnv * 0.25;

      left = kick * 0.8 + saw * 0.9;
      right = kick * 0.8 + saw * 0.5;
    } else if (type === 'hum_test') {
      // 50Hz hum and 60Hz hum injection + test audio tone
      const hum50 = Math.sin(2 * Math.PI * 50 * t) * 0.25;
      const hum100 = Math.sin(2 * Math.PI * 100 * t) * 0.08;
      const musicTone = Math.sin(2 * Math.PI * 440 * t) * 0.2 * Math.sin(2 * Math.PI * 0.5 * t);
      left = hum50 + hum100 + musicTone;
      right = hum50 + hum100 + musicTone;
    } else {
      // Warm classical / acoustic vocal melody
      const melFreqs = [261.6, 293.6, 329.6, 392.0, 440.0, 392.0, 329.6, 293.6];
      const note = melFreqs[Math.floor(beat / 2) % melFreqs.length];
      const cello = Math.sin(2 * Math.PI * (note / 2) * t) * 0.3;
      const flute = Math.sin(2 * Math.PI * note * t) * 0.2;
      left = cello * 0.8 + flute * 0.9;
      right = cello * 0.9 + flute * 0.7;
    }

    const sampleL = Math.max(-1, Math.min(1, left));
    const sampleR = Math.max(-1, Math.min(1, right));

    view.setInt16(offset, sampleL < 0 ? sampleL * 0x8000 : sampleL * 0x7FFF, true);
    offset += 2;
    view.setInt16(offset, sampleR < 0 ? sampleR * 0x8000 : sampleR * 0x7FFF, true);
    offset += 2;
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export const DEMO_TRACKS: TrackItem[] = [
  {
    id: 'demo-1',
    title: 'Blue Horizon (Jazz Trio)',
    artist: 'Kyoto Acoustic Collective',
    album: 'Audiophile Sessions Vol. 1',
    duration: 12,
    genre: 'JAZZ',
    url: createSynthesizedMusicDataUrl('jazz'),
    albumArtUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=500&auto=format&fit=crop&q=80',
  },
  {
    id: 'demo-2',
    title: 'Serenade for Strings (Op. 22)',
    artist: 'Philharmonia Chamber Players',
    album: 'European Masterworks',
    duration: 12,
    genre: 'CLASSICAL',
    url: createSynthesizedMusicDataUrl('classical'),
    albumArtUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=500&auto=format&fit=crop&q=80',
  },
  {
    id: 'demo-3',
    title: 'Cyber Pulse & Analog Waves',
    artist: 'Biscène Modular Labs',
    album: 'Harmonic Vectors',
    duration: 12,
    genre: 'ELECTRONIC',
    url: createSynthesizedMusicDataUrl('electronic'),
    albumArtUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop&q=80',
  },
  {
    id: 'demo-4',
    title: 'Acoustic Solitude & Vocals',
    artist: 'Elena Vance & String Trio',
    album: 'Unplugged at Studio 4',
    duration: 12,
    genre: 'VOCAL',
    url: createSynthesizedMusicDataUrl('vocal'),
    albumArtUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
  },
  {
    id: 'demo-5',
    title: '50Hz AC Hum & Sub-Bass Test',
    artist: 'DSP Calibration Suite',
    album: 'Acoustic Benchmarks',
    duration: 12,
    genre: 'TEST',
    url: createSynthesizedMusicDataUrl('hum_test'),
    albumArtUrl: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=500&auto=format&fit=crop&q=80',
  },
];
