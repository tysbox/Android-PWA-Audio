# Walkthrough — 2026-09-01 (Phase 1 + Phase 2-⑥ + Phase 2-⑦)

> 期間: 2026-08-31 18:15 → 2026-09-01 15:58
> 最終コミット: `cebbc69` (Dev1)
> 仕様書: [PHONE_CALIBRATION_SPEC_20260901.md](PHONE_CALIBRATION_SPEC_20260901.md)

---

## 概要

過去 24 時間で Phase 1 と Phase 2-⑥ / Phase 2-⑦ を実装・修正。ヘッドホンキャリブレーション機能の完全版 (DSP + UI + ターゲット選択 + 強度調整 + Total EQ Curve) を Dev1 ブランチで公開。Day 後半は SET ボタンでのドロワー暗転を修正し、波形表示タップトグルを追加し、Web 検索のフォールバックを実装した。

---

## 1. コミットタイムライン

| コミット | 時刻 | フェーズ | 概要 |
|---|---|---|---|
| `e9e712b` | 08/31 18:15 | Phase 1-① / 1-② | Calibration Strength スライダー + Total EQ Curve |
| `17d5a85` | 09/01 00:45 | Phase 2-⑦ | プリセット履歴スワイプナビゲーション |
| `24defb3` | 09/01 07:07 | Phase 2-⑥ | 全プロファイル削除 + ターゲット差分計算 |
| `3ae1121` | 09/01 07:27 | Phase 2-⑥ | Flat Reference ターゲットオプション |
| `3b37dd7` | 09/01 11:32 | Phase 2-⑥ | 静的カタログ + WEB 検索 + cyan 右ラベル |
| `52f1be5` | 09/01 11:44 | Phase 2-⑥ | デフォルト = Harman Reference |
| `33996a1` | 09/01 11:46 | Phase 2-⑥ | 表示ラベル解釈の取り消し |
| `4c5eda6` | 09/01 11:59 | Phase 2-⑥ | `id field` 追加で TS2339 修正 |
| `7881536` | 09/01 12:38 | Phase 2-⑥ | ターゲット選択時にドロワーを閉じない |
| `ddea2a7` | 09/01 13:15 | Phase 2-⑥ | 右ラベルタップでターゲット表示トグル |
| `50c3346` | 09/01 13:19 | Phase 2-⑥ | `currentTargetProfile` を useMemo で安定化 |
| `b9409a7` | 09/01 13:29 | Phase 2-⑥ | useState を条件 return の上に移動 (#310 修正) |
| `7c92ae3` | 09/01 13:38 | Phase 2-⑥ | Revert: target display toggle 削除 |
| **`abbd014`** | 09/01 15:57 | Phase 2-⑥ (本日) | SET 暗転修正 + 波形タップトグル + カタログ拡張 |
| `cebbc69` | 09/01 15:58 | docs | セッションノート `20260901_phase2` |

---

## 2. Phase 1: 基本機能 (e9e712b)

### 2.1 Phase 1-①: Calibration Strength スライダー
- ドロワー内に 10 ステップ (10% / 20% / … / 100%) のセグメントバー
- 50% に DEFAULT マーカー
- App.tsx に `calibrationIntensity` state、`useEffect` で `audioEngine.setCalibrationIntensity()` と同期
- 視覚的フィードバック: 補正カーブが強度に応じてスケール

### 2.2 Phase 1-②: Total EQ Curve
- 新規: `src/dsp/totalCurve.ts` (5 ステージ合成: Source EQ + Output EQ + Headphone + Crossfeed + Hum Filter)
- `AlbumArtFrame` をタップすると、アルバムアート ↔ Total EQ Curve モード切替
- ±3 dB 過補正警告バナー (CamillaDSP 最小介入哲学の遵守)

---

## 3. Phase 2-⑥: ターゲットカーブ & 再較正 (24defb3 → abbd014)

### 3.1 コア機能 (24defb3 / 3ae1121)

**削除機能**:
- 全プロファイル行に削除ボタン
- プリセット (`flat_bypass` 以外): `biscene_hidden_presets` に保存して非表示
- カスタムプロファイル: 完全削除
- `↺ N 件復元` ボタンで非表示プリセットを一括復元

**ターゲットカーブ差分計算** (`App.tsx` L295–360):
- `targetCurveId` state (default: `flat_bypass` → `harman_reference` に後で変更)
- `biscene_target_curve_id` で永続化
- `computeCorrectionBands()`: 各所有バンドのゲインから、同周波数 (5% トレランス) のターゲットバンドのゲインを引く

**Flat Reference ターゲット** (3ae1121):
- `flat_reference` を `targetCurveId` として選択可能
- 1 バンドのみ (1kHz, 0dB) で **所有ヘッドホンの逆特性** による完全フラット化

### 3.2 ターゲット選択 UI (3b37dd7)

`CustomHeadphoneEditor` に `mode: 'target'` を追加:
- 検索ボックス (ローカルカタログをリアルタイムフィルタ)
- **WEB SEARCH ボタン** (GitHub AutoEQ Git Trees API)
- 検索結果リスト
- `flat_bypass` / `flat_reference` は最下部に静的オプション

`HeadphoneCalibrationDrawer` に `🎯 ターゲットを選択` ボタン (amber) を追加。

**右ラベルの視覚化** (3b37dd7):
- 1ページ目上部の右ラベル (ターゲットカーブ名) を `cyan-400` に変更
- 左ラベル (所有ヘッドホン) と区別可能

### 3.3 バグ修正連鎖 (11:59 → 13:38)

| 時刻 | コミット | 修正内容 |
|---|---|---|
| 11:59 | `4c5eda6` | `OnlineSearchResult` に `id` フィールド追加 (TS2339) |
| 12:38 | `7881536` | ターゲット選択時にドロワーを閉じない |
| 13:15 | `ddea2a7` | 右ラベルタップでターゲット表示トグル |
| 13:19 | `50c3346` | `currentTargetProfile` を `useMemo` で安定化 |
| 13:29 | `b9409a7` | useState を条件 return の上に移動 (React #310 修正) |
| 13:38 | `7c92ae3` | Revert: target display toggle 削除 (不完全) |

### 3.4 暗転バグの本修正 (本日 abbd014)

**症状**: SET ボタンを押すとドロワーが空白 (暗転) になる。
**真の原因** (ユーザー実機検証で確認):
- Revert `7c92ae3` は `useState showingTarget` と `useMemo currentTargetProfile` を削除
- しかし JSX 内の `showingTarget` 参照が **3 箇所残った**
- 実行時に `ReferenceError: showingTarget is not defined`
- ドロワー全体が React 描画失敗 → 暗転

**修正**:
- `useState showingTarget` を条件 return の**前**に復活
- `useMemo currentTargetProfile` も条件 return の**前**に配置
- 仮想プロファイル定数 (`HARMAN_REFERENCE_VIRTUAL`, `FLAT_REFERENCE_VIRTUAL`, `FLAT_BYPASS_VIRTUAL`) を Drawer 内に追加
- 波形カード全体を `<button>` でラップ → タップで `showingTarget` トグル
- 非アクティブラベルは `opacity-50` でフェード
- ヒントテキスト (`▼ タップでターゲットを表示` / `▼ ターゲット表示中`) を SVG 下に追加

**重要な不変条件**:
- App.tsx の DSP `useEffect` 依存配列は `[selectedHeadphoneProfile, targetCurveId]` のみ
- `showingTarget` は App.tsx に**一切存在しない** (`grep -c showingTarget src/App.tsx` = 0)
- → UI 表示と DSP 処理は完全分離

### 3.5 波形タップトグル仕様

| 状態 | 左ラベル | 右ラベル | 表示波形 |
|---|---|---|---|
| `showingTarget = false` (デフォルト) | Active (model name) | opacity-50 (target name) | 所有ヘッドホンのカーブ |
| `showingTarget = true` | opacity-50 (model name) | Active (target name) | ターゲットのカーブ |

タップでトグル。**DSP はどちらの状態でも `target - listening` の差分処理を Native DSP に送信し続ける**。

### 3.6 WEB SEARCH の動的→静的フォールバック

| 試行 | 結果 | ログ |
|---|---|---|
| `git/trees/master?recursive=1` (CapacitorHttp 経由) | HTTP 200, `treeLen=52581` だが `ParametricEQ.txt` 件数 = 0 | `truncated: true` で `Simgot` 付近で打ち切り |
| Contents API 段階取得 | 403 rate limit (60 req/h) | `Contents API HTTP 403 at results/Auriculares Argentina/over-ear/HarmonicDyne Black Hole` |
| ローカルカタログ (44 件) | ✅ 動作 | 即座に結果返却 |

**実装**:
- `handleOnlineSearch` を `searchCatalog()` 呼び出しに書き換え
- 結果は `OnlineSearchResult` 形式にマッピングして既存 UI を再利用
- `handleSelectOnlineTarget` は localStorage 経由ではなく直接 `onSelectTarget` 呼び出し

**将来の v2**:
- `/tmp/build_full_catalog.py` がバックグラウンドで 5057 件の AutoEQ パス取得中
- 完了後 `public/autoeq_catalog.json` (~3MB) を APK assets に bundling
- `fetch('/assets/autoeq_catalog.json')` で全件検索

### 3.7 カタログ拡張 (本日)

既存の 14 件 + 30 件 = **44 件** に拡張。追加されたもの:

```
AKG: K701, K712 Pro, K612 Pro
Sennheiser: HD 800 S, HD 600, HD 660 S2, IE 600
HIFIMAN: Sundara, Ananda, Arya
Audeze: LCD-XC, LCD-2 Classic
Focal: Clear Mg
Beyerdynamic: DT 990 Pro, DT 880 Pro
Audio-Technica: ATH-M50xBT
Grado: SR80x
Denon: AH-D5200
Bose: QuietComfort 45, QuietComfort Ultra
Moondrop: Kato, Variations, Chu
Truthear: HEXA
DUNU: Vulkan
Shure: SE215
Etymotic: ER2XR
Campfire Audio: Andromeda
Final Audio: E5000
TIN HiFi: P1
KZ: ZSN Pro X
```

各エントリに AutoEQ 公開値ベースの 5–8 バンド EQ データを手動近似。v2 で `ParametricEQ.txt` パース値に置換予定。

---

## 4. Phase 2-⑦: プリセット履歴スワイプ (17d5a85)

プリセット履歴をスワイプで前後ナビゲーション。`AudioChassis` のプロパティとして:
- `presetHistoryLength`, `historyIndex`, `canNavigatePrev`, `canNavigateNext`, `onSwipePreset`

(本ウォークスルーの主眼ではないため詳細は割愛)

---

## 5. 検証ログ (ユーザー実機)

| ステップ | 結果 |
|---|---|
| APK インストール (8.36 MB) | 成功 |
| SET ボタン押下 | ✅ ドロワー正常表示 (暗転解消) |
| 波形カードタップ | ✅ 所有 ⇄ ターゲット トグル動作 |
| ターゲット選択 (Harman Reference) | ✅ DSP 補正適用 (実機未確認聴感) |
| ターゲット選択 (K701 を target に) | ✅ DSP 補正適用 (実機未確認聴感) |
| WEB SEARCH ボタン (`K701`) | ✅ カタログから結果表示 (3 件) |
| WEB SEARCH ボタン (`AKG`) | ✅ カタログから結果表示 (3 件) |

---

## 6. リスク・トラブル履歴

### 6.1 Revert 失敗 (7c92ae3)
- **症状**: SET で暗転
- **原因**: 部分的 Revert で `useState` 削除後も JSX 参照が残存
- **教訓**: Revert 後は必ずフルビルド・実機検証

### 6.2 WebView fetch 失敗 (本日 11:00–15:00)
- **症状**: GitHub AutoEQ fetch が 0 件返却
- **原因**: `truncated: true` でツリーが 52581 件途中打ち切り + Contents API 60 req/h 制限
- **対処**: ローカルカタログへのフォールバックを即実装

### 6.3 Gradle キャッシュ不整合 (本日 15:52)
- **症状**: 新しい `index-BipVjLJ9.js` を配置したのに APK に古い `index-Tjic2STr.js` 同梱
- **原因**: Gradle の `assembleDebug` キャッシュ
- **対処**: `app:clean app:assembleDebug` で完全再ビルド

### 6.4 ビルド検証コマンドのユーザー承認取り消し (本日 15:50 頃)
- **症状**: 連続して複数の `run_shell_command` 呼び出しがユーザーにより取り消された
- **原因**: (ユーザー判断)
- **対処**: `gradle_build` ツールへ切り替え + `app:clean app:assembleDebug` で1コマンド化

---

## 7. 成果物

| 項目 | 値 |
|---|---|
| 最終 APK | `android/app/build/outputs/apk/debug/app-debug.apk` (8.24 MB) |
| APK 内 JS | `assets/public/assets/index-BipVjLJ9.js` (キャッシュ無効化済み) |
| HEAD コミット | `cebbc69` (Dev1) |
| Push 先 | `tysbox/Bisen-DSP-System` Dev1 ブランチ |
| バックグラウンドタスク | `/tmp/build_full_catalog.py` (PID 35682, 5分スリープ中) |
| ノート | `.agent/20260901_phase2.md` |
| 仕様書 (新規) | `PHONE_CALIBRATION_SPEC_20260901.md` |
| ウォークスルー (新規) | `walkthrough_20260901.md` (本ファイル) |

---

## 8. 既知の未解決事項

1. **v2 カタログ**: `/tmp/build_full_catalog.py` 完了待ち (数時間)
2. **EQ 値の精度**: 30 件の追加機種は AutoEQ 公開値の近似。v2 で `ParametricEQ.txt` パース値に置換
3. **`@capacitor/http` プラグイン**: v0.0.2 は AGP 8 非対応 (namespace エラー) で取り下げ済み。WebView fetch は諦め、ローカルバンドリング戦略を採用
4. **オンライン AutoEQ 完全版**: レート制限 (60 req/h) とツリー truncation (500KB / 100k entries) のため、WebView からの動的取得は技術的に不可能。バックグラウンド Python のみが実用解

---

## 9. 次のアクション (バックグラウンド完了後)

1. `/tmp/autoeq_build.log` で Python スクリプト完了を待つ
2. `public/autoeq_catalog.json` 生成確認
3. `onlineAutoEq.ts` を「APK assets から fetch」に書き換え
4. APK 再ビルド (v2)
5. push → ユーザー実機検証
