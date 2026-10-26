import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Check, Trash2, Sliders, FileText, ArrowLeft, Info, Crosshair, Search, Globe } from 'lucide-react';
import { HeadphoneProfile } from '../types';
import { parseAutoEqText } from '../dsp/customProfileStorage';
import {
  HEADPHONE_CATALOG,
  searchCatalog,
  catalogEntryToProfile,
  CatalogEntry,
} from '../dsp/headphoneCatalog';
import { ORATORY_CRINACLE_ENTRIES } from '../dsp/headphoneCatalog_oratory_crinacle';
import { OnlineSearchResult } from '../dsp/onlineAutoEq';
import { triggerHaptic } from '../utils/haptics';

interface CustomHeadphoneEditorProps {
  onSave: (profile: HeadphoneProfile) => void;
  onCancel: () => void;
  initialProfile?: HeadphoneProfile;
  /** 'headphone' = save as a custom headphone (apply + store)
   *  'target'    = apply directly as target curve (no save, just select) */
  mode?: 'headphone' | 'target';
  /** Called in 'target' mode when user picks a profile (incl. flat_reference / flat_bypass synthetic ids) */
  onSelectTarget?: (profileId: string, modelName: string) => void;
}

const HEADPHONE_PRESETS_FOR_TARGET: { id: string; modelName: string }[] = [
  { id: 'harman_reference', modelName: 'Harman Reference (デフォルト)' },
  { id: 'flat_bypass', modelName: 'Bypass (No Calibration) [素の音]' },
  { id: 'flat_reference', modelName: 'Flat Reference (ヘッドホン特性を打ち消し)' },
  { id: 'sony_wh1000xm5', modelName: 'Sony WH-1000XM5' },
  { id: 'sony_wh1000xm4', modelName: 'Sony WH-1000XM4' },
  { id: 'airpods_pro_2', modelName: 'Apple AirPods Pro (2nd Gen)' },
  { id: 'hifiman_deva_pro', modelName: 'HIFIMAN Deva Pro' },
  { id: 'sennheiser_hd650', modelName: 'Sennheiser HD 650 / 6XX' },
  { id: 'sennheiser_hd600', modelName: 'Sennheiser HD 600' },
  { id: 'akg_k702', modelName: 'AKG K702' },
  { id: 'akg_k371', modelName: 'AKG K371' },
  { id: 'audio_technica_m50x', modelName: 'Audio-Technica ATH-M50x' },
  { id: 'beyerdynamic_dt770', modelName: 'Beyerdynamic DT 770 Pro' },
  { id: 'etymotic_er4sr', modelName: 'Etymotic ER4SR' },
  { id: 'moondrop_aria', modelName: 'Moondrop Aria' },
  { id: 'soundpeats_gofree_2', modelName: 'SoundPeats GoFree 2' },
  { id: 'shure_srh1440', modelName: 'Shure SRH1440' },
];

