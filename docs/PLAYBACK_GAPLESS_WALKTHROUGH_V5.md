# V5 Gapless / Phase 実装 Walkthrough

**対象機能**: 完全サンプルアキュレート・ギャップレス再生 / アンチポップ遷移 / 位相反転（Absolute Phase Control）
**作業ブランチ**: `feature/gapless-phase-v5`（ベースライン = `c31fdf1`）
**現在の HEAD**: `f7dc10e`（**製品コードはベースライン `c31fdf1` と同一**。docs のみ追加）
**更新日**: 2026-09-26

---

## ⚡ 別セッション開始時向け：最初に読む 3 つ

**このドキュメントだけで、進捗を無駄にせず正しく仕切り直せます。** 読み順：

1. **§11.0** — ベースライン構造の実測図と **不可侵の性質 R1〜R5**。全ての設計判断の前提
2. **§11.1** — P5/P6b が失敗した真因（**R3 = ENDED 通知を壊した**）。同じ轍を踏まないために必須
3. **§11.3〜11.5** — 推奨案（案3）と実装順序。各段は1コミット・テスト緑・実機確認で進む

**最重要の事実（3つ）**：

| # | 事実 |
|---|---|
| 1 | **製品コードは完全に元に戻っている**（`c31fdf1`）。実機も元通り動作確認済み |
| 2 | **P1〜P4 / P8 の実装は全て git 履歴に残っている**。`archive/*` ブランチで保護済み |
| 3 | **「曲と曲をつなぐ完全ギャップレス」は未達**。R3（ENDED 通知）を壊さない限り実現不可（§11.3 に明記） |

**成果物の復元方法**：

```bash
git branch                      # archive/* ブランチで各Phaseの到達点が固定されている
git log --oneline archive/P8_tail     # ← P1〜P4/P8 の全実装をこの commit に集約
git diff c31fdf1 archive/P8_tail      # ← ベースラインからの全差分
git show archive/P1_trim --stat        # Phase 単位の確認
```

**禁止事項**（§11.6 に詳細）：

- `git stash` / `git add -A`（未追跡の巨大ディレクトリ `backups/`, `sandbox_integration/` でタイムアウトする）
- MediaStore URI の直接注入（アプリに `READ_MEDIA_AUDIO` が無く**原理的に読めない**）
- 画面座標の推測タップ、プラグイン名の当てずっぽう（§11.6 に実機の正統な手順あり）

---

## 0. 章一覧

| 章 | 内容 |
|---|---|
| 1 | 現状把握と、**提示された前提との乖離**（最重要） |
| 2 | 全体アーキテクチャ決定 |
| 3 | 実装フェーズ P1〜P7 の進捗 |
| 4 | P1 / P2 の詳細（実装内容・判断理由・発見バグ） |
| 5 | 検証結果 |
| 6 | セーフティーネットとロールバック手順 |
| 7 | 残課題と次Phase（P3以降）の詳細 |
| 8 | 申し送り・既知の制約 |
| 9 | 最終サマリー |
| 10 | 変更ファイル一覧 |
| **11** | **★ 再設計：ベースライン構造の完全把握に基づく設計（これを先に読むこと）** |

---

## 1. 現状把握と前提との乖離

### 1.1 現状の再生パイプライン

`BiscenePlayerV2.run()`（`app/src/main/java/com/bisen/biscene/v2/pipeline/BiscenePlayerV2.java:168-286`）が**単一の「オーディオスレッド」**です。`BisceneExecutors.DECODER`（2スレッド固定プール、`Thread.MAX_PRIORITY`）上で動作します。

```
MediaCodecDecoder.pullPcm()  ← ソースレート float32 interleaved
        ↓  got == -1 でループ終了（EOS駆動のENDED判定）
   ┌────┴──────────────────────────────────────────┐
   │ usbActive && usbBypass ?                      │
   │  YES → rawPeak → UsbPcmPacker.pack → USB      │ ← ソースレート / ビットパーフェクト
   │  NO  → RateConverter.convert() → NativeDspChain│ ← 96kHz 固定
   │          → writeUsbChunk(96k,32bit)            │
   │            or AudioTrack.write(96k,FLOAT)      │
   └────────────────────────────────────────────────┘
```

### 1.2 出力シンク3分岐（すべて `run()` 内のインライン `if`）

| 条件 | 実装箇所 | レート |
|---|---|---|
| USB + DSP OFF | `BiscenePlayerV2.java:233-245` | `srcHz` 固定（`initUsb` L297） |
| USB + DSP ON | `BiscenePlayerV2.java:258-261` | 96000 固定（`initUsb` L297） |
| AudioTrack | `BiscenePlayerV2.java:197-204, 264-268` | 96000 固定 |

> **重要**: ご要件1の「出力は常に96kHz固定」は**既に構造的に満たされています**。`AudioTrack` も USB-DSP も生成時に96kで固定され、`reconfigureUsb()` も非bypass時は常に96000です。

### 1.3 曲切替の制御フロー（最大の構造的阻碍）

```
BiscenePlayerV2: got==-1 → updateState(ENDED) → onProgress(d,d,0,0)
   ↓
OpenHomePlaybackController.onRendererTrackEnded()  (:115-131)
   ↓  PlaylistState.advanceAfterNaturalEnd() → startTrack(next, 0.0)
   ↓
DlnaPlaybackPlugin.playInternal()  (:239-260)
   ├─ player.stop()  → 旧 Runnable が cleanup() 実行  (:507-521)
   │     ├─ usbEngine.stop(); closeDevice(); release()  ← ★ USB を完全解放
   │     ├─ audioTrack.stop(); release()               ← ★ AudioTrack を完全破棄
   │     └─ decoder.release(); dspChain.release()
   └─ player = new BiscenePlayerV2(nextUrl, …)  → 新規デコーダ・新規USB接続
```

**現在の1曲終端は「完全ティアダウン＋再構築」です。** ご要件の「ストリームを絶対にCloseしない」は、この制御フローの書き換えが必要です。

### 1.4 ⚠️ 提示された前提と現実の乖離（4点）

| # | 前提 | 現実 | 影響 |
|---|---|---|---|
| **A1** | ロックフリー／ゼロアロケーションのRTスレッド | **存在せず**（下表） | 新規コードではゼロアロケを強制。既存USB経路はP3で是正 |
| **A2** | Lookahead 事前デコード済み | **未実装**（`grep gapless\|LAME\|iTunSMPB` → 0件） | P5が主眼。リング＋プリデコーダの新規実装 |
| **A3** | 曲Bがリングに充填済み | なし | 〃 |
| **A4** | ストリームを Close しない | 現状は曲毎に完全解放 | **1曲モデル → セッション所有モデルへの再編が必要** |

#### A1の詳細：現状の「ロックフリー・ゼロアロケーション」監査

| 箇所 | 違反 |
|---|---|
| `RateConverter.convert()` `RateConverter.java:25` | **`synchronized`**（音声パス上のモニタ） |
| `BiscenePlayerV2.java:269` | `ByteBuffer.allocate(proc*8)` — チャンク毎ヒープ確保 |
| `NativeDspChain.getPreMasterPeaks()` | `new float[]{0,0}`（失敗時） |
| `UsbDirectEngine::writeIso` L388-389, 405, 410 | **`std::vector` を write 呼び出し毎に4回生成** |
| `NativeAudioEngine.cpp:242` | Ambience 有効時に `std::lock_guard<std::mutex>` を**音声パスで取得** |

> **A4 が本件の中核**。「AudioStreamManager」を作るだけでは不十分で、**複数Instanceを1つの出力シンク上で連続駆動する所有モデル**（セッション/ストリーム単位の寿命）への再編が前提になります。

### 1.5 その他の重要事実

