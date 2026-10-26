# Phone Calibration & Recalibration 操作マニュアル

BiScene Audio の **Phone Calibration（イヤホン・ヘッドホンキャリブレーション＆リキャリブレーション）** 機能に関する解説および操作マニュアルです。

---

## 1. 機能概要

本機能は、お使いのイヤホン/ヘッドホン固有の周波数レスポンスの偏りを補正（キャリブレーション）し、さらに目的の他機種の音響特性を再現（リキャリブレーション）するための Web Audio DSP モジュールです。

AutoEq の 10バンド Parametric Biquad フィルタ演算エンジンを搭載し、リアルタイムで正確な周波数レスポンス補正を実現します。

---

## 2. キャリブレーション＋リキャリブレーションの原理

本システムでは、以下の 2段階の音響処理処理を行うことで、**「手持ちのヘッドホンで別の憧れの機種の音響サインを再現する」** ことを可能にしています。

```text
[再生音源]
   │
   ▼
1. 較正 (Calibration)
   お持ちのイヤホン（例: HIFIMAN Deva Pro）固有の周波数癖（低域の凹み・高域の刺さり等）に
   対して逆特性を掛け合わせ、周波数特性を平坦（Harman Flat Reference）に初期化します。
   │
   ▼
2. 再較正 (Recalibration)
   フラットに整えられた音響空間に対して、再現したいターゲット機種
   （例: Shure SE846, AKG K702, Sennheiser HD650 等）の周波数特性（AutoEq Parametric EQ）を重畳します。
   │
   ▼
[目的の音響特性で出力 (例: HIFIMANでShureの音色を再生)]
```

---

## 3. 基本操作方法

### ① 現在のプロファイル確認と周波数カーブ（波形）の確認
1. 本体ミキサーパネルの **`Phone Calibration`** 枠に、現在有効なモデル名が表示されます。
2. **モデル名部分をタッチ（またはマウスホバー）** すると、上部のアルバムアートエリアに周波数レスポンス補正カーブ（波形）がオーバーレイ表示されます。

### ② 設定・プロファイル切り替え (`SET` ボタン)
1. ミキサーパネル右側の **`SET`** ボタンをタップすると、Phone Calibration 設定画面（ドロワー）が開きます。
2. 一覧から使用したいプリセット（Sony, Audio-Technica, Sennheiser, HIFIMAN, AKG, Shure 等）を選択します。
3. 選択すると即座に DSP フィルタ回路へ反映されます。

### ③ カスタムプロファイルの作成・インポート
1. ドロワー内の **`+ CREATE / IMPORT PROFILE`** ボタンをタップします。
2. ブランド名、モデル名、ターゲットカーブを設定し、10バンドの Parametric EQ（周波数 Fc、ゲイン Gain、Q値）を調整・登録します。
3. AutoEq のテキスト形式パラメータを貼り付けて即座にインポートすることも可能です。

### ④ Direct A/B 比較 & トーンコントロール
- **Direct A/B Switch**: 補正あり/なし（Flat Bypass）を1タップで切り替え、補正効果を瞬時に聴き比べられます。
- **Tube Saturation**: 偶数次高調波を付加する真空管サチュレーション回路のオン/オフを切り替えられます。

---

## 4. プロジェクトリポジトリでのファイル配置

- ドロワーコンポーネント: `src/components/HeadphoneCalibrationDrawer.tsx`
- カスタムエディタ: `src/components/CustomHeadphoneEditor.tsx`
- DSP音響定義・演算: `src/dsp/headphoneProfiles.ts`
- ローカルストレージ保持: `src/dsp/customProfileStorage.ts`
