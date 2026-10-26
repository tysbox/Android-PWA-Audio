# Biscene DSPSystem V5: サンプルアキュレート・完全ギャップレス再生実装計画書

**策定日**: 2026-09-26  
**作業ブランチ**: `feature/gapless-phase-v5`  
**ベースライン・セーフティースナップショット**: `backup/gapless-v5-pre-handover` / タグ `baseline/gapless-v5-phase0-safe`（コミット `d776b6c`）  
**目標**: 既存の機能（単曲再生、DMR/OpenHome連携、DSP処理系）と性能を絶対に毀損することなく、「完全なサンプルアキュレート・ギャップレス再生」を最短で達成する。

---

## 1. 過去の失敗原因の総括と不可侵原則

### 1.1 破綻の根本原因（P5/P6bの教訓）
* 過去の試みでは、曲間のギャップを埋めるためにプレイヤー内部で次曲を繋ぎ、**`ENDED` イベントを抑制・偽装**した。
* その結果、上流の `OpenHomePlaybackController`、Capacitor/JavaScript UI、DMR（UPnP）の曲送りステートマシンが「曲が終わったこと」を正しく認識できず、**二重再生、ハングアップ、曲送り不能**を引き起こした。

### 1.2 順守すべき不可侵原則（R1〜R5）
1. **R1 (単一セッション契約)**: 上位層（OpenHome / DMR / JS）から見た曲送りシーケンスを偽装しない。
2. **R2 (自然終了通知 R3 の完全保護)**: トラックの再生完了時には、既存の契約通り必ず `ENDED`（および対応する進行イベント）を発火させ、上位ステートマシンに正規の曲送りを行わせる。
3. **R3 (音響処理系の完全性)**: 96kHz固定のネイティブDSPチェーン、Catmull-Romリサンプラ、アンチポップ位相反転（0°/180°マイクロクロスフェード）を迂回・破壊しない。
4. **R4 (メモリ・リアルタイム保証)**: 再生スレッドでの動的ヒープ割り当て（malloc/new）を行わない。
5. **R5 (完全ロールバック保証)**: 各フェーズは独立した1コミットとし、単体テスト・実機ビルドが緑であることを確認して進行する。いつでも前のフェーズに即座に戻れる構造を保つ。

---

## 2. 構造転換のコアコンセプト：シンク引き継ぎ（Sink Handover）

曲間をサンプル精度で繋ぐために必要な唯一の構造転換は、**「出力シンク（AudioTrack / USB Direct Engine）のライフサイクルをプレイヤーインスタンスから分離し、次曲プレイヤーへ安全に引き継ぐ」**ことである。

```
[曲 A プレイヤー (BiscenePlayerV2)]
    │
    ├─ 出力: AudioTrack (96kHz FLOAT) または USB Direct
    │
    ├─ got == -1 (曲末尾デコード完了)
    │     ↓
    │   RateConverter.flush() (曲末残差 P8 排出)
    │     ↓
    │   自然終了通知: updateState(ENDED) 発火 ───> [OpenHome / DMR / JS ステートマシン]
    │                                                      │ (正規の曲送り発火)
    │                                                      ↓
    │                                            [次曲 B プレイヤー生成]
    │                                                      │
    └─ cleanup() で AudioTrack を close しない ───────────┤
       (SinkCarrier にシンクを預ける)                     │
                                                          ↓
                                            [曲 B プレイヤーが既存シンクを受け取る]
                                            (AudioTrack.play() を維持したまま
                                             P1トリム済みPCMを即座に書き込み開始)
```

---

## 3. 段階的実装フェーズ（4ステップ）

各フェーズ完了ごとにコミットし、テスト・ビルドの正常性を担保する。

### Phase A: 出力シンクの引き継ぎ基盤（Sink Handover & Carrier）
* **責務**:
  * `AudioTrack` および USB デバイスの所有権を解放せずに次曲インスタンスへ渡す `SinkCarrier`（シングルトンまたはプラグイン管理）を導入。
  * `BiscenePlayerV2.cleanup()` において、自然終了（`state == ENDED`）時はシンクを `stop()/release()` せずウォームスタンバイ状態として保持。
  * 新規プレイヤー生成時、同一フォーマット（96kHz 固定出力）であれば既存の `AudioTrack` をそのまま再利用（`attachExistingSink(...)`）。
