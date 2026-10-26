import React, { useState, useEffect, useRef } from 'react';
import { X, Play, PlusCircle, CheckSquare, Square, Music } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import { NativeImage } from './NativeImage';

export interface SafTrackFile {
  name: string;
  uri: string;
}

export interface LocalBrowserModalProps {
  isOpen: boolean;
  folderName: string;
  files: SafTrackFile[];
  loading?: boolean;
  /** Play the folder starting at the tapped track index or selected tracks */
  onPlay: (startIndex: number, selectedFiles?: SafTrackFile[]) => void;
  onAdd: (selectedFiles?: SafTrackFile[]) => void;
  onClose: () => void;
}

/**
 * RESTORED Local Folder View (SAF flow):
 * Supports "Play All", "Select All", and "Robust Long Press" multi-selection.
 * Supports loading state for metadata fetching (like DLNA modal).
 */
export const LocalBrowserModal: React.FC<LocalBrowserModalProps> = ({
  isOpen,
  folderName,
  files,
  loading = false,
  onPlay,
  onAdd,
  onClose,
}) => {
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Robust long-press state
  const touchTimer = useRef<number | null>(null);
  const touchPos = useRef<{ x: number; y: number } | null>(null);
  const isLongPressActive = useRef(false);

  // Reset state when closing/opening new folder
  useEffect(() => {
    if (!isOpen) {
      setSelectedUris(new Set());
      setIsSelectionMode(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const trackTitle = (name: string) => name.replace(/\.[^/.]+$/, '').replace(/^\d+\s*[-._]\s*/, '');

  const toggleSelect = (uri: string) => {
    setSelectedUris(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      if (next.size === 0) setIsSelectionMode(false);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedUris.size === files.length) {
      setSelectedUris(new Set());
      setIsSelectionMode(false);
    } else {
      setSelectedUris(new Set(files.map(f => f.uri)));
      setIsSelectionMode(true);
    }
  };

  const handleTrackClick = (idx: number, file: SafTrackFile) => {
    // If long press just fired, ignore the subsequent click
    if (isLongPressActive.current) {
      isLongPressActive.current = false;
      return;
    }

    if (isSelectionMode) {
      toggleSelect(file.uri);
    } else {
      onPlay(idx);
    }
  };

  const onTouchStart = (file: SafTrackFile) => (e: React.TouchEvent) => {
    // Stop propagation to prevent accidental parent scrolls
    e.stopPropagation();
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    touchPos.current = { x: touch.clientX, y: touch.clientY };
    isLongPressActive.current = false;

    if (touchTimer.current) window.clearTimeout(touchTimer.current);

    touchTimer.current = window.setTimeout(() => {
      isLongPressActive.current = true;
      try {
        triggerHaptic('heavy');
      } catch (err) {
        console.warn('Haptic failed:', err);
      }

      // Enter selection mode and toggle the current item
      setIsSelectionMode(true);
      toggleSelect(file.uri);

      touchTimer.current = null;
    }, 500); // Back to 500ms standard
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchPos.current || isLongPressActive.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchPos.current.x);
    const dy = Math.abs(touch.clientY - touchPos.current.y);

    // If finger moves more than 15px, it's a scroll, cancel long press
    if (dx > 15 || dy > 15) {
      if (touchTimer.current) {
        window.clearTimeout(touchTimer.current);
        touchTimer.current = null;
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchTimer.current) {
      window.clearTimeout(touchTimer.current);
      touchTimer.current = null;
    }

    // If a long press was just completed, we MUST prevent the synthetic click
    if (isLongPressActive.current) {
      e.preventDefault();
      // Keep isLongPressActive true for a moment to block handleTrackClick
      setTimeout(() => {
        isLongPressActive.current = false;
      }, 100);
    }
  };

  const getSelectedFiles = () => files.filter(f => selectedUris.has(f.uri));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-[420px] max-h-[78vh] mx-2 mb-4 rounded-2xl border border-neutral-700 bg-neutral-950/95 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-950">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-[10px] font-mono-tech tracking-[0.2em] text-neutral-500 uppercase">
                {isSelectionMode ? `${selectedUris.size} Selected` : 'Local Album'}
              </div>
              <div className="flex gap-1.5">
                {files.length > 0 && (
                  <>
                    <button
                      onClick={() => setIsSelectionMode(!isSelectionMode)}
                      className={`text-[9px] font-mono-tech font-bold border px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                        isSelectionMode ? 'text-amber-500 border-amber-900 bg-amber-950/20' : 'text-neutral-400 border-neutral-800'
                      }`}
                    >
                      {isSelectionMode ? 'CANCEL SELECT' : 'SELECT'}
                    </button>
                    {isSelectionMode && (
                      <button
                        onClick={handleSelectAll}
                        className="text-[9px] font-mono-tech font-bold text-emerald-500 hover:text-emerald-400 border border-emerald-900 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                      >
                        {selectedUris.size === files.length ? 'DESELECT ALL' : 'SELECT ALL'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="text-sm font-mono-tech font-bold text-neutral-100 truncate">{folderName}</div>
          </div>
          <div className="flex items-center gap-1">
            {isSelectionMode && (
              <button
                onClick={() => { setIsSelectionMode(false); setSelectedUris(new Set()); }}
                className="p-2 rounded-lg text-amber-500 hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Cancel Selection"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Track list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 bg-neutral-900/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-500">
              <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              <div className="text-[11px] font-mono-tech">読み込み中...</div>
              <div className="text-[9px] opacity-60">メタデータを取得しています</div>
            </div>
          ) : (
            files.map((f, idx) => {
              const isSelected = selectedUris.has(f.uri);
              return (
                <button
                  key={`${f.uri}-${idx}`}
                  type="button"
                  onClick={() => handleTrackClick(idx, f)}
                  onTouchStart={onTouchStart(f)}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                  onContextMenu={(e) => e.preventDefault()} // Block system menu
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer text-left mb-1 select-none ${
                    isSelected ? 'bg-emerald-950/40 border border-emerald-800/50' : 'hover:bg-neutral-800/60 border border-transparent'
                  }`}
                >
                  {isSelectionMode ? (
                    isSelected ? <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" /> : <Square className="w-4 h-4 text-neutral-600 shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center shrink-0 overflow-hidden border border-neutral-700/50">
                      <NativeImage
                        src={`http://127.0.0.1:9600/albumart?uri=${encodeURIComponent(f.uri)}`}
                        className="w-full h-full object-cover"
                        fallback={<Music className="w-4 h-4 text-neutral-600" />}
                        lazy={true}
                      />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className={`text-[13px] font-mono-tech truncate ${isSelected ? 'text-emerald-300' : 'text-neutral-100'}`}>
                      {trackTitle(f.name)}
                    </div>
                    <div className="text-[10px] font-mono-tech text-neutral-500 truncate">{f.name}</div>
                  </div>
                  {!isSelectionMode && <Play className="w-3.5 h-3.5 text-neutral-600 shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {/* Footer actions */}
        <div className="grid grid-cols-2 gap-2 px-3 py-3 border-t border-neutral-800 bg-neutral-950">
          <button
            type="button"
            onClick={() => isSelectionMode ? onPlay(0, getSelectedFiles()) : onPlay(0)}
            disabled={isSelectionMode && selectedUris.size === 0}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-[11px] font-mono-tech font-bold transition-colors cursor-pointer disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5" />
            {isSelectionMode ? `PLAY SELECTED (${selectedUris.size})` : 'PLAY ALL'}
          </button>
          <button
            type="button"
            onClick={() => isSelectionMode ? onAdd(getSelectedFiles()) : onAdd()}
            disabled={isSelectionMode && selectedUris.size === 0}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 text-[11px] font-mono-tech font-bold transition-colors cursor-pointer disabled:opacity-40"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            {isSelectionMode ? `ADD SELECTED` : 'ADD TO QUEUE'}
          </button>
        </div>
      </div>
    </div>
  );
};