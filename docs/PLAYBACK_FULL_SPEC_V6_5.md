# Biscene DSPSystem - Comprehensive Technical Specifications (V6.5 Production Spec)

**策定日**: 2026-10-10（V6.2）
**最終更新**: 2026-10-15（V6.5: V6.4.1 実装一式の昇格 — Night D1 実機 3 ゲート Green 確定・IR 強度 +33%（Max 33.3% wet）・Info Phase 1（E/F/G）＋PIN UI・Signal truth 修正・People 回帰修正・JVM 240/0/0）
**ベース文書**: `PLAYBACK_FULL_SPEC_V6_2.md`（V6.2: ベース仕様。V6.3/V6.4 の内容は本 V6.5 に統合）
**V6.5 変更点**:
- **N3: IR 強度マッピング更新** — `NativeDspChain` の wet 除数 /400 → /300。UI 0–100 が wet 0–**33.3%** に対応（旧 25% から +33%）。実機 `DspVerificationTest.t14` 新契約 i=100 → **0.6667 実測**（理論値と完全一致）。dry 側 (1−amb) 常に正・TruePeakLimiter 後段担保・P3 サーマル半減は UI スケールで無矛盾。R1–R5 全契約不変。
- **Info Phase 1 完了（キー不要）**: E: CoverArtArchive ジャケット（埋込→フォルダ→CAA→iTunes 多層フォールバック）/ F: MB 収録項目拡張（ISRC・初出年・カタログ番号・トラックリスト・**新規 API 呼び出しゼロ**）/ G: Wikidata 典拠（QID → 生没年・楽器・公式サイト・画像）+ PIN UI 導線（「Wrong match?」）。
- **Signal truth 修正**: `productionInfo` が全経路で format/srcRate/srcBits を運搬 — ローカル再生で Native Resolution が永久「Detecting...」だった不具合を解消。
- **People 回帰修正**: WatchdogTask のリトライ予算を実質キーのみで判定（Phase 1 装飾キー除外）＋ Wikidata 2 GET を Discogs 後へ移動。Diana Krall「The Look of Love」で真因実証（Discogs credits が People の供給源・`+isrcs` は relations 不変）。
- **V6.3/V6.4 検証要求の解消**: 実機 `NightCompressorDistortionTest` **3/3 GREEN**（2026-10-15 測定）をもって Night D1 を最終確定。
**設計計画**: `PORTABLE_ADAPTIVE_FEATURES_ASSESSMENT_V6_2.md` (実装設計アセスメント)
**修正計画・根拠**: `android/.artifacts/implementation_plan.artifact.md` (V6.5 昇格計画。D1 真因分析・Phase 0/1 検証記録は `implementation_plan_archive_V6_3_D1_phase0.artifact.md` / `implementation_plan_archive_V6_4_phase1.artifact.md` にアーカイブ)
**検証ブランチ**: `feature/gapless-phase-v5` (HEAD: `7a425be` = origin push 済み。V6.4.1 機能コミット `34c6043` を含む)
**V6.2からの差分（使用・性能の改善のみ）**:
- **N1: Night モード低中域歪みの解消** — `DynamicsCompressor` のレベル検出を peak→RMS（mean-square ~5ms 平滑）に変更。低中域 THD 5.11–5.91% → **1.12/0.65/0.32%**（60/120/250Hz、実機 3 ゲートで実測確定）。しきい値 −24dB・2:1・−9dB フロア・トグルラップ・kill-switch は不変。Night の目的（大音量抑制 −5.16dB）は維持。
- **N3: IR 強度 +33%** — 上記 V6.5 変更点参照。
- **Info 精度・充実（Phase 0 + Phase 1）** — 上記 V6.5 変更点参照。実機で INFO 全項目表示を確認（People の producers/共演者含む）。
- **テスト資産**: `NightCompressorDistortionTest`（実機 3 ゲート・Green）+ CAA/MB 抽出/Wikidata 純 JVM テスト +20 件。既存テスト完全維持・assembleDebug 成功。
**ユーザー向け資料**: `PLAYBACK_FULL_SPEC_V6_4_JP.html` / `PLAYBACK_FULL_SPEC_V6_4_EN.html`（V6.4.1 実装内容を反映。V6.5 HTML は未生成・本 .md が正）

---

## 安全ルール定義 (R1–R5)

本仕様書全体で参照される安全ルールをここに定義する。

| ルール | 名称 | 定義 |
|---|---|---|
| **R1** | Bit-Perfect | DSP OFF (bypass) 時、ソースサンプルレート・ネイティブ深度・生 PCM を 100% Bit-Exact に直通送信。定常状態でゲイン変更ゼロ。起動/再構成時のみ 8チャンク(~30ms) のアンチポップランプ適用 (P1)。 |
| **R2** | Gapless | トラック境界でシンク (`AudioTrack` / USB Direct) を破棄せず、後続トラックが前任トラックのバッファードテイルにシームレスに追記。 |
| **R3** | True-Peak | 4× FIR オーバーサンプリング + 1ms ルックアヘッドで ISP を検出・抑制。最終段でクリッピング防止。 |
| **R4** | Lock-Free | 音声スレッドはロック・ヒープ確保・システムコールを行わない。パラメータ更新は atomic / volatile / swap-publish のみ。 |
| **R5** | Kill-Switch | 全追加機能に `setEnabled(false)` 相当を備え、即座にレガシー動作へロールバック可能。再ビルド不要。 |

---

## V6.3 検証サマリー（2026-10-15 実測 — V6.2 改善分のみ）

**注**: V6.2 の既存機能・既存検証項目（Bit-Perfect / Gapless / True-Peak / Lock-Free / Kill-Switch / 205 tests / ビルド / Vite / tsc）は不変・全維持。以下は今回の D1 修正が改善した使用・性能の差分のみ。

| 検証項目 | V6.2（修正前） | V6.3（RMS 修正後） | 結果 |
|---|---|---|---|
| **使用**: Night モード低中域歪み（THD 60/120/250Hz, amp 0.30, 定常態） | 5.11 / 5.74 / 5.91%（実機報告: 低音量でも可聴） | **1.12 / 0.65 / 0.32%**（実ヘッダ実測） | ✅ 改善（ゲート <1.5%） |
| **使用**: Night の大音量抑制（amp 0.7 低中域、ON-vs-OFF） | −5.40 dB | **−5.16 dB** | ✅ 維持（ゲート ≤−4dB） |
| **使用**: 歪みの音量依存（vol 1.0/0.3/0.05） | 5.883% 全 volume 同一（歪み率不変のまま） | **0.532% 全 volume 同一** | ✅ 改善・健全 |
| **性能**: コンプステージ負荷（60s 音声） | 43.6 ms | **49.4 ms**（+5.8ms = 予算の 0.08%） | ✅ 無視可能 |
| 既存ユニットテスト (JVM) | 205 passed | **214 passed, 0 failed**（検証テスト3件を含む既存全件・リグレッションゼロ） | ✅ PASS |
| 新規 D1 回帰テスト (androidTest/実機) | — | **`NightCompressorDistortionTest` 3ゲート**（THD / ON-vs-OFF / 音量非依存）。実機 `connectedDebugAndroidTest` で **3/3 GREEN**（2026-10-15・MAR-LX2J 測定: THD 1.120/0.647/0.322%・−5.16dB・vol 1.0/0.3/0.05 で 0.532% 完全一致）。ホスト予測と完全一致 | ✅ 実機確定（V6.5 時点） |
| Gradle ビルド（C++ NDK 含む） | BUILD SUCCESSFUL | **BUILD SUCCESSFUL**（修正ヘッダで NDK コンパイル） | ✅ PASS |
| R4 Lock-Free / R5 Kill-Switch | 維持 | **維持**（atomic は `enabled_` のみ、Night OFF は comp 未搭載参照と完全一致を実測） | ✅ PASS |

