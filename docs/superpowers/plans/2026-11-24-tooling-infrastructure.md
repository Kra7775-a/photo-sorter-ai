# Tooling Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local quality/security tooling and GitHub Actions around the app without external service accounts or version changes to app dependencies.

**Architecture:** Configs live at the repo root; Bun package scripts call each tool; Lefthook runs fast checks pre-commit; two GitHub Actions workflows cover quality and security. Sonar, GitGuardian and Renovate activation stay deferred. Existing app versions and the pending Stryker diff are untouched.

**Tech Stack:** Bun, exact devDependencies (jscpd 5.4.3, knip 6.48.0, cspell 10.5.2, secretlint 13.1.0, markdownlint-cli2 0.24.2, lefthook 2.2.2), GitHub Actions, Semgrep 1.186.0, gitleaks-action v3, TruffleHog action v3.100.0, CodeQL action v4.

**Spec:** `docs/superpowers/specs/2026-11-24-tooling-infrastructure-design.md`

## Global Constraints

- Bun only; `exact = true` in `bunfig.toml`: no version ranges.
- No `.env`, tokens or secrets in the repo; workflow secrets only via `secrets.GITHUB_TOKEN`.
- Code/identifiers/comments English; docs English; existing app UI copy stays English.
- No changes to app dependency versions or source behavior.
- Generated dirs excluded everywhere: `node_modules`, `dist`, `coverage`, `reports`, `.stryker-tmp`, `test-results`, `playwright-report`.
- `.agents/**` is vendored and excluded from new checks.
- Full `bun run validate` remains green before each commit; all new scripts must pass locally.

## Review Focus

1. Secret scanners must not print secrets; `.env.example` and test placeholders must not create false positives that block commits.
2. Knip entry patterns must include Bun scripts, Vite config, Playwright/E2E tests and the Svelte entry point; otherwise it reports false unused files/deps.
3. cspell must understand English + Russian and project terms (`MobileCLIP`, `onnxruntime`, `better-auth`, `zip.js`) without growing an enormous dictionary.
4. Lefthook must stay fast: no `validate`, E2E or mutation in pre-commit.
5. CI workflows must pin action versions and never require unavailable secrets.

---

### Task 1: Local quality configs and scripts

**Files:**
- Modify: `package.json`
- Create: `.jscpd.json`, `knip.json`, `cspell.json`, `project-words.txt`, `.secretlintrc.json`, `.markdownlint-cli2.jsonc`, `.editorconfig`

**Interfaces:**
- Produces scripts: `dup`, `unused`, `spell`, `secrets`, `docs:lint`, `quality`.
- `quality` = `bun run dup && bun run unused && bun run spell && bun run secrets && bun run docs:lint`.
- `dup` uses `jscpd --config .jscpd.json src server scripts tests docs`.
- `unused` uses `knip --config knip.json`.
- `spell` uses `cspell --config cspell.json --no-progress "**/*"`.
- `secrets` uses `secretlint "**/*" --secretlintignore .gitignore`.
- `docs:lint` uses `markdownlint-cli2 "**/*.md"`.

- [ ] **Step 1:** add devDependencies with exact versions:
  `bun add -d jscpd@5.4.3 knip@6.48.0 cspell@10.5.2 @cspell/dict-ru_ru@2.3.4 secretlint@13.1.0 @secretlint/secretlint-rule-preset-recommend@13.1.0 markdownlint-cli2@0.24.2`.
- [ ] **Step 2:** write configs with exclusions from Global Constraints. Knip entry: `src/main.ts`, `src/**/*.svelte`, `server/main.ts`, `server/{keygen,rewrap}.ts`, `scripts/**/*.ts`, `playwright.config.ts`, `svelte-loader.ts`; project: `src/**/*.{ts,svelte}`, `server/**/*.ts`, `scripts/**/*.ts`, `tests/**/*.ts`, root configs.
- [ ] **Step 3:** run each script; fix only config/ignore false positives, not app code, unless a real unused file/dep is found and can be removed safely.
- [ ] **Step 4:** `bun run format`, `bun run quality`, `bun run validate` → all green. Do NOT commit.

