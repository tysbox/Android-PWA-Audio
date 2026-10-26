# Biscene DSP System — 開発方向性（Development Direction V6.5）

- **文書バージョン**: v2.0
- **策定日**: 2026-10-15（V6.5 改訂。V6.4.1 実装一式を V6.5 として昇格）
- **対象ブランチ**: `feature/gapless-phase-v5`
- **起点コミット**: `7a425be`（V6.4.1 docs・Push 済み）／機能コミット `34c6043`（IR 33% + Info Phase 1 + People 修正 + Signal truth）、`12cd765`（D1）・`bdcd485`（Info Phase 0）・`3ac5c47`（artistBio 修正）
- **位置づけ**: `PLAYBACK_FULL_SPEC_V6_5.md` 準拠。音響品質（D1 実機確定・N3 IR 33%）と Info（Phase 0 + Phase 1）の**実装進捗と今後の課題・残務**をまとめた開発方向性ドキュメント。本ファイルはコミット管理対象（`docs/` 配下）。

---

## 0. エグゼクティブサマリー

V6.5（= V6.4.1 実装一式）では、**3 つの大きな改善**を既存機能・性能を損なわない非破壊方式で実装・実機検証した。

| ストリーム | 状態 | 核心 | 効果 |
|---|---|---|---|
| **音響品質（D1 + N3）** | ✅ 実装・Push 済み（`12cd765` + `34c6043`）・**実機 3 ゲート Green** | Night RMS 検波化（実機確定）＋ IR wet 除数 /300（Max 33.3%・+33%） | 低中域 THD 6%→**0.32–1.12%**、Night 抑制 −5.16dB 維持、IR の湿り感を大幅強化（実測 0.6667） |
| **Info 充実（Phase 1 / E–G + PIN UI）** | ✅ 実装・Push 済み（`34c6043`）・**実機で INFO 全表示確認** | CoverArtArchive ジャケット・MB 項目拡張（ISRC/初出年/カタログ/Tracklist・新規 API ゼロ）・Wikidata 典拠・「Wrong match?」PIN 導線 | アート的中率向上・Info の深さ大幅増・誤特定の恒久訂正導線 |
| **Info 精度（Phase 0 / A–D）** | ✅ 実装・コミット済み（`bdcd485`） | MB スコアリング＋MBID キャッシュ＋ユーザー PIN＋Discogs LRU 上限 | 誤特定の防止・再訪高速化・メモリ安定 |
| **表示系修正（V6.5）** | ✅ 実装・実機確認済み（`34c6043`） | Signal truth 全経路化（Native Resolution 修正）・People 回帰修正（リトライ予算の実質キー化） | ローカル再生でも信号解像度表示・People（producers/共演者）復旧 |

全ストリーム **JVM テスト 240/0/0 Green**、`assembleDebug` 成功、実機（Huawei MAR-LX2J）デプロイ済み。 Night D1 の V6.3 時点の検証要求（実機 connectedDebugAndroidTest）は **3/3 Green で解消・最終確定**。

---

## 1. ストリーム①: 音響品質 V6.3（Night モード低中域歪み D1）— 完了

### 1.1 課題と真因
ユーザー実機報告「Night モードで中低域中心の歪みが**低音量でも**発生」。前回の「limiter が防ぐ」説明では不十分で、実コード＋数値実証により真因を特定:

- **実行エンジン**は `NativeAudioEngine.cpp` の `DspInstance`（`DspChainV2.cpp` は CMakeLists でビルド除外・未配線）。
- **音量は compressor/limiter の後段**（`data[i] * mVol`）で適用。⇒ ユーザー音量に関わらず compressor は常にフルスケールを処理。**これが「低音量でも歪む」物理的原因**。
- `DynamicsCompressor.h` は**ピーク検波 + 20ms attack**。低中域（周期 4〜16ms）では attack が 1 周期内で gain を変動させ、信号×時間変動ゲイン = **AM（高調波）歪み**を生成。
- しきい値 **−24dB** は高く、通常レベルの低中域ピークは常時しきい値越え ⇒ **常時コンプレッション = 常時歪み**。NIGHT EQ が 60Hz(+3dB)/250Hz(+1dB) を持上げ低中域に歪みが集中。