### V6.2 追加実装（コミット）

| コミット | 内容 |
|---|---|
| `542badb` | **実装設計アセスメント**: ポータブル環境適応 4 機能の全コードレベル設計。既存安全機構（PhaseInverter ランプ、setAmbience swap-publish、volatile フラグ、キルスイッチ）の転用設計を確定 |
| `60bfbc0` | **N1: Night Mode 実装**: Output EQ ダイヤルの TUBE を廃止し NIGHT を最終段（index 6）に配置。静的 NIGHT EQ カーブ + 新規 `DynamicsCompressor`（動的ジェントルコンプレッサー）の統合 |
| `3f80153` | **N2: ラウドネス正規化**: 新規 `LoudnessAnalyzer.java`（純 JVM K-weighting 簡易近似）+ `LoudnessAnalyzerTest`（11 件）。フィルタ係数の逆転バグを GainProbe 数値プローブで実測・修正 |
| `b3ebb2d` | **N2: トリガー配線**: 音声スレッドが 5 秒の raw PCM を収集（コピのみ・事前確保）→ IO プールで分析 → `onLoudnessMeasured`（default メソッド）で 1 回だけ通知 → playbackTime チャンネルで Web へ → setTrackLoudnessDb + DSP ペイロード再送 |
| `7dee50c` | **P1: Auto-DAC プロファイル＆プロテクト**: 新規 `DacProfileStore.java`（VID:PID 永続化）+ `setUsbDacIdentity` + `writeUsbChunk()` 冒頭のソフトスタート・アンチポップ・ランプ（8 チャンク、ロックフリー、パック前 float 乗算） |
| `4620c61` | **P2: ネットワーク耐性可変プリロール**: `LookaheadScheduler.setWindowMs()`（volatile・3〜15 秒クランプ・デフォルト 5000ms 不変）+ 新規 `NetworkStateMonitor`（Wi-Fi 5s / セルラー 8s / 劣化 12s、WindowConsumer 経由で per-listener スケジューラーが生成時に採用） |
| `699c1ad` | **P3: サーマル＆バッテリー連動**: 新規 `PowerStateMonitor`（Thermal API API29+ ガード + PowerSave 受信、ポリシーのみ）+ `applyPowerPolicy`（REDUCE は wet 半減 / MUTE はゼロ、`lastUserAmbIntensity` で冷却時に正確復元、新規ネイティブ経路ゼロ） |
| `12cd765` | **V6.3 D1: Night 低中域歪み修正** — `DynamicsCompressor` を peak→RMS 検波に変更（THD 5.11–5.91% → 1.12/0.65/0.32%、大音量抑制 −5.16dB 維持）。新規 `NightCompressorDistortionTest`（THD/ON-vs-OFF/音量非依存）+ 検証テスト3件（JVM）と仕様差分を同梱。実機 3 ゲートは V6.5 で Green 確定 |

### V6.2.1 修正メモ（2026-10-11）

| コミット | 内容 |
|---|---|
| `05886de` | **NIGHT EQ ゲイン緩和（音割れ修正）**: 60Hz +5.5→+3.0 / 250Hz +1.5→+1.0 / 2.5kHz +3.0→+2.0 / 14kHz −6.0→−4.5dB。DSD ベース寄りソースでのソフトクリップ領域への侵入（peak 0.93 × 1.75 = 1.63）を実機検証で修正。ネットブースト +1.5dB でナイト感維持+約 2.5dB ヘッドルーム。本仕様書の NIGHT EQ 記載も本コミット値に更新済み |
| `d7420df` | **WAV 44.1kHz 周期音揺れの根治**: `RateConverter.convert()` の出力キャップ（16384フレーム）が WAV 44.1k の供給粒度（8192フレーム/回、step 0.459375）を消化しきれず、リングに 665フレーム/回滞留 → 197回 = 33.6秒で未読データを上書き（＝「30-40秒周期の音揺れ」の真因。詳細は `HANDOVER_WAV_STUTTER_INVESTIGATION.md` §7）。`pipelineBuf` 32768→73728 floats で最悪拡大（16384入力→35670出力）を収容し、FLAC/DSD と同じ入力駆動モードに復帰。22050Hz 未満のソースで警告ログ。回帰テスト2本追加（`RateConverterPhaseTest` 全17件通過）。無効と判明した isDsdTrack バッファ条件分岐は revert |
| `e8c7cb5` | **cap sync 残差**: `index.html` の Vite バンドルハッシュ同期 |
| `9863448` | **実機検証記録**: Huawei MAR-LX2J（Android 10）で修正版 APK を WAV 16/44.1 で3分間連続再生、音揺れゼロ（未修正ビルドなら約5回発生する期間）を確認・記録 |

### V6.4 / V6.5 追加実装（コミット）

| コミット | 内容 |
|---|---|
| `bdcd485` | **Info Phase 0 (A–D)**: MB スコアリング（`MbMatchScorer`、MIN_SCORE=55 abstain ゲート）・MBID 永続キャッシュ（`MbidPinStore`）・Discogs LRU 上限（cap=200）・ユーザー PIN（`setInfoPin`） |
| `3ac5c47` | **artistBio 誤情報修正**: `isSamePerson` ゲート＋楽器キーワード拡張（実機で本人表示確認） |
| `e1dcb58` / `86dc310` | **V6.4 仕様書化**: docs 整備（機能コード変更なし） |
| `34c6043` | **V6.4.1/V6.5 機能一式**: IR wet 除数 /400→/300（Max 33.3%・+33%）/ Info Phase 1 E（`CoverArtArchiveClient`・CAA ジャケット）/ F（`MbDetailExtractor`・ISRC・初出年・カタログ番号・トラックリスト・新規 API 呼び出しゼロ）/ G（`WikidataParser`・生没年・楽器・公式サイト・画像）/ PIN UI（「Wrong match?」）/ Signal truth 修正（`productionInfo` 全経路化）/ People 回帰修正（リトライ予算を実質キーのみで判定＋Wikidata を Discogs 後へ移動）/ `MainActivity` instrumentation ガード / `DspVerificationTest.t14` を新契約（0.6667）に更新 |
| `7a425be` | **V6.4.1 docs**: 開発方向性 §7 実装記録・V6.4 JP/EN HTML・検証要求バナー解消 |

---

## V6.2 の新機能詳細

### Night Mode（Output EQ ダイヤル統合型）

**位置づけ**: Output EQ ダイヤルの最終段（OFF(0) → STUDIO(1) → JBL(2) → PLANAR(3) → LOUD(4) → CRYSTAL(5) → **NIGHT(6)**)。LOUD（等聴コンター、高域を持ち上げる）と真逆の目的（高域を下げる）ため両機能は共存する。

**静的 EQ カーブ**（`OUTPUT_EQ_PRESETS.NIGHT`）:
| 帯域 | ゲイン | 目的 |
|---|---|---|
| 60 Hz (Q 0.7) | +3.0 dB | 小音量時の低域補強 (V6.2.1 緩和: +5.5→+3.0) |
| 250 Hz (Q 1.0) | +1.0 dB | 胸声帯域の存在感維持 (V6.2.1 緩和: +1.5→+1.0) |
| 2500 Hz (Q 1.2) | +2.0 dB | 会話明瞭帯域 (V6.2.1 緩和: +3.0→+2.0) |
| 14 kHz (Q 0.8) | −4.5 dB | 刺々しい高域の抑制 (V6.2.1 緩和: −6.0→−4.5) |

