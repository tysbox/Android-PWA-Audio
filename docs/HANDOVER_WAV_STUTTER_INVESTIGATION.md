# HANDOVER: WAV 音揺れ調査（未解決）

**ステータス**: ✅ 解決済み（2026-10-11 続きセッション）— 原因特定・修正・回帰テスト完了。**実機検証済み**: 修正版APK（15:33 インストール）で3分間のWAV 16/44.1再生で音揺れ発生なし（未修正なら約5回発生する期間）。詳細は §7。
**作成**: 2026-10-11（調査セッション中断時点）
**調査対象**: WAV 16bit/44.1kHz ネットワーク再生時の周期的音揺れ（30-40秒周期）を FLAC/DSD は持たない原因
**実機**: STPDU19515004014 (Huawei MAR-LX2J, Android 10, SDK 29)
**音源**: NAS Twonky `http://192.168.0.116:9000/disk/NON-DLNA-OP01-FLAGS01700000/O0$1$8I4677131.wav` (WAV 16/44.1, 59MB) / 同一 NAS の FLAC 24/192

---

## 1. 実測で確定した事実（反証不可能なもののみ）

### 1-1. アンダーラン実測値（dumpsys media.audio_flinger Track 統計）

| フォーマット | Underruns | 期間 | レート | ユーザー体感 |
|---|---|---|---|---|
| **WAV 16/44.1** | 24,145 → 136,545 → 171,423 | 5.5分→16分 | **~187回/秒** | 明確な音揺れ |
| **FLAC 24/192** | 0 → 46,147+ | 約12分 | **~64回/秒**（測定継続中に増加） | **音揺れなし** |
| DSD | 未測定 | — | — | 音揺れなし |

**重要**: FLAC も大量のアンダーランが発生しているのに体感問題なし。**underrun カウンタ数と音揺れは直接相関しない**。このカウンタの正確な意味（AudioFlinger 内部の empty チェック回数？）は未検証のまま。AudioFlinger の Tracks.cpp / MixerThread 実装確認が必要。

### 1-2. コード経路（全ファイル読了済み）

- **WAV も FLAC も全く同一の Java コード経路**: `MediaCodecDecoder` → `MediaExtractor` → `c2.android.raw.decoder`（実機ログで確認: `13:37:17.299 D/CCodec: allocate(c2.android.raw.decoder)` は FLAC 再生時）
- **MediaCodec 側に WAV/FLAC 差はない**（FLACExtractor は MediaCodec の外でデコード済み PCM を audio/raw として渡す）
- **違いは MediaExtractor 側のみ**:
  - WavExtractor: 1 read = 最大 32768 bytes、`supportsNonBlockingRead()=false`、先読みキャッシュ**なし**
  - FLACExtractor: 1 read = 1 FLAC frame（blocksize 4096 samples）、先読みキャッシュ**なし**、libFLAC readCallback が同期 readAt
- **DSD のみ完全に別経路**: `DsfDecoderV2` — 専用フェッチャースレッド（`Biscene-DsdStreamFetcher`）+ 4MB `LinkedBlockingQueue` 先読みバッファ。`pullPcm()` はメモリからだけ読む

### 1-3. AudioTrack バッファパラメータ（audio_flinger Track 行より）

- WAV/FLAC とも `FrmCnt 32768`（= 262144 bytes、96000Hz 2ch float では 341ms 相当）
- **コード上の不整合（未解決）**: `BiscenePlayerV2.java:449` は `Math.max(min * 4, isDsdTrack ? 1572864 : 262144)` を指定。isDsdTrack=false なので 262144 bytes = 32768 frames と一致。一方 58a03e4 のコミットメッセージは `1048576` を謳っているが実コードは `1572864`。過去の audio_flinger ログには `FrmCnt 196608` の Track も存在 → **SinkCarrier park/adopt で過去の大きなバッファの Track が再利用されるパターンがあった**可能性
- バッファサイズ変更が体感に与える影響は未検証（ユーザーが 262144 への復元を試験済みで「効果なし」報告）