export const CustomHeadphoneEditor: React.FC<CustomHeadphoneEditorProps> = ({
  onSave,
  onCancel,
  initialProfile,
  mode = 'headphone',
  onSelectTarget,
}) => {
  // Phase 2-⑥ (fix): Default tab for headphone mode is now 'target' too,
  // so users can pick their listening headphone from the same catalog
  // (44 entries) that the WEB SEARCH uses.
  const [activeTab, setActiveTab] = useState<'target' | 'text' | 'manual'>(
    'target'
  );
  const [modelName] = useState(initialProfile?.modelName || 'My Custom Headphone');
  const [brand] = useState(initialProfile?.brand || 'Custom');
  const [targetCurve] = useState(initialProfile?.targetCurve || 'Harman Target 2019');
  const [preampGainDb, setPreampGainDb] = useState(initialProfile?.preampGainDb ?? -4.0);
  const [autoEqText, setAutoEqText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  // Target mode: list of all available target choices (presets + custom)
  const [customProfiles, setCustomProfiles] = useState<HeadphoneProfile[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('biscene_custom_headphone_profiles');
      setCustomProfiles(raw ? JSON.parse(raw) : []);
    } catch {
      // Ignored
    }
  }, []);

  // Search (catalog + WEB) for both target mode and headphone mode.
  // Phase 2-⑥ (fix): The catalog must be available for BOTH:
  //   - 'target' = pick a target curve (existing behavior)
  //   - 'headphone' = pick your listening headphone (NEW: same DB)
  // Without this, users can only choose from the 9 hard-coded
  // HEADPHONE_PROFILES for "what they own", and the 44-entry catalog
  // is useless for that purpose.
  const [searchQuery, setSearchQuery] = useState('');
  const filteredCatalog = useMemo(
    () => searchCatalog(searchQuery),
    [searchQuery]
  );
  const [onlineResults, setOnlineResults] = useState<OnlineSearchResult[]>([]);
  const [onlineSearching, setOnlineSearching] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [debugStatus, setDebugStatus] = useState<string>('');

  const handleOnlineSearch = async () => {
    if (searchQuery.trim().length < 2) return;
    setOnlineSearching(true);
    setOnlineError(null);
    setOnlineResults([]);
    setDebugStatus('🔄 ローカル カタログ検索中…');
    try {
      // Phase 2-⑥ (fallback): GitHub AutoEQ fetch is rate-limited and
      // truncated in WebView. Use the bundled HEADPHONE_CATALOG (324 items).
      // Full 5057-item catalog via background-fetched static file is
      // the future enhancement.
      const ua = navigator.userAgent;
      const isWebView = /; wv\)|WebView/.test(ua);
      setDebugStatus(`🔍 env: isWebView=${isWebView} catalogSize=${HEADPHONE_CATALOG.length}`);
      await new Promise((r) => setTimeout(r, 50));
      const matches = searchCatalog(searchQuery);
      const results: OnlineSearchResult[] = matches.map((entry) => ({
        id: entry.id,
        modelName: entry.model,
        brand: entry.brand,
        targetCurve: entry.targetCurve,
        path: '',
        url: '',
      }));
      setDebugStatus(`✅ カタログ ${results.length} 件マッチ`);
      setOnlineResults(results);
      if (results.length === 0) {
        setOnlineError(`「${searchQuery}」はローカル カタログに登録がありません。`);
      } else if (results.length > 50) {
        setOnlineError(`⚠ ${results.length} 件見つかりました (上位 50 件のみ表示)。`);
      }
    } catch (e: any) {
      setDebugStatus(`❌ エラー: ${e?.message ?? String(e)}`);
      setOnlineError(`カタログ検索でエラー: ${e?.message ?? String(e)}`);
    } finally {
      setOnlineSearching(false);
    }
  };

  // Helper: build a HeadphoneProfile from a CatalogEntry and call onSave.
  // onSave is wired in App.tsx → Drawer.handleSaveCustomProfile, which
  // persists the profile to localStorage and adds it to the Drawer's
  // customProfiles list, then closes the editor and applies it as the
  // current selectedHeadphoneProfile.
  const importCatalogEntryAsCustom = (entry: CatalogEntry) => {
    if (!onSave) {
      setOnlineError('保存処理が見つかりません。ドロワーを開き直してください。');
      return;
    }
    const profile = catalogEntryToProfile(entry);
    onSave(profile);
  };

  // Helper: find a CatalogEntry by id across both curated 44 and
  // oratory1990/crinacle 2,771 catalogs. Used by handleSelectOnlineTarget.
  const findCatalogEntryById = (id: string): CatalogEntry | null => {
    const fromCurated = HEADPHONE_CATALOG.find((e) => e.id === id);
    if (fromCurated) return fromCurated;
    const fromExtended = ORATORY_CRINACLE_ENTRIES.find((e) => e.id === id);
    if (fromExtended) return fromExtended;
    return null;
  };

  const handleSelectOnlineTarget = async (result: OnlineSearchResult) => {
    triggerHaptic('tick');
    // Phase 2-⑥ (fix): In target mode, save the catalog entry to
    // custom profiles (so the user can edit bands later) AND notify
    // the parent with the catalog id. In headphone mode, import as a
    // listening profile (existing behavior).
    if (mode === 'target') {
      const entry = findCatalogEntryById(result.id);
      if (onSave && entry) {
        const profile = catalogEntryToProfile(entry);
        onSave(profile);
      }
      if (onSelectTarget) {
        onSelectTarget(result.id, result.modelName);
      }
      return;
    }
    const entry = findCatalogEntryById(result.id);
    if (entry) {
      importCatalogEntryAsCustom(entry);
    } else {
      setOnlineError(`「${result.modelName}」を所持ヘッドホンとして追加できませんでした。`);
    }
  };

  // Phase 2-⑥: In target mode, save the catalog entry to custom
  // profiles (so the user can edit bands later) AND notify the parent
  // with the catalog id. In headphone mode, import as a listening
  // profile (existing behavior).
  const handleSelectCatalogTarget = (entry: CatalogEntry) => {
    if (mode === 'target') {
      // Save to custom profiles first (provides editable bands)…
      if (onSave) {
        const profile = catalogEntryToProfile(entry);
        onSave(profile);
      }
      // …then notify parent with the catalog id so setTargetCurveId
      // is updated.
      if (onSelectTarget) {
        onSelectTarget(entry.id, entry.model);
      }
      return;
    }
    importCatalogEntryAsCustom(entry);
  };

  // Manual Bands
  const [bands, setBands] = useState<{ freq: number; gain: number; q: number }[]>(
    initialProfile?.bands || [
      { freq: 31, gain: 2.5, q: 1.41 },
      { freq: 105, gain: -1.5, q: 0.71 },
      { freq: 1000, gain: 1.0, q: 1.5 },
      { freq: 3500, gain: 3.0, q: 2.0 },
      { freq: 8000, gain: -2.5, q: 2.5 },
    ]
  );

  const handleParseAndSave = () => {
    setParseError(null);
    if (activeTab === 'text') {
      if (!autoEqText.trim()) {
        setParseError('AutoEqのParametricEQテキストを貼り付けてください。');
        return;
      }
      const parsed = parseAutoEqText(autoEqText, modelName);
      if (!parsed) {
        setParseError('有効なフィルター（Fc, Gain, Q）を検出できませんでした。書式を確認してください。');
        return;
      }
      parsed.brand = brand || 'UserUser';
      parsed.targetCurve = targetCurve || 'Harman Target (AutoEq)';
      onSave(parsed);
      return;
    }
    // manual tab
    const id = initialProfile?.id || `custom_${Date.now()}`;
    const profile: HeadphoneProfile = {
      id,
      modelName: modelName.trim() || 'Custom Headphone',
      brand: brand.trim() || 'UserUser',
      targetCurve: targetCurve.trim() || 'Harman Target (Custom)',
      preampGainDb,
      bands: bands.slice(0, 10),
    };
    onSave(profile);
  };

  const handleSelectTarget = (preset: { id: string; modelName: string }) => {
    if (onSelectTarget) {
      onSelectTarget(preset.id, preset.modelName);
    } else {
      onSave({
        id: preset.id,
        modelName: preset.modelName,
        brand: 'Standard',
        targetCurve: 'Harman Reference',
        preampGainDb: 0,
        bands: [],
      });
    }
  };

  const addBand = () => {
    if (bands.length >= 10) return;
    setBands([...bands, { freq: 1000, gain: 0.0, q: 1.41 }]);
  };

  const removeBand = (index: number) => {
    setBands(bands.filter((_, idx) => idx !== index));
  };

  const updateBand = (index: number, field: 'freq' | 'gain' | 'q', val: number) => {
    const updated = [...bands];
    updated[index] = { ...updated[index], [field]: val };
    setBands(updated);
  };

  return (
    <div className="flex flex-col gap-3 text-neutral-200">
      {/* Top Navigation */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 text-xs font-mono-tech text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> 戻る
        </button>
        <span className="text-xs font-mono-tech font-bold text-cyan-400">
          {mode === 'target' ? 'TARGET CURVE PICKER' : 'CUSTOM HEADPHONE BUILDER'}
        </span>
        <button
          type="button"
          onClick={handleParseAndSave}
          className="flex items-center gap-1 text-xs font-mono-tech bg-cyan-600 hover:bg-cyan-500 text-black font-bold px-3 py-1 rounded"
        >
          <Check className="w-3.5 h-3.5" /> 登録・適用
        </button>
      </div>

      {/* Tab Switch */}
      <div className="flex border-b border-neutral-800">
        {mode === 'target' && (
          <button
            type="button"
            onClick={() => setActiveTab('target')}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-mono-tech border-b-2 transition-all ${
              activeTab === 'target'
                ? 'border-cyan-400 text-cyan-300 font-bold bg-neutral-800/40'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" /> ターゲット
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('text')}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-mono-tech border-b-2 transition-all ${
            activeTab === 'text'
              ? 'border-cyan-400 text-cyan-300 font-bold bg-neutral-800/40'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" /> AutoEq一括インポート
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('manual')}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-mono-tech border-b-2 transition-all ${
            activeTab === 'manual'
              ? 'border-cyan-400 text-cyan-300 font-bold bg-neutral-800/40'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" /> 手動バンド編集
        </button>
      </div>

      {/* Tab: TARGET (search & select from HEADPHONE_CATALOG).
          Available in BOTH 'target' and 'headphone' modes:
          - target mode: pick a target curve (existing)
          - headphone mode: pick your listening headphone from the same DB
      */}
      {activeTab === 'target' && (
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
          <div className="flex items-start gap-1.5 bg-cyan-950/30 border border-cyan-800/40 rounded p-2 text-[10px] text-cyan-200">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              <strong>ターゲットカーブ</strong> (リキャリブレーション先) を選択。
              <strong>所有ヘッドホンと同一のものは除外されません</strong> (= 同ープロファイルをターゲットに選べます)。
            </span>
          </div>

          {/* Phase 2-⑥: Search box (catalog + WEB) */}
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleOnlineSearch();
                  }
                }}
                placeholder="検索 (例: Sony, AKG, Moondrop)"
                className="w-full bg-neutral-950 border border-neutral-700 rounded pl-8 pr-2.5 py-1.5 text-xs font-mono-tech text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleOnlineSearch}
              disabled={searchQuery.trim().length < 2 || onlineSearching}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-neutral-800 disabled:text-neutral-500 text-white rounded text-[10px] font-mono-tech font-bold border border-cyan-500 disabled:border-neutral-700 shrink-0"
            >
              <Globe className="w-3.5 h-3.5" />
              {onlineSearching ? '検索中…' : 'WEB SEARCH'}
            </button>
          </div>

          {onlineError && (
            <div className="flex items-center gap-1 bg-amber-950/40 border border-amber-700/40 rounded px-2 py-1 text-[9px] text-amber-300">
              <Info className="w-3 h-3 shrink-0" />
              <span>{onlineError}</span>
            </div>
          )}
          {debugStatus && (
            <div className="flex items-center gap-1 bg-neutral-900/60 border border-neutral-700/40 rounded px-2 py-1 text-[9px] text-neutral-400">
              <span>[DEBUG]</span>
              <span>{debugStatus}</span>
            </div>
          )}

          {/* Catalog results (filtered) */}
          {searchQuery.trim() && filteredCatalog.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-[9px] font-mono-tech uppercase tracking-wider text-cyan-400">
                静的カタログ (検索一致)
              </div>
              {filteredCatalog.slice(0, 10).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => handleSelectCatalogTarget(entry)}
                  className="w-full text-left p-2 rounded border text-[11px] font-mono-tech transition-all bg-neutral-950/60 border-cyan-700/40 text-neutral-200 hover:bg-neutral-800/80"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold truncate">
                      {entry.brand} {entry.model}
                    </span>
                    <span className="text-[8px] text-cyan-400">CATALOG</span>
                  </div>
                  <div className="text-[9px] text-neutral-400 mt-0.5">
                    {entry.targetCurve} • Preamp {entry.preampGainDb} dB
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Online results */}
          {onlineResults.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-[9px] font-mono-tech uppercase tracking-wider text-cyan-400">
                🌐 オンライン検索結果 ({onlineResults.length})
              </div>
              {onlineResults.slice(0, 30).map((result) => (
                <button
                  key={result.path}
                  type="button"
                  onClick={() => handleSelectOnlineTarget(result)}
                  className="w-full text-left p-2 rounded border text-[11px] font-mono-tech transition-all bg-neutral-950/60 border-cyan-700/40 text-neutral-200 hover:bg-neutral-800/80"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold truncate">
                      {result.brand} {result.modelName}
                    </span>
                    <span className="text-[8px] text-cyan-400">WEB</span>
                  </div>
                  <div className="text-[9px] text-neutral-400 mt-0.5 truncate">
                    {result.targetCurve}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Static presets (flat_bypass + flat_reference) */}
          <div className="flex flex-col gap-1">
            {HEADPHONE_PRESETS_FOR_TARGET.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectTarget(preset)}
                className={`w-full text-left p-2 rounded border text-[11px] font-mono-tech transition-all bg-neutral-950/60 border-neutral-800 text-neutral-200 hover:bg-neutral-800/80 hover:border-cyan-700/40 ${
                  preset.id === 'flat_bypass' || preset.id === 'flat_reference' ? 'border-amber-700/40' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold truncate">
                    {preset.id === 'flat_bypass' && '🎵 '}
                    {preset.id === 'flat_reference' && '⊖ '}
                    {preset.modelName}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Custom profiles (same database as listening headphones) */}
          {customProfiles.length > 0 && (
            <div className="flex flex-col gap-1 mt-2">
              <div className="text-[9px] font-mono-tech uppercase tracking-wider text-neutral-500">
                登録済カスタムプロファイル
              </div>
              {customProfiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectTarget({ id: p.id, modelName: p.modelName })}
                  className="w-full text-left p-2 rounded border text-[11px] font-mono-tech transition-all bg-neutral-950/60 border-neutral-800 text-neutral-300 hover:bg-neutral-800/80 hover:border-cyan-700/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold truncate">{p.modelName}</span>
                    <span className="text-[8px] font-mono-tech text-neutral-500">CUSTOM</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: AutoEq Text Import */}
      {activeTab === 'text' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-1.5 bg-cyan-950/30 border border-cyan-800/40 rounded p-2 text-[10px] text-cyan-200">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              AutoEq (GitHub / oratory1990 / crinacle) の <strong>ParametricEQ.txt</strong> の内容をそのまま貼り付けるだけで、自動で各フィルターとプリアンプ減衰を解析します。
            </span>
          </div>

          <textarea
            value={autoEqText}
            onChange={(e) => setAutoEqText(e.target.value)}
            placeholder={`Preamp: -5.4 dB\nFilter 1: ON PK Fc 32 Hz Gain 4.8 dB Q 1.41\nFilter 2: ON LSC Fc 105 Hz Gain 5.5 dB Q 0.71\nFilter 3: ON PK Fc 1400 Hz Gain -1.8 dB Q 2.2\nFilter 4: ON PK Fc 3000 Hz Gain 4.2 dB Q 1.8\nFilter 5: ON PK Fc 5800 Hz Gain -4.5 dB Q 3.5`}
            rows={6}
            className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-[11px] font-mono text-neutral-200 focus:border-cyan-500 focus:outline-none"
          />

          {parseError && (
            <span className="text-[10px] font-mono-tech text-red-400">
              ⚠️ {parseError}
            </span>
          )}
        </div>
      )}

      {/* Tab: Manual Band Editor */}
      {activeTab === 'manual' && (
        <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
          <div className="flex items-center justify-between bg-neutral-950 p-2 rounded border border-neutral-800">
            <span className="text-[10px] font-mono-tech text-neutral-400">
              Preamp ゲイン (クリップ防止)
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                step="0.5"
                min="-15"
                max="0"
                value={preampGainDb}
                onChange={(e) => setPreampGainDb(parseFloat(e.target.value) || 0)}
                className="w-16 bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5 text-xs font-mono-tech text-right text-cyan-300"
              />
              <span className="text-[10px] font-mono-tech text-neutral-400">dB</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono-tech uppercase text-neutral-400">
              PARAMETRIC BANDS ({bands.length}/10)
            </span>
            {bands.length < 10 && (
              <button
                type="button"
                onClick={addBand}
                className="flex items-center gap-1 text-[10px] font-mono-tech text-cyan-400 hover:text-cyan-300 bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700"
              >
                <Plus className="w-3 h-3" /> バンド追加
              </button>
            )}
          </div>

          {bands.map((band, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 bg-neutral-950/80 p-1.5 rounded border border-neutral-800 text-[11px] font-mono-tech"
            >
              <span className="text-neutral-500 w-4 text-center">{idx + 1}</span>

              <div className="flex items-center gap-1 flex-1">
                <span className="text-neutral-400 text-[9px]">F:</span>
                <input
                  type="number"
                  min="20"
                  max="20000"
                  step="10"
                  value={band.freq}
                  onChange={(e) => updateBand(idx, 'freq', parseInt(e.target.value) || 1000)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-right text-neutral-200"
                />
                <span className="text-neutral-500 text-[8px]">Hz</span>
              </div>

              <div className="flex items-center gap-1 flex-1">
                <span className="text-neutral-400 text-[9px]">G:</span>
                <input
                  type="number"
                  min="-15"
                  max="15"
                  step="0.5"
                  value={band.gain}
                  onChange={(e) => updateBand(idx, 'gain', parseFloat(e.target.value) || 0)}
                  className={`w-full bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-right font-bold ${
                    band.gain > 0 ? 'text-amber-400' : band.gain < 0 ? 'text-cyan-400' : 'text-neutral-400'
                  }`}
                />
                <span className="text-neutral-500 text-[8px]">dB</span>
              </div>

              <div className="flex items-center gap-1 w-16">
                <span className="text-neutral-400 text-[9px]">Q:</span>
                <input
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={band.q}
                  onChange={(e) => updateBand(idx, 'q', parseFloat(e.target.value) || 1.0)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-right text-neutral-200"
                />
              </div>

              <button
                type="button"
                onClick={() => removeBand(idx)}
                className="text-neutral-500 hover:text-red-400 p-1"
                title="削除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};