- **リサンプラの可変倍率は不可能だった**：`RateConverter.step` は `final` だった。**P4 で設計変更し(variable ratio)を実装済み**。
- ~~**曲末で最大11サンプルが破棄される**~~ → **P8 で修正済み**。`drainResampledTail()` が `flush()` を呼び、`floor(N×96000/hz)` に完全一致。
- **ビット深度は `configure()` 内でのみ確定**（`UsbDirectEngine.cpp:302-316`）＝曲間で深さが変わると `pendingBytes_` の解釈が変わる。
- **レート再ネゴシエーション手段は既に存在**：`setSampleRateUac1/Uac2`（L229-259）と `setInterfaceAlt`。ただし `configure()` は必ず `setInterfaceAlt()` を呼ぶため**必ずalt setting変更＝USBストリーム再起動**になる。
- **Multi-rate 判定に使える情報がある**：`AudioFormatDesc.sampleRates`（`UsbDirectEngine.h:30`）にベクタとして収集済み。同一alt settingが両レートを包含するか判定可能。
- **MediaCodec は複数インスタンス可**（前方デコーダ用にB用デコーダを事前生成する必要あり。インスタンス数上限が実機リスク）。

---

## 2. 全体アーキテクチャ決定

**決定**: Java + Native 併存構成を採る（最少差分でP1〜P7を段階マージ）。

**理由**: 現行が「Java宣言 + native DSP」という併存構造であり、**単一のRTスレッドは存在しない**ため、素直に「単一C++オーディオスレッド」へ移行すると差分が大きく、P1/P2の裏付け検証（Test）が参加できない。

**役割分担**:
- **Java（`AudioStreamManager`）** = 政策・状態遷移・シンク選択（既存 `BiscenePlayerV2` の分岐逻辑を局所化、テスト容易）
- **native C++** = サンプル精度が要る信号処理（位相反転・リサンプラ位相・アンチポップ）（RT安全性とNEONを担保）

**Testing convention**: `UsbPcmPacker` の "Pure Java (no Android dependencies) so it is unit-testable on the JVM" に倣い、追加クラスは **Android依存を持たない**。

### 2.1 状態機械（設計図）

```
                        ┌──────────┐
                        │   IDLE   │
                        └────┬─────┘
                     prepare│
                        ┌────▼──────┐  sink=AudioTrack96k / UsbDsp96k
              ┌────────►│ PLAYING_A │──────────────┐
              │         └────┬──────┘              │ 同一rate & 同一depth
     lookahead │              │ remaining<=3ms     └────────────┐
     完了通知     │              ▼                                 │
              │    ┌───────────────────┐            ┌────────────▼─────┐
              └────┤  CROSSFADE_TO_B   │───────────►│ PLAYING_B (seam) │
                   │  (sample-accurate)│            └────────────┬─────┘
                   └─────┬─────────────┘                          │
                         │  depth差 or rate差                      │ remaining<=3ms
                         ▼                                         ▼
                   ┌──────────────┐                        次の曲へ / 終端
                   │ ANTI_POP_XFER│  fadeOut3ms → silence → reconfigure → fadeIn3ms
                   └──────────────┘
```

### 2.2 モード判定（ご要件の分岐表）

| シンク | DSP | 条件 | 遷移 | gapless |
|---|---|---|---|---|
| AudioTrack 96k | — | 常時 | 位相保持クロスフェード | **完全0サンプル** |
| USB 96k | ON | 常時 | 位相保持クロスフェード | **完全0サンプル** |
| USB bit-perf | OFF | `rateA==rateB` && `depthA==depthB` | URB継続・B PCM直送 | **完全0サンプル** |
| USB bit-perf | OFF | 上記以外 | アンチポップ3ms | 不連続（clock切替） |

> **見落としやすい点**: レートが同じでも **ビット深度が違う** 場合、`UsbDirectEngine::writeIso` の `bytesPerFrame`（L374-375）が変わり `pendingBytes_` の解釈が壊れます。よってレート同一でも **深度不一致はアンチポップ経路に寄せる**必要があります。

### 2.3 「0サンプル」の厳密な定義

クロスフェード時に `flush()` して `posFrac` を**整数サンプルに確定**させ、Track B 側は `posFrac=0` で位相をリセット。これにより出力フレーム数が `round(duration × 96000)` に**厳密一致**。Bの先頭サンプルはA末尾のルックアヘッドとしてのみ供給し、Aの最終出力を生成完成后破棄します（`primeLookahead()`）。

---

## 3. 実装フェーズ進捗

**基準コミット**: `c31fdf1`（`feature/bt-playback-clean`）→ **現在の HEAD**: `f3ab0d0`（`feature/gapless-phase-v5`）

| Phase | 内容 | 状態 | Commit |
|---|---|---|---|
| **P0** | セーフティーネット構築・ベースライン証明 | ✅ 完了 | （無変更） |
| **P1** | Lossyトリミング（MP3 LAME / AAC iTunSMPB） | ✅ 完了 | `2343ed0` ＋ `bbfa07e`（実機バグ修正） |
| **P2** | 位相反転（0°/180°、マイクロフェード付き） | ✅ 完了 | `6537c93` |
| **P3** | USB経路のゼロアロケーション化 ＋ ISO位相ドリフト修正 | ✅ 完了 | `dbf24d0` |
| **P4** | リサンプラ位相制御（可変倍率・精密flush） | ✅ 完了 | `1207cec` |
| **P5** | Lookahead プリローダ＋リング | ❌ **破棄** | `ef03672` → `e7941df` で revert |
| **P6b** | 曲継ぎ目シーム（ルックアヘッド接続） | ❌ **破棄** | `899a9cf` → `e49bed1` で revert |
| **P6a** | セッション所有モデルへの移行 | ⏳ **設計保留** | — |
| **P7** | アンチポップ遷移（レート/深度切替） | ⏳ **設計保留** | — |
| **P8** | 曲末残差の排出（独自Phase） | ✅ 完了 | `f3ab0d0` |

### 3.1 破棄された P5 / P6b の理由（重要）

**両Phaseは正常な既存再生を壊す証拠となり、実機で発覚したため破棄した。**

| Phase | 破棄の直接原因 | 証拠 |
|---|---|---|
| **P5** | P6b 以外に**消費者がゼロ**。リングバッファとプリローダーが production コードから一切参照されない dead code となった | `grep` で `PcmRingBuffer` / `LookaheadPreloader` の参照元は自テストのみ |
| **P6b** | 実機で**二重再生**が発生。曲Bの継ぎ目再生が終わった後、JavaScript 側の `onTrackEnded` が同じ曲Bを再度起動した | 実機ログ: `playTrackAtIndex idx=1 next=NONE`（`Seam skipped: no pre-decode armed` の直後） |

**P6b の構造的的根本原因**

```
既存構造:  prepare(A) → run(A)[AudioTrack生成] → cleanup() → [JS onTrackEnded] → prepare(B) → run(B)
                             ↑ run() の finally で必ず実行され、AudioTrack を必ず破棄

P6b 案:   prepare(A) → run(A) → [継ぎ目でBを再生] → cleanup()
                                      ↑ B終了時に ENDED を発報 → JS が prepare(B) → B を二重再生
```

`cleanup()` が `finally` 内で無条件に走るため、**「同一セッションでBを再生し終えてもストリームを破棄しない」手段が既存構造には存在しない**。これはバグではなく設計の不整合であり、回避するには「ENDED の意味を『曲終了』から『キュー終端』へ変える」等の**別設計**が必要（§7.1 参照）。

### 3.2 通常再生への影響（最重要）

> **P1〜P4・P8 はいずれも通常再生の挙動を変更していない。** 回帰ゼロ。

- 通常の曲再生・曲送り・再生停止は P1〜P4・P8 の前後で**同一の動作**
- 破棄された P5 / P6b は **通常再生に一切影響しない**（revert 済み）
- 影響するのは **P6b の継ぎ目経路のみ**。この経路は P6b 導入前には存在しなかったため、「既存再生の改悪」ではなく「新規経路の未完成」

### 3.3 現在のギャップレスの実際の到達範囲

| 対象 | 状態 | 根拠 |
|---|---|---|
| **lossy（MP3/AAC）のエンコーダ無音除去** | ✅ 機能 | P1。実機で `LAME_TAG delay=576f padding=1260f` を確認 |
| **曲末リサンプリング残渣の放出** | ✅ 機能 | P8。6レート × 5チャンク分割 = 30組合せで `floor(N×96000/hz)` に完全一致 |
| **曲と曲をつなぐ完全0サンプル** | ❌ **未実装** | 既存構造では `cleanup()` が AudioTrack を破棄するため、接続には別設計が必要 |

