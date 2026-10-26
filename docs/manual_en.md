# Biscene DSP Player — User Manual

---

## Preface

> ### Welcome to Biscene DSP Player
>
> Biscene DSP Player delivers audiophile-grade playback on Android, combining bit-perfect native decoding with a flexible DSP processing pipeline.
>
> - **Native DSP Pipeline**: MediaCodec → Float32 → Custom DSP Chain → AudioTrack @ 96kHz
> - **Headphone Auto-Calibration**: Supports dozens of headphone profiles. Select your model and enjoy optimized sound instantly.
> - **A/B Bypass & Presets**: Instantly toggle DSP on/off and save/load custom sound profiles.
> - **Universal Source Support**: Stream from UPnP/DLNA servers or import local files via Android's SAF framework.

Internally, the application routes every sample through a precisely ordered signal chain: AC hum filter → Source EQ → Output EQ → headphone AutoEq calibration → tube saturation → stereo crossfeed → ambience/convolver reverb → brickwall limiter → master volume. Each stage is independently adjustable, switchable in real time, and savable as a named preset.

---

## Quick Start Guide

Get from launch to playback in 5 simple steps:

| Step | Action | Detail |
|------|--------|--------|
| 1 | **Launch** | Open **Biscene DSP Player** on your Android device. The hardware-chassis UI (wood frame + brushed metal) appears. |
| 2 | **Choose a source** | Tap one of the three source buttons at the bottom of the Player (PLY) panel: **FILES** (local storage via SAF), **NETWORK** (UPnP/DLNA browser), or **QUE** (current queue). Alternatively, the 5 built-in demo tracks load automatically on first launch. |
| 3 | **Play** | Tap the **▶** circle button in the transport row. The DSP engine initializes and the VU meters begin animating. The preset name appears below the volume dial. |
| 4 | **Adjust volume** | Drag or rotate the **MachinedWheel** in the centre. The dial rotates from 0 to 15 with a square-law perceived-loudness curve. |
| 5 | **Fine-tune sound** | Tap the **MIX** button (top-right of the chassis) to flip to the Mixer panel. Adjust EQ, crossfeed, ambience, tube warmth, or switch the **A/B Direct** toggle to compare raw vs. processed audio. Tap **SET** on the Phone Calibration card to select your headphone model. |

> **Tip:** If no track is loaded, the app defaults to demo tracks. These are procedurally generated jazz, classical, electronic, vocal, and hum-test sequences — ideal for auditioning DSP settings.

---

## UI Overview & Controls

### Main Chassis (AudioChassis)

The entire interface is housed inside a skeuomorphic hardware chassis:

- **WoodFrame** — The outer shell, styled as dark walnut/teak wood grain with realistic drop-shadows and inner glowing borders. This is purely aesthetic; it frames the active panel.
- **MetalPanel** — The brushed-metal interior panel that contains all interactive controls.
- **AlbumArtFrame** — The central display area at the top. Shows album artwork when a track is playing. When a headphone profile is being previewed or calibrated, it overlays a live frequency-response curve graph instead.
- **BisceneLogo** — The "Biscène AUDIO SYSTEM" branding centered in the bottom strip.

The chassis has a fixed aspect ratio of approximately 1:2.3 and auto-sizes to fit the screen (mobile or tablet).

### Panels: Player (PLY) ↔ Mixer (MIX)

The centre area is a **3D-flippable panel** with two faces:

#### Front: **Player Controls (PLY)**

| Control | Description |
|---------|-------------|
| **Transport Row** | Five circular metal buttons: `<<` (Previous), `■` (Stop), `||` (Pause), `▶` (Play), `>>` (Next). |
| **Play indicator** | Shows `TRACK X / Y`, `[PLAYING]` or `[PAUSED]`, the current track title, and a timeline scrub bar with elapsed / duration. |
| **VU Meters** | Dual 20-segment LED bar meters (Left & Right). Top 4 segments glow **red**, next 4 **amber**, bottom 12 **green**. Meters dim when idle. |
| **MachinedWheel** | A rotary volume dial (0–15). Touch-and-drag or mouse-wheel to rotate. The **PRESET** button sits in the centre. The outer ring shows a knurled edge texture and rotates with volume; the centre button stays upright (counter-rotated). A small LED dot and `VOL X/15` label are below the brand text. |
| **Preset name** | Displays the currently loaded preset name in brackets beneath the wheel. |
| **Source buttons** | Three rectangular buttons: **FILES** (local SAF browser), **QUE** (queue drawer), **NETWORK** (UPnP/DLNA browser). |

