const semgrep = Bun.which("semgrep");

if (!semgrep) {
  console.info("Semgrep is not installed locally; CI runs it on every push and pull request.");
} else {
  const child = Bun.spawn([semgrep, "scan", "--config", ".semgrep.yml", "--error", "."], {
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exitCode = await child.exited;
}
