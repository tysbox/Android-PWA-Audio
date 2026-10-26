# BiScene Audio — アプリ全体仕様書 (v1.0 / 2026-09-01)

> 対象: ブランチ `Dev1` HEAD (`cebbc69`)
> プラットフォーム: Android (Capacitor)、Web (PWA)
> パッケージ: `com.bisen.biscene`
> アプリ名: BiScene Audio / Biscène Audio System
> アイコン: 木目調 (WoodFrame) + 削り出しメタル (MetalPanel)

---

## 1. 製品概要

### 1.1 目的
**CamillaDSP 設計哲学「介入最小化」を尊重する** Web Audio DSP ベースの音楽プレーヤー。CamillaDSP (Linux) の構成を Android / Web Audio API に移植。ヘッドホンキャリブレーション・IR リバーブ・クロスフィード・真空管サチュレーションなど、独立した音響処理要素をリアルタイムに組み合わせ可能。

### 1.2 進化の歴史
- 旧: ネイティブ Android (libcamilladsp.so + Oboe C++)
- **現: TypeScript (React + Vite + Tailwind) + Capacitor (Android / iOS / Web)**

### 1.3 主な機能
1. **Web Audio DSP エンジン** (Source EQ / Hum Filter / Headphone Calibration / Crossfeed / Output EQ / Tube Saturation / Ambience / Limiter)
2. **Phone Calibration & Recalibration** (10 バンド Parametric Biquad, AutoEQ データ)
3. **プリセット保存 / 呼出 / 削除 / 履歴スワイプ**
4. **ローカル音源再生** (hi-res / lossless 対応)
5. **DLNA / UPnP ネットワーク再生** (メディアサーバ参照)
6. **削り出し風ハードウェア UI** (木目フレーム + ブラッシュドメタル + ロータリーダイヤル)

---

## 2. システム構成

### 2.1 全体図

```
┌──────────────────────────────────────────────────────────┐
│                BiScene Audio (WebView)                   │
│                                                          │
│  ┌─────────────────┐    ┌──────────────────┐            │
│  │  React/TS UI    │◄──►│  DSP Pipeline    │            │
│  │  (App.tsx)      │    │  (AudioEngine.ts)│            │
│  └────────┬────────┘    └────────┬─────────┘            │
│           │                       │                      │
│           ▼                       ▼                      │
│  ┌─────────────────┐    ┌──────────────────┐            │
│  │  Web Audio API  │    │   Capacitor      │            │
│  │  BiquadFilter   │    │   Plugins        │            │
│  │  ConvolverNode  │    │  (DlnaPlayback)  │            │
│  │  WaveShaper     │    │                  │            │
│  └────────┬────────┘    └────────┬─────────┘            │
│           │                       │                      │
└───────────┼───────────────────────┼──────────────────────┘
            │                       │
            ▼                       ▼
   ┌────────────────┐      ┌────────────────────┐
   │ AudioContext   │      │ Java/Kotlin (DSP   │
   │ .destination   │      │ bridge + Network)  │
   │  (PCM 出力)    │      │                    │
   └────────────────┘      │  - DlnaPlayback    │
                           │  - UpnpSsdpBridge  │
                           │  - NativeDspChain  │
                           │  - PlaybackService │
                           └────────┬───────────┘
                                    │
                                    ▼
                          ┌────────────────────┐
                          │  Android System    │
                          │  - MediaSession    │
                          │  - AudioFlinger    │
                          │  - WiFi Multicast  │
                          │  - Foreground Svc  │
                          └────────────────────┘
```

### 2.2 技術スタック

| レイヤ | 技術 |
|---|---|
| UI フレームワーク | React 18.3 + Vite 6.1 + TypeScript 5.7 |
| スタイリング | Tailwind CSS 4.0 |
| アイコン | Lucide React |
| アニメーション | Motion 12.4 |
| 状態管理 | React Hooks (useState / useEffect / useMemo / useRef) |
| 永続化 | localStorage |
| モバイルラッパー | Capacitor 8.5 (android / ios) |
| ネイティブ DSP | Java (Android) + CamillaDSP 移植 (Web Audio API) |
| HTTP プロキシ | Java Socket Server (PCM ストリーム用) |
| メディア検出 | Storage Access Framework / SAF |
| フォーマット | FLAC / WAV / DSD (DSF) / MP3 / AAC / OGG / M4A |

---

## 3. ファイル構成

### 3.1 TypeScript ソース (`src/`)

