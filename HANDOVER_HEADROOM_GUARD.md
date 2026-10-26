# 引き継ぎ: DSD/PCM 歪み対策 — 積み上げゲイン抑制機能 (V6.5 G1/G2)

作成日: 2026-10-17 / ブランチ: feature/gapless-phase-v5 / 直近コミット起点: 74d914a

## 1. ユーザーの要望

- DSD再生で一定以上の音量で大きく音が歪む。PCMでも大音量・立ち上がりの鋭い音で歪むケースがある。
- ヘッドホンキャリブレーション（EQ）でゲインが大きく、**ピークが +5dB を超えるあたりから顕著**。
- 問い: 「エフェクトの積み重ねによるゲインの総計がある一定量を超えるとそれを抑制する機能は可能か？」

## 2. 根本原因（コードで確認済み）

処理チェーン（V4 エンジン `app/src/main/cpp/NativeAudioEngine.cpp`、96kHz固定。DSD/PCM は
`RateConverter` で 96k にリサンプル後に処理 → レート不整合はなし）:

```
preamp(キャリブ -4.2〜-6.5dB + loudnessDb ±12dB) → ハム除去 → 3段EQ(src/out/calib)
→ loudness makeup(exp(-(log pLin + Σ stageNetLog))、+12dBキャップ、減衰しない=1.0下限)
→ restoration/tube/spatial/ambience → NIGHT圧縮
→ TruePeakLimiter(閾値0.98、★入力ハードクランプ±4.0)
→ マスター音量 + tanhソフトクリップ(膝0.98) → フェーズ反転
```

歪みのメカニズム:
1. **makeup は幾何平均損失しか打ち消さない**: preamp −6.5dB と負ネットの補正帯を打ち消すと、
   キャリブ曲線がブーストしている帯域では総積みゲイン `pLin × |H(f)| × makeup` が 1 を大きく超える
   （+5〜+12dB）。フルスケール近傍コンテンツ（DSD はデシメーション後にほぼFS）と合わさり、
   リミッターが深いゲインリダクション＝可聴的な潰れ。
2. **±4.0 ハードクランプ**: 4x 超えると TruePeakLimiter 入力でハードクリップ → 大きな歪み。
   ユーザーが報告した「DSDで大きく歪む」の正体。
3. makeup 計算は更新時のみ（audio thread は読み取りだけ）という既存規約に従っている。

## 3. 実装した修正

### V6.5 G1 — 積み上げゲイン抑制ガード (`NativeAudioEngine.cpp`)

- `biquadLogMag()` ヘルパーを新設（既存の24点geometric-mean計算と同一数学、重複排除）。
- `DspInstance` に追加メンバー: `kGuardCeilingDb = 6.0f`（天井）、`kEvalPts = 192`、
  `evalFreq[192]`（20Hz〜20kHzロググリッド、コンストラクタで固定構築）、
  `eqEvalLog[192]`（3段EQ合成対数応答）、`std::atomic<float> eqGuardLin{1.0f}`。
- `setEqCoeffs()`: 3段全バンドの合成応答を192点グリッドで評価して `eqEvalLog` を更新
  （更新時のみ、ダイヤル操作一回あたり約0.5MFLOP）。
- `recomputeMakeup()`: `peakPostDb = (log(pLin) + peakEqLn + log(makeup)) * 8.6858`
  が**最悪周波数での実効絶対積み上げゲイン**。`> +6.0dB` のとき
  `guard = exp((6.0 - peakPost)/8.6858)` を `eqGuardLin` に格納、logcatにINFO出力。
- `process()`: `mk = eqMakeupLin × eqGuardLin` を既存の1回の乗算ループで適用
  （オーバーヘッドゼロ、スレッドセーフはatomic読み取り）。

### V6.5 G2 — リミッター入力ソフトクランプ (`dsp/TruePeakLimiter.cpp`)

- 硬い `±4.0` クランプを `±2.0` までビット同一、超過域は C1連続 tanh 飽和
  (`2.0 + 0.5*tanh((x-2.0)*2.0)`、漸近線 ±2.5) に変更。検出器入力は引き続き有界。

### 検証テスト (`app/src/androidTest/java/com/bisen/biscene/dsp/HeadroomGuardVerificationTest.java`)

タグ HEADGUARD、4件:
- t01: preamp +4dB は天井未満なので通過（ガード非活性の確認）
- t02: キャリブ構成 (−6.5dB + peaking +12dB@80Hz Q0.8) → 80Hz絶対ゲインが天井付近に
  キャップ (4.5〜7.0dB)、かつ曲線形状 (80Hz−1kHz) が +6dB 超で保存
- t03: preamp +12dB（loudness正規化の最悪ケース）→ 約+6dBにキャップ (5.4〜6.8)
- t04: フルスケール0.95の正弦波をホット構成へ → peak ≤1.001、THD<5%、有限値

## 4. 【重要】レビュー中に発見・修正したバグ（サインエラー）

最初の実装では `peakPostDb = log(pLin) + peakEqLn − log(makeup)` と**減算**していた。
makeup は信号に**乗算**されるため符号が逆で、ホストシミュレーション
(`android/.artifacts/headroom_guard_sim.cpp`、実機不要の数値検証ツール) で:

