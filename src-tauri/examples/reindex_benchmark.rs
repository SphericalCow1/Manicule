use std::env;
use std::fs;
use std::hint::black_box;
use std::path::PathBuf;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use semtags_lib::app_state::WorkspaceState;
use semtags_lib::content_snapshot::ContentSnapshot;
use semtags_lib::dto::SavePageResultDto;
use semtags_lib::index::backlink_index::BacklinkIndex;
use semtags_lib::index::page_index::PageIndex;
use semtags_lib::page_io::{content_hash, save_page_in_workspace};
use semtags_lib::query::{list_tasks_in_workspace, search_pages_in_workspace};
use semtags_lib::workspace_config::WorkspaceConfig;
use semtags_lib::workspace_index::{reindex_workspace, reindex_workspace_paths};

#[derive(Debug, Clone)]
struct BenchmarkConfig {
    files: usize,
    folders: usize,
    links_per_file: usize,
    body_lines: usize,
    runs: usize,
    warmup_runs: usize,
    search_query: String,
    reindex_budget_ms: f64,
    incremental_budget_ms: f64,
    search_budget_ms: f64,
    tasks_budget_ms: f64,
    save_budget_ms: f64,
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
            warmup_runs: 1,
            search_query: "benchmark-match".to_string(),
            reindex_budget_ms: 1_000.0,
            incremental_budget_ms: 250.0,
            search_budget_ms: 300.0,
            tasks_budget_ms: 500.0,
            save_budget_ms: 250.0,
            keep_workspace: false,
        }
    }
}

#[derive(Debug)]
struct GeneratedWorkspace {
    root: PathBuf,
    total_bytes: usize,
}

#[derive(Debug)]
struct Measurement {
    name: &'static str,
    median_ms: f64,
    average_ms: f64,
    slow_ms: f64,
    budget_ms: f64,
    output_count: usize,
}

impl Measurement {
    fn within_budget(&self) -> bool {
        self.median_ms <= self.budget_ms
    }
}

fn main() -> Result<(), String> {
    let arguments: Vec<String> = env::args().collect();
    let config = parse_config(arguments.iter().skip(1).cloned().collect())?;
    let generated = create_workspace(&config)?;
    let result = run_benchmarks(&config, &generated, &arguments);

    if config.keep_workspace {
        println!("workspace kept at {}", generated.root.display());
    } else if let Err(error) = fs::remove_dir_all(&generated.root) {
        eprintln!(
            "warning: failed to remove benchmark workspace '{}': {error}",
            generated.root.display()
        );
    }

    result
}

