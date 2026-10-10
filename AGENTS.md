# 作業ルール

## 変更の提出

- コード・設定・ワークフローなどリポジトリへの変更は、**main へ直接 push せずブランチを切って PR を作成**する。
- PR には `gh pr create` を使い、**タイトル・本文（Summary / Test plan など）は英語**で書く。本文は HEREDOC / `--body-file` で渡す（改行の `\n` 埋め込みを避ける）。
- ユーザーが明示的に main への直接 commit / push を依頼した場合のみ例外。

## GitHub Actions

- **CI の二重実行を避ける**: PR ブランチへの push は `pull_request`（`opened` / `synchronize` / `reopened`）だけで回す。`push` は **`main` のみ**（マージ後の確認）。PR 更新と同内容のチェックを `push` 側にも書かない。役割が違う処理は**別 YAML** に分ける（例: `ci.yml` と `test-multi-versions.yml`）。
- **サードパーティ Action は原則使わない**（`actions/*` など GitHub 公式を優先）。
- **例外（許容）**: `oven-sh/setup-bun`（Bun のセットアップ）。
- それ以外でサードパーティ Action が必要なときは、追加前に**ユーザーに確認**する。可能なら runner 上のシェルや `gh` CLI で代替する。
- **`uses` の依存は [gh-actions-lock](https://github.com/github/gh-actions-lock) で固定**する。ロックファイルは `.github/workflows/actions.lock`。YAML の ref は**メジャーのみ**（例: `@v7`）。ワークフローに `uses` を追加・変更・削除したら `gh actions-lock --no-narrow` を実行し、タグを上げるときは `gh actions-lock --no-narrow --relock`。初回のみ `gh extension install github/gh-actions-lock`。

## 設計・変更方針（全体最適）

症状のある UI だけ直す**局所最適**を避け、データの流れ全体を確認してから変更する。

### 利用状況データの単一ソース

- **正本**: GNOME Shell 内の `RefreshScheduler`（`src/shell/refreshScheduler.ts`）。トップバー（`UsageIndicator`）とメニューはここだけを参照する。
- **設定プレビュー**: Shell が動いているときは D-Bus `io.github.bgpat.GenaiUsage.Usage`（`GetSnapshots` / `RefreshAll` / `Changed`）経由で**同じスナップショット**を表示する（`src/gjs/usageDBusServer.ts` / `usageDBusClient.ts`、`TopBarEditor`）。Shell が無いとき（`bun run dev:prefs` のみなど）だけ prefs プロセス内で `refreshProvider` にフォールバックする。
- **Services タブの「Check authentication」など**: 明示的な一回限りの確認用に prefs から `refreshProvider` を呼ぶのは可。トップバー表示用の二重取得・二重キャッシュは増やさない。

### 設定変更と更新

- GSettings 変更は Shell の `ExtensionSettings.watch(..., 'shell')` で受け、`RefreshScheduler.onSettingsChanged()`（タイマー再設定 + `refreshAll(true)`）と UI の即時再描画を行う。表示だけの設定（名前表示など）はスナップショット不要、`update()` で足りる。
- `refreshAll` 完了時に一度だけ `onChange` する（プロバイダーごとにトップバーを組み直さない）。

### 変更前の確認

新機能やバグ修正では、少なくとも次の経路が矛盾していないか見る。

1. Shell 取得 → トップバー / メニュー  
2. Shell 取得 → D-Bus → General プレビュー  
3. 設定変更 → Shell 再取得  
4. ログ（Shell 正本 → D-Bus → Log タブ）

### 利用状況以外で押さえる経路

| 領域 | 正本 / 共有 | 注意 |
|------|-------------|------|
| トップバー文言 | `lib/presentation.ts` の `barEntries`（Shell プレビューと共通） | 表示ロジックを prefs 側に複製しない |
| 並び・表示/非表示 | GSettings + `lib/layout.ts` | 順序変更だけでは API 再取得は不要（下記「設定 watch」） |
| ログ | Shell メモリ → D-Bus Log | prefs の `appendLog` は Shell へ転送 |
| アイコン | ディスクキャッシュ（`iconCache`、プロセス共通パス） | Shell / prefs は別 UI キットのため**それぞれ** `refreshProviderGicon` する。キャッシュファイルは共有 |

### 既知の粗さ（改善候補・意図的でない二重取得）

- **設定 watch（Shell）**: キー種別に関係なく `onSettingsChanged()` → `refreshAll(true)` になる。`provider-order` や `log-level` だけの変更でも CLI/HTTP が走る。将来は「データに効くキー」だけ再取得に絞る。
- **Services（Cursor）**: `discoverCursorQuotas` が `usage-summary` を**独自**に叩く。Shell の `refreshAll` や prefs の `refreshProvider`（非公式 ON 時）と**同時**に走ると、同じ API が最大 3 回になる。クォータ選択肢は可能なら D-Bus `GetSnapshots` の `quotas` から組み立て、Shell が無いときだけ `discoverCursorQuotas` / `refreshProvider` にフォールバックするのが望ましい。
- **メニュー**: `UsageIndicator.update()` のたびにメニュー全再構築。スナップショットは scheduler 一本だが、表示だけの変更でもコストが乗る。必要になったらバーとメニューの更新を分離する。

## 拡張の実行

- この拡張を実行して確認するときは、必ずネストした GNOME Shell で行う。
- ログイン中のセッションに対して `gnome-shell --replace` を実行しない。`gnome-extensions enable` で現在のセッションへ有効化しない。
- 起動は `bun run dev` で行う。これは拡張を一時ディレクトリへ入れ、`dbus-run-session -- gnome-shell --nested --wayland` を実行する。
- 設定 UI だけ確認するときは `bun run dev:prefs`。`pack` した内容を `$TMPDIR/genai-usage-prefs-dev/` に展開し、ホストのセッション D-Bus 上で `gjs -m scripts/prefs-dev-entry.js` から **prefs.js を直接起動**する（`gnome-extensions prefs` / `~/.local/share/...` は使わない）。`org.gnome.Shell.Extensions.src.gresource` の登録と `GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0` が必要（Shew typelib）。General プレビューはホスト Shell に拡張が有効なとき D-Bus 同期、無効なら prefs 内 `refreshProvider`。
- **Shell の `extension.js`** は gnome-shell プロセスに載ったままキャッシュされる。パネル・Usage/Log D-Bus・ホスト上の `gnome-extensions prefs` は Shell 側のコピーに縛られる。それらを含めて確認するには `bun run dev`（ネスト Shell）か `install:local` 後の Shell 再読み込み。
- 画面サイズは `MUTTER_DEBUG_DUMMY_MODE_SPECS` で決まる。未指定時は `1920x1080` で、ウィンドウの最小サイズと最大サイズはその値に固定される。

- ネストした Shell が落ちても、外側のセッションは終了しない。動作確認はこの中で行う。

## 診断ログ（Log タブ）

- **保存場所**: GNOME Shell プロセス内のメモリ（`src/gjs/logStore.ts`）。**ディスクには書かない**。
- **保持**: **64,000 文字**（`LOG_MAX_BYTES`）を超えたら古い方から切り詰める（日数による削除はしない）。
- **設定を閉じている間**: Shell が `appendLog` し続け、バッファに残る。次に Log タブを開くと D-Bus `GetLog` で全文を取得する。開いている間は `Changed` シグナルで追従する。
- **D-Bus**: バス名 `io.github.bgpat.GenaiUsage`。
  - **Log**: `/io/github/bgpat/GenaiUsage/Log`（`GetLog`, `AppendLog`, `Changed`）。拡張 `enable` で `registerShellLogDBus()` と `startLogService()`、prefs 側は `initLogForPreferences()`。
  - **Usage**: `/io/github/bgpat/GenaiUsage/Usage`（`GetSnapshots`, `RefreshAll`, `Changed`）。プレビューをトップバーと同期する。
- コードを変えたあと **GNOME Shell を再読み込み**する。ホストへ反映は `bun run install:local`。

### 方針

- **ユーザー操作**と **バックグラウンド処理**を漏らさず `appendLog` する。
- ログ出力時は必ず **レベル** `debug` | `info` | `warn` | `error` と **kind** `user` | `background` を指定する。
- 本文は `publicError` で伏せる。`warn` / `error` / `info` は Shell journal にも出す（`debug` はメモリのみ）。

### 実装

- API: `appendLog(level, message, kind?)`。prefs からの呼び出しは D-Bus 経由で Shell ストアへ追記する。
- 設定変更: `ExtensionSettings.watch(callback, 'shell' | 'prefs')`。
- 新しい UI やバックグラウンド処理を足したら、その経路に `appendLog` を追加する。