- 「−6.5dB preamp + +12dB@80Hz」（まさに実際のキャリブ構成）で stackedPeak が +1.38dB と
  誤算され、**ガードが全く作動せず 80Hz が +9.62dB のまま**＝機能目的を達成できないことを検出。
- `+ log(makeup)` に修正後、同構成で stackedPeak=+9.61dB > 6.0 → trim −3.61dB →
  80Hz=+6.01dB キャップ、形状 +11.84dB 保存。既存テスト t04 (preamp+6dB 絶対+6dB) は
  天井ちょうど＝トリム無しで非破壊。現実的なキャリブ3帯プロファイル (stackedPeak +4.39dB) は
  ガード非活性で無害。`NativeAudioEngine.cpp` とシミュレーション双方を修正済み。

## 5. 既存テスト影響の分析（すべて非破壊を確認）

- DspVerificationTest t01/t03 (バイパス透明性): preamp 0 → ガード非活性。
- t04 (+6dB preamp 絶対): 天井ちょうど → 厳密 `>` 判定で不作動。数値検証済み。
- t05 (−6dB preamp loudness-matched): makeupが打ち消し、peakPost≈0dB → 非活性。
- t07/t08/t09 (EQ段): ガードはブロードバンドトリムなので t07 の相対測定は不変。
  t08/t09 は絶対dB >4.0dB の主張だが、単一带域+8dB の peakPost は +8dB>6 でトリム →
  約+6dB で依然 >4.0dB を満たす。
- t20/t21 (リミター透明性/有界性): ソフトクランプは ±2.0 以下ビット同一 → 影響なし。
  t21 は入力2.0の正弦 → ソフトクランプ通過域だが出力は依然 ≤1.001。
- NightCompressorDistortionTest: NIGHT曲線は低ゲイン（+3/+1/+2/−4.5dB）、
  peakPost は天井未満 → ガード非活性、THD検証は不変。
- Web UI のプリセット (src/dsp/presets.ts): 最大ブースト +5dB (13kHz) → 非活性。
- キャリブレーション: preampGainDb は全て負値 (-4.2〜-6.5)、calibScale 0.5既定。
  ブースト補正帯が十数dBに達するホットなカスタム設定でガードが働く（＝望んだ動作）。

## 6. 検証状況

- ✅ `./gradlew :app:externalNativeBuildDebug` 成功（修正後再ビルド込み）
- ✅ `./gradlew :app:compileDebugAndroidTestJavaWithJavac` 成功
- ✅ ホストシミュレーション (`headroom_guard_sim.cpp`) で5シナリオの数値妥当性を確認
- ⬜ **実機テスト未実行**: `./gradlew :app:connectedDebugAndroidTest`（デバイス接続必須）。
  新規テストは HeadroomGuardVerificationTest の4件、既存回帰は DspVerificationTest /
  NightCompressorDistortionTest。logcat はタグ HEADGUARD / BisceneNativeV4。
- ⬜ 実機での主観確認（DSD楽曲、キャリブレーション最大強度、大音量立ち上がり）。

## 7. トレードオフ・既知の制限

- 天井 +6.0dB は既存契約 (t04=+6dB通過, t08/t09=>4dB) と両立するよう選定。より厳しく
  （例 +3dB）する場合は DspVerificationTest t04/t08/t09 の期待値更新が必要。
- ガードは設定ゲイン（静的）に基づくため、遅い曲全体に ReplayGain +12dB を掛けても
  キャップされる（コンテンツ非依存、常に安全側）。ラウドネス正規化の効果上限は約+6dB。
- ガードは preamp+EQ+makeup の静的線形スタックのみが対象。tube/ambience/restoration 等の
  プロセッサ依存ステージはランタイムの TruePeakLimiter + ソフトクリップが担う。
- makeup の「+12dBキャップ・減衰しない」下限は既存のまま。ガードは makeup とは独立した
  atomic (`eqGuardLin`) なので、ログで両者を区別可能。

## 8. 変更ファイル一覧

- `android/app/src/main/cpp/NativeAudioEngine.cpp` — G1ガード本体、ヘッダコメントV6.5追記
- `android/app/src/main/cpp/dsp/TruePeakLimiter.cpp` — G2ソフトクランプ
- `android/app/src/androidTest/java/com/bisen/biscene/dsp/HeadroomGuardVerificationTest.java` — 新規
- `android/.artifacts/headroom_guard_sim.cpp` — ホスト数値検証ツール（ビルド対象外）

## 9. 次のチャットでの推奨ステップ

1. 実デバイスで `connectedDebugAndroidTest` を実行し、HEADGUARD 4件 + 既存回帰を緑に。
2. 直近機能 (DSD 大音量・キャリブ強度100%・立ち上がりの鋭い音) の主観確認。
3. 天井値 `kGuardCeilingDb` (NativeAudioEngine.cpp 私有定数) を聴き比べで微調整。
   変更時は本ドキュメント §5 のテスト期待値と HeadroomGuardVerificationTest の範囲を追従。
4. （任意）Web UI に「ゲイン制限作動中」表示を出すなら、既存の `nativeGetPeaks` 相当の
   JNI 経路で `eqGuardLin` を渡す拡張が可能（今回未実装）。