```
src/
├── main.tsx                                  # React エントリポイント
├── App.tsx (1112 lines)                       # メインアプリケーション
├── types.ts                                   # 型定義 (DspPreset, TrackItem, HeadphoneProfile, ...)
│
├── data/
│   └── demoTracks.ts                          # デモ用トラック
│
├── utils/
│   ├── haptics.ts                             # 触覚フィードバック
│   ├── localArt.ts                            # アルバムアート抽出
│   ├── localLibrary.ts                        # ローカルファイル管理
│   └── upnpClient.ts                          # UPnP クライアントヘルパー
│
├── dsp/
│   ├── AudioEngine.ts (44KB)                  # Web Audio DSP パイプライン
│   ├── presets.ts                             # プリセット定義 (Source/Output EQ / Ambience / Crossfeed / Hum)
│   ├── headphoneProfiles.ts                   # ヘッドホンプロファイル (9 件)
│   ├── headphoneCatalog.ts (44 entries)       # 静的カタログ
│   ├── customProfileStorage.ts                # カスタムプロファイル管理
│   ├── totalCurve.ts                          # Total EQ Curve 計算
│   └── onlineAutoEq.ts                        # AutoEQ Web fetch (v2 用)
│
└── components/
    ├── AudioChassis.tsx                       # ハードウェア風 UI コンテナ
    ├── AlbumArtFrame.tsx                      # アルバムアート / Total EQ Curve
    ├── PlayerControls.tsx                     # 再生コントロール
    ├── MixerControls.tsx                      # DSP ミキサーコントロール
    ├── PresetModals.tsx                       # プリセット保存 / 呼出
    ├── HeadphoneCalibrationDrawer.tsx        # キャリブレーションドロワー
    ├── CustomHeadphoneEditor.tsx              # プロファイルエディタ
    ├── UpnpBrowserModal.tsx (50KB)            # UPnP ブラウザ
    ├── LocalBrowserModal.tsx                  # ローカルブラウザ
    ├── LocalSourceModal.tsx                   # ローカルソースピッカー
    ├── QueDrawer.tsx                          # キュー管理ドロワー
    ├── VuMeter.tsx                            # VU メーター
    ├── SmallDial.tsx                          # 小型ダイヤル
    ├── MachinedWheel.tsx                      # メインロータリーダイヤル
    ├── TripleLever.tsx                        # トリプルレバー (Source/Output EQ 切替)
    ├── MetalPanel.tsx / MetalButtons.tsx     # メタル風 UI 部品
    ├── WoodFrame.tsx                          # 木目フレーム
    ├── BisceneLogo.tsx                        # ロゴ
    ├── NativeImage.tsx                        # ネイティブ画像表示
    └── PwaInstallBanner.tsx                   # PWA インストールバナー
```

### 3.2 Android ネイティブ (`android/app/src/main/java/com/bisen/biscene/`)

```
com/bisen/biscene/
├── MainActivity.java                          # Capacitor メインアクティビティ
├── PlaybackService.java                       # バックグラウンド再生サービス
├── UpnpSsdpBridge.java (37KB)                 # UPnP SSDP ブリッジ
├── DlnaPlaybackPlugin.java (98KB)             # DLNA 再生プラグイン
│
└── dsp/
    ├── NativeDspChain.java                    # ネイティブ DSP チェーン
    ├── DspProcessor.java                      # DSP プロセッサ
    ├── Biquad.java                            # Biquad フィルタ
    ├── ReverbFx.java                          # リバーブエフェクト
    ├── Fft.java                               # FFT (位相線形化等)
    ├── BitDepthAnalyzer.java                  # ビット深度解析
    ├── RateConverter.java                     # レート変換
    ├── UniformConvolver.java                  # 均一畳み込み
    ├── WavSupport.java                        # WAV サポート
    ├── DsfDecoder.java                        # DSD (DSF) デコーダ
    └── TagParser.java                         # タグパーサー
```

### 3.3 設定ファイル

| ファイル | 役割 |
|---|---|
| `capacitor.config.ts` | Capacitor 設定 (`androidScheme: 'http'`, `cleartext: true`) |
| `vite.config.ts` | Vite ビルド設定 |
| `tsconfig.json` / `tsconfig.node.json` | TypeScript 設定 |
| `tailwind.config.*` | Tailwind 設定 |
| `package.json` | npm 依存関係 |
| `android/app/src/main/AndroidManifest.xml` | Android パーミッション / Service 宣言 |
| `android/app/src/main/res/xml/network_security_config.xml` | ネットワークセキュリティ |

---

## 4. データモデル (`src/types.ts`)