### 1.2 修正（コミット `12cd765`）
`DynamicsCompressor.h` の検波を **peak → RMS（mean-square ~5ms 平滑 + sqrt）** に変更。**しきい値 −24dB・2:1・−9dB フロア・トグルランプ・kill-switch は不変**（＝Night の意図と安全契約を完全維持）。

### 1.3 実測効果（実ヘッダ harness・定常態・実機テスト同一アルゴリズム）

| 検証 | 旧 (peak) | 新 (RMS) | ゲート |
|---|---|---|---|
| THD 60Hz | 5.110% | **1.121%** | <1.5% ✓ |
| THD 120Hz | 5.743% | **0.647%** | 同上 |
| THD 250Hz | 5.913% | **0.322%** | 同上 |
| 大音量抑制 ON-vs-OFF | −5.40 dB | **−5.16 dB** | ≤−4dB ✓（Night 意図維持） |
| THD 音量 1.0/0.3/0.05 | 5.883/5.883/5.883% | 0.532/0.532/0.532% | 音量非依存 ✓（低音量歪の解消） |
| Night OFF ビット透過 | 完全一致 | 完全一致 | R5 kill-switch ✓ |
| comp ステージ性能 | 43.6 ms/60s | 49.4 ms/60s | +0.08%（無視可能） |

### 1.4 残務
- [ ] **実機 `connectedDebugAndroidTest`** で `NightCompressorDistortionTest` 3ゲート Green 確認（本環境でコード・数値検証は完了、実機実行のみ残る）。これをもって V6.3 最終確定。

---

## 2. ストリーム②: Info（メタデータ）機能 Phase 0 精度改善 — 実装・実機デプロイ済み

### 2.1 課題（修正前のデータフロー）
```
ファイル名/タグ → sanitize → MusicBrainz検索(limit=1 の先頭のみ無条件採用)
  → recording詳細 → release詳細 → Discogs → Wikipedia → rankedMerge → UI
```
精度ギャップ:
1. **A** — `limit=1` の先頭ヒット無条件採用。曖昧曲名・同名別人・リマスター違いで誤特定。
2. **B** — 確定 MBID の永続化なし。毎回検索（API 負荷・速度・不安定さ）。
3. **C** — Discogs キャッシュが無制限 `ConcurrentHashMap` ×3（長時間/大規模でメモリリーク）。
4. **D** — 誤特定時のユーザー訂正手段なし。

### 2.2 実装内容（A–D 全て完了・配線済み）

| # | 項目 | ファイル | 内容 |
|---|---|---|---|
| **A** | MB スコアリング | `MbMatchScorer.java`（新規 144行） | 純 JVM ランカー。artist40+title40+duration15+country5、Levenshtein＋diacritics 正規化、`MIN_SCORE=55` の abstain ゲート。`bestIndex()` で TopN から採点。 |
| **B** | MBID 永続キャッシュ | `MbidPinStore.java`（新規 108行）＋`MusicBrainzClient.searchRecordingTopN()` | SharedPreferences に recording/release/artist MBID を JSON 保存。再訪時は検索スキップし detail 直呼び。全失敗は legacy に degrade。 |
| **C** | Discogs LRU 上限 | `DiscogsClient.java`（+23行） | 3キャッシュを同期 LinkedHashMap LRU（cap=200）に置換。get/put/キー契約不変・eviction のみ追加。 |
| **D** | ユーザー PIN | `MbidPinStore` ＋ `DlnaPlaybackPlugin.setInfoPin()`（+28行） | Capacitor プラグインメソッドで誤特定を訂正（`skip` または `mbid:<id>`）。UI からの恒久訂正導線。 |

配線（非破壊・kill-switch 付き・`MetadataCoordinator.java` +141行）:
- `resolve()`: PIN skip/mbid 判定 → MBID キャッシュ → TopN scorer 採点（`preferFirst=false`＝閾値未満は MB enrich 棄権、Wiki/Discogs は継続）→ Tier2 で `prefetchedDetail` 再利用（2重 fetch 回避）→ 採用 MBID を永続化。
- `triggerDeepTrack()`: キャッシュ優先 → scorer 採点（`preferFirst=true`＝従来互換）。
- `DlnaPlaybackPlugin.load()`: `setPinStore` 注入（失敗時は従来経路へ退化）。

