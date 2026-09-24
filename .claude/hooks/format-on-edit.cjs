// PostToolUse(Write|Edit) hook: src/**/*.ts と tests/**/*.ts を編集した後に
// prettier --write と eslint --fix を自動実行する。
// jq が使えない環境でも動くよう Node.js で標準入力の JSON を処理する。
const { execFileSync } = require("node:child_process");

let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(input);
    const filePath = payload.tool_input?.file_path ?? payload.tool_response?.filePath;
    if (!filePath) return;

    const normalized = filePath.replace(/\\/g, "/");
    const isTarget = /\/(src|tests)\/.*\.ts$/.test(normalized) || /^(src|tests)\/.*\.ts$/.test(normalized);
    if (!isTarget) return;

    const cwd = process.cwd();
    const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const run = (args) =>
      execFileSync(npxCmd, ["--no-install", ...args, filePath], {
        cwd,
        stdio: "ignore",
        shell: process.platform === "win32",
      });

    run(["prettier", "--write"]);
    run(["eslint", "--fix"]);
  } catch {
    // フォーマット/lintの失敗で編集自体をブロックしない
  }
});