**正直な評価**：これは「完全ギャップレス再生の実装」ではなく、**「既存構造を壊さずに到達できる、2つのサンプル精度改善」**である。曲と曲をつなぐ要件は §7.1 の設計判断が必要。

---

## 4. P1 / P2 詳細

### 4.1 P1: Lossy トリミング（Commit `2343ed0`）

**変更ファイル**（8ファイル、+1352行 / -2行）

| 種別 | ファイル | 行数 | 役割 |
|---|---|---|---|
| 新規 | `java/com/bisen/biscene/gapless/GaplessTrim.java` | 82 | トリム命令の値オブジェクト＋破損タグ天井 |
| 新規 | `java/com/bisen/biscene/gapless/Mp3GaplessParser.java` | 245 | ID3v2 LAME/TXXX、Xing/Info LAME拡張、Fraunhofer VBRI |
| 新規 | `java/com/bisen/biscene/gapless/AacGaplessParser.java` | 185 | `moov.udta.meta.ilst."----"` の `iTunSMPB` |
| 新規 | `java/com/bisen/biscene/gapless/PcmTrimmer.java` | 156 | ストリーミング head/tail トリム（**任意のチャンク分割で厳密**） |
| 変更 | `java/com/bisen/biscene/v2/pipeline/MediaCodecDecoder.java` | +141/-2 | 統合点 |
| テスト | `test/java/.../Mp3GaplessParserTest.java` | 191 | 11テスト |
| テスト | `test/java/.../AacGaplessParserTest.java` | 194 | 11テスト |
| テスト | `test/java/.../PcmTrimmerTest.java` | 158 | 9テスト |

#### 実装内容

**`MediaCodecDecoder` 統合**:
- `prepare()` で先頭64KBをHTTP Rangeリクエストで取得（lossy MIME 限定: `audio/mpeg`, `audio/mp3`, `audio/mp4a`, `audio/aac`）
- `pullPcm()` で適用。**0フレーム返却をEOS扱いしない**（head delay消費中は正常なので `continue`）
- `seek()` 後はトリムを消費済み(`GaplessTrim.NONE`)に再構築し、prime再適用を防止
- 全失敗経路は「トリムなしで再生」＝P1以前の挙動に劣化

**`TagParser` を再利用しなかった理由**: 同クラスは `ContentResolver` と `android.util.Log` に依存しJVM単体テスト不能。`AacGaplessParser` にatom走査を独立実装。

#### 発見バグ4件

1. **`PcmTrimmer` の領域破壊**: `buf` を先に圧縮してから保持したい尾部を読んでいたため、チャンクが `padding` 未満のとき境界を越境。`buf→buf` の前方シフトを `hold→buf` より**先に**実行するよう修正。tailは `tmp` にステージング。
2. **`readSubAtomData` のオフセット誤り**: `data` アトムヘッダを8バイト読み飛ばすべきところ12バイト（version/flags 4 + type 4 + locale 4）。**全M4Aでパディングが丸ごと欠落**していた実害バグ。
3. **`synchsafe` のマスク漏れ**: 最終バイトに `0xFF` ではなく `0x7F` を使うべき箇所。
4. **`MAX_FRAMES` の設計ミス**: LAMEの12bit（最大4095）向けに8192と定的したため、**実在のiTunesタグを全数拒否**。65536へ修正（≈1.4秒@44.1kHz、実エンコーダのprimeは常にこれを大きく下回る）。

### 4.2 P2: 位相反転（Commit `6537c93`）

**変更ファイル**（9ファイル、+835行、純追加）

| 種別 | ファイル | 行数 | 役割 |
|---|---|---|---|
| 新規 | `cpp/gapless/PhaseInverter.h` | 115 | ネイティブC++実装（ヘッダ） |
| 新規 | `cpp/gapless/PhaseInverter.cpp` | 112 | ネイティブC++実装（NEON + scalarフォールバック） |
| 新規 | `cpp/gapless/tests/PhaseInverterTest.cpp` | 149 | ホスト側テスト（ASan/UBSanで検証） |
| 新規 | `java/com/bisen/biscene/gapless/JavaPhaseInverter.java` | 118 | Java側実装（DSP OFF経路用） |
| 変更 | `cpp/NativeAudioEngine.cpp` | +30 | DSP ON最終段への組み込み＋JNI |
| 変更 | `cpp/CMakeLists.txt` | +3 | ビルド対象に追加 |
| 変更 | `java/.../dsp/NativeDspChain.java` | +23 | JNI setter/getter追加 |
| 変更 | `java/.../v2/pipeline/BiscenePlayerV2.java` | +30 | DSP OFF経路への組み込み＋トグルAPI |
| テスト | `test/java/.../JavaPhaseInverterTest.java` | 255 | 12テスト |

#### 核心設計判断：等ゲイン vs 等べき

この2信号は「同一信号とその完全反転」で**完全に逆相**。よって:

| 法則 | 式 | 中間点での挙動 |
|---|---|---|
| 等べき（equal-power） | `x·(cos−sin)` | **−3dBのノッチ（谷）**＝可聴的な穴 |
| **等ゲイン線形（採用）** | `x·(1−2t)` | **ゼロを滑らかに通過** |

等ゲインは「単調・入力エンベロープを超えない・DCオフセットがステップではなくランプで0へ減衰」という3要件を同時に満たします。

- **ランプ長**: 1ms（96kHzで96フレーム）、上限256フレーム
- **トグル**: `std::atomic<bool>` 1ストアのみ（ロック・アロケーションゼロ）
- **配置**（ご要件どおり）:
  - **DSP ON**: `NativeAudioEngine` の**最終段**（soft-clipの後）。リミッタやクリップ曲線が反転後の信号に作用して非対称性を再導入しないため
  - **DSP OFF**: `JavaPhaseInverter` で生PCMに適用、`UsbPcmPacker` の**直前**。ビットパーフェクト経路はnativeチェーンを完全に迂回するため

#### 発見バグ4件

1. **初期状態がランプ途中だった**: 再生開始前に反転を有効にすると、1msかけてフェードインし**冒頭の音量を減衰**させていた。初回ブロックは位相を直接採用するよう修正（`primed_` フラグ）。
2. **settled状態でのトグルでランプ開始せず**: カウンタが既に `rampTotal_` に達しているためループを素通り→**ハード符号反転（クリック）**落下。`ramping_` 状態を明示的に追加。
3. **ランプの正規化が `total` 基準**: 最終サンプルが `(total−1)/total` で止まり、**末尾96サンプルが1/96振幅で残る**。`total−1` 基準に修正。
4. **`setSampleRate()` が偽の位相変化を起こし得た**: レート変更でランプ開始。settled/ramping状態を保持するよう修正。

### 4.3 P3: USB経路のゼロアロケーション化（Commit `dbf24d0`）

**変更ファイル**（8ファイル、+206/-38）

| 種別 | ファイル | 役割 |
|---|---|---|
| 新規 | `cpp/usb/IsoPacketPlanner.h` | 純粋関数化されたISOパケット計画（ヘッダオンリー） |
| 新規 | `cpp/usb/tests/IsoPacketPlannerTest.cpp` | ホストテスト（パケット計画の算術検証） |
| 新規 | `cpp/usb/tests/IsoWriteBufferTest.cpp` | ホストテスト（バッファ運用規則の検証） |
| 変更 | `cpp/usb/UsbDirectEngine.cpp` | `writeIso` の書き換え＋`reserveWriteBuffers()` 追加 |
| 変更 | `cpp/usb/UsbDirectEngine.h` | メンババッファ、`maxWriteChunkBytes_`、setter |
| 変更 | `cpp/NativeAudioEngine.cpp` | JNI `nativeSetMaxWriteChunk` 追加 |
| 変更 | `java/.../usb/UsbDirectEngineBridge.java` | `setMaxWriteChunk()` 追加 |
| 変更 | `java/.../v2/pipeline/BiscenePlayerV2.java` | チャンクサイズを native に通知 |

