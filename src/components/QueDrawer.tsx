import React, { useRef } from 'react';
import { TrackItem } from '../types';
import { X, Play, Trash2, GripVertical, FileAudio, FolderPlus } from 'lucide-react';

interface QueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: TrackItem[];
  currentIndex: number;
  onPlayIndex: (index: number) => void;
  onRemoveTrack: (index: number) => void;
  onClearQue: () => void;
  onPickFiles?: (files: FileList) => void;
  onPickFolder?: (files: FileList) => void;
}

export const QueDrawer: React.FC<QueDrawerProps> = ({
  isOpen,
  onClose,
  playlist,
  currentIndex,
  onPlayIndex,
  onRemoveTrack,
  onClearQue,
  onPickFiles,
  onPickFolder,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[80vh]">
        {/* Hidden inputs */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onPickFiles?.(e.target.files);
              e.target.value = '';
            }
          }}
          multiple
          accept="audio/*,.mp3,.wav,.flac,.aac,.m4a,.ogg,.alac,.aiff,.wma,.dsf,.dff,.opus"
          className="hidden"
        />
        <input
          type="file"
          ref={folderInputRef}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              if (onPickFolder) {
                onPickFolder(e.target.files);
              } else {
                onPickFiles?.(e.target.files);
              }
              e.target.value = '';
            }
          }}
          {...({ webkitdirectory: '', directory: '' } as any)}
          multiple
          accept="audio/*,.mp3,.wav,.flac,.aac,.m4a,.ogg,.alac,.aiff,.wma,.dsf,.dff,.opus"
          className="hidden"
        />

        {/* Header */}
        <div className="p-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-black font-mono-tech uppercase tracking-wider text-neutral-100">
              PLAYBACK QUEUE
            </h3>
            <p className="text-[10px] font-mono-tech text-neutral-400 mt-0.5">
              {playlist.length} Tracks In Queue
            </p>
          </div>
          <div className="flex gap-2 items-center">
            {playlist.length > 0 && (
              <button
                onClick={onClearQue}
                className="p-1.5 text-neutral-400 hover:text-red-400 rounded-lg hover:bg-neutral-800 transition-colors"
                title="Clear Queue"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Toolbar for adding local files or folders */}
        <div className="p-2.5 bg-neutral-950/80 border-b border-neutral-800/80 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 py-1.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 border border-emerald-900/60 rounded-lg text-[10.5px] font-mono-tech font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileAudio className="w-3.5 h-3.5" />
            + ファイル追加
          </button>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="flex-1 py-1.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-900/60 rounded-lg text-[10.5px] font-mono-tech font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            + フォルダ一括追加
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {playlist.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-xs font-mono-tech text-neutral-500 uppercase tracking-widest">
                Queue is empty
              </p>
              <p className="text-[10px] font-mono-tech text-neutral-600 mt-2">
                Add files from local or network sources
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {playlist.map((track, idx) => (
                <div
                  key={track.id + idx}
                  onClick={() => onPlayIndex(idx)}
                  className={`flex items-center gap-3 p-2 rounded-xl border transition-all cursor-pointer ${
                    idx === currentIndex
                      ? 'bg-neutral-800/80 border-amber-500/50'
                      : 'bg-neutral-950/40 border-transparent hover:bg-neutral-800/50 hover:border-neutral-700'
                  }`}
                >
                  <GripVertical className="w-4 h-4 text-neutral-600 shrink-0" />
                  
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-mono-tech font-semibold truncate ${idx === currentIndex ? 'text-amber-400' : 'text-neutral-200'}`}>
                      {track.title}
                    </p>
                    {track.artist && (
                      <p className="text-[10px] font-mono-tech text-neutral-500 truncate mt-0.5">
                        {track.artist}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onPlayIndex(idx)}
                      className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white cursor-pointer"
                      title="Play"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveTrack(idx)}
                      className="p-1.5 rounded-lg bg-neutral-800 hover:bg-red-900/50 text-neutral-400 hover:text-red-400 cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
