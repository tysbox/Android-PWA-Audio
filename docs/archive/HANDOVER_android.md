# HANDOVER — DLNA / OpenHome renderer playback integration

## 0. 目的と現在の状態

この文書は、別セッションで DLNA renderer と OpenHome renderer の再生経路を安全に再開するための引き継ぎ資料です。

**現時点の結論（2026-09-24）:** レンダラーとして認識され、URI 単位の選曲が既存の `BiscenePlayerV2`／Native DSP 経路で鳴る部分は完了済みです。一方、OpenHome の playlist を renderer 側の正式なキューとして保持し、アルバム／フォルダの全曲を登録して 1 曲終了後に自動連続再生する部分は未実装です。今回の引き継ぎ更新で変更するのは `/Users/user/Desktop/BisceneDSPSystem/android/HANDOVER.md` だけで、ソースコード・Gradle 設定・APK・テスト成果物は変更しません。既存の未コミット差分があれば `reset`, `clean`, checkout で消さないでください。

要求は以下です。

- 通常のローカルファイル再生と通常のネットワーク再生は、既存の機能・性能・挙動を変更しない。
- DLNA renderer と OpenHome renderer だけが、既存の DSP player、session、metadata、UI通知経路を利用できるようにする。
- renderer 再生中も album art、再生時間、再生キューを既存表示系へ通知する。
- renderer 用の別DSP、別音楽エンジン、普通再生の置換を作らない。
- 最終 compile/test/assemble/lint、差分監査、可能な実機点検まで行う。

## 0.1 この文書を読む別チャットへの最優先案内

### 完了済み（ 基コミット `08bff08` に含まれる）

- ユーザー実機確認で「OpenHome renderer として認識される」「選択した曲が Native DSP 経由で再生される」までは完了。URI 単位の renderer 基盤は再実装せず、playlist 連続再生の接続点としてのみ拡張する。
- OpenHome / DLNA の URI 単位の `Play` で、選択した1曲を既存の `BiscenePlayerV2` / Native DSP 経路で再生
- renderer の metadata / productionInfo / album art / position / duration / current URI の通知
- `SetAVTransportURI` 単体では開始せず、`Play` で開始する DLNA の split 動作
- 通常 local / network 再生経路は置換していない

ユーザー実機確認で「認識される」「選択した曲が鳴る」「DSP が適用される」までは確認済みです。これは完了部分であり、削除・再実装の対象ではありません。

### 未完了（ 次のチャットで実装する機能）

- OpenHome `Playlist` を renderer 再生の正式な queue として、control point が送った album 全体の track 群を保持
- renderer natural end (`ENDED`) の後、playlist の next track を自動開始
- `Playlist.Play` / `Playlist.Seek` で album 内の任意の1曲から連続再生
- `Playlist.Move` / Remove / Read / ReadList を含む正式な playlist 操作と `IdArray` / `Id` event の同期
- album / folder 選択時に folder 全体の queue が renderer に入り、1曲終了ごとに次曲へ自動連続する
- current / next metadata の GENA event と、Transport state の自動同期

### 実際の未接続点（ コード上の根拠）

2026-09-24 時点の `rg` 結果:

```
DlnaPlaybackPlugin.java:311  public void playRendererInternal(RendererTrackRequest track, double seekSec)
OpenHomePlaybackController.java:45  onNext() { startTrack(server.playlistState().nextTrack(), 0.0); }
OpenHomePlaybackController.java:80  plugin.playRendererInternal(new RendererTrackRequest(track.uri, track.metadata), requestedSeek);
PlaylistState.java:172  public synchronized Track nextTrack() { ... }
```

`DlnaPlaybackPlugin` に `onRendererTrackEnded` / `onPlayerEnded` / `advanceAfterNaturalEnd` に相当するものが無く、`BisceneHttpProxy` に `onPlayerStateChanged(..., renderer ...)` の renderer 識別もありません。したがって `PlaylistState.nextTrack()` は手動 `onNext()` からしか呼ばれず、自然終了後に Folder / album queue へ自動遷移しません。これが「album フォルダを選択しても連続再生されない」主因です。

## 0.2 別チャットで最初に確認するファイル（調査ループを避けるため）

以下の5ファイルを最初に読み、以後の変更点のみを読むこと:

