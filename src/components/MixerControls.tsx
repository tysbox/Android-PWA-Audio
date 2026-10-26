import React from 'react';
import { Sliders } from 'lucide-react';
import { SmallDial } from './SmallDial';
import { MetalButton } from './MetalButtons';
import {
  OUTPUT_EQ_OPTIONS,
  SOURCE_EQ_OPTIONS,
  AMBIENCE_OPTIONS,
  CROSSFEED_OPTIONS,
  SPATIAL_DEPTH_OPTIONS,
} from '../dsp/presets';
import { HeadphoneProfile } from '../types';

interface MixerControlsProps {
  outputEqIdx: number;
  onOutputEqIdxChange: (idx: number) => void;
  sourceEqIdx: number;
  onSourceEqIdxChange: (idx: number) => void;
  humFilterIdx: number;
  onHumFilterIdxChange: (idx: number) => void;
  ambienceIdx: number;
  ambienceIntensity: number;
  onAmbienceIdxChange: (idx: number) => void;
  onAmbienceIntensityChange: (intensity: number) => void;
  crossfeedIdx: number;
  onCrossfeedIdxChange: (idx: number) => void;
  spatialDepthIdx: number;
  onSpatialDepthIdxChange: (idx: number) => void;
  activeHeadphoneProfile: HeadphoneProfile;
  onOpenHeadphoneCalibration: () => void;
  onHoverHeadphoneButton: (isHovered: boolean) => void;
  dspBypassed: boolean;
  onToggleDspBypass: () => void;
  tubeWarmthEnabled: boolean;
  tubeType: 0 | 1;
  tubeBias: number;
  onToggleTubeWarmth: () => void;
  onChangeTubeType: (type: 0 | 1) => void;
  onChangeTubeBias: (bias: number) => void;
  restorationEnabled: boolean;
  onToggleRestoration: () => void;
  phaseInverted?: boolean;
  onTogglePhaseInverted?: () => void;
  onOpenWiki: () => void;
}

