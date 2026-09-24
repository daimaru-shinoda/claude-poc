---
name: test-gas
description: GAS プロジェクトの純粋関数（または GAS スタブで切り離せる関数）を特定し、Node.js で実行可能なユニットテストを tests/test.js に生成する。/test から自動呼び出されるほか、単独でも使用可能。
---

# test-gas skill

## 目的

GAS プロジェクトのソースコードから **Node.js で単体テスト可能な関数** を洗い出し、
`tests/test.js` を生成して `node tests/test.js` で実行できる状態にする。

GAS 環境には依存せず、外部ライブラリも不要（Node.js 組み込みの `assert` のみ使用）。

---

## 実行手順

### Step 1: テスト対象の関数を特定する

以下の基準で関数を分類する。

| 分類 | 基準 | テスト方針 |
|---|---|---|
| **純粋関数** | GAS API を一切呼ばない。引数のみに依存 | そのままテスト可能 |
| **スタブ可能** | `Utilities.formatDate` など軽量なスタブで切り離せる | スタブを定義してテスト |
| **対象外** | `SpreadsheetApp`, `DriveApp`, `MailApp` 等でシート/外部リソースに直接アクセスする | 統合テストが必要なためスキップ |

**GAS API の主な判定キーワード**（これらを呼んでいたら対象外）:

| カテゴリ | キーワード |
|---|---|
| データ | `SpreadsheetApp`, `DriveApp`, `DocumentApp`, `SlidesApp`, `FormApp` |
| 通信 | `GmailApp`, `MailApp`, `UrlFetchApp`, `HtmlService` |
| ユーザー / 認証 | `Session`, `ScriptApp` |
| 永続化 | `PropertiesService`, `CacheService` |
| 同期 | `LockService` |
| 予定 | `CalendarApp` |
| ログ | `Logger`, `console` への副作用前提のもの |

**スタブ可能**として扱える GAS API（固定値スタブで切り離せる）:
- `Utilities.formatDate`（固定日付文字列を返す）
- `Utilities.parseCsv`（純粋な変換）
- `Utilities.base64Encode` / `base64Decode`（純粋な変換）

これら以外でも、副作用を持たず引数のみで決まる Utilities 系メソッドは原則スタブ可能。判断に迷ったら対象外として扱う。

### Step 2: `globalThis._test` エクスポートを追加する

GAS ファイルが IIFE `(() => { ... })()` でスコープを閉じている場合、
外部からは関数にアクセスできないため、IIFE の末尾に以下を追加する。

```js
// テスト用エクスポート（オブジェクト経由のため GAS エディタの実行一覧には表示されない）
globalThis._test = { 関数A, 関数B, ... };
```

IIFE を使っていない場合（関数がグローバルスコープにある場合）はこの手順を省略する。

### Step 3: `tests/` ディレクトリと `.claspignore` を確認する

- `tests/` ディレクトリが存在しない場合は作成する
- `.claspignore` に `tests/**` が含まれているか確認し、なければ追加する
  （`tests/` は GAS の push 対象外にする必要がある）

### Step 4: `tests/test.js` を生成する

以下のテンプレートをベースに、Step 1 で特定した関数のテストを記述する。

