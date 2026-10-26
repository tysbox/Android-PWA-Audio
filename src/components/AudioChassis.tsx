import React, { useState, useEffect } from 'react';
import { WoodFrame } from './WoodFrame';
import { MetalPanel } from './MetalPanel';
import { AlbumArtFrame } from './AlbumArtFrame';
import { PlayerControls } from './PlayerControls';
import { MixerControls } from './MixerControls';
import { MetalCircleButton } from './MetalButtons';
import { BisceneLogo } from './BisceneLogo';
import { TrackItem, HeadphoneProfile } from '../types';

interface AudioChassisProps {
  aspectRatioLabel?: string;
  // State from parent
  dspRunning: boolean;
  onRefreshStack?: () => void;
  peakLevels: { left: number; right: number };
  isPlayingActive: boolean;
  currentTrack?: TrackItem;
  showDspPanel: boolean;
  onToggleDspPanel: () => void;
  // Player control props
  isFileActive: boolean;
  isPaused: boolean;
  totalTracks: number;
  currentIndex: number;
  currentPresetName: string;
  volume: number;
  maxVolume: number;
  onPickFiles: (files: FileList) => void;
  onBrowseLocal: () => void;
  onBrowseNetwork: () => void;
  onQueToggle: () => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  onStopPlayback: () => void;
  onPlayPauseToggle: () => void;
  onPresetRequest: () => void;
  onVolumeChange: (newVol: number) => void;
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  onRepTrack: () => void;
  /** Current track is the REP-pinned next-launch start track */
  repPinnedToCurrent?: boolean;
  /** True briefly after pressing REP (visual confirmation flash) */
  repJustSet?: boolean;
  onOpenSaveDialog: () => void;
  // Mixer control props
  outputEqIndex: number;
  onOutputEqIdxChange: (idx: number) => void;
  sourceEqIndex: number;
  onSourceEqIdxChange: (idx: number) => void;
  humFilterIndex: number;
  onHumFilterIdxChange: (idx: number) => void;
  ambienceIndex: number;
  ambienceIntensity: number;
  onAmbienceIdxChange: (idx: number) => void;
  onAmbienceIntensityChange: (int: number) => void;
  crossfeedIndex: number;
  onCrossfeedIdxChange: (idx: number) => void;
  spatialDepthIdx: number;
  onSpatialDepthIdxChange: (idx: number) => void;
  // Headphone Calibration & Feature props
  activeHeadphoneProfile: HeadphoneProfile;
  previewHeadphoneProfile?: HeadphoneProfile | null;
  onOpenHeadphoneCalibration: () => void;
  onHoverHeadphoneButton: (isHovered: boolean) => void;
  isCalibratingOrOperating: boolean;
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
  isUsbConnected?: boolean;
  onOpenWiki: () => void;
  // Phase 2-⑦: Preset history navigation (optional)
  presetHistoryLength?: number;
  historyIndex?: number;
  canNavigatePrev?: boolean;
  canNavigateNext?: boolean;
  onSwipePreset?: (direction: 'prev' | 'next') => void;
  // Phase 1-②: Total EQ Curve (optional)
  showTotalCurve?: boolean;
  totalCurveData?: { path: string; maxAbsDb: number } | null;
  activeSourceEqLabel?: string;
  activeOutputEqLabel?: string;
  activeCrossfeedLabel?: string;
  activeAmbienceLabel?: string;
  activeHumFilterLabel?: string;
  calibrationIntensity?: number;
  onTapArtwork?: () => void;
}