fn run_benchmarks(
    config: &BenchmarkConfig,
    generated: &GeneratedWorkspace,
    arguments: &[String],
) -> Result<(), String> {
    println!("Semtags indexing and query benchmark");
    println!("workspace: {}", generated.root.display());
    println!("os/arch: {}/{}", env::consts::OS, env::consts::ARCH);
    println!(
        "logical CPUs: {}",
        std::thread::available_parallelism()
            .map(usize::from)
            .unwrap_or(1)
    );
    println!(
        "build profile: {}",
        if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        }
    );
    println!("arguments: {}", arguments.join(" "));
    println!(
        "files: {}, folders: {}, bytes: {}, links: {}, tasks: {}, body lines/file: {}",
        config.files,
        config.folders.min(config.files),
        generated.total_bytes,
        config.files * (config.links_per_file + 1),
        config.files,
        config.body_lines
    );
    println!(
        "warmups: {}, measured runs: {}, search query: {:?}",
        config.warmup_runs, config.runs, config.search_query
    );
    println!();

    let mut workspace = empty_workspace(generated.root.clone());
    let reindex = measure_operation(
        "full reindex",
        config.warmup_runs,
        config.runs,
        config.reindex_budget_ms,
        || {
            reindex_workspace(&mut workspace)?;
            Ok(workspace.pages.pages().len())
        },
    )?;

    let search = measure_operation(
        "workspace search",
        config.warmup_runs,
        config.runs,
        config.search_budget_ms,
        || Ok(search_pages_in_workspace(&workspace, &config.search_query)?.len()),
    )?;

    let tasks = measure_operation(
        "task overview",
        config.warmup_runs,
        config.runs,
        config.tasks_budget_ms,
        || Ok(list_tasks_in_workspace(&workspace)?.len()),
    )?;

    let target_path = page_target(0, config.folders);
    let target_absolute_path = generated.root.join(&target_path).with_extension("md");
    let indexed_content = fs::read_to_string(&target_absolute_path).map_err(|error| {
        format!(
            "Failed to read incremental benchmark page '{}': {error}",
            target_absolute_path.display()
        )
    })?;
    let target_markdown_path = target_path_with_extension(0, config.folders);
    let mut incremental_iteration = 0_usize;
    let incremental = measure_operation_with_setup(
        "one-file incremental",
        config.warmup_runs,
        config.runs,
        config.incremental_budget_ms,
        || {
            incremental_iteration += 1;
            fs::write(
                &target_absolute_path,
                format!(
                    "{indexed_content}\n- External generation {}\n",
                    incremental_iteration % 2
                ),
            )
            .map_err(|error| {
                format!(
                    "Failed to prepare incremental benchmark page '{}': {error}",
                    target_absolute_path.display()
                )
            })
        },
        || {
            reindex_workspace_paths(&mut workspace, [target_markdown_path.clone()])?;
            Ok(1)
        },
    )?;

    let original_content = fs::read_to_string(&target_absolute_path).map_err(|error| {
        format!(
            "Failed to read save benchmark page '{}': {error}",
            target_absolute_path.display()
        )
    })?;
    let mut expected_hash = content_hash(&original_content);
    let mut save_iteration = 0_usize;
    let save = measure_operation(
        "one-file save recovery",
        config.warmup_runs,
        config.runs,
        config.save_budget_ms,
        || {
            save_iteration += 1;
            let content = format!(
                "{original_content}\n- Benchmark save generation {}\n",
                save_iteration % 2
            );
            let result = save_page_in_workspace(
                &mut workspace,
                &target_path_with_extension(0, config.folders),
                content,
                String::new(),
                expected_hash.clone(),
            )?;

            match result {
                SavePageResultDto::Saved { content_hash, .. } => {
                    expected_hash = content_hash;
                    Ok(1)
                }
                SavePageResultDto::Conflict { .. } => {
                    Err("Unexpected conflict in save benchmark".to_string())
                }
            }
        },
    )?;

    let measurements = [reindex, search, tasks, incremental, save];
    print_measurements(&measurements);
    print_decision(&measurements);
    Ok(())
}

fn empty_workspace(root: PathBuf) -> WorkspaceState {
    WorkspaceState {
        root,
        config: WorkspaceConfig::default(),
        folders: Vec::new(),
        pages: PageIndex::default(),
        backlinks: BacklinkIndex::default(),
        contents: ContentSnapshot::default(),
    }
}

fn measure_operation<F>(
    name: &'static str,
    warmup_runs: usize,
    runs: usize,
    budget_ms: f64,
    operation: F,
) -> Result<Measurement, String>
where
    F: FnMut() -> Result<usize, String>,
{
    measure_operation_with_setup(name, warmup_runs, runs, budget_ms, || Ok(()), operation)
}

fn measure_operation_with_setup<S, F>(
    name: &'static str,
    warmup_runs: usize,
    runs: usize,
    budget_ms: f64,
    mut setup: S,
    mut operation: F,
) -> Result<Measurement, String>
where
    S: FnMut() -> Result<(), String>,
    F: FnMut() -> Result<usize, String>,
{
    for _ in 0..warmup_runs {
        setup()?;
        black_box(operation()?);
    }

    let mut durations = Vec::with_capacity(runs);
    let mut output_count = 0;
    for _ in 0..runs {
        setup()?;
        let started = Instant::now();
        output_count = operation()?;
        durations.push(started.elapsed().as_secs_f64() * 1_000.0);
        black_box(output_count);
    }

    durations.sort_by(|left, right| left.total_cmp(right));
    Ok(Measurement {
        name,
        median_ms: median(&durations),
        average_ms: durations.iter().sum::<f64>() / durations.len() as f64,
        slow_ms: durations.last().copied().unwrap_or_default(),
        budget_ms,
        output_count,
    })
}

