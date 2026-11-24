import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const mode = process.argv[2] === "diff" ? "diff" : "full";
const extra = process.argv.slice(3);
const args = ["x", "stryker", "run", "stryker.conf.json"];

if (mode === "diff") {
  args.push("--incremental");
} else {
  args.push("--force");
}

args.push(...extra);

const child = Bun.spawn(["bun", ...args], { stdout: "inherit", stderr: "inherit" });
const exitCode = await child.exited;

const source = "reports/mutation/mutation.json";

if (existsSync(source)) {
  mkdirSync("reports/mutation/history", { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  copyFileSync(source, `reports/mutation/history/${stamp}-${mode}.json`);
}

process.exit(exitCode);
