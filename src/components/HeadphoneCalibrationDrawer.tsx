import React, { useState, useEffect, useMemo } from 'react';
import { Headphones, Check, Zap, Sparkles, Plus, Trash2, Edit3, Activity, Crosshair } from 'lucide-react';
import { HEADPHONE_PROFILES, calculateProfileResponseCurve } from '../dsp/headphoneProfiles';
import { HeadphoneProfile } from '../types';
import { loadSavedCustomProfiles, saveCustomProfiles } from '../dsp/customProfileStorage';
import { CustomHeadphoneEditor } from './CustomHeadphoneEditor';
import { triggerHaptic } from '../utils/haptics';
import { HEADPHONE_CATALOG, catalogEntryToProfile } from '../dsp/headphoneCatalog';

// Phase 2-⑥: Virtual target profiles not present in HEADPHONE_PROFILES.
// These mirror the App.tsx definitions so the Drawer can render them
// when the user toggles the target display. DSP behavior is independent
// of this display (App.tsx useEffect applies target-listening correction
// regardless of which curve is shown here).
const HARMAN_REFERENCE_VIRTUAL: HeadphoneProfile = {
  id: 'harman_reference',
  modelName: 'Harman Reference',
  brand: 'Standard',
  targetCurve: 'Harman 2019 Over-Ear',
  preampGainDb: 0.0,
  bands: [
    { freq: 105, gain: 0.0, q: 0.7, type: 'lowshelf' },
    { freq: 1000, gain: 0.0, q: 1.0, type: 'peaking' },
    { freq: 3000, gain: 1.0, q: 4.0, type: 'peaking' },
    { freq: 5000, gain: 0.5, q: 4.0, type: 'peaking' },
    { freq: 10000, gain: -2.0, q: 0.7, type: 'highshelf' },
  ],
};
const FLAT_REFERENCE_VIRTUAL: HeadphoneProfile = {
  id: 'flat_reference',
  modelName: 'Flat Reference',
  brand: 'Standard',
  targetCurve: 'Flat Reference',
  preampGainDb: 0.0,
  bands: [{ freq: 1000, gain: 0.0, q: 1.0, type: 'peaking' }],
};
const FLAT_BYPASS_VIRTUAL: HeadphoneProfile = {
  id: 'flat_bypass',
  modelName: 'Bypass (No Calibration)',
  brand: 'Standard',
  targetCurve: 'Flat Reference',
  preampGainDb: 0.0,
  bands: [],
};

interface HeadphoneCalibrationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProfileId: string;
  onSelectProfile: (profile: HeadphoneProfile) => void;
  onPreviewHover?: (profile: HeadphoneProfile | null) => void;
  tubeWarmthEnabled: boolean;
  onToggleTubeWarmth: () => void;
  dspBypassed: boolean;
  onToggleDspBypass: () => void;
  // Phase 1-①: Headphone Calibration Strength (0.0 .. 1.0)
  calibrationIntensity: number;
  onCalibrationIntensityChange: (v: number) => void;
  // Phase 2-⑥: Target curve selector (re-calibration destination)
  targetCurveId?: string;
  onSelectTargetCurve?: (id: string) => void;
}

