# Biscene DSPSystem - Comprehensive Technical Specifications (V6 Final Production Spec)

## 1. Core Native Audio Engine & Bit-Perfect USB Direct Pipeline (C++/NDK & Java V2)
* **NEON SIMD & 96kHz / 32-bit Float DSP Pipeline**: Complete 96,000Hz / 32-bit Floating Point mastering audio processing chain, accelerated with ARM NEON SIMD intrinsics for real-time parallel DSP processing.
* **Sample-Accurate Gapless Playback Pipeline**:
  * **`SinkCarrier` Handover Architecture**: Retains the active output audio sink (`AudioTrack` / USB Direct) across track boundaries, allowing the successor track to seamlessly append PCM samples behind the preceding track's buffered tail without tearing down the audio sink or creating gaps/clicks.
  * **`LookaheadScheduler` & `LookaheadInspector`**: Probes upcoming playlist items 5 seconds prior to track completion (`DEFAULT_WINDOW_MS = 5000L`), pre-warming decoders (`PrewarmCache`) to guarantee zero-latency seamless track transitions.
* **Dual-Path Absolute Phase Control (0° Normal / 180° Phase Reverse)**:
  * **DSP ON Mode**: Applied at C++/NDK level in `NativeDspChain` (`nativeSetPhaseInverted`) featuring a ~1ms cross-fade for click-free 180° polarity reversal.
  * **DSP OFF (Bit-Perfect) Mode**: Applied via `JavaPhaseInverter` directly to raw PCM samples prior to USB packing, ensuring 180° absolute phase flip is available across both DSP-ON and Bit-Perfect paths without violating bit-depth or sample-rate integrity.
* **4-Point Catmull-Rom Linear-Phase Resampler (`RateConverter`)**:
  * **Catmull-Rom Cubic Spline Interpolation**: High-precision 4-point ($p_0, p_1, p_2, p_3$) cubic spline resampling up to 96kHz.
  * **Linear Phase & Zero Pre-Ringing**: Time-symmetric polynomial kernel providing linear phase response, zero group delay distortion, and complete elimination of pre-ringing artifacts (pre-echos) for pristine attack transient preservation.
* **Bit-Perfect USB Direct Output (AudioFlinger Bypass)**:
  * **DSP OFF (E2E Bit-Perfect Direct Mode)**: End-to-End (E2E) bit-perfect direct audio transmission. Source sample rate, native bit depth (16-bit / 24-bit / 32-bit), and audio stream PCM are delivered to the external USB DAC 100% bit-exact with zero resampling, zero gain alteration, and zero word-length conversion.
  * **DSP ON (96kHz / 32-bit Mastering Mode with 24-bit Downgrade Fallback)**: Processed at 96kHz / 32-bit Float precision through `NativeDspChain`. If the connected USB DAC does not support 32-bit depth, auto-downgrades cleanly to 24-bit subframes (`UsbPcmPacker`) to match the hardware DAC cap.
* **Direct NDK Isochronous USB Engine (`UsbDirectEngine`)**:
  * Direct C++/NDK USB driver submitting raw Isochronous URBs (`USBDEVFS_URB_TYPE_ISO`) via Linux `ioctl` interface, completely bypassing Android `AudioFlinger` and system OS resampler.
  * **Dynamic Kernel Driver Claim & Re-binding**: Atomically detaches Android's default `snd-usb-audio` driver via `USBDEVFS_DISCONNECT_CLAIM` upon DAC acquisition, and re-binds system drivers (`USBDEVFS_CONNECT`) upon release for seamless system audio recovery.
  * **UAC1 / UAC2 USB Audio Descriptor Parsing**: Parses USB Audio Class 1 and Class 2 descriptor structures to automatically detect supported sample rates, channel configurations, and bit resolutions.
* **Triple Output Architecture**:
  * **USB Direct Mode (`UsbDirectEngine`)**: Raw file descriptor USB Isochronous transmission directly to external USB DACs (E2E Bit-Perfect when DSP OFF; 96kHz/32bit with 24bit downgrade when DSP ON).
  * **System Direct Mode (`AudioTrack`)**: Audio track configured natively at `96,000Hz / ENCODING_PCM_FLOAT`, directly fed from `BiscenePlayerV2` and `NativeDspChain`.
  * **HTTP Proxy Mode (`/pcm`)**: Embedded HTTP streaming endpoint (`http://127.0.0.1:9600/pcm`) providing real-time 32-bit Float PCM output.