**動的コンプレッサー（新規 `DynamicsCompressor`）**:
- **構造**: RMS フィードフォワード型。 louder channel の 1-pole エンベロープ検出 → ゲインコンピュータ → ゲイン平滑化 → 適用
- **設定**: 2:1 レシオ、−24dB しきい値（0.0631 linear）、20ms attack / 300ms release、**−9dB 最大減衰フロア**（ジェントル、ポンピングしない）
- **切替安全性**: 有効/無効のトグルは圧縮ミックス 0↔1 を **~10ms（960 frames @96kHz）でランプ**（`PhaseInverter` は ~1ms / 96 frames の別パターン）。ステップ不連続は原理的に発生しない
- **無効時**: 純粋パススルー（ミックス 0 で早期リターン、CPU コストゼロ）
- **スレッドモデル**: `setEnabled()` は relaxed atomic store（任意スレッドから安全）、`process()` は音声スレッド専用・アロケーションなし（R4 順守）
- **チェーン位置**: `spatial`（トーンシェーピング完了）の後、`limiter`（圧縮後信号を True-Peak 安全性の対象として処理）の前
- **サンプルレート追従**: `setSampleRate()` で attack/release 係数を再導出（20/300ms を全レートで維持）

#### V6.3 D1 修正（コンプレッサー RMS 検波化・使用面/性能改善）

- **背景（真因）**: ピーク検波 + 20ms attack が 1周期内で gain を変動させ、低中域（周期 4–16ms）の信号を振幅変調して 5–6% の高調波歪みを生成。しかも音量は compressor/limiter の後段適用のため、DSP は常にフルスケールを処理 — **低音量でも歪む**（実機報告通り）。
- **修正**: レベル検出を RMS（mean-square を ~5ms 平滑）に変更。NIGHT EQ ブースト（低中域を最も深くしきい値越え）との相互作用も含め、定常態で gain を実質一定にし歪みを除去（THD 5.11–5.91% → **1.12/0.65/0.32%**、60/120/250Hz、実ヘッダ実測）。
- **不変性**: しきい値 −24dB・2:1・−9dB フロア・トグルラップ・kill-switch・R4 lock-free（新 atomic なし、ヒープ/システムコール ゼロ、sqrt 1回/フレーム）。Night OFF は無コンプ参照と完全一致（max|diff|=0）で kill-switch がビット透過であることを実測。既存 214 テストは 0 failures。
- **安全性**: ロールバックは `git checkout` / `safety_net_20261014/` / R5 OFF の3経路（D1 記録は `implementation_plan_archive_V6_3_D1_phase0.artifact.md` §7 にアーカイブ）。回帰検証は `NightCompressorDistortionTest`（androidTest、THD/ON-vs-OFF/音量非依存 + Warm-up）— **実機 3/3 Green で確定（V6.5）**。

**ビット完全性の保証**:
- Web ペイロードは `outId === 'NIGHT'` の時のみ `night: true` を送る
- `bypass: true` ペイロード（Bit-Perfect Direct）はこの分岐に到達しないため、**純度は設計上保証される**（crossfeed/ambience と同一の分離原則）
- `updateDspInternal()` が全 update で `dj.optBoolean("night", false)` を明示適用 → **ダイヤルを動かしても stale ON が残らない**（tube リセットと同一パターン）

**既存プリセットの互換性**:
- 「Club Bass & Tube Warmth」プリセットは CRYSTAL（index 5）にマッピング変更
- LOUD は維持（ユーザー判断: 等聴補正の定番、NIGHT と真逆）

---

## V6.2 実装完了一覧（全 5 機能）

| Phase | 機能 | コミット | 状態 |
|---|---|---|---|
| N1 | Night Mode（Output EQ ダイヤル統合 + `DynamicsCompressor`） | `60bfbc0` | ✅ 実装完了 |
| N2 | ラウドネス正規化（`LoudnessAnalyzer` + トリガー配線） | `3f80153` + `b3ebb2d` | ✅ 実装完了 |
| P1 | Auto-DAC プロファイル＆プロテクト（`DacProfileStore` + ソフトスタート・アンチポップ） | `7dee50c` | ✅ 実装完了 |
| P2 | ネットワーク耐性可変プリロール（`setWindowMs` + `NetworkStateMonitor`） | `4620c61` | ✅ 実装完了 |
| P3 | サーマル＆バッテリー連動 DSP スケーラー（`PowerStateMonitor`、新規ネイティブ経路ゼロ） | `699c1ad` | ✅ 実装完了 |

各機能はすべてキルスイッチ（`setEnabled(false)`）を持ち、即座にレガシー動作へロールバック可能（R5 準拠）。

---

## 1. Core Native Audio Engine & Bit-Perfect USB Direct Pipeline (C++/NDK & Java V2)
* **NEON SIMD & 96kHz / 32-bit Float DSP Pipeline**: Complete 96,000Hz / 32-bit Floating Point mastering audio processing chain, accelerated with ARM NEON SIMD intrinsics for real-time parallel DSP processing.
* **Sample-Accurate Gapless Playback Pipeline**:
  * **`SinkCarrier` Handover Architecture** 【検証済 2026-10-15: SinkCarrier.java でシンク再利用・TTL自動解放を確認】: Retains the active output audio sink (`AudioTrack` / USB Direct) across track boundaries, allowing the successor track to seamlessly append PCM samples behind the preceding track's buffered tail without tearing down the audio sink or creating gaps/clicks.
  * **`LookaheadScheduler` & `LookaheadInspector`**: Probes upcoming playlist items 5 seconds prior to track completion (`DEFAULT_WINDOW_MS = 5000L`), pre-warming decoders (`PrewarmCache`) to guarantee zero-latency seamless track transitions.
  * **`SeamAudit` / `SeamSnapshot` Measurement** 【検証済 2026-10-15: SeamAudit.java が park 時 head/capacity・drained frames を記録し drained<capacityFrames で GAPLESS 判定】: One-shot seam measurement at the first write into an adopted sink, logging park-time head/capacity and drained frames for deterministic gapless verification.
  * **Fade-Hold Tail Emission**: One-chunk hold-back in the playback loop guarantees the true final chunk is faded (`applyTailFadeOut()`, up to 3ms/288 frames) and emitted through the full DSP/sink path, ending every track at exact zero amplitude. **(V6.3 訂正: 旧表記「1114-1115 frames faded」は誤り。コード `applyTailFadeOut()` は `Math.min(frames, 288)` で **最大288フレーム（3ms @ 96kHz）** をゼロ振幅へフェードする。1114-1115 という数値はコードに存在せず、保持チャンクの実フレーム数は直前チャンク長（可変）に依存する。フェード区間の正確な上界は288フレーム/3ms。)**
  * **Pause→Flush→Play Handover Re-arm**: The adopted sink is re-armed via `pause()→flush()→play()`, deterministically clearing residual audio of the previous track before the successor's first sample.
  * **2-Second Buffer Floor**: `Math.max(min*4, 1572864)` bytes guarantees park-period headroom. **(V6.3 訂正・精緻化: バイトリテラル `1572864` は PCM_FLOAT(4B)×2ch で除算すると 196,608 フレーム、96kHz で **2.048秒** に相当。旧表記「196,608 frames ≈ 2.0s」は実質正確（より正確には2.048秒）。一方、旧「measured 1.3s worst-case handover」は根拠不明な数値であり、コードの `1277` は存在しない。理論上、park 中に drain しうる最大時間はバッファ全長の **2,048ms** であり、`SeamAudit` は `drained < capacityFrames(196,608)` で GAPLESS を判定するため、**後継が2.048秒以内に書き込めば無音ギャップなしを保証**する。正確な上界は「最大2,048ms（バッファ全長）」であり、実測は通常これを大きく下回る。)** `SeamAudit` で実測検証。
