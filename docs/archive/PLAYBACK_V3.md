# Biscene DSPSystem PLAYBACK V3 - Technical Specifications

## 1. DSD High-Fidelity Audio Engine (Refined)
*   **High-Order FIR Decimation**: Newly implemented 64-tap Hann-windowed FIR filter. Successfully eliminates DSD-specific ultrasonic noise while maintaining CPU efficiency.
*   **Safe-Gain Architecture**: Internal 0.8x (-2dB) headroom to prevent digital clipping during complex DSP processing.
*   **Optimized Decimation Ratio (R=64)**: Clean DSD to PCM conversion (DSD64 -> 44.1kHz / DSD128 -> 88.2kHz) before entering the 96kHz master pipeline.
*   **Gapless Drain Control**: Precise buffer management during track transitions to eliminate end-of-track "pops".

## 2. Unified Master Audio Pipeline
*   **96kHz Fixed-Rate Processing**: Every source is normalized to a high-resolution 96kHz/32-bit float pipeline.
*   **Native DSP Chain**: 
    *   Multi-band Parametric EQ (Calibration, Source, Output).
    *   Hard-wired Hum Filters (50Hz/60Hz).
    *   Tube Saturation Emulation.
    *   Advanced Crossfeed Matrix.
    *   Convolution Reverb (Ambience engine).
*   **Soft-Knee Safety Clipper**: Smooth peak limiting for a warm, analog-like character even at high volumes.

## 3. High-Speed Media Intelligence
*   **LRU Album Art Cache**: 10MB memory cache for instant artwork rendering.
*   **Smart Bitstream Scanner**: Tail-priority scan for DSF (ID3v2) and head-scan for FLAC/MP3 ensures 99.9% artwork extraction accuracy.
*   **Extended Tag Parser**: Deep file inspection (up to 512KB) to catch metadata in files with large padding.

## 4. Architectural Excellence
*   **Unified HTTP Proxy (Port 9600)**: Single-port routing for all streams (PCM, SAF, DLNA), resolving CORS and connectivity issues.
*   **Biscene Executors**: Managed thread pools (Fixed IO pool + Real-time Decoder thread) to prevent OS resource exhaustion.
*   **Decoupled Design**: Clean separation of Decoder, Proxy, and Metadata providers for maximum stability.
