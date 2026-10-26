# 引き継ぎ: PWA DSP チェーン実装 (V6.5 ネイティブ移植)

作成日: 2026-10-18 / ブランチ: `feature/gapless-phase-v5`
状態: **作業中断（翌日再開）** / 前文書: `HANDOVER_HEADROOM_GUARD_Fulfilled.md`

---

## 0. 結論（先に答える）

- **Android アプリへの影響はゼロ。** 本日追加したファイルはすべて **git 未追跡の新規ファイル**だけで、
  既存の `android/` 配下・`src/App.tsx`・`src/dsp/AudioEngine.ts` 等は **1行も変更していない**。
- 作業は「PWA 側 DSP の TypeScript 移植」の **最初の1ステップ（部品モジュール作成）まで完了**。
  本体である **AudioWorklet プロセッサ (`public/dsp-processor.js`) は未作成** → ここが明日の起点。
- PWA は現状、`public/pcm-processor.js`（ストリーミング/リサンプルのみ）があり、
  **DSP 処理（EQ・リミッタ・Tube・空間・リバーブ等）は完全未実装**だった。

---

## 1. 現状調査で確定した事実

### 1.1 ネイティブDSPチェーン（V6.5、`NativeAudioEngine.cpp`）処理順

```
1. preamp(キャリブ preampDb + loudnessDb、+12dBでclamp)   ← update時に計算
2. ハム除去 = HP 20Hz(Q0.7) → Notch(50/60)(Q4)            ※2段直列
3. 3段EQ: stage0=SOURCE_EQ, stage1=OUTPUT_EQ, stage2=CALIB(キャリブ)
   ※nativeSetEqCoeffs(src→0, out→1, calib→2) の順で呼ばれる
4. loudness makeup(exp(-(log pLin + ΣstageNetLog))、+12dBキャップ、1.0下限)
5. ★V6.5 G1 ヘッドルームガード(192点log grid、天井+6dB) → 両者を1回の乗算で適用
6. restoration → tube → spatial → ambience
7. NIGHT圧縮(RMS検出、2:1、-24dB、20/300ms、最大-9dB)
8. TruePeakLimiter(閾値0.98、4xOS、入力softClamp±2.0→漸近±2.5)
9. マスター音量 × tanhソフトクリップ(膝0.98)
10. 位相反転（最後、1msランプ）
```

### 1.2 重要なネイティブ仕様（移植時に必ず对齐すべき点）

| 項目 | ネイティブ実値 |
|---|---|
| ハム 50HZ / 60HZ | `HP(20Hz, Q0.7)` + `Notch(50 or 60, Q4)` |
| EQ 3段 | stage0=SOURCE_EQ, stage1=OUTPUT_EQ, stage2=CALIB |
| preamp | `preampDb + loudnessDb`（payloadの両方を加算） |
| makeup | `exp(-(ln(pLin) + Σ stageNetLog))` / cap 3.981(+12dB) / floor 1.0 |
| stageNetLog | 各バンドを 24点 log grid(20Hz-20kHz) の **geometric mean** の和 |
| ガード | 192点 grid(20Hz-20kHz)、`peakPostDb = (ln pLin + peakEqLn + ln makeup)*8.685888` > 6.0 で `exp((6.0-peakPost)/8.685888)` |
| ambience wet | `intensity / 300`（UI 0-100 → 0.00-0.333） |
| ambience IR | onset検出→1024 tapsに切詰→エネルギー正規化0.9→反転カーネル |
| tail | 4 combs(25.3/29.7/33.9/37.7ms) + 2 allpass(5.2/1.9ms)、fb=RT60整合、damp 0.35、入力30%+±1.5 clamp |
| RT60 | JAZZ CLUB 0.9 / LARGE HALL 2.6 / CHURCH 3.5 / HALL既定 1.8 |
| wet合成 | `conv*0.7 + tail*0.85`、`dry*(1-amb) + wet*amb` |
| spatial | ITD=Woodworth式、ILD=HS 4.5kHz(-3.5dB*sinθ)、cross gain 0.26、depth: INTIMATE0.5/NEAR0.8/FAR1.5/DEEP2.5/既定1.0 |
| tube | TRIODE `tanh(x*1.1)+0.12*s^2`、PENTODE `tanh(x*1.3)/1.05`、offset=bias*0.2、DC 1pole 0.9995/0.0005、sag env 0.9992/0.9998 |
| limiter | 閾値0.98/knee0.02、FIR 24tap Blackman-Harris 4x、lookahead 1ms、attack 0.1ms / release 200ms |
| master clip | 膝0.98 `v = knee + (1-knee)*tanh((v-knee)/(1-knee))` |
| 位相反転 | 1ms、**equal-gain線形**ランプ、初回ブロックは即適用 |