* **Dual-Path Absolute Phase Control (0° Normal / 180° Phase Reverse)**:
  * **DSP ON Mode** 【検証済 2026-10-15: NativeDspChain.nativeSetPhaseInverted・PhaseInverter.cpp ~1ms クロスフェード確認】: Applied at C++/NDK level in `NativeDspChain` (`nativeSetPhaseInverted`) featuring a ~1ms cross-fade for click-free 180° polarity reversal.
  * **DSP OFF (Bit-Perfect) Mode** 【検証済 2026-10-15: JavaPhaseInverter.java が bypass 時に生サンプルを反転しビット深度保持】: Applied via `JavaPhaseInverter` directly to raw PCM samples prior to USB packing, ensuring 180° absolute phase flip is available across both DSP-ON and Bit-Perfect paths without violating bit-depth or sample-rate integrity.
* **[V6.2] Night Mode Dynamics Compressor (`DynamicsCompressor`)**:
  * **Gentle Feed-Forward RMS Compression**: 2:1 ratio, −24dB threshold, 20ms attack / 300ms release, −9dB max attenuation floor — calm night listening without pumping artifacts.
  * **~10ms Ramp-Safe Toggle**: Enable/disable ramps the compression mix over ~10ms (PhaseInverter pattern), so toggling can never pop; the disabled state is a pure passthrough with zero cost.
  * **Lock-Free & Allocation-Free**: `setEnabled()` is a relaxed atomic store callable from any thread; `process()` runs on the audio thread only with no heap allocation (R4 respected).
  * **Chain Placement**: After `SpatialMatrix` (tone shaping settled), before the `TruePeakLimiter` (which still sees the compressed signal for true-peak safety).
  * **Output EQ Dial Integration**: Active only when the Output EQ dial is on NIGHT (`night: true` payload); the `bypass: true` (Bit-Perfect) path never reaches this branch, so bit-perfect purity is preserved by construction.
  * **Stale-State Prevention**: Every DSP update explicitly applies `night` (false on non-NIGHT positions), so a stale ON state can never survive a dial move (same pattern as the tube reset).
* **4-Point Catmull-Rom Linear-Phase Resampler (`RateConverter`)** 【検証済 2026-10-15: RateConverter.java に4点カーネル・時間対称・線形位相・プリリンギングなし実装確認】:
  * **Catmull-Rom Cubic Spline Interpolation**: High-precision 4-point ($p_0, p_1, p_2, p_3$) cubic spline resampling up to 96kHz.
  * **Linear Phase & Zero Pre-Ringing**: Time-symmetric polynomial kernel providing linear phase response, zero group delay distortion, and complete elimination of pre-ringing artifacts (pre-echos) for pristine attack transient preservation.
* **Bit-Perfect USB Direct Output (AudioFlinger Bypass)**:
  * **DSP OFF (E2E Bit-Perfect Direct Mode)** 【検証済 2026-10-15: DSP OFF は native チェーンを迂回し生 PCM・SR・ビット深度を DAC へ透過（再サンプル/ゲイン/ワード長変換ゼロ）】: End-to-End (E2E) bit-perfect direct audio transmission. Source sample rate, native bit depth (16-bit / 24-bit / 32-bit), and audio stream PCM are delivered to the external USB DAC 100% bit-exact with zero resampling, zero gain alteration (定常状態), and zero word-length conversion. 起動/再構成時のみ P1 のアンチポップランプ (8チャンク, ~30ms) を適用。
  * **DSP ON (96kHz / 32-bit Mastering Mode with 24-bit Downgrade Fallback)** 【検証済 2026-10-15: UsbDirectEngineBridge「request 32bit→actual 24bit based on DAC descriptors」。フォールバック判断は native 側が UAC descriptors から行い、有効深度を getBitDepth() で返す（packer はその深度で bit-exact にパック）。自動判断は native エンジン側に実在】: Processed at 96kHz / 32-bit Float precision through `NativeDspChain`. If the connected USB DAC does not support 32-bit depth, auto-downgrades cleanly to 24-bit subframes (`UsbPcmPacker`) to match the hardware DAC cap.
* **Direct NDK Isochronous USB Engine (`UsbDirectEngine`)**:
  * Direct C++/NDK USB driver submitting raw Isochronous URBs (`USBDEVFS_URB_TYPE_ISO`) via Linux `ioctl` interface, completely bypassing Android `AudioFlinger` and system OS resampler.
  * **Dynamic Kernel Driver Claim & Re-binding**: Atomically detaches Android's default `snd-usb-audio` driver via `USBDEVFS_DISCONNECT_CLAIM` upon DAC acquisition, and re-binds system drivers (`USBDEVFS_CONNECT`) upon release for seamless system audio recovery.
  * **UAC1 / UAC2 USB Audio Descriptor Parsing**: Parses USB Audio Class 1 and Class 2 descriptor structures to automatically detect supported sample rates, channel configurations, and bit resolutions.
* **Triple Output Architecture**:
  * **USB Direct Mode (`UsbDirectEngine`)**: Raw file descriptor USB Isochronous transmission directly to external USB DACs (E2E Bit-Perfect when DSP OFF; 96kHz/32bit with 24bit downgrade when DSP ON).
  * **System Direct Mode (`AudioTrack`)**: Audio track configured natively at `96,000Hz / ENCODING_PCM_FLOAT`, directly fed from `BiscenePlayerV2` and `NativeDspChain`.
  * **HTTP Proxy Mode (`/pcm`)**: Embedded HTTP streaming endpoint (`http://127.0.0.1:9600/pcm`) providing real-time 32-bit Float PCM output.
* **Lock-Free Zero-Allocation Audio Thread**: Real-time audio rendering thread operates strictly lock-free and allocation-free to eliminate audio dropout artifacts.
* **True Peak Safety Limiter**: Final mastering stage with 4x FIR oversampling and 1.0ms lookahead to prevent Inter-Sample Peaks (ISP) and clipping distortion.
* **Hi-Res Audio & DSD/DSF Decoder**:
  * Native DSD (`.dsf`, `.dff`) 1-bit bitstream decoding (`DsfDecoderV2`) and multi-format support (`FLAC`, `WAV`, `ALAC`, `AAC`, `MP3`, `M4A`) with integrated `RateConverter` resampling.
  * **Dynamic Decimation to 176.4kHz PCM**: All DSD rates (DSD64/128/256/512) decimate to 176,400Hz hi-res PCM (`decimR` = 16/32/64/128 respectively), feeding the 96kHz master chain via `RateConverter`.
  * **Clean DSD Trailing Block Handling**: Incomplete trailing blocks are safely discarded on `drain()` (verified 0 dirty frames), eliminating step-discontinuity pop noise; measured DSD64 decode at 7.81x realtime (t25, 128ms for 1.0s).

## 2. Spatial & Virtual Acoustic Matrix (5x5)
* **Unity-Gain Crossfeed with Woodworth ITD (V4.5.6, Native `SpatialMatrix`)**:
  * **6-Position Angle Dial (OFF / 15° / 30° / 45° / 60° / 90°)**: User-selectable azimuth via mixer row `X-FEED ANGLE` dial; angle 0 (OFF) is fully bit-transparent passthrough.
  * **Sub-Sample Fractional ITD Delay Lines** 【検証済 2026-10-15: SpatialMatrix.cpp に Woodworth 角度→ITD遅延・線形補間・0.26 unity-gain crossfeed・直接経路1.0 を確認】: Woodworth model delay (`getItdSamples(angle)`) with linear interpolation for fractional-sample accuracy; crosstalk component delayed and injected into the opposite channel at fixed 0.26 unity-gain crossfeed factor (direct path stays at 1.0 — no level loss vs bypass).
  * **Head Shadowing on Crosstalk**: Native IIR shelving filters (`shadowL`/`shadowR`) apply frequency-dependent ILD to the crossfed component only.