### 1-4. リサンプリング経路（RateConverter.java 読了済み）

- 全フォーマット、96kHz パイプラインへ Catmull-Rom 4 点補間でリサンプル
- **WAV 16/44.1**: 44100→96000 = **非整数倍**（step = 0.459375）
- **FLAC 24/192**: 192000→96000 = **1/2 整数倍**（step = 2.0）
- **DSD**: 176400→96000 = 非整数倍（step = 1.8375）
- ユーザー仮説（未検証）: **非整数倍リサンプリングの位相アキュムレータ（posFrac）と pullPcm 供給粒度の相互作用が周期ノイズを生む**可能性。FLAC=整数倍で問題なし、WAV=非整数倍で問題、DSD=非整数倍だが独自バッファで問題なし — 整合する部分としない部分があるため検証必要

### 1-5. キューにある「1秒だけミスマッチ」の体感報告

ユーザー証言: 「アンダーランというよりサンプルレートミスマッチの時の感覚。ほんの1秒だけミスマッチが起こっているような」

### 1-6. その他の実測

- 再生中 logcat はほぼ沈黙（watchdog STALLED 遷移なし、MediaCodec エラーなし）
- `Biscene-Decoder` スレッドが chatty 抑制で毎秒 73-80 行ログ（正体未特定。DSD_DIAG タグか pullPcm 内部のログと思われるが、chatty 無効化後の再取得に失敗 — 後続者が再実行すること）
- 一時停止中は underrun 増加停止（再生時のみ発生）

---

## 2. 破棄した仮説（実測で否定）

| 仮説 | 否定理由 |
|---|---|
| NAS/Wi-Fi/ネットワーク帯域不足 | ユーザーが「全く無関係」と断定、FLAC 24/192（帯域要求最大）が問題なく再生。BubbleUPnP は同一 WAV を問題なし |
| DSP CPU 負荷 | DSP バイパスでも音揺れ発生（ユーザー確認済み） |
| FLAC は MediaCodec 内部バッファで安全 | FLAC もアンダーラン大量発生で音揺れなし → バッファの有無では説明不能 |
| AudioTrack バッファ 1572864→262144 変更が原因 | 復元試験で「効果なし」（FIN_WAIT1 残存） |
| プロキシ経路の問題 | 音声 URL は 127.0.0.1:9600 を経由しない（NAS 直URL）実測確認 |
| 58a03e4..HEAD のコード変更が原因 | MediaCodecDecoder はこの範囲で無変更（git 確認済み）。ただし BiscenePlayerV2/DlnaPlaybackPlugin は LUFS/soft-start 追加あり、LUFS 分析は5秒バッファで pullPcm 供給サイクルに影響する可能性（未検証） |

---

## 3. 残った主要仮説（検証優先順位順）

### 仮説 A（最有力）: MediaExtractor の同期 readAt + 再生スレッド直列実行

`MediaCodecDecoder.pullPcm()` は再生スレッド上で `extractor.readSampleData()` を直接呼ぶ。WAV 16/44.1 では 1 read = 32768 bytes = 371ms 分だが、readSampleData は MediaCodec の input buffer サイズ（65536 bytes max）に制約される。**readSampleData が実際に返す sz と pullPcm の返す frames の粒度を実ログで確認していない**。

FLAC では 1 frame = blocksize 4096 = 92.9ms @44.1k だが 24/192 では 21.3ms。供給粒度が細かいほうがむしろアンダーランしやすいはずなのに FLAC は音揺れなし → **粒度説に矛盾**。この矛盾を解く鍵がまだ見つかっていない。

### 仮説 B: 非整数倍リサンプリングと供給粒度の相互作用（ユーザー仮説）

