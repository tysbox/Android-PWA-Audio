import React from 'react';

interface WoodFrameProps {
  children: React.ReactNode;
  className?: string;
}

export const WoodFrame: React.FC<WoodFrameProps> = ({ children, className = '' }) => {
  return (
    <div
      id="biscene-wood-chassis"
      className={`relative wood-grain rounded-3xl p-3 sm:p-4 border-[2.5px] border-[#1a0f0a] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),inset_0_2px_4px_rgba(255,255,255,0.12),inset_0_-3px_6px_rgba(0,0,0,0.8)] ${className}`}
    >
      {children}
    </div>
  );
};
