# Biscene DSPSystem - 開発指針 / Development Direction (V4)

Biscene DSPSystemは、モバイルリスニングを「単なる再生」から「至高の空間体験と知的な探求」へと昇華させることを目指します。
Biscene DSPSystem aims to elevate mobile listening from "mere playback" to "supreme spatial experience and intellectual exploration."

---

## 1. 空間クロスフィード・マトリクス / Spatial Crossfeed Matrix
**「物理的なスピーカー配置を耳元で再現する」 / "Reproducing physical speaker placement in your ears."**

現在の左右を混ぜるだけのクロスフィードを超え、時間軸（ITD）と周波数特性（ILD）を制御し、5x5の空間マトリクスを実装します。
Going beyond current L/R mixing, we will implement a 5x5 spatial matrix by controlling Interaural Time Difference (ITD) and Interaural Level Difference (ILD).

### 📐 角度の5段階 / 5-Step Angle Control (Width)
*   **Narrow (15°)**: 密度の高いセンター定位。 / Dense center localization.
*   **Desk (30°)**: ニアフィールド配置の再現。 / Near-field desktop simulation.
*   **Standard (45°)**: 理想的なリスニングルーム。 / Ideal listening room setup.
*   **Wide (60°)**: 左右に広がるステージ感。 / Expansive stage width.
*   **Ultra-Wide (90°)**: 真横まで届くサラウンド体験。 / Surround-like 180° experience.

### 📏 距離の5段階 / 5-Step Distance Control (Depth)
*   **Intimate**: アーティストが目の前にいる感覚。 / Feeling the artist directly in front of you.
*   **Near**: 手の届く範囲のリアリティ。 / Realistic "within reach" distance.
*   **Normal**: バランスの取れた標準的な距離。 / Well-balanced standard distance.
*   **Far**: ホールの奥行きを感じる遠方定位。 / Distant localization with hall depth.
*   **Deep Space**: 空間の響きを最大限に活かした深淵。 / Abyssal depth utilizing maximum spatial resonance.

---

## 2. Lossy音源の救済 / High-Fidelity Restoration for Lossy Audio
**「圧縮で失われた感動の復元」 / "Restoring the emotion lost in compression."**

MP3やストリーミング音源（AAC等）を、ハイレゾ並みの空気感へ引き上げます。
Elevating MP3 and streaming sources (AAC, etc.) to High-Res quality airiness.

*   **高域倍音再構築 / Neural Harmonic Reconstruction**: 20kHz以上の倍音成分をAI/アルゴリズムで生成。 / Synthesizing harmonics above 20kHz using AI/algorithms.
*   **ダイナミックレンジ回復 / Dynamic Range Recovery**: 圧縮で潰れたトランジェント（音の立ち上がり）を復元。 / Restoring transient punch flattened by compression codecs.
*   **アーティファクト抑制 / Artifact Suppression**: 圧縮特有の濁りや「シュワシュワ音」をクリーンアップ。 / Cleaning up muddy artifacts and "watery" digital noise.

---

## 3. リスニングWiki / The "Listening Wiki" Experience
**「音楽を立体的に楽しむための百科事典」 / "An encyclopedia for three-dimensional music enjoyment."**

再生中の楽曲の背景にある「物語」と「技術」を可視化します。
Visualizing the "story" and "technology" behind the track currently playing.

*   **技術情報（ライナーノーツ） / Technical Liner Notes**: 録音マイク、スタジオ名、エンジニア情報の自動表示。 / Auto-display of recording mics, studio locations, and engineers.
*   **インタラクティブ・バイオグラフィ / Interactive Biographies**: アーティストの歴史や関連作品を瞬時に表示。 / Instant access to artist history and related discography.
*   **オーディオファイル・インサイト / Audiophile Insights**: 伝説的な録音セッションで使用された機材の深掘り。 / Deep dives into gear used in legendary recording sessions.

---

## 戦略目標 / Strategic Vision
1.  **Mobile First**: モバイル環境（イヤホン）で世界最高の音を実現する。 / Achieving world-class sound specifically for mobile/headphone environments.
2.  **Intellectual**: 聴くだけでなく、音楽を深く知る喜びを提供する。 / Providing the joy of deep musical knowledge, not just listening.
3.  **Unique**: 市販のプレイヤーが辿り着けない「ずば抜けた」機能に特化する。 / Specializing in "outstanding" features that commercial players cannot match.
