# ポータブル環境適応機能 実装設計アセスメント（V6.2 計画）

**作成日**: 2026-10-10
**ベースライン**: `feature/gapless-phase-v5` @ `ac50578`（V6.1 検証済み・Push 済み）
**前提**: V6.1 の 96kHz/32-bit Float NDK パイプライン、Bit-Perfect Direct 出力、ギャップレス機構（SinkCarrier / SeamAudit / Fade-hold / 2秒バッファフロア）を**一切損なわない**ことを最優先とする。

---

## 0. エグゼクティブサマリー

実コード調査の結果、V6.1 には既に本アセスメントの全機能を受け入れる**安全機構の雛形が揃っている**：

| 既存の安全機構 | 本計画での転用先 |
|---|---|
| `PhaseInverter` の ~1ms ゲインランプ（atomic 検知 → 音声スレッド内ランプ） | ソフトスタート・アンチポップ、コンプレッサー切替、ラウドネスゲインの滑らかな乗り換え |
| `DspInstance::setAmbience()` の **irId atomic ファストパス + ロック外ビルド + O(1) swap 発行** | サーマル時の FIR タップ縮小（新規ネイティブ経路を追加せず既存 swap 機構を再利用） |
| `SinkCarrier` / `PrewarmCache` / `LookaheadScheduler` の **実行時キルスイッチ（`setEnabled(false)` で旧動作へ即復帰）** | 全新機能に共通のロールバック保証 |
| `usbDirty` / `usbDisableRequested` の **volatile フラグ + 再生スレッド消費**パターン | ネットワーク状態・サーマル状態の非同期通知の受け渡し |
| `Math.max(min*4, 1572864)`（2.0秒バッファフロア、park 最悪実測 1,277ms をカバー） | アンダーラン排除は**既に達成済み**。機能2はプリロールウィンドウのスケーリングに集中できる |

**結論**: 3 機能すべて「新規ネイティブ経路を最小限に」「重い処理を音声スレッドの外に」「全機能にキルスイッチ」という V5 計画の不変原則（R1〜R5）を維持したまま追加可能。最大の新規実装は**夜間モード用コンプレッサー**（C++ 約 120 行）のみで、残りは既存機構の呼び出し側の組立である。

---

## 1. 修正・影響を受ける既存クラス/C++ファイルの一覧

### 機能1: Auto-DAC プロファイル＆プロテクトシステム

| 区分 | ファイル | 変更内容 |
|---|---|---|
| **新規** | `usb/DacProfileStore.java` | VID/PID キーの DAC プロファイル永続化（SharedPreferences、純 JVM テスト可能） |
| 改修 | `usb/UsbAudioDetector.java` | 添付コールバックに VID/PID を付加（`currentDevice` から取得）。**接続時のポップ対策は本クラスには入れない**（FD オープン直後に消費者へ委譲する現行契約を維持） |
| 改修 | `v2/pipeline/BiscenePlayerV2.java` | ① `initUsb()` / `reconfigureUsb()` が `DacProfileStore` を参照してキャッシュ済み深度で `configure()` を即実行。② `writeUsbChunk()` 冒頭に**カウンタ式ソフトスタート・ランプ**（ロックフリー） |
| 改修なし | `usb/UsbPcmPacker.java` | 純関数のため無変更（32→24 フォールバックは既に上流 `reconfigureUsb` の `getBitDepth()` 再クエリで実装済み） |
| 改修なし | `cpp/usb/UsbDirectEngine.cpp` | 無変更（`configure(rate, bits, 2)` 契約は不変） |

**ソフトスタートの挿入ポイント（特定済み）**: `onUsbAudioPermissionGranted(device, fd)` → `initUsb()` 成功後の**最初の N ブロックの `writeUsbChunk()`**。`AtomicInteger usbRampCounter` を再生スレッドのみが増分し、ゲイン `= min(1.0, counter × step)` を各ブロックへ乗算。再構成（`reconfigureUsb`）でリセット。AudioTrack パスには適用しない（ポップは USB ドライバ再バインド固有の現象）。

### 機能2: ネットワーク耐性可変プリロール・バッファリング

