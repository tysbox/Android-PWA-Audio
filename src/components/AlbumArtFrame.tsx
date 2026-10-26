import React, { useState, useEffect } from 'react';
import { Disc3, Activity } from 'lucide-react';
import { HeadphoneProfile } from '../types';
import { calculateProfileResponseCurve } from '../dsp/headphoneProfiles';
import { NativeImage } from './NativeImage';

export interface TotalCurveData {
  path: string;
  maxAbsDb: number;
}

interface AlbumArtFrameProps {
  image?: string | null;
  isPlaying?: boolean;
  className?: string;
  activeHeadphoneProfile?: HeadphoneProfile | null;
  showCalibrationCurve?: boolean;
  tubeWarmthEnabled?: boolean;
  dspBypassed?: boolean;
  // Phase 1-②: Total EQ Curve (optional, defaults preserve existing behavior)
  showTotalCurve?: boolean;
  totalCurveData?: TotalCurveData | null;
  activeSourceEqLabel?: string;
  activeOutputEqLabel?: string;
  activeCrossfeedLabel?: string;
  activeAmbienceLabel?: string;
  activeHumFilterLabel?: string;
  calibrationIntensity?: number;
  onTap?: () => void;
}

export const AlbumArtFrame: React.FC<AlbumArtFrameProps> = ({
  image,
  isPlaying = false,
  className = '',
  activeHeadphoneProfile,
  showCalibrationCurve = false,
  tubeWarmthEnabled = false,
  dspBypassed = false,
  showTotalCurve = false,
  totalCurveData = null,
  activeSourceEqLabel,
  activeOutputEqLabel,
  activeCrossfeedLabel,
  activeAmbienceLabel,
  activeHumFilterLabel,
  calibrationIntensity = 1,
  onTap,
}) => {
  // Headphone calibration curve (for hover preview, album mode only)
  const curveData = activeHeadphoneProfile
    ? calculateProfileResponseCurve(activeHeadphoneProfile, 128, 128)
    : null;

  const [internalTotalMode, setInternalTotalMode] = useState(false);

  // Sync external prop to internal state when total mode is fully wired up
  useEffect(() => {
    setInternalTotalMode(showTotalCurve);
  }, [showTotalCurve]);

  const inTotalMode = showTotalCurve && internalTotalMode && totalCurveData !== null;

  const handleClick = () => {
    if (!onTap) return;
    onTap();
  };

  const showOverCorrectionWarning = inTotalMode && totalCurveData && totalCurveData.maxAbsDb > 3.0;

  // Build active effects list (skip NONE values)
  const effects: { label: string; value: string }[] = [];
  if (activeSourceEqLabel && activeSourceEqLabel !== 'NONE') {
    effects.push({ label: 'SRC EQ', value: activeSourceEqLabel });
  }
  if (activeOutputEqLabel && activeOutputEqLabel !== 'NONE') {
    effects.push({ label: 'OUT EQ', value: activeOutputEqLabel });
  }
  if (activeHeadphoneProfile && activeHeadphoneProfile.id !== 'flat_bypass') {
    effects.push({
      label: 'HEADPHONE',
      value: `${activeHeadphoneProfile.modelName} (${Math.round(calibrationIntensity * 100)}%)`,
    });
  }
  if (activeCrossfeedLabel && activeCrossfeedLabel !== 'NONE') {
    effects.push({ label: 'X-FEED', value: activeCrossfeedLabel });
  }
  if (activeAmbienceLabel && activeAmbienceLabel !== 'NONE') {
    effects.push({ label: 'AMB', value: activeAmbienceLabel });
  }
  if (activeHumFilterLabel && activeHumFilterLabel !== 'NONE') {
    effects.push({ label: 'HUM', value: activeHumFilterLabel });
  }

  // If tube warmth is active, surface it in the effects list (post-DSP coloration)
  if (tubeWarmthEnabled) {
    effects.push({ label: 'TUBE', value: '2ND HARM' });
  }

  return (
    <div
      id="biscene-album-frame"
      className={`relative aspect-square rounded-xl bg-neutral-950 p-1 border border-white/40 shadow-[0_4px_16px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(255,255,255,0.3)] overflow-hidden ${onTap ? 'cursor-pointer hover:brightness-105 transition-all' : ''} ${className}`}
      onClick={handleClick}
    >
      {/* 0. Total EQ Curve Mode (highest priority overlay) */}
      {inTotalMode && totalCurveData ? (
        <div className="w-full h-full rounded-lg bg-neutral-950/95 p-1.5 flex flex-col justify-between border border-cyan-500/40 relative select-none">
          {/* Top Info Bar */}
          <div className="flex items-center justify-between border-b border-cyan-900/40 pb-0.5">
            <div className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-cyan-400 animate-pulse" />
              <span className="text-[7.5px] font-mono-tech font-bold text-cyan-300 uppercase tracking-tight">
                TOTAL EQ CURVE
              </span>
            </div>
            <span className="text-[6.5px] font-mono-tech text-cyan-400/70 uppercase">
              TAP FOR ARTWORK
            </span>
          </div>

          {/* ±3 dB Over-correction warning */}
          {showOverCorrectionWarning && (
            <div className="mt-0.5 px-1 py-0.5 bg-red-950/80 border border-red-500/60 rounded text-[7px] font-mono-tech font-bold text-red-300 leading-tight">
              ⚠ TOTAL {totalCurveData.maxAbsDb.toFixed(1)} dB EXCEEDS SAFE RANGE
            </div>
          )}

          {/* SVG Frequency Response Curve */}
          <div className="w-full flex-1 flex items-center justify-center relative py-0.5 min-h-0">
            <svg
              viewBox="0 0 128 90"
              className="w-full h-full overflow-visible"
              preserveAspectRatio="xMidYMid meet"
            >
              <line x1="8" y1="45" x2="120" y2="45" stroke="#334155" strokeDasharray="2 2" strokeWidth="0.8" />
              <line x1="8" y1="22" x2="120" y2="22" stroke="#1e293b" strokeDasharray="1 3" strokeWidth="0.5" />
              <line x1="8" y1="68" x2="120" y2="68" stroke="#1e293b" strokeDasharray="1 3" strokeWidth="0.5" />
              <line x1="36" y1="6" x2="36" y2="84" stroke="#1e293b" strokeDasharray="1 3" strokeWidth="0.5" />
              <line x1="64" y1="6" x2="64" y2="84" stroke="#1e293b" strokeDasharray="1 3" strokeWidth="0.5" />
              <line x1="92" y1="6" x2="92" y2="84" stroke="#1e293b" strokeDasharray="1 3" strokeWidth="0.5" />

              <text x="10" y="44" fill="#64748b" fontSize="6" fontFamily="monospace">0dB</text>
              <text x="10" y="21" fill="#475569" fontSize="5" fontFamily="monospace">+5</text>
              <text x="10" y="67" fill="#475569" fontSize="5" fontFamily="monospace">-5</text>

              {/* Total curve (path coordinates are in 300x70 viewBox - scale to 128x90) */}
              {totalCurveData && (
                <g transform="translate(-8, 0) scale(0.4, 1.28)">
                  <path
                    d={totalCurveData.path}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={totalCurveData.path}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="7"
                    strokeOpacity="0.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              )}
            </svg>
          </div>

          {/* Active Effects List */}
          <div className="flex flex-col gap-[2px] bg-black/40 rounded px-1 py-1 border border-cyan-900/30 max-h-[40%]">
              {effects.length === 0 ? (
                <span className="text-[7px] font-mono-tech text-neutral-500 text-center py-1">
                  NO EFFECTS ACTIVE
                </span>
              ) : (
                effects.map((eff, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-1 text-[7px] font-mono-tech leading-tight">
                    <span className="text-cyan-400/80 font-bold tracking-wider">{eff.label}</span>
                    <span className="text-neutral-300 truncate text-right">{eff.value}</span>
                  </div>
                ))
              )}
            </div>
        </div>
      ) : showCalibrationCurve && activeHeadphoneProfile ? (
        /* 1. Active In-Place Headphone Calibration Response Curve Overlay */
        <div className="w-full h-full rounded-lg bg-neutral-950/95 p-1.5 flex flex-col justify-between border border-cyan-500/40 relative select-none">
          {/* Top Info Bar */}
          <div className="flex items-center justify-between border-b border-cyan-900/40 pb-0.5">
            <div className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-cyan-400 animate-pulse" />
              <span className="text-[7.5px] font-mono-tech font-bold text-cyan-300 uppercase tracking-tight">
                AUTO-EQ HARMAN
              </span>
            </div>
            <span className="text-[7px] font-mono-tech text-neutral-400">
              {activeHeadphoneProfile.bands.length} BANDS
            </span>
          </div>

          {/* Center SVG Frequency Response Curve */}
          <div className="w-full flex-1 flex items-center justify-center relative py-1">
            <svg
              viewBox="0 0 128 90"
              className="w-full h-full overflow-visible"
            >
              <line x1="8" y1="45" x2="120" y2="45" stroke="#334155" strokeDasharray="2 2" strokeWidth="0.8" />
              <line x1="8" y1="22" x2="120" y2="22" stroke="#1e293b" strokeDasharray="1 3" strokeWidth="0.5" />
              <line x1="8" y1="68" x2="120" y2="68" stroke="#1e293b" strokeDasharray="1 3" strokeWidth="0.5" />
              <line x1="36" y1="6" x2="36" y2="84" stroke="#1e293b" strokeDasharray="1 3" strokeWidth="0.5" />
              <line x1="64" y1="6" x2="64" y2="84" stroke="#1e293b" strokeDasharray="1 3" strokeWidth="0.5" />
              <line x1="92" y1="6" x2="92" y2="84" stroke="#1e293b" strokeDasharray="1 3" strokeWidth="0.5" />

              <text x="10" y="44" fill="#64748b" fontSize="6" fontFamily="monospace">0dB</text>
              <text x="10" y="21" fill="#475569" fontSize="5" fontFamily="monospace">+5</text>
              <text x="10" y="67" fill="#475569" fontSize="5" fontFamily="monospace">-5</text>

              {curveData && (
                <>
                  <path
                    d={curveData.path}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={curveData.path}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="3.5"
                    strokeOpacity="0.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}
            </svg>
          </div>

          {/* Model Name & Profile Tag */}
          <div className="flex flex-col items-center bg-black/40 rounded px-1 py-0.5 border border-cyan-900/30">
            <span className="text-[7.5px] font-mono-tech font-bold text-cyan-200 truncate max-w-[110px]">
              {activeHeadphoneProfile.modelName}
            </span>
            <span className="text-[6.5px] font-mono-tech text-neutral-400 tracking-wider">
              {activeHeadphoneProfile.targetCurve}
            </span>
          </div>
        </div>
      ) : image ? (
        /* 2. Standard Album Artwork (Using Native Proxy for CORS) */
        <NativeImage
          src={image}
          className="w-full h-full object-cover rounded-lg"
          fallback={
            <div className="w-full h-full rounded-lg bg-neutral-900 flex items-center justify-center border border-neutral-800">
               <Disc3 className="w-8 h-8 text-neutral-600/60" />
            </div>
          }
        />
      ) : (
        /* 3. Vinyl Grooves Background */
        <div className="w-full h-full rounded-lg bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 border border-neutral-800 flex flex-col items-center justify-center relative overflow-hidden">
          <div
            className={`w-36 h-36 rounded-full border-[10px] border-neutral-800/60 border-t-neutral-700/80 border-r-neutral-800/40 flex items-center justify-center ${
              isPlaying ? 'animate-spin [animation-duration:6s]' : ''
            }`}
          >
            <div className="w-20 h-20 rounded-full border-[6px] border-neutral-700/50 flex items-center justify-center bg-neutral-900 shadow-inner">
              <Disc3 className="w-8 h-8 text-neutral-600/60" />
            </div>
          </div>
          <span className="absolute bottom-2 text-[9px] font-mono-tech tracking-widest text-neutral-500/70 font-semibold uppercase">
            NO ARTWORK
          </span>
        </div>
      )}

      {/* Floating Status Badges (always visible, both modes) */}
      <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 pointer-events-none">
        {dspBypassed && (
          <span className="px-1.5 py-0.5 rounded bg-amber-500/90 text-black text-[7px] font-mono-tech font-black uppercase tracking-wider shadow">
            BYPASS (DIRECT)
          </span>
        )}
        {tubeWarmthEnabled && !dspBypassed && (
          <span className="px-1.5 py-0.5 rounded bg-orange-600/90 text-white text-[7px] font-mono-tech font-bold uppercase tracking-wider shadow animate-pulse">
            TUBE WARMTH
          </span>
        )}
      </div>
    </div>
  );
};