fn print_measurements(measurements: &[Measurement]) {
    println!(
        "{:<24} {:>12} {:>12} {:>12} {:>12} {:>9} {:>10}",
        "operation", "median ms", "average ms", "slow ms", "budget ms", "status", "output"
    );
    for measurement in measurements {
        println!(
            "{:<24} {:>12.2} {:>12.2} {:>12.2} {:>12.2} {:>9} {:>10}",
            measurement.name,
            measurement.median_ms,
            measurement.average_ms,
            measurement.slow_ms,
            measurement.budget_ms,
            if measurement.within_budget() {
                "PASS"
            } else {
                "MISS"
            },
            measurement.output_count
        );
    }
    println!();
}

fn print_decision(measurements: &[Measurement]) {
    let reindex = measurement(measurements, "full reindex");
    let search = measurement(measurements, "workspace search");
    let tasks = measurement(measurements, "task overview");
    let incremental = measurement(measurements, "one-file incremental");
    let save = measurement(measurements, "one-file save recovery");

    if search.within_budget() && tasks.within_budget() {
        println!("content snapshot gate: defer; search and tasks meet their budgets");
    } else {
        println!("content snapshot gate: investigate; search or tasks miss their budget");
    }

    if reindex.median_ms <= 1_000.0 {
        println!("incremental reindex gate: keep full reindex");
    } else if reindex.median_ms <= 2_000.0 {
        println!("incremental reindex gate: plan and validate incremental indexing");
    } else {
        println!("incremental reindex gate: prioritize incremental indexing");
    }

    if incremental.within_budget() {
        println!("incremental recovery gate: keep one-file incremental indexing");
    } else {
        println!("incremental recovery gate: profile changed-page indexing");
    }

    if save.within_budget() {
        println!("save recovery gate: keep current one-page index update");
    } else {
        println!("save recovery gate: profile the one-page save path");
    }
}

fn measurement<'a>(measurements: &'a [Measurement], name: &str) -> &'a Measurement {
    measurements
        .iter()
        .find(|measurement| measurement.name == name)
        .unwrap_or_else(|| panic!("Missing benchmark measurement '{name}'"))
}

fn parse_config(args: Vec<String>) -> Result<BenchmarkConfig, String> {
    let mut config = BenchmarkConfig::default();
    let mut index = 0;

    while index < args.len() {
        let arg = &args[index];
        match arg.as_str() {
            "--files" => set_usize(&mut config.files, &args, index, "--files")?,
            "--folders" => set_usize(&mut config.folders, &args, index, "--folders")?,
            "--links-per-file" => {
                set_usize(&mut config.links_per_file, &args, index, "--links-per-file")?
            }
            "--body-lines" => set_usize(&mut config.body_lines, &args, index, "--body-lines")?,
            "--runs" => set_usize(&mut config.runs, &args, index, "--runs")?,
            "--warmup-runs" => set_usize(&mut config.warmup_runs, &args, index, "--warmup-runs")?,
            "--search-query" => {
                config.search_query = string_arg(&args, index, "--search-query")?;
            }
            "--reindex-budget-ms" => set_f64(&mut config.reindex_budget_ms, &args, index, arg)?,
            "--incremental-budget-ms" => {
                set_f64(&mut config.incremental_budget_ms, &args, index, arg)?
            }
            "--search-budget-ms" => set_f64(&mut config.search_budget_ms, &args, index, arg)?,
            "--tasks-budget-ms" => set_f64(&mut config.tasks_budget_ms, &args, index, arg)?,
            "--save-budget-ms" => set_f64(&mut config.save_budget_ms, &args, index, arg)?,
            "--keep-workspace" => {
                config.keep_workspace = true;
                index += 1;
                continue;
            }
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            _ => return Err(format!("Unknown argument '{arg}'. Use --help for usage.")),
        }
        index += 2;
    }

    if config.files == 0 || config.folders == 0 || config.runs == 0 {
        return Err("--files, --folders, and --runs must be greater than 0".to_string());
    }
    if config.search_query.trim().is_empty() {
        return Err("--search-query must not be empty".to_string());
    }

    Ok(config)
}