```ts
export interface DspPreset {
  name: string;
  outputEqIdx: number;
  sourceEqIdx: number;
  humFilterIdx: number;
  ambienceIdx: number;
  ambienceIntensity: number;
  crossfeedIdx: number;
  crossfeedIntensity: number;
  headphoneProfileId: string;
  tubeWarmth: boolean;
}

export interface BiquadFilterConfig {
  type: 'peaking' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass';
  frequency: number;
  gain: number;       // dB
  Q: number;
}

export interface HeadphoneProfile {
  id: string;
  modelName: string;
  brand: string;
  targetCurve: string;
  preampGainDb: number;
  bands: {
    freq: number;
    gain: number;
    q: number;
    type: 'peaking' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass';
  }[];
}

export interface TrackItem {
  uri: string;          // 'file://...' / 'http://...' / 'content://...'
  title: string;
  artist: string;
  album: string;
  duration?: number;    // seconds
  artUrl?: string;      // album art URL
  folderName?: string;  // for hierarchical folder display
}

export interface UpnpDevice {
  id: string;
  name: string;
  baseUrl: string;
  type: string;
}

export interface UpnpItem {
  id: string;
  title: string;
  parentId: string;
  isContainer: boolean;
  artist?: string;
  album?: string;
  artUrl?: string;
  duration?: number;
  resourceUrl?: string;
}
```

---

## 5. DSP パイプライン (CamillaDSP 準拠)

### 5.1 信号フロー

```
Input (PCM)
   ↓
[Preamp]
   ↓
[Source EQ]           ← ソースジャンル別 EQ (JAZZ/CLASSICAL/ELECTRONIC/VOCAL)
   ↓
[Hum Filter]          ← 50Hz/60Hz ノッチ (電源ハム除去)
   ↓
[Headphone Calibration]  ← ターゲット - 所有ヘッドホン差分
   ↓
[Crossfeed]          ← ヘッドフォン定位補正 (Meier 式)
   ↓
[Output EQ]          ← 出力デバイス補正 (STUDIO/JBL/PLANAR/LOUD/TUBE/CRYSTAL)
   ↓
[Tube Warmth]        ← tanh 倍音生成
   ↓
[Ambience]           ← ConvolverNode + IR (HALL/JAZZ CLUB/LARGE HALL/CHURCH)
   ↓
[Limiter]            ← DynamicsCompressor (Brickwall)
   ↓
Output (PCM)
```

### 5.2 DSP プリセット (`src/dsp/presets.ts`)

| カテゴリ | プリセット | 用途 |
|---|---|---|
| **Source EQ** | NONE / JAZZ / CLASSICAL / ELECTRONIC / VOCAL | ソースジャンル別 |
| **Output EQ** | NONE / STUDIO / JBL / PLANAR / LOUD / TUBE / CRYSTAL | 出力デバイス別 |
| **Hum Filter** | NONE / 50HZ / 60HZ | 電源ハム |
| **Crossfeed** | NONE / LIGHT / NORMAL | ヘッドフォン定位 |
| **Ambience** | NONE / HALL / JAZZ CLUB / LARGE HALL / CHURCH | IR リバーブ |

### 5.3 Phone Calibration の差分計算 (App.tsx)

```
補正カーブ = ターゲットカーブ - 所有ヘッドホンカーブ

各所有バンドについて:
  - 同じ周波数 (5% トレランス) のターゲットバンドのゲインを探索
  - 補正ゲイン = ターゲットゲイン - 所有ゲイン
  - ターゲットが同じ id の場合 → 補正なし (空 bands)
```

詳細は [PHONE_CALIBRATION_SPEC_20260901.md](PHONE_CALIBRATION_SPEC_20260901.md) 参照。

---

## 6. UI 構成

### 6.1 画面遷移

```
                    ┌─────────────┐
                    │  App.tsx    │
                    │ (MainView)  │
                    └──────┬──────┘
                           │
        ┌─────────┬────────┼────────┬──────────┐
        ▼         ▼        ▼        ▼          ▼
   ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐
   │Local   ││UPnP    ││Preset  ││Head    ││Que     │
   │Browser ││Browser ││Modals  ││phone   ││Drawer  │
   │Modal   ││Modal   ││Save/   ││Calib   ││        │
   │        ││        ││Load    ││Drawer  ││        │
   └────────┘└────────┘└────────┘└───┬────┘└────────┘
                                     ▼
                              ┌────────────┐
                              │Custom      │
                              │Headphone   │
                              │Editor      │
                              │(target mode│
                              │/text/manual│
                              └────────────┘
```

### 6.2 メインダッシュボード (AudioChassis)