| 区分 | ファイル | 変更内容 |
|---|---|---|
| **新規** | `gapless/NetworkStateMonitor.java` | `ConnectivityManager.NetworkCallback`（Wi-Fi/セルラー/検証済み判定）を監視し、ポリシー値（ウィンドウ延長要否）を消費者へ通知。スレッドは `BisceneExecutors` の既存プールを使用 |
| 改修 | `gapless/LookaheadScheduler.java` | `windowMs` を `volatile` 化し `setWindowMs(long)` を追加（下限 3000ms・上限 15000ms にクランプ）。**デフォルト 5000ms は不変**（既存テストの契約を維持） |
| 改修 | `DlnaPlaybackPlugin.java` | `NetworkStateMonitor` の起動と `scheduler.setWindowMs()` への配線 |
| 改修なし | `gapless/PrewarmCache.java` | 容量 32 は LRU で十分（1 アルバム > 32 曲は稀）。スケーリングは見送り、ウィンドウ延長のみで対応 |
| 改修なし | `v2/pipeline/BiscenePlayerV2.java`（ギャップレス経路） | **park/adopt/SeamAudit 経路は無変更**。2 秒フロアが park 最悪実測 1,277ms を既にカバー（headroom 約 770ms） |

**アンダーラン排除の影響分析（要求事項 2-2）**: 実測では `capacity=196608f (2041ms)` / `parked=552〜1277ms` で headroom 約 770ms〜1.5 秒確保済み。NAS/UPnP 応答遅延による 5〜6 秒の無音は**アンダーランではなく次曲ストリームの立ち上げ遅延**（HTTP 接続 + DSD ヘッダ解析 + 初回デコード）が主因。ウィンドウ延長はメタデータ取得を早めるが、ストリーム自体のプリオープンはしない。**完全な無音排除には「ストリーム事前オープン」が必要**だが、接続リークとライフサイクル競合のリスクが高いため本計画ではオプション（Phase P2-Option、キルスイッチ付き）に格下げし、まずはウィンドウ延長で効果を測定する。

### 機能3: 動的サーマル＆バッテリー連動スマートFIR/DSPスケーラー

| 区分 | ファイル | 変更内容 |
|---|---|---|
| **新規** | `PowerStateMonitor.java` | ① `PowerManager.OnThermalStatusChangedListener`（API 29+、ガード付き）② `ACTION_POWER_SAVE_MODE_CHANGED` 受信。**ポリシー計算のみ**を行い、Native へは既存の `pendingDspLock` / `pendingDspJson` 経路で間接通知（音声スレッドは触れない） |
| 改修 | `cpp/NativeAudioEngine.cpp`（`DspInstance`） | **新規切替経路は作らない。** サーマル縮退時は既存 `setAmbience()` スローパスを「同一 IR のタップ数縮小版（1024→512）」で再発行する。swap-publish 機構（ロック外ビルド + O(1) swap）がそのまま安全切替を提供 |
| 改修 | `NativeDspChain.java` | `update()` への再呼び出しで足りるため JNI 追加は**原則不要**（縮小 IR の構築は Java 側 `irProvider` または既存 `AmbienceCfg` の拡張で実装） |
| 改修 | `DlnaPlaybackPlugin.java` | `PowerStateMonitor` の起動と DSP ペイロード再送の配線 |

**サーマル切替の過渡応答（設計の核心）**: 既存 `setAmbience()` スローパスは IR 差し替え時に `histIdx=0` + 履歴ゼロへリセットする。リバーブ尾のリセットは**信号の不連続ではなく残響の消失**であり、既存の IR 変更（ユーザー操作）と同一の過渡特性。タップ縮小はリバーブ長が短くなるだけの知覚変化で、ポップ音の発生源にならない。**緊急時（Thermal SEVERE 以上）は `ambIntensity=0` への atomic 書き込みのみ**（ドライ即座、既存の `ambIntensity` atomic を利用、ランプ不要）。

### 機能4（本アセスメントの発端機能）: ナイトモード・LUFS・ラウドネスコンター

