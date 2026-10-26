import React from 'react';

interface MetalPanelProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'silver' | 'titanium' | 'slate';
}

export const MetalPanel: React.FC<MetalPanelProps> = ({
  children,
  className = '',
  variant = 'silver',
}) => {
  const bgClass =
    variant === 'titanium'
      ? 'bg-titanium-panel border-neutral-700/80 text-neutral-100'
      : variant === 'slate'
      ? 'bg-brushed-metal-dark border-neutral-700 text-neutral-100'
      : 'bg-silver-chassis border-white/70 text-neutral-900';

  return (
    <div
      id="biscene-metal-panel"
      className={`relative ${bgClass} rounded-2xl p-3 sm:p-4 border shadow-[inset_0_1px_2px_rgba(255,255,255,0.7),inset_0_-2px_4px_rgba(0,0,0,0.4),0_6px_16px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col ${className}`}
    >
      {/* Subtle brushed metal horizontal micro-grooves overlay */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, #000 2px, #000 3px)',
        }}
      />
      {children}
    </div>
  );
};