### 2.3 非破壊・安全契約（絶対遵守）
- **R4 lock-free 不干渉**: 新規処理は全てネットワーク IO（`WORKER_POOL`）、音声スレッド・DSP・Gapless・USB を一切変更しない。
- **kill-switch**: `MbidPinStore.setEnabled(false)` で B/D は legacy 完全復帰。scorer（A）は「採用/不採用」判断のみで、不採用＝Tier スキップ（MB が空の時と同じ）＝安全。
- **rankedMerge 意味論不変**: 既存 RANK_MB/DISCOGS/ALBUM/WIKI 優先度は変えない。
- **Discogs LRU 挙動不変**: 同一キー・同一 get/put、cap 超過時 eviction のみ。

### 2.4 検証結果
- **`testDebugUnitTest`: 220 tests / 0 failures / 0 errors**（ベースライン 215＋新規 `MbMatchScorerTest` 5件）。新規純 JVM テスト用に `testImplementation "org.json:json:20231013"` を追加（**アプリ本体には無影響・未パッケージ**）。
- **`assembleDebug` / `compileDebugAndroidTestJavaWithJavac`** 成功。
- **実機デプロイ完了**: Huawei MAR-LX2J（Android 10）へ `installDebug`。`com.bisen.biscene` の `lastUpdateTime` が今回ビルド時刻であることを確認。
- **実機簡易効果**: ユーザー報告「かなり改善したようです」。

### 2.5 設計判断（正直な記録）
- scorer は「タイトル完全一致 40＋duration 一致 15＝55」で `MIN_SCORE=55` に到達するため、artist 名のみ不一致でも採用する。artist をハード拒否にすると**クラシック（作曲者 vs 演奏者）・Various Artists・カバー曲の正当な enrich が阻害**され機能低下になるため、スコア重みは変更せず、テストを実契約（最近似 artist 採用＋artist/title 双方不一致は棄権）に正直に修正した。誤エンティティは上流の artist-clause 検索で予防。
- `MIN_SCORE=55` は初期値。実機の誤特定/未特定バランスを見て調整する可能性あり（`MbMatchScorer.MIN_SCORE` 定数 1箇所）。

---

## 3. 今後の課題と残務（V6.5 時点）

### 3.1 Info 機能 — Phase 1（✅ V6.5 で完了・実機確認済み）
| # | 項目 | 実装 | 状態 |
|---|---|---|---|
| E | CoverArtArchive | `CoverArtArchiveClient` + `AlbumArtProvider` 挿入（埋込→フォルダ→**CAA**→iTunes・abstain 型・kill-switch） | ✅ 実機確認 |
| F | MB 収録項目拡張 | `MbDetailExtractor`（ISRC・初出年・カタログ番号・Tracklist）+ `+isrcs` inc（同一リクエスト内・新規 API 呼び出しゼロ） | ✅ 実機確認 |
| G | Wikidata 典拠 | `WikidataParser` + `WikipediaClient.fetchWikidata`（QID → 生没年・楽器・公式サイト・画像・Discogs 後配置） | ✅ 実機確認 |
| — | PIN UI 導線 | Info モーダル「Wrong match?」（No info / Set MBID） | ✅ 実機確認 |

### 3.2 Info 機能 — Phase 2（任意・コスト/キーが必要。**ユーザー判断により非実施**）
| # | 項目 | 概要 | 備考 |
|---|---|---|---|
| H | Discogs 認証トークン | レート枠拡大。**アプリにハードコードせず**設定画面からユーザーが自分のトークンを登録・SharedPreferences 保存 | セキュリティ配慮 |
| I | 音響指紋（AcoustID/Chromaprint） | テキスト検索不能盤（日本語盤・クラシック・マイナー）の切り札 | **NDK ネイティブ追加必須・工数大**。代替として PIN＋MBID 永続が既に完備 |
| J | キャッシュ永続化（ディスク） | 高価値データ（確定 MBID・要約・ジャケット）のディスク保持。容量管理・整合性検証が必要 | 最後に実施 |