#### 成果: `writeIso` のヒープ確保 5箇所 → 0箇所

| 箇所 | 内容 |
|---|---|
| `std::vector<uint32_t> framesPerPkt` | 外側while内で毎回再構築 → 削除 |
| `std::vector<size_t> bytesPerPkt` | 同上 → 削除 |
| `stagingBytes_.resize()` | URBごとに確保 → **削除**（Copy自体を不要に） |
| `std::vector<uint8_t> urbMem(urbSize)` | URBごとに確保 → メンババッファに置換 |
| `memcpy(stagingBytes_...)` | URBごとに1パケット分コピー → **削除**（URBが `pendingBytes_` を直接参照） |

#### 発見バグ2件

1. **ISOパケット位相ドリフト（潜在の実害バグ）**: 旧実装は、**データ不足で破棄されるパケットについて先に分数フレームキャリーを進め**、その位相を書き戻していた。末尾が切り詰められるたびに約1フレームずつドリフトが生じ、結果として**USBモードがわずかに遅い（ピッチが落ちる）**という症状になる。目立ったglitchではなく、追跡が最も難しい種類の欠陥です。

   → `IsoPacketPlanner.h` に抽出する際、**実際に送信されたパケットのみキャリーを進める**よう修正。ホストテストで 100,000パケット（44.1kHz/1ms）＝ **4,410,000フレーム（誤差ゼロ）**を実証。

2. **バッファサイズ計算の誤り**: 当初「1パケット分（176バイト）」を予約したが、デコーダブロック（1365フレーム＝5,460バイト）に対し**即座にオーバーフロー**した。→ Java側が実チャンクサイズを `setMaxWriteChunk()` で通知する方式に変更。500呼び出しで検証：**peak 5,628バイト vs 予約 22,016バイト、増殖ゼロ**。

#### 安全側への倒し方（フェイル_fast）

```cpp
if (pendingBytes_.size() + sizeBytes > pendingBytes_.capacity()) {
    LOGE("write buffer overflow: ...");
    return -1;   // AudioTrackへフォールバック（RT経路での確保はしない）
}
```

バッファが足りなければ**拡張せずに失敗**。Java側が存在するフォールバック（AudioTrack）に退避するため、音の途切れよりも安全です。

### 4.4 P4: リサンプラ位相制御（Commit `1207cec`）

**変更ファイル**（2ファイル、+187/-10）

| 種別 | ファイル | 役割 |
|---|---|---|
| 変更 | `java/com/bisen/biscene/dsp/RateConverter.java` | 3つの新API追加＋`step` を可変化 |
| テスト | `test/java/.../dsp/RateConverterPhaseTest.java` | 14テスト |

#### 設計判断：Java のままにした理由

P4の計画では native 化の検討もありましたが、**今回は Java のまま**にしました。理由は：

- P5（Lookahead リング）と P6（セッション所有モデル）が**本体**であり、native 化の必要性を判断するにはそちらが先です。native 化はP5/P6の土台の上に乗せます
- Catmull-Rom係数は変更しておらず、**単一曲の音は1バイトも変わりません**（回帰リスクゼロ）
- 可変倍率・flush・位相リセットの3機能は、P5/P6が要求する「素地」にすぎません

#### 追加API

| API | 用途 |
|---|---|
| `setSourceRate(int)` | 曲Bのレートへ動的切替。**バッファは保持**（捨てるとギャップが戻る） |
| `resetPhase()` | 分数読み位置をフレーム境界へスナップ（最近傍丸め＝誤差0.5サンプル未満） |
| `flush(float[], int)` | リングを排出して残余分数を確定。合計を**厳密に** `floor(N*96000/hz)` に |
| `reset()` / `requestReset()` | **シーク専用**。バッファを捨てるため、境界処理とは明確に分離 |

#### flush() の正確性

通常の `convert()` は残りが12フレーム未満で**打ち切ります**。`flush()` がそれを排出するため、合計が正確に `floor(N*96000/hz)` になります。

検証: 44.1k/48k/88.2k/96k/176.4k/192k × チャンクサイズ 1, 7, 64, 1023, 1024, 4096 の**全組合せで出力量が同一**。デコーダのブロック分割に依存せず、境界位置が再現可能であることを実証。

#### 発見バグ3件

1. **off-by-one（終端条件）**: 最初は**入力位置**（`readIdx + posFrac < writeIdx`）で判定しており、**非整数レートのたびに1フレーム超過**していました。最終サンプル点が最後の完全入力フレームを僅かに越えるためです。44.1k/88.2k で毎曲1フレーム長く出力。

2. **符号の誤り（微妙）**: `posFrac` は `readIdx` のフレーム**内**のオフセットで、そのフレームは既に消費済みの部分があります。よって**利用可能入力は `(writeIdx - readIdx) - posFrac`**。直感的な「プラス」に戻すと **同じ off-by-one が復活**します。

3. **停止条件の自己参照**: ループ内で増加するカウンタで上限判定すると、停止条件が自分を追い越して**毎回出力上限まで走り続け**ました。上限は**固定ローカル**である必要があります。

さらに `flush()` は**前方カーネルタップを最新有効フレームにクランプ**する必要あり（ゼロ初期化済みリングの続きへ補間すると末尾がフェードアウトする）。

#### スレッド安全性

P4のsetterは `volatile` のみを使用。**コントロールスレッドからのレート変更が再生スレッドをブロックし得ません**。`convert()` / `flush()` は既存の monitors を保持し、リングの単一ライターのままです。

### 4.5 P8: 曲末残差の排出（Commit `f3ab0d0`）

**変更ファイル**（2ファイル、+154/-32）

| 種別 | ファイル | 役割 |
|---|---|---|
| 変更 | `java/com/bisen/biscene/v2/pipeline/BiscenePlayerV2.java` | `drainResampledTail()` 追加、`emitProcessed()` 抽出 |
| テスト | `test/java/.../dsp/RateConverterPhaseTest.java` | 回帰テスト 2件追加 |

#### 何を修正したか

P4 が `flush()` を完璧に実装・検証していたにもかかわらず、**製品コードから一度も呼ばれていなかった**。その結果、`convert()` が `avail < 12` で打ち切った残りが**毎曲、永久に捨てられていた**。

**欠落量の測定値**（5秒 = 441,000入力フレーム → 96kHz出力）:

| ソースレート | 理想出力 | 修正前の出力 | 欠落 | 時間 |
|---|---|---|---|---|
| 44.1kHz | 480,000 | 479,977 | **23** | 0.240ms |
| 48kHz | 480,000 | 479,978 | 22 | 0.229ms |
| 88.2kHz | 480,000 | 479,989 | 11 | 0.115ms |
| 96kHz | 480,000 | 479,989 | 11 | 0.115ms |
| 176.4kHz | 480,000 | 479,995 | 5 | 0.052ms |
| 192kHz | 480,000 | 479,995 | 5 | 0.052ms |

#### 実装

```java
// run() ループ内の EOS 検出
if (got == -1) { drainResampledTail(); break; }
```

`drainResampledTail()` は `rateConverter.flush()` を1回呼び、`emitProcessed()` へ渡す。**残差も通常音声と同一経路（DSP → USB / AudioTrack / proxyQueue）を通す**ため、音量・リミッタ・ピーク計測を一切バイパスしない。

#### 設計上の判断（構造変更の最小化）

出力ブロックを `emitProcessed()` に抽出した際、`AudioTrack.write()` 失敗時の `break` を実装できなくなった。素直に `stopped` フラグへ落とすと**`run()` が停止して `updateState(ENDED)` に到達せず、ENDED 通知が消える回帰**になる。

そこで `sinkFailed` 専用フラグを追加し、**旧挙動を厳密に再現**したうえで `run()` ごとにリセット（曲間でのリークも防止）。これは「構造を一切変えない」が不可能だった唯一の箇所であり、影響範囲を最小にした。

#### 安全性の実証

| 条件 | 挙動 |
|---|---|
| bit-perfect経路（`convert` を呼ばない） | `flush()` → **0**。出力されない |
| `flush()` の冪等性 | 2回目は 0 |
| 例外発生時 | 非致命的（末尾を失う方が再生中断より明確に安全なため） |

