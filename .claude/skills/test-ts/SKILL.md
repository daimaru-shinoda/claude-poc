---
name: test-ts
description: TypeScript プロジェクトの純粋関数を特定し、Vitest で実行可能なユニットテストを tests/ 以下にソース構造を mirroring して生成・実行する。型チェック（tsc --noEmit）を先行実行する。/test から自動呼び出されるほか、単独でも使用可能。
---

# test-ts skill

## 目的

TypeScript ソースから純粋関数を特定し、ユニットテストを生成・実行する。
モックは使用しない。副作用を持つ関数はテスト対象から除外する。

## 実行手順

### Step 1: 環境確認と対象ファイルの選定

**対象ファイル**: `.ts` / `.tsx`（ただし以下は除外）

| 除外パターン | 理由 |
|---|---|
| `node_modules/**` | 依存ライブラリのソース |
| `dist/**`, `build/**`, `out/**` | ビルド成果物 |
| `**/*.d.ts` | 型定義のみで実装なし |
| `**/*.test.ts`, `**/*.spec.ts`, `tests/**`, `__tests__/**` | テストコード自身 |
| `**/*.config.ts`, `vite.config.ts` 等 | ビルド設定 |

**モノレポ対応**: ルートに `pnpm-workspace.yaml` / `lerna.json` / `package.json` の `workspaces` フィールドがある場合、各 workspace を独立して扱う。デフォルトは `packages/*/src/**` `apps/*/src/**` 等を対象にし、workspace ごとに `tsconfig.json` と `package.json` を参照する。

`tsconfig.json` の `include` / `exclude` が指定されていればそれを優先する。

`package.json` を読み、テストフレームワーク（vitest / jest）の有無を確認する。

対象 TypeScript ファイルが見つからない場合は中断し、ユーザーに伝える。

### Step 2: テストフレームワーク決定

以下の優先順位で決定する:

1. **既存テストファイルから判別**: `tests/**/*.test.ts` や `src/**/*.test.ts` を Glob し、`import` 文に `from 'vitest'` / `from '@jest/globals'` などがあればそれを採用。混在している場合は多数派を採用しユーザーに通知
2. **package.json から判別**: `devDependencies` / `dependencies` に `vitest` があれば Vitest、`jest` または `@types/jest` があれば Jest を採用。両方ある場合は `scripts.test` のコマンドで実際に使われている方を採用
3. **どちらも無い場合**: Vitest を採用するが、**自動インストールは行わない**。次のメッセージでユーザーに確認する:

   ```
   テストフレームワーク（Vitest または Jest）が見つかりません。
   Vitest を導入するには次を実行してください:

     npm install -D vitest

   インストール後、再度 /test-ts または /test を実行してください。
   ```

   `package.json` と lockfile への変更はユーザーが認知すべき変化のため、勝手に走らせない。

### Step 3: 型チェック

`tsc --noEmit` を実行して型エラーを検出する。

- `tsconfig.json` がある場合: そのまま実行
- `tsconfig.json` がない場合: デフォルト設定で実行

**エラーの扱い方**:

型エラーが出た場合、Step 1 で選定したテスト対象ファイル（およびそこから import されているファイル）に該当するエラーだけを取り出して報告する。これ以外（ビルドスクリプトや関係ない領域の型エラー）は対象外のため警告として残すが中断はしない。

理由: 全体の型エラーで中断すると、テスト対象とは無関係な箇所が原因でテスト生成が永遠に始まらない事態になる。テスト生成に直接影響する範囲だけを必須要件にする。

対象範囲に型エラーがある場合は、エラー内容を報告して中断する（テスト生成より型修正が先）。

### Step 4: 純粋関数の特定

各 `.ts` / `.tsx` ファイルを読み、以下の条件を満たす関数を「テスト対象」として列挙する。

**テスト対象（純粋関数）の条件:**

- 引数のみに依存し、外部状態を参照・変更しない
- 同じ引数には常に同じ結果を返す
- 以下を含まない: `fetch` / `axios` / DB クライアント / `fs`（ファイル I/O）/ グローバル変数への書き込み

**async 関数の扱い:**

- `async` かつ `await` が純粋な計算のみ（外部リソースにアクセスしない） → テスト対象に含め、「async 不要候補」としてリストアップする
- `await` で外部リソースにアクセスしている → 除外

### Step 5: async 不要候補の確認（該当する場合）

**呼び出し元の確認**: このスキルが `/test` から自動呼び出されたか、ユーザーが直接 `/test-ts` を呼んだかで挙動を分ける。

- **`/test` 経由（自動呼び出し）の場合**: ユーザー対話できないため、async 除去は**スキップ**する。async 関数はそのまま async のままテストを生成する（呼び出し側で `await` すれば動く）。「async 不要候補があったがスキップした」旨を結果報告に含める
- **直接呼び出しの場合**: 以下の対話を行う:

  ```
  以下の関数は async が不要と思われます。async を除去しますか？

  1. src/utils/format.ts - formatDate(): await が存在しません
  2. src/lib/calc.ts - sumValues(): await しているのは純粋な計算のみです

  除去する番号をカンマ区切りで入力してください（スキップする場合は Enter）:
  ```