### 3.3 音響品質 — Phase 2（任意・低優先）
- **リサンプラ LPF（D2）**: `RateConverter.convert()` は Catmull-Rom 補間のみでダウンサンプル前 LPF 不在（合成 60/70kHz が折返し）。ただし実音楽は 24kHz 以上にエネルギーがほぼ無く実聴感影響は最小。実施する場合のみ、**Gapless（R2）の位相連続性を壊さず**、`srcHz > 96000` のときのみ軽量 LPF を挿入。検証: `ResamplerVerificationTest` 折返し ≤−60dBFS・`RateConverterPhaseTest` 全 Green・通過帯ドループ ≤0.5dB。

### 3.4 横断的な残務（V6.5 時点の最新状況）
- [x] ~~**V6.3/V6.4 確定（実機検証要求）**~~ → **V6.5 で解消**: 実機 `NightCompressorDistortionTest` **3/3 Green**（2026-10-15・MAR-LX2J。THD 1.120/0.647/0.322%・−5.16dB・音量非依存 0.532%）。副次修正として instrumentation 実行中の自己 kill ガードを追加（本番動作不変）。
- [x] ~~**V6.4 仕様書の HTML 化**~~ → V6.4.1 で `PLAYBACK_FULL_SPEC_V6_4_JP/EN.html` 生成済み（`7a425be`）。V6.5 HTML は必要になった時点で生成（現時点は本 .md が正）。
- [x] ~~**PIN の UI 導線**~~ → V6.5 で実装（Info モーダル「Wrong match?」行）。
- [x] ~~**People タブ回帰**~~ → V6.5 で修正・実機復旧確認済み（リトライ予算の実質キー化＋Wikidata を Discogs 後へ移動。Diana Krall で真因実証）。
- [ ] **MIN_SCORE 調整**: 実機の誤特定/未特定バランスを実測し `MbMatchScorer.MIN_SCORE` を微調整（現状 55）。
- [ ] **Info Phase 0/1 の実機効果の定量化**: 誤特定率低下・2回目再生の応答速度・長時間スクロールのメモリ安定を実測記録（INFO 全表示はユーザー目視確認済み・定量は未実施）。
- [ ] **Night ON/OFF 50 回ポップ確認・AMB Max 33.3% の聴感確認**: ユーザー聴感での最終確認（wet が過剰なら除数 /320 へ 1 行調整）。
- [ ] **V6.5 HTML 生成**（任意）: 必要になった時点で V6.4 HTML に倣い生成。

---

## 4. 不変契約（全ストリーム共通・絶対に破らない）

- **R1 Bit-Perfect**: 定常状態でゲイン変更ゼロ。起動/再構成時のみ 8chunk(~30ms) アンチポップランプ（仕様許諾）。
- **R2 Gapless**: トラック境界のサンプル精度。位相連続性を壊さない。
- **R3 True-Peak**: `TruePeakLimiter` が最終段で捕捉（threshold 0.98・hard clamp ±4.0）。
- **R4 Lock-Free**: 音声スレッドに新規 lock/heap/syscall を増やさない。新規処理は別スレッド（`WORKER_POOL`）。
- **R5 Kill-Switch**: 全機能に無効化導線。Night は `setNightMode(false)`、Info は `MbidPinStore.setEnabled(false)` で即 legacy 復帰。

---

## 5. セーフティーネットとロールバック

- **バックアップ**: `android/.artifacts/safety_net_20261014/`（D1・DynamicsCompressor.h 等の `.orig`）／`android/.artifacts/safety_net_phase0_info/`（Info 5ファイルの `.orig`）。※ `.artifacts/` は gitignore 対象のためローカルのみ。
- **Git ベースライン**: D1 は `11972a9`（修正前）→ `12cd765`（修正後・Push 済み）。Info Phase 0 は `12cd765` が clean baseline。
- **ロールバック**:
  - D1: `git checkout -- android/app/src/main/cpp/dsp/DynamicsCompressor.h`（＝ `11972a9` と同一）／`.orig` 復元／R5 Night OFF。
  - Info: `git checkout -- <file>`（＝ `12cd765`）／`.orig` 復元／`MbidPinStore.setEnabled(false)`。

---

## 6. 検証サマリー（2026-10-15・実測）

