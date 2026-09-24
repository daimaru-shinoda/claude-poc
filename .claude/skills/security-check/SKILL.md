---
name: security-check
description: 別コンテキストで脆弱性チェックを実行し、結果を docs/audit-security.md に書き出す。/audit パイプラインから呼び出されるほか、単独でも使用可能。ソースコードは一切変更しない。
---

# security-check skill

## 目的

**コードベースの脆弱性を別コンテキストで独立検査**し、結果を `docs/audit-security.md` に書き出す。
メインの監査コンテキストと分離することで、先入観のないフレッシュな視点で検査する。

## 絶対原則

1. **Read-only**: 検査中はソースコードを一切変更しない
2. **別コンテキスト実行**: Agent ツールでサブエージェントを起動し、そこで検査を実行する
3. **docs/audit-security.md に記録**: `docs/audit-plan.md` とは別ファイルで管理する
4. **自動修正はしない**: 発見した問題を記録するのみ。修正は人間が判断する

## 実行手順

### Step 1: 対象ファイルとプロジェクト型の把握

Agent ツールを起動する前に、以下を収集する:

**対象ファイル**（除外パターン）:

| 除外 | 理由 |
|---|---|
| `node_modules/`, `vendor/`, `.venv/` | 依存ライブラリのソース |
| `dist/`, `build/`, `out/` | ビルド成果物 |
| `**/*.test.*`, `tests/`, `__tests__/` | テストコード（テストは別観点） |
| `docs/`, `*.md` | ドキュメント |
| 自動生成ファイル | `*.generated.*` 等 |

**プロジェクト型の判定**（観点を絞るため）:

| 判定材料 | プロジェクト型 |
|---|---|
| `appsscript.json` / `.clasp.json` | GAS |
| Web フレームワーク（Express, Next.js, Flask, Django 等） | Web/API |
| `bin/`, CLI ツール、ライブラリ的な使い方 | CLI / ライブラリ |
| Electron, Tauri 等のデスクトップフレームワーク | デスクトップ |

複数該当する場合は併記。判定がつかない場合は「汎用」として全観点を適用する。

**既存 audit-security.md の確認**: 存在すれば内容を読み、サブエージェントに引き継ぐ。新規 finding は既存 ID の続きから採番する（既存 SC-2 まであれば新規は SC-3 から）。

### Step 2: 依存パッケージの既知脆弱性スキャン（言語に応じて）

ソースコードの観点とは別に、依存パッケージの既知脆弱性を専用ツールで検出する。検出結果は Step 3 のサブエージェントに渡す。

| 言語 / ファイル | コマンド | 補足 |
|---|---|---|
| Node.js (`package.json`) | `npm audit --json` | 結果を JSON で取得し High 以上を報告対象に |
| Python (`requirements.txt` / `pyproject.toml`) | `pip-audit` または `pip install --dry-run` で確認 | `pip-audit` 未インストール時は手動で記録 |
| Go (`go.mod`) | `go list -m -u all` で更新可能パッケージを列挙、`govulncheck ./...` で脆弱性チェック | `govulncheck` 推奨 |
| Rust (`Cargo.toml`) | `cargo audit` | 未インストールなら案内 |
| GAS | 該当なし（依存はランタイム提供） | スキップ |

ツール未インストール時は実行をスキップし、その旨を Step 3 のプロンプトに含める（手動レビューに切替）。

### Step 3: サブエージェントの起動

Agent ツールを使い、以下のプロンプトをベースにサブエージェントを起動する。`[ ]` で囲まれた部分は Step 1 / Step 2 で収集した実際の値に置き換える。

**このスキルの Agent 呼び出しは必ず `model: "fable"` を指定する**（audit-plan 専用。他スキルのモデル指定には影響しない）。

