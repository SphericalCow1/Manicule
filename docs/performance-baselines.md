# Performance Baselines

This document records reproducible performance measurements for the derived
workspace indexes and whole-workspace queries. Markdown files remain the source
of truth; the benchmark only creates disposable workspaces below the operating
system's temporary directory.

## Benchmark

Run the benchmark from `src-tauri/`:

```sh
cargo run --locked --release --example reindex_benchmark -- [options]
```

The benchmark calls the same Rust functions used by the application for full
reindexing, workspace search, Task Overview loading, and one-file saving. It is
a Cargo example, not an application binary. `Cargo.toml` therefore continues to
declare only the `Manicule` binary and `cargo run` remains unambiguous through
`default-run = "Manicule"`. The existing Tauri GitHub Actions build matrix does
not need an additional target or bundle configuration.

Every measured operation has one warm-up run and five timed runs. The benchmark
reports median, average, and slowest time. Dataset generation and release
compilation are outside the measurements.

## Interaction Budgets

| Operation | Median budget | Rationale |
|---|---:|---|
| Full reindex | 1,000 ms | Background refresh should normally finish without a prolonged stale view. |
| One-file incremental reindex | 250 ms | An ordinary external edit should refresh derived data without interrupting interaction. |
| Workspace search | 300 ms | Search should feel interactive after the user submits a query. |
| Task Overview | 500 ms | Opening the overview may do more work than search but should remain responsive. |
| One-file save recovery | 250 ms | Saving and refreshing the affected derived data should not interrupt editing. |

The 5,000-page dataset is a stress gate, not a promise that every operation will
always remain below budget on all supported hardware. A missed stress budget is
evidence for focused architecture work and must not be turned into a flaky CI
timing assertion.

## Baseline Environment

- Date: 2026-09-01
- Hardware: MacBook Air, Intel Core i5 1.8 GHz, 2 cores / 4 logical CPUs, 8 GB RAM
- Operating system: macOS 12.7.6, x86_64
- Build profile: Cargo `release`
- Manicule version: 0.6.7 development branch

## Results

| Dataset | Files | Bytes | Links | Tasks | Reindex median / slow | Search median / slow | Tasks median / slow | Save median / slow |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sparse | 100 | 43,308 | 300 | 100 | 11.26 / 11.63 ms | 3.65 / 18.42 ms | 8.05 / 14.31 ms | 1.58 / 1.68 ms |
| Realistic | 1,000 | 1,011,730 | 6,000 | 1,000 | 434.93 / 470.82 ms | 59.08 / 61.95 ms | 160.15 / 165.78 ms | 1.36 / 1.94 ms |
| Stress | 5,000 | 5,080,850 | 30,000 | 5,000 | 8,611.10 / 9,416.37 ms | 315.49 / 324.96 ms | 868.48 / 889.20 ms | 4.18 / 5.36 ms |
| Large page | 1 | 3,694,478 | 101 | 1 | 295.69 / 366.65 ms | 46.55 / 47.54 ms | 313.68 / 322.81 ms | 311.51 / 312.37 ms |

Commands:

```sh
cargo run --locked --release --example reindex_benchmark -- --files 100 --folders 10 --links-per-file 2 --body-lines 8 --warmup-runs 1 --runs 5
cargo run --locked --release --example reindex_benchmark -- --files 1000 --folders 50 --links-per-file 5 --body-lines 20 --warmup-runs 1 --runs 5
cargo run --locked --release --example reindex_benchmark -- --files 5000 --folders 100 --links-per-file 5 --body-lines 20 --warmup-runs 1 --runs 5
cargo run --locked --release --example reindex_benchmark -- --files 1 --folders 1 --links-per-file 100 --body-lines 100000 --warmup-runs 1 --runs 5
```

## Decisions

The 100- and 1,000-page datasets meet all budgets. The 5,000-page stress case
misses the budgets for full reindex, workspace search, and Task Overview. This
justifies a coherent in-memory content snapshot for query paths and an
incremental watcher path, with a full rebuild retained as the recovery path.

The large-page save misses its budget while the ordinary datasets do not. This
is tracked separately from whole-workspace indexing: parsing one unusually
large changed page is still required to keep its title and backlinks current,
so incremental workspace indexing alone cannot remove that cost.

Lock-scope changes remain conditional on measured contention after incremental
indexing exists. Moving filesystem work outside the workspace lock without a
version check would trade latency for stale-state races.

## Sprint 4 Follow-up

After adding the content snapshot and incremental watcher path, the two datasets
that missed a baseline budget were measured again with the same environment and
commands on 2026-09-01:

| Dataset | Reindex median / slow | Search median / slow | Tasks median / slow | Incremental median / slow | Save median / slow |
|---|---:|---:|---:|---:|---:|
| Stress, 5,000 files | 8,478.26 / 8,614.51 ms | 130.77 / 131.27 ms | 615.55 / 655.34 ms | 62.39 / 63.51 ms | 2.99 / 6.10 ms |
| Large page, 3.69 MB | 309.66 / 322.65 ms | 47.16 / 51.71 ms | 317.29 / 320.59 ms | 298.66 / 324.65 ms | 314.80 / 350.66 ms |

Workspace search now meets its stress budget, and the normal one-file watcher
path avoids the 8.5-second full reindex. Task Overview remains 115.55 ms over
its median stress budget. A pre-parsed task index is deferred because the miss
occurs at 5,000 generated task files, while the 1,000-file realistic baseline
was already well within budget. Add that extra derived state only if real
workspace measurements show a user-visible problem.

The large-page incremental and save paths necessarily parse the complete
changed page to keep its title and backlinks current. They remain documented
exceptions rather than a reason to weaken index consistency.

The incremental update currently runs while holding the workspace mutex. The
measured ordinary stress update holds that operation for about 62 ms and no lock
contention has been observed. Lock restructuring is therefore deferred. Any
future attempt to move filesystem reads outside the lock must add a workspace
generation or content-version check before committing derived state.