| 検証 | 音響（V6.3→V6.5 D1+N3） | Info（Phase 0 + Phase 1） |
|---|---|---|
| ユニットテスト | **240 / 0 / 0**（系譜: 186→205→214→220→**240**） | 同左（CAA 5・MB 抽出 8・Wikidata 7 を含む） |
| 数値効果 | THD 5.11–5.91% → **実機 1.120/0.647/0.322%**・−5.16dB・音量非依存 0.532% | scorer・キャッシュ・LRU・CAA・Wikidata・PIN UI |
| IR 強度 | 除数 /300・**実機 0.6667**（理論値と完全一致） | — |
| ビルド | assembleDebug 成功・tsc クリーン・Vite 350.66 kB | 同左・cap sync 完了 |
| 実機 | **Night 3 ゲート Green（2026-10-15）**・INFO 全表示（ユーザー確認） | Huawei MAR-LX2J デプロイ済み（md5 一致確認） |

---

## 7. V6.5 実装記録（2026-10-15・V6.4.1 実装一式の昇格）

> 以下は V6.4.1（`34c6043` + `7a425be`）として実装・検証した内容。V6.5 として本書に統合。

**実機 Night 3 ゲート（V6.3/V6.4 最終確定条件）— 達成**: `connectedDebugAndroidTest`（MAR-LX2J）で `NightCompressorDistortionTest` **3/3 GREEN**。実測: THD 60/120/250Hz = 1.120/0.647/0.322%（<1.5%）、大音量抑制 ON-vs-OFF = −5.16dB（≤−4dB）、音量非依存 = vol 1.0/0.3/0.05 で 0.532% 完全一致。ホスト予測と完全一致。

**副次修正（非破壊）**: 実機計測中、テストプロセス自身が `MainActivity.onDestroy()` の killProcess（P0 項目）で SIGKILL されることを logcat で特定 → instrumentation 実行中（`.test` プロセス検出）のみ自己 kill を抑制する 1 条件を追加。本番動作は不変（失敗時も kill するセーフデフォルト）。

**IR 強度の引き上げ（ユーザー要求・湿ったミキシングの改善）**: `NativeDspChain` の wet 除数を /400（Max 25%）→ **/300（Max 33.3%、+33%）** に変更。実機 `DspVerificationTest.t14` を新契約（i=100 → 0.6667）に更新し **0.6667 実測・理論値と完全一致**。dry 側 (1−amb) は常に正・limiter が後段担保・P3 半減は UI スケールで無矛盾。R1–R5 全契約不変。JVM 220/0/0（リグレッションゼロ）。

**Info Phase 1（E/F/G・キー不要）＋ Phase 0-D UI 導線 — 実装・実機デプロイ済み**:
- **E: CoverArtArchive**（新規 `CoverArtArchiveClient.java` + `AlbumArtProvider` 挿入）: フォールバック順 埋込→フォルダ→**CAA**→iTunes。UUID 検証・magic-byte 検証・10MB 上限・kill-switch（`MbidPinStore.isEnabled()`）。失敗は即 legacy 経路。
- **F: MB 収録項目拡張**（新規 `MbDetailExtractor.java`）: **新規 API 呼び出しゼロ**（`getRecordingDetail` の同一リクエストに `+isrcs` 追加のみ）で ISRC・初出年・カタログ番号・トラックリストを抽出し Info UI に追加。`resolve()`/`triggerDeepTrack()` 両経路に配線（新規キーのみ・rankedMerge 不変）。
- **G: Wikidata 典拠**（新規 `WikidataParser.java` + `WikipediaClient.fetchWikidata`）: MB artist url-rels の QID → 生没年・楽器・公式サイト・画像を裏付けとして取得。abstain 型・既存 bio が主。
- **PIN UI 導線**: Info モーダルに「Wrong match?」行を追加（No info = 棄権 / Set MBID = 正しい録音を pin）。`setInfoPin` → `MbidPinStore.savePin`（native のみ表示・失敗表示あり）。
- **Signal タブ Native Resolution 修正**（ユーザー報告の不具合）: ネイティブ `onMetadataLoaded` が format/srcRate/srcBits を **renderer 時のみ**送っていたためローカル再生が永久「Detecting...」だった真因を特定 → renderer 分岐の外に共通 put（追加のみ）+ `AudioEngine` productionInfo リスナーに Signal truth 転送を追加。表示専用・音声経路無影響。
- **V6.4 HTML 化**: `PLAYBACK_FULL_SPEC_V6_4_JP.html` / `_EN.html` を生成。

