# 引き継ぎ【達成】: DSD/PCM 歪み対策 — 積み上げゲイン抑制機能 (V6.5 G1/G2)

作成日: 2026-10-17 / ブランチ: `feature/gapless-phase-v5`
実装コミット: `74d914a` → `9e5039c`（push済・origin同期済）
前文書: `HANDOVER_HEADROOM_GUARD.md`（未検証状態で記録された当初版）

> 本文書は前文書に対する**達成報告**である。前文書の課題（実機テスト未実行・主観確認未実施）は
> すべて完了した。**残務（課題）はゼロ**である。以下に「検証済み事項」と「確定した内容」を明示する。

---

## 1. 結論（先に答える）

- **ピーク制御構造は成立し、実機で検証された。** サインエラー修正後の
  `recomputeMakeup()` 計算式が意図どおりに機能し、キャリブ由来の積み上げを +6dB に
  キャップしながら EQ 曲線形状（ティンバー）を保存することを数値的に実証した。
- **既存の全契約を破壊していない。** DspVerificationTest（t01〜t25）、
  NightCompressorDistortionTest（3件）は非破壊のまま全通過。
- **主観的音質確認も完了。** ユーザーによる実機リスニングをもって本機能は達成。
- **テストスイート全体が完全グリーン。** 32 PASSED / 0 FAILED（旧 FAIL の Capacitor
  スキャフォールドテストは削除済み）。

**残務（課題）はゼロ。** 経緯は §6 に記録として残している。

---

## 2. 前文書からの変更点（未検証 → 検証済）

| 前文書 §6 の記載 | 今回の結果 |
|---|---|
| ⬜ 実機テスト未実行 | ✅ **実行・通過**（`MAR-LX2J`、serial `STPDU19515004014`） |
| ⬜ 実機での主観確認 | ✅ **ユーザーが実機リスニング完了、歪み解消を確認** |
| ⬜ HEADGUARD 4件 + 既存回帰を緑に | ✅ **HEADGUARD 4/4 PASS、既存回帰 32/32 PASS** |
| ⬜ `headroom_guard_sim.cpp` 紛失 | ✅ **作成不要と判断**（実機テストで代替検証したため。§6 参照） |
| ⬜ Capacitor スキャフォールドテスト FAIL | ✅ **解消**（テスト削除 + runner 依存の明示化。§6 参照） |

---

## 3. 実装内容（確定済・変更なし）

実装は `9e5039c` のコミット内容と完全に一致する。以下は要点のみ。

### V6.5 G1 — 積み上げゲイン抑制ガード (`NativeAudioEngine.cpp`)

- `biquadLogMag()` ヘルパーを新設（既存の24点 geometric-mean 計算と同一数学、重複排除）。
- `DspInstance` に追加メンバー:
  - `kGuardCeilingDb = 6.0f`（天井）
  - `kEvalPts = 192`、`evalFreq[192]`（20Hz〜20kHz ロググリッド、コンストラクタで固定構築）
  - `eqEvalLog[192]`（3段EQ合成対数応答）
  - `std::atomic<float> eqGuardLin{1.0f}`
- `setEqCoeffs()`: 3段全バンドの合成応答を192点グリッドで評価して `eqEvalLog` を更新
  （更新時のみ、ダイヤル操作一回あたり約0.5MFLOP）。
- `recomputeMakeup()`:
  ```
  peakPostDb = (log(pLin) + peakEqLn + log(makeup)) * 8.6859
  ```
  が**最悪周波数での実効絶対積み上げゲイン**。`> +6.0dB` のとき
  `guard = exp((6.0 - peakPostDb)/8.6859)` を `eqGuardLin` に格納、logcatにINFO出力。
  - `makeup` は信号に**乗算**されるため `+ log(makeup)` が正（サインエラー修正後の確定形）。
- `process()`: `mk = eqMakeupLin × eqGuardLin` を既存の1回の乗算ループで適用
  （オーバーヘッドゼロ、スレッドセーフは atomic 読み取り）。

### V6.5 G2 — リミッター入力ソフトクランプ (`dsp/TruePeakLimiter.cpp`)

- 硬い `±4.0` クランプを `±2.0` までビット同一、超過域は C1連続 tanh 飽和
  （`2.0 + 0.5*tanh((x-2.0)*2.0)`、漸近線 ±2.5）に変更。検出器入力は引き続き有界。

