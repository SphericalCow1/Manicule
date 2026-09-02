# Contributing

mentiNote is a local Markdown-first knowledge workspace built with Tauri, Rust,
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

- Keep changes small and scoped.
- Prefer existing helpers and stores over new abstractions.
- Add abstractions only when they reduce real complexity.
- Do not include unrelated generated files or local workspace content.
- Call out user-data risks explicitly in the pull request description.

## Commit Messages

Use conventional commit-style summaries where practical:

```text
<type>(<scope>): <short summary>
```

Useful types include `feat`, `fix`, `docs`, `refactor`, `test`, `chore`,
`build`, `ci`, and `perf`.