```
┌──────────────────────────────────────────────────────────┐
│  [Wood Frame]                                            │
│  ┌────────────────────────┐ ┌──────────────────────────┐ │
│  │  Album Art / Total EQ  │ │  Preset / REP / 履歴     │ │
│  │  (AlbumArtFrame)       │ │  (PlayerControls)        │ │
│  │                        │ │                          │ │
│  │                        │ │  ◀  ▶  ⏸  ⏹  ⏮  ⏭     │ │
│  │                        │ │                          │ │
│  └────────────────────────┘ └──────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Mixer Panel (MetalPanel)                            ││
│  │  Source EQ | Hum Filter | Headphone Calib | Out EQ  ││
│  │  Crossfeed | Tube | Ambience | [A/B Direct] [SET]  ││
│  │  ┌──────────┐                                         ││
│  │  │Dial      │  VU Meter L/R                          ││
│  │  │Volume    │  (VuMeter)                             ││
│  │  └──────────┘                                         ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### 6.3 状態管理 (App.tsx 中心)

| State | 永続化先 | デフォルト |
|---|---|---|
| `playlist` (キュー) | `biscene_queue_state_v1` | 空 |
| `currentIndex` | `biscene_queue_state_v1` | 0 |
| `dspPresets` | `biscene_dsp_presets_v2` | `DEFAULT_PRESETS` (5 件) |
| `selectedHeadphoneProfile` | `biscene_headphone_profile_v1` | `HEADPHONE_PROFILES[1]` |
| `targetCurveId` | `biscene_target_curve_id` | `harman_reference` |
| `calibrationIntensity` | (なし) | 0.5 |
| `repPinTrackId` | `biscene_rep_pin_track_id` | null |
| `dspBypassed` / `tubeWarmthEnabled` | (なし) | false |
| `outputEqIndex` / `sourceEqIndex` / `humFilterIndex` | (なし) | 1 / 1 / 0 |
| `ambienceIndex` / `ambienceIntensity` | (なし) | 0 / 50 |
| `crossfeedIndex` / `crossfeedIntensity` | (なし) | 0 / 50 |
| `volume` | (なし) | 12 (max 15) |

---

## 7. 再生ソース

### 7.1 ローカルファイル
- **対応形式**: FLAC, WAV, DSD (DSF), MP3, AAC, OGG, M4A
- **検出**: Storage Access Framework (SAF) / Capacitor Filesystem
- **メタデータ**: タグ抽出 (`TagParser.java`)、アルバムアート抽出 (`localArt.ts`)

### 7.2 DLNA / UPnP
- **検出**: SSDP multicast (`UpnpSsdpBridge.java`)
- **ブラウズ**: `UpnpBrowserModal.tsx` で BROWSE_ALL 高速パス + ページングフォールバック
- **再生**: メディアサーバの HTTP 配信を CapacitorHttp 経由で PCM プロキシ (PCM Server on port 9600)
- **アートワーク**: Base64 データ URI で PCM 接続と並列取得 (origin 接続スロット競合回避)

### 7.3 デモトラック
- `src/data/demoTracks.ts` — ライセンスフリーのサンプル音源

---

## 8. バックグラウンド再生 (Android)

### 8.1 PlaybackService
- **Service Type**: `mediaPlayback` (Foreground Service)
- **目的**: 画面 OFF / スリープ時の再生継続
- **通知**: MediaSession 統合
- **パーミッション**:
  - `FOREGROUND_SERVICE`
  - `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
  - `POST_NOTIFICATIONS`
  - `WAKE_LOCK`

### 8.2 Capacitor プラグイン (DlnaPlayback)
- `pickLocalFolder()`: ローカルフォルダ選択 (SAF)
- `pickLocalFiles()`: ローカルファイル選択
- Java ↔ JS ブリッジ: `addJavascriptInterface` で `AndroidUpnp` 公開

---

## 9. ネットワーク要件

