# Biscene DSPSystem - Comprehensive Technical Specifications (V4.5 Final Spec)

## 1. Core Native Audio Engine (C++/NDK)
*   **NEON SIMD Optimization**: Full 96kHz / 32-bit Floating Point mastering pipeline. Optimized using ARM NEON intrinsics for 4x parallel processing efficiency.
*   **Zero-Allocation Audio Thread**: Audio processing path is strictly lock-free and allocation-free.
*   **True Peak Safety Limiter**: Silent-resident final stage with 4x FIR oversampling and 1.0ms lookahead. Prevents Inter-Sample Peaks (ISP).

## 2. Spatial & Virtual Acoustic Matrix (5x5) [MANDATORY]
*   **Woodworth ITD Model**: Sub-sample accurate fractional delay lines for realistic soundstage positioning (15° to 90°).
*   **Spherical Head Shadowing**: Native IIR shelving filters simulating frequency-dependent ILD (Inter-aural Level Difference).
*   **Distance Control Intelligence**:
    *   **Proximity Effect**: Spherical wave low-frequency boost for "Intimate" near-field listening.
    *   **Air Absorption**: High-frequency roll-off emulation for "Deep Space" far-field acoustics.
*   **Virtual Acoustic Mode**: Preset frequency profiles for Studio, Wood, and Glass material absorption characteristics.

## 3. High-Fidelity Restoration & Physical Modeling [MANDATORY]
*   **Restoration Engine**: Advanced DSP for lossy (MP3/AAC/Opus) sources.
    *   **Harmonic Extrapolation**: FFT-based reconstruction of high-frequency harmonics (24kHz-32kHz).
    *   **Transient Punch**: Wavelet-based attack slope sharpening to recover compressed dynamics.
    *   **De-Pre-Echo**: Dynamic suppression of digital pre-ringing artifacts.
*   **Tube Physical Modeling (V4)**:
    *   **Triode (300B)**: Asymmetric transfer function emphasizing 2nd-order harmonics.
    *   **Pentode (KT88)**: Symmetrical saturation for punchy, dynamic response.
    *   **Power Supply Sag**: Real-time simulation of B+ voltage drop.

## 4. Listening Wiki & Metadata Hub (Encyclopedic Update)
*   **AcoustID Recognition**: Audio fingerprinting for identifying untagged tracks.
*   **Cloud Data Integration**: Asynchronous fetching from MusicBrainz and Discogs for deep production credits.
    *   **People & Studio**: Producer, Engineer, and Recording facility identification.
    *   **Audio Gear Heritage**: Identification of microphones (Neumann, AKG), consoles, and recorders used in the session.
    *   **Smart Anchors**: Integrated "one-tap" links for deep research.

## 5. Deterministic Signal Integrity (V4.5 Fixes)
*   **Input-Driven Resampling**: `RateConverter` mathematically limited to input frames, ensuring 1.0x perfect temporal stability.
*   **Synchronous Media Preparation**: The `play()` command blocks until `duration`, `sampleRate`, and `format` are locked. Guarantees Queue Integrity.
*   **96kHz Native Delivery**: AudioTrack forced at **96,000Hz / PCM Float**.
*   **Pre-Fader Peak Detection**: Meter data (20FPS) calculated BEFORE Master Volume stage.