**検証（2026-10-15）**: JVM テスト **240/0/0**（+20: CAA 5・MB 抽出 8・Wikidata 7）。`assembleDebug` 成功、`tsc --noEmit` クリーン、Vite ビルド成功（index 350.66 kB / gzip 103.68 kB）、`cap sync` 完了、実機インストール成功（APK md5 `ce26b215…` ローカルと一致・起動スモーク OK・FATAL ゼロ）。

**People タブ回帰修正（実機報告「People で producers/共演者が表示されなくなった」→ **実機復旧確認済み**）**:
- **検証**: Diana Krall「The Look of Love」で `+isrcs` inc の有無を MB API 実測 → relations 完全一致（`+isrcs` は無関係と実証）。Discogs release 7849548 に Tommy LiPuma (Producer)・Christian McBride (Bass) 等 36 名の credits が存在することを確認（People の供給源は Discogs 経路）。
- **真因**: WatchdogTask の再試行条件 `accumulatedKnowledge.length() < 6` が Phase 1-F/G の装飾キー（isrcs 等）によって早期に満たされ、**時間のかかる Discogs credits が到着する前に 7 秒再試行ループが停止**していた。
- **修正**: ① 再試行判定を `substantiveKeyCount() < 6` に変更（装飾キー 8 種と `_rank` を除外 — 既存キーのみで判定 = V6.3 までの挙動に戻す）。② `resolve()` の Wikidata 2 GET を Discogs の後ろへ移動（credits 経路の遅延排除）。
- 検証: JVM 240/0/0、`assembleDebug` 成功、実機再デプロイ（06:57）。**ユーザー実機確認で People/Album/Signal 全表示を復旧**。

**残タスク**: MIN_SCORE 実機調整（現状 55）、Info Phase 0/1 効果の定量化、Night ON/OFF 50 回ポップ確認と AMB 33.3% 聴感確認（ユーザー聴感）。Phase 2（H/I/J）はユーザー判断により実施しない。

---

## 8. V6.5.1 実装記録（2026-10-16・アルバム先行解決＋アルバム情報キャッシュ）

**欠陥（実機 sid ペイロードで確定）**: スタンダード曲・ベスト盤で「同一曲名が複数アルバムに存在」するため、recording 主義の `releases[0]` 無条件採用が別アルバムを掴み、アルバム単位項目が混在。実測（Freddie Hubbard「Skylark」/ アルバム「Blues for Miles」1992 Alfa Jazz ALCR-199）: Discogs（rank 2）は正しい（ALCR-199・原哲夫/木全信/Alfred Lion・Billy Childs 等）一方、MB 系（rank 3）が `recordedAt "August 21, 1961"`・`label ...Blue Note (BST 84085)` — **1962 年 "Ready for Freddie" のデータが混入**、`wikiSummary` も別アルバム記事。

**ユーザー方針**: トラック名基準ではなく**アルバム×アーティスト基準**で表示。同一アルバムの継続再生では 1 度正しく取得した情報を更新しない。

## 8. V6.5.1 実装記録（続き）

**実装（2 層・非破壊）**:
- **層 A: アルバム先行解決**（`MetadataCoordinator.resolveViaAlbumFirst` + `MusicBrainzClient.searchReleaseTopN` + `MbMatchScorer.bestReleaseIndex`/`MIN_RELEASE_SCORE=60`）: アルバムタグ有効時、`artist:"X" AND release:"T"` でリリース候補を採点採用（artist40+album40+国5、60 未満は棄権→従来 recording 主義へ 100% フォールバック）。採用 release の**アルバム単位項目のみ**を rank3 で供給し、Tracklist（title 類似 0.85 + 長さ ±15s/10%）で当該曲の recording を特定して曲単位 facts を取得。
- **層 B: アルバム情報キャッシュ**（新規 `AlbumCreditsCache`・`album:<artist>|<album>` キー）: アルバム単位 15 キーのみを rank 付きで永続（trackTitle/performers/isrcs はキャッシュしない）。「同一アルバムか」の判定はキャッシュヒット自体が兼ねる（状態機械不要）。ヒット時は保存 rank のまま rankedMerge に再投入 → 同アルバム 2 曲目以降はアルバム項目を再導出しない（曲単位のみ解決）。PIN > キャッシュ、kill-switch は `MbidPinStore.setEnabled(false)` で A/B 両方 legacy 復帰。
- **wikiSummary 禁止規則**: 層 A 採用時は albumTitle/label/cat#/firstReleaseYear/country/tracklist/studios/recordedAt が rank3 で先に埋まるため、下位 rank の wiki が別アルバム記事で上書きできない（「無い」は「間違い」より良い）。