export const AudioChassis: React.FC<AudioChassisProps> = ({
  dspRunning,
  onRefreshStack: _onRefreshStack,
  peakLevels,
  isPlayingActive,
  currentTrack,
  showDspPanel,
  onToggleDspPanel,
  isFileActive,
  isPaused,
  totalTracks,
  currentIndex,
  currentPresetName,
  volume,
  maxVolume,
  onPickFiles,
  onBrowseLocal,
  onBrowseNetwork,
  onQueToggle,
  onPrevTrack,
  onNextTrack,
  onStopPlayback,
  onPlayPauseToggle,
  onPresetRequest,
  onVolumeChange,
  currentTime,
  duration,
  onSeek,
  onRepTrack,
  repPinnedToCurrent = false,
  repJustSet = false,
  onOpenSaveDialog,
  outputEqIndex,
  onOutputEqIdxChange,
  sourceEqIndex,
  onSourceEqIdxChange,
  humFilterIndex,
  onHumFilterIdxChange,
  ambienceIndex,
  ambienceIntensity,
  onAmbienceIdxChange,
  onAmbienceIntensityChange,
  crossfeedIndex,
  onCrossfeedIdxChange,
  spatialDepthIdx,
  onSpatialDepthIdxChange,
  activeHeadphoneProfile,
  previewHeadphoneProfile,
  onOpenHeadphoneCalibration,
  onHoverHeadphoneButton,
  isCalibratingOrOperating: _isCalibratingOrOperating,
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
  isUsbConnected = false,
  onOpenWiki,
  showTotalCurve,
  totalCurveData,
  activeSourceEqLabel,
  activeOutputEqLabel,
  activeCrossfeedLabel,
  activeAmbienceLabel,
  activeHumFilterLabel,
  calibrationIntensity,
  onTapArtwork,
  presetHistoryLength,
  historyIndex,
  canNavigatePrev,
  canNavigateNext,
  onSwipePreset,
}) => {
  const profileToDisplay = previewHeadphoneProfile || activeHeadphoneProfile;

  // Dynamic Output Device Detection
  const [outputDeviceLabel, setOutputDeviceLabel] = useState<string>('Speaker / Headphones');

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
          const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
          const activeOut = audioOutputs.find((d) => d.label && d.label.length > 0) || audioOutputs[0];
          if (activeOut && activeOut.label) {
            setOutputDeviceLabel(activeOut.label);
          }
        })
        .catch(() => {});
    }
  }, []);

  const getFormatDisplay = () => {
    if (!currentTrack) {
      return '';
    }

    let fmt = '';
    const url = (currentTrack.url || '').toLowerCase();
    const title = (currentTrack.title || '').toLowerCase();

    if (currentTrack.format) {
      fmt = currentTrack.format;
    } else if (url.endsWith('.flac') || title.includes('flac')) {
      fmt = 'FLAC';
    } else if (url.endsWith('.wav') || title.includes('wav')) {
      fmt = 'WAV';
    } else if (url.endsWith('.mp3') || title.includes('mp3')) {
      fmt = 'MP3';
    } else if (url.endsWith('.m4a') || url.endsWith('.aac') || title.includes('aac')) {
      fmt = 'AAC';
    } else if (url.endsWith('.dsf') || url.endsWith('.dff') || title.includes('dsd')) {
      fmt = 'DSD';
    } else if (url.endsWith('.ogg') || title.includes('ogg')) {
      fmt = 'OGG';
    } else if (currentTrack.genre && currentTrack.genre !== 'Unknown Genre' && !currentTrack.genre.includes('kHz')) {
      fmt = currentTrack.genre;
    }

    if (!fmt) {
      return '';
    }

    const sr = currentTrack.sampleRate ? `${currentTrack.sampleRate / 1000}kHz` : '';
    const bd = currentTrack.bitDepth ? `${currentTrack.bitDepth}-bit` : '';

    const details = [sr, bd].filter(Boolean).join(' ');
    return details ? `${fmt} ${details}` : fmt;
  };

  const getOutputDisplay = () => {
    if (activeHeadphoneProfile && activeHeadphoneProfile.id !== 'flat_bypass' && activeHeadphoneProfile.id !== 'bypass') {
      const brand = activeHeadphoneProfile.brand;
      const model = activeHeadphoneProfile.modelName;
      if (model.toLowerCase().startsWith(brand.toLowerCase())) {
        return model;
      }
      return `${brand} ${model}`;
    }
    return outputDeviceLabel;
  };

  return (
    <div
      className="flex flex-col justify-between my-auto shrink-0"
      // Slightly more elongated (portrait) chassis than the previous 1/2.3 so the
      // center (Player / Mixer) area gains vertical room — this is what keeps the
      // Mixer's bottom 4-button row inside the panel on short devices.
      style={{
        height: 'min(96vh, 900px)',
        width: 'calc(min(96vh, 900px) / 2.42)',
        aspectRatio: '1 / 2.42',
      }}
    >
      <WoodFrame className="w-full h-full flex flex-col justify-between p-2 sm:p-2.5">
        <MetalPanel className="w-full h-full flex flex-col justify-between p-2 sm:p-2.5">
          {/* ========================================================================= */}
          {/* TOP SECTION: FILE DATA & OUTPUT TARGET HEADER + ALBUM ART FRAME           */}
          {/* ========================================================================= */}
          <div className="w-full flex flex-col items-center shrink-0">
            {/* Top Header: 2-Line Direct Metal Panel Print (Real File Format & Dynamic Output Target) */}
            <div className="w-full flex flex-col items-center justify-center pb-1 border-b border-black/20 mb-1 text-center">
              <span className="text-[8px] font-bold font-mono-tech tracking-wider text-neutral-800 leading-tight truncate max-w-full px-1 min-h-[12px] block">
                {getFormatDisplay()}
              </span>
              <span className="text-[8px] font-bold font-mono-tech tracking-wider text-neutral-600 leading-tight truncate max-w-full px-1">
                {getOutputDisplay()}
              </span>
            </div>

            {/* Square Album Art Frame / Harman Target Scope: Exactly matching Earphone Calibration Panel width */}
            <div className="w-full px-4 shrink-0 flex items-center justify-center my-1">
              <div className="w-full aspect-square">
                <AlbumArtFrame
                  image={currentTrack?.albumArtUrl}
                  isPlaying={isPlayingActive}
                  activeHeadphoneProfile={profileToDisplay}
                  showCalibrationCurve={Boolean(previewHeadphoneProfile)}
                  tubeWarmthEnabled={tubeWarmthEnabled}
                  dspBypassed={dspBypassed}
                  showTotalCurve={showTotalCurve}
                  totalCurveData={totalCurveData}
                  activeSourceEqLabel={activeSourceEqLabel}
                  activeOutputEqLabel={activeOutputEqLabel}
                  activeCrossfeedLabel={activeCrossfeedLabel}
                  activeAmbienceLabel={activeAmbienceLabel}
                  activeHumFilterLabel={activeHumFilterLabel}
                  calibrationIntensity={calibrationIntensity}
                  onTap={onTapArtwork}
                  className="w-full h-full"
                />
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* CENTER SECTION: 3D FLIPPABLE PANEL (PLAYER / MIXER)                       */}
          {/* ========================================================================= */}
          <div className="w-full flex-1 relative perspective-1000 my-0.5 min-h-[250px] overflow-hidden">
            <div
              className={`w-full h-full transition-transform duration-500 transform-style-3d relative ${
                showDspPanel ? 'rotate-y-180' : ''
              }`}
            >
              {/* FRONT: Player Controls (with Flanking VU Meters & Top Playback Indicator) */}
              <div className="absolute inset-0 w-full h-full backface-hidden flex flex-col justify-between">
                <PlayerControls
                  isFileActive={isFileActive}
                  isPaused={isPaused}
                  totalTracks={totalTracks}
                  currentIndex={currentIndex}
                  currentPresetName={currentPresetName}
                  volume={volume}
                  maxVolume={maxVolume}
                  onPickFiles={onPickFiles}
  onBrowseLocal={onBrowseLocal}
                  onBrowseNetwork={onBrowseNetwork}
                  onQueToggle={onQueToggle}
                  onPrevTrack={onPrevTrack}
                  onNextTrack={onNextTrack}
                  onStopPlayback={onStopPlayback}
                  onPlayPauseToggle={onPlayPauseToggle}
                  onPresetRequest={onPresetRequest}
                  onVolumeChange={onVolumeChange}
                  onOpenWiki={onOpenWiki}
                  currentTrackTitle={currentTrack?.title}
                  currentTime={currentTime}
                  duration={duration}
                  onSeek={onSeek}
                  peakLevels={peakLevels}
                  isPlayingActive={isPlayingActive}
                  dspRunning={dspRunning}
                  dspBypassed={dspBypassed}
                  // Phase 2-⑦: Preset history navigation
                  presetHistoryLength={presetHistoryLength}
                  historyIndex={historyIndex}
                  canNavigatePrev={canNavigatePrev}
                  canNavigateNext={canNavigateNext}
                  onSwipePreset={onSwipePreset}
                />
              </div>

              {/* BACK: Mixer Controls */}
              <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 flex flex-col justify-between">
                <MixerControls
                  outputEqIdx={outputEqIndex}
                  onOutputEqIdxChange={onOutputEqIdxChange}
                  sourceEqIdx={sourceEqIndex}
                  onSourceEqIdxChange={onSourceEqIdxChange}
                  humFilterIdx={humFilterIndex}
                  onHumFilterIdxChange={onHumFilterIdxChange}
                  ambienceIdx={ambienceIndex}
                  ambienceIntensity={ambienceIntensity}
                  onAmbienceIdxChange={onAmbienceIdxChange}
                  onAmbienceIntensityChange={onAmbienceIntensityChange}
                  crossfeedIdx={crossfeedIndex}
                  onCrossfeedIdxChange={onCrossfeedIdxChange}
                  spatialDepthIdx={spatialDepthIdx}
                  onSpatialDepthIdxChange={onSpatialDepthIdxChange}
                  activeHeadphoneProfile={activeHeadphoneProfile}
                  onOpenHeadphoneCalibration={onOpenHeadphoneCalibration}
                  onHoverHeadphoneButton={onHoverHeadphoneButton}
                  dspBypassed={dspBypassed}
                  onToggleDspBypass={onToggleDspBypass}
                  tubeWarmthEnabled={tubeWarmthEnabled}
                  tubeType={tubeType}
                  tubeBias={tubeBias}
                  onToggleTubeWarmth={onToggleTubeWarmth}
                  onChangeTubeType={onChangeTubeType}
                  onChangeTubeBias={onChangeTubeBias}
                  restorationEnabled={restorationEnabled}
                  onToggleRestoration={onToggleRestoration}
                  phaseInverted={phaseInverted}
                  onTogglePhaseInverted={onTogglePhaseInverted}
                  onOpenWiki={onOpenWiki}
                />
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BOTTOM SECTION: REP/REG + LOGO + PLY/MIX TOGGLE (COMPACT & BALANCED)      */}
          {/* ========================================================================= */}
          <div className="w-full flex items-center justify-between pt-1 border-t border-black/20 shrink-0">
            {/* Left Button: REP (Player Mode) or REG (Mixer Mode) */}
            {!showDspPanel ? (
              <MetalCircleButton
                text={repJustSet ? 'SET' : 'REP'}
                title={
                  repPinnedToCurrent
                    ? 'REP pin active: THIS track starts on next launch'
                    : 'REP: pin current track as next-launch start'
                }
                onClick={onRepTrack}
                textColor={repJustSet || repPinnedToCurrent ? 'text-emerald-700' : undefined}
                size="sm"
                id="btn-rep"
              />
            ) : (
              <MetalCircleButton
                text="REG"
                title="Save current parameters to a new preset"
                onClick={onOpenSaveDialog}
                textColor="text-red-700"
                size="sm"
                id="btn-reg"
              />
            )}

            {/* Center Brand Logo with BIT PERFECT indicator */}
            <BisceneLogo isBitPerfect={isUsbConnected && dspBypassed} />

            {/* Right Button: Flip to MIX (when in Player) / Flip to PLY (when in Mixer) */}
            <MetalCircleButton
              text={showDspPanel ? 'PLY' : 'MIX'}
              title={showDspPanel ? 'Switch to Player Deck' : 'Switch to Mixer & DSP Deck'}
              onClick={onToggleDspPanel}
              textColor={showDspPanel ? 'text-blue-700' : 'text-neutral-800'}
              size="sm"
              id="btn-flip"
            />
          </div>
        </MetalPanel>
      </WoodFrame>
    </div>
  );
};