* **Spherical Head Shadowing**: Native IIR shelving filters simulating frequency-dependent Inter-aural Level Difference (ILD).
* **Distance Control Intelligence (Mixer `DISTANCE` Dial: OFF / INTIMATE / NEAR / NORMAL / FAR / DEEP)** 【検証済 2026-10-15: SpatialMatrix.cpp に近接効果・空気吸収・envL/envR 補正を確認】:
  * **Proximity Effect**: Near-field low-frequency spherical wave boost.
  * **Air Absorption**: High-frequency roll-off emulation for far-field distance perception.
  * **Environment Correction Filters** (`envL`/`envR`): Per-channel IIR correction applied after crossfeed staging in the same 5x5 matrix pass.
* **Virtual Acoustic Absorption Profiles**: Physical material profiles for Studio, Wood, and Glass boundary absorption.

## 3. Ambience & Real FIR Convolution Engine
* **Hybrid FIR Convolution + Feedback Tail**: 1024-tap NEON-optimized early reflection FIR convolution combined with 4-comb / 2-allpass feedback tail networks.
* **[V6.5 N3] IR Intensity Mapping (+33% wet at Max)**: `NativeDspChain` wet divisor /400 → **/300** — UI 0–100 now maps to a linear dry/wet crossfade of 0.00–**0.333** (was 0.25). On-device `DspVerificationTest.t14` measures **i=100 → 0.6667** (exact theory match: dry coefficient 1−1/3 = 2/3). The dry coefficient (1−amb) always stays positive; the downstream `TruePeakLimiter` (threshold 0.98) still guards the tail; the P3 thermal REDUCE halves the UI intensity and scales identically under this mapping. R1–R5 contracts unchanged; a single-line divisor change with an updated contract test.
* **Zero-Copy Fast Path**: `irId` stable identifier system enabling instant intensity and decay retuning without memory reallocation or thread lock contention.
* **Impulse Response Asset Catalog**: Pre-loaded acoustic environments including Studio Hall, Jazz Club, Large Bottle Hall, and St. Nicolaes Church (V4.5.8: leading-silence trim + 0.9/√energy normalization).

## 4. High-Fidelity Restoration, Physical Modeling & Parametric EQ
* **Restoration Engine**:
  * **Harmonic Extrapolation**: Reconstruction of high-frequency harmonics (24kHz–32kHz) for lossy (MP3/AAC/Opus) audio files.
  * **Transient Punch**: Wavelet-based attack sharpening.
  * **De-Pre-Echo**: Suppression of digital pre-ringing artifacts.
* **Tube Physical Modeling**:
  * **Triode (300B)**: Asymmetric transfer function emphasizing 2nd-order harmonics.
  * **Pentode (KT88)**: Symmetrical saturation for dynamic response.
  * **Power Supply Sag**: Real-time simulation of B+ high-voltage drop under load.
  * **[V6.2] Note**: The TUBE position was removed from the Output EQ dial (replaced by NIGHT, Section 1). Tube physical modeling itself (`tube_v4` payload, `TubeModel`) remains fully available via the mixer's TUBE WARMTH toggle.
* **Multi-Band Parametric EQ & Calibration**:
  * **3-Stage EQ**: Source EQ, Band EQ, and Output EQ with adjustable gain, Q, and filter types.
  * **[V6.2] Output EQ Dial: 7 Positions (OFF / STUDIO / JBL / PLANAR / LOUD / CRYSTAL / NIGHT)**: NIGHT combines the static night EQ curve (60Hz +3.0 / 250Hz +1.0 / 2.5kHz +2.0 / 14kHz −4.5 dB, V6.2.1 緩和値) with the dynamic Night Mode compressor. LOUD retained as the loudness contour (inverse purpose of NIGHT).
  * **Hum Notch Filter**: Selective 50Hz / 60Hz power grid hum suppression.
  * **Headphone AutoEQ Database**: Built-in 2.2MB headphone calibration catalog (Crinacle & Oratory1990) with parametric target curve editor and real-time total curve visualization.

## 5. Encyclopedic Metadata & Listening Wiki Hub
* **Multi-Tiered Metadata Enrichment Pipeline**:
  1. **AcoustID Recognition**: Audio fingerprinting for untagged tracks (Phase 2 — planned, NDK required).
  2. **MusicBrainz & Discogs Integration**: Asynchronous resolution of production credits (Producer, Recording Engineer, Studio, Mastering Engineer, Record Label).
  3. **Wikipedia Musician Disambiguation**: Deep biographical context and historical instrument / session background.
* **[V6.4 Phase 0] Accuracy Foundation (A–D)**:
  * **A — Scored MB Matching** (`MbMatchScorer`, pure JVM): top-N candidates ranked artist40+title40+duration15+country5 (Levenshtein + diacritics normalization); abstains below `MIN_SCORE=55` instead of adopting `recordings[0]` blindly — an empty display beats a wrong entity.
  * **B — MBID Persistent Cache** (`MbidPinStore`): verified recording/release MBIDs persisted per `artist|title|album` key; revisits skip search and fetch details directly. Kill-switch reverts to legacy search.
  * **C — Discogs LRU Cap**: the 3 in-memory caches are bounded synchronized LRU maps (cap=200) — memory-safe, behavior-identical.
  * **D — User PIN** (`setInfoPin`): "skip" (abstain) or "mbid:<recordingId>" persisted at the topmost rank so a wrong auto-match never resurfaces.
* **[V6.5 Phase 1] Information Enrichment (key-free, all implemented & on-device verified)**:
  * **E — CoverArtArchive Jacket** (`CoverArtArchiveClient`): MB release-id → CAA front cover (302-follow, UUID validation, JPEG/PNG magic-byte check, 10MB cap). Artwork fallback order: Embedded → Local folder → NAS → **CAA** → iTunes. Abstain-type: any failure falls through to the pre-V6.4 chain; the Info kill-switch disables CAA entirely.
  * **F — MB Item Expansion** (`MbDetailExtractor`, zero new API calls): ISRCs (max 3), first-release year, catalog numbers (deduped) and a compact tracklist (max 12, m:ss durations) extracted from ALREADY-fetched recording/release payloads (+`isrcs` rides the same `getRecordingDetail()` request). Surfaced in the Info UI (Album tab: Catalog No. / ISRC / First Released; Tracklist block). New keys only — rankedMerge semantics unchanged.
  * **G — Wikidata Support Facts** (`WikidataParser` + `WikipediaClient.fetchWikidata`): from the MB artist url-rels QID — birth/death dates (P569/P570), instruments (P1303), official site (P856), image (P18) via the key-free `wbgetentities`. Supporting data only: the wiki bio stays authoritative. Placed AFTER the Discogs tier so the credits path (People tab) is never delayed. Abstain on any failure.
  * **PIN UI**: the Info modal exposes a "Wrong match?" row — **No info** (abstain) / **Set MBID** (pin the correct recording) — native-only, fails soft on web.