- `app/src/main/java/com/bisen/biscene/openhome/state/PlaylistState.java`
- `app/src/main/java/com/bisen/biscene/openhome/OpenHomePlaybackController.java`
- `app/src/main/java/com/bisen/biscene/DlnaPlaybackPlugin.java`
- `app/src/main/java/com/bisen/biscene/BisceneHttpProxy.java`
- `app/src/test/java/com/bisen/biscene/openhome/OpenHomeProtocolTest.java`

`PlaylistSoapHandler.java` は `Move` / `ReadList` の action 名・引数を確認するためだけに読む。`BiscenePlayerV2` 本体、`MediaCodecDecoder`、`PlaybackService`、`src/dsp/AudioEngine.ts` は当初編集しない。

## 0.3 別チャットで可能な最短実装案

1. `PlaylistState` に renderer queue の自然終了専用 `advanceAfterNaturalEnd()`（末尾到達で `null`）と `getNextTrack()` を追加。`nextTrack()` 既存 semantics は手動 Next 用に残す。
2. `OpenHomePlaybackController` に `onRendererTrackEnded(int sid, String uri, String metadata)` を追加。session token が現在の token と一致する `ENDED` の場合だけ次を再生。古い listener、手動 Stop、手動 Next の途中では何もしない。
3. `DlnaPlaybackPlugin.createPlayerListener(..., renderer=true, ...)` で `state == PlaybackState.ENDED` の時だけ `httpProxy.onRendererTrackEnded(...)` を呼ぶ。通常の local / network listener は呼ばない。
4. `BisceneHttpProxy` で renderer session の `sid` / `uri` を保持し、`onRendererTrackEnded` の整合性を検証、`OpenHomePlaybackController` の `onRendererTrackEnded` を呼ぶ。
5. controller の `startTrack(track, seek)` は既存 `plugin.playRendererInternal(new RendererTrackRequest(track.uri, track.metadata), seek)` を再利用する。新しい DSP / player は作らない。
6. 末尾到達時は `PlaylistState` を保持したまま `transportState.setTransportState("Stopped")` にして GENA を通知する。queue 自体は消さない。
7. `PlaylistState` の `getCurrentTrack()` / `getNextTrack()` を `GenaEventBuilder` の `Id` / `IdArray` および `PlaylistSoapHandler` の `Move` / `ReadList` から参照させ、current / next metadata の event を同期する。
8. OpenHome 仕様どおり `Insert` の `AfterId=0` は先頭に挿入する。現在の実装で `insert(afterId, ...)` がこの仕様を満たしているかを unit test で確認する。
9. 追加 unit test: album 複数 `Insert` → 自然終了で次曲へ → 末尾で `Stopped`、手動 Next 相当、手動 Stop、手動 Seek の natural end が起きないこと、旧 SID が無視されること。
10. 検証は `compileDebugJavaWithJavac` → `testDebugUnitTest` → `assembleDebug` → `lintDebug` の順。実機なしならその旨を明記する。

## 1. 作業ツリー
## 1. 作業ツリー

- workspace: `/Users/user/Desktop/BisceneDSPSystem/android`
- Git root: `/Users/user/Desktop/BisceneDSPSystem`
- branch: `feature/bt-playback-clean`
- HEAD: `08bff08034bce552ee61fe4f8817d3101857b641` (`Implement OpenHome renderer playback through native DSP`)
- tracking: `origin/feature/bt-playback-clean`（引き継ぎ更新時点）
- 未追跡: `backups/`, `sandbox_integration/`（作業用。コミット・push 対象外）
- 引き継ぎ書類のみ未コミット: `android/HANDOVER.md`

別のチャット開始時に `git status --short --branch`、HEAD、対象ファイルの focused diff を必ず再確認してください。既存の未コミット実装があれば `reset`, `clean`, checkout で消さないでください。

`core-openhome` は Java ソースの移植ミラーとして存在しますが、当初確認時点で build script がなく `settings.gradle` にも production module として登録されていません。実ビルドの正は `android/app` です。勝手に core を production へ組み替えないでください。

## 2. 触ってはいけない通常再生の基準線

次の通常再生経路は「基準線」とし、renderer 対応のための意図しない変更をしてはいけません。