### 9.1 Android パーミッション
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />
<uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.VIBRATE" />
```

### 9.2 Network Security Config
- 192.168.x.x, 10.x.x.x, 127.0.0.1, localhost: 平文 HTTP 許可
- `usesCleartextTraffic="true"`

### 9.3 WebView 設定
```java
webView.getSettings().setMixedContentMode(MIXED_CONTENT_ALWAYS_ALLOW);
webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
```

---

## 10. Phone Calibration 機能

`HeadphoneCalibrationDrawer.tsx` + `CustomHeadphoneEditor.tsx` で構成。

詳細は [PHONE_CALIBRATION_SPEC_20260901.md](PHONE_CALIBRATION_SPEC_20260901.md) および [PHONE_CALIBRATION_MANUAL.md](PHONE_CALIBRATION_MANUAL.md) 参照。

### 10.1 主要機能
- **所有ヘッドホンカーブ表示** (常時)
- **ターゲットカーブ表示** (タップで切替)
- **Calibration Strength** 0–100% (10 ステップスライダー)
- **DSP と UI の完全分離** (React Hooks 順序保証)
- **9 件プリセット + 44 件静的カタログ + カスタムプロファイル**
- **A/B Direct** (DSP バイパス), **Tube Warmth** (真空管サチュレーション)

### 10.2 データ永続化キー
- `biscene_target_curve_id`: ターゲットカーブ id
- `biscene_headphone_profile_v1`: 所有ヘッドホン id
- `biscene_hidden_presets`: 非表示プリセット id 配列
- `biscene_custom_headphone_profiles`: カスタムプロファイル JSON 配列

---

## 11. プリセット履歴スワイプ (Phase 2-⑦)

`AudioChassis` のプロパティ:
- `presetHistoryLength`, `historyIndex`, `canNavigatePrev`, `canNavigateNext`
- `onSwipePreset(direction: 'prev' | 'next')`

スワイプで前後のプリセット履歴をナビゲート。現在のインデックスと履歴長から prev/next の有効/無効を決定。

### 11.1 差別化ポイント
一般的な DSP アプリ (Poweramp, Neutron, UAPP) では、プリセット切り替えは **タップでドロップダウン選択** が主流。BiScene は:
- **スワイプジェスチャ** で連続切替 (5 件以上のプリセットを高速ブラウズ)
- プレビュー再生 (切替時に一時的に DSP を切替 → 戻す動作で聴き比べ)
- 履歴を **LRU スタック** で管理 (最近使った順に最大 N 件)

### 11.2 UI 制御
- `AudioChassis` の `Preset` エリアで横スワイプ
- スワイプ中: 現在のプリセット名が左/右にフェード
- 端に達すると prev/next ボタンを無効化 (`canNavigatePrev = false` 等)
- ハプティックフィードバック (`triggerHaptic('tick')`) で切り替えを触感確認

## 11.3 プリセット保存データ構造

```ts
interface DspPreset {
  name: string;                  // プリセット名
  outputEqIdx: number;           // Output EQ index (0=NONE, 1=STUDIO, 2=JBL, 3=PLANAR, 4=LOUD, 5=TUBE, 6=CRYSTAL)
  sourceEqIdx: number;           // Source EQ index (0=NONE, 1=JAZZ, 2=CLASSICAL, 3=ELECTRONIC, 4=VOCAL)
  humFilterIdx: number;          // Hum Filter (0=NONE, 1=50HZ, 2=60HZ)
  ambienceIdx: number;           // Ambience (0=NONE, 1=HALL, 2=JAZZ_CLUB, 3=LARGE_HALL, 4=CHURCH)
  ambienceIntensity: number;     // 0-100
  crossfeedIdx: number;          // Crossfeed (0=NONE, 1=LIGHT, 2=NORMAL)
  crossfeedIntensity: number;    // 0-100
  headphoneProfileId: string;    // Phone Calibration の所有ヘッドホン
  tubeWarmth: boolean;           // Tube Warmth on/off
}
```

永続化: `localStorage` の `biscene_dsp_presets_v2` キー (JSON 配列)。

デフォルトで 5 件 (Audiophile Studio Pure, Concert Hall Immersion, Club Bass & Tube Warmth, Vocal Clarity, Flat Reference)。

---

## 12. UI テーマ / デザインモチーフ

### 12.1 カラーパレット
- **背景**: `bg-neutral-900` (ダーク)
- **メタル**: `from-[#f2f2f2] via-[#d5d5d5] to-[#a8a8a8]` (ブラッシュドメタル)
- **木目**: `wood-grain` (茶系グラデーション)
- **アクセント**: `cyan-400` (DSP / ヘッドホン), `amber-400` (ターゲット), `orange-400` (Tube)

### 12.2 タイポグラフィ
- **ディスプレイ**: `Chakra Petch` (Google Fonts)
- **モノスペース**: `JetBrains Mono` (`font-mono-tech`)
- **本文**: `Plus Jakarta Sans`

### 12.3 触覚フィードバック
- `triggerHaptic('click' | 'tick')` — 主要なタップで実行

---

## 13. ビルド & デプロイ

### 13.1 開発
```bash
npm install
npm run dev        # Vite dev server
```

### 13.2 Web ビルド
```bash
npm run build      # tsc -b && vite build → dist/
```

### 13.3 Android ビルド
```bash
# 1. Web ビルド
npm run build
# 2. Capacitor 同期
npx cap sync android
# 3. Gradle APK ビルド
./gradlew :app:assembleDebug
# 出力: android/app/build/outputs/apk/debug/app-debug.apk
```

### 13.4 環境変数 (`variables.gradle`)
- `minSdkVersion`, `targetSdkVersion`, `compileSdkVersion`
- `applicationId`: `com.bisen.biscene`
- `versionCode`, `versionName`

---

## 14. テスト & 検証

### 14.1 自動テスト
- 単元テスト: Vitest (設定なし、現状は手動テスト)
- E2E: 未設定

### 14.2 手動検証チェックリスト
- [ ] ローカル FLAC 再生 (16bit / 24bit)
- [ ] DSD (DSF) 再生
- [ ] DLNA サーバ検出 & 再生
- [ ] アートワーク表示
- [ ] Phone Calibration: 所有ヘッドホン ⇄ ターゲット切替
- [ ] Calibration Strength スライダー
- [ ] A/B Direct バイパス
- [ ] Tube Saturation ON/OFF
- [ ] Ambience (IR) 切替 & Intensity
- [ ] Crossfeed Intensity
- [ ] Source EQ 切替 (JAZZ / CLASSICAL / ELECTRONIC / VOCAL)
- [ ] Output EQ 切替 (STUDIO / JBL / PLANAR / LOUD / TUBE / CRYSTAL)
- [ ] Hum Filter (50Hz / 60Hz)
- [ ] プリセット保存 / 呼出 / 削除
- [ ] 履歴スワイプ
- [ ] バックグラウンド再生 (画面 OFF)

---

## 15. 制限事項・既知の問題

| 項目 | 内容 |
|---|---|
| iOS | Web ビルドは対応するが、CAPACITOR IOS ターゲットは未確認 |
| Web AutoEQ fetch | Capacitor Http プラグイン AGP 8 非対応 / レート制限 / truncation で動的取得不可 → ローカルカタログで対応 |
| DSD ゲート | 一部環境で DSD ネイティブ再生不可 (PCM 変換フォールバック) |
| マルチチャンネル | ステレオのみ対応 (5.1ch 未対応) |
| ネットワーク | IPv6 UPnP 検出は限定的 (IPv4 のみ) |

---

## 16. 再生エンジン (Playback Engine) 詳細仕様

> 出典: [PLAYBACK_SYSTEM_SPEC_JP.html](PLAYBACK_SYSTEM_SPEC_JP.html) / [PLAYBACK_SYSTEM_SPEC_EN.html](PLAYBACK_SYSTEM_SPEC_EN.html) (2026-09-01 版)
> ※ `PLAYBACK_SYSTEM_SPEC_*_v1.html` (8/30 版) は旧版

### 16.1 アーキテクチャ全景

```
┌─────────────────────────────────────────────────────────────────┐
│  Web Layer (React/TypeScript)                                    │
│  ├─ PlayerControls, AudioEngine.ts, LocalBrowserModal...        │
│  └─ Capacitor Bridge (DlnaPlayback Plugin)                      │
├─────────────────────────────────────────────────────────────────┤
│  Native Layer (Kotlin/Java)                                      │
│  ├─ DlnaPlaybackPlugin (Capacitor Plugin)                       │
│  │   ├─ LocalPcmServer (HTTP/127.0.0.1:9600)                    │
│  │   └─ DecodingThread (per-session)                            │
│  │       ├─ MediaCodec Path (FLAC/WAV/MP3/AAC/ALAC...)          │
│  │       └─ DsfDecoder Path (DSD/DSF)                           │
│  ├─ DSP Pipeline (96kHz Float32 Fixed-Rate)                     │
│  │   ├─ RateConverter (Catmull-Rom, stereo interleaved)         │
│  │   └─ NativeDspChain (Biquad EQ, Crossfeed, Freeverb, Tube)  │
│  ├─ AudioTrack (96kHz/Float32/Stereo, MODE_STREAM)              │
│  └─ PlaybackService (Foreground Service)                        │
│       ├─ PARTIAL_WAKE_LOCK (CPU alive)                          │
│       └─ WIFI_MODE_FULL_HIGH_PERF (Network alive)               │
└─────────────────────────────────────────────────────────────────┘
```

### 16.2 核心差別化機能 (6 つ)

#### 16.2.1 ビットパーフェクト・ハイレゾ再生 (全形式)

| 形式 | デコーダ出力 | 内部処理 | 出力 | ビットパーフェクト |
|---|---|---|---|---|
| FLAC/WAV 16bit | PCM_16BIT | → Float32 正規化 | 96kHz Float32 | ✅ OK |
| FLAC/WAV 24bit | PCM_32BIT (Right-aligned) | **アライメント自動検出→正規化** | 96kHz Float32 | ✅ OK (業界初相当) |
| FLAC/WAV 32bit | PCM_32BIT / Float32 | 直通 | 96kHz Float32 | ✅ OK |
| DSF (DSD64/128) | DSD→PCM (Boxcar decimation) | 96kHz リサンプル | 96kHz Float32 | ~ DSD→PCM 変換段階で不可避 |
| MP3/AAC/OPUS... | PCM_16BIT | → Float32 正規化 | 96kHz Float32 | ✅ OK (ロスレス相当) |

**技術的ポイント**:
- `convertToFloat32Array()` における **実データからの 24bit アライメント自動検出** (符号拡張ヒューリスティック)
- `srcBits` ヒント非依存、Right-aligned / Left-aligned 両対応
- Float sanity gate による **ベンダーデコーダの Float 出力バグ自動検知・フォールバック**

#### 16.2.2 96kHz Float32 固定レート DSP パイプライン

全入力形式 (44.1kHz / 48kHz / 88.2kHz / 96kHz / 176.4kHz / 192kHz / DSD) を **96kHz Float32 ステレオ固定** に統一:

```
任意のサンプルレート
    ↓
RateConverter (Catmull-Rom 補間)
    ↓
96kHz / Float32 / Stereo (interleaved)
    ↓
NativeDspChain:
  ├─ Biquad EQ (10 バンド Parametric)
  ├─ Crossfeed (Meier 式)
  ├─ Freeverb (Schroeder/Moorer)
  └─ Tube Warmth (tanh 倍音)
    ↓
AudioTrack (MODE_STREAM, 96kHz/Float32)
    ↓
Android AudioFlinger → 出力
```

**CamillaDSP 哲学の体現**:
- 一度 96kHz に統一することで、サンプリングレート起因の音色変化を排除
- 内部 Float32 で量子化ノイズの蓄積を防止
- 全ステージが同じサンプルレートで動作するため、レート変換に起因する位相歪みが発生しない

#### 16.2.3 セッション分離・ギャップレス遷移

- 各再生セッションは **独立した `DecodingThread`** を持つ
- セッション間で **PCM Server (port 9600) の origin 接続スロットを競合させない**
  - 旧曲の thread は曲を再生し終えるまで接続を保持
  - 新曲は新 thread で新接続を開く
- アルバムアート等のメタデータは **Base64 データ URI** で PCM 接続と並列取得 (origin 接続の競合回避)
- 結果: **ギャップレス再生 + DLNA 切断なし**

#### 16.2.4 バックグラウンド/スリープ/Doze 完全耐性

`PlaybackService` (Foreground Service, type=`mediaPlayback`):

- **PARTIAL_WAKE_LOCK**: CPU を起こし続ける (DSP パイプライン稼働継続)
- **WIFI_MODE_FULL_HIGH_PERF**: Wi-Fi を高パフォーマンスモードに固定 (DLNA ストリーム途切れ防止)
- **Foreground Service**: システムによる kill を防ぐ
- **MediaSession**: 通知 + ロック画面コントロール統合

これにより:
- 画面 OFF でも再生継続
- 長時間スリープ復帰時もシームレス
- Doze モード中も低遅延で復帰

#### 16.2.5 DSF (DSD) ネイティブストリーミングデコード

`DsfDecoder.java` (Java) で **DSD bitstream を直接デコード**:

- DSD64 (2.8224 MHz) / DSD128 (5.6448 MHz) 対応
- Boxcar decimation で **DSD → PCM (Float32) 96kHz** に変換
- 1-bit ストリームのまま Java 内で処理 (MediaCodec 非使用)
- DSD → PCM 変換の不可避な量子化以外は元の音色を維持

#### 16.2.6 SAF (Storage Access Framework) ネイティブファイル再生

`DlnaPlaybackPlugin` の `pickLocalFolder()` / `pickLocalFiles()`:

- Android の **Storage Access Framework** 経由でファイル URI を取得
- Java 側で `ContentResolver` を使い **直接 MediaCodec / DsfDecoder** に渡す
- Web Audio API には **PCM ストリームとして** 供給 (URL は `http://127.0.0.1:9600/...`)
- これにより **WebView の decode 能力に依存せず**、Android システムデコーダの最大性能を活用

### 16.3 技術スペック

| 項目 | 値 |
|---|---|
| 内部サンプリングレート | 96 kHz (固定) |
| 内部ビット深度 | Float32 |
| 内部チャンネル | Stereo (2ch) |
| インターリーブ | あり (LRLRLR...) |
| AudioTrack モード | MODE_STREAM |
| AudioTrack 性能 | 96 kHz / Float32 / Stereo |
| レート変換 | Catmull-Rom 補間 (4-point) |
| DSP EQ | 10 バンド Parametric Biquad |
| クロスフィード | Meier 式 |
| リバーブ | Freeverb (Schroeder/Moorer-style) |
| 真空管 | tanh 倍音生成 |
| 出力 | Android AudioFlinger → スピーカー / ヘッドホン |

### 16.4 競合優位性

| 項目 | BiScene | 一般的な Android プレーヤー |
|---|---|---|
| 24bit 自動アライメント | ✅ 業界初相当 | ❌ 固定 (16bit にフォールバック多い) |
| 統一 96kHz 内部レート | ✅ CamillaDSP 哲学 | ❌ リサンプル多用で位相歪み |
| DSP とバックグラウンドの独立性 | ✅ DSP は TypeScript で継続 | ❌ アプリ kill で DSP 停止 |
| DLNA + ローカルのギャップレス | ✅ スレッド分離 | ❌ 接続切り替えで途切れ |
| DSD (DSF) ネイティブ | ✅ Java で直接デコード | ❌ DSD 対応アプリ少数 |
| CamillaDSP 設計哲学 | ✅ 介入最小化 | ❌ 過剰な DRC |

### 16.5 既知の制限

| 項目 | 内容 |
|---|---|
| DSD ネイティブパススルー | DSD → PCM 変換のため、完全な bit-perfect DSD ではない (DSD-Over-PCM のみ) |
| マルチチャンネル | ステレオのみ (5.1ch / 7.1ch 未対応) |
| ギャップレス (ロスレス形式) | FLAC / WAV は完全ギャップレス、MP3 / AAC は encoder 依存 |

### 16.6 ビルド要件

| 項目 | 要件 |
|---|---|
| Android | 10 以上 (API 29) |
| WebView | Chrome 117 以降 (Capacitor 8 互換) |
| メモリ | 推奨 4GB 以上 (96kHz Float32 DSP 安定動作) |
| ストレージ | アプリ 50MB + IR 6MB (約 60MB) |
| ネットワーク | DLNA 利用時 Wi-Fi (UPnP SSDP multicast 必要) |

### 16.7 ライセンス

- 内部 DSP エンジン: BiScene Audio (proprietary)
- Freeverb: Public Domain (Jezar Wakefield)
- AutoEQ: MIT (jaakkopasanen)
- 第三者ライブラリ: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) 参照