* **[V6.5] Signal Truth for All Paths**: `productionInfo` now carries `format`/`srcRate`/`srcBits` for BOTH renderer and local playback (previously renderer-only, so the Signal tab's Native Resolution stayed "Detecting..." forever on local files). Display-only; the audio path is untouched.
* **[V6.5] People-Tab Retry Budget Fix**: the WatchdogTask retry condition counts SUBSTANTIVE keys only (`substantiveKeyCount()` excludes the Phase 1 decorative keys and `*_rank`), restoring the pre-V6.4 threshold semantics so the slower Discogs credits (the People supply — verified on Diana Krall "The Look of Love", Discogs release 7849548: Tommy LiPuma / Christian McBride / 36 credits) always land. Root cause verified on-device; the `+isrcs` inc itself was ruled out (relations byte-identical with and without it).
* **Unified Artwork Provider**: Multi-stage album art extraction Pipeline (Embedded tags -> Local folder art -> NAS UPnP metadata -> **CoverArtArchive (V6.5)** -> iTunes Search API synchronous/async fallback).
* **NativeImage Deferred Loading**: Lazy image tokens (`LAZY_BUCKET_SIZE`) make lazy-flagged images actually defer, so the main album cover (`AlbumArtFrame`, eager) is never starved by background artwork loads.

## 6. OpenHome & UPnP/DLNA DMR Network Architecture
* **Full OpenHome Renderer Specification**:
  * **Services**: `oh_product`, `oh_playlist`, `oh_transport`, `oh_volume`, `oh_info`, `oh_time`.
  * **Playlist Queue Management**: Natural completion advance (`advanceAfterNaturalEnd()`), `Move`, `ReadList`, `Insert`, `DeleteId` with base64 `IdArray` state synchronization.
  * **Control Point Compatibility**: Linn Kazoo, Linn App, BubbleUPnP, Twonky, Soundgenic NAS.
* **UPnP AV DMR (Digital Media Renderer)**:
  * **Services**: `AVTransport` (SetAVTransportURI, Play, Pause, Stop, Seek) and `RenderingControl` (GetVolume, SetVolume, Mute).
  * **SSDP Dual Bridge** 【検証済 2026-10-15: DualSsdpBridge.java が単一ポート1900で DMR+OpenHome を同時 advertise、core-openhome に Linn 規約サービス実装確認】: Advertises both UPnP AV DMR and OpenHome Renderer device descriptions simultaneously across the local network.

## 7. Background Execution & Deterministic System Integrity
* **Background Playback & Activity Lifecycle**:
  * **`killProcess` Avoidance**: `MainActivity` checks active playback state (`PlaybackService`) on finish, ensuring background music playback continues uninterrupted when closing the activity window.
* **USB Audio Hotplug & Manager (`UsbAudioDetector`)**:
  * **USB Hotplug Broadcast Receiver**: Monitors `ACTION_USB_DEVICE_ATTACHED` and `ACTION_USB_DEVICE_DETACHED` events to seamlessly acquire raw file descriptors for connected USB DACs.
* **Android Media3 & Background Service**:
  * **`PlaybackService`**: Integrated `MediaSessionService` providing system lockscreen widget, quick settings media controls, and Bluetooth headset operations (Play, Pause, Next, Prev, Seek).
* **Power Saver & Battery Optimization Protection**:
  * **`PARTIAL_WAKE_LOCK` (`DSP:PlayerV2ThreadLock`)**: Dedicated per-playback CPU wake lock ensuring uninterrupted audio decoding during Android Power Saver / Save Mode or screen-off state.
  * **`WifiLock` & MulticastLock**: Full high-performance Wi-Fi lock (`WIFI_MODE_FULL_HIGH_PERF`) and multicast lock for stable network streaming and UPnP/DLNA discovery.
* **Storage Access Framework (SAF)**: Deep local folder picking (`pickLocalFolder`), MediaStore import, and document tree scanning for local files with large-file Base64 OOM protection (direct Blob URL fallback).
* **VU Meter & Peak Accumulation Safety**: Post-fader logarithmic VU meters with 100ms peak accumulation and finite float guards (`Float.isFinite()`) preventing phantom peak needle behavior.
  * **Pure Music Peaks on Bit-Perfect Path**: Raw source peak IS the DAC level on the no-volume bit-perfect path, flagged post-fader so the meter is not scaled down by the volume knob.

## 8. Retro Skeuomorphic Hardware Chassis UI & Tactile Haptics
* **Tactile Mechanical Controls & Haptic Feedback**: Machined metal dials, 3-position toggle switches, and aluminum control panels with integrated tactile haptic vibration feedback (`triggerHaptic` tick/click response).
* **Symmetrical 4-Button Mixer Row (`STAGE`, `PHASE`, `RESTORE`, `HUM`)**: Dedicated bottom control row matching Player front panel geometry with active cyan light-up indicators.
* **Bit-Perfect OSD Indicator**: Dedicated white text indicator (`BIT PERFECT`) below the brand logo active when USB output and DSP bypass are engaged.
* **Real-Time VU Analog Meters**: Dual-channel analog-style VU meters reflecting post-fader audio dynamics.
* **Custom Responsive Layout**: Adaptive layout supporting mobile, tablet, and desktop viewports with wood-frame chassis styling.

## 9. Performance & Resource Optimizations (V6 Architecture)
* **Consolidated Thread Pools**: Rationalized background executors across `UpnpSsdpBridge`, `BisceneHttpProxy`, `MetadataCoordinator`, `AlbumArtProvider`, and `GenaNotifier` to ~30 lean threads.
* **Code Splitting & Bundle Optimization**: 2.2MB Headphone Catalog (`headphoneCatalog_oratory_crinacle.ts`) split into dedicated async chunk via Vite `manualChunks`, reducing initial JS bundle size by 83% (2.0MB ➔ 343kB). **[V6.2 re-verified: index 346.98 kB (gzip 102.90 kB), catalog async]**
* **Zero-Allocation Audio Rendering Loop**: Non-direct proxy streaming utilizes `ByteBuffer.wrap(chunk)` to eliminate per-block heap allocations and prevent GC pauses.
* **Metadata LRU Caching**: Thread-safe in-memory `LruCache` (100 items) for MusicBrainz and Wikipedia API requests to eliminate redundant network overhead.
* **PrewarmCache Bounded LRU**: 32-entry bounded process-wide prewarm cache (`PrewarmCache.DEFAULT_MAX_ENTRIES = 32`) with one-shot `take()` semantics; kill switch (`setEnabled(false)`) reverts to the legacy retriever path without a rebuild.

## 10. Portable Environment Adaptation (V6.2 — All Implemented)
* **Night Mode (`60bfbc0`、V6.3 `12cd765` で D1 修正)**:
  * **Output EQ Dial Integration**: NIGHT position (last, after CRYSTAL) combines the static night EQ curve with the dynamic `DynamicsCompressor` — dial to NIGHT for the complete night listening experience.
  * **Gentle Dynamics**: 2:1 / −24dB / 20ms-300ms / −9dB floor; ~10ms ramp-safe toggle; lock-free, allocation-free, pure passthrough when OFF.
  * **V6.3 D1 — RMS 検波化（使用面改善）**: peak 検波が 1周期内で gain を変動させ、低中域（周期 4–16ms）の信号を振幅変調して 5–6% の高調波歪みを生成していたため、mean-square を ~5ms 平滑する RMS 検波に変更。音量は compressor/limiter の後段適用のため DSP は常にフルスケールを処理し、低音量でも歪んでいた真因を除去。定常態で gain を実質一定にし、THD 5.11–5.91% → 1.12/0.65/0.32%（60/120/250Hz、実ヘッダ実測）、大音量抑制 −5.16dB（旧 −5.40dB、≤−4dB 維持）、音量 1.0/0.3/0.05 の全段階で同一 THD、性能 +0.08%（リアルタイム予算比）。しきい値・レシオ・フロア・ランプ・kill-switch 不変、既存 214 テスト 0 failures。
  * **Bit-Perfect Purity**: `night: true` is sent only for the NIGHT position; the bypass path never receives it.
  * **Stale-State Prevention**: Every DSP update explicitly applies `night` (false on non-NIGHT), so a stale ON state can never survive a dial move (same pattern as the tube reset).
* **ラウドネス正規化 (`3f80153` + `b3ebb2d`)**:
  * **`LoudnessAnalyzer.java`** (pure JVM, no Android types): ReplayGain 2.0互換の簡易ラウドネス正規化（K-weighting簡易近似: one-pole HPF ~40Hz rumble除去 + one-pole high-shelf ~1.5kHz +4dB 耳感度補正 + 平均二乗）。`gain = −18 (ReplayGain 2.0基準) − measured level dB`、±12dBクランプ。無音→0dB安全デフォルト。
  * **Filter-coefficient bug fixed by measurement**: the initial inverted (decay) coefficient form collapsed the mean square (GainProbe: a 0.95 sine measured +91.7dB — inverted direction); the one-pole step form gives verified correct gains (0.95 → −12 clamped, 0.25 → −10.78, 0.03 → +7.63, 0.0005 → +12 clamped).
  * **End-to-end trigger wiring**: the playback thread collects the first 5s of raw source PCM (copy-only into a preallocated buffer), the analysis runs on the IO pool (R4 respected), the result fires `onLoudnessMeasured` exactly once (default method — signature-safe), rides the existing `playbackTime` channel to the Web layer, and `setTrackLoudnessDb()` re-sends the DSP payload so the gain applies to the CURRENT track immediately.
  * **Zero new JNI**: the gain is added to `preampDb` in `updateDspInternal()` — the existing update() path computes `preampLin = 10^(preampDb·cs/20)` at update time (the recomputeMakeup() convention: update-time computation, audio thread only reads).
  * **Bit-Perfect Purity**: the bypass payload has `preampDb: 0` and never carries `loudnessDb`, so the bit-perfect USB path is untouched by construction.
* **Auto-DAC Profile & Protect System (`7dee50c`)** 【検証済 2026-10-15: DacProfileStore が VID:PID を永続化・失敗時 null で legacy probe へ degrade・kill-switch あり確認】:
  * **`DacProfileStore.java`** (SharedPreferences-backed): VID:PID keying (pure identity — ports/serials excluded so the same DAC model on any port hits the cache); `load()` returns null on disabled/missing/parse-failure (caller runs the legacy probe — safe default); `save()` only after a SUCCESSFUL configure+start (a transient failure is never locked in, PrewarmCache semantics); kill switch reverts without a rebuild.
  * **Zero-latency re-apply**: `initUsb()` re-applies the cached bitDepth BEFORE `configure()` (rate unchanged — it depends on the source/bypass state, not the DAC).
  * **Soft-Start Anti-Pop Ramp** 【検証済 2026-10-15: writeUsbChunk() が USB_RAMP_CHUNKS=8 チャンク・AtomicInteger ロックフリーで float にランプ乗算。ただしコードコメントは「~20-50ms」（8チャンクの実msはレート/チャンクサイズ依存で一定値ではない。旧「~30ms」は推定値）】: `writeUsbChunk()` ramps gain 0→1 over 8 chunks (~20–50ms), applied to the FLOAT samples BEFORE packing (multiplying packed bytes would corrupt them); armed at 1.0 so the steady state is a single integer compare and the hot path is untouched; the ramp re-arms on every USB (re)configuration — exactly the pop-prone driver (re)bind moment; the AudioTrack path is unaffected (the pop is specific to USB driver rebind). Lock-free: `AtomicInteger` stepped per chunk on the playback thread only (R4 respected).
* **Network-Resilient Variable Pre-roll (`4620c61`)**:
  * **`LookaheadScheduler.setWindowMs()`**: `windowMs` now volatile with a 3000–15000ms clamp; the DEFAULT 5000ms is unchanged (the existing tests' contract). Single volatile write — no lock, torn-read-safe, safe from any thread.
  * **`NetworkStateMonitor.java`** 【検証済 2026-10-15: NetworkStateMonitor.java が Wi-Fi 5000ms／cellular 8000ms／degraded 12000ms をマッピング。旧表記「5秒→12秒」は中間値 cellular 8000ms を経由するのが実態（記載欠落だった点を補足）】: `registerDefaultNetworkCallback` (the proven DualSsdpBridge pattern) maps link quality to the window — validated Wi-Fi → 5000ms (legacy default), validated cellular → 8000ms (handover + higher RTT), degraded/unvalidated/lost → 12000ms (a slow open still lands inside the window).
  * **WindowConsumer pattern**: the per-listener scheduler is structurally per-track, so the monitor updates a plugin-level volatile field and each new track's scheduler adopts the current window at creation (instance initializer).
  * **Safety**: every failure keeps the current window; the kill switch unregisters and restores the default; cold start applies the state immediately; never touches audio paths.
* **サーマル＆バッテリー連動 DSP スケーラー (`699c1ad`)** 【検証済 2026-10-15: PowerStateMonitor.policyFor() が省電力/MUTE・SEVERE以上 MUTE・MODERATE REDUCE（半減）・LIGHT NONE を返す。対象は NativeAudioEngine kMaxTaps=1024 の ambience(FIR)ステージ。冷却時 lastUserAmbIntensity で復元・音声経路非干渉・kill-switch あり確認】:
  * **`PowerStateMonitor.java`**: `OnThermalStatusChangedListener` (API 29+, ガード付き) + `ACTION_POWER_SAVE_MODE_CHANGED` レシーバー；ポリシーのみ — Policy enum を算出しコンシューマーへ通知；音声スレッド・ネイティブエンジン・ロックには一切触れない。
  * **ポリシー割り当て (純粋、JVMテスト可能)**: 省電力モード → MUTE_AMBIENCE (硬制約、サーマル優先)；サーマル ≥ SEVERE → MUTE_AMBIENCE (硬制約、即時)；サーマル ≥ MODERATE → REDUCE_AMBIENCE (最も緩やかな第一歩：最も CPU を消費する段階 — 1024-tap FIR + フィードバックテール — の wet レベルを半減)；LIGHT/定常 → NONE (フル DSP、P3 前と完全一致)。
  * **冷却時の正確な復元**: `lastUserAmbIntensity` が各 DSP ペイロードからユーザー設定の ambience 強度を記憶し、冷却時にそれを正確に復元。
  * **新規ネイティブ経路ゼロ**: ポリシーは既存の `updateDsp` ペイロード経路で適用 (変化 < 0.5 で再送抑制のチャーンガード付き)；トーンシェーピング、Night コンプレッサー、リミッターは無変更。
  * **キルスイッチ** (`setEnabled(false)`) で両リスナーを解除し NONE を通知 — pre-P3 へワンラインロールバック (R5 準拠)。

---

## 検証レコード（V6.2、2026-10-10 / 2026-10-11 追加検証反映）

* **ユニットテスト**: 全 205 件パス（`205 passed, 0 failed`）— V6.1 の 186 件から +19 新規（LoudnessAnalyzer 11 件 + PowerStateMonitorPolicy 6 件 + 回帰テスト 2 件）、既存テスト完全維持（シグネチャ変更ゼロ、`onLoudnessMeasured` は default メソッド）
* **Gradle ビルド**: `:app:assembleDebug` 成功（C++ NDK DynamicsCompressor 含む）
* **tsc --noEmit**: クリーン
* **Vite ビルド**: 初期 JS 346.98 kB (gzip 102.90 kB) / ヘッドホンカタログ非同期分離維持
* **GainProbe 数値プローブ**: LoudnessAnalyzer のフィルタ係数バグを実測で発見・修正（0.95 サイン波 → −12dB クランプ、0.03 → +7.63dB、正しい方向性を実証）
* **Git**: `542badb`（アセスメント）、`60bfbc0`（N1）、`3f80153`/`b3ebb2d`（N2）、`7dee50c`（P1）、`4620c61`（P2）、`699c1ad`（P3）、`05886de`（NIGHT EQ 緩和）、`d7420df`（WAV 44.1kHz 音揺れ根治）、`e8c7cb5`（cap sync）、`9863448`（実機検証記録）を含む `feature/gapless-phase-v5` ブランチを `origin` へ Push 完了（`https://github.com/tysbox/Bisen-DSP-System`）
* **実機検証（推奨）**: ① Output EQ ダイヤルを NIGHT に回した際の ON/OFF 切替 50 回でポップなし ② DSP ON/OFF（bypass）時の night/loudness 無効化確認 ③ USB DAC 抜き差し 20 回でポップなし（ソフトスタート・ランプ確認） ④ 機内モード→Wi-Fi 復帰時の lookahead ウィンドウ変化ログ確認 ⑤ 発熱時の ambience 縮退と冷却後の復元確認
* **表記統一**: 本文中の `Biscene` / `Bisen` / `BiScene` を `Biscene` に統一（Java パッケージ `com.bisen.biscene` と整合）

---

## 検証レコード（V6.3、2026-10-15 実測 — D1 修正の使用・性能改善のみ）

* **変更**: `DynamicsCompressor` を peak→RMS 検波に変更（コミット `12cd765`）。しきい値 −24dB・2:1・−9dB フロア・トグルランプ・kill-switch 不変
* **使用**: Night 低中域歪み THD 60/120/250Hz（amp 0.30、定常態）5.11/5.74/5.91% → **1.12/0.65/0.32%** — 実ヘッダ harness（実機テスト `NightCompressorDistortionTest` と同一アルゴリズム）で実測
* **使用**: Night 大音量抑制（amp 0.7 低中域、Night ON vs OFF 同一チェーン比）−5.40dB（旧）→ **−5.16dB** — ゲート ≤−4dB を新旧とも満足（Night 意図維持）
* **使用**: THD の出力音量依存（vol 1.0/0.3/0.05）→ **0.532/0.532/0.532%（完全一致）** — 歪み率が音量段階で不変（低音量で歪む物理的原因の解消を実証）
* **性能**: コンプレッサーステージ 60s 音声 43.6ms → **49.4ms**（+5.8ms = リアルタイム予算の 0.08%・無視可能）。R4 lock-free（新 atomic ゼロ、ヒープ/システムコール ゼロ）・R5 kill-switch（Night OFF は comp 未搭載参照と完全一致 max|diff|=0）維持
* **ユニットテスト**: 全 **214 件パス**（`214 passed, 0 failed`）— 修正前ベースラインと完全一致（リグレッションゼロ）
* **Gradle ビルド**: `:app:assembleDebug` 成功 + `:app:externalNativeBuildDebug` 成功（修正ヘッダで NDK コンパイル）
* **回帰テスト**: 新規 `NightCompressorDistortionTest`（androidTest・THD/ON-vs-OFF/音量非依存・Warm-up、コンパイル確認済み）— 実機実行 `connectedDebugAndroidTest` をもって V6.3 最終確定
* **セーフティーネット**: `android/.artifacts/safety_net_20261014/`（3 orig バックアップ + 検証 harness 保存）+ Git HEAD `11972a9` 記録 + R5 即 OFF（ロールバック 3 経路確立）
* **Git**: `12cd765`（`fix(night): peak→RMS level detector for D1 low-mid distortion + quantified gates [V6.3-verification required]`）を `feature/gapless-phase-v5` ブランチへ Push 完了（`https://github.com/tysbox/Bisen-DSP-System`）
* **実機検証（V6.3 確定条件）**: ① `connectedDebugAndroidTest` で `NightCompressorDistortionTest` 3ゲート Green（✅ V6.5 で達成・下記） ② Night ON/OFF 切替 50 回でポップなし ③ 大音量曲で「きつい圧迫感」が消え静音域が透明であることを耳確認

---

## 検証レコード（V6.5、2026-10-15 実測 — V6.4.1 実装一式の確定）

> V6.4.1（`34c6043` + `7a425be`）で実装・検証した内容を V6.5 として本仕様に昇格。ドキュメントのみの変更で機能コードは不変。

### 実機ゲート（MAR-LX2J / 2026-10-15 測定・logcat 記録）

| ゲート | 実測 | 判定 |
|---|---|---|
| **Night THD 60/120/250Hz**（amp 0.30 定常態・`NightCompressorDistortionTest`） | **1.120 / 0.647 / 0.322%** | ✅ ゲート <1.5%（ホスト予測と完全一致） |
| **Night 大音量抑制 ON-vs-OFF**（amp 0.7 @120Hz） | **−5.16 dB**（off=0.8534 / on=0.4709） | ✅ ゲート ≤−4dB（Night 意図維持） |
| **Night 音量非依存**（@150Hz、vol 1.0/0.3/0.05） | **0.532% 完全一致** | ✅ 圧縮が音量段より前の物理証明 |
| **IR wet マッピング**（`DspVerificationTest.t14` 新契約） | **i=100 → 0.6667**（理論値 2/3 と完全一致）・i=400 → 0.3333 反転 | ✅ DIVISOR=300 実証 |
| **Info 表示**（ユーザー実機確認） | People（producers/共演者）・Album（Catalog No./ISRC/First Released）・Signal（Native Resolution）**全表示** | ✅ |
| **起動スモーク** | FATAL ゼロ・プロセス存続 | ✅ |

### テスト系譜と品質

| バージョン | JVM テスト | 主な追加 |
|---|---|---|
| V6.1 | 186 | — |
| V6.2 | 205 | LoudnessAnalyzer 11 + PowerStateMonitorPolicy 6 + 回帰 2 |
| V6.3 | 214 | D1 検証 3 |
| V6.4 | 220 | MbMatchScorer 5 + Phase 0 関連 |
| **V6.5** | **240 / 0 / 0** | **CAA 5（URL 契約・UUID 検証・magic byte）+ MB 抽出 8（ISRC・初出年・カタログ・Tracklist・上限）+ Wikidata 7（QID・claims 解析・abstain）** |

* **ビルド**: `:app:assembleDebug` 成功・`tsc --noEmit` クリーン・Vite index 350.66 kB (gzip 103.68 kB)・ヘッドホンカタログ非同期分離維持・`cap sync` 完了
* **実機インストール**: `install -r` Success・APK md5 `ce26b215…` がローカルビルドと一致（lastUpdateTime 2026-10-15 06:57）
* **セーフティーネット**: `android/.artifacts/safety_net_20261016/`（変更対象 8 ファイルの `.orig`）+ R5 kill-switch（Info: `MbidPinStore.setEnabled(false)`、Night: `setNightMode(false)`、CAA は abstain 型）
* **Git**: `34c6043`（V6.4.1 機能一式・People 修正を含む）+ `7a425be`（V6.4.1 docs）を origin push 済み
* **People 回帰の検証メソッド**（参考記録）: Diana Krall「The Look of Love」で `+isrcs` 有無の relations を実測比較（完全一致 → inc 無関係と立証）→ Discogs release 7849548 に 36 credits 存在を確認（People の供給源特定）→ WatchdogTask リトライ条件のタイミング問題を特定・修正。実機で People 表示復旧をユーザー確認済み。
* **残タスク**: MIN_SCORE 実機調整（現状 55）・Night ON/OFF 50 回ポップ確認・Info 効果の定量記録。Phase 2（H: Discogs トークン / I: AcoustID / J: ディスクキャッシュ）はユーザー判断により非実施。