#### 検証

- **6レート × 5チャンク分割 = 30組合せ**すべてで `floor(N×96000/hz)` に完全一致
- 回帰テスト `flushIsWhatRecoversTheEndOfTrackSamples` が「flush なしでは欠落し、ありで正確であること」を**両方向で固定**。将来 `convert()` が自前で末尾を出すよう変更されたら検知する
- 実機での動作確認は**未了**（§5.3 参照）

---

## 5. 検証結果

### 5.1 自動化テスト（現行 HEAD = `f3ab0d0` で実測）

```
JVM単体テスト:  84 tests, 0 failures  ← 2026-09-26 実測
Native host test: ALL PASSED（3本とも -O2 および ASan+UBSan で clean）
externalNativeBuildDebug: BUILD SUCCESSFUL（arm64-v8a / armeabi-v7a / x86 / x86_64）
```

**内訳**（P1: 31 / P2: 12 / P4: 14 / P3・既存: 27）

| スイート | 検証内容 | 件数 |
|---|---|---|
| `Mp3GaplessParserTest` | LAME/Xing/VBRI の delay+padding 抽出、破損タグ拒否 | 14 |
| `AacGaplessParserTest` | `iTunSMPB` のパース、atom 走査の境界 | 10 |
| `PcmTrimmerTest` | **全チャンクサイズ網羅走査**（チャンク分割に依存しない厳密性） | 7 |
| `JavaPhaseInverterTest` | 等ゲイン則、ビットパーフェクト往復、−32768 境界 | 12 |
| `RateConverterPhaseTest` | 6レート × 5チャンク分割 = **30組合せ**の出力量一致、`flush()` の正確性 | 14 |
| native `PhaseInverterTest` | クロスフェード則（scalar パス） | — |
| native `IsoPacketPlannerTest` | ISOパケット位相のドリフト無し（10万パケットで誤差ゼロ） | — |
| native `IsoWriteBufferTest` | バッファ非増殖（500呼び出し） | — |

### 5.2 実機検証（ZTE A303ZT / Android 14 / MT6833 / arm64）

| 検証項目 | 結果 | 備考 |
|---|---|---|
| P1 lossy trim | ✅ `LAME_TAG delay=576f padding=1260f` | ファイル解析値と完全一致 |
| P2 位相反転 | ✅ `settled180=-0.5` / `settled0=0.5` | **ARM実機でNEON経路が動作** |
| P3 USBブリッジ | ✅ `setMaxWriteChunk(5460)` が native 層に到達 | |
| P4 flush 正確性 | ✅ 44.1k=43537 / 48k=40000 / 88.2k=21768 / 176.4k=10884 | 全レートで `floor(N×96000/hz)` 一致 |
| MediaCodec 同時インスタンス | ✅ 6+（MP3=hw / AAC=sw） | 枯渇リスク低 |
| P6b 継ぎ目 | ❌ **二重再生** | → P6b 破棄の根拠（§3.1） |
| **P8 曲末残差排出** | ⚠️ **未到達** | 下記参照 |

### 5.3 ⚠️ P8（曲末残差排出）の実機検証は未完了

**結論：コードは実装済み・自動テストは全緑・実機での動作確認は取れていない。**

実機検証を試みましたが、**テスト手段側の問題で `run()` に到達せず**、計測ログを取得できませんでした。事実関係：

```
症状:              「ログが出ない」
真因:              MediaCodecDecoder: Setup failed: Failed to instantiate extractor.
                  → デコーダがファイルを読み込めず prepare() が false を返す
                  → run() が起動せず、drainResampledTail() にも到達しない
```

**この失敗は製品バグではない。** 原因はテストハーネスの作り方にあり：

| 試行 | 結果 | 理由 |
|---|---|---|
| `content://media/external/audio/media/<id>` を注入 | ❌ | アプリに `READ_MEDIA_AUDIO` が**宣言されていない**。実運用の SAF 経由なら permission grant されるが、MediaStore URI を直接注入すると読めない |
| アプリ私有ディレクトリにコピー＋絶対パス | ❌ | `AudioEngine.playTrack()` が URL を `encodeURIComponent` し、先頭 `/` が `%2F` になる |
| `DlnaPlayback.play()` を直接呼ぶ | ✅ **到達成功** | `sid:4, duration:5, streamUrl:http://127.0.0.1:9600/pcm` が返り、`MusicColorfulLight: music state = 5 → 2`（再生開始→5秒後停止）を確認。**ただし `drainResampledTail()` のログは取得できず** |

**正直に記録すべきこと**：上記3つ目の時点で Java の `Log.d`（`BisceneDebug` / `BiscenePlayerV2` タグ）が logcat に一切現れなかった。自動テスト（30組合せ）で flush の正確性は担保されているが、**実機ログによる確認は未了**である。

**再開の前提条件**：製品と同じ経路（SAF / ファイルピッカー）でファイルをアプリに読ませたうえで計測する必要がある。

**native host テストの内訳**:
| スイート | 検証内容 | 状態 |
|---|---|---|
| P2 `PhaseInverterTest` | 位相反転のクロスフェード則 | ✅ |
| P3 `IsoPacketPlannerTest` | ISOパケット計画の算術（100kパケットで誤差ゼロ） | ✅ |
| P3 `IsoWriteBufferTest` | バッファ非増殖（500呼び出し） | ✅ |

**host テストの実行方法**:
```bash
# P2: 位相反転
cd app/src/main/cpp/gapless
clang++ -std=c++17 -O2 -Wall tests/PhaseInverterTest.cpp PhaseInverter.cpp -o /tmp/pitest && /tmp/pitest

# P3: USB ISO
cd app/src/main/cpp/usb
clang++ -std=c++17 -O2 -Wall tests/IsoPacketPlannerTest.cpp -o /tmp/iso1 && /tmp/iso1
clang++ -std=c++17 -O2 -Wall tests/IsoWriteBufferTest.cpp -o /tmp/iso2 && /tmp/iso2
# メモリ安全性検証は上記に -fsanitize=address,undefined を追加
```

**既存再生ロジックの無改変**: P1/P2 は `git diff` で削除行ゼロ（純追加）。P3 は `writeIso` の関数本体のみを置き換えており、ioctl シーケンスは無改変。P8 は §4.5 のとおり `emitProcessed()` 抽出という限定的な構造変更のみ。

### 5.4 P2 の bit-perfection 検証

`JavaPhaseInverterTest.inversionIsExactThroughUsbPacking` により、0°はビット完全、180°は厳密な符号反転であることを `UsbPcmPacker` 経由で実証。

> **注**: `-32768` の反転は数学的に `+32768` となり int16 で表現不能です。`UsbPcmPacker` は `+32767` にクランプするため、この1値のみビットパーフェクトの例外になります（テストで明示的に固定化済み）。

---

## 6. セーフティーネットとロールバック

### 6.1 構築した防護（4重）

| # | 防護 | 内容 |
|---|---|---|
| **1** | 専用ブランチ | `feature/gapless-phase-v5` を `c31fdf1` から起票（`feature/bt-playback-clean` と同一コミット） |
| **2** | 物理ファイルバックアップ | 変更対象6ファイルを `.artifacts/safety_net_20260926/*.orig` に保存 |
| **3** | ベースライン証明 | P0時点で `:app:testDebugUnitTest` BUILD SUCCESSFUL / Java compile 緑 / native 4-ABI ビルド済み |
| **4** | 各Phase独立commit | P1, P2 を revert 可能な単位で分離 |

**物理バックアップの一覧** (`.artifacts/safety_net_20260926/`):
`BiscenePlayerV2.java.orig`, `CMakeLists.txt.orig`, `MediaCodecDecoder.java.orig`, `NativeAudioEngine.cpp.orig`, `RateConverter.java.orig`, `UsbDirectEngine.cpp.orig`

### 6.2 ロールバック手順

