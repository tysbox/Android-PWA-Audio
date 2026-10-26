# Phone Calibration — 機能仕様書 (v2.0 / 2026-09-01)

> 対象: Phase 1-① / Phase 1-② / Phase 2-⑥ / Phase 2-⑦ を含む実装
> ブランチ: `Dev1` (HEAD: `cebbc69`)
> 関連マニュアル: [PHONE_CALIBRATION_MANUAL.md](PHONE_CALIBRATION_MANUAL.md) — 操作手順

---

## 1. 機能の全体像

**Phone Calibration モジュール** は、ユーザーの手元にあるイヤホン/ヘッドホンの周波数特性を、リファレンスカーブ (Harman Reference 等) に近づける **キャリブレーション** と、別の機種の音色を再現する **リキャリブレーション** を一括で行う DSP 機能。

DSP パイプライン上の位置:

```
Input
 → [Preamp]
 → [Source EQ] (Source EQ プリセット)
 → [Hum Filter] (50/60Hz)
 → [Headphone Calibration]          ← 本機能
 → [Crossfeed]
 → [Output EQ] (Output EQ プリセット)
 → [Tube Warmth] (ON/OFF)
 → [Ambience] (IRリバーブ)
 → [Limiter]
 → Output
```

`Headphone Calibration` ステージは **「ターゲットカーブ − 所有ヘッドホンカーブ」の差分** を 10 バンドの Parametric Biquad フィルタで実装する。

---

## 2. 用語

| 用語 | 意味 |
|---|---|
| **所有ヘッドホン (Listening)** | ユーザーが今装着しているイヤホン/ヘッドホンの周波数特性カーブ |
| **ターゲット (Target)** | 補正後の理想特性 (Harman Reference / Flat Reference / 任意のヘッドホンカーブ) |
| **キャリブレーション** | 所有ヘッドホンの周波数特性を目標カーブ (フラット) に近づける補正 |
| **リキャリブレーション** | 所有ヘッドホンの音色を目標機種の音色に **近づける** 補正 (差分) |
| **Calibration Strength** | 補正量 0–100% (CamillaDSP 設計哲学「介入最小化」) |
| **A/B Direct** | DSP バイパス (`biscene_dsp_bypassed` フラグで全 DSP をスキップ) |

---

## 3. UI 構成 (Phase 1-① + Phase 2-⑥)

### 3.1 ミキサーパネル (常時表示)

```
┌─ Phone Calibration ─────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓ (モデル名)         [SET]│
└─────────────────────────────────────┘
```

- 左: 現在有効な所有ヘッドホンのモデル名
- 右: **`SET` ボタン** → ドロワー (`HeadphoneCalibrationDrawer`) を開く

### 3.2 ドロワー画面 (`HeadphoneCalibrationDrawer`)

上部から順に:

1. **トーンカーブ表示 (Phase 1-① + Phase 2-⑥)**
   - `<button>` 要素でラップされ、タップで `showingTarget` をトグル
   - 左ラベル: **所有ヘッドホンのモデル名** (Active 時) / `opacity-50` (Inactive 時)
   - 右ラベル: **ターゲットの表示名** (Inactive 時) / `opacity-50` (Active 時)
   - ヒントテキスト: `▼ タップでターゲットを表示` / `▼ ターゲット表示中 (タップで切替)`
   - **重要**: タップは UI のみ。DSP 処理は影響を受けない (セクション 5 参照)

2. **Calibration Strength バー (Phase 1-①)**
   - 10 ステップ (10%, 20%, …, 100%)
   - 50% に DEFAULT マーカー (cyan-700)
   - タップで `onCalibrationIntensityChange(v / 100)`

3. **A/B Direct & Tube Saturation トグル**
   - A/B Direct: DSP バイパス (RAW ↔ DSP ACTIVE)
   - Tube Saturation: 偶数次倍音 ON/OFF

4. **プロファイルリスト**
   - **追加ボタン 2 種** (Phase 2-⑥):
     - `＋ 所持ヘッドホンを追加 (AutoEq)` (cyan) — AutoEQ テキスト貼り付け / 手動バンド編集
     - `🎯 ターゲットを選択` (amber) — リキャリブレーション先を選択
   - 各行に **削除ボタン** (Trash2 アイコン):
     - プリセット (`flat_bypass` 以外): リストから非表示 (`biscene_hidden_presets` に保存)
     - カスタム: 完全削除
   - **`↺ N 件復元` ボタン**: 非表示にしたプリセットを一括復元