```js
'use strict';

/**
 * 純粋関数のユニットテスト
 * 実行: node tests/test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ---- GAS API スタブ ----
// テスト対象関数が間接的に使う GAS グローバルを最小限だけ定義する
globalThis.Utilities = {
  // 固定日付を返すことでテストを決定的にする（実行日に依存させない）
  formatDate: (_date, _tz, _fmt) => '2025-01-15',
};
globalThis.SpreadsheetApp = {};
// 必要に応じて追加: globalThis.Logger = { log: () => {} };

// ---- ソースファイルの読み込み ----
// 複数ファイルに分散している場合は順に eval する（依存順に注意）
const SOURCE_PATHS = [
  '{{SOURCE_PATH}}',
  // 追加例: '../gas/featureA/util.js',
];
for (const p of SOURCE_PATHS) {
  eval(fs.readFileSync(path.join(__dirname, p), 'utf-8')); // eslint-disable-line no-eval
}

// IIFE + globalThis._test パターンの場合:
const { 関数A, 関数B } = globalThis._test;
// グローバルスコープの場合は eval 後にそのまま参照できる

// ---- テストランナー ----

let passed = 0;
let failed = 0;
const failures = []; // 失敗詳細を Step 6 の報告で抽出するため保持

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
    failures.push({ name, message: e.message });
  }
}

function describe(suiteName, fn) {
  console.log(`\n${suiteName}`);
  fn();
}

// ---- テストケース ----

// (関数ごとに describe ブロックを作成する)

// ---- 結果 ----

const total = passed + failed;
// この出力形式は /test スキルが結果を解釈するために前提としている
console.log(`\n${total} tests, ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
```

**テンプレート変数の置き換え:**
- `{{SOURCE_PATH}}` → `tests/` から見た GAS ファイルの相対パス（例: `../gas/recruitment/コード.js`）

**複数 GAS ファイルがある場合**: `SOURCE_PATHS` 配列に依存順で追加する。例えば utility が他から参照されるなら utility を先に列挙する。`globalThis._test` を複数ファイルで使うとキー衝突するため、ファイルごとに `globalThis._test_featureA`, `globalThis._test_featureB` のように命名を分けるとよい。

**固定日付の値について**: 実行日に依存させると毎日テストが変動するため、テスト作成時点で適当な過去日付を選んで固定する。実装でその固定値を期待するテストにすれば決定的になる。

### Step 5: テストケースを記述する

各関数について以下の観点でテストを書く。

| 観点 | 内容 |
|---|---|
| 正常系 | 代表的な入力で期待値を返すか |
| 境界値 | 空配列・空オブジェクト・0・null など |
| エラー系 | 例外をスローする条件でスローされるか、メッセージに根拠が含まれるか |
| 独立性 | 返却オブジェクトを変更しても別の呼び出し結果に影響しないか |

**GAS 特有の境界値観点**（該当する関数では追加でテストする）:

- シート由来の値が文字列で来る vs 数値で来るケース（`'123'` と `123`、`'2025/01/15'` と `Date` オブジェクト）
- 空セルの表現（GAS では `''` で来るが、テストで `null` / `undefined` を渡したくなる）
- タイムゾーンずれ（`Utilities.formatDate` のスタブが TZ 引数を無視している前提のテスト）
- 配列の最終列が空のとき末尾が省略されるパターン（`getValues()` の挙動模倣）

### Step 6: 動作確認と結果報告

```bash
node tests/test.js
```

を実行し、終了コードと標準出力を確認する。

**全テスト pass の場合の報告（`/test` から呼ばれたときに参照される）**:

```
テスト結果: X tests, X passed — OK
生成ファイル: tests/test.js（N 関数、M ケース）
```

**テスト失敗の場合**:

`failures` 配列の内容（標準出力の `✗` 行）を抽出してユーザーに伝える:

```
テスト失敗: X tests, X passed, X failed

失敗したテスト:
  ✗ 関数A - 正常系: expected 5, got 4
  ✗ 関数B - 境界値: AssertionError: ...
```

失敗した場合は、テンプレート生成側の誤りなのか実装側のバグなのかを切り分けてから次のアクションを決める（テンプレート起因なら修正して再実行、実装起因なら呼び出し元に失敗を伝える）。

---

## 既存 tests/test.js がある場合

既存ファイルがあるとき、テンプレート全体を上書きすると過去のテストケースが失われる。次のルールで部分的に更新する:

**保護する部分**（既存のものを尊重）:
- ファイル先頭のスタブ定義（`globalThis.Utilities = ...` など）— 既存定義に必要なキーを **追加** するのは可。既存値を書き換えない
- 既存の `describe` ブロックとその中のテストケース
- `SOURCE_PATHS` 配列の既存エントリ（順序も保つ）

**更新する部分**:
- `SOURCE_PATHS` 配列に新規ファイルが必要なら **末尾追加**（既存依存の関係を壊さない）
- 新規 `describe` ブロックを既存ブロックの **後ろ** に追加
- 新規スタブが必要なら、既存スタブの直後に追加

**変更してよい部分**:
- テストランナー本体（`test()`, `describe()` 等の実装）— ランナーを改善する場合は事前にユーザーに確認する

判断の目安: ユーザーが過去に書いたカスタムテストやスタブ調整を勝手に消さない。SKILL.md のテンプレートは「初回作成時の雛形」であり、運用が始まったテストファイルではない。

---

## 出力品質のチェック

tests/test.js を書き終えたら送信前に自己レビューする:

- [ ] `node tests/test.js` が実際に通ること（実行して確認）
- [ ] 各 `describe` ブロックに境界値テストが含まれているか
- [ ] スタブが最小限か（不要な GAS グローバルを定義していないか）
- [ ] テスト名が日本語で「何を検証しているか」が読み取れるか
- [ ] `globalThis._test` への登録漏れがないか

---

## 検出条件

このセクションは `/test` スキルから動的に読み取られる。新しいマーカーを追加する場合はここを編集する。

**優先度**: 20（数値が大きいほど先に評価される。GAS は他言語と共存しやすいため高めに設定）

**マーカーファイル**（プロジェクトルートからの相対パス、いずれかが存在すれば該当）:
- `appsscript.json`
- `.clasp.json`