### テスト (`HeadroomGuardVerificationTest.java`、4件)

| ID | 検証内容 | 期待値 | 実機結果 |
|---|---|---|---|
| t01 | preamp +4dB は天井未満なので通過（ガード非活性） | 4.00 ± 0.25 dB | ✅ PASS |
| t02 | キャリブ構成（−6.5dB + +12dB@80Hz Q0.8）→ 80Hz绝对ゲインを天井付近にキャップ、かつ曲線形状を保存 | 80Hz が 4.5〜7.0 dB、shape > +6.0 dB | ✅ PASS |
| t03 | preamp +12dB（loudness正規化の最悪ケース）→ 約+6dBにキャップ | 5.4〜6.8 dB | ✅ PASS |
| t04 | フルスケール0.95の正弦波をホット構成へ → peak ≤1.001、THD<5%、有限値 | peak ≤1.001, THD<5% | ✅ PASS |

---

## 4. 実機テスト結果（証拠）

- **デバイス**: `MAR-LX2J`（Huawei、serial `STPDU19515004014`、Android 10）
- **実行**: `./gradlew :app:connectedDebugAndroidTest`
- **個別実行**: `-Pandroid.testInstrumentationRunnerArguments.class=com.bisen.biscene.dsp.HeadroomGuardVerificationTest`
  → **4/4 PASSED**
- **全体結果**: `32 PASSED, 0 FAILED`（更新後・確定版）
  - 旧実行時は `com.getcapacitor.myapp.ExampleInstrumentedTest > useAppContext` が
    `expected:<com.getcapacitor.app> but was:<com.bisen.biscene>` で FAIL していたが、
    これは applicationId 変更により陳腐化した Capacitor スキャフォールドの定型アサーションで、
    **DSPロジックとは無関係**だった。§6 の対応により解消し、現在は完全グリーン。

### 特に重要な実証（サインエラー修正後の構造が機能した証拠）

t02 は「まさに旧バグが見逃していた構成」（preamp −6.5dB + ブースト帯の積み上げ）である。

- 80Hz 絶対ゲインが **+6dB 付近にキャップ**された → ガードが**実際に作動**
- shape（80Hz − 1kHz）が **+6dB 超を維持** → ブロードバンドトリム設計の意図どおり
  ティンバーが保存された

これは `peakPostDb` への `+ log(makeup)` が正しい符号であることの、実機による裏付けである。

---

## 5. 既存テスト影響（非破壊・実機で確認済）

前文書 §5 の分析どおり、すべて非破壊であることが実機結果で裏付けられた。

- **DspVerificationTest**
  - t01/t03（バイパス透明性）: preamp 0 → ガード非活性 ✅
  - t04（+6dB preamp 絶対）: 天井ちょうど → 厳密 `>` 判定で不作動 ✅
  - t05（−6dB preamp loudness-matched）: makeupが打ち消し、peakPost≈0dB → 非活性 ✅
  - t07/t08/t09（EQ段）: ガードはブロードバンドトリムなので相対測定は不変。
    単一 +8dB 帯域の peakPost は +8dB>6 でトリムされ約+6dB に落ちるが、
    `>4.0dB` の主張は維持 ✅
  - t20/t21（リミッター透明性/有界性）: ソフトクランプは ±2.0 以下ビット同一 ✅
  - その他 t02, t06, t10〜t19, t22〜t25 ✅
- **NightCompressorDistortionTest**（3件）: NIGHT曲線は低ゲイン → ガード非活性 ✅
- **Web UI プリセット** (`src/dsp/presets.ts`): 最大ブースト +5dB → 非活性
  - STUDIO / JBL / PLANAR / LOUD / CRYSTAL 等の最大値は +3.0dB〜+5.0dB。
    天井 +6.0dB 以下なのでガードは作動しない。実機聴感でもプリセット音色は変化なし。

---

## 6. 残務・課題（**ゼロ**）

### 解消済み: Capacitor スキャフォールドテストの陳腐化

- **旧状態**: `com.getcapacitor.myapp.ExampleInstrumentedTest.useAppContext` が
  `expected:<com.getcapacitor.app] but was:<com.[bisen.biscene]>` で FAIL。
  applicationId 変更に伴いスキャフォールドの定型アサーションが陳腐化していた。