export const MixerControls: React.FC<MixerControlsProps> = ({
  outputEqIdx,
  onOutputEqIdxChange,
  sourceEqIdx,
  onSourceEqIdxChange,
  humFilterIdx,
  onHumFilterIdxChange,
  ambienceIdx,
  ambienceIntensity,
  onAmbienceIdxChange,
  onAmbienceIntensityChange,
  crossfeedIdx,
  onCrossfeedIdxChange,
  spatialDepthIdx,
  onSpatialDepthIdxChange,
  activeHeadphoneProfile,
  onOpenHeadphoneCalibration,
  onHoverHeadphoneButton,
  dspBypassed,
  onToggleDspBypass,
  tubeWarmthEnabled,
  tubeType,
  tubeBias,
  onToggleTubeWarmth,
  onChangeTubeType,
  onChangeTubeBias,
  restorationEnabled,
  onToggleRestoration,
  phaseInverted = false,
  onTogglePhaseInverted,
}) => {

  return (
    <div
      id="biscene-mixer-controls"
      className="w-full h-full flex flex-col justify-between items-center px-3 py-1 select-none"
    >
      {/* 1. TOP: PHONE CALIBRATION CARD */}
      <div className="w-full px-1 py-1 shrink-0">
        <div className="w-full h-11 sm:h-12 px-2.5 bg-gradient-to-b from-[#2a2a2a] via-[#1f1f1f] to-[#121212] border border-cyan-500/40 rounded-lg shadow-[inset_0_1px_2px_rgba(0,0,0,0.8),0_2px_4px_rgba(0,0,0,0.4)] flex flex-col justify-between py-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-mono-tech font-bold text-cyan-400 uppercase tracking-wider">Phone Calibration</span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span onMouseEnter={() => onHoverHeadphoneButton(true)} onMouseLeave={() => onHoverHeadphoneButton(false)} className="text-[10px] sm:text-[11px] font-mono-tech font-bold text-white truncate max-w-[160px] cursor-pointer hover:text-cyan-300">
              {activeHeadphoneProfile.modelName}
            </span>
            <button onClick={onOpenHeadphoneCalibration} className="px-2 py-1 bg-cyan-950/90 border border-cyan-500/60 text-cyan-300 rounded text-[9px] font-mono-tech font-bold flex items-center gap-1">
              <Sliders className="w-3 h-3" /><span>SET</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. OPERATION GRID (2 columns x 3 rows) */}
      <div className="w-full flex-1 flex flex-col justify-around py-1">

        {/* ROW 1: X-FEED ANGLE | DISTANCE */}
        <div className="w-full flex items-center justify-around">
          <SmallDial label="ANGLE" options={CROSSFEED_OPTIONS} currentIndex={crossfeedIdx} onIndexChange={onCrossfeedIdxChange} />
          <SmallDial label="DISTANCE" options={SPATIAL_DEPTH_OPTIONS} currentIndex={spatialDepthIdx} onIndexChange={onSpatialDepthIdxChange} />
        </div>

        {/* ROW 2: EQs (OUT EQ | SRC EQ) */}
        <div className="w-full flex items-center justify-around">
          <SmallDial label="OUT EQ" options={OUTPUT_EQ_OPTIONS} currentIndex={outputEqIdx} onIndexChange={onOutputEqIdxChange} />
          <SmallDial label="SRC EQ" options={SOURCE_EQ_OPTIONS} currentIndex={sourceEqIdx} onIndexChange={onSourceEqIdxChange} />
        </div>

        {/* ROW 3: AMB | TUBE with their stable intensity underbars */}
        <div className="w-full flex items-center justify-around">
          <SmallDial
            label="AMB"
            options={AMBIENCE_OPTIONS}
            currentIndex={ambienceIdx}
            onIndexChange={onAmbienceIdxChange}
            intensity={ambienceIntensity}
            onIntensityChange={onAmbienceIntensityChange}
            vuMode={true}
          />
          <SmallDial
            label="TUBE"
            options={['OFF', '300B(EVEN)', 'KT88(ODD)']}
            currentIndex={!tubeWarmthEnabled ? 0 : tubeType + 1}
            onIndexChange={(idx) => {
                if (idx === 0) {
                    if (tubeWarmthEnabled) onToggleTubeWarmth();
                } else {
                    if (!tubeWarmthEnabled) onToggleTubeWarmth();
                    onChangeTubeType((idx - 1) as 0 | 1);
                }
            }}
            intensity={tubeBias}
            onIntensityChange={onChangeTubeBias}
            vuMode={true}
          />
        </div>
      </div>

      {/* 3. BOTTOM CONTROL ROW: Symmetrical 4-button layout matching Player panel */}
      <div className="w-full max-w-[280px] grid grid-cols-4 gap-1.5 pt-1 border-t border-black/10 shrink-0 mt-auto">
        {/* Button 1: STAGE */}
        <MetalButton onClick={onToggleDspBypass} className="w-full text-[8px]">
          <div className="flex flex-col items-center justify-center">
            <span className="text-[7.5px] font-black leading-none text-neutral-800 uppercase tracking-tighter">STAGE</span>
            <div className="h-3 flex items-center justify-center mt-0.5">
              {!dspBypassed && (
                <span className="text-[8.5px] font-mono-tech font-bold text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.95)]">ON</span>
              )}
            </div>
          </div>
        </MetalButton>

        {/* Button 2: PHASE (NEW) */}
        <MetalButton onClick={() => onTogglePhaseInverted?.()} className="w-full text-[8px]">
          <div className="flex flex-col items-center justify-center">
            <span className="text-[7.5px] font-black leading-none text-neutral-800 uppercase tracking-tighter">PHASE</span>
            <div className="h-3 flex items-center justify-center mt-0.5">
              {phaseInverted && (
                <span className="text-[8.5px] font-mono-tech font-bold text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.95)]">180°</span>
              )}
            </div>
          </div>
        </MetalButton>

        {/* Button 3: RESTORE */}
        <MetalButton onClick={onToggleRestoration} className="w-full text-[8px]">
          <div className="flex flex-col items-center justify-center">
            <span className="text-[7.5px] font-black leading-none text-neutral-800 uppercase tracking-tighter">RESTORE</span>
            <div className="h-3 flex items-center justify-center mt-0.5">
              {restorationEnabled && (
                <span className="text-[8.5px] font-mono-tech font-bold text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.95)]">ON</span>
              )}
            </div>
          </div>
        </MetalButton>

        {/* Button 4: HUM */}
        <MetalButton onClick={() => onHumFilterIdxChange((humFilterIdx + 1) % 3)} className="w-full text-[8px]">
          <div className="flex flex-col items-center justify-center">
            <span className="text-[7.5px] font-black leading-none text-neutral-800 uppercase tracking-tighter">HUM</span>
            <div className="h-3 flex items-center justify-center mt-0.5">
              {humFilterIdx === 1 && (
                <span className="text-[8.5px] font-mono-tech font-bold text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.95)]">50H</span>
              )}
              {humFilterIdx === 2 && (
                <span className="text-[8.5px] font-mono-tech font-bold text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.95)]">60H</span>
              )}
            </div>
          </div>
        </MetalButton>
      </div>
    </div>
  );
};
