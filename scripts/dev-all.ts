/**
 * Starts the Vite dev server and the Bun API together with one command.
 * The client keeps its own port (3000) and proxies `/api` to the server (3001).
 */
const children: ReturnType<typeof Bun.spawn>[] = [];
let stopping = false;

function stop(signal: NodeJS.Signals = "SIGTERM"): void {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    child.kill(signal);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stop(signal);
  });
}

const apiEnv = {
  ...process.env,
  // better-auth must issue cookies for the origin the browser actually uses.
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
};

children.push(
  Bun.spawn(["bun", "--bun", "vite"], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  }),
  Bun.spawn(["bun", "--watch", "server/main.ts"], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: apiEnv,
  }),
);

const exitCodes = await Promise.all(children.map((child) => child.exited));
stop();
process.exit(Math.max(...exitCodes));