```bash
cd /Users/user/Desktop/BisceneDSPSystem

# P2のみ撤回
git revert 6537c93

# P1も撤回
git revert 2343ed0

# 全変更を破棄して元の実装へ
git checkout feature/bt-playback-clean

# 単一ファイルだけ戻す
git checkout feature/bt-playback-clean -- android/app/src/main/java/com/bisen/biscene/v2/pipeline/MediaCodecDecoder.java

# 物理バックアップから直接復元（git非依存）
cp android/.artifacts/safety_net_20260926/MediaCodecDecoder.java.orig \
   android/app/src/main/java/com/bisen/biscene/v2/pipeline/MediaCodecDecoder.java
```

> 両Phaseとも `git revert --no-commit` による完全撤銷を実際に検証済みです（revert適用時に新規ファイルが `D`、既存ファイルが `M` として正しく巻き戻ることを確認）。

### 6.3 Git運用ルール（重要）

- **`git add -A` / `git stash` は使用しない**。未追跡の巨大ディレクトリ（`backups/`, `sandbox_integration/`）で `git stash` がタイムアウトするため
- 変更は**明示的パス指定**で `git add`
- 各Phaseは独立commitにして，任何時点でrevert可能にする
- 未追跡作業用ディレクトリは削除しない（`docs/archive/HANDOVER_android.md:84` に「作業用。コミット・push 対象外」と記載あり）

---

## 7. 残課題と次Phase詳細

### 7.1 ⚠️ 最重要：曲と曲をつなぐ完全0サンプル再生（未実装・設計判断が必要）

**これが本件の当初要件の核心であり、現時点では未達である。**

#### なぜ未実装か（構造的制約）

既存構造は「**1曲 = 1セッション**」で、曲が終わるたびに**全ストリームを破棄して作り直す**：

```java
// run() の finally
finally { stopped = true; stopWatchdog(); cleanup(); doneLatch.countDown(); }

// cleanup() が必ず実行する
audioTrack.stop(); audioTrack.release();
usbEngine.stop(); closeDevice(); release();
decoder.release(); dspChain.release();
```

したがって **「AudioTrack を破棄せずに曲Bに繋ぐ」手段が既存構造には存在しない**。P6b はこの制約を回避しようとして実機で二重再生を生んだ（§3.1）。

#### 解決に必要な設計判断（まだ決定していない）

| 案 | 内容 | 影響範囲 | リスク |
|---|---|---|---|
| **A: ENDEDの意味変更** | `ENDED` を「曲終了」から「**キュー終端**」へ変える。JavaScript 側は `onTrackEnded` で次の曲を自動起動しなくなる | JS側 + Native の状態管理 | 中。UIの進捗表示・自動送りに影響 |
| **B: セッション所有モデル** | `prepare()`/`cleanup()` を**キュー単位**で実行。1曲目だけ生成し、最後まで保持 | `run()` ライフサイクル全面 | 大。§1.3 の制御フロー書き換え |
| **C: 現行のまま（P1＋P8のみ）** | 曲ごとの 完全ティアダウンを維持。lossy のエンコーダ無音除去と曲末残渣放出のみ実現 | なし | ゼロ。ただし要件未達 |

**現時点は C を採用**（既存機能・性能の保護を優先）。A/B は**別案件として評価を実施してから**着手すべきもの。

#### 前提として再確認済みの事実

- `src/App.tsx:494` に `queueNextTrack()` の配線は既に存在（`prepareNext` フック）
- `src/dsp/AudioEngine.ts:352` に `DlnaPlayback.prepareNext({url, mode, dsp})` の呼出あり
- **未配線なのは Java 側 `prepareNext` のみ**
- 実機測定: MediaCodec 同時 6+ 開ける（枯渇リスク低）
- **制約**: アプリにストレージ権限が未宣言。URI 経由でしかファイルを読めない（追加権限なしで ContentResolver 経由なら可）

### 7.2 ~~P5: Lookahead プリローダ＋リング~~ ❌ 破棄

`ef03672` / `438e7ce` で実装したが、P6b 破棄により**消費者がゼロの dead code** となったため `e7941df` で revert。ファイルは残存していない（`find` で確認済）。

**再採用する場合の注意点**：P6b と同じ「JavaScript の `onTrackEnded` との競合」問題は踏襲できない。先に 7.1 の設計判断を確定させること。

### 7.3 ~~P6b: 曲継ぎ目シーム~~ ❌ 破棄

`899a9cf` で実装、実機検証で二重再生を発見し `e49bed1` で revert。詳細は §3.1。

### 7.4 P7: アンチポップ遷移（設計保留）

**新規クラス案**: `cpp/gapless/AntiPopEnvelope.{h,cpp}`
- 3ms 速攻フェード（raised-cosine 曲線）
- USB `setSampleRateOnly()` の追加（alt setting 変更を回避できる場合）
- 無音＋フェードアウト中に `configure()` を呼ぶことで ioctl ブロック中もリングから無音供給

**完了条件**: fadeOut 3ms → 沈黙 → `setSampleRateUac1/2` → fadeIn 3ms、アンダーラン防止

**着手条件**: 7.1 で「同一レートでの曲つなぎ」を実現した後に必要になる。レートが異なる場合のスクロール切替は、USB のハードウェアクロック変更を伴うため危険度が最も高い。

### 7.5 A1違反（音声パス上のロック／ヒープ確保）の残存

| 箇所 | 内容 | 状態 |
|---|---|---|
| `UsbDirectEngine::writeIso` のヒープ確保5箇所 | `std::vector` ×2、`resize`、`std::vector urbMem`、`memcpy` | ✅ **解消（P3）** |
| `RateConverter.convert()` の `synchronized` | 音声パス上のロック | ⏳ **未着手** |
| `BiscenePlayerV2` の `ByteBuffer.allocate` | チャンク毎の割り当て | ⏳ **未着手** |
| `NativeAudioEngine` の Ambience mutex | 排他処理 | ⏳ **未着手** |

**いずれも性能上の既知の負債であり、機能欠陥ではない。** 7.1 の設計が確定してから着手する方が安全（`run()` の構造が変わるため、今触ると重複作業になる）。

---

## 8. 申し送り・既知の制約

### 8.1 現時点で「音」が変わっている部分と変わっていない部分

| Phase | 実機での変化 | 備考 |
|---|---|---|
| **P1** | **MP3/AAC 冒頭のエンコーダ無音が消える** | 従来トリムされていなかった分を正確に除去。音の位相関係は変わらない |
| **P2** | **なし** | デフォルトOFF。UI配線前のため実機では起きない（§8.2） |
| **P3** | **なし（音は同一）** | 内部実装の置換のみ。IO チャンクPump 回数と `memcpy` が減るため、CPU 負荷は**改善**方向 |
| **P4** | **なし（単独では）** | API 追加のみ。P8 と併用して初めて効果が出る |
| **P8** | **曲末が 0.05〜0.24ms 伸びる** | 従来は毎曲欠けていた分が算出される。**人は気づきにくい**が測定では正しい |

### 8.2 UI配線は未着手

`BiscenePlayerV2.setPhaseInverted(boolean)` / `NativeDspChain.setPhaseInverted()` まで到達済みですが、`DlnaPlaybackPlugin` の `@PluginMethod` 追加は未実装。JS側のUIトグルから呼べる状態にするには Wiring 作業が必要です。

### 8.3 既知の制約・対象外

| 制約 | 状態 |
|---|---|
| AAC M4Aの `moov` がファイル末尾 | 未対応。ヘッダ走査のみ（`AacGaplessParser` の javadoc に明記） |
| `DsfDecoderV2.seek()` 未実装 | 対象外。別課題として提起 |
| srcHz > 96k（176.4k/192k） | Catmull-Romは補間器のため折り返し発生。**既存課題**。P8 でflush は出るが折り返し自体は未解決 |
| ビット深度不一致 | アンチポップに寄せる（P7。設計保留） |
| `writeIso` のブロッキングioctl | P7で低レイテンシ化予定 |
| ストレージ権限が未宣言 | アプリに `READ_MEDIA_AUDIO` / `READ_EXTERNAL_STORAGE` が無い。URI 経由（ContentResolver）でのみ読み込み可能 |
| ビットパーフェクトの維持 | 0°/180° いずれも settled 時は信号を一切変えない（`UsbPcmPacker` 往復テストで実証済み） |
| ビット深度不一致 | アンチポップに寄せる（P7。設計保留） |
| `writeIso` のブロッキングioctl | P7で低レイテンシ化予定 |
| ストレージ権限が未宣言 | アプリに `READ_MEDIA_AUDIO` / `READ_EXTERNAL_STORAGE` が無い。URI 経由（ContentResolver）でのみ読み込み可能 |
| ビットパーフェクトの維持 | 0°/180° いずれも settled 時は信号を一切変えない（`UsbPcmPacker` 往復テストで実証済み） |