### 1.3 ネイティブのサンプルレート
- **ネイティブは完全固定 96kHz**（`dspChain.update(96000, ...)`）
- PWA は AudioContext の実際のレート（44.1k/48k が多い）なので
  **全フィルタ係数・時間定数・FIR・ディレイ長はサンプルレートから導出する必要がある**。

---

## 2. 本日作成済みファイル（すべて未コミット・新規）

| ファイル | 行数 | 内容 |
|---|---|---|
| `src/dsp/biquad.ts` | 268 | RBJ biquad(peaking/lowshelf/highshelf/highpass/notch) + logMagnitude |
| `src/dsp/tube.ts` | 210 | TubeModel（TubeModel2=準C++実装を `TubeEngine` としてexport） |
| `src/dsp/spatial.ts` | 215 | SpatialMatrix（ITD/ILD/distance） |
| `src/dsp/ambience.ts` | 285 | AmbienceEngine（IR畳み込み + DiffuseTail） |
| `src/dsp/compressor.ts` | 130 | DynamicsCompressor（Night圧縮・RMS検出） |
| `src/dsp/limiter.ts` | 145 | TruePeakLimiter（4xOS・softClamp） |
| `src/dsp/phaseInverter.ts` | 135 | PhaseInverter（1msランプ） |
| `src/dsp/restoration.ts` | 88 | RestorationEngine |
| `src/dsp/WebAudioEngine.ts` | 453 | PWAエンジン本体・パラメータ管理・IR読込 |

**未作成（明日の本体作業）:**

| ファイル | 内容 |
|---|---|
| `public/dsp-processor.js` | **AudioWorkletProcessor本体（最も重要）** |
| `src/dsp/index.ts` | PWA/native 出し分け用ファサード（任意） |

---

## 3. 明日やるべきこと（優先順）

### 3-A. `public/dsp-processor.js` を書く（最優先・ここがゴール）
- **1ファイル完結**（AudioWorklet内では ES import 不可。biquad/tube/... を全部インライン化）
- `DspProcessor` クラス: `process(inputs, outputs)` で
  上記 §1.1 の10ステージを **同一順序** で適用
- `port.onmessage` で受け取るメッセージ種別（WebAudioEngine.ts が送る形に合わせる）:
  - `{type:'params', payload}` → 全DSP状態更新
  - `{type:'volume', volume}` → マスター音量
  - `{type:'ir', name, left, right}` → IR配列（転送）
  - `{type:'pause'|'resume'|'stop'|'flush'}`
  - `{type:'seek', seconds}`
- 実装方針:
  - **update-time計算は main thread 相当（params受信時）** で実施:
    biquad係数計算 → stageNetLog(24点geo mean) → makeup(±12dB cap) → ガード(192点)
    → `stageCounts[i]` 配列に「有効バンド数」を入れて audio thread は読むだけ
  - audio thread は preamp乗算 → hum → EQ → `mk = makeup*guard` 1回乗算 →
    restoration → tube → spatial → ambience → compressor → limiter → softclip → phase
  - EQ バンクは現状の TypeScript 実装同様 `filterBank[s][b].process(l, r)` を` for`で回す
  - **パフォーマンス**: 未使用ステージは即 return（`if(!enabled) return;`）
