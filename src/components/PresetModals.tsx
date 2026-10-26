import React, { useState } from 'react';
import { DspPreset } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { X, Trash2, Edit3, Check } from 'lucide-react';

interface PresetModalsProps {
  showSaveDialog: boolean;
  onCloseSaveDialog: () => void;
  onSavePreset: (name: string) => void;

  showLoadDialog: boolean;
  onCloseLoadDialog: () => void;
  savedPresets: DspPreset[];
  onLoadPreset: (preset: DspPreset) => void;
  onClearPreset: () => void;
  onRenamePreset: (preset: DspPreset, newName: string) => void;
  onDeletePreset: (preset: DspPreset) => void;
}

export const PresetModals: React.FC<PresetModalsProps> = ({
  showSaveDialog,
  onCloseSaveDialog,
  onSavePreset,
  showLoadDialog,
  onCloseLoadDialog,
  savedPresets,
  onLoadPreset,
  onClearPreset,
  onRenamePreset,
  onDeletePreset,
}) => {
  const [saveName, setSaveName] = useState('');
  const [editingPreset, setEditingPreset] = useState<DspPreset | null>(null);
  const [editName, setEditName] = useState('');

  const handleConfirmSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (saveName.trim()) {
      triggerHaptic('heavy');
      onSavePreset(saveName.trim());
      setSaveName('');
      onCloseSaveDialog();
    }
  };

  const handleStartEdit = (preset: DspPreset) => {
    triggerHaptic('click');
    setEditingPreset(preset);
    setEditName(preset.name);
  };

  const handleConfirmRename = () => {
    if (editingPreset && editName.trim()) {
      triggerHaptic('click');
      onRenamePreset(editingPreset, editName.trim());
      setEditingPreset(null);
    }
  };

  const handleDelete = () => {
    if (editingPreset) {
      triggerHaptic('heavy');
      onDeletePreset(editingPreset);
      setEditingPreset(null);
    }
  };

  return (
    <>
      {/* 1. Register / Save Preset Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-700 shadow-2xl p-5 text-neutral-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-xs font-black font-mono-tech uppercase tracking-wider text-neutral-200">
                REGISTER CURRENT DSP SETUP
              </h3>
              <button
                type="button"
                onClick={onCloseSaveDialog}
                className="p-1 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmSave} className="mt-4">
              <label className="block text-[11px] font-mono-tech text-neutral-400 mb-1.5 uppercase">
                Preset Name
              </label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Master Studio Tube"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-xs font-mono-tech text-white focus:outline-none focus:border-amber-500 transition-colors"
              />

              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={onCloseSaveDialog}
                  className="px-3 py-1.5 text-xs font-bold font-mono-tech text-neutral-400 hover:text-white"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={!saveName.trim()}
                  className="px-4 py-1.5 text-xs font-black font-mono-tech uppercase bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black rounded-lg shadow disabled:opacity-50 cursor-pointer"
                >
                  REGISTER
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Load DSP Preset Dialog */}
      {showLoadDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-neutral-900 border border-neutral-700 shadow-2xl p-5 text-neutral-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-xs font-black font-mono-tech uppercase tracking-wider text-neutral-200">
                LOAD DSP PRESET
              </h3>
              <button
                type="button"
                onClick={onCloseLoadDialog}
                className="p-1 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 max-h-72 overflow-y-auto space-y-1 divide-y divide-neutral-800/60">
              {/* None / Reset Option */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('click');
                  onClearPreset();
                  onCloseLoadDialog();
                }}
                className="w-full text-left p-3 hover:bg-neutral-800/80 rounded-lg flex items-center justify-between group transition-colors cursor-pointer"
              >
                <span className="text-xs font-bold font-mono-tech text-neutral-400 group-hover:text-amber-400">
                  NONE (CLEAR DSP PRESET)
                </span>
                <span className="text-[10px] font-mono-tech text-neutral-600">RESET ALL</span>
              </button>

              {/* Saved Presets */}
              {savedPresets.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono-tech text-neutral-500">
                  No saved presets yet. Flip to MIX panel and click [REG] to save your current setting.
                </div>
              ) : (
                savedPresets.map((preset, index) => (
                  <div
                    key={index}
                    className="p-2.5 hover:bg-neutral-800/80 rounded-lg flex items-center justify-between group transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('click');
                        onLoadPreset(preset);
                        onCloseLoadDialog();
                      }}
                      className="flex-1 text-left cursor-pointer"
                    >
                      <span className="text-xs font-black font-mono-tech uppercase text-white group-hover:text-amber-400">
                        {preset.name}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(preset);
                      }}
                      className="p-1.5 text-neutral-500 hover:text-white rounded hover:bg-neutral-700"
                      title="Manage / Rename"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end mt-4 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={onCloseLoadDialog}
                className="px-4 py-1.5 text-xs font-bold font-mono-tech text-neutral-400 hover:text-white"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Manage Preset Edit / Delete Dialog */}
      {editingPreset && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-700 shadow-2xl p-5 text-neutral-100">
            <h3 className="text-xs font-black font-mono-tech uppercase tracking-wider text-neutral-200 pb-3 border-b border-neutral-800">
              MANAGE PRESET
            </h3>

            <div className="mt-4">
              <label className="block text-[11px] font-mono-tech text-neutral-400 mb-1.5 uppercase">
                Rename Preset
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-xs font-mono-tech text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center justify-between gap-2 mt-5 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs font-bold font-mono-tech text-red-400 hover:text-red-300 flex items-center gap-1.5 hover:bg-red-950/40 rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
                DELETE
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPreset(null)}
                  className="px-3 py-1.5 text-xs font-bold font-mono-tech text-neutral-400 hover:text-white"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRename}
                  disabled={!editName.trim()}
                  className="px-3 py-1.5 text-xs font-bold font-mono-tech bg-neutral-200 text-black rounded-lg hover:bg-white flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  RENAME
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
