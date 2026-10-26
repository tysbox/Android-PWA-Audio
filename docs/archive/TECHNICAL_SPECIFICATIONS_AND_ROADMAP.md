# Biscene DSPSystem - Technical Specifications & Development Roadmap (V4 Functional Edition)  
  
## 1. Core Audio Architecture & Mastering Pipeline  
  
### 1.1 内部演算精度とパイプライン最適化  
* **Internal Resolution**: 96kHz / 32-bit Floating Point (Single Precision) 処理を維持・固定。  
  * **工学的根拠**: 32-bit Float の仮数部24-bitが担保する約144dBのS/N比および約1528dBの内部ダイナミックレンジは、現行最高峰のDACチップの物理的熱雑音限界（実効S/N比 130dB〜135dB）を完全に上回る。64-bit Float化に伴うメモリ帯域幅の倍増、ARM NEON SIMD並列処理効率の低下（4並列→2並列）、低電力コアでのバッテリー消費およびサーマルスロットリングのリスクを排除し、32-bit FloatでのSIMD極限最適化を最優先とする。  
* **True Peak Safety Limiter（最終段サイレント常駐）**:  
  * **オーバーサンプリング**: 4倍インターポレーション（FIRベース）による先読み（Lookahead 1.0ms）True Peak検出。  
  * **特性**: 0dBFS超のインターサンプル・ピーク（ISP）のみを対象とする透過的ソフトニー（Soft-Knee）リミッター。ポンピング（音量変動感）のないオートリリースアルゴリズムを採用し、DAC側でのアナログ波形クリッピングを完全に防止。  
* **ディザリングエンジン**:  
  * 32-bit FloatからDAC向け出力（16-bit / 24-bit / 32-bit Integer）への変換最終段に、TPDF（Triangular Probability Density Function）ディザリングを常時適用。  
  
### 1.2 総合伝達関数（Composite Transfer Function）解析エンジン  
* **周波数バイアス高速合成エンジン**:  
  * トリプルEQ（Headphone Calibration + Source EQ + Virtual Acoustic）、Tube倍音特性、および空間クロスフィードのピンナ/シャドウフィルタを統合した「総合周波数バイアス」をリアルタイム算出。  
  * 各段のIIR二重二次フィルタ（Biquad）係数およびFIR伝達関数を周波数領域（20Hz〜40kHz、対数分割512ポイント）で事前合成（LUT参照化）。描画および解析リクエストに対して、オーディオリアルタイムスレッドに一切の負荷をかけずに即時応答する分離アーキテクチャを採用。  
  
---  
  
## 2. 空間クロスフィード ＆ 仮想音響空間 (Spatial & Virtual Acoustic Matrix)  
  
### 2.1 5×5 空間クロスフィード・マトリクス (Spatial Crossfeed Matrix)  
頭部音響伝達関数（HRTF）の物理モデリングに基づき、時間軸（ITD）と周波数軸（ILD）を独立制御する5×5の空間定位マトリクス。  
  
* **角度軸制御（Width: 15° / 30° / 45° / 60° / 90°）**:  
  * **ITD（両耳間時間差）**: Woodworth球面頭部モデルに基づき、対側耳への到達遅延をサブサンプル精度（分数次ディレイ補間）で0.0ms〜0.65msの範囲で動的印加。  
  * **ILD（両耳間レベル差）**: 頭部回折（Spherical Head Diffraction）による対側耳の高域シャドウイングを、角度に応じたIIRシェトリングフィルタにて減衰。  
  * **耳介（ピンナ）ノッチ補正**: 頭蓋内定位の解消を目的とし、角度の拡大に伴い6kHz〜8kHz帯の物理干渉ノッチの深さとQ値を適応的にシフト。  
* **距離軸制御（Depth: Intimate / Near / Normal / Far / Deep Space）**:  
  * **近接効果（Proximity Effect）**: Intimate/Near配置時、球面波の近接場特性に準拠した極低域（60Hz以下）の微小ブースト（最大+2.0dB）を付与。  
  * **D/R比（Direct-to-Reverberant Ratio）制御**: 距離拡大に応じて直接音を逆二乗則（$1/r$）に準拠して減衰させ、初期反射音（Early Reflections: 5ms〜30msのディスクリートパルス群）の混合比を増加。  
  * **空気吸音（Air Absorption）**: Far/Deep Spaceにおいて、空気の粘性抵抗による10kHz以上の超高域の微小ロールオフを適用。  
  