```
セキュリティ脆弱性チェックを実施してください。ソースコードは絶対に変更しないでください。

対象ファイル: [対象ファイル一覧]
プロジェクト型: [GAS / Web/API / CLI / デスクトップ / 汎用]
既存 audit-security.md: [既存内容またはなし]
依存脆弱性スキャン結果: [Step 2 の出力。実行できなかった場合は「未実施: 理由」]

---
## 観点（プロジェクト型に応じて該当するものだけ適用）

### すべてのプロジェクトで共通

1. 認証情報・APIキー・シークレットのハードコード
2. 任意コマンド実行・eval / Function コンストラクタ
3. 安全でない外部通信（HTTP、証明書検証スキップ）
4. センシティブデータのログ出力・エラーメッセージへの混入
5. 依存パッケージの既知脆弱性（Step 2 の結果を踏まえる）

### Web / API のみ

6. SQL インジェクション、ORM の生クエリ
7. XSS（HTML/属性/JavaScript コンテキスト）
8. CSRF 対策の欠如
9. 認証・認可の欠如または迂回可能性
10. レート制限の欠如
11. オープンリダイレクト

### CLI / デスクトップ / Web 共通

12. パストラバーサル、任意ファイルアクセス
13. コマンドインジェクション（`exec` / `spawn` / `shell` への変数渡し）
14. CSV インジェクション（生成する CSV にユーザー入力が含まれる場合）

### GAS のみ

15. `eval` / `new Function` 経由のスプレッドシート式評価
16. `UrlFetchApp` の HTTP 利用、証明書検証無効
17. `PropertiesService` への secrets 平文保存
18. 公開 Web App / API Executable の認可設定（`ANYONE_ANONYMOUS` 等）

---
## 出力フォーマット

検出した問題を docs/audit-security.md に以下の形式で書き出してください。
重要度は audit-plan.md と揃えて Critical / High / Medium / Low / Info の 5 段階。
各項目に信頼度（Confirmed / Possible / Speculative）を付ける。

# セキュリティ検査レポート

**検査日**: YYYY-MM-DD
**対象**: (ファイルリスト)
**プロジェクト型**: ...
**依存脆弱性スキャン**: 実施 / 未実施（理由）

## Critical（即時対応必須）

### SC-1. (問題タイトル)

- **該当**: `file:line`
- **信頼度**: Confirmed / Possible / Speculative
- **問題**: (具体的な問題とコード引用)
- **影響**: (悪用された場合の影響)
- **対応**: (修正方針)

## High
### SH-1. ...

## Medium
### SM-1. ...

## Low
### SL-1. ...

## Info（参考情報・誤検知の可能性が高いが念のため記録）
### SI-1. ...

## 検査対象外

- (意図的に除外したもの、理由)

## 統計

- Critical: X件 / High: X件 / Medium: X件 / Low: X件 / Info: X件

---
## 信頼度の判定基準

- **Confirmed**: コードを読んで攻撃経路が具体的に追跡できる。例: ユーザー入力が exec に直接渡っている
- **Possible**: 攻撃経路が成立しうるが、上流の前提（呼び出し元での検証など）次第で安全になる可能性がある
- **Speculative**: パターンマッチで疑わしいが、実害があるかは追加調査が必要

誤検知を多く出さないため、Critical / High は原則 Confirmed のみとする。Possible は Medium 以下に分類する。

---
## 既存 audit-security.md がある場合

- 過去の finding は削除せず、ステータスマーク（✅ 修正済 / ⏸ 現状維持 / 🟡 部分対応）を追記する
- 新規 finding は既存 ID の続きから採番
- 統計セクションは全件で再計算
- 「検査日」は履歴として残し、最新の検査日を冒頭に追記

問題が見つからなかった場合も「脆弱性は検出されませんでした（プロジェクト型: ..., 適用観点: N 項目）」と記録してください。
docs/ ディレクトリが存在しない場合は作成してから書き出してください。
```

### Step 4: 完了確認

サブエージェントが `docs/audit-security.md` を作成したことを確認する。

### Step 5: 完了報告

以下を報告する:

- `docs/audit-security.md` の作成 / 更新完了
- プロジェクト型と適用観点数
- 依存脆弱性スキャンの実施状況（実施 / 未実施 + 理由）
- 検出件数（Critical: X, High: X, Medium: X, Low: X, Info: X）
- **信頼度の内訳**（Confirmed: X, Possible: X, Speculative: X）
- Critical / High かつ Confirmed の項目は内容をハイライト（手動修正の判断材料として）
- 問題なしの場合も明示する
