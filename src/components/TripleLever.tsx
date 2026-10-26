import React from 'react';
import { triggerHaptic } from '../utils/haptics';

interface TripleLeverProps {
  label: string;
  index: number; // 0: NONE, 1: 50HZ, 2: 60HZ
  onIndexChange: (newIndex: number) => void;
  className?: string;
}

export const TripleLever: React.FC<TripleLeverProps> = ({
  label,
  index,
  onIndexChange,
  className = '',
}) => {
  const options = ['NONE', '50HZ', '60HZ'];

  const handleClick = (targetIndex?: number) => {
    triggerHaptic('click');
    if (targetIndex !== undefined) {
      onIndexChange(targetIndex);
    } else {
      onIndexChange((index + 1) % 3);
    }
  };

  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      {/* Label */}
      <span className="text-[8px] sm:text-[9px] font-extrabold uppercase tracking-[0.15em] text-neutral-700/80 font-mono-tech mb-1.5 drop-shadow-[0_1px_0_rgba(255,255,255,0.7)]">
        {label}
      </span>

      {/* Lever Track */}
      <div
        onClick={() => handleClick()}
        className="relative w-36 sm:w-40 h-7 bg-black/25 rounded-full border border-black/40 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] flex items-center p-1 cursor-pointer"
      >
        {/* Slider Knob */}
        <div
          className="absolute top-1 bottom-1 w-11 rounded-full bg-gradient-to-b from-white via-neutral-300 to-neutral-500 border border-black/30 shadow-[0_2px_4px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] transition-all duration-200 ease-out flex items-center justify-center pointer-events-none"
          style={{
            left:
              index === 0
                ? '4px'
                : index === 1
                ? 'calc(50% - 22px)'
                : 'calc(100% - 48px)',
          }}
        >
          <div className="w-1.5 h-3 border-x border-neutral-600/40" />
        </div>

        {/* Position Labels */}
        <div className="w-full flex justify-between px-2 text-[8px] sm:text-[9px] font-black font-mono-tech z-10 pointer-events-none">
          {options.map((opt, i) => (
            <span
              key={opt}
              className={`transition-colors ${
                index === i
                  ? 'text-neutral-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.8)]'
                  : 'text-neutral-600/40'
              }`}
            >
              {opt}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