- 注意点:
  - `sampleRate` は `AudioWorkletProcessor` の **グローバル**（`/sampleRate`）で取れる
  - IR 転送は `postMessage(..., [left.buffer, right.buffer])` の transfer を使う
  - 44.1/48k でも IR の onset 検出・エネルギー正規化は同コードで動く

### 3-B. 起動配線（PWA本体）
- `src/main.tsx` で `Capacitor.isNativePlatform()` を見て
  `AudioEngine`(native) / `WebAudioEngine`(PWA) を選択するファサードを追加
  → 推奨: `src/dsp/index.ts` に `audioEngine` という名前で両者を出し、
  `src/App.tsx` の `import { audioEngine } from './dsp/AudioEngine'` を1行だけ変更
  → **UI側の変更は import 文1行のみ** にする（影響最小）
- Web Audio のノードグラフ:
  `AudioContext → AudioWorkletNode('dsp-processor') → 出力`
  入力は既存 `pcm-stream-worker.js`（fetch）→ `pcm-processor.js`（ring buffer）→
  最終的に dsp-processor に接続する形を想定。**或いは** dsp-processor を
  pcm-processor の下流に直結する形（ring buffer → DSP の順）。
  → どちらが楽かを明日決める。pipeline のつなぎ方が現状で最大の未決点。

### 3-C. `npm run build`
- `tsc -b && vite build` でCheck。**新規 .ts は tsc 対象なので型エラーに注意**
  - `src/dsp/tube.ts` 内の旧 `TubeModel` クラスは参考用で未使用（消してよい）
  - `src/dsp/spatial.ts` の `this.envR.setCoefficients(...this.envL.getCoefficients())` は可
- `npm run build` 後は `dist/ → android/app/src/main/assets/public/` の rsync が必要
  （これは従来運用と同じ。ただしユーザー確認前提）

### 3-D. テスト（任意）
- 周波数特性の比較: 同一パラメータで native の CHIRP通過結果と TSRuby/OfflineAudioContext を突き合わせ
- Python/Node で `biquad.ts` の係数を読み出してネイティブのJava `BiquadHelper` と一致確認

---

## 4. Git  safely

```bash
git status --short
# ?? src/dsp/WebAudioEngine.ts
# ?? src/dsp/ambience.ts
# ?? src/dsp/biquad.ts
# ?? src/dsp/compressor.ts
# ?? src/dsp/limiter.ts
# ?? src/dsp/phaseInverter.ts
# ?? src/dsp/restoration.ts
# ?? src/dsp/spatial.ts
# ?? src/dsp/tube.ts
```

**既存ファイルの変更: なし**（Android 側ゼロ影響の証跡）
コミットする場合は `git add src/dsp/{biquad,tube,spatial,ambience,compressor,limiter,phaseInverter,restoration,WebAudioEngine}.ts`

---

## 5. 注意点（申し送り）

- **断定禁止**: まだ動作確認が一切できていない。上記移植値はネイティブコードから読解した
  ものであり、PWA 実機で検証されたわけではない。明日は必ず実機(Chrome)で確認すること。
- `npm run build` はまだ実行していない。型エラーの可能性あり（未実行のため未確認）。
- USB Direct / OpenHome / SAF / haptics は対象外（ユーザー指示済み）
- `public/ir/*.wav` は既に存在する（HALL 等5点、健全なもの）ので Web Audio は fetch + decodeAudioData で読める
- 44.1/48kHz のレート依存処理はすべて constructor で `sampleRate` から導出すること
- 音量: WebAudioEngine.setVolume は現在 worklet に `{volume: (v/max)^2}` を送る設計
  （native の `Math.pow(vol,2)` と同一）

---

## 6. 前文書からの引用（現状で確実な部分）

- ネイティブのヘッドルームガードは **実装完了・実機検証済み**（`9e5039c`）
- したがって PWA も同じ「天井+6dB / makeup cap +12dB / floor 1.0」に揃える必要がある
- 逆に言うと native が正解なので、**PWA 側で独自に数値を変えないこと**
