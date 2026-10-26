# BiScene Audio (Cross-Platform)

A cross-platform music player built around a real-time Web Audio DSP mixture engine. This project evolved from its original native Android roots (which utilized CamillaDSP and Oboe/C++) into a modern, highly portable web application wrapped with Capacitor. 

It features independent audio-processing elements (Source EQ, Output EQ, Hum Filter, Ambience/reverb, Crossfeed, and Tube Saturation) that combine into a single Web Audio API pipeline, switchable and savable as named presets.

## Features

- **Web Audio DSP Engine** — Source EQ (genre-tuned), Output EQ (device-tuned), Hum Filter (AC noise removal), Ambience (convolution reverb via impulse response), Crossfeed (headphone stereo correction), and Tube Saturation / Brickwall Limiting. All independently adjustable and combinable via native Web Audio API nodes.
- **Phone Calibration & Recalibration** — AutoEq-based 10-band Parametric EQ for head/earphones. Allows flattening your headphone's native response and re-calibrating to simulate other target models (e.g. Shure, AKG, Sony, Sennheiser). Detailed guide available in [PHONE_CALIBRATION_MANUAL.md](./PHONE_CALIBRATION_MANUAL.md).
- **Preset save/load/delete** — save any combination of the DSP elements under a name, recall or delete it from the player screen.
- **Playback sources**:
  - Local files (any format the browser/WebView can decode, including hi-res/lossless)
  - DLNA/UPnP network playback (browse and play from media servers on the local network)
- **Machined Interface UI** — A realistic, skeuomorphic "hardware" UI featuring a wood-frame/brushed-metal DSP panel with rotary dial controls. Flips to a DMP (player) panel with album art, VU meters, transport controls, queue management, and preset quick-select.

## Architecture Evolution

Originally architected around a bundled `libcamilladsp.so` subprocess and an Oboe C++ engine, **the architecture has been completely rewritten in TypeScript** to run natively in modern WebViews and browsers.

```text
[Local file / DLNA / Queue]
        │  (HTML5 Audio / File API)
        ▼
  Web Audio API Context (TypeScript / React)
        │
        ├─► Source EQ (BiquadFilterNode)
        ├─► Hum Filter (Notch / Highpass)
        ├─► Crossfeed (Matrix & Filters)
        ├─► Ambience (ConvolverNode with IRs)
        ├─► Tube Saturation (WaveShaperNode)
        ├─► Output EQ (BiquadFilterNode)
        └─► Master Brickwall Limiter (DynamicsCompressorNode)
        │
        ▼
  AudioContext.destination (Browser / WebView Output)
        ▼
  Capacitor (Android / iOS / Web Routing)
```

By leveraging the Web Audio API, the application achieves real-time, zero-latency DSP configuration changes and high-quality audio manipulation without the overhead of native JNI bridges, background named pipes, or compiled C++ binaries.

## Building & Development

The project is built with React, Vite, and Tailwind CSS, and uses Capacitor to compile into native mobile apps.

```bash
# Install dependencies
npm install

# Run the development server (Web)
npm run dev

# Build the web assets
npm run build

# Sync with Capacitor (Android)
npx cap sync android
```

## Third-party components & licenses

- **React & Vite**: MIT License
- **Capacitor**: MIT License
- **Lucide Icons**: ISC License
- Bundled reverb impulse response (IR) files: (Voxengo, free for any use including commercial, not for standalone resale).

## Status

The DSP mixture functionality, local file playback, UPnP/DLNA browsing, and Queue management are complete. The application is now fully decoupled from native C++ engines, ensuring maximum cross-platform compatibility across Web, Android, and iOS environments via Capacitor.