* **安全対策**:
  * ユーザーによる明示的な停止（`stop()` / `pause()`）、エラー発生時、URL変更（手動選曲）、DAC切断時は即座にシンクを完全破棄（リーク防止）。
* **完了基準**:
  * 単体テスト（84テスト全緑）。
  * 単曲再生・停止・シーク・一時停止に一切のリグレッションがないこと。

### Phase B: 次曲の事前ヘッダ解析とトリム予約（Lookahead Inspector）
* **責務**:
  * 再生中のトラックが残り時間閾値（5秒以下）に達した際、プレイリスト内の次曲 URI（OpenHome の `nextTrack()` または DMR の `dmrNextUri`）をバックグラウンドスレッドで検査。
  * 既存の `Mp3GaplessParser` / `AacGaplessParser` を用い、曲 A 再生中に曲 B の `GaplessTrim`（delay/padding）を事前解析完了。
* **安全対策**:
  * メインのオーディオスレッド（`BiscenePlayerV2.run()`）から独立した低優先度ワーカースレッドで実行し、音声バッファアンダーランを誘発させない。
* **完了基準**:
  * 次曲のトリム情報が曲終了前に確定すること。

### Phase C: サンプルアキュレート境界接続（Seamless Boundary Write）
* **責務**:
  * 曲 A の tail 排出（P8 flush）が完了した直後のフレーム境界から、同一の `AudioTrack` / USB パイプラインへ曲 B の P1 トリム済み PCM を書き込む。
  * `updateState(ENDED)` は曲 A の全サンプルがシンクに渡されたタイミングで通常通り発火し、上位との同期を維持。
* **完了基準**:
  * 2曲間の合計サンプル数が厳密に `floor(lenA * 96k / srA) + floor(lenB * 96k / srB)` に一致すること。

### Phase D: DMR / OpenHome プレイリスト連携（Queue Integration）
* **責務**:
  * `OpenHomePlaybackController` および `DlnaPlaybackPlugin` のキュー管理機構とシームレス接続を連携。
  * 外部コントローラ（Linn Kazoo, BubbleUPnP）による連続再生時にも同様にシンク引き継ぎを発動。
* **完了基準**:
  * 実機環境でプレイリスト連続再生時にノイズ・音切れ・二重再生が発生しないこと。

---

## 4. 中断・再開手順

万が一作業を中断する場合、または問題が発生した場合は以下の手順で即座に現在の安定点に復帰可能。

```bash
# 作業の現状確認
git status
git log -n 5 --oneline

# 現在の安定点（セーフティースナップショット）への完全ロールバック
git reset --hard baseline/gapless-v5-phase0-safe
```

---

## 5. 進捗ログ（中断・再開用）

### Phase 0: 安全確保 — 完了
* バックアップブランチ `backup/gapless-v5-pre-handover` / タグ `baseline/gapless-v5-phase0-safe` 作成。
* 基線テスト緑を確認（`./gradlew testDebugUnitTest` = BUILD SUCCESSFUL）。

### Phase A: 出力シンクの引き継ぎ基盤 — 実装完了
* **新規**: `android/app/src/main/java/com/bisen/biscene/v2/pipeline/SinkCarrier.java`
  * 純 Java 実装（JVM 単体テスト可能）。`park()/claim()/discard()`、15 秒 TTL 自動解放（キルスイッチ `SinkCarrier.setEnabled(false)` でビルド不要の従来挙動復帰）、スケジューラ注入可。
* **新規テスト**: `app/src/test/java/com/bisen/biscene/v2/pipeline/SinkCarrierTest.java`（16 テスト・緑）。
* **接続（BiscenePlayerV2）**:
  * 自然終了時のみ（`!stopped` 判定）`ENDED` 通知の**直前**で park — 次曲の claim との競合を構造的に排除。
  * `run()` 冒頭で claim → 空なら従来通りの AudioTrack 生成へフォールバック。
  * `cleanup()` は従来維持（park 済みは null なので従来どおり release 不発）。
