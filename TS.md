# TS.md — TypeScript 実装・監査ガイド

TypeScriptプロジェクトでの実装・監査時に確認する注意点。
`CLAUDE.md`の一般ルールに加えて、このファイルの内容を適用する。

## 1. 型システムの基本方針

- `any`禁止、型不明な値は`unknown`で受けてから絞り込む
- strict系オプション（`strict`, `noImplicitAny`, `strictNullChecks`等）を前提としたコーディング
- 型推論に任せられる箇所は明示的な型注釈を省略し、外部境界（関数の引数・戻り値、exportする値）にのみ型を明記する
- ユーティリティ型（`Partial`/`Pick`/`Omit`/`Readonly`等）で重複した型定義を避ける
- 型ガード関数・アサーション関数(`is`/`asserts`)の使い所
- 外部入力（環境変数・APIレスポンス・ユーザー入力等）は型注釈だけで信頼せず、スキーマバリデーションライブラリ（zod等）や型ガード関数で実行時検証を行う

## 2. tsconfig.json 管理

- `strict`系オプションを緩める変更はレビュー対象にする
- `target`/`module`/`moduleResolution`の選定基準（実行環境との整合）
- パスエイリアス(`paths`)導入時の解決漏れ・ビルドツール側設定との整合

## 3. ビルド・型チェック

- `tsc --noEmit`による型チェックとESLintの役割分担（型検査とスタイル検査を混同しない）
- esbuild/swc/vite等トランスパイラ主体のビルドでは型エラーが実行時まで検出されない点への対策

## 4. 非同期処理

- Promiseのunhandled rejection防止（async関数のエラーを握りつぶさない）
- 例外ベース vs Result型（`{ ok, value } | { ok: false, error }`）のどちらで統一するか
- `await`忘れ・`Promise.all`と逐次awaitのパフォーマンス差

## 5. モジュール・依存関係

- 循環参照の回避
- 型のみの参照は`import type`で分離し、実行時バンドルサイズ・循環参照リスクを減らす
- default exportとnamed exportの使い分け方針

## 6. 型定義ファイル(.d.ts)・外部ライブラリ

- 型定義が無い外部ライブラリへの対応（`@types/`追加 or 自前`.d.ts`）
- グローバル型拡張（`declare global`）の濫用を避ける

## 7. anyへの逃げ道の防止

- `as any` / `as unknown as T` の使用を原則禁止し、使う場合はコメントで理由を明記する
- キャストではなく型ガード・バリデーション（zod等）での安全な変換を優先する

## 8. テストとの連携

- `test-ts`スキル（純粋関数抽出→Vitest）との対応関係
- モック・スタブの型安全性（`vi.fn<...>()`等での型付け）

## 9. リンティング・スタイル

- typescript-eslintルールとプロジェクトのESLint設定の整合
- `enum`の使用是非（union literal typeや`as const`との比較、Tree-shaking上の懸念）
