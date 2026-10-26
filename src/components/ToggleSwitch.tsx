import React from 'react';
import { triggerHaptic } from '../utils/haptics';

interface ToggleSwitchProps {
  label: string;
  index: number;
  options: readonly string[];
  onIndexChange: (idx: number) => void;
  className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  label,
  index,
  options,
  onIndexChange,
  className = '',
}) => {
  const handleClick = () => {
    triggerHaptic('click');
    onIndexChange((index + 1) % options.length);
  };

  // Switch handle rotation for 3 positions
  const rotation = index === 0 ? -30 : index === 1 ? 0 : 30;

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <span className="text-[7px] font-mono-tech font-bold text-neutral-800 uppercase mb-0.5 tracking-tighter">
        {label}
      </span>

      <button
        type="button"
        onClick={handleClick}
        className="relative w-8 h-8 rounded bg-gradient-to-b from-[#e0e0e0] to-[#b0b0b0] border border-black/40 shadow-sm flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
      >
        {/* Switch Base Shadow */}
        <div className="absolute w-5 h-5 rounded-full bg-black/10 shadow-inner" />

        {/* Metal Toggle Lever */}
        <div
          className="w-1.5 h-5 bg-gradient-to-b from-neutral-200 via-neutral-400 to-neutral-600 rounded-full border border-black/30 shadow-md transition-transform duration-200 ease-out"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
            <div className="w-full h-1/2 bg-white/20 rounded-t-full" />
        </div>
      </button>

      <span className="text-[7.5px] font-mono-tech font-black text-neutral-700 mt-0.5 leading-none">
        {options[index]}
      </span>
    </div>
  );
};