* **接続（DlnaPlaybackPlugin）** — リーク防止の 3 経路で `discardParkedSink()`:
  * `stopPlaybackInternal()`（stop API / PlaybackService STOP / OpenHome `onStop` / レンダーバインド失敗）
  * `handleOnDestroy()`
  * オーディオフォーカス喪失（`AUDIOFOCUS_LOSS`）
  * 自然前進経路（`playInternal` 内の `player.stop()`、OpenHome `onNext` / 自然 advance）は discard **しない** = 引き継ぎ成立。
* **スコープ外（明示）**: USB エンジンの引き継ぎは Phase A の対象外（ビットパーフェクト時はサンプルレート毎に再設定が必要なため）。USB 使用時は従来どおり（無劣化・ギャップあり）。
* **検証**: 全 12 スイート / JVM テスト緑（failures=0, errors=0）、`assembleDebug` 成功。

### Phase B: 次曲の事前ヘッダ解析（Lookahead Inspector）— 実装完了
* **新規（純 Java / JVM 単体テスト済み）**:
  * `gapless/LookaheadScheduler.java` — **いつ**プローブするかの純粋ポリシー。残り 5 秒ウィンドウ、最短 1 秒間隔のレート制限、成功で `markResolved()`、`setEnabled(false)` でランタイム無効化。テスト 9 件緑。
  * `gapless/LookaheadInspector.java` — **何を**解析するか。`HeaderFetcher` 注入で IO を分離し、`parseHead()` は MediaFormat なしでコンテナを判別（ID3/MPEG同期→MP3、ftyp/ADTS→AAC、その他→`GaplessTrim.NONE`）。`isProbeCandidate()` が .flac/.wav/.dsf 等の明らかな無タグ形式を除外。IO 失敗は**キャッシュしない**（次ティックで再試行）、成功（タグ無しを含む）は確定キャッシュ。テスト 11 件緑。
  * `gapless/GaplessTrimCache.java` — プロセス共有の有界キャッシュ（`shared()`）。テスト 11 件緑。
* **接続（MediaCodecDecoder = P1 経路の改修）**:
  * `initGaplessTrim()` はまず共有キャッシュを参照し、**ヒットすればヘッダ読み込みを行わない**（＝曲境界の IO が消える）。ミス時のみ従来どおり読み込んで結果をキャッシュに公開（「タグ無し」も確定回答として公開）。
  * プローブはレートを持たないため、実レートで `GaplessTrim.of(...)` に再スタンプして診断精度を維持。
  * ヘッダ読み込みを `public static readHeader(ContentResolver, url, max)` に昇格（http Range / content:// / file:// の 3 方式を**重複実装しない**ため）。
* **接続（DlnaPlaybackPlugin）**:
  * リスナー（＝曲開始）ごとに独立した `LookaheadScheduler` を持ち、`onProgress` の**現在かつ PLAYING のセッションのみ**から呼ぶ（古い sid のリスナーが新曲の代わりにプローブする事故を構造的に排除）。
  * 次曲 URI は `PlaylistState.getNextTrack()`（OpenHome。状態を変えない peek）→ 無ければ DMR の `SetNextAVTransportURI` URI の順で解決。ローカル WebView キューは Java 側に後続が無いため何も解決しない＝従来挙動。
  * 実際の読み込みは `BisceneExecutors.IO` 上のワーカーで実行（再生スレッドをブロックしない）。
* **安全対策**: 本フェーズは**読み取り専用の先読み**であり、デコーダ・シンク・ステートマシンに一切触れない。プローブが失敗・誤判定しても最大の損失は「何も解決しない」＝従来動作と等価。
* **検証**: 全 15 スイート / テスト緑（failures=0, errors=0）、`assembleDebug` 成功。

### Phase C: サンプルアキュレート境界接続（Seamless Boundary Write）— 実装完了

Phase C は境界の **安全性（C1）→ 遅延（C2）→ サンプル数（C3）** の順に分割して実装した。

#### C1: グレースウィンドウ付きシンク解放（`80df24f`）
* **解決した既知リスク**: 自然終了の通知連鎖 `ENDED → (JS/DMR が消費) → 次曲開始` の途中で `stop()` が入ると SinkCarrier のハード `discard()` が作動し、引き継ぎ直前にシンクを解放して継ぎ目を断っていた。
* **対策**: `SinkCarrier.softDiscard(graceMs)` を追加。明示 stop は「即時解放」ではなく `graceMs`（= `SINK_HANDOVER_GRACE_MS` 1500ms）後に解放されるよう TTL を再武装する。後継者がその窓内で claim すれば継ぎ目は成立し誰も claim しなければ必ず解放される（リークは起きない）。
* 副作用: 保留シンクは自身バッファ（96kHz で数百ms）しか持たず、それが流れた後は無音となるため「止まっても音が出続ける」ことは無い。
* テスト: `SinkCarrierTest` 22 件緑（`graceMs <= 0` は即時解放、発行後の失敗は解放へ劣化、claim 後の失効 no-op 等）。

