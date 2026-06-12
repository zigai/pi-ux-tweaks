# AGENTS.md

Guidance for agents working in this repository.

## Project shape

- This is a TypeScript ESM npm workspaces monorepo for Pi extensions.
- Packages live under `packages/*` and expose TypeScript entrypoints through each package's `pi.extensions` manifest.
- Extensions run inside Pi with user-level permissions. Treat config parsing, filesystem writes, and monkey-patches of Pi internals as high-risk changes.

## Commands

Run these from the repo root before handing off code changes:

```sh
npm run format:check
npm run lint
npm run typecheck
```

`npm run check` runs the same three gates in CI order. There is currently no automated test suite; do not claim test coverage beyond the commands above unless you add and run targeted tests.

## Style and code conventions

- TypeScript is strict (`tsconfig.json`) and ESM (`type: module`). Keep explicit `.ts` suffixes on local imports, matching existing files.
- Formatting is handled by `oxfmt`; do not hand-format large blocks.
- `oxlint` enforces no ternary expressions in TypeScript. Prefer clear `if`/`else` assignments.
- Avoid `any`, `@ts-ignore`, and unchecked prototype assumptions. Use narrow structural types for Pi internals.
- Existing commits use Conventional Commit subjects such as `fix(pi-tree): ...` and `feat(pi-mention-skill): ...`.

## Extension-specific guidance

- Pi packages are independently installable. Avoid adding cross-package runtime dependencies unless the target dependency is published and declared in the consuming package.
- When reading Pi agent files, prefer `getAgentDir()` from `@earendil-works/pi-coding-agent` so `PI_CODING_AGENT_DIR` and Pi's own path resolution stay consistent.
- Do not overwrite malformed user JSON. Read-only paths may fall back to defaults, but write paths must fail before replacing an invalid `settings.json`, `modes.json`, or package config.
- Prototype monkey-patches must be idempotent. Keep `Symbol.for(...)` patch markers and only set them after the required prototype methods/modules have been verified.
- Dynamic imports of Pi internal files should fail gracefully with a clear warning; a Pi minor release should not crash startup just because an internal component moved.

## Packaging notes

- Package manifests include `files` allowlists. If a README references an asset that must be present in the npm tarball, verify with `npm pack --dry-run -w <workspace>` before changing the manifest.
- Keep README install snippets and the root package table in sync when adding/removing packages.
