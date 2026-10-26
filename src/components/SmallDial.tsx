import React from 'react';
import { triggerHaptic } from '../utils/haptics';

interface SmallDialProps {
  label: string;
  options: readonly string[] | string[];
  currentIndex: number;
  onIndexChange: (newIndex: number) => void;
  intensity?: number;
  onIntensityChange?: (newIntensity: number) => void;
  className?: string;
  size?: 'sm' | 'md';
  customFooter?: React.ReactNode;
  vuMode?: boolean;
  hideBar?: boolean;
}

export const SmallDial: React.FC<SmallDialProps> = ({
  label,
  options,
  currentIndex,
  onIndexChange,
  intensity,
  onIntensityChange,
  className = '',
  size = 'md',
  customFooter,
  vuMode = false,
  hideBar = false,
}) => {
  const isSm = size === 'sm';
  const currentOption = options[currentIndex] || 'OFF';
  const totalOptions = options.length;

  // Angle calculation (-135deg to +135deg)
  const angle =
    totalOptions > 1
      ? -135 + (currentIndex / (totalOptions - 1)) * 270
      : -135;

  const handleClickDial = () => {
    triggerHaptic('click');
    onIndexChange((currentIndex + 1) % totalOptions);
  };

  return (
    <div className={`flex flex-col items-center select-none ${isSm ? 'w-16' : 'w-20 sm:w-24'} ${className}`}>
      {/* Top Value Display */}
      <span className={`${isSm ? 'text-[7px]' : 'text-[8.5px] sm:text-[9.5px]'} font-bold font-mono-tech uppercase text-neutral-800 h-3.5 flex items-center tracking-tight truncate max-w-full drop-shadow-[0_1px_0_rgba(255,255,255,0.7)]`}>
        {currentOption}
      </span>

      {/* Rotary Dial */}
      <button
        type="button"
        onClick={handleClickDial}
        className={`relative ${isSm ? 'w-8 h-8' : 'w-11 h-11 sm:w-12 sm:h-12'} rounded-full bg-gradient-to-br from-[#555] via-[#383838] to-[#222] border-[1.5px] border-black/60 shadow-[0_3px_6px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)] active:scale-95 transition-transform cursor-pointer flex items-center justify-center group my-1 focus:outline-none`}
        title={`Click to cycle ${label}`}
      >
        {/* Dial Rim Texture */}
        <div className={`absolute inset-0.5 rounded-full border border-neutral-600/40 bg-radial from-[#4a4a4a] via-[#333] to-[#222]`} />

        {/* Rotating Indicator */}
        <div
          className="absolute inset-0 flex items-start justify-center transition-transform duration-200 ease-out"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <div className={`${isSm ? 'w-[2px] h-2' : 'w-[2.5px] h-3 sm:h-3.5'} bg-[#FF1744] rounded-full mt-0.5 shadow-[0_0_3px_#FF1744]`} />
        </div>

        {/* Center OFF text if index is 0 */}
        {currentIndex === 0 && (
          <span className={`${isSm ? 'text-[6px]' : 'text-[8px]'} font-black text-white/20 tracking-wider`}>OFF</span>
        )}
      </button>

      {/* Bottom Label */}
      <span className={`${isSm ? 'text-[6.5px]' : 'text-[7.5px] sm:text-[8.5px]'} font-extrabold uppercase tracking-[0.12em] text-neutral-700/80 font-mono-tech`}>
        {label}
      </span>

      {/* Intensity Bar or Custom Footer */}
      {hideBar ? null : customFooter ? (
        customFooter
      ) : (
        intensity !== undefined && onIntensityChange && (
          <div className={`mt-1 ${isSm ? 'w-8' : 'w-11 sm:w-12'} flex items-center justify-between bg-black/40 px-1 py-0.5 rounded-[2px] border border-black/50 shadow-inner`}>
            {Array.from({ length: 10 }).map((_, step) => {
              const stepValue = (step + 1) * 10;
              const isFilled = intensity >= stepValue;
              return (
                <button
                  key={step}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic('tick');
                    onIntensityChange(stepValue);
                  }}
                  className={`${isSm ? 'w-[1.5px] h-0.5' : 'w-[2.5px] h-1'} rounded-[0.5px] transition-colors cursor-pointer ${
                    isFilled
                      ? vuMode
                        ? step < 6 ? 'bg-emerald-500 shadow-[0_0_2px_#10b981]' : step < 8 ? 'bg-amber-400 shadow-[0_0_2px_#fbbf24]' : 'bg-rose-500 shadow-[0_0_2px_#f43f5e]'
                        : 'bg-neutral-800 shadow-[0_0_1px_rgba(0,0,0,0.9)]'
                      : 'bg-black/25 hover:bg-neutral-600/40'
                  }`}
                />
              );
            })}
          </div>
        )
      )}
    </div>
  );
};