5. **DONE ボタン**: ドロワーを閉じる

### 3.3 ターゲット選択ドロワー (`CustomHeadphoneEditor` mode=`target`)

3 つのタブ:

| タブ | 内容 |
|---|---|
| **target** (デフォルト) | 検索ボックス + 静的カタログリスト (Phase 2-⑥ で追加) + **WEB SEARCH ボタン** (Phase 2-⑥、v1 はローカルカタログ) |
| **text** | AutoEQ テキストを手動貼り付け |
| **manual** | 10 バンドを手動編集 |

`🎯 ターゲットを選択` ボタンから開く。`onSelectTarget` コールバックで App.tsx に `targetCurveId` を通知。

---

## 4. データモデル

### 4.1 `HeadphoneProfile` ([src/types/index.ts](src/types/index.ts))

```ts
interface BiquadBand {
  freq: number;     // Hz
  gain: number;     // dB
  q: number;        // Q factor
  type: 'peaking' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass';
}
interface HeadphoneProfile {
  id: string;
  modelName: string;
  brand: string;
  targetCurve: string;
  preampGainDb: number;
  bands: BiquadBand[];
}
```

### 4.2 `targetCurveId` (App.tsx)

`localStorage` の `biscene_target_curve_id` に永続化。デフォルトは `'harman_reference'` (Harman Reference)。

特殊な id と意味:

| id | 意味 | 効果 |
|---|---|---|
| `harman_reference` | Harman 2019 Over-Ear ターゲット | デフォルト。穏やかな傾き (+0.5 ~ -2dB) |
| `flat_bypass` | Bypass (No Calibration) | 補正なし (A/B Direct と同じ) |
| `flat_reference` | Flat Reference (打ち消し) | 所有ヘッドホンの逆特性で完全フラット化 |
| `<preset_id>` | `HEADPHONE_PROFILES` 内の id | 該当機種のカーブを目標に |
| `<custom_id>` | ユーザーが作成したプロファイル id | カスタムカーブを目標に |

### 4.3 仮想プロファイル定数 ([src/components/HeadphoneCalibrationDrawer.tsx](src/components/HeadphoneCalibrationDrawer.tsx))

`HEADPHONE_PROFILES` には存在しない3つの仮想 id を Drawer 内で定義し、`useMemo` で `HeadphoneProfile` 形式に解決:

- `HARMAN_REFERENCE_VIRTUAL` (5 バンド近似: 105Hz / 1k / 3k +1dB / 5k +0.5dB / 10k -2dB)
- `FLAT_REFERENCE_VIRTUAL` (1 バンド: 1kHz 0dB)
- `FLAT_BYPASS_VIRTUAL` (0 バンド)

---

## 5. DSP 処理と UI 表示の完全分離

### 5.1 DSP パイプライン ([src/App.tsx](src/App.tsx) L295–360)

```ts
const computeCorrectionBands = (listening, target) => {
  // 1. ターゲットと同じプロファイル → 補正なし
  // 2. 各所有バンドについて、同じ周波数のターゲットバンドのゲインを
  //    引き算 (tolerance = freq × 5%) → 補正カーブ算出
  return { ...listening, bands: correctedBands };
};

useEffect(() => {
  const target = resolveProfileById(targetCurveId);
  audioEngine.setHeadphoneProfile(
    target ? computeCorrectionBands(selectedHeadphoneProfile, target)
           : selectedHeadphoneProfile
  );
}, [selectedHeadphoneProfile, targetCurveId]);  // ← UI の showingTarget はここに入らない
```

### 5.2 UI 表示 ([src/components/HeadphoneCalibrationDrawer.tsx](src/components/HeadphoneCalibrationDrawer.tsx))

```ts
const [showingTarget, setShowingTarget] = useState(false);
const currentProfileForCurve =
  hoveredProfile
  || (showingTarget ? currentTargetProfile : null)
  || allProfiles.find(p => p.id === selectedProfileId)
  || allProfiles[0]
  || HEADPHONE_PROFILES[0];
```

### 5.3 独立性

