# Biscene DSPSystem - Development Direction (Final Focus)

This roadmap defines the two primary pillars of Biscene's evolution: Neural High-Fidelity for lossy audio and the "Listening Wiki" experience.

## Pillar 1: High-Fidelity Restoration for Lossy Audio
*Primary goal: Making compressed audio sound like High-Res.*
*   **Neural Harmonic Reconstruction**: Implement an Edge-AI engine to synthesize high-frequency harmonics (20kHz+) lost during MP3/AAC compression, restoring "air" and spatial depth.
*   **Dynamic Range Recovery**: Intelligent processing to counteract the heavy compression used in modern radio edits and low-bitrate streams, bringing back transient punch.
*   **Artifact Suppression Logic**: Custom-tuned algorithms to eliminate pre-echo and watery artifacts typical of lossy codecs without dulling the sound.

## Pillar 2: The "Listening Wiki" Experience
*Primary goal: Providing a deep-dive encyclopedia for every track.*
*   **Technical Liner Notes**: Automatically aggregate and display metadata regarding recording equipment, studio location, and mastering engineers.
*   **Interactive Artist History**: A seamlessly integrated "Wiki" overlay providing contextual biographies, related works, and the musical lineage of the current artist.
*   **Audiophile Gear Insights**: Information on the specific microphones, mixing consoles, and instruments used in legendary recording sessions.

## Pillar 3: Adaptive System Interoperability
*Status: Pending Linux-side specification finalization.*
*   **Remote Control Capability**: Once the Linux/CamillaDSP hardware spec is defined, implement a high-precision remote interface for real-time DSP management.
*   **Transparent Stream Routing**: Serve as a high-end mobile frontend that can hand off bit-perfect data to stationary systems.

---
**Strategy**: Focus on the mobile-first experience by rescuing the sound quality of everyday lossy sources and enriching the user's connection to music through the "Listening Wiki" platform.