### Task 2: Lefthook and Semgrep setup

**Files:**
- Modify: `package.json`
- Create: `lefthook.yml`, `.semgrep.yml`, `scripts/semgrep.ts`

**Interfaces:**
- Produces scripts: `hooks:install`, `sast`.
- `hooks:install` = `lefthook install`.
- `sast` calls `bun scripts/semgrep.ts`, which runs `semgrep scan --config .semgrep.yml --error .` when `semgrep` is on PATH, otherwise prints a short instruction and exits 0 locally (CI always has it).
- Lefthook pre-commit commands: `bun run format:check`, `bun run lint`, `bun run arch:check`, `bun run secrets`, `bun run spell` on changed files only where practical.

- [ ] **Step 1:** `bun add -d lefthook@2.2.2`.
- [ ] **Step 2:** write `lefthook.yml` with a `pre-commit` group of fast checks; no E2E, mutation or full validate.
- [ ] **Step 3:** write `.semgrep.yml` with two local rules: no `eval`/`Function` on user data, no direct `innerHTML` assignments in `src/**`.
- [ ] **Step 4:** run `bun run hooks:install` (local git hooks) and `bun run sast`; if Semgrep is absent, confirm the fallback message; if present, confirm no findings.
- [ ] **Step 5:** `bun run validate` → green. Do NOT commit.

### Task 3: GitHub Actions and deferred configs

**Files:**
- Create: `.github/workflows/quality.yml`, `.github/workflows/security.yml`, `renovate.json`, `sonar-project.properties`
- Modify: `README.md`, `AGENTS.md`

**Interfaces:**
- `quality.yml`: on push/PR to `main`; checkout v6, setup Bun 1.4.4 via `oven-sh/setup-bun@v2`, `bun install --frozen-lockfile`, then `validate`, `dup`, `unused`, `spell`, `secrets`, `docs:lint`.
- `security.yml`: on push/PR to `main`, weekly schedule, `workflow_dispatch`. Jobs:
  - CodeQL via `github/codeql-action/init@v4`, `autobuild`, `analyze@v4`, language `javascript-typescript`;
  - Semgrep via `actions/setup-python@v6`, pinned `pip install semgrep==1.186.0`, `semgrep scan --config .semgrep.yml --error`;
  - gitleaks via `gitleaks/gitleaks-action@v3` with `fetch-depth: 0` and `GITHUB_TOKEN`;
  - TruffleHog via `trufflesecurity/trufflehog@v3.100.0` with `extra_args: --results=verified,unknown --fail` and `fetch-depth: 0`.
- `renovate.json`: extends `config:recommended`, groups devDependencies and GitHub Actions, no token.
- `sonar-project.properties`: placeholder `sonar.projectKey`, `sonar.organization`, `sonar.sources=src,server,scripts`; document that activation needs SonarCloud token.

- [ ] **Step 1:** write both workflows with least-privilege `permissions: contents: read` plus `security-events: write` for CodeQL.
- [ ] **Step 2:** write `renovate.json` and `sonar-project.properties`; no secrets, no activation.
- [ ] **Step 3:** validate YAML syntax with Python `yaml.safe_load` (or `bun x actionlint` if already available); validate JSON with `node -e`.
- [ ] **Step 4:** document new commands, hooks, CI jobs and deferred services in README; update AGENTS commands with `quality`, `sast`, `hooks:install`.
- [ ] **Step 5:** `bun run format`, `bun run quality`, `bun run validate` → green. Do NOT commit.

## Self-Review Notes

- No package versions changed for app deps; only new dev tools added with exact versions.
- Deferred services are config-only and documented, not active.
- Lefthook and CI do not run slow mutation/E2E suites.
- All new tools complement, not replace, the existing validate gate.