#### Back: **Mixer Controls (MIX)**

| Control | Description |
|---------|-------------|
| **A/B Direct Bypass** | Toggle between processed DSP signal and raw bit-perfect direct output. Green = DSP active, amber = direct bypass. |
| **Tube Warmth** | Toggle 2nd-harmonic vacuum-tube saturation via a waveshaper curve. Orange = on, gray = off. |
| **Phone Calibration card** | Displays the currently selected headphone model name. Tap **SET** to open the full calibration drawer. |
| **HUM FILTER** | Triple-lever switch: **NONE**, **50HZ**, **60HZ**. Applies a 15 Hz high-pass filter plus a narrow notch at the selected mains frequency (Q = 30). |
| **OUT EQ** | Small rotary dial cycling through: **NONE**, **STUDIO**, **JBL**, **PLANAR**, **LOUD**, **TUBE**, **CRYSTAL**. Four parametric bands per preset. |
| **SRC EQ** | Small rotary dial cycling through: **NONE**, **JAZZ**, **CLASSICAL**, **ELECTRONIC**, **VOCAL**. Three parametric bands per preset. |
| **AMB** | Small rotary dial cycling through: **NONE**, **HALL**, **JAZZ CLUB**, **LARGE HALL**, **CHURCH**. Includes a 10-step intensity bar (0–100%). |
| **X-FEED** | Small rotary dial cycling through: **NONE**, **LIGHT**, **NORMAL**. Includes a 10-step intensity bar (0–100%). Applies a stereo crossfeed matrix with low-pass filtering at 900 Hz. |

### Bottom Strip Controls

| Control | Mode | Description |
|---------|------|-------------|
| **REP** | Player (PLY) | Pin the current track as the auto-start position for the next app launch. Flashes `SET` when just pinned; glows green when active. |
| **BisceneLogo** | Both | Brand centre mark. |
| **MIX / PLY** | Both | Flips the 3D panel to the Mixer or Player face. |
| **REG** | Mixer (MIX) | Opens the "Register Current DSP Setup" dialog to save the current configuration as a named preset. |

### Drawers & Modal Windows

#### Headphone Calibration Drawer

Opened via the **SET** button on the Phone Calibration card (or the model-name hover area on desktop).

- Shows a **live frequency-response curve graph** for the selected profile.
- Lists all built-in headphone profiles (Sony, Sennheiser, AKG, Audio-Technica, HIFIMAN, Etymotic, SoundPeaks) plus any user-created custom profiles.
- Hover over a profile name to preview its response curve on the album-art area.
- **A/B DIRECT** and **TUBE** toggles are duplicated here for convenience.
- **+ CREATE / IMPORT** button opens the Custom Headphone Editor for building or importing AutoEq text profiles.
- Profiles can be renamed and deleted (custom only).

#### Queue Drawer (QUE)

- Lists all tracks in the current playlist with their position, title, and artist.
- The currently playing track is highlighted.
- Each track has inline **Play** and **Remove** buttons.
- **Clear Queue** button at the top removes all tracks.
- **+ FILE** / **+ FOLDER** buttons add new audio files or folders to the queue.

#### UPnP Browser Modal (NETWORK)

Three tabs:

1. **HOME SERVERS** — Auto-scans the local Wi-Fi for DLNA/UPnP media servers via SSDP discovery. Also lists previously saved manual servers.
2. **LIVE STREAMS** — Curated internet radio presets (SomaFM Groove Salad, SomaFM Secret Agent, Radio Swiss Classic, Radio Swiss Jazz).
3. **DIRECT URL / IP** — Enter any HTTP/M3U/M3U8/PLS stream URL for playback.

Inside a connected server: browse folders, play individual tracks, play all, or add to queue. Supports progressive rendering for large libraries.

#### Local Browser Modal (FILES)

Opens when using the **FILES** source button on Android (via SAF — Storage Access Framework):

- Uses Android's native folder picker.
- Lists all audio files found in the selected folder tree.
- **Play All** starts playback from the first track.
- **Add to Queue** appends selected files to the existing playlist.
- Supports long-press multi-selection mode for choosing specific tracks.

