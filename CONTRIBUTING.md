# Contributing

Logtext is a local Markdown-first knowledge workspace built with Tauri, Rust,
Svelte, TypeScript, and CodeMirror. Markdown files are the source of truth, so
changes that move, rename, delete, parse, or rewrite files should be handled
conservatively and covered with focused tests.

## Development Setup

Requirements:

- Node.js and npm
- Rust and Cargo
- Platform requirements for Tauri 2

Install dependencies:

```bash
npm install
```

Run the frontend dev server:

```bash
npm run dev
```

Run the Tauri desktop app:

```bash
npm run tauri dev
```

## Checks

Before opening a pull request, run the checks relevant to your change:

```bash
npm run check
npm run test:frontend
cd src-tauri
cargo fmt --check
cargo test
```

File operation changes should include tests for move, rename, delete behavior,
wiki-link rewriting, config cleanup or remapping, and dirty/conflict editor
safeguards.

## Pull Requests

- Treat `main` as stable and release-ready. Do not develop directly on it.
- Create a short-lived branch such as `feature/config-system`,
  `fix/startup-crash`, `refactor/link-index`, `docs/release-process`, or
  `chore/github-workflow`.
- Keep changes small and scoped.
- Prefer existing helpers and stores over new abstractions.
- Add abstractions only when they reduce real complexity.
- Do not include unrelated generated files or local workspace content.
- Call out user-data risks explicitly in the pull request description.
- Working branches may contain small commits, checkpoints, experiments, and
  fixups. Merge completed pull requests into `main` with Squash Merge.
- Delete the working branch after its squash merge.

Pushes to supported working branches and pull requests targeting `main` run
checks, tests, cross-platform builds, and produce temporary GitHub Actions
artifacts. They never create a GitHub Release.

## Commit Messages

Use conventional commit-style summaries where practical:

```text
<type>(<scope>): <short summary>
```

Useful types include `feat`, `fix`, `docs`, `refactor`, `test`, `chore`,
`build`, `ci`, and `perf`.

Use the same format for the pull-request title and final squash commit. Commit
bodies must end with:

```text
The code in this commit was written with ai-assistance.
```

## Releases

A merge to `main` is not a release. Official releases are created only by
semantic version tags such as `v1.2.3` that point to a tested commit on `main`.
The tag must match the version in the package, Cargo, and Tauri metadata.

Pushing the tag starts `.github/workflows/release.yml`. It reruns the complete
verification suite, builds Windows, macOS, and Linux packages, and creates the
GitHub Release only after all platform builds succeed.