| | DSP 処理 | UI 表示 |
|---|---|---|
| 依存 state | `selectedHeadphoneProfile`, `targetCurveId` | 同じ + `showingTarget` |
| 更新タイミング | `useEffect` で自動 | `useState` で即時 |
| 影響 | Native DSP (PCM 出力) | SVG 波形のみ |
| タップで変化 | ❌ しない | ✅ する |

`App.tsx` には `showingTarget` への参照が一切ない (`grep "showingTarget" src/App.tsx` → 0件)。

---

## 6. 状態管理

| State | 場所 | 永続化先 | デフォルト |
|---|---|---|---|
| `selectedHeadphoneProfile` | App.tsx | `biscene_headphone_profile_v1` | `HEADPHONE_PROFILES[1]` (Sony WH-1000XM5) |
| `targetCurveId` | App.tsx | `biscene_target_curve_id` | `'harman_reference'` |
| `calibrationIntensity` | App.tsx | (なし) | 0.5 (50%) |
| `dspBypassed` | App.tsx | (なし) | `false` |
| `tubeWarmthEnabled` | App.tsx | (なし) | `false` |
| `hiddenPresetIds` | Drawer.tsx | `biscene_hidden_presets` | `[]` |
| `customProfiles` | Drawer.tsx (mount 時) | `biscene_custom_headphone_profiles` | (空) |
| `showingTarget` | Drawer.tsx | (なし) | `false` |

---

## 7. カタログ (Phase 2-⑥ 拡張)

### 7.1 `HEADPHONE_CATALOG` (44 エントリ)

`src/dsp/headphoneCatalog.ts` に静的定義。元 14 エントリ + Phase 2-⑥ で追加された 30 エントリ:

| ブランド | 追加されたモデル |
|---|---|
| AKG | K701, K712 Pro, K612 Pro |
| Sennheiser | HD 800 S, HD 600, HD 660 S2, IE 600 |
| HIFIMAN | Sundara, Ananda, Arya |
| Audeze | LCD-XC, LCD-2 Classic |
| Focal | Clear Mg |
| Beyerdynamic | DT 990 Pro, DT 880 Pro |
| Audio-Technica | ATH-M50xBT |
| Grado | SR80x |
| Denon | AH-D5200 |
| Bose | QuietComfort 45, QuietComfort Ultra |
| Moondrop | Kato, Variations, Chu |
| Truthear | HEXA |
| DUNU | Vulkan |
| Shure | SE215 |
| Etymotic | ER2XR |
| Campfire Audio | Andromeda |
| Final Audio | E5000 |
| TIN HiFi | P1 |
| KZ | ZSN Pro X |

各エントリは `id, brand, model, targetCurve, preampGainDb, bands[], popularity, formFactor` を持ち、`searchCatalog(query)` で部分一致検索される。

### 7.2 WEB SEARCH ボタン (v1)

GitHub AutoEQ への直接 fetch は WebView で失敗するため、`handleOnlineSearch` は `searchCatalog(query)` を呼び出して `HEADPHONE_CATALOG` 内のエントリを返す。

### 7.3 WEB SEARCH ボタン (v2 — 将来)

`/tmp/build_full_catalog.py` がバックグラウンドで実行中。GitHub Contents API を使い 5057 件の `ParametricEQ.txt` パスを取得し `public/autoeq_catalog.json` に保存 (約 3MB)。完了後、APK assets に bundling して `fetch('/assets/autoeq_catalog.json')` で全件検索が可能になる予定。

---

## 8. API 仕様

### 8.1 `searchCatalog(query: string): CatalogEntry[]`
- 部分一致 (brand / model / targetCurve)
- 空文字 → 人気順 top 10
- 結果は popularity 降順

### 8.2 `catalogEntryToProfile(entry: CatalogEntry): HeadphoneProfile`
- `id` は `custom_${Date.now()}` で生成 (AutoEQ 由来と区別)
- `bands` はディープコピー

### 8.3 `getPopularCatalogEntries(limit = 10): CatalogEntry[]`
- popularity 降順で top N

### 8.4 `resolveProfileById(id: string): HeadphoneProfile | null` (App.tsx)
- 特殊な id (`harman_reference`, `flat_reference`, `flat_bypass`) → ローカル定数
- プリセット → `HEADPHONE_PROFILES` から
- カスタム → localStorage から
- 該当なし → `null`