RateConverter.convert() の `maxToProduce = frames/step + 2` と ring buffer の LOOKAHEAD_FRAMES=12 起因の周期的な供給途切れ。44.1k→96k は step=0.459375、1 pullPcm あたりの出力が入力の 2.18 倍になる。`emitProcessed` が lastPcmChunk の 1 チャンク遅延ホールド（fade-hold）を挟むため、粒度の不均一が増幅される可能性。192k→96k は step=2.0 で出力が入力の半分、バッファが溜まる方向に働く。

**検証方法（未実施）**: BiscenePlayerV2 に pullPcm の返り値（got）と emitProcessed への frames を SystemClock とともにリングバッファに記録し、音揺れの瞬間（アンダーラン急増時）に前後 200ms の履歴を logcat に出す診断ビルドを作って 3 フォーマットで比較。

### 仮説 C: WavExtractor の readAt が HTTP を直接叩く粒度の問題

NuCachedSource2 経由でない MediaExtractor は HTTP を同期的に叩く。WAV は 32768 bytes/read でソケットバッファを即座に消費し、TCP window が閉じたタイミングで次の readAt がブロック。FLAC は readCallback が libFLAC に 4096 bytes 単位で要求するため、実際の readAt 粒度が小さく keep-alive が維持される。**Twonky の HTTP 実装との相互作用**が本当の犯人の可能性。

**検証方法（未実施）**: `netstat` と `proc/<pid>/net/tcp` で再生中の socket window を毎秒サンプリング。WAV 再生時のみ window が周期的に 0 に落ちるかを確認。

---

## 4. 未検証リスト（次セッションの最初のアクション）

1. **AudioFlinger の underrun カウンタの意味確認**（Tracks.cpp / MixerThread::tracksReadyForMixing）— FLAC が64回/秒 underrun して音が正常な理由を説明できる
2. **pullPcm/emitProcessed の粒度とタイミング実測**（仮説 B の診断ビルド）
3. **socket window の毎秒サンプリング**（仮説 C）
4. DSD のアンダーラン計測（比較の3点目）
5. chatty 無効化後の Biscene-Decoder ログの正体特定
6. **SinkCarrier park/adopt 経路で大きいバッファの AudioTrack が WAV 再生に再利用されるケースの確認**（audio_flinger ログに FrmCnt 196608 の Track が存在した事実の説明）

---

## 5. セッション状況

### 未コミット変更（HEAD = 1e3c124）

| ファイル | 変更 | 検証状態 |
|---|---|---|
| `src/dsp/presets.ts` | NIGHT EQ ゲイン緩和（+5.5→+3.0, +1.5→+1.0, +3.0→+2.0, −6.0→−4.5） | **実機で効果あり（音割れ修正）— コミット推奨** |
| `BiscenePlayerV2.java` | isDsdTrack フィールド + バッファフロア条件分岐 | **効果なし（ユーザー確認）— revert 推奨** |
| `android/app/src/main/assets/public/index.html` | cap sync 残差 | 1e3c124 と実質同じはず、要確認 |
| `.DS_Store` | bin | 無視 |

### DSD シークロールバック

- `DsfDecoder.java` / `DsfDecoderV2.java` とも `git diff` 空 = 完了。HEAD の `DsfDecoderV2.seek()` は空スタブ（`/* Range-based seek would be here */`）だけ
- ロールバック漏れなし

### 実機の残作業

- ポートフォワード `tcp:19600 → 9600` 設定済み（DMR SOAP 制御に使用可能）
- `persist.log.tag` を設定済み（Biscene-Decoder:V, DSD_DIAG:V, MediaCodecDecoder:V, BiscenePlayerV2:V）— **chatty 抑制が効かなくなったため、次回ログ取得時はノイズ増加に注意**
- FLAC 再生は 13:37 開始、13:49 時点でも継続中だった可能性（中断時に確認）

---

## 6. 教訓（次回の自分への注意）