#### Preset Modals

Opened via the **PRESET** centre button on the volume dial:

- **Load Preset** — Lists all saved presets plus a "NONE (CLEAR DSP PRESET)" reset option. Each preset shows its name; tap to apply.
- **Save Preset** (via REG in mixer mode) — Enter a name to save the current DSP configuration.
- **Manage Preset** — Tap the edit icon on any saved preset to rename or delete it.

---

## Detailed Feature Walkthrough

### Local File Playback (via SAF)

Biscene DSP Player uses Android's **Storage Access Framework (SAF)** for local file access:

1. Tap **FILES** in the Player panel.
2. The Android folder picker opens. Navigate to and select a folder containing audio files.
3. The Local Browser modal displays all supported audio files found in that folder.
4. Choose **Play All** to start from the first track, or use long-press multi-selection to pick specific tracks.
5. Tracks are served through an internal local HTTP proxy (`http://127.0.0.1:9600`) so that album art extraction and CORS are handled transparently.

**Supported import methods:**
- Whole-folder selection (recommended for albums)
- Individual file selection (via the Queue drawer's + FILE button)
- Drag-and-drop ordering in the Queue drawer

### Network Streaming (UPnP / DLNA)

Biscene DSP Player fully supports UPnP and DLNA media servers on your local network:

1. Tap **NETWORK** in the Player panel to open the UPnP Browser.
2. The app automatically scans your Wi-Fi for media servers (Synology, MiniDLNA, Plex, Jellyfin, Volumio, etc.).
3. Tap any discovered server to browse its library. Navigate folders by tapping containers.
4. Tap a track to play it immediately, or tap the **⋮** overflow to add to queue.
5. For servers not auto-discovered, go to the **DIRECT URL / IP** tab and enter the server address manually (e.g., `http://192.168.1.100:8200`).
6. Internet radio listeners can use the **LIVE STREAMS** tab for curated presets, or enter any streaming URL (M3U, M3U8, PLS, or direct audio) in the DIRECT URL tab.

**Technical note:** Network streams are decoded natively using **MediaCodec** → Float32 → native DSP chain → **AudioTrack** at **96 kHz**. This bypasses WebView security restrictions that would otherwise mute playback. DSF and DFF files are decoded via a custom DSD decoder with real-time DOP/PCM conversion.

### DSP Features

The Biscene DSP engine is a **modular 12-stage pipeline**. Every effect is applied in the following fixed order, and each stage can be independently toggled or adjusted:

| # | Stage | Type | Adjustable Parameters |
|---|-------|------|----------------------|
| 1 | **Source Bus** | Input router | — |
| 2 | **A/B Bypass** | Switch | DSP Active / Direct Bypass |
| 3 | **Hum Filter** | 15 Hz HPF + Notch | OFF / 50 Hz / 60 Hz |
| 4 | **Source EQ** | 3-band parametric (peaking) | 5 genre presets |
| 5 | **Output EQ** | 4-band parametric (peaking) | 7 device-tuned presets |
| 6 | **Headphone Calibration** | 10-band AutoEq (peaking/low-shelf/high-shelf) | Profile selection + intensity (0–100%) |
| 7 | **Tube Saturation** | Waveshaper (2nd harmonic) | On / Off |
| 8 | **Crossfeed** | Stereo matrix + LPF | NONE / LIGHT / NORMAL + intensity |
| 9 | **Ambience** | Convolver reverb (dry/wet) | 5 spaces + intensity |
| 10 | **Master Safety Gain** | Gain node | Auto headroom (with ambience) |
| 11 | **Brickwall Limiter** | DynamicsCompressor | threshold -0.5 dB, ratio 20:1, hard knee |
| 12 | **Master Volume** | Gain node | Square-law 0–15 steps |

#### Equalizer (EQ)

**Source EQ** — Applied before all other processing. Three parametric bands per preset. Presets:

| Preset | Character |
|--------|-----------|
| **NONE** | Flat, no EQ |
| **JAZZ** | Gentle low-end boost, slight upper-mid lift |
| **CLASSICAL** | Natural warmth, subtle presence |
| **ELECTRONIC** | Enhanced bass and highs |
| **VOCAL** | Mid-focused emphasis for vocal clarity |

**Output EQ** — Applied after headphone calibration. Four parametric bands per preset. Presets:

| Preset | Character |
|--------|-----------|
| **NONE** | Flat, no EQ |
| **STUDIO** | Neutral reference tuning |
| **JBL** | Consumer "V-curve" with bass and treble boost |
| **PLANAR** | Balanced with subtle mid-scoop |
| **LOUD** | Loudness contour for low-volume listening |
| **TUBE** | Warm midrange emphasis, high-end roll-off |
| **CRYSTAL** | Bright, detailed treble lift |

#### Crossfeed

Simulates the natural cross-talk between ears when listening via speakers, reducing the "inside-the-head" effect of headphones:

| Preset | Direct Gain | Cross Gain | Description |
|--------|-------------|------------|-------------|
| **NONE** | 0 dB | — | Standard headphone mode |
| **LIGHT** | 0 to -1.8 dB | -46.8 to -15.6 dB | Subtle spatial widening |
| **NORMAL** | -1.5 to -3.9 dB | -16.8 to -11.4 dB | Full crossfeed simulation |

Intensity is adjustable from 0 to 100% via the integrated bar. A 900 Hz low-pass filter applies to the crossfed signal.

#### Ambience (Convolution Reverb)

Adds a convolution-based reverb using impulse responses captured in real acoustic spaces. Falls back to synthetic reverb if IR files are unavailable.

| Preset | Space | Duration | Decay |
|--------|-------|----------|-------|
| **NONE** | Off | — | — |
| **HALL** | Concert hall | 2.0 s | 2.0 s |
| **JAZZ CLUB** | Small club | 1.2 s | 3.5 s |
| **LARGE HALL** | Large hall | 2.4 s | 1.5 s |
| **CHURCH** | Cathedral | 2.5 s | 1.1 s |

Intensity ranges 0–100%. At 0%, the wet signal is fully gated. The master safety gain automatically applies headroom compensation when ambience is increased.

#### Hum Filter

Removes mains-frequency interference (AC hum):

| Preset | High-Pass | Notch Frequency | Notch Q |
|--------|-----------|-----------------|---------|
| **NONE** | 1 Hz (effectively off) | 1 Hz | 0.001 |
| **50HZ** | 15 Hz | 50 Hz | 30 |
| **60HZ** | 15 Hz | 60 Hz | 30 |

This is the first DSP stage, applied before EQ. It is especially useful for vinyl rips or live recordings with electrical interference.

#### Tube Warmth

Adds 2nd-order harmonic distortion via a custom waveshaper curve. The curve combines tanh-based saturation with a 2nd-harmonic injection term (drive = 0.5), emulating the nonlinear transfer function of vacuum tube amplifiers.

- **When ON**: 2nd harmonic content is added, imparting warmth and subtle compression.
- **When OFF**: A linear curve is used (bit-transparent passthrough).
- Also visible as a **TUBE WARMTH** badge on the album art frame when active.

### Headphone Calibration (AutoEq)

Biscene DSP Player includes built-in **AutoEq** profiles based on the Harman headphone target curves. Each profile applies up to 10 parametric biquad filters (peaking, low-shelf, high-shelf) with a preamp gain to flatten your headphone's native response:

| # | Brand | Model | Target Curve | Bands | Preamp |
|---|-------|-------|-------------|-------|--------|
| 1 | Standard | Bypass (No Calibration) | Flat Reference | 0 | 0.0 dB |
| 2 | Sony | WH-1000XM5 (default) | Harman 2019 Over-Ear | 9 | -4.2 dB |
| 3 | Sennheiser | HD 650 / 6XX | Harman 2019 Over-Ear | 6 | -5.0 dB |
| 4 | AKG | K702 | AutoEQ Harman Over-Ear | 10 | -6.1 dB |
| 5 | AKG | K371 | AutoEQ Harman Over-Ear | 10 | -5.6 dB |
| 6 | Audio-Technica | ATH-M50x | Harman 2019 Over-Ear | 6 | -4.5 dB |
| 7 | HIFIMAN | Deva Pro | AutoEQ Harman Over-Ear | 10 | -6.5 dB |
| 8 | Etymotic | ER4SR | AutoEQ Diffuse Field | 10 | -6.0 dB |
| 9 | SoundPeaks | GoFree 2 | AutoEQ Open-Ear Target | 10 | -6.5 dB |

**To select a profile:**

1. Tap the **SET** button on the Phone Calibration card (Mixer panel), or tap the headphone model name to preview the curve on the album art.
2. Browse the profile list. Tap any profile to apply it instantly.
3. Hover (desktop) or touch-hold to preview the response curve without applying.

**To create a custom profile:**

1. In the calibration drawer, tap **+ CREATE / IMPORT**.
2. Choose between two tabs:
   - **AutoEq Text Import** — Paste the contents of an `ParametricEQ.txt` file from the AutoEq project. The parser extracts preamp gain and all filter bands automatically.
   - **Manual Band Editor** — Add up to 10 bands with adjustable frequency (Hz), gain (dB), and Q factor.
3. Set the model name, brand, and target curve identifier.
4. Tap **登録・適用** (Register & Apply) to save and immediately activate the profile.

Custom profiles are stored in browser local storage and persist across sessions.

### Preset Save / Load / Rename / Delete

DSP presets store the complete state of all DSP parameters in a single named configuration:

```typescript
DspPreset {
  name: string
  outputEqIdx: number      // Output EQ preset index
  sourceEqIdx: number      // Source EQ preset index
  humFilterIdx: number     // Hum filter index
  ambienceIdx: number      // Ambience preset index
  ambienceIntensity: number
  crossfeedIdx: number     // Crossfeed preset index
  crossfeedIntensity: number
  headphoneProfileId?: string
  tubeWarmth?: boolean
}
```

**Three built-in presets** are loaded on first install:

| Name | Output EQ | Source EQ | Hum | Ambience | Crossfeed | Headphones | Tube |
|------|-----------|-----------|-----|----------|-----------|------------|------|
| **Audiophile Studio Pure** | STUDIO | JAZZ | None | None | LIGHT @40% | HD 650 | Off |
| **Concert Hall Immersion** | PLANAR | CLASSICAL | None | HALL @60% | NORMAL @50% | WH-1000XM5 | On |
| **Club Bass & Tube Warmth** | TUBE | ELECTRONIC | 50HZ | JAZZ CLUB @45% | LIGHT @60% | M50x | On |

**Saving a preset (REG):**

1. Flip to the **MIX** panel.
2. Adjust your DSP settings as desired.
3. Tap the **REG** button (bottom-left of chassis).
4. Enter a name in the dialog and tap **REGISTER**.

**Loading a preset (PRESET):**

1. Tap the **PRESET** button at the centre of the volume wheel (Player panel).
2. Tap any preset name, or select **NONE (CLEAR DSP PRESET)** to reset all DSP to flat.
3. The settings are applied instantly.

**Renaming / Deleting:**

1. In the Load Preset dialog, tap the **✏️ Edit** icon next to any saved preset.
2. In the Manage Preset dialog, enter a new name and tap **RENAME**, or tap **DELETE**.

### Gapless Queue Advance & Track Pinning (REP Button)

The **REP** (Repeat-Pin) button in Player mode serves two purposes:

1. **Pin start position** — When tapped, the current track is pinned as the auto-start position for the next app launch. The button flashes `SET` for 1.6 seconds, then glows green while the pin is active.
2. **Gapless pre-queue** — The engine automatically pre-queues the next track during playback, so track transitions are gapless. On natural track end, the queue advances automatically.

** behaviours:**

- On first launch, the app checks for a saved REP pin. If found, playback starts from that track.
- If no pin exists, the last-played track position is restored from local storage.
- The queue persists across app restarts for all non-blob URLs.

### VU Metering & Diagnostics

The Biscene DSP Player features dual 20-segment VU meters with authentic LED styling:

| Color | Segments | Meaning |
|-------|----------|---------|
| **Red** | Top 4 (segments 1–4) | Clipping / peak danger |
| **Amber** | Segments 5–8 | Hot signal |
| **Green** | Bottom 12 (segments 9–20) | Nominal operating range |

**Metering details:**

- The meter level is computed from a combination of peak and RMS measurements (`peak × 0.7 + RMS × 1.5`).
- Meters auto-dim when no audio is playing.
- On the native (network) path, true peak levels are reported from the AudioTrack writer thread via the `playbackTime` event.
- The brickwall limiter (DynamicsCompressorNode) engages when signals approach 0 dBFS, preventing digital clipping.

**Diagnostic features:**

- DSP running indicator: the **Play** button glows green when the DSP graph is active, amber when in direct-bypass mode.
- The **Refresh Stack** (amber) button re-initializes the audio context and re-applies all DSP settings — useful if the audio graph becomes stuck.
- Format and output target labels appear in the top header of the chassis, showing the current audio format (e.g., "FLAC 96kHz 24-bit") and active headphone model.

---

## Troubleshooting

### No Sound

| Possible Cause | Solution |
|----------------|----------|
| **DSP Bypass is engaged (DIRECT mode)** | Check the A/B toggle on the Mixer panel — it should show **A/B: DSP ON** (green). If it shows **A/B: DIRECT** (amber), tap to re-enable DSP. |
| **Volume is at 0** | Rotate the MachinedWheel volume dial upward, or press the physical volume buttons on your device. |
| **Playback not started** | Ensure a track is loaded, then tap the **▶** button. The VU meters should animate. |
| **Audio context suspended** | Tap the **amber Refresh** button to rebuild the audio context, then tap **▶** again. |
| **Track finished / queue ended** | The indicator bar shows `NO TRACKS LOADED`. Select a source (FILES, NETWORK, QUE) or use demo tracks. |
| **Native pipeline error (network sources)** | Stop playback (■), then restart (▶). If the issue persists, check your network connection and server availability. |

### Skipped or Stuttering Tracks

| Possible Cause | Solution |
|----------------|----------|
| **Network latency / low bandwidth** | Ensure your device is on the same Wi-Fi network as the media server. Use 5 GHz Wi-Fi for hi-res files. |
| **Buffer underruns** | Native playback uses adaptive buffering. Tap **■** then **▶** to re-establish the stream. |
| **High sample-rate files** | DSF/DFF files above DSD128 may require more decoder bandwidth. Consider lower DSD rates or converting to FLAC. |
| **Gapless transition failure** | The next track is pre-queued automatically. If a skip occurs, manually advance with **>>** and check network health. |

### Album Art Not Showing

| Possible Cause | Solution |
|----------------|----------|
| **Embedded art not detected** | The app scans for embedded artwork in ID3 (MP3/AAC/WAV/AIFF), FLAC PICTURE blocks, MP4 covr atoms, and OGG METADATA_BLOCK_PICTURE. If none is found, a generic vinyl record placeholder is shown. |
| **Folder art** | Place `cover.jpg`, `folder.png`, or `AlbumArtSmall.jpg` in the same directory as the audio files. |
| **Network art blocked** | For UPnP/DLNA sources, album art is proxied through the native bridge. Ensure the server's art URLs are accessible. |
| **SAF permission** | Re-select the folder via the **FILES** button to ensure the app has ongoing read permission for the URI. |

### DSP Effects Not Applying

| Possible Cause | Solution |
|----------------|----------|
| **A/B Direct Bypass is ON** | Tap the A/B toggle on the Mixer panel to switch to **DSP ON** mode. |
| **All DSP stages set to NONE** | Verify the EQ, crossfeed, ambience, and hum filter dials are set to non-NONE positions. |
| **Tube Warmth off** | The tube saturation indicator should show **TUBE: 2ND HARM** (orange) when active. |
| **Headphone calibration bypassed** | Ensure a headphone profile other than "Bypass" is selected via **SET**. |
| **Settings changed on Mixer but not applied** | The engine applies changes live. If not responsive, tap the **amber Refresh** button to reinitialize. |
| **Native direct-mode lag** | Live DSP changes apply instantly on the native path (no track restart needed). Check logcat for any `Native DSP live update` errors. |

### UPnP/DLNA Server Not Found

| Possible Cause | Solution |
|----------------|----------|
| **Server on different subnet** | Ensure your Android device and media server are on the same local network. |
| **SSDP blocked** | Some routers block multicast. Try manually adding the server via the **DIRECT URL / IP** tab. |
| **Wrong control path** | The app tries multiple common UPnP control paths automatically. If all fail, enter the correct path manually. |
| **Web browser limitation** | On the web (HTTPS), Mixed Content and Private Network Access restrictions may block local LAN connections. Use the Android APK for full network access. |

---

## Keyboard & Hardware Controls Reference

Biscene DSP Player supports the following physical hardware controls:

| Control | Function |
|---------|----------|
| **Physical Volume Buttons (Android)** | Adjust the in-app master volume (steps 0–15). Also visible as the rotation of the MachinedWheel. |
| **Bluetooth Media Button (Play/Pause)** | Toggles playback start/pause via Android's MediaSession integration. |
| **Bluetooth Media Button (Next / Previous)** | Skip to next or previous track in the queue. |
| **USB-C / 3.5mm DAC** | Bit-perfect output is routed through Android's AudioTrack at 96 kHz when connected. |
| **Touch / Mouse** | All on-screen controls support both touch and mouse interaction. The volume wheel supports drag-rotation, mouse-wheel, and direct tap. |

> **Note:** There are currently no software keyboard shortcuts. All DSP and transport controls are accessed through the interactive hardware-chassis UI. Physical media buttons are handled by the Android system's MediaSession layer and relay play/pause/next/previous to the app.

---

## Supported Formats

Biscene DSP Player supports a comprehensive range of audio formats through its dual-path decoding architecture (native MediaCodec for network/hi-res, Web Audio for local):

### Hi-Res / Lossless Formats

| Format | Extension | Details |
|--------|-----------|---------|
| **DSF** | `.dsf` | DSD64 / DSD128 / DSD256, native decoder → Float32 PCM |
| **DSDIFF** | `.dff` | DSD64 / DSD128, native decoder → Float32 PCM |
| **FLAC** | `.flac` | Up to 384 kHz / 24-bit, gapless |
| **ALAC** | `.m4a`, `.alac` | Apple Lossless, up to 384 kHz / 24-bit |
| **WAV** | `.wav` | Uncompressed PCM, including RF64 and Broadcast Wave |
| **AIFF** | `.aiff`, `.aif` | Uncompressed PCM with ID3 artwork support |
| **APE** | `.ape` | Monkey's Audio (lossless) |
| **WV** | `.wv` | WavPack (lossless or hybrid) |

### Compressed / Streaming Formats

| Format | Extension | Details |
|--------|-----------|---------|
| **MP3** | `.mp3` | MPEG-1 Layer 3, variable and constant bitrate |
| **AAC** | `.aac`, `.m4a`, `.m4b` | Advanced Audio Coding, HE-AAC v1/v2 |
| **OGG** | `.ogg`, `.oga` | Ogg Vorbis |
| **OPUS** | `.opus` | Opus (low-latency, adaptive) |
| **WMA** | `.wma` | Windows Media Audio (v9) |

### Playlist Formats

| Format | Details |
|--------|---------|
| **M3U / M3U8** | Standard and extended M3U playlists (UTF-8) |
| **PLS** | Shoutcast-style playlist files |

### Sample Rate Support

| Source Rate | Pipeline Handling |
|-------------|-------------------|
| 44.1 kHz | Native rate conversion to 96 kHz pipeline |
| 48 kHz | Native rate conversion to 96 kHz pipeline |
| 88.2 kHz | Native rate conversion to 96 kHz pipeline |
| 96 kHz | Direct pipeline (no conversion) |
| 176.4 kHz | Native rate conversion to 96 kHz pipeline |
| 192 kHz | Native rate conversion to 96 kHz pipeline |
| 352.8 kHz | Native rate conversion to 96 kHz pipeline |
| 384 kHz | Native rate conversion to 96 kHz pipeline |
| DSD64 (~2.82 MHz) | DOP/PCM via DsfDecoder → 96 kHz |
| DSD128 (~5.64 MHz) | DOP/PCM via DsfDecoder → 96 kHz |
| DSD256 (~11.3 MHz) | DOP/PCM via DsfDecoder → 96 kHz |

### Bit Depth Support

| Depth | Path |
|-------|------|
| 16-bit | All formats (native or converted) |
| 24-bit | FLAC, WAV, AIFF, ALAC, DSF (via Float32 conversion) |
| 32-bit Float | Native MediaCodec Float32 output for hi-res sources |

> **Note:** All audio is processed internally at **96 kHz / 32-bit Float** through the DSP pipeline. Sources with non-matching sample rates are resampled using native Android rate conversion. The final output is delivered to AudioTrack at the pipeline's native 96 kHz rate when using the native (direct) playback path.

---

*© 2025 Biscene Audio. All rights reserved. This manual is provided for users of Biscene DSP Player on Android.*