承認された関数のみソースを修正する。テストコードは修正後の状態に合わせて生成する。

### Step 6: テストファイルの生成

テスト対象の関数ごとに、ソースのディレクトリ構造を `tests/` 以下に mirroring してテストファイルを生成する。

**ファイルパスの対応（標準レイアウト）:**

| ソース | テスト |
|---|---|
| `src/utils/format.ts` | `tests/utils/format.test.ts` |
| `src/lib/calc.ts` | `tests/lib/calc.test.ts` |
| `utils/helper.ts`（ルート直下） | `tests/helper.test.ts` |

**モノレポの場合**: workspace ごとにテストを配置する。例えば `packages/foo/src/calc.ts` → `packages/foo/tests/calc.test.ts`。各 workspace の `package.json` に `test` スクリプトがあればそれを尊重する。

**既存テストファイルの扱い**: 既存ファイルがある場合は **上書きしない**。次のルールで部分的に更新する:

| 保護する部分 | 更新する部分 |
|---|---|
| 既存の `describe` ブロックとテストケース | 新規 `describe` ブロックを末尾追加 |
| 既存の import 文 | 新規関数の import を追加 |
| 手書きのヘルパー / fixture | カバーされていない関数のテストを追加 |

理由: ユーザーが手書きしたテストや fixture を勝手に消すと信頼を失う。SKILL.md のテンプレートは「初回作成時の雛形」であり、運用が始まったテストファイルではない。

**生成するテストの形式（Vitest）:**

```typescript
import { describe, it, expect } from 'vitest'
import { functionName } from '../src/utils/format'

describe('functionName', () => {
  it('正常系: ...', () => {
    expect(functionName(input)).toBe(expected)
  })

  it('境界値: null / undefined / 空配列 など', () => {
    expect(functionName(null)).toBe(...)
  })
})
```

**生成するテストの形式（Jest）:**

```typescript
import { functionName } from '../src/utils/format'

describe('functionName', () => {
  it('正常系: ...', () => {
    expect(functionName(input)).toBe(expected)
  })

  it('境界値: null / undefined / 空配列 など', () => {
    expect(functionName(null)).toBe(...)
  })
})
```

各テストケースは以下を網羅する:

- 正常系（代表的な入力）
- 境界値（null / undefined / 空文字 / 空配列 / ゼロ など）
- 異常系（関数が明示的にエラーを返す・スローするケース）

### Step 7: テスト実行

```bash
# Vitest
npx vitest run

# Jest
npx jest
```

### Step 8: 結果報告

`/test` スキルから呼ばれた際にも解釈しやすい形式で報告する。最初の行を「テスト結果: X tests, X passed」形式にして `/test` の Step 3 と整合させる。

**全テスト pass の場合:**

```
テスト結果: X tests, X passed — OK
生成ファイル:
  - tests/utils/format.test.ts（3 関数、8 ケース）
  - tests/lib/calc.test.ts（2 関数、5 ケース）
```

**テスト失敗の場合:**

```
テスト失敗: X tests, X passed, X failed

失敗したテスト:
  ✗ tests/utils/format.test.ts > formatDate > 境界値: null: 期待値 ... 実際 ...
  ✗ tests/lib/calc.test.ts > sumValues > 異常系: ...
```

失敗の原因が「生成したテストコードのバグ」か「実装側のバグ」かを切り分ける:

- テストコード起因（型の取り違え、期待値の誤算、import パスの間違い等）→ 自動修正して再実行
- 実装起因（純粋関数の挙動が想定と違う）→ そのまま失敗を報告して中断。`/refactor` や手動修正を促す

修正サイクルが 2 回を超えても通らない場合は、それ以上ループせずユーザーに報告して中断する（テストコードのバグ修正と称して実装バグを覆い隠さないため）。

**純粋関数が見つからなかった場合:**

```
純粋関数が見つかりませんでした。
副作用を持つ関数が多い場合は /refactor でロジックを分離してからお試しください。
```

**async 不要候補をスキップした場合**（`/test` 自動呼び出し時）:

報告の末尾に以下を追加する:

```
注: async 不要候補が N 件ありました（/test 経由のためスキップ）。
個別に確認したい場合は /test-ts を直接実行してください。
```

---

## 検出条件

このセクションは `/test` スキルから動的に読み取られる。新しいマーカーを追加する場合はここを編集する。

**優先度**: 10（GAS マーカーと共存する場合は GAS 側を優先するため低めに設定）

**マーカーファイル**（プロジェクトルートからの相対パス、いずれかが存在すれば該当）:
- `tsconfig.json`