1. **アンダーランカウンタは音質指標ではない** — FLAC 64回/秒で正常再生という実測が、WAV 187回/秒 = 異常の単純比較を無効化した
2. **体感（30-40秒周期の音揺れ）と物理現象の対応づけが最優先** — カウンタ数ではなく「いつ音が途切れたか」の時系列を取るべきだった
3. **ユーザーの仮説（リサンプリング整数倍）を最初に検証すべきだった** — FLAC 24/192 = 整数倍、WAV 44.1 = 非整数倍という差はユーザーが最初に指摘した
4. MediaExtractor/MediaCodec は AOSP 実装確認で構造は判明済み。残る未知は AudioFlinger カウンタの意味と供給粒度の実測のみ

---

## 7. 解決（2026-10-11 続きセッション）

### 7-1. 原因（確定）

`RateConverter.convert()` の出力バッファ上限と入力消費の非対称が原因だった。

- `BiscenePlayerV2.pipelineBuf` = `float[32768]`（16384フレーム）が `convert()` の `outLimit = min(frames/step + 2, out.length>>1)` のキャップとして機能していた
- WAV 16/44.1: `pullPcm` は1回あたり 8192フレームを供給（WavExtractor = 32768 bytes/read）するが、生産が16384フレームでキャップされるため **消費される入力は 16384 × 0.459375 ≒ 7527フレームのみ**
- 滞留 = 8192 − 7527 ≒ **665フレーム/回** → **197回 = 33.6秒**でリング（`RING_SIZE` = 131072）を超過 → 以降 `writeIdx` が未読データを上書き → Catmull-Rom タップが1周違いのデータを読み、2.97秒の前方スキップ+クリックが約33.6秒ごとに発生
- **実測「30-40秒周期」と理論33.6秒が一致**。回帰テスト `cappedOutputBufferIsWhatCausedTheWav441Glitch` が旧バッファサイズで197回目に破壊することを実証
- 供給粒度は間接的に関与: FLAC = 4096フレーム/回 < 7527 で安全、WAV = 8192 > 7527 で溢出。DSD は step=1.8375 で安全

### 7-2. 仮説 A/B/C の結論

すべて棄却（直接原因ではない）。ネットワーク帯域、リサンプラの整数倍/非整数倍、MediaExtractor の readAt 粒度はいずれも必要条件を満たさない。整数倍問題に見えたのは `step < got/16384` というキャップ条件が「44.1k かつ大粒度供給」の時にだけ成立するためで、相関の正体はこれ。

### 7-3. 修正（コミット済み）

- `BiscenePlayerV2.pipelineBuf` 32768 → **73728**（36864フレーム = 16384入力@44.1k の最悪拡大 35670出力を収容）→ 出力キャップが効かなくなり、FLAC/DSD と同じくリングは LOOKAHEAD 付近で拮抗する入力駆動モードに
- `srcHz < 22050` で警告ログ（カバー外帯域の既知制限。22.05kHz 未満のソースでは理論上の残存リスクあり）
- 回帰テスト2本を `RateConverterPhaseTest` に追加: `wav441ProductionPatternStaysContinuousWithSizedBuffer`（新サイズで85秒分=旧故障時点の2.5倍の連続性維持を検証）、`cappedOutputBufferIsWhatCausedTheWav441Glitch`（旧サイズで197回目に破壊することをピン）。全17テスト通過
- 前セッションの isDsdTrack 変更（AudioTrack バッファ条件分岐、効果なし）は revert 済み

### 7-4. 残作業

1. ~~**実機確認のみ未実施**~~ → **実施済み（2026-10-11 15:40頃）**: 修正版APK（dex 検証済み・15:33 インストール）で WAV 16/44.1 を3分間再生、音揺れゼロ。未修正なら約5回（33.6秒周期）発生する期間。なお当初の「修正後も音揺れ発生」報告は 04:42 ビルドの旧APKでのテストであり、切り分けで判明
2. underrun カウンタの正確な意味は引き続き未検証（音質指標ではないという結論 §1-1/§6-1 は維持）
