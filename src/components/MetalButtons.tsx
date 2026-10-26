import React from 'react';
import { triggerHaptic } from '../utils/haptics';

interface MetalButtonProps {
  children: React.ReactNode;
  isSelected?: boolean;
  onClick: () => void;
  className?: string;
  id?: string;
}

export const MetalButton: React.FC<MetalButtonProps> = ({
  children,
  isSelected = false,
  onClick,
  className = '',
  id,
}) => {
  return (
    <button
      id={id}
      type="button"
      onClick={() => {
        triggerHaptic('click');
        onClick();
      }}
      className={`h-7.5 sm:h-8 px-2.5 rounded-md font-mono-tech text-[9px] font-black tracking-wider uppercase transition-all duration-100 flex items-center justify-center cursor-pointer border ${
        isSelected
          ? 'bg-gradient-to-b from-[#3a3a3a] to-[#1e1e1e] text-white border-black/80 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] scale-[0.98]'
          : 'bg-gradient-to-b from-[#f2f2f2] via-[#d5d5d5] to-[#a8a8a8] text-neutral-800 border-black/30 shadow-[0_2px_4px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.9)] hover:brightness-105 active:scale-95'
      } ${className}`}
    >
      {children}
    </button>
  );
};

interface MetalCircleButtonProps {
  text: string;
  onClick: () => void;
  className?: string;
  textColor?: string;
  id?: string;
  title?: string;
  size?: 'sm' | 'md';
}

export const MetalCircleButton: React.FC<MetalCircleButtonProps> = ({
  text,
  onClick,
  className = '',
  textColor = 'text-neutral-800',
  id,
  title,
  size = 'md',
}) => {
  const sizeClass =
    size === 'sm'
      ? 'w-7.5 h-7.5 sm:w-8 sm:h-8 text-[8.5px]'
      : 'w-8 h-8 sm:w-8.5 sm:h-8.5 text-[9px]';

  return (
    <button
      id={id}
      type="button"
      title={title || text}
      onClick={() => {
        triggerHaptic('click');
        onClick();
      }}
      className={`${sizeClass} rounded-full bg-gradient-to-b from-[#f5f5f5] via-[#d8d8d8] to-[#9e9e9e] border border-black/30 shadow-[0_2px_5px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.9)] active:scale-95 active:shadow-inner transition-transform flex items-center justify-center cursor-pointer font-mono-tech font-black ${textColor} ${className}`}
    >
      {text}
    </button>
  );
};