---

## 17. 関連ドキュメント

| ファイル | 役割 |
|---|---|
| [README.md](README.md) | 製品概要・ビルド手順 |
| [PHONE_CALIBRATION_MANUAL.md](PHONE_CALIBRATION_MANUAL.md) | Phone Calibration 操作マニュアル (旧) |
| [PHONE_CALIBRATION_SPEC_20260901.md](PHONE_CALIBRATION_SPEC_20260901.md) | Phone Calibration 機能仕様 (Phase 2-⑥ 時点) |
| [walkthrough_20260901.md](walkthrough_20260901.md) | 2026-09-01 の変更履歴 Walkthrough |
| [.agent/20260901_phase2.md](.agent/20260901_phase2.md) | Phase 2-⑥ セッションノート |
| [NETWORK_AUDIO_IMPLEMENTATION_TICKET.md](NETWORK_AUDIO_IMPLEMENTATION_TICKET.md) | DLNA / ネットワーク音声実装チケット |
| [docs/manual_ja.md](docs/manual_ja.md) / [manual_en.md](docs/manual_en.md) | ユーザーマニュアル |
| [PLAYBACK_SYSTEM_SPEC_JP.html](PLAYBACK_SYSTEM_SPEC_JP.html) / [PLAYBACK_SYSTEM_SPEC_EN.html](PLAYBACK_SYSTEM_SPEC_EN.html) | 再生エンジン仕様書 (最新版, 2026-09-01) |
| [PLAYBACK_SYSTEM_SPEC_JP_v1.html](PLAYBACK_SYSTEM_SPEC_JP_v1.html) / [PLAYBACK_SYSTEM_SPEC_EN_v1.html](PLAYBACK_SYSTEM_SPEC_EN_v1.html) | 再生エンジン仕様書 v1 (8/30, 旧版) |
| [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) | 第三者ライセンス |