* **Lock-Free Zero-Allocation Audio Thread**: Real-time audio rendering thread operates strictly lock-free and allocation-free to eliminate audio dropout artifacts.
* **True Peak Safety Limiter**: Final mastering stage with 4x FIR oversampling and 1.0ms lookahead to prevent Inter-Sample Peaks (ISP) and clipping distortion.
* **Hi-Res Audio & DSD/DSF Decoder**: Native DSD (`.dsf`, `.dff`) 1-bit bitstream decoding (`DsfDecoderV2`) and multi-format support (`FLAC`, `WAV`, `ALAC`, `AAC`, `MP3`, `M4A`) with integrated `RateConverter` resampling.

## 2. Spatial & Virtual Acoustic Matrix (5x5)
* **Woodworth ITD Model**: Sub-sample accurate fractional delay lines for realistic soundstage positioning (15° to 90° azimuth).
* **Spherical Head Shadowing**: Native IIR shelving filters simulating frequency-dependent Inter-aural Level Difference (ILD).
* **Distance Control Intelligence**:
  * **Proximity Effect**: Near-field low-frequency spherical wave boost.
  * **Air Absorption**: High-frequency roll-off emulation for far-field distance perception.
* **Virtual Acoustic Absorption Profiles**: Physical material profiles for Studio, Wood, and Glass boundary absorption.

## 3. Ambience & Real FIR Convolution Engine
* **Hybrid FIR Convolution + Feedback Tail**: 1024-tap NEON-optimized early reflection FIR convolution combined with 4-comb / 2-allpass feedback tail networks.
* **Zero-Copy Fast Path**: `irId` stable identifier system enabling instant intensity and decay retuning without memory reallocation or thread lock contention.
* **Impulse Response Asset Catalog**: Pre-loaded acoustic environments including Studio Hall, Jazz Club, Large Bottle Hall, and St. Nicolaes Church.

## 4. High-Fidelity Restoration, Physical Modeling & Parametric EQ
* **Restoration Engine**:
  * **Harmonic Extrapolation**: Reconstruction of high-frequency harmonics (24kHz–32kHz) for lossy (MP3/AAC/Opus) audio files.
  * **Transient Punch**: Wavelet-based attack sharpening.
  * **De-Pre-Echo**: Suppression of digital pre-ringing artifacts.
* **Tube Physical Modeling**:
  * **Triode (300B)**: Asymmetric transfer function emphasizing 2nd-order harmonics.
  * **Pentode (KT88)**: Symmetrical saturation for dynamic response.
  * **Power Supply Sag**: Real-time simulation of B+ high-voltage drop under load.
* **Multi-Band Parametric EQ & Calibration**:
  * **3-Stage EQ**: Source EQ, Band EQ, and Output EQ with adjustable gain, Q, and filter types.
  * **Hum Notch Filter**: Selective 50Hz / 60Hz power grid hum suppression.
  * **Headphone AutoEQ Database**: Built-in 2.2MB headphone calibration catalog (Crinacle & Oratory1990) with parametric target curve editor and real-time total curve visualization.

## 5. Encyclopedic Metadata & Listening Wiki Hub
* **Multi-Tiered Metadata Enrichment Pipeline**:
  1. **AcoustID Recognition**: Audio fingerprinting for untagged tracks.
  2. **MusicBrainz & Discogs Integration**: Asynchronous resolution of production credits (Producer, Recording Engineer, Studio, Mastering Engineer, Record Label).
  3. **Wikipedia Musician Disambiguation**: Deep biographical context and historical instrument / session background.
* **Unified Artwork Provider**: Multi-stage album art extraction Pipeline (Embedded tags -> Local folder art -> NAS UPnP metadata -> iTunes Search API synchronous/async fallback).

## 6. OpenHome & UPnP/DLNA DMR Network Architecture
* **Full OpenHome Renderer Specification**:
  * **Services**: `oh_product`, `oh_playlist`, `oh_transport`, `oh_volume`, `oh_info`, `oh_time`.
  * **Playlist Queue Management**: Natural completion advance (`advanceAfterNaturalEnd()`), `Move`, `ReadList`, `Insert`, `DeleteId` with base64 `IdArray` state synchronization.
  * **Control Point Compatibility**: Linn Kazoo, Linn App, BubbleUPnP, Twonky, Soundgenic NAS.