| 区分 | ファイル | 変更内容 |
|---|---|---|
| **新規** | `cpp/dsp/DynamicsCompressor.h/.cpp` | RMS フィードフォワード型ジェントルコンプレッサー（2:1、threshold −24dB、attack 20ms、release 300ms、リリースは既存 `RestorationEngine` の envelope 慣習に倣う指数平滑） |
| **新規** | `gapless/LoudnessAnalyzer.java` | ReplayGain 風のトラック別ゲイン算出（デコード済み PCM の先頭数秒を prewarm スレッドで分析）。K-weighting の簡易版（一次 HPF + 高シェルフ）で近似し、JVM テスト可能な純関数に分離 |
| 改修 | `cpp/NativeAudioEngine.cpp` | チェーンに `compressor → (loudness contour) → limiter` を挿入。パラメータは既存 atomic 慣習（`nightEnabled`、`contourGain`）で音声スレッドへ |
| 改修 | `NativeDspChain.java` | JNI `nativeSetNightMode(handle, boolean)` / `nativeSetLoudnessTarget(handle, gainDb)` 追加 |
| 改修 | `DspConfigParser.java` / `AudioEngine.ts` / `AudioChassis.tsx` / `MixerControls.tsx` | `night` / `loudness` フィールドの追加と UI トグル（既存 4 ボタン Mixer 行の拡張または設定ドロワー） |
| 改修 | `gapless/PrewarmCache.java` | `PrewarmedMeta` に算出済みゲインを追加（既存 LRU 構造を維持、エントリ拡張のみ） |

**ビット完全性の保証（最重要）**: ナイトモード/ラウドネス系は **DSP ON パス（AudioTrack / USB Mastering）にのみ挿入**。Bit-Perfect Direct パス（`usbBypass=true`）では Web ペイロード `bypass: true` が既に `crossfeed: null, ambience: null` を送っており、同様に `night: null` を送ることで**バイパス経路の bit 透過性は設計上保証される**（既存 `JavaPhaseInverter` と同一の分離原則）。

---

## 2. 技術的課題とノイズ/ドロップアウトの過渡現象対策

| # | リスク | 発生箇所 | 具象的対策 |
|---|---|---|---|
| 1 | **DAC 接続時のポップ音** | `initUsb()` 成功後の最初の USB ブロック | カウンタ式ソフトスタート（`AtomicInteger`、音声スレッド単独増分、ロックフリー）。ゲイン 0→1 を約 20〜50ms でランプ。**位相反転の `PhaseInverter` ランプと同一パターン**。AudioTrack パスには適用しない |
| 2 | **突発大音量**（前回音量のまま DAC が繋がる） | DAC プロファイル再適用時 | プロファイルには「接続時の音量上限（例: −20dB から開始）」を含め、`masterVol` atomic 経由で滑らかに復元。UI の音量ノブ操作で即ユーザー意図に追従 |
| 3 | **FIR タップ切替の過渡ノイズ** | サーマル縮退時の ambience 再発行 | **新規経路を作らず既存 `setAmbience()` スローパスを再利用**（ロック外ビルド + O(1) swap + 履歴リセット）。過渡はリバーブ尾の消失のみでポップにならない。SEVERE 以上は `ambIntensity=0`（atomic、即時ドライ） |
| 4 | **スレッド競合・ロック** | NetworkStateMonitor / PowerStateMonitor → DSP への通知 | **`usbDirty`/`pendingDspJson` と同一の volatile フラグ + 再生スレッド消費**パターン。モニター側は `BisceneExecutors` の既存プールで動作し、音声スレッドへは絶対に直接触れない。新規 mutex/ロックは Native に 1 つも追加しない |
| 5 | **GC pause** | LoudnessAnalyzer の PCM 分析 | 分析は **prewarm スレッド（IO プール）で実行**し、音声スレッドの割り当てはゼロのまま（既存 R4 不変）。分析バッファは事前確保・再利用 |
| 6 | **コンプレッサー切替時のポップ** | ナイトモード ON/OFF トグル | 既存 `PhaseInverter` パターン: atomic フラグを音声スレッドが検知し **~10ms のゲインランプ**で圧縮量 0↔設定値を乗り換え。しきい値以下は完全 bit 透過（`tanh` ニー 0.98 の既存 soft-clip と同一の C1 連続設計） |
| 7 | **LUFS ゲイン適用時の音量ジャンプ** | 曲替わり時のトラック別ゲイン | ゲインは **既存 `recomputeMakeup()` と同一の「更新時計算・音声スレッドは読み取りのみ」**方式。適用は既存 `masterVol` atomic への合成で、段差はフェードホールド後の曲頭ランプ（既存 soften パス）で吸収 |
| 8 | **Lookahead ウィンドウ変更の競合** | `setWindowMs()` | `volatile long` の単一書き込み。読み手（progress スレッド）は 1 回の読み取りで完結するため torn read は JVM の long volatile で保証。既存 `shouldProbe()` の境界条件（durMs≤0 等の無害化）を維持 |
| 9 | **ウィンドウ延長に伴うメタデータ再取得の暴走** | NetworkStateMonitor の頻発コールバック | 既存 `LookaheadScheduler` の `DEFAULT_MIN_INTERVAL_MS=1000` レート制限と `markResolved()` 停止条件をそのまま利用。リンク特性変更時のみ通知（`onLinkPropertiesChanged` は `DualSsdpBridge` で実績のあるパターン） |
| 10 | **ネットワーク悪化時のバッファ再構成リスク** | セルラー時のバッファ拡大 | **AudioTrack のリサイズは行わない**（再生成は park 間のみ許容される現行契約を維持）。2 秒フロアで十分という実測（park 最悪 1,277ms）を根拠に、バッファ側の動的変更は見送り |