- **対応**: 未使用で実質価値のないスキャフォールドテストを削除し、
  空になった `com.getcapacitor.myapp` パッケージディレクトリも併せて除去した。

#### 【重要】対処中に踏んだ副作用とその修正（記録として残す）

espresso-core を「未使用」と判断して外したところ、テストが全滅した。

- **誤った前提**: 「Espresso のアサーションはどこにも使われていない」
- **実際**: espresso-core は `androidx.test:runner` を**推移的に提供**しており、
  それが `build.gradle` 12行目の `testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"`
  の実体クラスであった。外すと instrumentation 起動時に
  `ClassNotFoundException: androidx.test.runner.AndroidJUnitRunner` で即死する。
- **修正**: espresso-core は戻さず、必要物を明示宣言する形にした。
  ```
  androidTestImplementation "androidx.test:runner:1.7.0"
  ```
  `variables.gradle` の `androidxEspressoCoreVersion` も不要となったため削除済み。

> [!NOTE]
> 教訓: 「未使用に見える依存」は推移提供を確認してから外す。
> 失敗モードがテスト全滅（`ClassNotFoundException`）として現れるため、
> 依存樹の読み誤りは他箇所でも起こりうる。

### 対応不要と判断した項目

- **`headroom_guard_sim.cpp` の再構成**: 実機テスト（4件）と既存回帰（32件）で
  代替検証が完了したため、ホストシミュレーションの再作成は不要と判断した。
  前文書 §4 のシミュレーション検出内容（サインエラーの発見）は履歴的記録として
  前文書に残っている。
- **`.DS_Store`**: macOS のフォルダメタデータ。tracked ではあるが中身に意味はなく、
  `git status` の恒常的ノイズ源になっている。中断リスクを取るほどの価値はないため据え置く。
  （対応するなら `.gitignore` に追加し `git rm --cached .DS_Store`）

---

## 7. トレードオフ・既知の制限（確定版）

- 天井 +6.0dB は実機テストで両立を確認。より厳しく（例 +3dB）する場合は
  `kGuardCeilingDb` を変更し、DspVerificationTest の t04/t08/t09 と
  HeadroomGuardVerificationTest の t02/t03 の期待値を追従させること。
- ガードは設定ゲイン（静的）に基づくため、遅い曲全体に ReplayGain +12dB を掛けても
  キャップされる（コンテンツ非依存、常に安全側）。ラウドネス正規化の効果上限は約+6dB。
- ガードは preamp+EQ+makeup の静的線形スタックのみが対象。
  tube/ambience/restoration 等のプロセッサ依存ステージはランタイムの
  TruePeakLimiter + ソフトクリップが担う。
- makeup の「+12dBキャップ・減衰しない」下限は既存のまま。
  ガードは makeup とは独立した atomic (`eqGuardLin`) なので、ログで両者を区別可能。

---

## 8. 変更ファイル一覧（確定版）

- `android/app/src/main/cpp/NativeAudioEngine.cpp` — G1ガード本体、ヘッダコメント V6.5 追記
- `android/app/src/main/cpp/dsp/TruePeakLimiter.cpp` — G2ソフトクランプ
- `android/app/src/androidTest/java/com/bisen/biscene/dsp/HeadroomGuardVerificationTest.java` — 新規・実機 PASS
- `HANDOVER_HEADROOM_GUARD.md` — 当初の引き継ぎ文書（未検証時の記録として保存）

### 残務解消対応（後追いコミット）で変更したファイル

- `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` — **削除**（陳腐化したスキャフォールドテスト）
- `android/app/build.gradle` — espresso-core 依存を除去、`androidx.test:runner:1.7.0` を明示宣言
- `android/variables.gradle` — `androidxEspressoCoreVersion` を削除

---

## 9. 次の担当者への申し送り

1. 本機能は**完成**している。追加作業は不要。
2. 残務はゼロ。テストスイートは完全グリーン。
3. 天井値 `kGuardCeilingDb` を微調整する場合は §5 のテスト期待値を追従させること。
   （デフォルト +6.0dB は既存契約と両立する実測済みの値なので、変更の推奨はしない）
4. Web UI に「ゲイン制限作動中」表示を出す場合は、既存の `nativeGetPeaks` 相当の JNI
   経路で `eqGuardLin` を渡す拡張が可能（今回未実装・任意）。
