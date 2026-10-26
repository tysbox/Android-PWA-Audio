# ネットワークオーディオ再生：ネイティブPCM転送方式の実装依頼 (v1.0)

## 1. 目的
Biscèneオーディオアプリにおいて、Android WebViewのセキュリティ制限（Tainted Mediaによる無音化）を完全に回避し、Soundgenic等のUPnPサーバー音源に対して既存のWeb Audio DSPを100%適用した状態で音を鳴らす。

## 2. 実証済みの方程式 (PoC成功)
`<audio>`タグと`MediaElementSource`の組み合わせはWebViewのセキュリティで遮断されるが、以下の「方式R1」が実機で動作することを確認済みである。

### 方式R1 (Native PCM Transporter):
1. **Native (Java)**: `MediaCodec` を使用してDLNA URLからデータを取得し、PCM (Float32 Little Endian, 2ch, 96kHz) にデコード。
2. **Transfer**: アプリ内ローカルポート (localhost) でHTTP/WebSocketサーバーを立て、生のPCMデータをストリーミング配信。
3. **Web (AudioWorklet)**: `fetch()` または `WebSocket` でデータを受信。`AudioWorkletProcessor` のリングバッファに蓄積。
4. **Output**: 既存のDSPグラフ（EQ、アンビエンス等）の入力として波形を流し込む。

## 3. 具体的な実装要件

### A. Androidネイティブ側 (`UpnpSsdpBridge.java`)
- `MediaCodec` + `MediaExtractor` によるユニバーサル・デコーダーの実装。
- 指定された `targetUrl` を読み込み、リアルタイムで PCM (Float32LE) に変換。
- 内部Webサーバーで `/pcm_stream` エンドポイントを公開。
- 周波数が異なる（44.1k/48k/192k等）場合も、ネイティブ側で 96kHz にリサンプリングして供給（WebView側の負担軽減）。

### B. Web側 (`AudioEngine.ts` / `AudioWorklet`)
- `PcmStreamProcessor` (AudioWorklet) の実装。
- ネットワーク再生時、このWorkletノードを生成し、ネイティブサーバーからデータを `fetch`。
- 受信した Float32 配列をリングバッファ経由で `process()` 関数へ。
- 既存の `sourceBus` (GainNode) に接続し、すべてのDSPを有効化。

## 4. 参照コード
- 現行 `UpnpSsdpBridge.java`: UPnPブラウズ/検出ロジック（安定版）。
- 現行 `AudioEngine.ts`: 既存の Web Audio グラフ構造。
- PoC結果: `.artifacts/a6d8e5c6-b83a-456a-bf38-ffa8740514c3/scratch/` 内の `poc.js`, `pcm-server.mjs`。

## 5. 指示
Gemini 1.5 Pro において、上記「方式R1」に基づき、既存の `UpnpSsdpBridge.java` と `AudioEngine.ts` を統合・拡張するコードを生成せよ。
特に、ネットワーク再生を「ローカル再生と全く同じ信頼された波形データ」として扱うことで、Android 10〜14の無音化問題を物理的に解決すること。