#### C2: 次曲のメタデータ・プリウォーム（`934829e`）
* **ループの原因**: 純 Java 部品（`PrewarmedMeta` / `PrewarmCache` / `PrewarmRules`）と `PrewarmCacheTest` は完成していたが、**接続ポイントが 2 箇所欠けていた**。生成側（`PrewarmCache.put()` の呼び出し元 0 件）と消費側（`MediaCodecDecoder` が `take()` 参照しない）不在。また javadoc が参照していた `PrewarmRulesTest` が存在しなかった。部品が繋がない状態は構造的に「ループ」に見える。
* **新規（純 Java / JVM 単体テスト済み）**:
  * `gapless/PrewarmedMeta.java` — 曲開始に必要な二次メタデータ。生の nullable タグを保持し「null=タグ無し」「""=空タグあり」を区別する。
  * `gapless/PrewarmCache.java` — プロセス共有の有界 LRU（32件）。`take()` は**ワンショット**（取得同時削除）で、収集した開始より長く生存できず、URI 内容が別物に置き換わった stale エントリが供給されない。キルスイッチ `PrewarmCache.setEnabled(false)`。
  * `gapless/PrewarmRules.java` — `prepare()` のタグ適用ルールを純 Java に抽出。収集側 `collect()` とデコード側 `*Of()` の両方を単一実装に。
  * `gapless/PrewarmRulesTest.java`（新規 14 件）— **pre-C2 の `prepare()` ブロックを逐語転記したものを oracle** として、タグ組み合わせ行列で両実装を比較する。
* **接続（生成側 = `DlnaPlaybackPlugin.maybeProbeNextTrack`）**:
  * 既存のレート制限付き IO プローブが、トリムに加えて**次曲の artist/title/album/duration を `MediaMetadataRetriever` で収集**し `PrewarmCache.shared()` へ公開する。
  * **重要**: `isProbeCandidate`（.flac/.wav/.dsf 等）は**トリム読み込みのみ**をゲートする。メタデータは全コンテナで価値があるため、FLAC もスキップせず収集する。従来はタグ無しと判定して `markResolved()` し、丸ごとスキップしていた。
  * 解決判定は**両 payload が揃って**から。片方だけ済んだまま再プローブし続けることを防ぐ。
  * 失敗は**キャッシュしない**（trim と同じ契約）＝ネットワーク瞬断は「タグ無し」として固定されず再試行される。
* **接続（消費側 = `MediaCodecDecoder.prepare`）**:
  * `PrewarmCache.shared().take(url)` で取得し `PrewarmRules` で解決。**`get()` ではなく `take()`** ＝ワンショット。
  * ミス時は従来の retriever 経路をそのまま残し、そのタグルールも `PrewarmRules` 経由にした（＝prewarm 経路と非 prewarm 経路が**原理的に漂わない**）。
  * 境界での `MediaMetadataRetriever` オープン（リモート URL では 2 回目の全面オープンに相当）がゼロになる。
  * `durationUs` は **MediaFormat が値を持たないときのみ** prewarm 値を適用（従来の `if (durationUs <= 0)` ガードと同一意味）。
  * 公開するのは**リトリーバのオープンに成功した場合のみ**（一時失敗が「この曲にタグは無い」としてプロセス寿命中固定されるのを防ぐ）。
* **legacy 挙動の固定（意図的に「修正」しない 2 つの quirk）**:
  * `if (tag != null) field = tag` ――**空文字タグはデフォルトを上書きする**。長年の出荷挙動であり、prewarm 経路だけ値が変わってはならない。
  * artist→albumArtist のフォールバック順。`defaultTitle` は URL デコードせず、`\..*$` は**末尾ではなく先頭ドット**から除去する（`v1.2 mix.wav` → `v1`）。prewarm 経路は従来と同じ文字列を表示しなければならない。
