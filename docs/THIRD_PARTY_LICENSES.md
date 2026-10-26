# Third-Party Components & Licenses

This project bundles or depends on the following third-party components.

## CamillaDSP

- **Author:** Henrik Enquist
- **Source:** https://github.com/HEnquist/camilladsp
- **License:** GNU General Public License v3.0 (GPLv3) — full text:
  https://github.com/HEnquist/camilladsp/blob/master/LICENSE.txt
- **How it's used here:** CamillaDSP is cross-compiled unmodified for Android (see
  `app/src/main/kotlin/com/bisen/player/engine/CamillaDspProcess.kt` for the build command)
  and bundled as an executable file, named `libcamilladsp.so` purely so Android's app
  packager extracts it with the executable bit set — it is run as a **separate subprocess**
  via `ProcessBuilder`, communicating over named pipes and a local WebSocket connection. It
  is not linked into, or compiled together with, this application's own code.
- **Source availability:** Per GPLv3 §6, the corresponding source code for the exact
  CamillaDSP version bundled in this app is available unmodified at the link above. No
  changes have been made to CamillaDSP's source.
- **Note on scope:** Because CamillaDSP runs as an independent subprocess (not a linked
  library), this application's own source code is not itself required to be GPL-licensed.
  If you fork or redistribute this project, keep the CamillaDSP binary and this notice
  together, and don't remove or obscure CamillaDSP's own licensing terms.

## Oboe

- **Author:** Google
- **Source:** https://github.com/google/oboe
- **License:** Apache License 2.0 — full text:
  https://github.com/google/oboe/blob/main/LICENSE
- **How it's used here:** Statically/dynamically linked native audio library
  (`app/src/main/cpp/audio_engine.cpp`), used per its license terms.

## Reverb impulse response files (`app/src/main/assets/ir/`)

- **Files:** `hall.wav`, `jazz_club.wav`, `large_bottle_hall.wav`, `st_nicolaes_church.wav`
- **Original source:** Voxengo free impulse response library —
  http://www.voxengo.com/impulses/
- **Mirror used to obtain these files:** https://github.com/oramics/sampled
  (`IR/Voxengo/samples/`)
- **License (as stated by the distributor, Aleksey Vaneev / Voxengo):** "Permission is
  granted to anyone to use these impulse files royalty-free for any purpose, including
  commercial usage. You may not sell these impulse files or earn any direct or indirect
  profit from their distribution [as standalone impulse response files]."
- **Processing applied:** Resampled from 44.1kHz to 48kHz to match this app's fixed
  CamillaDSP pipeline samplerate, then energy-normalized (scaled so convolution with the
  impulse imparts roughly 0dB gain, plus 6dB of additional safety headroom). The originals
  were peak-normalized but had much higher convolution energy, which caused excessive
  loudness when used unmodified — see processing note for the exact rationale if picking
  up further changes to these files.
- **What this means for you:** Embedding these files in the app (as done here) is
  permitted. Do not extract and redistribute them as a standalone impulse-response pack.

## AndroidX / Jetpack libraries (core-ktx, appcompat, activity-ktx, media3-session, etc.)

- **Author:** Google
- **License:** Apache License 2.0
- Standard Gradle dependencies, unmodified, used per their published license terms. See
  each library's page under https://developer.android.com/jetpack/androidx/versions for
  specifics if needed.
