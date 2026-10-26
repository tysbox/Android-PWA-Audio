import React from 'react';

interface BisceneLogoProps {
  className?: string;
  isBitPerfect?: boolean;
}

export const BisceneLogo: React.FC<BisceneLogoProps> = ({ className = '', isBitPerfect = false }) => {
  return (
    <div className={`flex flex-col items-center justify-center select-none ${className}`}>
      <div className="flex items-center gap-1.5 opacity-80">
        <span className="text-[13px] font-black italic tracking-wide text-neutral-800 drop-shadow-[0_1px_0_rgba(255,255,255,0.8)]">
          Biscène
        </span>
        <span className="text-[10px] font-bold tracking-wider text-neutral-700 font-mono-tech drop-shadow-[0_1px_0_rgba(255,255,255,0.8)]">
          AUDIO SYSTEM
        </span>
      </div>
      <div className="h-3 min-h-[12px] flex items-center justify-center mt-0.5">
        {isBitPerfect && (
          <span className="text-[8.5px] font-mono-tech font-bold tracking-widest text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.95)]">
            BIT PERFECT
          </span>
        )}
      </div>
    </div>
  );
};
