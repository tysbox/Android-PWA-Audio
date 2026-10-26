import React, { useRef, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { MetalButton, MetalCircleButton } from './MetalButtons';
import { MachinedWheel } from './MachinedWheel';
import { VuMeter } from './VuMeter';

interface PlayerControlsProps {
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
  onOpenWiki: () => void;
  currentTrackTitle?: string;
  currentTime?: number;
  duration?: number;
  onSeek?: (seconds: number) => void;
  peakLevels?: { left: number; right: number };
  isPlayingActive?: boolean;
  dspRunning?: boolean;
  dspBypassed?: boolean;
  // Phase 2-⑦: Preset history navigation (optional)
  presetHistoryLength?: number;
  historyIndex?: number;
  canNavigatePrev?: boolean;
  canNavigateNext?: boolean;
  onSwipePreset?: (direction: 'prev' | 'next') => void;
}

interface ScrubBarProps {
  value: number;
  max: number;
  onSeek?: (val: number) => void;
}

const ScrubBar: React.FC<ScrubBarProps> = ({ value, max, onSeek }) => {
  const [localValue, setLocalValue] = React.useState<number | null>(null);

  // Sync local value when not dragging
  const displayValue = localValue !== null ? localValue : value;

  return (
    <input
      type="range"
      min="0"
      max={max || 100}
      step="0.1"
      value={displayValue}
      onInput={(e) => setLocalValue(parseFloat((e.target as HTMLInputElement).value))}
      onChange={(e) => {
        const val = parseFloat(e.target.value);
        setLocalValue(null);
        onSeek?.(val);
      }}
      className="w-full h-1.5 bg-neutral-400 rounded-lg appearance-none cursor-pointer accent-neutral-800 border border-neutral-500 shadow-inner"
    />
  );
};

export const PlayerControls: React.FC<PlayerControlsProps> = ({
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
  onOpenWiki,
  currentTrackTitle,
  currentTime = 0,
  duration = 0,
  onSeek,
  peakLevels = { left: 0, right: 0 },
  isPlayingActive = false,
  dspRunning = false,
  dspBypassed = false,
  presetHistoryLength = 0,
  historyIndex = -1,
  canNavigatePrev = false,
  canNavigateNext = false,
  onSwipePreset,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase 2-⑦: Swipe state for preset name area
  const presetTouchStartY = useRef<number | null>(null);
  const [swipeFlash, setSwipeFlash] = useState<'prev' | 'next' | null>(null);

  const isLiveStream = !isFinite(duration) || duration <= 0;

  // Phase 2-⑦: Swipe handlers for preset name area
  const SWIPE_THRESHOLD = 30; // px

  const handlePresetTouchStart = (e: React.TouchEvent) => {
    if (!onSwipePreset) return;
    presetTouchStartY.current = e.touches[0].clientY;
  };

  const handlePresetTouchEnd = (e: React.TouchEvent) => {
    if (!onSwipePreset || presetTouchStartY.current === null) return;
    const startY = presetTouchStartY.current;
    const endY = e.changedTouches[0].clientY;
    const deltaY = endY - startY;
    presetTouchStartY.current = null;

    if (deltaY > SWIPE_THRESHOLD && canNavigatePrev) {
      onSwipePreset('prev');
      setSwipeFlash('prev');
      setTimeout(() => setSwipeFlash(null), 220);
    } else if (deltaY < -SWIPE_THRESHOLD && canNavigateNext) {
      onSwipePreset('next');
      setSwipeFlash('next');
      setTimeout(() => setSwipeFlash(null), 220);
    }
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div
      id="biscene-player-controls"
      className="w-full h-full flex flex-col justify-between items-center px-2 py-1 select-none"
    >
      {/* Hidden file input for native individual file picking */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onPickFiles(e.target.files);
            e.target.value = '';
          }
        }}
        multiple
        accept="audio/*,.mp3,.wav,.flac,.aac,.m4a,.ogg,.alac,.aiff,.wma,.dsf,.dff,.opus"
        className="hidden"
      />

      {/* SAF folder playback is launched natively — no hidden folder input needed */}

      {/* 1. Top Transport Controls */}
      <div className="w-full flex items-center justify-between px-1 pt-0.5">
        <MetalCircleButton
          text="<<"
          title="Previous Track"
          onClick={onPrevTrack}
          id="btn-prev"
        />
        <MetalCircleButton
          text="■"
          title="Stop Playback"
          onClick={onStopPlayback}
          id="btn-stop"
        />
        <MetalCircleButton
          text="||"
          title="Pause Playback"
          onClick={() => {
            if (isFileActive) onPlayPauseToggle();
          }}
          className={!isFileActive ? 'opacity-50' : ''}
          // V4.5.8: "playing" indicator — the center transport button glows
          // amber while audio is actively playing (was permanently unlit,
          // reading as "stopped" during playback).
          textColor={isFileActive && !isPaused
            ? 'text-[#FFA000] drop-shadow-[0_0_8px_rgba(255,160,0,0.95)]'
            : 'text-neutral-700'}
          id="btn-pause"
        />
        <MetalCircleButton
          text="▶"
          title="Play (DSP Green LED Indicator)"
          onClick={() => {
            if (!isFileActive || isPaused) onPlayPauseToggle();
          }}
          textColor={
            dspRunning && !dspBypassed
              ? 'text-[#00E676] drop-shadow-[0_0_8px_rgba(0,230,118,0.9)]'
              : dspBypassed
              ? 'text-[#FFA000] drop-shadow-[0_0_8px_rgba(255,160,0,0.9)]'
              : 'text-neutral-700'
          }
          id="btn-play"
        />
        <MetalCircleButton
          text=">>"
          title="Next Track"
          onClick={onNextTrack}
          id="btn-next"
        />
      </div>

      {/* 2. Playback Indicator Bar (Placed directly above Volume Wheel) */}
      <div className="w-full text-center my-1 px-2 py-1 bg-black/15 rounded-md border border-black/20 shadow-inner">
        {totalTracks > 0 ? (
          <div className="flex flex-col items-center">
            <div className="w-full flex items-center justify-between text-[9px] font-bold font-mono-tech text-neutral-800 tracking-wider">
              <span>TRACK {currentIndex + 1} / {totalTracks}</span>
              {isFileActive && (
                <span className="text-neutral-700 font-semibold">
                  {isPaused ? '[PAUSED]' : '[PLAYING]'}
                </span>
              )}
            </div>
            {currentTrackTitle && (
              <span className="text-[10.5px] font-bold text-neutral-900 truncate max-w-[220px] drop-shadow-[0_1px_0_rgba(255,255,255,0.8)] my-0.5">
                {currentTrackTitle}
              </span>
            )}
            {/* Timeline Progress / Scrub Bar */}
            <div className="w-full flex items-center gap-1.5 mt-0.5">
              <span className="text-[8px] font-mono-tech text-neutral-700 shrink-0">
                {formatTime(currentTime)}
              </span>
              {isLiveStream && isFileActive ? (
                <div className="w-full h-1.5 bg-neutral-800/80 rounded-full flex items-center px-1 border border-neutral-600 shadow-inner overflow-hidden">
                  <div className="h-full w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 animate-pulse rounded-full" />
                </div>
              ) : (
                <ScrubBar value={currentTime} max={duration} onSeek={onSeek} />
              )}
              <span className="text-[8px] font-mono-tech text-neutral-700 shrink-0">
                {isLiveStream && isFileActive ? '● LIVE' : formatTime(duration)}
              </span>
            </div>
          </div>
        ) : (
          <span className="text-[9px] font-mono-tech text-neutral-600 uppercase tracking-widest">
            NO TRACKS LOADED
          </span>
        )}
      </div>

      {/* 3. Middle Section: VU Meters flanking Machined Volume Wheel on both sides */}
      <div className="w-full flex items-center justify-between px-2 my-auto">
        {/* Left VU Meter - Height strictly matched to Machined Wheel */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[7.5px] font-black font-mono-tech text-neutral-700 select-none">
            L
          </span>
          <div className="h-32 sm:h-36 flex items-center">
            <VuMeter level={peakLevels.left} isDimmed={!isPlayingActive} />
          </div>
        </div>

        {/* Center Volume Jog Wheel */}
        <div className="flex flex-col items-center mx-auto">
          <MachinedWheel
            volume={volume}
            maxVolume={maxVolume}
            onVolumeChange={onVolumeChange}
            onPresetClick={onPresetRequest}
          />
          {currentPresetName && (
            <div
              className={`mt-1 flex flex-col items-center ${onSwipePreset && presetHistoryLength > 0 ? 'cursor-pointer' : ''} transition-opacity duration-150 ${swipeFlash ? 'opacity-50' : 'opacity-100'}`}
              onTouchStart={handlePresetTouchStart}
              onTouchEnd={handlePresetTouchEnd}
            >
              {swipeFlash && (
                swipeFlash === 'prev' ? (
                  <ChevronDown className="w-2.5 h-2.5 text-cyan-500 animate-pulse" />
                ) : (
                  <ChevronUp className="w-2.5 h-2.5 text-cyan-500 animate-pulse" />
                )
              )}
              <span className="text-[8.5px] font-mono-tech font-bold text-neutral-700 uppercase tracking-wider">
                [ {currentPresetName} ]
              </span>
              {presetHistoryLength > 1 && (
                <div className="flex items-center gap-[2px] mt-[1px]">
                  {Array.from({ length: presetHistoryLength }).map((_, i) => (
                    <span
                      key={i}
                      className={`w-[3px] h-[3px] rounded-full ${
                        i === historyIndex ? 'bg-cyan-500' : 'bg-neutral-400/40'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right VU Meter - Height strictly matched to Machined Wheel */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="h-32 sm:h-36 flex items-center">
            <VuMeter level={peakLevels.right} isDimmed={!isPlayingActive} />
          </div>
          <span className="text-[7.5px] font-black font-mono-tech text-neutral-700 select-none">
            R
          </span>
        </div>
      </div>

      {/* 4. Bottom Source Buttons (FILES / NETWORK / QUE / INFO) */}
      <div className="w-full max-w-[280px] grid grid-cols-4 gap-1.5 pt-1">
        <MetalButton
          onClick={() => onBrowseLocal()}
          id="btn-source-files"
          className="w-full text-[8px]"
        >
          FILES
        </MetalButton>

        <MetalButton
          onClick={onBrowseNetwork}
          id="btn-source-network"
          className="w-full text-[8px]"
        >
          NET
        </MetalButton>

        <MetalButton
          onClick={onQueToggle}
          id="btn-source-que"
          className="w-full text-[8px]"
        >
          QUE
        </MetalButton>

        <MetalButton
          onClick={onOpenWiki}
          id="btn-source-info"
          className="w-full text-[8px]"
        >
          INFO
        </MetalButton>
      </div>
    </div>
  );
};
