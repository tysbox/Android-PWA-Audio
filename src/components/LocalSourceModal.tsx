import React from 'react';
import { X, FileAudio, Folder, HardDrive, Sparkles } from 'lucide-react';

interface LocalSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFiles: () => void;
  onSelectFolder: () => void;
}

export const LocalSourceModal: React.FC<LocalSourceModalProps> = ({
  isOpen,
  onClose,
  onSelectFiles,
  onSelectFolder,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      {/* Backdrop click handler */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Popup Window Container */}
      <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-700/90 rounded-2xl shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200 font-mono-tech">
        {/* Metal Chassis Header */}
        <div className="p-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400 shrink-0">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black tracking-widest text-neutral-100 flex items-center gap-1.5">
                LOCAL AUDIO SOURCE SELECTION
                <Sparkles className="w-3 h-3 text-amber-400" />
              </h3>
              <p className="text-[10px] text-neutral-400 mt-0.5">
                ローカルストレージからの音源読み込み方式を選択してください
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body - 2 Choice Cards */}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-neutral-900">
          {/* Card 1: Individual File Selection */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectFiles();
            }}
            className="group relative p-4 bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 hover:border-emerald-500/80 rounded-xl text-left transition-all duration-200 flex flex-col justify-between h-44 shadow-lg cursor-pointer hover:shadow-emerald-950/30"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-800 group-hover:border-emerald-500 group-hover:bg-emerald-900/40 flex items-center justify-center text-emerald-400 transition-colors">
                <FileAudio className="w-5 h-5" />
              </div>
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 rounded">
                FILES
              </span>
            </div>

            <div className="mt-3">
              <h4 className="text-xs font-bold text-neutral-100 group-hover:text-emerald-300 transition-colors">
                ファイル選択 (複数可)
              </h4>
              <p className="text-[10px] text-neutral-400 leading-relaxed mt-1">
                個別の音声ファイル(MP3, FLAC, WAV, AAC, ALAC, DSD等)を選択して直ちにダイレクト再生します。
              </p>
            </div>

            <div className="pt-2 text-[10px] font-bold text-emerald-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              ▶ 楽曲ファイルを指定して再生
            </div>
          </button>

          {/* Card 2: Folder Batch Selection */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectFolder();
            }}
            className="group relative p-4 bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 hover:border-amber-500/80 rounded-xl text-left transition-all duration-200 flex flex-col justify-between h-44 shadow-lg cursor-pointer hover:shadow-amber-950/30"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-800 group-hover:border-amber-500 group-hover:bg-amber-900/40 flex items-center justify-center text-amber-400 transition-colors">
                <Folder className="w-5 h-5" />
              </div>
              <span className="text-[9px] font-bold text-amber-400 bg-amber-950/80 border border-amber-800/80 px-2 py-0.5 rounded">
                FOLDER
              </span>
            </div>

            <div className="mt-3">
              <h4 className="text-xs font-bold text-neutral-100 group-hover:text-amber-300 transition-colors">
                フォルダ全曲選択
              </h4>
              <p className="text-[10px] text-neutral-400 leading-relaxed mt-1">
                アルバムやアーティストのフォルダを選択し、フォルダ内の全楽曲をトラック順で直ちにダイレクト再生します。
              </p>
            </div>

            <div className="pt-2 text-[10px] font-bold text-amber-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              ▶ フォルダ全体を一括再生
            </div>
          </button>
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 bg-neutral-950 border-t border-neutral-800/80 flex items-center justify-between text-[10px] text-neutral-500">
          <span>直接読み込み・ハイレゾ音源対応</span>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 underline cursor-pointer"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
};
