---
name: audit
description: Use when the user wants the complete audit pipeline in a single automated run — not just analysis, not just fixes, not just security alone, but all phases together: bug detection, auto-fixing, test verification, readability improvement, and security scanning chained in sequence. The defining signal is wanting everything done at once with one command (「監査して」「/audit」「バグもセキュリティも全部まとめて」). Pick this over audit-plan (analysis only), audit-fix (fix only), or security-check (security only) whenever the user's intent is comprehensive, unattended quality improvement across the whole codebase.
---

# audit skill（マスタースキル）

## 目的

監査から修正・テスト・セキュリティチェックまでの全フェーズを自動実行する。
各フェーズは独立したスキルに委譲し、このスキルはオーケストレーションのみを担う。

## 実行フロー

以下を順番に Skill ツールで呼び出す。各ステップは前のスキルが完了してから実行する。

### Step 1: 監査実行（audit-plan）

Skill ツールで `audit-plan` を呼び出す。
`docs/audit-plan.md` が生成されたことを確認してから次に進む。

### Step 2: C/H 自動修正（audit-fix ch）

Skill ツールで `audit-fix` を args `ch` で呼び出す。
Critical / High の自動修正可能な項目を修正し、`docs/CHANGELOG.md` を更新する。

### Step 3: テスト実行（C/H 修正後）

Skill ツールで `test` を呼び出す。

- **テスト pass**: Step 4 に進む
- **テスト失敗**: **ここで中断**し、ユーザーに以下を報告して判断を仰ぐ:

  ```
  C/H 修正後のテストが失敗しました。
  失敗内容: [エラー詳細]
  手動確認後、/audit-fix ml から再開できます。
  ```

### Step 4: M/L 自動修正（audit-fix ml）

Skill ツールで `audit-fix` を args `ml` で呼び出す。
Medium / Low の自動修正可能な項目を修正し、`docs/CHANGELOG.md` を更新する。

### Step 5: テスト実行（M/L 修正後）

Skill ツールで `test` を呼び出す。

- **テスト pass**: Step 6 に進む
- **テスト失敗**: **ここで中断**し、ユーザーに以下を報告して判断を仰ぐ:

  ```
  M/L 修正後のテストが失敗しました。
  失敗内容: [エラー詳細]
  手動確認後、/readable から再開できます。
  ```

### Step 6: 可読性向上（readable）

Skill ツールで `readable` を呼び出す。

### Step 7: セキュリティチェック（security-check）

Skill ツールで `security-check` を呼び出す。
このフェーズは別コンテキストで実行され、結果は `docs/audit-security.md` に書き出される。
セキュリティ問題が発見された場合でも、パイプラインは継続して Step 8 に進む（自動修正はしない）。

### Step 8: CHANGELOG.md の更新

`docs/CHANGELOG.md` に監査パイプライン全体の実行サマリを追記する（ファイルがなければ作成）:

```markdown
## YYYY-MM-DD — audit

### 実行フェーズ
- audit-plan: 完了（C: X件、H: X件、M: X件、L: X件、Performance: X件）
- audit-fix ch: 自動修正 X件、スキップ X件
- audit-fix ml: 自動修正 X件、スキップ X件
- readable: 完了
- security-check: 完了（docs/audit-security.md を参照）
```

### Step 9: 最終サマリの提示

`docs/audit-plan.md` を読み、ステータスマークのない未修正項目をすべてリストアップして報告する。

```
## 監査完了サマリ

### 自動修正済み
- [C-1] ...（audit-fix ch）
- [M-2] ...（audit-fix ml）

### 要対話（手動確認が必要）
- [C-2] ... — スキップ理由（例: API変更を伴うため）
- [H-3] ... — スキップ理由

### セキュリティ
docs/audit-security.md を確認してください。
（Critical: X件、High: X件）

### 変更履歴
docs/CHANGELOG.md に記録済みです。
```

## 中断ルール

- **テスト失敗**（Step 3 / Step 5）: 即座に中断してユーザーに報告する
- **audit-plan.md が生成されない**: Step 1 で中断する
- それ以外のエラー（個別スキルの一部失敗等）: エラー内容を報告し、次のステップに進むかユーザーに確認する