* **UPnP AV DMR (Digital Media Renderer)**:
  * **Services**: `AVTransport` (SetAVTransportURI, Play, Pause, Stop, Seek) and `RenderingControl` (GetVolume, SetVolume, Mute).
  * **SSDP Dual Bridge**: Advertises both UPnP AV DMR and OpenHome Renderer device descriptions simultaneously across the local network.

## 7. Background Execution & Deterministic System Integrity
* **Background Playback & Activity Lifecycle**:
  * **`killProcess` Avoidance**: `MainActivity` checks active playback state (`PlaybackService`) on finish, ensuring background music playback continues uninterrupted when closing the activity window.
* **USB Audio Hotplug & Manager (`UsbAudioDetector`)**:
  * **USB Hotplug Broadcast Receiver**: Monitors `ACTION_USB_DEVICE_ATTACHED` and `ACTION_USB_DEVICE_DETACHED` events to seamlessly acquire raw file descriptors for connected USB DACs.
* **Android Media3 & Background Service**:
  * **`PlaybackService`**: Integrated `MediaSessionService` providing system lockscreen widget, quick settings media controls, and Bluetooth headset operations (Play, Pause, Next, Prev, Seek).
* **Power Saver & Battery Optimization Protection**:
  * **`PARTIAL_WAKE_LOCK` (`DSP:PlayerV2ThreadLock`)**: Dedicated per-playback CPU wake lock ensuring uninterrupted audio decoding during Android Power Saver / Save Mode or screen-off state.
  * **`WifiLock` & MulticastLock**: Full high-performance Wi-Fi lock (`WIFI_MODE_FULL_HIGH_PERF`) and multicast lock for stable network streaming and UPnP/DLNA discovery.
* **Storage Access Framework (SAF)**: Deep local folder picking (`pickLocalFolder`), MediaStore import, and document tree scanning for local files with large-file Base64 OOM protection (direct Blob URL fallback).
* **VU Meter & Peak Accumulation Safety**: Post-fader logarithmic VU meters with 100ms peak accumulation and finite float guards (`Float.isFinite()`) preventing phantom peak needle behavior.

## 8. Retro Skeuomorphic Hardware Chassis UI & Tactile Haptics
* **Tactile Mechanical Controls & Haptic Feedback**: Machined metal dials, 3-position toggle switches, and aluminum control panels with integrated tactile haptic vibration feedback (`triggerHaptic` tick/click response).
* **Symmetrical 4-Button Mixer Row (`STAGE`, `PHASE`, `RESTORE`, `HUM`)**: Dedicated bottom control row matching Player front panel geometry with active cyan light-up indicators.
* **Bit-Perfect OSD Indicator**: Dedicated white text indicator (`BIT PERFECT`) below the brand logo active when USB output and DSP bypass are engaged.
* **Real-Time VU Analog Meters**: Dual-channel analog-style VU meters reflecting post-fader audio dynamics.
* **Custom Responsive Layout**: Adaptive layout supporting mobile, tablet, and desktop viewports with wood-frame chassis styling.

## 9. Performance & Resource Optimizations (V6 Architecture)
* **Consolidated Thread Pools**: Rationalized background executors across `UpnpSsdpBridge`, `BisceneHttpProxy`, `MetadataCoordinator`, `AlbumArtProvider`, and `GenaNotifier` to ~30 lean threads.
* **Code Splitting & Bundle Optimization**: 2.2MB Headphone Catalog (`headphoneCatalog_oratory_crinacle.ts`) split into dedicated async chunk via Vite `manualChunks`, reducing initial JS bundle size by 83% (2.0MB ➔ 343kB).
* **Zero-Allocation Audio Rendering Loop**: Non-direct proxy streaming utilizes `ByteBuffer.wrap(chunk)` to eliminate per-block heap allocations and prevent GC pauses.
* **Metadata LRU Caching**: Thread-safe in-memory `LruCache` (100 items) for MusicBrainz and Wikipedia API requests to eliminate redundant network overhead.
