use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use semtags_lib::app_state::WorkspaceState;
use semtags_lib::index::backlink_index::BacklinkIndex;
use semtags_lib::index::page_index::PageIndex;
use semtags_lib::workspace_config::WorkspaceConfig;
use semtags_lib::workspace_index::reindex_workspace;

#[derive(Debug, Clone)]
struct BenchmarkConfig {
    files: usize,
    folders: usize,
    links_per_file: usize,
    body_lines: usize,
    runs: usize,
    keep_workspace: bool,
}

impl Default for BenchmarkConfig {
    fn default() -> Self {
        Self {
            files: 1_000,
            folders: 25,
            links_per_file: 3,
            body_lines: 8,
            runs: 5,
            keep_workspace: false,
        }
    }
}

fn main() -> Result<(), String> {
    let config = parse_config(env::args().skip(1).collect())?;
    let root = create_workspace(&config)?;

    println!("Semtags reindex benchmark");
    println!("workspace: {}", root.display());
    println!(
        "files: {}, folders: {}, links/file: {}, body lines/file: {}, runs: {}",
        config.files, config.folders, config.links_per_file, config.body_lines, config.runs
    );
    println!();

    let mut durations = Vec::with_capacity(config.runs);

    for run in 1..=config.runs {
        let mut workspace = WorkspaceState {
            root: root.clone(),
            config: WorkspaceConfig::default(),
            folders: Vec::new(),
            pages: PageIndex::default(),
            backlinks: BacklinkIndex::default(),
        };

        let started = Instant::now();
        reindex_workspace(&mut workspace)?;
        let duration = started.elapsed();
        durations.push(duration.as_secs_f64() * 1_000.0);

        println!(
            "run {run}: {:.2} ms, pages: {}, diagnostics: {}",
            duration.as_secs_f64() * 1_000.0,
            workspace.pages.pages().len(),
            workspace.pages.collision_diagnostics().len()
        );
    }

    durations.sort_by(|left, right| left.total_cmp(right));
    let min = durations.first().copied().unwrap_or_default();
    let max = durations.last().copied().unwrap_or_default();
    let median = median(&durations);
    let average = durations.iter().sum::<f64>() / durations.len() as f64;

    println!();
    println!("min: {:.2} ms", min);
    println!("median: {:.2} ms", median);
    println!("average: {:.2} ms", average);
    println!("max: {:.2} ms", max);
    println!("decision band: {}", decision_band(median));

    if config.keep_workspace {
        println!("workspace kept at {}", root.display());
    } else {
        fs::remove_dir_all(&root)
            .map_err(|error| format!("Failed to remove benchmark workspace: {error}"))?;
    }

    Ok(())
}

fn parse_config(args: Vec<String>) -> Result<BenchmarkConfig, String> {
    let mut config = BenchmarkConfig::default();
    let mut index = 0;

    while index < args.len() {
        let arg = &args[index];
        match arg.as_str() {
            "--files" => {
                config.files = parse_usize_arg(&args, index, "--files")?;
                index += 2;
            }
            "--folders" => {
                config.folders = parse_usize_arg(&args, index, "--folders")?;
                index += 2;
            }
            "--links-per-file" => {
                config.links_per_file = parse_usize_arg(&args, index, "--links-per-file")?;
                index += 2;
            }
            "--body-lines" => {
                config.body_lines = parse_usize_arg(&args, index, "--body-lines")?;
                index += 2;
            }
            "--runs" => {
                config.runs = parse_usize_arg(&args, index, "--runs")?;
                index += 2;
            }
            "--keep-workspace" => {
                config.keep_workspace = true;
                index += 1;
            }
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            _ => return Err(format!("Unknown argument '{arg}'. Use --help for usage.")),
        }
    }

    if config.files == 0 {
        return Err("--files must be greater than 0".to_string());
    }
    if config.folders == 0 {
        return Err("--folders must be greater than 0".to_string());
    }
    if config.runs == 0 {
        return Err("--runs must be greater than 0".to_string());
    }

    Ok(config)
}

fn parse_usize_arg(args: &[String], index: usize, name: &str) -> Result<usize, String> {
    let value = args
        .get(index + 1)
        .ok_or_else(|| format!("{name} requires a value"))?;
    value
        .parse::<usize>()
        .map_err(|_| format!("{name} requires a positive integer"))
}

fn print_help() {
    println!("Usage: cargo run --example reindex_benchmark -- [options]");
    println!();
    println!("Options:");
    println!("  --files <n>           Number of markdown files, default 1000");
    println!("  --folders <n>         Number of folders, default 25");
    println!("  --links-per-file <n>  Wiki links per file, default 3");
    println!("  --body-lines <n>      Plain list lines per file, default 8");
    println!("  --runs <n>            Reindex runs, default 5");
    println!("  --keep-workspace      Keep generated workspace for inspection");
}

fn create_workspace(config: &BenchmarkConfig) -> Result<PathBuf, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Failed to read system time: {error}"))?
        .as_nanos();
    let root = env::temp_dir().join(format!("semtags-reindex-benchmark-{now}"));

    fs::create_dir_all(&root)
        .map_err(|error| format!("Failed to create benchmark root: {error}"))?;

    for file_index in 0..config.files {
        let folder = root.join(format!(
            "folder-{:03}",
            file_index % config.folders.min(config.files)
        ));
        fs::create_dir_all(&folder)
            .map_err(|error| format!("Failed to create benchmark folder: {error}"))?;

        let relative_target = page_target(file_index, config.folders);
        let path = folder.join(format!("page-{file_index:06}.md"));
        fs::write(path, page_content(file_index, &relative_target, config))
            .map_err(|error| format!("Failed to write benchmark page: {error}"))?;
    }

    Ok(root)
}

fn page_target(file_index: usize, folders: usize) -> String {
    format!("folder-{:03}/page-{file_index:06}", file_index % folders)
}

fn page_content(file_index: usize, self_target: &str, config: &BenchmarkConfig) -> String {
    let mut content = format!("# Page {file_index:06}\n\n- TODO Review [[{self_target}]]\n");

    for link_index in 0..config.links_per_file {
        let target_index = (file_index + link_index + 1) % config.files;
        let target = page_target(target_index, config.folders);
        content.push_str(&format!(
            "  - Linked context [[{target}|Target {target_index}]]\n"
        ));
    }

    for line_index in 0..config.body_lines {
        content.push_str(&format!(
            "- Project note {line_index} for page {file_index:06}\n"
        ));
    }

    content
}

fn decision_band(median_ms: f64) -> &'static str {
    if median_ms <= 300.0 {
        "keep full reindex"
    } else if median_ms <= 1_000.0 {
        "keep full reindex, tune debounce/events if needed"
    } else if median_ms <= 2_000.0 {
        "plan incremental reindex"
    } else {
        "prioritize incremental reindex"
    }
}

fn median(sorted_values: &[f64]) -> f64 {
    let middle = sorted_values.len() / 2;
    if sorted_values.len().is_multiple_of(2) {
        (sorted_values[middle - 1] + sorted_values[middle]) / 2.0
    } else {
        sorted_values[middle]
    }
}