**検証（2026-10-16）**: JVM テスト **251/0/0**（+11: release scorer 7 + album cache key/allowlist 4）。`assembleDebug` 成功・実機（Xperia XQ-CC44）インストール成功（00:24）・起動スモーク FATAL ゼロ。
**要確認（実機・ユーザー）**: ①「Skylark」で Album タブが ALCR-199/1992/原哲夫 に一貫 ② 1961 録音・BST 84085 の混入消滅 ③ wikiSummary の "Ready for Freddie" 上書きなし ④ 同一アルバム 2 曲目以降の album cache hit ログ ⑤ 別アルバム遷移で自動入替。セーフティネット: `android/.artifacts/safety_net_20261016_v651/`（3 ファイルの .orig）。

---

*本ドキュメントは `docs/` 配下で Git 管理される。`.artifacts/` 内の handover は作業用（gitignore）のため、正式な開発方向性は本書を正とする。*



## 9. V6.5.2 実装記録（2026-10-16・TAG-FIRST 確定・fetchWiki アルバム配線）

**ユーザー確定の絶対原則**: タグ情報があればそれが表示の真実。アルバム×アーティストを基準に表示する。アプリが曲名/アルバム名を作ったり書き換えたりしてはならない。

**実機ログで確定した 3 段階の真因と修正**:
1. **ネットワーク名が rank なしでタグを上書き**（MB タイトル・別 release の albumTitle・別アルバム wiki 記事）→ `RANK_TAG=4` 新設、resolve() 冒頭でタグを rank4 投入・末尾で再主張、`WatchdogTask.pushToUI()` で毎回 `reassertTags()`（`231a11c`）。
2. **別アルバムの Wikipedia 記事が Album Notes と infobox facts（recordedAt/studios/label）を注入**（"Blues for Miles Freddie Hubbard album" 検索が "Ready for Freddie" に着地・ja.wikipedia が『ザ・ボディ・アンド・ザ・ソウル』記事）→ **アルバムタグ有効時は album wiki 完全禁止**（resolve() Tier 4 と WatchdogTask.triggerWikiAlbum() の両経路・Album Notes は "Not catalogued" のままで誤りより良い）（`739aa84`）。
3. **INFO モーダルの on-demand 探索（fetchWiki）が album を渡しておらず**、層 A（アルバム先行解決）が発動せず曲名主義にフォールバック → App.tsx が `t.album` を渡し、プラグインが TrackMetadata に設定（`f1d93fe`）。

**実機検証（MAR-LX2J → Xperia XQ-CC44 / 2026-10-16 01:57・ユーザー確認「やっと改善されました」）**:
```
INFO_UNIT: album-first adopted release 'The Body & The Soul' (965eb0b3…)
INFO_UNIT: release '…' already adopted (album-first) — skipping recording-release refetch
INFO_UNIT: tag names the album — skipping album wiki (foreign-article ban)
```
最終ペイロード: trackTitle/albumTitle/artistName すべて rank 4（タグ）、label=impulse!（rank 1）、catalogNumber=AS 38・firstReleaseYear=1963・producers=Bob Thiele（rank 3）、wikiSummary=None（別アルバム記事の混入なし）。**アルバムキャッシュ（`biscene_album_credits.xml`）も初めて永続化を確認（678 bytes）** — 同一アルバムの 2 曲目以降はキャッシュヒットでアルバム項目を再導出しない。

**教訓（今後の全開発に適用）**: ① タグ > アプリ判断。表示名はタグから。② 「実装した」は「配線まで確認して」が条件。③ 外部典拠の同名コンテンツは推測で採用しない（無い方が誤りより良い）。