* **意図的な唯一の相違**: 負の duration を伝播せず 0 にクランプする（実リトリーバからは発生せず、負の durationSec を公開するより厳密に安全）。
* **検証**: 全 18 スイート / 167 テスト緑（failures=0, errors=0）、`assembleDebug` 成功。

#### C3: 境界サンプル数の厳密固定（`797e232`）
* `gapless/GaplessBoundaryAccuracyTest.java`（10 件）。実運用の連鎖（`PcmTrimmer` → `RateConverter.convert/flush`）をそのままモデル化し、ギャップレスが依拠する契約を固定:
  * 1 _track_はメディアフレームワークのチャンク分割に関係なく **厳密に `floor(validFrames * 96k / srcHz)` フレーム**を排出する。
  * P8 の flush が無いとリサンプラの lookahead が 1 曲あたり最大 24 フレーム（44.1kHz では 23）を**黙って捨てる**ことを回帰ガードとして明示。
  * 曲 A ++ 曲 B が接合点で**何も挿入も削除もされない**（`floatToIntBits` 比較により 1 サンプルずらしでも失敗）。
  * 曲ごとの flush は境界を `2*floor(1000*96k/44.1k)` フレームに保ち、1 つのコンバータを継ぎ目跨ぎで使うと生じる `floor(2000*96k/44.1k)` とのズレ（レート変換の境界ドリフト）を防ぐ。
  * lossy プライミングは**ソースレートでトリムしてから**リサンプリングする（リサンプラが厳密パススルーになる 96kHz でサンプルごとに検証）。

* **Phase C 総合検証**: 全 19 スイート / 179 テスト緑（failures=0, errors=0）、`assembleDebug` 成功。
* **Phase C 完了基準との対応**: 「2 曲間の合計サンプル数が `floor(lenA*96k/srA) + floor(lenB*96k/srB)` に厳密一致」＝ **C3 の専用テストで担保**。境界の書込が同一シンクへ連続して書き込まれることは A の SinkCarrier ＋ B/C1 の park/claim が担保し、**D1 で実測可能にした**（下記）。

### Phase D: DMR / OpenHome プレイリスト連携 — **完了**（実機検証済み）

> **対象範囲の確定**: DLNA（plain DMR）再生ではプレイリストが本気にない＝ラッパーが Next を自走で発行する機構が実質的に無く、自動連続再生の経路自体が成立しない。よって本フェーズの実質的な対象は **OpenHome プレイリスト**（Linn Kazoo 等、Java 側にキュー管理が存在する経路）であり、plain DMR は対象外。

#### D1: 継ぎ目の実測（`551cccc`）
* **解決した問題**: Phase D の完了基準は「連続再生でノイズ・音切れ・二重再生が出ないこと」という**聴感判定**だが、コード上は継ぎ目が無音か判断できるものが無かった。park された AudioTrack は誰も書き込まない間も draining し、後継が遅ければバッファが空になって無音になるだけ。
* **手法**: `AudioTrack.getPlaybackHeadPosition()` は生成時から実際に再生されたフレームの単調増加カウントであり、引き継ぎは同一トラックオブジェクトを再利用するため、**park 時のヘッドと後継の初回書き込み時のヘッドの差 = シンクが保留中に drain したフレーム数**。 この差をトラック容量と比較すれば「シンクがデータ不足に瀕したか」だけが判定できる。
* **新規**: `gapless/SeamAudit.java`（純 Java、テスト 12 件）。バッファに音声が残っていれば `GAPLESS`、空いていれば `STARVED`、判定不能なら `UNKNOWN`。
* **接続（`BiscenePlayerV2`）**: park 時にヘッド＋容量を `static` にスナップショット（シンク自体がプロセス共有なので、park するプレイヤーと claim するプレイヤーは別インスタンス）、claim 時に受け取り、**初回成功 write の瞬間に一度だけ**監査。診断専用で、one-shot・全 read の例外を握り潰し・音声経路の制御フローに一切触れない。
* **重要な境界**: ヘッドは 96kHz で約 6.2 時間で `int` を一圈する。ラップした頭は resume 時点で park 時点より**数値的に小さい**が連続性は完全であり、**符号付き比較では完璧な継ぎ目を STARVED と誤判定**する。最初の実装がまさにこのバグを持ちラップテストが検出した。無符号 32bit デルタのみで判定する。
* **副次成果**: C2 の再構成でずれていたドキュメント用のログ `Lookahead resolved next-track trim` を復元。