---

## 3. 段階的実装ステップ（Task Breakdown）

**原則**: 各フェーズ = 独立 1 コミット、単体テスト & `:app:assembleDebug` グリーンを確認して進行、任意の時点で `setEnabled(false)` / UI OFF で旧動作へ復帰（R5 準拠）。

### Phase N1: ナイトモード（最優先・最小リスク）
| タスク | 内容 | 完了基準 |
|---|---|---|
| N1-1 | `DynamicsCompressor.h/.cpp` 実装 + JNI `nativeSetNightMode` + `NativeDspChain` 配線（キルスイッチ: `nightEnabled=false` で完全バイパス） | ユニットテスト（しきい値以下透過、2:1 増幅曲線、attack/release 応答）+ ビルド成功 |
| N1-2 | UI トグル（Mixer 行拡張）+ `DspConfigParser` の `night` フィールド + Web ペイロード（bypass 時は `night: null`） | 実機で ON/OFF 切替時にポップなし（~10ms ランプ確認） |
| N1-3 | **ラウドネスコンター**: `masterVol` atomic を読む低音/高音シェルフ補正（同じ C++ ステージ内、`contourGain` atomic） | 音量を下げた際の低域補正を固定 1 ダイヤルで確認（表示場所を増やさない） |

### Phase N2: LUFS / ラウドネス正規化
| タスク | 内容 | 完了基準 |
|---|---|---|
| N2-1 | `LoudnessAnalyzer.java`（純 JVM、K-weighting 近似）+ テスト（同一入力→同一ゲイン、無音→0dB、クリップ→負ゲイン） | テストグリーン |
| N2-2 | `PrewarmedMeta` 拡張 + `MediaCodecDecoder.collectMetadataAtBoundary` 経由での分析統合（prewarm スレッド実行） | 既存 prewarm テスト全維持 |
| N2-3 | ゲイン適用（`masterVol` 合成、更新時計算方式）+ キルスイッチ | 実機で音量バラつきの軽減を確認、Bit-Perfect パスが無影響であることをログで確認 |

### Phase P1: Auto-DAC プロファイル＆プロテクト
| タスク | 内容 | 実施結果 |
|---|---|---|
| P1-1 | `DacProfileStore.java`（VID:PID キー、深度/レート/名前/音量上限）+ テスト | テストグリーン |
| P1-2 | `UsbAudioDetector` のコールバックへ VID/PID 付加、`initUsb`/`reconfigureUsb` がプロファイル参照 | 再接続時に `getBitDepth()` クエリ前の configure が 1 回で成功 |
| P1-3 | ソフトスタート・ランプ（`AtomicInteger` カウンタ、`writeUsbChunk` 冒頭、再構成でリセット） | 実機 DAC 接続/再構成時にポップなし |

### Phase P2: ネットワーク耐性可変プリロール
| タスク | 内容 | 実施結果 |
|---|---|---|
| P2-1 | `LookaheadScheduler.setWindowMs()`（volatile、3〜15 秒クランプ、デフォルト 5000 不変）+ テスト | 既存 9 テスト全維持 + 新規 4 テスト |
| P2-2 | `NetworkStateMonitor.java` + プラグイン配線（セルラー/検証済み劣化時のみ延長） | 実機で機内モード→Wi-Fi 復帰時のウィンドウ変化をログ確認 |
| P2-3 | （オプション・キルスイッチ付き）ストリーム事前オープンの検討 | 実測して 5-6 秒無音が残る場合のみ。接続リーク防止の TTL 付き単一スロット（SinkCarrier パターン踏襲） |

