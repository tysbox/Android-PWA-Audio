import React, { useRef, useState, useEffect } from 'react';
import { triggerHaptic } from '../utils/haptics';

interface MachinedWheelProps {
  volume: number; // 0 to 15
  maxVolume: number;
  onVolumeChange: (newVolume: number) => void;
  onPresetClick: () => void;
  className?: string;
}

export const MachinedWheel: React.FC<MachinedWheelProps> = ({
  volume,
  maxVolume,
  onVolumeChange,
  onPresetClick,
  className = '',
}) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastAngleRef = useRef(0);
  const volumeRef = useRef(volume);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Compute rotation angle (0 to 280 deg)
  const rotationAngle = (volume / Math.max(1, maxVolume)) * 270;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('#preset-center-button')) {
      return;
    }

    if (!wheelRef.current) return;
    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    lastAngleRef.current = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !wheelRef.current) return;
    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

    let delta = currentAngle - lastAngleRef.current;
    if (delta > 180) delta -= 360;
    else if (delta < -180) delta += 360;

    // Stepping threshold
    if (Math.abs(delta) > 8) {
      const volDelta = delta > 0 ? 1 : -1;
      const nextVol = Math.max(0, Math.min(maxVolume, volumeRef.current + volDelta));
      if (nextVol !== volumeRef.current) {
        triggerHaptic('tick');
        onVolumeChange(nextVol);
      }
      lastAngleRef.current = currentAngle;
    }
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const volDelta = e.deltaY < 0 ? 1 : -1;
    const nextVol = Math.max(0, Math.min(maxVolume, volume + volDelta));
    if (nextVol !== volume) {
      triggerHaptic('tick');
      onVolumeChange(nextVol);
    }
  };

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* Outer Dial Container */}
      <div
        ref={wheelRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br from-[#d1d5db] via-[#9ca3af] to-[#4b5563] p-1.5 border-[2px] border-black/50 shadow-[0_12px_24px_rgba(0,0,0,0.6),inset_0_2px_4px_rgba(255,255,255,0.8)] flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        title="Rotate outer ring to adjust Master Volume, click center for Presets"
      >
        {/* Diamond Knurled Outer Edge Ring */}
        <div className="absolute inset-1 rounded-full knurl-edge opacity-60 pointer-events-none" />

        {/* Brushed Metal Concentric Plate - Rotates with volume */}
        <div
          className="relative w-full h-full rounded-full bg-gradient-to-tr from-[#9ca3af] via-[#e5e7eb] to-[#9ca3af] border border-black/40 shadow-inner flex items-center justify-center overflow-hidden transition-transform duration-75 ease-out"
          style={{ transform: `rotate(${rotationAngle}deg)` }}
        >
          {/* Concentric lathe groove rings */}
          <div className="absolute inset-2 rounded-full border border-black/10 pointer-events-none" />
          <div className="absolute inset-4 rounded-full border border-black/10 pointer-events-none" />

          {/* Center PRESET Button with machined bevel (counter-rotated to stay upright) */}
          <button
            id="preset-center-button"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic('click');
              onPresetClick();
            }}
            style={{ transform: `rotate(${-rotationAngle}deg)` }}
            className="relative w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-gradient-to-b from-[#f9fafb] via-[#e5e7eb] to-[#9ca3af] border-[1.5px] border-black/40 shadow-[0_4px_8px_rgba(0,0,0,0.4),inset_0_1px_2px_rgba(255,255,255,1)] active:scale-95 transition-transform flex flex-col items-center justify-center cursor-pointer group focus:outline-none z-10"
          >
            <span className="text-[10px] sm:text-[11px] font-black font-mono-tech tracking-wider text-neutral-800 group-hover:text-black transition-colors drop-shadow-[0_1px_0_rgba(255,255,255,0.9)]">
              PRESET
            </span>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_4px_#f59e0b]" />
              <span className="text-[7.5px] font-bold text-neutral-700 font-mono-tech">
                VOL {volume}/{maxVolume}
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