#### D2: キュー経路の精査（責務2点の充足確認）

プラン Phase D の責務は「キュー管理機構とシームレス接続の連携」「外部コントローラによる連続再生時にも同様にシンク引き継ぎを発動」である。両者はコード上で以下の経路として結線済みであることを確認した（新規コードの追加は不要）。

**引継ぎが成立する経路（ギャップレス対象）**:

| 経路 | 呼び出し連鎖 | シンクの扱い |
|---|---|---|
| **OpenHome 自然終了** | `onStateChanged(ENDED)` → `httpProxy.onRendererTrackEnded` → `controller.onRendererTrackEnded` → `playlistState.advanceAfterNaturalEnd()` → `startTrack` → `playOpenHomeRendererInternal` → `playInternal` | `playInternal` 冒頭の `player.stop()` は **シンクを破棄しない**。自然終了側は既に `parkSinkForHandover()` で `audioTrack` を null 化済（`cleanup()` が触れない）なので、後続プレイヤーの `run()` が `SINK_CARRIER.claim()` して同一シンクへ継続書き込みする。**成立**。 |
| **OpenHome Stop → 再生** | `onStop` → `stopPlaybackInternal()` → `softDiscardParkedSink(1500ms)` → 窓内の `playInternal` | C1 の猶予窓によりシンクは保持され、後継者が猶予窓内で claim すれば継ぎ目が成立する。**成立**。 |

**引継ぎが成立しないのが正しい経路**:

| 経路 | 理由 |
|---|---|
| 手動 Next / Seek | 再生途中の曲替えであり、前プレイヤーは自然終了していないため park されない。`cleanup()` がシンクを解放し、後続は新規 AudioTrack を作る。プラン Phase A の安全対策「URL変更（手動選曲）時は即座にシンクを完全破棄」に一致。**ギャップレス対象外が正しい**。 |
| ローカル WebView キュー | Java 側に後続が存在しない（Phase B の記載どおり）。従来動作のまま。 |
| **plain DMR（DLNA 再生）** | **DLNA 再生ではプレイリストが本気にない**＝ラッパーが Next を自走で発行する機構が実質的に無いため、自動連続再生の経路自体が成立しない。`SetNextAVTransportURI` は `dmrNextUri` を保存するだけで、自然終了後に Java 側が自発的に次曲を開始するコードは無い（自動前進は `onStateChanged` の `renderer && rendererTrack != null` 条件に従い、plain DMR では `rendererTrack == null` のため作動しない）。**よって本件の実質的対象は OpenHome キューであり、plain DMR は対象外の認識で整合する**。 |

**結論**: プラン Phase D の責務2点はコード側で充足済み。残るは**完了基準（実機環境でのノイズ・音切れ・二重再生がないこと）**のみで、これは D1 の `SeamAudit` が数値判定を提供するため、実機ログでの確認のみで完了できる。

### Phase D 完了判定（実機確認チェックリスト）

プランの完了基準「実機環境でプレイリスト連続再生時にノイズ・音切れ・二重再生が発生しないこと」を、以下の手順で**機械的に**判定する。JDK/ログのみで完結し、聴感判定は不要。

**手順**:
1. OpenHome コントローラ（Linn Kazoo 等）から 2曲以上のプレイリストを再生。
2. 自然終了で次曲へ進み、境界で以下のログを `adb logcat -s BiscenePlayerV2:D DlnaPlaybackPlugin:D` で確認:
   - `AudioTrack parked for gapless handover`（曲 A 終端でシンク保留）
   - `Adopted parked AudioTrack (gapless handover)`（曲 B が同一シンクを受領）
   - `Gapless seam verified: SeamAudit{GAPLESS, drained=<n>f, capacity=65536f, parked=<t>ms, headroom=<h>ms}`（**これが完了の決定的証拠**）
3. **合格条件**: 連続再生のすべての境界で `Gapless seam verified` が出力され、かつ `headroom`（残余余裕）が POSITIVE（`GAPLESS` ＝シンクが枯渇しなかった）。
4. **不合格の場合**: `Gapless seam LOST (sink starved)` が出る。`headroom` が負なら境界遅延がバッファ予算（683ms）を超えたことを示すので、下の「継続時の注意 3」に従って遅延源を特定する。

