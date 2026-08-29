use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

pub const DEFAULT_TASK_STATES: [&str; 4] = ["TODO", "INPROGRESS", "WAITING", "DONE"];
pub const DEFAULT_PAGE_SORT: &str = "name-desc";
pub const DEFAULT_THEME_MODE: &str = "light";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConfig {
    pub task_states: Vec<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub task_state_colors: HashMap<String, String>,
    #[serde(default = "default_task_done_sound_enabled")]
    pub task_done_sound_enabled: bool,
    #[serde(default = "default_page_sort")]
    pub default_page_sort: String,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub folder_page_sort: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub manual_page_order: HashMap<String, Vec<String>>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub folder_colors: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expanded_folders: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub page_favorites: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub recent_pages: Vec<String>,
    #[serde(default)]
    pub navigation_layout: NavigationLayoutConfig,
    #[serde(default)]
    pub task_overview: TaskOverviewConfig,
    #[serde(default)]
    pub backlink_view: BacklinkViewConfig,
    #[serde(default = "default_theme_mode")]
    pub theme_mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_editor_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_right_pane_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigationLayoutConfig {
    #[serde(default = "default_quick_access_height")]
    pub quick_access_height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskOverviewConfig {
    #[serde(default = "default_status_filter")]
    pub status_filter: String,
    #[serde(default = "default_priority_filter")]
    pub priority_filter: String,
    #[serde(default)]
    pub text_filter: String,
    #[serde(default = "default_group_mode")]
    pub group_mode: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkViewConfig {
    #[serde(default)]
    pub open_tasks_only: bool,
}

impl Default for NavigationLayoutConfig {
    fn default() -> Self {
        Self {
            quick_access_height: default_quick_access_height(),
        }
    }
}

impl Default for TaskOverviewConfig {
    fn default() -> Self {
        Self {
            status_filter: default_status_filter(),
            priority_filter: default_priority_filter(),
            text_filter: String::new(),
            group_mode: default_group_mode(),
        }
    }
}

impl Default for BacklinkViewConfig {
    fn default() -> Self {
        Self {
            open_tasks_only: false,
        }
    }
}

impl Default for WorkspaceConfig {
    fn default() -> Self {
        let task_states: Vec<String> = DEFAULT_TASK_STATES
            .iter()
            .map(|state| state.to_string())
            .collect();
        Self {
            task_state_colors: default_task_state_colors(&task_states),
            task_states,
            task_done_sound_enabled: default_task_done_sound_enabled(),
            default_page_sort: default_page_sort(),
            folder_page_sort: default_folder_page_sort(),
            manual_page_order: HashMap::new(),
            folder_colors: HashMap::new(),
            expanded_folders: None,
            page_favorites: Vec::new(),
            recent_pages: Vec::new(),
            navigation_layout: NavigationLayoutConfig::default(),
            task_overview: TaskOverviewConfig::default(),
            backlink_view: BacklinkViewConfig::default(),
            theme_mode: default_theme_mode(),
            last_editor_path: None,
            last_right_pane_path: None,
        }
    }
}

pub fn load_or_create_workspace_config(root: &Path) -> Result<WorkspaceConfig, String> {
    let path = root.join(".config");

    if !path.exists() {
        let config = WorkspaceConfig::default();
        write_workspace_config(&path, &config)?;
        return Ok(config);
    }

    if !path.is_file() {
        return Err("Workspace .config exists but is not a file".to_string());
    }

    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read workspace .config: {error}"))?;

    if content.trim().is_empty() {
        let config = WorkspaceConfig::default();
        write_workspace_config(&path, &config)?;
        return Ok(config);
    }

    let config: WorkspaceConfig = serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse workspace .config: {error}"))?;
    let task_states = normalize_task_states(config.task_states)?;
    let task_state_colors = normalize_task_state_colors(config.task_state_colors, &task_states);
    let default_page_sort = normalize_page_sort(config.default_page_sort, DEFAULT_PAGE_SORT);

    Ok(WorkspaceConfig {
        task_states,
        task_state_colors,
        task_done_sound_enabled: config.task_done_sound_enabled,
        default_page_sort: default_page_sort.clone(),
        folder_page_sort: normalize_folder_page_sort(config.folder_page_sort, &default_page_sort),
        manual_page_order: normalize_manual_page_order(config.manual_page_order),
        folder_colors: normalize_folder_colors(config.folder_colors),
        expanded_folders: config.expanded_folders.map(normalize_expanded_folders),
        page_favorites: normalize_page_path_list(config.page_favorites, usize::MAX),
        recent_pages: normalize_page_path_list(config.recent_pages, 10),
        navigation_layout: normalize_navigation_layout_config(config.navigation_layout),
        task_overview: normalize_task_overview_config(config.task_overview),
        backlink_view: normalize_backlink_view_config(config.backlink_view),
        theme_mode: normalize_theme_mode(config.theme_mode),
        last_editor_path: normalize_optional_page_path(config.last_editor_path),
        last_right_pane_path: normalize_optional_page_path(config.last_right_pane_path),
    })
}

pub fn save_workspace_config(root: &Path, config: &WorkspaceConfig) -> Result<(), String> {
    write_workspace_config(&root.join(".config"), config)
}

fn write_workspace_config(path: &Path, config: &WorkspaceConfig) -> Result<(), String> {
    let content = serde_json::to_string_pretty(config)
        .map_err(|error| format!("Failed to serialize workspace .config: {error}"))?;
    fs::write(path, format!("{content}\n"))
        .map_err(|error| format!("Failed to write workspace .config: {error}"))
}

fn normalize_task_states(task_states: Vec<String>) -> Result<Vec<String>, String> {
    let mut normalized = Vec::new();

    for state in task_states {
        let trimmed = state.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !trimmed
            .chars()
            .all(|char| char.is_ascii_uppercase() || char.is_ascii_digit() || char == '_')
        {
            return Err(format!(
                "Invalid task state '{trimmed}'. Use uppercase letters, digits or underscores."
            ));
        }
        if !normalized.iter().any(|existing| existing == trimmed) {
            normalized.push(trimmed.to_string());
        }
    }

    if normalized.is_empty() {
        return Err("Workspace .config must define at least one task state".to_string());
    }

    Ok(normalized)
}

fn normalize_task_state_colors(
    task_state_colors: HashMap<String, String>,
    task_states: &[String],
) -> HashMap<String, String> {
    let mut normalized = default_task_state_colors(task_states);

    for (state, color) in task_state_colors {
        let state = state.trim();
        if !task_states.iter().any(|candidate| candidate == state) {
            continue;
        }

        let color = color.trim().to_ascii_lowercase();
        if is_valid_task_color(&color) {
            normalized.insert(state.to_string(), color);
        }
    }

    normalized
}

fn default_task_state_colors(task_states: &[String]) -> HashMap<String, String> {
    let fallback_palette = ["red", "blue", "orange", "green", "grey", "yellow"];
    let mut colors = HashMap::new();

    for (index, state) in task_states.iter().enumerate() {
        let color = match state.as_str() {
            "TODO" => "red",
            "INPROGRESS" => "blue",
            "WAITING" => "orange",
            "DONE" => "green",
            _ => fallback_palette[index % fallback_palette.len()],
        };
        colors.insert(state.clone(), color.to_string());
    }

    colors
}

fn is_valid_task_color(color: &str) -> bool {
    matches!(
        color,
        "red" | "yellow" | "green" | "blue" | "grey" | "orange" | "pink"
    )
}

pub fn normalize_folder_colors(folder_colors: HashMap<String, String>) -> HashMap<String, String> {
    let mut normalized = HashMap::new();

    for (path, color) in folder_colors {
        let path = path.trim().trim_matches('/').replace('\\', "/");
        if path.is_empty() || path.split('/').any(|segment| segment == "..") {
            continue;
        }

        let color = color.trim().to_ascii_lowercase();
        if is_valid_task_color(&color) {
            normalized.insert(path, color);
        }
    }

    normalized
}

pub fn normalize_expanded_folders(expanded_folders: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();

    for path in expanded_folders {
        let trimmed = path.trim().trim_matches('/').replace('\\', "/");
        if trimmed.is_empty() || trimmed.split('/').any(|segment| segment == "..") {
            continue;
        }
        if !normalized.iter().any(|existing| existing == &trimmed) {
            normalized.push(trimmed);
        }
    }

    normalized.sort_by(|left, right| left.to_lowercase().cmp(&right.to_lowercase()));
    normalized
}

pub fn normalize_task_overview_config(config: TaskOverviewConfig) -> TaskOverviewConfig {
    TaskOverviewConfig {
        status_filter: normalize_filter_value(config.status_filter, &default_status_filter()),
        priority_filter: normalize_filter_value(config.priority_filter, &default_priority_filter()),
        text_filter: config.text_filter.trim().to_string(),
        group_mode: normalize_group_mode(config.group_mode),
    }
}

pub fn normalize_navigation_layout_config(
    config: NavigationLayoutConfig,
) -> NavigationLayoutConfig {
    NavigationLayoutConfig {
        quick_access_height: config.quick_access_height.clamp(80, 520),
    }
}

pub fn normalize_backlink_view_config(config: BacklinkViewConfig) -> BacklinkViewConfig {
    BacklinkViewConfig {
        open_tasks_only: config.open_tasks_only,
    }
}

pub fn normalize_theme_mode(theme_mode: String) -> String {
    match theme_mode.trim().to_ascii_lowercase().as_str() {
        "dark" => "dark".to_string(),
        _ => default_theme_mode(),
    }
}

fn default_quick_access_height() -> u32 {
    220
}

pub fn normalize_page_sort(value: String, fallback: &str) -> String {
    let trimmed = value.trim();
    if is_valid_page_sort(trimmed) {
        trimmed.to_string()
    } else {
        fallback.to_string()
    }
}

pub fn normalize_folder_page_sort(
    folder_page_sort: HashMap<String, String>,
    default_page_sort: &str,
) -> HashMap<String, String> {
    let mut normalized = default_folder_page_sort();

    for (path, sort) in folder_page_sort {
        let path = path.trim().trim_matches('/').replace('\\', "/");
        if path.split('/').any(|segment| segment == "..") {
            continue;
        }

        let sort = normalize_page_sort(sort, default_page_sort);
        if sort == default_page_sort && !default_folder_page_sort().contains_key(&path) {
            continue;
        }

        normalized.insert(path, sort);
    }

    normalized
}

pub fn normalize_manual_page_order(
    manual_page_order: HashMap<String, Vec<String>>,
) -> HashMap<String, Vec<String>> {
    let mut normalized = HashMap::new();

    for (folder_path, child_paths) in manual_page_order {
        let folder_path = folder_path.trim().trim_matches('/').replace('\\', "/");
        if folder_path.split('/').any(|segment| segment == "..") {
            continue;
        }

        let child_paths = normalize_navigation_path_list(child_paths);
        if !child_paths.is_empty() {
            normalized.insert(folder_path, child_paths);
        }
    }

    normalized
}

pub fn normalize_optional_page_path(path: Option<String>) -> Option<String> {
    let path = path?.trim().trim_matches('/').replace('\\', "/");
    if path.is_empty() || path.split('/').any(|segment| segment == "..") {
        return None;
    }

    Some(path)
}

pub fn normalize_page_path_list(paths: Vec<String>, limit: usize) -> Vec<String> {
    let mut normalized = Vec::new();

    for path in paths {
        let Some(path) = normalize_optional_page_path(Some(path)) else {
            continue;
        };

        if !normalized
            .iter()
            .any(|existing: &String| existing.eq_ignore_ascii_case(&path))
        {
            normalized.push(path);
        }

        if normalized.len() >= limit {
            break;
        }
    }

    normalized
}

fn normalize_navigation_path_list(paths: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();

    for path in paths {
        let path = path.trim().trim_matches('/').replace('\\', "/");
        if path.is_empty() || path.split('/').any(|segment| segment == "..") {
            continue;
        }

        if !normalized
            .iter()
            .any(|existing: &String| existing.eq_ignore_ascii_case(&path))
        {
            normalized.push(path);
        }
    }

    normalized
}

fn is_valid_page_sort(value: &str) -> bool {
    matches!(
        value,
        "name-desc" | "name-asc" | "modified-desc" | "modified-asc"
    )
}

fn normalize_filter_value(value: String, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_group_mode(value: String) -> String {
    let trimmed = value.trim();
    if matches!(
        trimmed,
        "status" | "priority" | "source" | "folder" | "linked-page"
    ) {
        trimmed.to_string()
    } else {
        default_group_mode()
    }
}

fn default_status_filter() -> String {
    "OPEN".to_string()
}

fn default_priority_filter() -> String {
    "ALL".to_string()
}

fn default_group_mode() -> String {
    "status".to_string()
}

fn default_task_done_sound_enabled() -> bool {
    true
}

fn default_page_sort() -> String {
    DEFAULT_PAGE_SORT.to_string()
}

fn default_theme_mode() -> String {
    DEFAULT_THEME_MODE.to_string()
}

fn default_folder_page_sort() -> HashMap<String, String> {
    HashMap::from([("journal".to_string(), "name-desc".to_string())])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    #[test]
    fn creates_default_workspace_config() {
        let root = temp_workspace();

        let config = load_or_create_workspace_config(&root).unwrap();

        assert_eq!(
            config.task_states,
            vec!["TODO", "INPROGRESS", "WAITING", "DONE"]
        );
        assert_eq!(
            config.task_state_colors.get("TODO"),
            Some(&"red".to_string())
        );
        assert_eq!(
            config.task_state_colors.get("INPROGRESS"),
            Some(&"blue".to_string())
        );
        assert_eq!(
            config.task_state_colors.get("WAITING"),
            Some(&"orange".to_string())
        );
        assert_eq!(
            config.task_state_colors.get("DONE"),
            Some(&"green".to_string())
        );
        assert_eq!(config.expanded_folders, None);
        assert_eq!(config.task_overview, TaskOverviewConfig::default());
        assert!(config.task_done_sound_enabled);
        assert_eq!(config.default_page_sort, "name-desc");
        assert_eq!(
            config.folder_page_sort.get("journal"),
            Some(&"name-desc".to_string())
        );
        assert!(config.folder_colors.is_empty());
        assert_eq!(config.theme_mode, "light");
        assert_eq!(config.last_editor_path, None);
        assert_eq!(config.last_right_pane_path, None);
        assert!(root.join(".config").is_file());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn loads_custom_task_states() {
        let root = temp_workspace();
        fs::write(
            root.join(".config"),
            r#"{"taskStates":["TODO","BLOCKED","DONE"]}"#,
        )
        .unwrap();

        let config = load_or_create_workspace_config(&root).unwrap();

        assert_eq!(config.task_states, vec!["TODO", "BLOCKED", "DONE"]);
        assert_eq!(
            config.task_state_colors.get("TODO"),
            Some(&"red".to_string())
        );
        assert_eq!(
            config.task_state_colors.get("BLOCKED"),
            Some(&"blue".to_string())
        );
        assert_eq!(
            config.task_state_colors.get("DONE"),
            Some(&"green".to_string())
        );
        assert_eq!(config.expanded_folders, None);
        assert_eq!(config.task_overview, TaskOverviewConfig::default());
        assert!(config.task_done_sound_enabled);
        assert_eq!(config.default_page_sort, "name-desc");
        assert_eq!(
            config.folder_page_sort.get("journal"),
            Some(&"name-desc".to_string())
        );
        assert!(config.folder_colors.is_empty());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn loads_and_normalizes_folder_colors() {
        let root = temp_workspace();
        fs::write(
            root.join(".config"),
            r#"{"taskStates":["TODO","DONE"],"folderColors":{"projects":" Blue ","projects/acme":"orange","design":"pink","../outside":"red","bad":"purple","":"green"}}"#,
        )
        .unwrap();

        let config = load_or_create_workspace_config(&root).unwrap();

        assert_eq!(
            config.folder_colors.get("projects"),
            Some(&"blue".to_string())
        );
        assert_eq!(
            config.folder_colors.get("projects/acme"),
            Some(&"orange".to_string())
        );
        assert_eq!(
            config.folder_colors.get("design"),
            Some(&"pink".to_string())
        );
        assert!(!config.folder_colors.contains_key("../outside"));
        assert!(!config.folder_colors.contains_key("bad"));
        assert!(!config.folder_colors.contains_key(""));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn loads_and_normalizes_page_sort_config() {
        let root = temp_workspace();
        fs::write(
            root.join(".config"),
            r#"{"taskStates":["TODO","DONE"],"defaultPageSort":"name-asc","folderPageSort":{"journals":"modified-desc","projects":"name-asc","../outside":"name-desc","team\\ops":"modified-asc","bad":"unknown"}}"#,
        )
        .unwrap();

        let config = load_or_create_workspace_config(&root).unwrap();

        assert_eq!(config.default_page_sort, "name-asc");
        assert_eq!(
            config.folder_page_sort.get("journals"),
            Some(&"modified-desc".to_string())
        );
        assert_eq!(
            config.folder_page_sort.get("team/ops"),
            Some(&"modified-asc".to_string())
        );
        assert_eq!(
            config.folder_page_sort.get("journal"),
            Some(&"name-desc".to_string())
        );
        assert!(!config.folder_page_sort.contains_key("bad"));
        assert!(!config.folder_page_sort.contains_key("projects"));
        assert!(!config.folder_page_sort.contains_key("../outside"));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn loads_and_normalizes_manual_page_order() {
        let root = temp_workspace();
        fs::write(
            root.join(".config"),
            r#"{"taskStates":["TODO","DONE"],"manualPageOrder":{"":[" journal ","Inbox.md","inbox.md","../bad"],"projects\\alpha":["projects\\alpha/z.md"],"../outside":["bad.md"],"empty":[]}}"#,
        )
        .unwrap();

        let config = load_or_create_workspace_config(&root).unwrap();

        assert_eq!(
            config.manual_page_order.get(""),
            Some(&vec!["journal".to_string(), "Inbox.md".to_string()])
        );
        assert_eq!(
            config.manual_page_order.get("projects/alpha"),
            Some(&vec!["projects/alpha/z.md".to_string()])
        );
        assert!(!config.manual_page_order.contains_key("../outside"));
        assert!(!config.manual_page_order.contains_key("empty"));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn loads_task_done_sound_flag() {
        let root = temp_workspace();
        fs::write(
            root.join(".config"),
            r#"{"taskStates":["TODO","DONE"],"taskDoneSoundEnabled":false}"#,
        )
        .unwrap();

        let config = load_or_create_workspace_config(&root).unwrap();

        assert!(!config.task_done_sound_enabled);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn loads_and_normalizes_task_state_colors() {
        let root = temp_workspace();
        fs::write(
            root.join(".config"),
            r#"{"taskStates":["TODO","WAITING","DONE"],"taskStateColors":{"TODO":" yellow ","WAITING":"purple","DONE":"GREEN","UNKNOWN":"red"}}"#,
        )
        .unwrap();

        let config = load_or_create_workspace_config(&root).unwrap();

        assert_eq!(
            config.task_state_colors.get("TODO"),
            Some(&"yellow".to_string())
        );
        assert_eq!(
            config.task_state_colors.get("WAITING"),
            Some(&"orange".to_string())
        );
        assert_eq!(
            config.task_state_colors.get("DONE"),
            Some(&"green".to_string())
        );
        assert!(!config.task_state_colors.contains_key("UNKNOWN"));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn loads_and_normalizes_theme_mode() {
        let root = temp_workspace();
        fs::write(
            root.join(".config"),
            r#"{"taskStates":["TODO","DONE"],"themeMode":" DARK "}"#,
        )
        .unwrap();

        let config = load_or_create_workspace_config(&root).unwrap();

        assert_eq!(config.theme_mode, "dark");

        fs::write(
            root.join(".config"),
            r#"{"taskStates":["TODO","DONE"],"themeMode":"system"}"#,
        )
        .unwrap();

        let config = load_or_create_workspace_config(&root).unwrap();

        assert_eq!(config.theme_mode, "light");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn loads_and_normalizes_task_overview_config() {
        let root = temp_workspace();
        fs::write(
            root.join(".config"),
            r#"{"taskStates":["TODO","DONE"],"taskOverview":{"statusFilter":" DONE ","priorityFilter":" A ","textFilter":" kickoff ","groupMode":"linked-page"}}"#,
        )
        .unwrap();

        let config = load_or_create_workspace_config(&root).unwrap();

        assert_eq!(
            config.task_overview,
            TaskOverviewConfig {
                status_filter: "DONE".to_string(),
                priority_filter: "A".to_string(),
                text_filter: "kickoff".to_string(),
                group_mode: "linked-page".to_string(),
            }
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn falls_back_for_invalid_task_overview_group_mode() {
        let root = temp_workspace();
        fs::write(
            root.join(".config"),
            r#"{"taskStates":["TODO","DONE"],"taskOverview":{"groupMode":"kanban"}}"#,
        )
        .unwrap();

        let config = load_or_create_workspace_config(&root).unwrap();

        assert_eq!(config.task_overview.group_mode, "status");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn loads_and_normalizes_expanded_folders() {
        let root = temp_workspace();
        fs::write(
            root.join(".config"),
            r#"{"taskStates":["TODO","DONE"],"expandedFolders":["projects"," projects ","team\\ops","../outside","projects"]}"#,
        )
        .unwrap();

        let config = load_or_create_workspace_config(&root).unwrap();

        assert_eq!(
            config.expanded_folders,
            Some(vec!["projects".to_string(), "team/ops".to_string()])
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn loads_and_normalizes_last_opened_paths() {
        let root = temp_workspace();
        fs::write(
            root.join(".config"),
            r#"{"taskStates":["TODO","DONE"],"lastEditorPath":" projects\\alpha.md ","lastRightPanePath":"../outside.md"}"#,
        )
        .unwrap();

        let config = load_or_create_workspace_config(&root).unwrap();

        assert_eq!(
            config.last_editor_path,
            Some("projects/alpha.md".to_string())
        );
        assert_eq!(config.last_right_pane_path, None);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn saves_expanded_folders() {
        let root = temp_workspace();
        let config = WorkspaceConfig {
            task_states: vec!["TODO".to_string(), "DONE".to_string()],
            task_state_colors: default_task_state_colors(&["TODO".to_string(), "DONE".to_string()]),
            task_done_sound_enabled: true,
            default_page_sort: "name-desc".to_string(),
            folder_page_sort: HashMap::new(),
            manual_page_order: HashMap::new(),
            folder_colors: HashMap::new(),
            expanded_folders: Some(vec!["projects".to_string()]),
            page_favorites: Vec::new(),
            recent_pages: Vec::new(),
            navigation_layout: NavigationLayoutConfig::default(),
            task_overview: TaskOverviewConfig::default(),
            backlink_view: BacklinkViewConfig::default(),
            theme_mode: "light".to_string(),
            last_editor_path: None,
            last_right_pane_path: None,
        };

        save_workspace_config(&root, &config).unwrap();
        let saved = fs::read_to_string(root.join(".config")).unwrap();

        assert!(saved.contains("\"expandedFolders\""));
        assert!(saved.contains("\"projects\""));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn saves_task_overview_config() {
        let root = temp_workspace();
        let config = WorkspaceConfig {
            task_states: vec!["TODO".to_string(), "DONE".to_string()],
            task_state_colors: default_task_state_colors(&["TODO".to_string(), "DONE".to_string()]),
            task_done_sound_enabled: false,
            default_page_sort: "name-asc".to_string(),
            folder_page_sort: HashMap::from([("journals".to_string(), "name-desc".to_string())]),
            manual_page_order: HashMap::from([(
                "".to_string(),
                vec!["journals".to_string(), "projects/alpha.md".to_string()],
            )]),
            folder_colors: HashMap::new(),
            expanded_folders: None,
            page_favorites: vec!["projects/alpha.md".to_string()],
            recent_pages: (0..12)
                .map(|index| format!("journal/2026-08-{index:02}.md"))
                .collect(),
            navigation_layout: NavigationLayoutConfig {
                quick_access_height: 320,
            },
            task_overview: TaskOverviewConfig {
                status_filter: "DONE".to_string(),
                priority_filter: "A".to_string(),
                text_filter: "release".to_string(),
                group_mode: "priority".to_string(),
            },
            backlink_view: BacklinkViewConfig {
                open_tasks_only: true,
            },
            theme_mode: "dark".to_string(),
            last_editor_path: Some("projects/alpha.md".to_string()),
            last_right_pane_path: Some("journal/2026-08-21.md".to_string()),
        };

        save_workspace_config(&root, &config).unwrap();
        let saved = fs::read_to_string(root.join(".config")).unwrap();

        assert!(saved.contains("\"taskOverview\""));
        assert!(saved.contains("\"backlinkView\""));
        assert!(saved.contains("\"themeMode\": \"dark\""));
        assert!(saved.contains("\"openTasksOnly\": true"));
        assert!(saved.contains("\"taskDoneSoundEnabled\": false"));
        assert!(saved.contains("\"defaultPageSort\": \"name-asc\""));
        assert!(saved.contains("\"folderPageSort\""));
        assert!(saved.contains("\"manualPageOrder\""));
        assert!(saved.contains("\"pageFavorites\""));
        assert!(saved.contains("\"recentPages\""));
        assert!(saved.contains("\"navigationLayout\""));
        assert!(saved.contains("\"quickAccessHeight\": 320"));
        assert!(saved.contains("\"lastEditorPath\": \"projects/alpha.md\""));
        assert!(saved.contains("\"lastRightPanePath\": \"journal/2026-08-21.md\""));
        assert!(saved.contains("\"statusFilter\": \"DONE\""));
        assert!(saved.contains("\"groupMode\": \"priority\""));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn loads_and_normalizes_navigation_config() {
        let root = temp_workspace();
        fs::write(
            root.join(".config"),
            r#"{"taskStates":["TODO","DONE"],"pageFavorites":[" projects/alpha.md ","../bad.md","projects/alpha.md"],"recentPages":["a.md","b.md","c.md","d.md","e.md","f.md","g.md","h.md","i.md","j.md","k.md"]}"#,
        )
        .unwrap();

        let config = load_or_create_workspace_config(&root).unwrap();

        assert_eq!(config.page_favorites, vec!["projects/alpha.md"]);
        assert_eq!(config.recent_pages.len(), 10);
        assert_eq!(config.recent_pages[0], "a.md");
        assert_eq!(config.recent_pages[9], "j.md");

        fs::remove_dir_all(root).unwrap();
    }

    fn temp_workspace() -> std::path::PathBuf {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::SeqCst);
        let root = std::env::temp_dir().join(format!("semtags-config-test-{now}-{counter}"));
        fs::create_dir_all(&root).unwrap();
        root
    }
}