### Phase P3: サーマル＆バッテリー連動
| タスク | 内容 | 実施結果 |
|---|---|---|
| P3-1 | `PowerStateMonitor.java`（Thermal API API29+ ガード、PowerSave 受信、ポリシー計算のみ） | テストグリーン（ポリシー純関数） |
| P3-2 | 縮退時の ambience 再発行（同一 IR の 512 タップ版）/ SEVERE 時 `ambIntensity=0` | 実機で発熱時の CPU 低下と無ポップを確認 |

---

## 4. V6.1仕様書およびユニットテストへの影響評価

### 既存 186 件ユニットテストへの影響: **ゼロ**
- **シグネチャ変更なし**: 既存メソッドの削除・変更は一切なし。全追加が新規クラス or 追加メソッド（`setWindowMs`、`nativeSetNightMode` 等）。
- **`LookaheadSchedulerTest`**: デフォルト 5000ms 不変のため既存契約を維持。新規テストのみ追加。
- **`SeamAuditTest` / ギャップレス系テスト**: park/adopt/audit/Fade-hold/バッファフロア経路は**一切変更しないため全テスト不変**。
- **`PrewarmCacheTest`**: `PrewarmedMeta` のフィールド追加は既存コンストラクタを維持（オーバーロード追加）で回帰なし。
- **新規テスト想定**: `DacProfileStoreTest`（5件）、`LoudnessAnalyzerTest`（6件）、`LookaheadScheduler` ウィンドウ拡張（4件）、`PowerStatePolicyTest`（4件）≈ **+19 件 → 約 205 件**。

### SeamAudit / ギャップレス実測検証への影響: **ゼロ**
- 機能 1〜3 はいずれも park 中のシンク操作・EOS フェード・アダプト経路に触れない。
- ソフトスタートは USB 書き込みパスのみで、AudioTrack の SeAudit 対象経路と無関係。
- LUFS ゲインは曲頭の既存ランプ経路に乗るため、SeamAudit の計測対象（head/capacity/parked 時間）を変えない。

### V6.1 仕様書への影響: **V6.2 セクション追加のみ**
- 既存 9 セクションの記述は変更不要（全機能が追加レイヤー）。
- 追加記載予定: 「## 10. ポータブル環境適応（V6.2）」— ソフトスタート・アンチポップ、DAC プロファイル永続化、ネットワーク可変プリロール、サーマル DSP スケーラー、ナイトモード（Dynamics Compressor）、LUFS ラウドネス正規化、ラウドネスコンター。各項目にキルスイッチとビット透過条件を明記。

### リリース判定上の注意
- **Bit-Perfect 純度**: 機能 4 の全 DSP は `bypass: true` 時に `null` ペイロードで完全無効化されることをテストで保証する（既存の crossfeed/ambience と同一検証手法）。
- **R2（ENDED 偽装禁止）**: 全機能が ENDED/曲送りシーケンスに触れないことを設計上保証（touch point なし）。
- **実機検証項目の追加**: DAC 抜き差し 20 回連続ポップなし、ナイトモード ON/OFF 50 回ポップなし、サーマル縮退中のギャップレス維持、機内モード切替中のギャップレス維持。

---

## 5. 推奨実装順序（結論）

1. **Phase N1（ナイトモード）** — モバイル UX 効果最大・C++ 追加は 1 ステージのみ・既存 atomic/ランプ慣習の完全再利用
2. **Phase N2（LUFS）** — PrewarmCache 拡張で自然に実装、キルスイッチ完備
3. **Phase P1（Auto-DAC）** — ポップ音問題の直接解決、実測挿入ポイント確定済み
4. **Phase P2（ネットワークプリロール）** — ウィンドウ可変化のみ最小実装、ストリーム事前オープンは実測後に判断
5. **Phase P3（サーマル）** — 既存 swap 機構の再利用で新規ネイティブ経路ゼロ

各 Phase 完了ごとに V6.2 仕様書へ追記し、実機検証結果（ポップなし回数、SeamAudit 値）を記録する。