- `DlnaPlaybackPlugin` の通常 `play*`、URL、local/network playback メソッド
- `BiscenePlayerV2` の通常再生動作
- `MediaCodecDecoder`
- `PlaybackService` の通常 session/state 処理
- `NativeDspChain` と既存 DSP/Native bridge

編集前に通常メソッドの focused diff または hash を保存し、編集後に比較してください。変更が要る場合は、既存メソッドの内部を不用改訂するのではなく、renderer 専用入口を追加して既存 player/DSP/listener を呼ぶ形を原則とします。

## 3. 既存アーキテクチャ

### 通常の再生

V2 player は `BiscenePlayerV2` と decoder を使い、通常の開始では session ID (`sid`)、`PlaybackService`、既存の `PlaybackEventListener` を通ります。listener は既に以下の UI/session 通知的能力を持っています。

- `playbackTime`（position/duration）
- `trackSignal`（track/stall/state）
- `productionInfo`（metadata）
- `PlaybackService.updateSid()` / `updatePosition()`
- state 変化時の renderer/OpenHome 状態更新

renderer でも同じ listener と同じ event 名を使うことが第一原則です。別の event engine を作る必要はありません。

### プロトコル層

次の層は既に存在するため、まず壊さず利用します。

- SSDP: `app/src/main/java/com/bisen/biscene/DualSsdpBridge.java`
- DMR wire helper: `app/src/main/java/com/bisen/biscene/DmrSsdpProtocol.java`
- HTTP/SSDP/SOAP/GENA gateway: `app/src/main/java/com/bisen/biscene/BisceneHttpProxy.java`
- OpenHome playback boundary: `app/src/main/java/com/bisen/biscene/openhome/OpenHomePlaybackController.java`
- OpenHome state: `app/src/main/java/com/bisen/biscene/openhome/state/`
- GENA: `app/src/main/java/com/bisen/biscene/openhome/gena/`
- SOAP: `app/src/main/java/com/bisen/biscene/openhome/soap/`

Description/SCPD、SOAP action、GENA subscribe/initial event、OpenHome service profile 的大部分は既に実装済みです。protocol state が正しくても、renderer の actual playback route が別 route に残ると「接続できるが音・DSP・UI表示が違う」症状になります。

## 4. 既知の不具合と未接続部分

### 4.1 renderer の DSP 経路（完了済み）

`DlnaPlaybackPlugin.playRendererInternal(RendererTrackRequest, seekSec)` は、既存の `playInternal(...)` を renderer metadata 付きで再利用します。`direct` は DSP を無効化する指定ではなく、既存実装上は renderer の PCM 出力方式を指し、Native DSP 後の chain は通常再生と同じ経路です。OpenHome controller と DLNA `Play` はこの入口を呼び、SID listener、metadata、album art、time、UI event も既存経路を通ります。

この部分はユーザーが実機で「renderer 認識、選択曲再生、DSP 適用」を確認済みです。`BiscenePlayerV2`、`MediaCodecDecoder`、`NativeDspChain` を変更して再実装してはいけません。残점은 playlist の自然終了から次曲へ接続する部分だけです。

### 4.2 DLNA AVTransport

正しい状態機械は以下です。

```text
SetAVTransportURI → URI と CurrentURIMetaData を保存（ここでは DSP 開始しない） → Play → 既存 DSP/session 開始
```

`BisceneHttpProxy` の一部経路で `SetAVTransportURI` を即時再生として扱っている可能性进行检查対象にします。`Play`, `Pause`, `Stop`, `Seek`, `Next`, `Previous`, `GetTransportInfo`, `GetPositionInfo`, `GetMediaInfo`, volume/event を既存 DMR SOAP/GENA と整合させます。

### 4.3 album art

既存の art 経路は以下です。

- `app/src/main/java/com/bisen/biscene/v2/metadata/AlbumArtProvider.java`
- `app/src/main/java/com/bisen/biscene/v2/metadata/MetadataCoordinator.java`
- `BisceneHttpProxy` の album-art HTTP endpoint

OpenHome DIDL と DLNA `CurrentURIMetaData` から metadata を受け取り、既存 provider を renderer SID でも使います。既存 event 名、art URL形式、普通再生の metadata semantic は維持します。art 取得失敗で再生を止めません。

