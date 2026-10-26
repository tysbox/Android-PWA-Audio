# Biscene DSPSystem - Comprehensive Technical Specifications (V3 Full Version)

## 1. Core Audio Architecture
*   **Master Mastering Pipeline**: 96kHz / 32-bit Floating Point internal processing for all sources.
*   **Native DSP Chain Engine**: Multi-stage audio processing including:
    *   **Preamp Stage**: Precision volume matching across different formats.
    *   **Triple EQ Stack**: Independent Parametric EQs for Headphone Calibration, Source enhancement, and Output fine-tuning.
    *   **Hum Cancellation**: Hard-wired 50Hz/60Hz notch filters with high-pass safety.
    *   **Tube Emulator**: Advanced non-linear harmonic saturation for warm, analog character.
    *   **Crossfeed Matrix**: Audiophile-grade speaker simulation for fatigue-free headphone listening.
    *   **Convolution Ambience**: High-performance convolution engine for studio/hall acoustics (hall, jazz club, large hall).
*   **Soft-Knee Safety Clipper**: Intelligent peak management to prevent digital harshness.

## 2. Advanced Format Support & Decoding
*   **DSD High-Fidelity Engine**:
    *   **High-Order FIR Decimation**: 64-tap Hann-windowed FIR filter for superior ultrasonic noise rejection.
    *   **Direct-to-Pipeline Conversion**: Optimized decimation ratios (R=32/64) for pristine DSD-to-PCM translation.
    *   **Gapless Transition Logic**: Advanced buffer drain control to eliminate clicks between tracks.
*   **Universal High-Res Support**: Native decoding for FLAC, WAV, ALAC, AIFF, M4A, MP3, AAC, and more.
*   **Bit-Depth Intelligence**: Automatic 24/32-bit alignment detection and bit-perfect handling.

## 3. Connectivity & Network Features
*   **DLNA/UPnP Integration**: Full network streaming support with SSDP auto-discovery.
*   **Unified Stream Proxy (Port 9600)**: Consolidated high-trust loopback routing for remote NAS (Soundgenic, Synology, QNAP) and local SAF files.
*   **Optimized SOAP Engine**: Fast, paginated UPNP browsing with "Fast Path" support (RequestedCount=0).
*   **WiFi Multicast Support**: Advanced WiFi locks to prevent stream dropouts during background playback.

## 4. Media Management & UI Integration
*   **Instant Album Art Engine**:
    *   **LRU Memory Cache**: 10MB dedicated cache for zero-latency scrolling.
    *   **Dual-Scan Logic**: Tail-priority scanning for DSD (ID3v2) and head-scanning for traditional formats.
*   **Intelligent Tag Parser**: Fast native parsing for ID3v2, Vorbis Comments, and MP4 atoms with 512KB header inspection.
*   **SAF Folder Picker**: Full support for Android Storage Access Framework for secure, permission-less local file access.

## 5. System Performance & Stability
*   **Biscene Executors**: Managed thread pools (IO-specific and Real-time Decoding) to prevent OS suspended-process issues.
*   **Foreground Service Support**: Dedicated media playback service with CPU/WiFi locks for uninterrupted background listening.
*   **Low-Latency HAL Routing**: API 26+ Performance Mode integration for minimal jitter.