export const HeadphoneCalibrationDrawer: React.FC<HeadphoneCalibrationDrawerProps> = ({
  isOpen,
  onClose,
  selectedProfileId,
  onSelectProfile,
  onPreviewHover,
  tubeWarmthEnabled,
  onToggleTubeWarmth,
  dspBypassed,
  onToggleDspBypass,
  calibrationIntensity,
  onCalibrationIntensityChange,
  targetCurveId,
  onSelectTargetCurve,
}) => {
  const [customProfiles, setCustomProfiles] = useState<HeadphoneProfile[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProfile, setEditingProfile] = useState<HeadphoneProfile | undefined>(undefined);
  const [editingMode, setEditingMode] = useState<'headphone' | 'target'>('headphone');
  const [hoveredProfile, setHoveredProfile] = useState<HeadphoneProfile | null>(null);
  // Phase 2-⑥: Toggle the tone-curve display between the listening
  // headphone (default) and the target curve. UI display only — DSP
  // (target - listening correction) is always applied in App.tsx
  // regardless of this toggle.
  const [showingTarget, setShowingTarget] = useState(false);
  // Phase 2-⑥: Resolve the target profile object for the curve display.
  // UI ONLY — DSP correction is computed independently in App.tsx and is
  // always target - listening, regardless of this display state.
  // MUST be declared before any conditional return so React's hook order
  // is stable across renders (React #310 rule).
  const currentTargetProfile = useMemo<HeadphoneProfile | null>(() => {
    const tid = targetCurveId ?? 'harman_reference';
    if (tid === 'harman_reference') return HARMAN_REFERENCE_VIRTUAL;
    if (tid === 'flat_bypass') return FLAT_BYPASS_VIRTUAL;
    if (tid === 'flat_reference') return FLAT_REFERENCE_VIRTUAL;
    const fromPreset = HEADPHONE_PROFILES.find((p) => p.id === tid);
    if (fromPreset) return fromPreset;
    const fromCustom = customProfiles.find((p) => p.id === tid);
    if (fromCustom) return fromCustom;
    return HARMAN_REFERENCE_VIRTUAL;
  }, [targetCurveId, customProfiles]);
  const [hiddenPresetIds, setHiddenPresetIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('biscene_hidden_presets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('biscene_hidden_presets', JSON.stringify(hiddenPresetIds));
    } catch {
      // Ignored
    }
  }, [hiddenPresetIds]);

  // Phase 2-⑥ (Selective restore): when the restore panel is open, the
  // user can pick which hidden profiles to bring back. Defaults to
  // selecting all of them.
  const [restorePickerOpen, setRestorePickerOpen] = useState(false);
  const [restoreSelection, setRestoreSelection] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    setCustomProfiles(loadSavedCustomProfiles());
  }, [isOpen]);

  if (!isOpen) return null;

  // Phase 2-⑥ (fix): allProfiles must include the bundled HEADPHONE_CATALOG
  // (44 entries) so the user can select their listening headphone from the
  // same database that powers WEB SEARCH and target selection. Without
  // this, the listening dropdown is limited to the 9 hard-coded
  // HEADPHONE_PROFILES and the catalog/web search is useless for the
  // "what headphones do I own" question.
  // Phase 2-⑥ (fix): Skip catalog entries whose id is already present in
  // HEADPHONE_PROFILES (e.g. 'sony_wh1000xm5' exists in both files) or
  // already used within the catalog itself (e.g. 'sennheiser_hd600' is
  // listed twice in headphoneCatalog.ts). Without these filters, the list
  // shows duplicate rows and `isSelected ===` matches only the first
  // occurrence, making later rows look unresponsive to taps.
  const presetIds = new Set(HEADPHONE_PROFILES.map((p) => p.id));
  const customIds = new Set(customProfiles.map((p) => p.id));
  const seenInCatalog = new Set<string>();
  const catalogProfiles: HeadphoneProfile[] = [];
  for (const entry of HEADPHONE_CATALOG) {
    if (hiddenPresetIds.includes(entry.id)) continue;
    if (presetIds.has(entry.id)) continue;
    if (customIds.has(entry.id)) continue;
    if (seenInCatalog.has(entry.id)) continue;
    seenInCatalog.add(entry.id);
    catalogProfiles.push(catalogEntryToProfile(entry));
  }
  const allProfiles = [
    ...customProfiles,
    ...HEADPHONE_PROFILES.filter((p) => !hiddenPresetIds.includes(p.id)),
    ...catalogProfiles,
  ];
  // Phase 2-⑥: Resolve target curve display name. Default id
  // 'harman_reference' (matches App.tsx default). Special ids:
  // flat_bypass = Bypass (no correction), flat_reference = headphone-flat.
  // Custom or preset = user-selected via 🎯 ターゲットを選択.
  const targetCurveDisplayName = (() => {
    const tid = targetCurveId ?? 'harman_reference';
    if (tid === 'harman_reference') return 'Harman Reference';
    if (tid === 'flat_bypass') return 'Bypass (No Calibration)';
    if (tid === 'flat_reference') return 'Flat Reference (打ち消し)';
    const fromPreset = HEADPHONE_PROFILES.find((p) => p.id === tid);
    if (fromPreset) return fromPreset.modelName;
    const fromCustom = customProfiles.find((p) => p.id === tid);
    if (fromCustom) return fromCustom.modelName;
    return 'Harman Reference';
  })();
  // Phase 2-⑥: Active curve to render. When showingTarget is true and
  // no list item is hovered, show the target curve; otherwise the
  // listening curve (selected or hovered profile). Toggle is UI only.
  // currentTargetProfile is resolved in the hook block above so the
  // hook order stays stable regardless of the conditional return.
  const currentProfileForCurve = hoveredProfile
    || (showingTarget ? currentTargetProfile : null)
    || allProfiles.find((p) => p.id === selectedProfileId)
    || allProfiles[0]
    || HEADPHONE_PROFILES[0];
  // Apply calibrationIntensity (0..1) to visual curve so users see "how much"
  // correction is being applied. DSP level is handled by AudioEngine.calibScale.
  const scaledCurveData = (() => {
    const base = currentProfileForCurve
      ? calculateProfileResponseCurve(currentProfileForCurve, 300, 70)
      : null;
    if (!base) return null;
    const scale = Math.max(0, Math.min(1, calibrationIntensity));
    if (scale === 1) return base;
    // Rebuild path with y-coordinate scaled toward midline (35 = svg mid).
    const midY = 35;
    const newPath = base.points
      .map((p, i) => {
        const newY = midY + (p.y - midY) * scale;
        return `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${newY.toFixed(1)}`;
      })
      .join(' ');
    return { path: newPath, points: base.points };
  })();

  const handleSaveCustomProfile = (newProfile: HeadphoneProfile) => {
    let updated: HeadphoneProfile[];
    const existingIdx = customProfiles.findIndex((p) => p.id === newProfile.id);
    if (existingIdx >= 0) {
      updated = [...customProfiles];
      updated[existingIdx] = newProfile;
    } else {
      updated = [newProfile, ...customProfiles];
    }
    setCustomProfiles(updated);
    saveCustomProfiles(updated);
    setIsEditing(false);
    setEditingProfile(undefined);

    // Apply newly created/edited profile immediately
    onSelectProfile(newProfile);
    onPreviewHover?.(newProfile);
  };

  // Phase 2-⑥ (fix): A profile is "catalog-derived" if its id is present in
  // HEADPHONE_CATALOG, ORATORY_CRINACLE_ENTRIES, or HEADPHONE_PROFILES.
  // Deleting a catalog-derived profile would lose the source data, so we
  // route it through handleHidePreset (recoverable via ↺ 復元 button)
  // instead of full deletion.
  const isCatalogDerived = (id: string): boolean => {
    if (HEADPHONE_PROFILES.some((p) => p.id === id)) return true;
    if (HEADPHONE_CATALOG.some((e) => e.id === id)) return true;
    // ORATORY_CRINACLE_ENTRIES has well-known id prefixes.
    if (id.startsWith('oratory1990__') || id.startsWith('crinacle__')) return true;
    return false;
  };

  const handleDeleteCustomProfile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // If the profile came from the catalog, route to handleHidePreset
    // so the user can recover it via the ↺ 復元 button.
    if (isCatalogDerived(id)) {
      handleHidePreset(id, e);
      return;
    }
    // Genuine user-created custom profile → full delete.
    const updated = customProfiles.filter((p) => p.id !== id);
    setCustomProfiles(updated);
    saveCustomProfiles(updated);

    if (selectedProfileId === id) {
      onSelectProfile(HEADPHONE_PROFILES[0]);
      onPreviewHover?.(HEADPHONE_PROFILES[0]);
    }
  };

  const handleHidePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('click');
    if (id === 'flat_bypass') return; // Protect Harman reference
    setHiddenPresetIds((prev) => [...prev, id]);
    if (selectedProfileId === id) {
      onSelectProfile(HEADPHONE_PROFILES[0]);
      onPreviewHover?.(HEADPHONE_PROFILES[0]);
    }
  };

  const handleStartEdit = (profile: HeadphoneProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProfile(profile);
    setIsEditing(true);
  };

  return (
    <div
      id="modal-headphone-calibration"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-neutral-900 border border-neutral-700 rounded-2xl p-3 sm:p-5 shadow-2xl flex flex-col gap-3 sm:gap-4 text-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Headphones className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-bold font-mono-tech tracking-wider text-neutral-100">
                Phone Calibration
              </h3>
              <p className="text-[10px] font-mono-tech text-neutral-400">
                AutoEq Harman Parametric EQ Profiles
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-mono-tech text-neutral-400 hover:text-white px-3 py-1 bg-neutral-800 rounded border border-neutral-700 font-bold"
          >
            DONE
          </button>
        </div>

        {isEditing ? (
          <CustomHeadphoneEditor
            initialProfile={editingProfile}
            onSave={handleSaveCustomProfile}
            onCancel={() => {
              setIsEditing(false);
              setEditingProfile(undefined);
              setEditingMode('headphone');
            }}
            mode={editingMode}
            onSelectTarget={(id) => {
              if (onSelectTargetCurve) {
                onSelectTargetCurve(id);
              }
              setIsEditing(false);
              setEditingProfile(undefined);
              setEditingMode('headphone');
            }}
          />
        ) : (
          <>
            {/* Live Frequency Response Waveform (tap to toggle listening / target) */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tick');
                setShowingTarget((prev) => !prev);
              }}
              className="w-full text-left bg-neutral-950 p-2.5 rounded-xl border border-cyan-500/40 flex flex-col gap-1 shadow-inner cursor-pointer hover:border-cyan-400/70 active:bg-neutral-900/80 transition-colors"
              title={showingTarget ? 'タップで所有ヘッドホンの波形に戻す' : 'タップでターゲット波形を表示'}
              aria-label={showingTarget ? 'Switch to listening curve' : 'Switch to target curve'}
            >
              {/* Phase 2-⑥: Two labels — left = listening, right = target.
                  Active label is highlighted; tap anywhere in the card to toggle. */}
              <div className="flex items-center justify-between gap-2">
                <div
                  className={`flex items-center gap-1 min-w-0 flex-1 ${showingTarget ? 'opacity-50' : ''}`}
                >
                  <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse shrink-0" />
                  <span className="text-[10px] font-mono-tech font-bold text-white truncate">
                    {currentProfileForCurve.modelName}
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1 shrink-0 ${showingTarget ? '' : 'opacity-50'}`}
                >
                  <span className="text-[9px] font-mono-tech font-bold text-cyan-400">🎯</span>
                  <span className="text-[9px] font-mono-tech font-bold text-cyan-400 truncate max-w-[110px]">
                    {targetCurveDisplayName}
                  </span>
                </div>
              </div>
              <div className="w-full h-14 relative flex items-center justify-center pt-1">
                <svg viewBox="0 0 300 70" className="w-full h-full overflow-visible">
                  {/* Grid Lines */}
                  <line x1="8" y1="35" x2="292" y2="35" stroke="#334155" strokeDasharray="2 2" strokeWidth="0.8" />
                  <line x1="8" y1="18" x2="292" y2="18" stroke="#1e293b" strokeDasharray="1 3" strokeWidth="0.5" />
                  <line x1="8" y1="52" x2="292" y2="52" stroke="#1e293b" strokeDasharray="1 3" strokeWidth="0.5" />
                  <line x1="80" y1="5" x2="80" y2="65" stroke="#1e293b" strokeDasharray="1 3" strokeWidth="0.5" />
                  <line x1="150" y1="5" x2="150" y2="65" stroke="#1e293b" strokeDasharray="1 3" strokeWidth="0.5" />
                  <line x1="220" y1="5" x2="220" y2="65" stroke="#1e293b" strokeDasharray="1 3" strokeWidth="0.5" />

                  {scaledCurveData && (
                    <>
                      <path
                        d={scaledCurveData.path}
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d={scaledCurveData.path}
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth="3.5"
                        strokeOpacity="0.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}
                </svg>
              </div>
              <div className="flex items-center justify-center text-[8px] font-mono-tech text-cyan-500/70 tracking-wider pt-0.5">
                {showingTarget
                  ? '▼ ターゲット表示中 (タップで切替)'
                  : '▼ タップでターゲットを表示'}
              </div>
            </button>

            {/* Phase 1-①: Calibration Strength Bar (10 hard-coded segments, SmallDial pattern) */}
            <div className="w-full bg-neutral-950 p-2 sm:p-2.5 rounded-xl border border-cyan-500/40 shadow-inner flex flex-col gap-1 sm:gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] sm:text-[10px] font-mono-tech font-bold text-cyan-300 uppercase tracking-wider">
                  Calibration Strength
                </span>
                <span className="text-[9px] sm:text-[10px] font-mono-tech font-black text-cyan-200 tabular-nums">
                  {Math.round(calibrationIntensity * 100)}%
                </span>
              </div>
              <div className="flex items-center justify-between bg-black/40 px-1 py-0.5 rounded border border-black/50 shadow-inner">
                {Array.from({ length: 10 }).map((_, step) => {
                  const stepValue = (step + 1) * 10; // 10, 20, ..., 100
                  const currentPct = Math.round(calibrationIntensity * 100);
                  const isFilled = currentPct >= stepValue;
                  const isDefaultMark = stepValue === 50;
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerHaptic('tick');
                        onCalibrationIntensityChange(stepValue / 100);
                      }}
                      className="flex-1 mx-[1px] h-2 rounded-sm transition-colors cursor-pointer border"
                      style={{
                        backgroundColor: isFilled
                          ? '#22d3ee'
                          : isDefaultMark
                            ? '#164e63'
                            : '#0a0a0a',
                        borderColor: isFilled
                          ? '#67e8f9'
                          : isDefaultMark
                            ? '#0e7490'
                            : '#262626',
                        boxShadow: isFilled
                          ? '0 0 4px rgba(34,211,238,0.7)'
                          : 'none',
                      }}
                      title={`Set strength to ${stepValue}%`}
                      aria-label={`Calibration ${stepValue}%`}
                    />
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-[8px] font-mono-tech text-neutral-500 tracking-wider">
                <span>BYPASS</span>
                <span className="text-cyan-400/80">DEFAULT 50%</span>
                <span>FULL</span>
              </div>
            </div>

            {/* Feature Switches: A/B Direct & Tube Saturation */}
            <div className="grid grid-cols-2 gap-2 bg-neutral-950 p-2.5 rounded-xl border border-neutral-800">
              {/* A/B Direct Switch */}
              <button
                type="button"
                onClick={onToggleDspBypass}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-left ${
                  dspBypassed
                    ? 'bg-amber-950/70 border-amber-500 text-amber-300'
                    : 'bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                <div>
                  <div className="text-[10px] font-mono-tech font-black tracking-wider">
                    A/B DIRECT
                  </div>
                  <div className="text-[8px] font-mono-tech text-neutral-400">
                    {dspBypassed ? 'DSP BYPASSED (RAW)' : 'DSP ACTIVE'}
                  </div>
                </div>
                <Zap className={`w-4 h-4 ${dspBypassed ? 'text-amber-400' : 'text-neutral-500'}`} />
              </button>

              {/* Tube Harmonics Switch */}
              <button
                type="button"
                onClick={onToggleTubeWarmth}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-left ${
                  tubeWarmthEnabled
                    ? 'bg-orange-950/70 border-orange-500 text-orange-300'
                    : 'bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                <div>
                  <div className="text-[10px] font-mono-tech font-black tracking-wider">
                    ANALOG TUBE
                  </div>
                  <div className="text-[8px] font-mono-tech text-neutral-400">
                    {tubeWarmthEnabled ? '2ND HARMONIC ON' : 'OFF'}
                  </div>
                </div>
                <Sparkles className={`w-4 h-4 ${tubeWarmthEnabled ? 'text-orange-400' : 'text-neutral-500'}`} />
              </button>
            </div>

            {/* Custom Profiles Action Bar */}
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono-tech uppercase tracking-wider text-neutral-400">
                CALIBRATION PROFILES ({allProfiles.length})
              </span>
              <div className="flex items-center gap-1.5">
                {hiddenPresetIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('click');
                      // Phase 2-⑥ (Selective restore): toggle the picker
                      // panel. Initialize selection to all hidden ids.
                      if (!restorePickerOpen) {
                        setRestoreSelection(new Set(hiddenPresetIds));
                      }
                      setRestorePickerOpen((v) => !v);
                    }}
                    className="flex items-center gap-1 text-[10px] font-mono-tech font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-950/60 border border-cyan-700/60 px-2.5 py-1 rounded"
                    title="非表示にしたプリセットを選んで復元"
                  >
                    ↺ {hiddenPresetIds.length} 件復元
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingProfile(undefined);
                    setEditingMode('headphone');
                    setIsEditing(true);
                  }}
                  className="flex items-center gap-1 text-[10px] font-mono-tech font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-950/60 border border-cyan-700/60 px-2.5 py-1 rounded"
                >
                  <Plus className="w-3.5 h-3.5" /> 所持ヘッドホンを追加 (AutoEq)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingProfile(undefined);
                    setEditingMode('target');
                    setIsEditing(true);
                  }}
                  className="flex items-center gap-1 text-[10px] font-mono-tech font-bold text-amber-400 hover:text-amber-300 bg-amber-950/60 border border-amber-700/60 px-2.5 py-1 rounded"
                  title="リキャリブレーション先 (ターゲットカーブ) を選択"
                >
                  🎯 ターゲットを選択
                </button>
              </div>
            </div>

            {/* Phase 2-⑥ (Selective restore): When the picker is open, show
                each hidden profile with a checkbox. The user can pick
                which ones to bring back into the active list. */}
            {restorePickerOpen && hiddenPresetIds.length > 0 && (
              <div className="flex flex-col gap-1.5 p-2 bg-neutral-950/60 border border-cyan-800/40 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono-tech font-bold text-cyan-300 uppercase tracking-wider">
                    復元する項目を選択 ({restoreSelection.size}/{hiddenPresetIds.length})
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setRestoreSelection(new Set(hiddenPresetIds))}
                      className="text-[9px] font-mono-tech text-cyan-400 hover:text-cyan-300 px-1.5 py-0.5 border border-cyan-800/60 rounded"
                    >
                      全選択
                    </button>
                    <button
                      type="button"
                      onClick={() => setRestoreSelection(new Set())}
                      className="text-[9px] font-mono-tech text-neutral-400 hover:text-neutral-200 px-1.5 py-0.5 border border-neutral-700 rounded"
                    >
                      解除
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (restoreSelection.size === 0) return;
                        triggerHaptic('click');
                        setHiddenPresetIds((prev) =>
                          prev.filter((id) => !restoreSelection.has(id))
                        );
                        setRestoreSelection(new Set());
                        setRestorePickerOpen(false);
                      }}
                      disabled={restoreSelection.size === 0}
                      className="text-[9px] font-mono-tech font-bold text-cyan-300 hover:text-cyan-200 disabled:text-neutral-600 disabled:cursor-not-allowed bg-cyan-700/40 border border-cyan-500/60 px-2 py-0.5 rounded"
                    >
                      選択した {restoreSelection.size} 件を復元
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                  {hiddenPresetIds.map((hiddenId) => {
                    // Resolve a friendly display name for the hidden id.
                    const allKnown = [
                      ...HEADPHONE_PROFILES,
                      ...HEADPHONE_CATALOG.map(catalogEntryToProfile),
                    ];
                    const known = allKnown.find((p) => p.id === hiddenId);
                    const display = known ? `${known.brand} ${known.modelName}` : hiddenId;
                    const checked = restoreSelection.has(hiddenId);
                    return (
                      <label
                        key={hiddenId}
                        className="flex items-center gap-2 text-[10px] font-mono-tech text-neutral-200 px-1.5 py-0.5 rounded hover:bg-neutral-800/60 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setRestoreSelection((prev) => {
                              const next = new Set(prev);
                              if (next.has(hiddenId)) next.delete(hiddenId);
                              else next.add(hiddenId);
                              return next;
                            });
                          }}
                          className="accent-cyan-400"
                        />
                        <span className="truncate flex-1">{display}</span>
                        <span className="text-[8px] text-neutral-500 font-bold">
                          {hiddenId.startsWith('oratory1990__')
                            ? 'ORATORY'
                            : hiddenId.startsWith('crinacle__')
                            ? 'CRINACLE'
                            : 'PRESET'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Headphone Profile List */}
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
              {allProfiles.map((profile) => {
                const isSelected = profile.id === selectedProfileId;
                // Phase 2-⑥ (fix): Distinguish user-created custom profiles
                // (full delete) from catalog-derived ones (just hide).
                // Use customProfiles membership, not id prefix, because
                // catalogEntryToProfile generates "custom_<timestamp>" ids.
                const isUserCreated = customProfiles.some(
                  (cp) => cp.id === profile.id
                );
                // Phase 2-⑥ (target badge): Highlight the row whose id matches
                // the current targetCurveId. Clicking such a row re-applies
                // the target (in case the user has selected a different
                // listening headphone since). The 🎯 badge makes it visually
                // obvious which row is the current target.
                const isTarget = profile.id === targetCurveId;

                return (
                  <div
                    key={profile.id}
                    onMouseEnter={() => {
                      setHoveredProfile(profile);
                      onPreviewHover?.(profile);
                    }}
                    onMouseLeave={() => {
                      setHoveredProfile(null);
                      const current = allProfiles.find((p) => p.id === selectedProfileId) || null;
                      onPreviewHover?.(current);
                    }}
                    onClick={() => {
                      console.log('[Drawer] profile click', profile.id, profile.modelName, 'isUserCreated=', isUserCreated, 'allProfiles.length=', allProfiles.length);
                      console.log('[Drawer] onSelectProfile is fn?', typeof onSelectProfile);
                      try {
                        onSelectProfile(profile);
                        console.log('[Drawer] onSelectProfile called OK');
                      } catch (e: any) {
                        console.error('[Drawer] onSelectProfile threw:', e?.message ?? e);
                      }
                      setHoveredProfile(null);
                      onPreviewHover?.(profile);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-cyan-950/50 border-cyan-500 text-white shadow-md'
                        : 'bg-neutral-950/50 border-neutral-800/80 text-neutral-300 hover:bg-neutral-800/80 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono-tech font-bold">
                          {profile.modelName}
                        </span>
                        {isUserCreated && (
                          <span className="text-[8px] font-mono-tech bg-cyan-900/70 border border-cyan-600 text-cyan-200 px-1.5 py-0.2 rounded font-bold">
                            CUSTOM
                          </span>
                        )}
                        {isTarget && (
                          <span className="text-[8px] font-mono-tech bg-amber-900/70 border border-amber-500 text-amber-200 px-1.5 py-0.2 rounded font-bold">
                            🎯 TARGET
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] font-mono-tech text-neutral-400">
                        {profile.brand} • {profile.targetCurve}
                        {profile.bands.length > 0 && ` • ${profile.bands.length} Filters (Preamp ${profile.preampGainDb}dB)`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {isUserCreated && (
                          <button
                            type="button"
                            onClick={(e) => handleStartEdit(profile, e)}
                            className="p-1 text-neutral-400 hover:text-cyan-300 hover:bg-neutral-800 rounded"
                            title="バンドを編集"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {/* Phase 2-⑥: "Set as target" button — does NOT touch
                            the listening headphone. Clicking just updates
                            targetCurveId via onSelectTargetCurve so the
                            listening selection is preserved. */}
                        {profile.id !== 'flat_bypass' && onSelectTargetCurve && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerHaptic('click');
                              onSelectTargetCurve(profile.id);
                            }}
                            className={`p-1 rounded ${
                              isTarget
                                ? 'text-amber-300 bg-amber-950/60 hover:bg-amber-900/60'
                                : 'text-neutral-400 hover:text-amber-300 hover:bg-neutral-800'
                            }`}
                            title="このプロファイルをターゲットカーブに設定"
                          >
                            <Crosshair className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {profile.id !== 'flat_bypass' && (
                          <button
                            type="button"
                            onClick={(e) =>
                              isUserCreated
                                ? handleDeleteCustomProfile(profile.id, e)
                                : handleHidePreset(profile.id, e)
                            }
                            className="p-1 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded"
                            title={isUserCreated ? '削除 (完全消去)' : 'リストから非表示'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center">
                          <Check className="w-3 h-3 text-cyan-400" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Note */}
            <div className="text-center pt-2 border-t border-neutral-800/80">
              <span className="text-[8.5px] font-mono-tech text-neutral-500 tracking-wider">
                AUTOEQ PARAMETRIC TEXT IMPORT • 96kHz DIRECT BIQUAD CONVOLUTION
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