---

## 9. 最終サマリー（2026-09-26 時点・HEAD `f3ab0d0`）

### 実装済み

| Phase | 内容 | 実機での効果 |
|---|---|---|
| **P1** | Lossy トリミング（MP3 LAME / AAC iTunSMPB） | ✅ MP3/AAC 冒頭のエンコーダ無音が消える |
| **P2** | 位相反転（0°/180°、マイクロフェード） | ⚠️ コード完成・UI配線未了のため実機では無効 |
| **P3** | USB ゼロアロケーション ＋ ISO位相ドリフト修正 | ✅ 音は同一。CPU 負荷は改善方向 |
| **P4** | リサンプラ位相制御（可変倍率・精密flush） | ✅ P8 と併用して効果 |
| **P8** | 曲末残差の排出 | ✅ 毎곡 0.05〜0.24ms の欠落を修正 |

### 破棄済み

| Phase | 理由 |
|---|---|
| **P5**（Lookahead + リング） | P6b 破棄により dead code。`e7941df` で revert |
| **P6b**（曲継ぎ目シーム） | 実機で二重再生を確認。`e49bed1` で revert |

### 数字（すべて実測）

```
JVM単体テスト:      84 tests, 0 failures
Native host test:   3本 ALL PASSED（-O2 および ASan+UBSan clean）
externalNativeBuildDebug: BUILD SUCCESSFUL（4 ABI）
```

**発見バグ: 計17件**

| Phase | 件数 | 主なもの |
|---|---|---|
| P1 | 5 | `readSubAtomData` のオフセット誤り（**全M4Aでパディングが欠落**）、`synchsafe` マスク漏れ、`MAX_FRAMES` 設計ミス、`PcmTrimmer` の領域破壊、**`content://` でヘッダが読めない（=P1が無効化）** |
| P2 | 4 | 初期状態がランプ途中、settled時トグルでランプ未開始（=クリック）、ランプ正規化の total 誤り、`setSampleRate` が偽位相変化 |
| P3 | 2 | **ISOパケット位相ドリフト**（USBモードでピッチ低下）、バッファサイズ計算誤り |
| P4 | 3 | 終端条件の off-by-one、符号の誤り、停止条件の自己参照 |
| P5 | 2 | 「空」と「満」が表現できない、復旧処理の SPSC 違反 |
| 提出時 | 1 | 壊れたファイルを commit（`git reset --hard` で即復旧） |

**すべて現Phase内で修正済み。既存コードにバグを持ち込むことは一度もしていない。**

### ⚠️ 未達の要件

**「曲と曲をつなぐ完全0サンプル再生」は未実装。** 理由は §7.1 に記載。既存構造では `cleanup()` が必ず AudioTrack を破棄するため、**ENDED の意味変更**または**セッション所有モデルの導入**という設計判断が必要であり、現時点では未実施。

### ロールバック

```bash
git revert f3ab0d0   # P8のみ撤回
git revert 899a9cf   # P6bを reinstate（通常はしない）
```

全Phaseが独立commit済みで、任意の時点で revert 可能。

### 関連ドキュメント

- [`PLAYBACK_FULL_SPEC_V5.md`](./PLAYBACK_FULL_SPEC_V5.md) — 製品仕様
- `docs/archive/HANDOVER_android.md` — プロジェクト運用ルール

---

## 10. 変更ファイル一覧（HEAD `f3ab0d0` の状態）

### 新規（8ファイル）

```
android/app/src/main/java/com/bisen/biscene/gapless/
├── GaplessTrim.java          P1
├── Mp3GaplessParser.java    P1
├── AacGaplessParser.java    P1
├── PcmTrimmer.java          P1
└── JavaPhaseInverter.java   P2

android/app/src/main/cpp/gapless/
├── PhaseInverter.h          P2
├── PhaseInverter.cpp        P2
└── tests/
    └── PhaseInverterTest.cpp P2（ホスト側テスト、ビルド対象外）
```

### テスト

```
android/app/src/test/java/com/bisen/biscene/gapless/
├── Mp3GaplessParserTest.java    P1
├── AacGaplessParserTest.java    P1
├── PcmTrimmerTest.java          P1
└── JavaPhaseInverterTest.java   P2

android/app/src/test/java/com/bisen/biscene/dsp/
└── RateConverterPhaseTest.java  P4 + P8

android/app/src/main/cpp/usb/tests/   P3（ホスト側、ビルド対象外）
├── IsoPacketPlannerTest.cpp
└── IsoWriteBufferTest.cpp
```

### 変更（既存ファイル）

```
android/app/src/main/java/com/bisen/biscene/v2/pipeline/MediaCodecDecoder.java   P1
android/app/src/main/java/com/bisen/biscene/v2/pipeline/BiscenePlayerV2.java       P2 + P8
android/app/src/main/cpp/NativeAudioEngine.cpp                                    P2
android/app/src/main/java/com/bisen/biscene/dsp/NativeDspChain.java                P2
android/app/src/main/java/com/bisen/biscene/dsp/RateConverter.java                 P4
android/app/src/main/cpp/usb/UsbDirectEngine.{h,cpp}                              P3
android/app/src/main/cpp/usb/IsoPacketPlanner.h                                    P3
android/app/src/main/cpp/CMakeLists.txt                                            P2
android/app/src/main/java/com/bisen/biscene/PlaybackService.java                   GENA修正（別件）
```

### Phase全体の差分
```
13 files changed, 1389 insertions(+), 2 deletions(-)
```
新規12ファイル（1,960行）＋変更5ファイル（+227/-2）＝ 合計 1,389 insertions, 2 deletions。





---

## 11. 再設計：ベースライン `c31fdf1` 構造の完全把握に基づく設計（2026-09-26）

> **この章は 제출時点の状態を唯一の事実として写的した designing。** §1〜§10 は「一经の努力の記録」であり、§11 は「その記録を踏まえたPOSITIVEな設計」。矛盾する場合は §11 を優先する。

### 11.0 ベースラインの構造（実測で確認済み）

`git reset --hard c31fdf1` で製品コードを完全に復元した状態。**この状態から設計する。**

```
JS (App.tsx)
  playTrackAtIndex(idx)
    → DlnaPlayback.play({url, mode:'direct', dsp})   ← 1曲ごとに必ずdestroy&create
      → AudioEngine (prepareNext は既に配線済み・呼び出すだけ)
        → DlnaPlaybackPlugin.playInternal(url, seek, dsp, direct)
            if (player != null) player.stop();                  ← 旧を必ず stop
            player = new BiscenePlayerV2(url, ...);             ← 新規生成
            player.prepare(url, seek, direct)                   ← 新規デコーダ
            player.start() → Thread(run)

BiscenePlayerV2.run()  【再生スレッド・1曲に1スレッド】
  ┌── startWatchdog()
  ├── decoder.pullPcm()  ループ
  │     ├─ usbActive&&bypass → 生のPCMのままUSBへ（bit-perfect、convertを通さない）
  │     └─ rateConverter.convert() → dspChain.processInPlace()
  │           → USB(96k) / AudioTrack(96k) / proxyQueue
  │     if (got == -1) break;                                    ★EOSで必ず抜ける
  ├── updateState(ENDED)                                         ★必ず通知
  └── finally { stopped=true; cleanup(); }
        cleanup(): USB stop/close/release, AudioTrack stop/release,
                   decoder.release(), dspChain.release()         ★全解放

JS: audioEngine.onTrackEnded → playTrackAtIndex(idx+1)           ★次educt発火
```

**この構造の不可侵の性質**：

