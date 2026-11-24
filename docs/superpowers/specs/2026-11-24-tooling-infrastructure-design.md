# Tooling infrastructure design

Date: 2026-11-24
Status: draft for approval

## Intent

Add a coherent quality and security layer around the app without turning it into a monorepo or adding external service accounts. The repository should be self-checking locally and in GitHub Actions, with clear separation between:

- fast local checks on commit;
- slower local/CLI checks on demand;
- CI checks that need a clean checkout and full history;
- external services that stay deferred until tokens are available.

## Goals

- One command per concern: duplication, unused code, spelling, secrets, docs style, Semgrep.
- Lefthook pre-commit runs only fast checks; full suite stays explicit.
- GitHub Actions runs `bun run validate`, quality tools, CodeQL, Semgrep, gitleaks, TruffleHog on push/PR.
- Config files are committed; no `.env`, tokens or service credentials.
- Bun remains the only package manager/runtime for project scripts.
- Exact dependency versions only (`exact = true` in `bunfig.toml`).

## Non-goals

- No SonarCloud, GitGuardian, Semgrep AppSec Platform or Renovate bot activation without tokens/account setup.
- No npm/pnpm/yarn workspaces, Turborepo or Nx.
- No commit-time full E2E or mutation testing — too slow.
- No replacing oxfmt/oxlint/svelte-check/typecheck; new tools complement them.
- No secret values in workflow files; GitHub-provided `GITHUB_TOKEN` only where required.

## Approaches

### Local-first + GitHub Actions (chosen)

Commit local configs and Bun scripts, add two workflows: `quality.yml` (deterministic checks) and `security.yml` (CodeQL, Semgrep, gitleaks, TruffleHog). Deferred services get config stubs only if they are useful without activation (Renovate config), otherwise documentation.

### Local only

Would keep everything in scripts and hooks, no CI. Rejected: no automatic checks on PRs, no CodeQL, no full-history secret scan.

### Full external stack

Would activate SonarCloud, GitGuardian, Semgrep Platform and Renovate immediately. Rejected: requires account setup, tokens and third-party data flow; can be added incrementally later.

## Tool map

| Concern | Tool | Where | Notes |
| --- | --- | --- | --- |
| Duplicates | jscpd 5.4.3 | local + CI | Config `.jscpd.json`, threshold low, ignore generated/vendor. |
| Unused code/deps | knip 6.48.0 | local + CI | Config `knip.json`, Bun entrypoints and workspace layout. |
| Spelling | cspell 10.5.2 + `@cspell/dict-ru_ru` 2.3.4 | local + CI | `cspell.json`, English + Russian dictionaries, project-words file. |
| Secrets (source) | secretlint 13.x + preset 13.1.0 | hook + local + CI | `.secretlintrc.json`; masks values in output. |
| Secrets (history) | gitleaks v3 action | CI only | Full history with `fetch-depth: 0`, `GITHUB_TOKEN`. |
| Secrets (verified) | TruffleHog action | CI only | `--only-verified --fail`, full history. |
| SAST | Semgrep 1.186.0 | local script + CI | `semgrep scan --config .semgrep.yml --error`; CI uses pinned pip version, no platform token. |
| CodeQL | `github/codeql-action` | CI only | JavaScript/TypeScript, security-extended queries. |
| Markdown | markdownlint-cli2 0.24.2 | local + CI | `.markdownlint-cli2.jsonc`, pragmatic rule exclusions for generated docs. |
| Line endings | EditorConfig | repo | `.editorconfig`, LF, UTF-8, 2 spaces, final newline. |
| Hooks | lefthook 2.2.2 | local | `lefthook.yml`, pre-commit fast checks; `hooks:install` script. |
| Dependency updates | Renovate | config only | `renovate.json` committed, bot activation deferred. |
| Code quality service | Sonar | config only | `sonar-project.properties` with placeholders, job deferred. |
| Secret service | GitGuardian | deferred | documented activation path only. |

## Layout

```
.editorconfig
.github/
  workflows/quality.yml
  workflows/security.yml
.jscpd.json
.markdownlint-cli2.jsonc
.secretlintrc.json
.semgrep.yml
cspell.json
project-words.txt
knip.json
lefthook.yml
renovate.json
sonar-project.properties
scripts/tooling.ts        # dispatcher: dup, unused, spell, secrets, docs, sast
docs/superpowers/specs/... design doc
```

## Commands

- `bun run dup` → jscpd
- `bun run unused` → knip
- `bun run spell` → cspell
- `bun run secrets` → secretlint
- `bun run docs:lint` → markdownlint-cli2
- `bun run sast` → local Semgrep if installed, otherwise explicit message that CI covers it
- `bun run quality` → all local static checks except full validate
- `bun run hooks:install` → `lefthook install`

`validate` stays the required gate and may gain `quality` later only if the tools are fast and deterministic; initial implementation keeps them separate to avoid slowing every task.

## CI jobs

`quality.yml` on push/PR:
- checkout, setup Bun 1.4.4, `bun install --frozen-lockfile`;
- `bun run validate`;
- `bun run dup`, `bun run unused`, `bun run spell`, `bun run secrets`, `bun run docs:lint`.

`security.yml` on push/PR/schedule and `workflow_dispatch`:
- CodeQL init/analyze;
- Semgrep via pinned `pip install semgrep==1.186.0`, `semgrep scan --config .semgrep.yml --error`;
- gitleaks action v3 with full history and `GITHUB_TOKEN`;
- TruffleHog with `--only-verified --fail`.

## Constraints

- No `.env` files; no token values in repository; no secret output.
- Exact versions in `package.json`; no version ranges.
- UI strings remain English; project docs English.
- Generated dirs (`dist`, `coverage`, `reports`, `.stryker-tmp`, `node_modules`, `test-results`, `playwright-report`) are excluded everywhere.
- `.agents/**` vendored skills stay excluded from lint/format checks.
- Sonar/GitGuardian/Renovate bot activation requires explicit user action and credentials.

## Deferred work

- Activate SonarCloud and replace placeholder project key/organization.
- Install GitGuardian GitHub App and add `GITHUB_TOKEN`/API key as secret only if needed.
- Install Renovate GitHub App; `renovate.json` is ready.
- Move Semgrep to platform mode with `SEMGREP_APP_TOKEN` only if central triage is desired.
