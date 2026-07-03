# Plan 002: Establish a test + CI baseline (Vitest, typecheck script, GitHub Actions)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0b0d4bb..HEAD -- package.json src/lib/content-type.ts src/lib/tints.ts src/lib/clipboard.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx / tests
- **Planned at**: commit `0b0d4bb`, 2026-07-03

## Why this matters

The frontend has zero tests and no test runner; the Rust test suite that does
exist (`crypto.rs`, `store.rs`, `keyring_dek.rs`, `blobs.rs`, `commands.rs`)
is never run automatically — there is no CI at all (no `.github/` directory).
Several other plans in this series change security-sensitive and
perf-sensitive code; they need a verification gate to land safely. This plan
adds Vitest with first characterization tests for pure frontend modules, a
`typecheck`/`test` script, and one GitHub Actions workflow that runs
typecheck + frontend tests + `cargo test` on every push/PR.

## Current state

- Package manager: **pnpm** (`pnpm-lock.yaml`, `pnpm-workspace.yaml` present).
- `package.json:6-15` scripts today: `dev`, `build` (`tsc && vite build`),
  `preview`, three `remotion:*` scripts, `tauri`. No `test`, `typecheck`, or
  `lint`.
- **Dependency policy (MUST follow, from the repo owner's global rules):** all
  versions in `package.json` are exact-pinned (no `^`/`~`). A project `.npmrc`
  sets `save-exact=true` and `ignore-scripts=true` — do not weaken either.
  Install new devDependencies normally with `pnpm add -D <pkg>`; save-exact
  will pin them. Vitest needs no postinstall scripts.
- Pure, dependency-light frontend modules to test first (all under `src/lib/`):
  - `content-type.ts` — exports `fileExt` and `contentType` (file/text →
    "note" | "link" | "code" | "image" | "file" classification).
  - `tints.ts` — exports `categoryTint` / `itemTint`, deterministic
    name→tint mapping.
  - `clipboard.ts` — clipboard-history store. Pure helpers worth testing:
    `labelForClipValue` (line 81), `clipMatches`/`filterClips` (lines 97–105),
    `shouldSuppressClipboardCapture`/`suppressClipboardCapture` (lines
    111–127, localStorage-backed with a 5s TTL), `addClip` de-dupe logic
    (lines 172–182), `clearClipsSince`/`restoreClips` (lines 188–204).
    These use `localStorage` — jsdom (or happy-dom) environment provides it.

```ts
// src/lib/clipboard.ts:117-127 (suppression consume-once semantics)
export function shouldSuppressClipboardCapture(value: string): boolean {
  const cur = readSuppressions();
  const idx = cur.findIndex((e) => e.value === value);
  if (idx === -1) {
    writeSuppressions(cur);
    return false;
  }
  cur.splice(idx, 1);
  writeSuppressions(cur);
  return true;
}
```

- Rust tests exist and pass locally via
  `cargo test --manifest-path src-tauri/Cargo.toml`.
- No `.github/` directory exists — you will create the workflow fresh.
- `tsconfig.json` exists at root; `pnpm exec tsc --noEmit` is the typecheck.

## Commands you will need

| Purpose         | Command                                              | Expected on success |
|-----------------|------------------------------------------------------|---------------------|
| Install         | `pnpm install`                                       | exit 0              |
| Typecheck       | `pnpm typecheck` (added in Step 1)                   | exit 0              |
| Frontend tests  | `pnpm test` (added in Step 2)                        | all pass            |
| Rust tests      | `cargo test --manifest-path src-tauri/Cargo.toml`    | all pass            |

## Scope

**In scope** (the only files you should modify/create):
- `package.json` (scripts + exact-pinned devDeps: `vitest`, `jsdom` or
  `happy-dom`)
- `vitest.config.ts` (create)
- `src/lib/content-type.test.ts`, `src/lib/tints.test.ts`,
  `src/lib/clipboard.test.ts` (create)
- `.github/workflows/ci.yml` (create)

**Out of scope** (do NOT touch):
- `.npmrc` — never weaken `ignore-scripts`/`save-exact`.
- Any `src/` source module — tests are characterization: they encode CURRENT
  behavior. If a test reveals a bug, record it in the test as a comment and
  in your report; do not fix the source here.
- ESLint/Prettier — deliberately deferred (separate decision for the owner).
- Component/hook tests needing Tauri IPC mocks — phase 2, not this plan.

## Git workflow

- Branch: `advisor/002-test-ci-baseline`
- Commit style: imperative sentence (match `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add scripts and devDependencies

`pnpm add -D vitest jsdom` (exact versions will be pinned automatically).
Add scripts to `package.json`:

```json
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.ts` at root:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "jsdom", include: ["src/**/*.test.ts"] },
});
```

**Verify**: `pnpm typecheck` → exit 0. `pnpm test` → "no test files found" is
acceptable at this step only. Also verify `git diff package.json` shows the
new devDeps with exact versions (no `^`).

### Step 2: Characterization tests for content-type and tints

Read `src/lib/content-type.ts` and `src/lib/tints.ts` fully first. Write tests
that pin current behavior, e.g. for content-type: a URL string classifies as
link, a code-looking snippet as code, plain prose as note, `photo.png` file
ext as image, `doc.pdf` as file; for tints: same input → same tint, and
distinct known inputs map to the tints the current implementation returns
(compute expected values by reading the implementation, not by guessing).

**Verify**: `pnpm test` → all pass.

### Step 3: Characterization tests for clipboard.ts

Cover at minimum: `labelForClipValue` (URL → hostname; multiline → first
non-empty line, 60-char cap; empty → "Copied"), `clipMatches` (label/value/
sourceApp match, empty query → true), suppression consume-once (suppress →
first `shouldSuppress` true, second false; TTL expiry via faked `Date.now`),
`addClip` immediate-repeat de-dupe (same text+label+sourceApp not re-added;
different sourceApp is added), `clearClipsSince`/`restoreClips` round-trip.
Reset `localStorage` between tests (`beforeEach(() => localStorage.clear())`)
— note the module caches (`cache` variable); use `vi.resetModules()` +
dynamic import per test, or clear via the module's own `clearClipboard()`.

**Verify**: `pnpm test` → all pass (expect ~15+ tests total).

### Step 4: CI workflow

Create `.github/workflows/ci.yml`: trigger on `push` + `pull_request`; single
`macos-latest` job:

1. checkout
2. install pnpm (`pnpm/action-setup`) + Node 22 with pnpm cache
   (`actions/setup-node` with `cache: pnpm`)
3. `pnpm install --frozen-lockfile`
4. `pnpm typecheck`
5. `pnpm test`
6. rust toolchain (`dtolnay/rust-toolchain@stable`) + `Swatinem/rust-cache`
   with `workspaces: src-tauri`
7. `cargo test --manifest-path src-tauri/Cargo.toml`

Note: `cargo test` does not need the full Tauri bundling deps on macOS
runners; if it fails on missing system libs, see STOP conditions.

**Verify**: `pnpm exec node -e "require('js-yaml')"` is NOT available — just
validate YAML by eye and run `pnpm typecheck && pnpm test` locally once more.
CI itself is verified on first push by the operator.

## Test plan

Covered by Steps 2–3 (the tests ARE the deliverable). Pattern: plain Vitest
`describe`/`it`, no snapshot files.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0 with ≥15 passing tests across 3 new test files
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` still exits 0
- [ ] `grep -E '"(\^|~)' package.json` returns no matches (pins intact)
- [ ] `.github/workflows/ci.yml` exists and lists typecheck, vitest, cargo test steps
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm add -D` rewrites any existing pinned version or touches `.npmrc`.
- A characterization test reveals what looks like a real bug in
  `content-type.ts`/`tints.ts`/`clipboard.ts` — pin the current behavior,
  note it, and report; do not change source.
- `cargo test` fails on the CI recipe due to missing macOS system deps —
  report the exact error rather than adding `apt`/`brew` steps speculatively.

## Maintenance notes

- Plans 003–011 rely on `pnpm test` / `cargo test` as gates; keep them green.
- When ESLint is added later, extend the same workflow with a lint step.
- Phase 2 (deferred): component tests with a Tauri IPC mock
  (`@tauri-apps/api/mocks`) for `items-store.tsx` and hooks.