**注**: 本チェックリストは**推測ではなく実測**であり、`STARVED` は「音切れが発生した」ことをコードレベルで保証する。plain DMR は対象外（対象は OpenHome キュー）。

#### D3: 実機検証 — 完了 ✅

* **結果**: 実機での連続再生テスト**成功**。計画の完了基準「実機環境でプレイリスト連続再生時にノイズ・音切れ・二重再生が発生しないこと」を満たした。
* **意味**: 本計画（Phase A→B→C→D）は**すべて完了**。`SinkCarrier` のシンク引き継ぎ基盤（B）＋事前ヘッダ解析（B）＋境界接続（C1/C2/C3）＋キュー連携（D）が、実機で一体として機能することを確認した。
* **フェーズ別 コミット**:
  * A: `1dd1682` / B: `abe336e` / C1: `80df24f` / C2: `934829e` / C3: `797e232` / D1: `551cccc` / D2: `64a76a1` / D3: 本エントリ
* **ロールバック手段**: 3系統とも継続利用可能（§5 末尾参照）。緊急時は `SinkCarrier.setEnabled(false)` 等でランタイム無効化、または `git reset --hard baseline/gapless-v5-phase0-safe` で完全巻き戻し。

### 最終サマリ（Phase A〜D 完了）

本計画（V5 ギャップレス再生）は**全フェーズ完了**。各フェーズは独立コミットで記録され、ロールバック可能。

| フェーズ | 内容 | コミット | 状態 |
|---|---|---|---|
| A | Sink 引き継ぎ基盤（`SinkCarrier`） | `1dd1682` | ✅ |
| B | 次曲の事前ヘッダ解析（`LookaheadInspector`） | `abe336e` | ✅ |
| C1 | グレースウィンドウ・シンク解放 | `80df24f` | ✅ |
| C2 | 次曲のメタデータ・プリウォーム | `934829e` | ✅ |
| C3 | 境界サンプル数の厳密固定（テスト） | `797e232` | ✅ |
| D1 | 継ぎ目の実測（`SeamAudit`） | `551cccc` | ✅ |
| D2 | キュー経路の精査（対象=OpenHome） | `64a76a1` | ✅ |
| D3 | 実機検証 | 本エントリ | ✅ |

* **JVM テスト**: 全 19 スイート / 179 テスト緑（failures=0, errors=0）
* **クリーンビルド**: `clean assembleDebug testDebugUnitTest` = BUILD SUCCESSFUL
* **実機**: OpenHome プレイリスト連続再生でノイズ・音切れ・二重再生なし

### 継続時の注意（将来タスク向け）

1. **既知の制約**: `getNextTrack()` は「自然終了で再生される曲」を返す。手動で Next を押した場合は通常の `startTrack()` → `playInternal` 経路となり、プローブ済みキャッシュがそのまま再利用される（無駄な再読み込みなし）。
2. **明示的なスコープ外**: USB Direct（ビットパーフェクト）出力はサンプルレート毎に再設定が必要であり、引き継ぎ対象としていない。USB 使用時は従来どおり（無劣化・ギャップあり）。plain DMR（DLNA 再生）も対象外（プレイリストが本気にない）。
3. **境界遅延の短縮が必要な場合の対処**: `playInternal` はメイン looper 上で `player.prepare()` と `browseMetadataSync()` を同期実行する。SinkCarrier のバッファは 96kHz で 65536 フレーム ≈ **683ms** の給電予算しかないため、これらを短縮する必要がある場合は `Gapless seam LOST` / `headroom=` の実測値を根拠に行う。

### ロールバック（3系統）
```bash
# 完全ロールバック（コード）
git reset --hard baseline/gapless-v5-phase0-safe

# ランタイム無効化（ビルド不要・従来挙動へ即時復帰）
SinkCarrier.setEnabled(false);        # Phase A: シンク引き継ぎを無効化
LookaheadScheduler.setEnabled(false); # Phase B: 先読みプローブを無効化
PrewarmCache.setEnabled(false);       # Phase C2: メタデータ・プリウォームを無効化
```