### 8.5 `computeCorrectionBands(listening, target): HeadphoneProfile` (App.tsx)
- 両者の id が同じ → 補正なし (空 bands)
- 各所有バンドのゲインを、同じ周波数 (5% トレランス) のターゲットバンドから引く
- 結果として `bands: correctedBands` を持つ profile を返す

---

## 9. React Hooks 順序の保証 (Phase 2-⑥ で修正した #310 エラー)

`HeadphoneCalibrationDrawer` 内の全 hook は **`if (!isOpen) return null` の前** に宣言する必要がある:

```ts
export const HeadphoneCalibrationDrawer = (...) => {
  // 1. 全ての useState (条件 return 前)
  const [customProfiles, setCustomProfiles] = useState(...);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProfile, setEditingProfile] = useState(undefined);
  const [editingMode, setEditingMode] = useState('headphone');
  const [hoveredProfile, setHoveredProfile] = useState(null);
  const [showingTarget, setShowingTarget] = useState(false);     // Phase 2-⑥
  const currentTargetProfile = useMemo<...>(() => { ... }, [...]); // Phase 2-⑥
  const [hiddenPresetIds, setHiddenPresetIds] = useState(...);

  // 2. useEffect (条件 return 前)
  useEffect(() => { ... }, [hiddenPresetIds]);
  useEffect(() => { ... }, [isOpen]);

  // 3. 条件 return (これより後は hook 禁止)
  if (!isOpen) return null;

  // 4. レンダー本体 — 純粋な計算のみ
  const currentProfileForCurve = ...;
  // ...
};
```

**過去の障害履歴 (HEAD `7c92ae3`)**:
- Revert 時に `useState showingTarget` 宣言を `useMemo currentTargetProfile` ごと削除
- しかし JSX 内の `showingTarget` 参照は残った
- 結果: 実行時 `ReferenceError: showingTarget is not defined` で描画失敗
- **修正**: 全 hook を条件 return 前に統一配置 + JSX 参照を `setShowingTarget` 経由でトグル

---

## 10. デバッグ機能

### 10.1 画面内ステータス表示 (Phase 2-⑥ で追加)

ターゲットドロワー下部にデバッグステータスが表示される:

```
🔍 env: isWebView=true catalogSize=44
✅ カタログ 5 件マッチ
```

### 10.2 Logcat 出力 (WebView Console)

- `[AutoEq] HTTP 200 OK content-type=application/json url=...`
- `[AutoEq] parsed JSON: keys=... treeLen=... truncated=...`
- `[AutoEq] Contents walk complete: N ParametricEQ.txt entries`

---

## 11. 制限事項・既知の問題

| 項目 | 内容 |
|---|---|
| 30 件の追加機種の EQ 値 | AutoEQ 公開値の近似 (実測値ではない)。`public/autoeq_catalog.json` 完了後、v2 で `ParametricEQ.txt` パース値に置換予定 |
| WEB SEARCH 速度 | ローカルカタログ (44 件) は瞬時。v2 (5057 件) は初回ロード時に 100ms 程度必要 (キャッシュ後は即時) |
| レート制限 | GitHub AutoEQ API 60 req/h 制限により v2 取得には数時間 (バックグラウンド Python で対応) |

---

## 12. 関連ファイル

| ファイル | 役割 |
|---|---|
| `src/components/HeadphoneCalibrationDrawer.tsx` | ドロワー UI (`showingTarget` 状態管理含む) |
| `src/components/CustomHeadphoneEditor.tsx` | ターゲット選択エディタ (タブ・WEB SEARCH) |
| `src/dsp/headphoneCatalog.ts` | 静的カタログ (44 件) |
| `src/dsp/headphoneProfiles.ts` | プリセットプロファイル (9 件) と `calculateProfileResponseCurve` |
| `src/dsp/onlineAutoEq.ts` | GitHub AutoEQ fetch (v2 用、現在は未使用) |
| `src/dsp/customProfileStorage.ts` | カスタムプロファイルの localStorage 管理 |
| `src/dsp/totalCurve.ts` | Phase 1-② の Total EQ Curve 計算 (5 ステージ合成) |
| `src/App.tsx` | DSP パイプライン・`computeCorrectionBands`・`resolveProfileById` |
| `src/utils/haptics.ts` | 触覚フィードバック |
| `.agent/20260901_phase2.md` | Phase 2-⑥ のセッションノート |