fn set_usize(target: &mut usize, args: &[String], index: usize, name: &str) -> Result<(), String> {
    *target = string_arg(args, index, name)?
        .parse::<usize>()
        .map_err(|_| format!("{name} requires a non-negative integer"))?;
    Ok(())
}

fn set_f64(target: &mut f64, args: &[String], index: usize, name: &str) -> Result<(), String> {
    *target = string_arg(args, index, name)?
        .parse::<f64>()
        .map_err(|_| format!("{name} requires a number"))?;
    if !target.is_finite() || *target <= 0.0 {
        return Err(format!("{name} must be a positive finite number"));
    }
    Ok(())
}

fn string_arg(args: &[String], index: usize, name: &str) -> Result<String, String> {
    args.get(index + 1)
        .cloned()
        .ok_or_else(|| format!("{name} requires a value"))
}

fn print_help() {
    println!("Usage: cargo run --release --example reindex_benchmark -- [options]");
    println!();
    println!("Dataset options:");
    println!("  --files <n>           Markdown files, default 1000");
    println!("  --folders <n>         Folders, default 25");
    println!("  --links-per-file <n>  Child wiki links per file, default 3");
    println!("  --body-lines <n>      Plain list lines per file, default 8");
    println!("  --search-query <text> Search term, default benchmark-match");
    println!("Measurement options:");
    println!("  --warmup-runs <n>     Warmup runs, default 1");
    println!("  --runs <n>            Measured runs, default 5");
    println!("  --reindex-budget-ms <n>  Full-reindex budget, default 1000");
    println!("  --incremental-budget-ms <n>  One-file reindex budget, default 250");
    println!("  --search-budget-ms <n>   Search budget, default 300");
    println!("  --tasks-budget-ms <n>    Task-list budget, default 500");
    println!("  --save-budget-ms <n>     One-file save budget, default 250");
    println!("  --keep-workspace      Keep the generated workspace");
}

fn create_workspace(config: &BenchmarkConfig) -> Result<GeneratedWorkspace, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Failed to read system time: {error}"))?
        .as_nanos();
    let root = env::temp_dir().join(format!("semtags-performance-benchmark-{now}"));
    fs::create_dir_all(&root)
        .map_err(|error| format!("Failed to create benchmark root: {error}"))?;

    let mut total_bytes = 0;
    for file_index in 0..config.files {
        let folder = root.join(format!(
            "folder-{:03}",
            file_index % config.folders.min(config.files)
        ));
        fs::create_dir_all(&folder)
            .map_err(|error| format!("Failed to create benchmark folder: {error}"))?;

        let path = folder.join(format!("page-{file_index:06}.md"));
        let content = page_content(file_index, config);
        total_bytes += content.len();
        fs::write(path, content)
            .map_err(|error| format!("Failed to write benchmark page: {error}"))?;
    }

    Ok(GeneratedWorkspace { root, total_bytes })
}

fn page_target(file_index: usize, folders: usize) -> String {
    format!("folder-{:03}/page-{file_index:06}", file_index % folders)
}

fn target_path_with_extension(file_index: usize, folders: usize) -> String {
    format!("{}.md", page_target(file_index, folders))
}

fn page_content(file_index: usize, config: &BenchmarkConfig) -> String {
    let self_target = page_target(file_index, config.folders);
    let mut content = format!("# Page {file_index:06}\n\n- TODO Review [[{self_target}]]\n");

    for link_index in 0..config.links_per_file {
        let target_index = (file_index + link_index + 1) % config.files;
        let target = page_target(target_index, config.folders);
        content.push_str(&format!(
            "  - Linked context [[{target}|Target {target_index}]]\n"
        ));
    }

    if file_index % 25 == 0 {
        content.push_str("- Search marker benchmark-match\n");
    }

    for line_index in 0..config.body_lines {
        content.push_str(&format!(
            "- Project note {line_index} for page {file_index:06}\n"
        ));
    }

    content
}

fn median(sorted_values: &[f64]) -> f64 {
    let middle = sorted_values.len() / 2;
    if sorted_values.len().is_multiple_of(2) {
        (sorted_values[middle - 1] + sorted_values[middle]) / 2.0
    } else {
        sorted_values[middle]
    }
}