### 4.4 再生時間

既存 listener の `onProgress()` は SID 付きで既に position/duration、`playbackTime`、`PlaybackService.updatePosition()`、OpenHome time/state 更新を行います。renderer 専用開始経路でも同じ listener を使い、OpenHome `oh_time` と DLNA `GetPositionInfo` に同じ値を返します。seek/stop/next 時は position を 0 にします。

### 4.5 queue（部分実装、continuous playback は未接続）

通常の Web queue は変更しません。OpenHome の `PlaylistState` は `Insert / Read / ReadList / Delete / Next / Previous` と current index を既に保持し、手動 `Next` は `nextTrack()` → `startTrack(...)` で動きます。一方、renderer natural end (`ENDED`) から `nextTrack()` → `playRendererInternal(...)` への callback がありません。

album / folder 再生障害の切り分け:

- control point が複数の DIDL を正しく `Insert` しているか
- `AfterId` の順序が control point 前提と一致しているか
- 選択した先頭 ID の `Playlist.Seek` → `Playlist.Play` が成功しているか
- 1曲終了後に renderer session の `ENDED` が playlist owner へ届くか
- 末尾到達時に queue を保持したまま Stop へ戻るか

DLNA は Playlist サービスではなく current/next URI 方式のため/album 全体の OpenHome queue と同じ扱いはしません。

## 5. 再開時の安全な実装順序（優先版）

この節は `0.3` の最短実装案が優先する。旧引き継ぎ内の「direct を調査する」「renderer 専用開始 API を追加する」は HEAD `08bff08` で完了しているため再実施しない。

## 6. 検証コマンド

cwd は必ず `/Users/user/Desktop/BisceneDSPSystem/android` とする。

```bash
./gradlew :app:compileDebugJavaWithJavac --console=plain
./gradlew :app:testDebugUnitTest --console=plain
./gradlew :app:assembleDebug --console=plain
./gradlew :app:lintDebug --console=plain
git --no-pager diff --check
```

補助確認:

```bash
adb devices
adb logcat -c
adb logcat -s OH-TRACE DualSsdpBridge GenaNotifier SubscriptionManager BisceneHttpProxy
stat app/build/outputs/apk/debug/app-debug.apk
```

実機では少なくとも次をログで確認する。

- renderer 用開始が通常の DSP/Native DSP 初期化へ入ること
- renderer sid が `PlaybackService` に登録されること
- `playbackTime` が継続すること
- `productionInfo` と album art が届くこと
- OpenHome GENA/DMR GENA event と SOAP state が position/duration と一致すること
- DLNA `SetAVTransportURI` だけでは開始せず、`Play` で開始すること
- SSDP discovery と description が従来どおり残ること

## 7. 過去の検証記録と制限

引き継ぎ前に取得された記録では、OpenHome protocol の JVM unit test 5件と metadata regression test 5件は成功、lint は 0 errors / 71 warnings、debug assemble は成功していた。これらはソース修正後の結果ではないため、次セッションで必ず再実行する。

実機の接続状態は記録が混在しているため、`adb devices` の実測を基準にする。実機がなければビルドと unit test までを実施し、transaction 未実施を最終報告に明記する。`core-openhome` が未登録であることも最終報告に残す。

## 8. 最終報告の必須項目

- 通常ローカル／ネットワーク再生コードの focused diff がゼロだったこと
- renderer 用の最小変更だけを示す file list
- compile/test/assemble/lint の正確な成功・失敗結果
- APK の絶対 path と timestamp
- 実機では DSP 出力、album art、time、queue、DLNA/OpenHome transaction の確認結果
- 未確認事項と制限（実機なし、metadata不足、未登録 core module 等）を隠さず列挙すること

## 9. 中断・ロールバックの禁止事項

- HANDOVER 作成だけで build やコード修正を再開しない。
- 通常再生を直す目的で `BiscenePlayerV2`、`MediaCodecDecoder`、`PlaybackService` の通常ロジックを変更しない。
- `git reset --hard`、`git clean`、checkout で既存未コミット実装を消さない。
- 各段階で同じ調査を繰り返さない。上記の順序どおり次ステップへ進む。
- renderer 接続で必要な最小 API が確認できるまで、decoder、DSP、frontend の 包括的変更を行わない。