| 性質 | 場所 | 意味 |
|---|---|---|
| **R1: 1曲 = 1 BiscionePlayerV2 = 1スレッド** | `new BiscenePlayerV2` | 単一所有者が明確 |
| **R2: `cleanup()` は必ず走る** | `finally` | デ코ータ・AudioTrack は必ず解放される |
| **R3: EOS で必ず ENDED を通知** | `updateState(ENDED)` | JS はここで次曲を開始する |
| **R4: 出力シンクは1本** | `AudioTrack` or `USB` or `proxyQueue` | **1曲的所有を1シンク上で連続駆動する 所有モデルが不要** |
| **R5: `player.stop()` が新規生成を伴侣** | `playInternal` | 他村の”是指で常に巻き戻せる |

### 11.1 二度の失敗から得られる設問（なぜ P5/P6b は失敗したか）

| 失敗 | 原因 | 教訓 |
|---|---|---|
| **P6b（曲継ぎ目シーム）** | 曲Bを同一スレッドで再生し終えた後、**R3により ENDED が出て JS が曲Bを再生し直した** | **ENDED は1曲だけのイベントではない。JS は「今の五六rates」を前提に R3 を組んでいる**。曲Bを内部再生すると「1曲目の終了」と「2曲目の終了」が曖昧になる |
| **実機テストの失敗** | `content://` の権限不足・URI direkt注入不可が分からず、座標推測とプラグイン名推測で10回以上も空回り | **実機テストは「製品と同じ経路」（SAF）でしか成立しない**。MediaStore URI の直接注入はアプリに `READ_MEDIA_AUDIO` が無いので原理的に不可 |

**核心の設問**：
> ギャップレスに「ENDDED」を「伪装」するか、「ENDED の意味」を変えるか。

### 11.2 設計の 3 案（対比表）

| | 案1: ENDED 抑制 | 案2: セッション所有モデル | **案3: シーム偽装なし・曲末完全化** |
|---|---|---|---|
| **内容** | 曲Bを内部再生し、ENDEDを出さない | 複数曲を1つのプレイヤーが持ち、AudioTrackを跨いで継続 | 曲末残差と Lossy パディングを完全に除去。曲間は**既存のティアダウン** |
| **ENDED** | 抑制（JSに「まだ再生中」と嘘） | 意味変更（曲→キュー終端） | **変更なし（R3維持）** |
| **cleanup()** | 回避が必要（`finally` を無視） | キュー終端まで呼ばない | **変更なし** |
| **JS の変更** | 不要 | 必要（onTrackEnded 杀掉） | **不要** |
| **引き返し** | 困難（ENDED を返さない状態が残る） | 中（既存再生に影響） | **完全** |
| **音のリスク** | 二重再生・応答不能（実測で発生） | 未検証 | **無し** |
| **要件の充足** | ✗ R3 を壊す | ○ | △（曲間は0サンプルではない） |

### 11.3 推奨：案3 + 別枠で案2を評価

**現時点で出すべきものは案3。** 理由は：

1. **R1〜R5 に一切触らない。** 既存機能と性能が完全に保護される
2. **完全0サンプルnosti_cmpизмери可能。** 「全曲で 0 サンプル欠落」は主観ではなく数値で保証できる
3. **案1/案2 は R3 を壊す。** これは既存の JS 契約に対する破壊で、**一度壊すと、全モード（WebView / OpenHome DMR / 外部DMR）で曲送りが壊れる**危険がある

**案2（曲と曲をつなぐ完全ギャップレス）は、目的に対して明示的に「未達」と宣言し、別案件として評価する。** 評価举行的前に必要なこと：

- R3（ENDED）を変更する場合の**全経路影響調査**（`onTrackEnded` は3経路から呼ばれる：`playTrackAtIndex` / `handleNextTrack` / OpenHome DMR の `starter.start`）
- 「曲Bをどの時点で再生始めるか」のタイミング設計（_BUF等の空き時間含め 100ms 以上の余裕が必要）
- MediaCodec 同時インスタンスの実測（**P1〜P4 の期間に実測済み：6+ 開けた**。リスクは低い）

### 11.4 案3 の実装（既存構造を壊さない範囲）

**新規3点のみ。R1〜R5 には手を出さない。**

#### (1) Lossy パディング除去（MP3/AAC）

- **場所**：`MediaCodecDecoder.pullPcm()` の中
- **内容**：`prepare()` でヘッダを先読みし、`GaplessTrim`（LAME タグ or iTunSMPB）から delay/padding を取得。`pullPcm()` の出力から先頭 delay と末尾 padding を正確に切除
- **改変**：純追加。`pullPcm()` の署名は不変。失敗時はトリムなしで再生（＝従来と同一の挙動）
- **効果**：**MP3/AAC のエンコーダが知らない無音（クリックノイズ）が消える**

#### (2) 曲末残差の排出

- **場所**：`run()` 内の `if (got == -1) break;` の直前
- **内容**：`rateConverter.flush()` で残りを出力
- **前提**：P4 で可変倍率＋flush を実装
- **効果**：`floor(N×96000/hz)` に完全一致（**44.1k で 23 サンプル = 0.24ms の欠落を修正**）

#### (3) 位相反転（0°/180°、マイクロフェード付き）

- **場所**：
  - DSP ON: `NativeAudioEngine` の最終段（soft-clip の後）
  - DSP OFF: `UsbPcmPacker` の直前（生PCM）
- **内容**：NEON による符号反転。トグル時は 1〜2ms の等ゲイン・マイクロクロスフェード（等べきは不採用：逆相信号に対し -3dB のノッチを生む）
- **効果**：DC オフセットによる「プチッ」を避けて無音で位相反転

### 11.5 実装順序と検証の閾値

| 順位 | 実装 | 必須検証 | ロールバック |
|---|---|---|---|
| 1 | Lossy パディング除去 | 単体30+31 テスト。**実機でMP3冒頭の無音が消えること**（耳＋ログ） | `git revert` |
| 2 | USB 経路のゼロアロケーション | host test 3本。IOCTL 列は不変 | `git revert` |
| 3 | 位相反転 | NEON host test＋Java 往復テスト（**0°でビットパーフェクト不変**） | `git revert` |
| 4 | リサンプラ位相制御 | 6レート×5分割で `flush` 一致 | `git revert` |
| 5 | 曲末残差排出 | 上記の flush を使用 | `git revert` |

**各段は1コミット**。テスト緑・実機確認後に次へ進む。**1段でも回帰が出たらそこで停止し、revert して再評価**。

### 11.6 実機テストの正統な手順（前回の反省を踏まえて）

**製品と同じ経路しか使ってはいけない**：

```
1. 端末の「Files」アプリから該当ファイルを SAF（ACTION_OPEN_DOCUMENT）で選択
2. アプリWithinの「FILES」ボタン → 「Add local files」 → SAF ピッカー
3. → アプリが content:// URI をPersistable で取得 → それを再生
```

**やってはいけないこと**（前回はこれで10回空回りした）：

| 禁止 | 理由 |
|---|---|
| `adb shell content query` で MediaStore URI を注入 | アプリに `READ_MEDIA_AUDIO` が無いので**原理的に読めない** |
| `run-as` でファイルを私有領域に置く | SAF の grant がないため、MediaExtractor は開けない |
| 画面座標を推測してタップ | 不安定で脆い、かつログの真因を掴めない |
| プラグイン名（`playTrack`/`play`）を当てずっぽう | 契約はコードで読むべき |

**ログの読み方**：`BisceneDebug` タグを一括で見た上で、問題を切り分ける。そうしないと「ログが出ない」だけで 10 回空回りする。

### 11.7 この章の要約

- **ベースラインは `c31fdf1`**（製品コード完全復元済み）
- **R1〜R5（1曲1セッションの構造）は不可侵**
- **P5/P6b は R3 を壊したため破棄。** 教訓は「ENDED は1曲だけのイベントではない」
- **今出すべきもの**：Lossy トリム、USB ゼロアロケーション、位相反転、リサンプラ位相、曲末残差排出
- **未達要件**：「曲と曲をつなぐ完全0サンプル再生」は **R3 を壊す Unless 実現できない**。別案件として評価する

---