### 2.2 仮想音響空間（Virtual Acoustic Mode）  
旧OUTPUT段EQを発展させ、室内音響の材質特性（吸音・反射スペクトル）を再現する周波数プロファイル。残響時間（Late Reverb）を担当するコンボリューション（IR）エンジンと完全に分離し、音の濁りを防止。  
  
* **役割定義**: 時間遅延やテール残響を一切持たず、「初期壁面反射の周波数吸収特性」のみを成形。  
* **マテリアル・プロファイル**:  
  * **Pure**: 補正なし（完全フラット）。  
  * **Studio Reference**: 不要な低域共振（150Hz〜250Hz）をタイトに引き締め、中高域の分解能を担保するモニタールーム特性。  
  * **Warm Wood**: 高域を0.8dB/octで極めて緩やかにロールオフし、中低域（200Hz〜500Hz）に温かみを付加する木勢音響空間特性。  
  * **Airy Glass**: 吸音の少ない硬質空間を模し、8kHz以上のトランジェントと空気感を際立たせるブライト特性。  
  
---  
  
## 3. ロッシー音源復元エンジン (High-Fidelity Restoration Engine)  
  
非可逆圧縮（MP3, AAC, SBC, Opus等）によって失われたスペクトル、時間軸解像度、過渡応答を自動再構築する専用DSP。  
  
### 3.1 制御仕様  
* **バイナリ制御（完全ON / OFF）**: 内部処理の複雑さに関わらず、外部トリガーはON/OFFのみのバイナリ制御。  
* **等音量クロスフェード切替**: 切り替え時に20msのイコールパワー（等エネルギー）クロスフェードを実行し、無音やプチノイズを一切挟まないシームレスな瞬時A/B比較を実現。  
* **ビットパーフェクト・パススルー（自動バイパス）**: ロスレス音源（FLAC, ALAC, WAV, AIFF）およびハイレゾ/DSD入力時は、復元処理エンジンを1bitも通過させず完全自動バイパス。  
  
### 3.2 信号処理アルゴリズム  
* **スペクトル再帰合成（Harmonic Extrapolation）**:  
  * 圧縮コーデック特有のブリックウォール・ローパスフィルタ（16kHz〜20kHzの急峻なカットオフ境界）を自動検出。  
  * 10kHz〜16kHzに残存する基底帯域の倍音構造をFFT解析し、自然な対数減衰（-6dB/oct〜-12dB/oct）カーブに沿って24kHz〜32kHzまでの高周波倍音成分を数学的アルゴリズムで外挿合成。  
* **トランジェント・パンチ復元（Transient Punch Restorer）**:  
  * MDCT変換の時間窓境界で劣化した過渡信号（ドラムのアタック、撥弦音）を検出。  
  * ウェーブレット解析を用いてアタック初動（数ミリ秒間）の立ち上がりスロープを急峻化し、圧縮で損なわれたダイナミクスのアタック感を回復。  
* **プリエコー抑制フィルタ（De-Pre-Echo Filter）**:  
  * 強大なトランジェントの直前に現れる逆リンギングノイズ（プリエコー）を動的検知し、心理音響マスキング閾値以下へ局所ダッキング。  
  
---  
  
## 4. 真空管物理モデリング (Tube Saturation & Bias Engine)  
  
単なる非線形クリッパー（tanh歪み）を超え、真空管アンプ回路の物理的振る舞いを数式モデリングした倍音付加機能。  
  
### 4.1 真空管キャラクター・トポロジー  
* **Triode (300B 直熱三極管モデリング)**:  
  * **倍音構成**: 偶数次高調波（第2次高調波主体）を滑らかに付加。  
  * **音響特性**: 位相の微小な非対称性により、音場に奥行き感と中域の艶・滑らかさを付加。  
* **Pentode (KT88 ビーム出力管モデリング)**:  
  * **倍音構成**: 奇数次高調波（第3次・第5次高調波）を適度に包含。  
  * **音響特性**: 音の立ち上がりレスポンスを高め、低域のパンチ力と全体的なダイナミックな押し出し感を強化。  
  
### 4.2 コア・パラメータアルゴリズム  
* **Bias Control（動作点バイアス調整）**:  
  * 歪み量（Drive）ではなく、伝達曲線の「動作点（Operating Point）」をシフト。  
  * クリーン領域から徐々にA級アンプの動作限界点へ移動させることで、入力振幅に応じた自然な倍音密度と非線形圧縮カーブを無段階制御。  
* **電源サグシミュレーション（Power Supply Sag Effect）**:  
  * 大振幅の低域信号が連続入力された際、整流回路および電源コンデンサの内部抵抗により発生するB+電圧の微小降下（Sag）をエミュレート。  
  * 急峻なピークに対する有機的かつ音楽的なダイナミック・コンプレッションを再現。  
  
---  
  
## 5. リスニングWikiアーキテクチャ (Listening Wiki Data Hub)  
  
自前でディスコグラフィ等の巨大データベースを保持せず、音源メタデータをキーとして知的好奇心を満たすための「情報ハブ」に特化した外部連携アーキテクチャ。  
  
### 5.1 データソース統合とフィンガープリンティング  
* **ハイブリッド同定エンジン**:  
  * ID3 / Vorbis Comments / MP4 Atoms の既存メタデータをパース。  
  * タグ情報が欠落または不正な場合、AcoustID（Chromaprint音声フィンガープリント）を用いてバックグラウンドでトラックを自動識別。  
  * MusicBrainz APIおよびDiscogs APIから該当盤のマスタリング・クレジット情報を非同期フェッチ。  
  
### 5.2 3カテゴリ・データ構造  
取得データを以下の3領域に正規化・構造化して保持。  
1. **People & Studio**:  
   * Producer, Recording Engineer, Mixing Engineer, Mastering Engineer, Recording Studio, Mastering Facility.  
2. **Audio Gear & Heritage**:  
   * Recording Microphones, Mixing Console, Tape Machine / Master Recorder, Dynamic Processors.  
3. **Master Spec & Provenance**:  
   * Release Year, Recording Year, Matrix / Catalog Number, Dynamic Range Score (DR Meter算出値), Remaster History.  
  
### 5.3 スマート・アンカー（外部ブラウザ連携インテント）  
* アプリ内での不要なWeb描画エンジン（WebView）の重層保持を廃止。  
* 人名、スタジオ名、機材名の各エンティティに外部検索パラメータをバインド。  
  * 例: `[Entity: "Rudy Van Gelder"]` ➔ `https://www.google.com/search?q=Rudy+Van+Gelder+discography`  
  * 例: `[Entity: "Neumann U47"]` ➔ `https://www.google.com/search?q=Neumann+U47+microphone+history`  
* システム標準ブラウザまたはCustom Tabsへ最小リソースでインテント送出し、アプリ本体のフットプリントを最小化。  
  
---  
  
## 6. DSPプリセットライブラリ ＆ システム最適化  
  
### 6.1 DSPプリセットライブラリ・エンジン  
プレイリスト構造を排除したストイックな再生思想に基づき、音楽鑑賞のコンテキストを「DSP音響空間のプリセット」として保存・リコールするシステム。  
  
* **プリセット保持データ構造（スナップショット）**:  
  * Triple EQ設定（Calibration EQ, Source EQ, Virtual Acoustic Mode）  
  * 空間クロスフィード設定（Angle [15°〜90°], Distance [Intimate〜Deep Space]）  
  * Tube Emulator設定（Tube Type [300B/KT88], Bias Value）  
  * Lossy Restore状態（強制バイパス / 自動適応）  
  * Convolution Ambience設定（IR Kernel, Dry/Wet比）  
* **シームレス・リコール**:  
  * プリセット読み込み時、全Biquadフィルタ係数およびディレイバッファを補間しながら更新し、再生音のグリッチ（ジッパーノイズ）を完全に防止。  
  
### 6.2 DSD再生仕様の合理化  
* **実用性重視のPCMデシメーション**:  
  * 過剰なCPUリソースを消費する超高次リアルタイム処理を排し、64-tap Hann-windowed FIR（Decimation Ratio R=32/64）による96kHz / 24-32bit Float PCM変換を最適化。  
  * FLACと同等の極小バッファリングレイテンシおよび完全ギャップレス遷移を担保。バッテリー消費を抑え、安定再生を最優先。  
  
### 6.3 RAMディスク・プリキャッシュ（Zero-Jitter Storage Engine）  
* **メモリ展開アーキテクチャ**:  
  * DLNA/UPnPネットワークストリームおよびローカルSAF経由のファイル再生時、次曲のデコード済みPCM（または生ストリームデータ）を専用RAM領域（最大64MB）へバックグラウンド先読み展開。  
  * 再生中の物理ストレージ（NAND）アクセスおよびWi-Fiパケット受信によるCPU割り込みスパイクを極小化し、完全オンメモリ再生を実行。  
  
---  
--- END OF FILE ---  
