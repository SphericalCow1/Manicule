use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager, State};

use crate::app_error::AppError;
use crate::app_state::{AppState, WorkspaceState};
use crate::content_snapshot::ContentSnapshot;
use crate::dto::{
    page_summaries, CreateFolderResultDto, CreatePageResultDto, DeleteFolderResultDto,
    DeletePageResultDto, MovePageResultDto, PageContentDto, PageSummaryDto, PageViewDto,
    RenameFolderResultDto, RenamePageResultDto, SavePageResultDto, SearchResultDto, TaskItemDto,
    ToggleCheckboxResultDto, UpdateTaskStatusResultDto, WorkspaceStateDto,
};
use crate::index::backlink_index::BacklinkIndex;
use crate::index::page_index::{markdown_with_default_h1, PageIndex};
#[cfg(test)]
use crate::page_io::save_page_to_disk;
use crate::page_io::{content_hash, modified_at_millis, save_page_in_workspace};
use crate::page_ops::{
    create_folder_in_workspace, create_page_in_workspace, delete_folder_in_workspace,
    delete_page_in_workspace, move_folder_in_workspace, move_page_in_workspace,
    rename_folder_in_workspace, rename_page_in_workspace,
};
use crate::page_view::get_page_view_from_workspace;
use crate::query::{
    list_tasks_in_workspace, search_pages_in_workspace, toggle_checkbox_in_workspace,
    update_task_priority_in_workspace, update_task_status_in_workspace,
};
use crate::user_config::{load_or_create_user_config, save_last_workspace};
use crate::watcher::start_workspace_watcher;
use crate::workspace::paths::resolve_workspace_relative_path;
use crate::workspace_config::load_or_create_workspace_config;
use crate::workspace_index::reindex_workspace;

#[tauri::command]
pub fn get_last_workspace(app_handle: AppHandle) -> Result<Option<String>, String> {
    let home_dir = app_handle
        .path()
        .home_dir()
        .map_err(|error| format!("Failed to resolve user home directory: {error}"))?;
    Ok(load_or_create_user_config(&home_dir)?.last_workspace)
}

#[tauri::command]
pub fn open_workspace(
    path: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<WorkspaceStateDto, String> {
    let root = PathBuf::from(path);

    if !root.is_dir() {
        return Err("Workspace path is not a directory".to_string());
    }

    let config = load_or_create_workspace_config(&root)?;
    let mut workspace = WorkspaceState {
        root: root.clone(),
        config,
        folders: Vec::new(),
        pages: PageIndex::default(),
        backlinks: BacklinkIndex::default(),
        contents: ContentSnapshot::default(),
    };
    reindex_workspace(&mut workspace)?;
    let diagnostics = workspace.pages.collision_diagnostics();
    let response = WorkspaceStateDto {
        root: root.to_string_lossy().to_string(),
        pages: page_summaries(&workspace.pages),
        folders: workspace.folders.clone(),
        diagnostics,
        task_states: workspace.config.task_states.clone(),
        task_state_colors: workspace.config.task_state_colors.clone(),
        task_done_sound_enabled: workspace.config.task_done_sound_enabled,
        default_page_sort: workspace.config.default_page_sort.clone(),
        folder_page_sort: workspace.config.folder_page_sort.clone(),
        manual_page_order: workspace.config.manual_page_order.clone(),
        folder_colors: workspace.config.folder_colors.clone(),
        expanded_folders: workspace.config.expanded_folders.clone(),
        page_favorites: workspace.config.page_favorites.clone(),
        recent_pages: workspace.config.recent_pages.clone(),
        navigation_layout: workspace.config.navigation_layout.clone(),
        task_overview: workspace.config.task_overview.clone(),
        backlink_view: workspace.config.backlink_view.clone(),
        theme_mode: workspace.config.theme_mode.clone(),
        last_editor_path: workspace.config.last_editor_path.clone(),
        last_right_pane_path: workspace.config.last_right_pane_path.clone(),
    };
    let home_dir = app_handle
        .path()
        .home_dir()
        .map_err(|error| format!("Failed to resolve user home directory: {error}"))?;
    save_last_workspace(&home_dir, &root)?;
    let watcher = start_workspace_watcher(root, app_handle)?;

    state.set_workspace(workspace)?;
    state.set_watcher(watcher)?;

    Ok(response)
}

#[tauri::command]
pub fn close_workspace(state: State<'_, AppState>) -> Result<(), String> {
    state.clear_workspace()
}

#[tauri::command]
pub fn list_pages(state: State<'_, AppState>) -> Result<Vec<PageSummaryDto>, String> {
    state.with_workspace(|workspace| page_summaries(&workspace.pages))
}

#[tauri::command]
pub fn create_page(
    path: String,
    state: State<'_, AppState>,
) -> Result<CreatePageResultDto, AppError> {
    state.with_workspace_mut_app(|workspace| create_page_in_workspace(workspace, path))
}

#[tauri::command]
pub fn create_folder(
    path: String,
    state: State<'_, AppState>,
) -> Result<CreateFolderResultDto, AppError> {
    state.with_workspace_mut_app(|workspace| create_folder_in_workspace(workspace, path))
}

#[tauri::command]
pub fn delete_page(
    path: String,
    state: State<'_, AppState>,
) -> Result<DeletePageResultDto, AppError> {
    state.with_workspace_mut_app(|workspace| delete_page_in_workspace(workspace, path))
}

#[tauri::command]
pub fn delete_folder(
    path: String,
    state: State<'_, AppState>,
) -> Result<DeleteFolderResultDto, AppError> {
    state.with_workspace_mut_app(|workspace| delete_folder_in_workspace(workspace, path))
}

#[tauri::command]
pub fn move_page(
    path: String,
    target_folder: String,
    state: State<'_, AppState>,
) -> Result<MovePageResultDto, AppError> {
    state.with_workspace_mut_app(|workspace| move_page_in_workspace(workspace, path, target_folder))
}

#[tauri::command]
pub fn move_folder(
    path: String,
    target_folder: String,
    state: State<'_, AppState>,
) -> Result<RenameFolderResultDto, AppError> {
    state.with_workspace_mut_app(|workspace| {
        move_folder_in_workspace(workspace, path, target_folder)
    })
}

#[tauri::command]
pub fn rename_page(
    path: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<RenamePageResultDto, AppError> {
    state.with_workspace_mut_app(|workspace| rename_page_in_workspace(workspace, path, new_name))
}

#[tauri::command]
pub fn rename_folder(
    path: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<RenameFolderResultDto, AppError> {
    state.with_workspace_mut_app(|workspace| rename_folder_in_workspace(workspace, path, new_name))
}

#[tauri::command]
pub fn open_page(path: String, state: State<'_, AppState>) -> Result<PageContentDto, String> {
    state.with_workspace_mut(|workspace| {
        let absolute_path = resolve_workspace_relative_path(&workspace.root, &path)
            .ok_or_else(|| "Invalid page path".to_string())?;

        if !absolute_path.is_file() {
            return Err("Page does not exist".to_string());
        }

        let mut content = fs::read_to_string(&absolute_path)
            .map_err(|error| format!("Failed to read page '{}': {error}", path))?;

        if let Some(updated_content) = markdown_with_default_h1(&content, &path) {
            fs::write(&absolute_path, &updated_content)
                .map_err(|error| format!("Failed to add page heading '{}': {error}", path))?;
            content = updated_content;
            workspace.index_page_content(path.clone(), content.clone());
        }

        let modified_at = modified_at_millis(&absolute_path)?;

        Ok(PageContentDto {
            path,
            content_hash: content_hash(&content),
            content,
            modified_at,
        })
    })?
}

#[tauri::command]
pub fn get_page_view(path: String, state: State<'_, AppState>) -> Result<PageViewDto, String> {
    state.with_workspace(|workspace| get_page_view_from_workspace(workspace, &path))?
}

#[tauri::command]
pub fn search_pages(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResultDto>, String> {
    state.with_workspace(|workspace| search_pages_in_workspace(workspace, &query))?
}

#[tauri::command]
pub fn list_tasks(state: State<'_, AppState>) -> Result<Vec<TaskItemDto>, String> {
    state.with_workspace(list_tasks_in_workspace)?
}

#[tauri::command]
pub fn update_task_status(
    path: String,
    line: usize,
    expected_status: String,
    new_status: String,
    state: State<'_, AppState>,
) -> Result<UpdateTaskStatusResultDto, String> {
    state.with_workspace_mut(|workspace| {
        update_task_status_in_workspace(workspace, &path, line, &expected_status, &new_status)
    })?
}

#[tauri::command]
pub fn update_task_priority(
    path: String,
    line: usize,
    priority: Option<String>,
    state: State<'_, AppState>,
) -> Result<UpdateTaskStatusResultDto, String> {
    state.with_workspace_mut(|workspace| {
        update_task_priority_in_workspace(workspace, &path, line, priority)
    })?
}

#[tauri::command]
pub fn toggle_checkbox(
    path: String,
    line: usize,
    state: State<'_, AppState>,
) -> Result<ToggleCheckboxResultDto, String> {
    state.with_workspace_mut(|workspace| toggle_checkbox_in_workspace(workspace, &path, line))?
}

#[tauri::command]
pub fn save_page(
    path: String,
    content: String,
    expected_modified_at: String,
    expected_content_hash: String,
    state: State<'_, AppState>,
) -> Result<SavePageResultDto, String> {
    state.with_workspace_mut(|workspace| {
        save_page_in_workspace(
            workspace,
            &path,
            content,
            expected_modified_at,
            expected_content_hash,
        )
    })?
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;
    use crate::workspace_config::WorkspaceConfig;

    static TEMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    #[test]
    fn save_page_writes_when_expected_metadata_matches() {
        let root = temp_workspace();
        let page_path = root.join("Inbox.md");
        fs::write(&page_path, "original").unwrap();
        let expected_modified_at = modified_at_millis(&page_path).unwrap();
        let expected_content_hash = content_hash("original");

        let result = save_page_to_disk(
            "Inbox.md".to_string(),
            page_path.clone(),
            "updated".to_string(),
            expected_modified_at,
            expected_content_hash,
        )
        .unwrap();

        assert!(matches!(result, SavePageResultDto::Saved { .. }));
        assert_eq!(fs::read_to_string(&page_path).unwrap(), "updated");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn save_page_returns_conflict_when_disk_content_changed() {
        let root = temp_workspace();
        let page_path = root.join("Inbox.md");
        fs::write(&page_path, "original").unwrap();
        let expected_modified_at = modified_at_millis(&page_path).unwrap();
        let expected_content_hash = content_hash("original");
        fs::write(&page_path, "external").unwrap();

        let result = save_page_to_disk(
            "Inbox.md".to_string(),
            page_path.clone(),
            "local".to_string(),
            expected_modified_at,
            expected_content_hash,
        )
        .unwrap();

        assert!(matches!(result, SavePageResultDto::Conflict { .. }));
        assert_eq!(fs::read_to_string(&page_path).unwrap(), "external");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn save_page_allows_timestamp_only_changes_when_content_matches() {
        let root = temp_workspace();
        let page_path = root.join("Inbox.md");
        fs::write(&page_path, "original").unwrap();
        let expected_content_hash = content_hash("original");

        let result = save_page_to_disk(
            "Inbox.md".to_string(),
            page_path.clone(),
            "updated".to_string(),
            "stale-timestamp".to_string(),
            expected_content_hash,
        )
        .unwrap();

        assert!(matches!(result, SavePageResultDto::Saved { .. }));
        assert_eq!(fs::read_to_string(&page_path).unwrap(), "updated");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn save_page_can_save_same_file_twice_in_sequence() {
        let root = temp_workspace();
        let page_path = root.join("Inbox.md");
        fs::write(&page_path, "original").unwrap();
        let first_modified_at = modified_at_millis(&page_path).unwrap();

        let first = save_page_to_disk(
            "Inbox.md".to_string(),
            page_path.clone(),
            "first".to_string(),
            first_modified_at,
            content_hash("original"),
        )
        .unwrap();
        let SavePageResultDto::Saved {
            modified_at,
            content_hash,
            ..
        } = first
        else {
            panic!("expected first save to succeed");
        };

        let second = save_page_to_disk(
            "Inbox.md".to_string(),
            page_path.clone(),
            "second".to_string(),
            modified_at,
            content_hash,
        )
        .unwrap();

        assert!(matches!(second, SavePageResultDto::Saved { .. }));
        assert_eq!(fs::read_to_string(&page_path).unwrap(), "second");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reindex_workspace_builds_backlink_index() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("Meetings")).unwrap();
        fs::create_dir_all(root.join("Projekte")).unwrap();
        fs::write(
            root.join("Meetings").join("Teamrunde.md"),
            "- Wir priorisieren [[Projekte/Alpha]]\n  - Budget offen",
        )
        .unwrap();
        fs::write(root.join("Projekte").join("Alpha.md"), "# Alpha").unwrap();
        let mut workspace = WorkspaceState {
            root: root.clone(),
            config: WorkspaceConfig::default(),
            folders: Vec::new(),
            pages: PageIndex::default(),
            backlinks: BacklinkIndex::default(),
            contents: ContentSnapshot::default(),
        };

        reindex_workspace(&mut workspace).unwrap();
        let linked = workspace
            .backlinks
            .backlinks_for_target_key("projekte/alpha");

        assert_eq!(linked.len(), 1);
        assert_eq!(linked[0].source_path, "Meetings/Teamrunde.md");
        assert_eq!(
            linked[0].block_markdown,
            "- Wir priorisieren [[Projekte/Alpha]]\n  - Budget offen"
        );
        assert_eq!(workspace.contents.len(), 2);
        assert_eq!(
            workspace.contents.get("Meetings/Teamrunde.md"),
            Some("- Wir priorisieren [[Projekte/Alpha]]\n  - Budget offen")
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn page_view_smoke_scenario_shows_linked_block_with_children() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("team")).unwrap();
        fs::create_dir_all(root.join("projects")).unwrap();
        fs::write(
            root.join("team").join("nadine.md"),
            "# Nadine Ott\n- Bearbeitet Projekt [[projects/forecasts.md]]\n    - ist dabei gut.",
        )
        .unwrap();
        fs::write(
            root.join("projects").join("forecasts.md"),
            "# Forecasting Projekt\nWird aktuell bearbeitet durch ... [[team/nadine]]\n\n- [[team/jens]] macht auch mit\n    - soweit ok",
        )
        .unwrap();
        fs::write(
            root.join("team").join("jens.md"),
            "Hallo, hier kommt Jens hin",
        )
        .unwrap();
        let mut workspace = test_workspace_state(root.clone(), PageIndex::default());

        reindex_workspace(&mut workspace).unwrap();
        let page_view = get_page_view_from_workspace(&workspace, "projects/forecasts.md").unwrap();

        assert_eq!(page_view.page.path, "projects/forecasts.md");
        assert_eq!(page_view.backlinks.len(), 1);
        assert_eq!(page_view.backlinks[0].source_path, "team/nadine.md");
        assert_eq!(
            page_view.backlinks[0].block_markdown,
            "- Bearbeitet Projekt [[projects/forecasts.md]]\n    - ist dabei gut."
        );

        let nadine_view = get_page_view_from_workspace(&workspace, "team/nadine.md").unwrap();
        assert_eq!(nadine_view.backlinks.len(), 1);
        assert_eq!(
            nadine_view.backlinks[0].source_path,
            "projects/forecasts.md"
        );
        assert_eq!(
            nadine_view.backlinks[0].block_markdown,
            "Wird aktuell bearbeitet durch ... [[team/nadine]]\n"
        );

        let jens_view = get_page_view_from_workspace(&workspace, "team/jens.md").unwrap();
        assert_eq!(jens_view.backlinks.len(), 1);
        assert_eq!(jens_view.backlinks[0].source_path, "projects/forecasts.md");
        assert_eq!(
            jens_view.backlinks[0].block_markdown,
            "- [[team/jens]] macht auch mit\n    - soweit ok"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn create_page_creates_markdown_file_and_indexes_it() {
        let root = temp_workspace();
        let mut workspace = test_workspace_state(root.clone(), PageIndex::default());

        let result =
            create_page_in_workspace(&mut workspace, "Projekte/Projekt Alpha".to_string()).unwrap();

        assert_eq!(result.page.path, "Projekte/projekt alpha.md");
        assert_eq!(result.page.title, "Projekt alpha");
        assert!(root.join("Projekte").join("projekt alpha.md").is_file());
        assert_eq!(
            fs::read_to_string(root.join("Projekte").join("projekt alpha.md")).unwrap(),
            "# Projekt alpha\n\n"
        );
        assert!(workspace
            .pages
            .get_by_path("Projekte/projekt alpha.md")
            .is_some());
        assert_eq!(
            workspace.contents.get("Projekte/projekt alpha.md"),
            Some("# Projekt alpha\n\n")
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn create_page_rejects_case_insensitive_duplicate() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("Projekte")).unwrap();
        fs::write(root.join("Projekte").join("Projekt Alpha.md"), "").unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Projekte/Projekt Alpha.md".to_string()]),
        );

        let result = create_page_in_workspace(&mut workspace, "projekte/projekt alpha".to_string());

        assert!(result.is_err());
        assert_eq!(workspace.pages.pages().len(), 1);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn delete_page_removes_file_and_indexes() {
        let root = temp_workspace();
        fs::write(root.join("Source.md"), "- Link [[Target]]").unwrap();
        fs::write(root.join("Target.md"), "# Target").unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Source.md".to_string(), "Target.md".to_string()]),
        );
        workspace
            .backlinks
            .index_page("Source.md".to_string(), "- Link [[Target]]");

        let result = delete_page_in_workspace(&mut workspace, "Source.md".to_string()).unwrap();

        assert_eq!(result.deleted_path, "Source.md");
        assert!(!root.join("Source.md").exists());
        assert!(workspace.pages.get_by_path("Source.md").is_none());
        assert!(workspace
            .backlinks
            .backlinks_for_target_key("target")
            .is_empty());
        assert!(workspace.contents.get("Source.md").is_none());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn move_page_moves_file_and_reindexes_source_backlinks() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("team")).unwrap();
        fs::create_dir_all(root.join("archive")).unwrap();
        fs::write(root.join("team").join("Source.md"), "- Link [[Target]]").unwrap();
        fs::write(root.join("Target.md"), "# Target").unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["team/Source.md".to_string(), "Target.md".to_string()]),
        );
        workspace
            .backlinks
            .index_page("team/Source.md".to_string(), "- Link [[Target]]");

        let result = move_page_in_workspace(
            &mut workspace,
            "team/Source.md".to_string(),
            "archive".to_string(),
        )
        .unwrap();

        assert_eq!(result.old_path, "team/Source.md");
        assert_eq!(result.page.path, "archive/Source.md");
        assert!(!root.join("team").join("Source.md").exists());
        assert!(root.join("archive").join("Source.md").is_file());
        assert!(workspace.pages.get_by_path("team/Source.md").is_none());
        assert!(workspace.pages.get_by_path("archive/Source.md").is_some());
        assert!(workspace.contents.get("team/Source.md").is_none());
        assert_eq!(
            workspace.contents.get("archive/Source.md"),
            Some("- Link [[Target]]")
        );
        let backlinks = workspace.backlinks.backlinks_for_target_key("target");
        assert_eq!(backlinks.len(), 1);
        assert_eq!(backlinks[0].source_path, "archive/Source.md");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn move_page_updates_links_to_moved_page() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("archive")).unwrap();
        fs::write(root.join("Alpha.md"), "# Alpha\n- Self [[Alpha]]").unwrap();
        fs::write(
            root.join("Source.md"),
            "- Plain [[Alpha]]\n- Alias [[alpha.md|Alpha Page]]\n- Other [[Beta]]",
        )
        .unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Alpha.md".to_string(), "Source.md".to_string()]),
        );
        workspace
            .backlinks
            .index_page("Alpha.md".to_string(), "# Alpha\n- Self [[Alpha]]");
        workspace.backlinks.index_page(
            "Source.md".to_string(),
            "- Plain [[Alpha]]\n- Alias [[alpha.md|Alpha Page]]\n- Other [[Beta]]",
        );

        let result = move_page_in_workspace(
            &mut workspace,
            "Alpha.md".to_string(),
            "archive".to_string(),
        )
        .unwrap();

        assert_eq!(result.page.path, "archive/Alpha.md");
        assert_eq!(result.updated_link_count, 3);
        assert_eq!(
            fs::read_to_string(root.join("Source.md")).unwrap(),
            "- Plain [[archive/Alpha]]\n- Alias [[archive/Alpha|Alpha Page]]\n- Other [[Beta]]"
        );
        assert_eq!(
            fs::read_to_string(root.join("archive").join("Alpha.md")).unwrap(),
            "# Alpha\n- Self [[archive/Alpha]]"
        );
        assert!(workspace
            .backlinks
            .backlinks_for_target_key("alpha")
            .is_empty());
        assert_eq!(
            workspace
                .backlinks
                .backlinks_for_target_key("archive/alpha")
                .len(),
            3
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn move_page_updates_nested_alias_and_markdown_extension_links() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("people")).unwrap();
        fs::write(root.join("people").join("Nadine.md"), "# Nadine").unwrap();
        fs::write(
            root.join("Source.md"),
            "- Plain [[people/Nadine]]\n- Extension [[People/Nadine.md]]\n- Alias [[people/nadine|Nadine]]\n- Other [[people/Jens]]",
        )
        .unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec![
                "people/Nadine.md".to_string(),
                "Source.md".to_string(),
            ]),
        );
        workspace
            .backlinks
            .index_page("people/Nadine.md".to_string(), "# Nadine");
        workspace.backlinks.index_page(
            "Source.md".to_string(),
            "- Plain [[people/Nadine]]\n- Extension [[People/Nadine.md]]\n- Alias [[people/nadine|Nadine]]\n- Other [[people/Jens]]",
        );

        let result = move_page_in_workspace(
            &mut workspace,
            "people/Nadine.md".to_string(),
            "team".to_string(),
        )
        .unwrap();

        assert_eq!(result.page.path, "team/Nadine.md");
        assert_eq!(result.updated_link_count, 3);
        assert_eq!(
            fs::read_to_string(root.join("Source.md")).unwrap(),
            "- Plain [[team/Nadine]]\n- Extension [[team/Nadine]]\n- Alias [[team/Nadine|Nadine]]\n- Other [[people/Jens]]"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rename_page_updates_links_to_renamed_page() {
        let root = temp_workspace();
        fs::write(root.join("Alpha.md"), "# Alpha").unwrap();
        fs::write(
            root.join("Source.md"),
            "- Link [[Alpha]]\n- Alias [[alpha.md|Old]]\n- Compact #Alpha",
        )
        .unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Alpha.md".to_string(), "Source.md".to_string()]),
        );
        workspace.backlinks.index_page(
            "Source.md".to_string(),
            "- Link [[Alpha]]\n- Alias [[alpha.md|Old]]\n- Compact #Alpha",
        );

        let result =
            rename_page_in_workspace(&mut workspace, "Alpha.md".to_string(), "Beta".to_string())
                .unwrap();

        assert_eq!(result.old_path, "Alpha.md");
        assert_eq!(result.page.path, "Beta.md");
        assert_eq!(result.updated_link_count, 3);
        assert!(!root.join("Alpha.md").exists());
        assert!(root.join("Beta.md").is_file());
        assert_eq!(
            fs::read_to_string(root.join("Source.md")).unwrap(),
            "- Link [[Beta]]\n- Alias [[Beta|Old]]\n- Compact #Beta"
        );
        assert!(workspace
            .backlinks
            .backlinks_for_target_key("alpha")
            .is_empty());
        assert_eq!(
            workspace.backlinks.backlinks_for_target_key("beta").len(),
            3
        );
        assert!(workspace.contents.get("Alpha.md").is_none());
        assert_eq!(workspace.contents.get("Beta.md"), Some("# Alpha"));
        assert_eq!(
            workspace.contents.get("Source.md"),
            Some("- Link [[Beta]]\n- Alias [[Beta|Old]]\n- Compact #Beta")
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rename_page_allows_changing_only_the_file_name_case() {
        let root = temp_workspace();
        fs::write(root.join("mathias.md"), "# Mathias").unwrap();
        fs::write(root.join("Source.md"), "- Link [[mathias]]").unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["mathias.md".to_string(), "Source.md".to_string()]),
        );
        workspace
            .backlinks
            .index_page("Source.md".to_string(), "- Link [[mathias]]");

        let result = rename_page_in_workspace(
            &mut workspace,
            "mathias.md".to_string(),
            "Mathias".to_string(),
        )
        .unwrap();

        assert_eq!(result.old_path, "mathias.md");
        assert_eq!(result.page.path, "Mathias.md");
        assert_eq!(result.updated_link_count, 1);
        assert!(root.join("Mathias.md").is_file());
        let file_names: Vec<_> = fs::read_dir(&root)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert!(file_names.contains(&"Mathias.md".into()));
        assert!(!file_names.contains(&"mathias.md".into()));
        assert_eq!(
            fs::read_to_string(root.join("Source.md")).unwrap(),
            "- Link [[Mathias]]"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rename_folder_updates_links_to_pages_inside_folder() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("team").join("sub")).unwrap();
        fs::write(root.join("team").join("Alpha.md"), "# Alpha").unwrap();
        fs::write(root.join("team").join("sub").join("Beta.md"), "# Beta").unwrap();
        fs::write(
            root.join("Source.md"),
            "- Alpha [[team/Alpha]]\n- Beta [[Team/Sub/Beta.md|Beta]]\n- Other [[Gamma]]",
        )
        .unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec![
                "team/Alpha.md".to_string(),
                "team/sub/Beta.md".to_string(),
                "Source.md".to_string(),
            ]),
        );
        workspace.backlinks.index_page(
            "Source.md".to_string(),
            "- Alpha [[team/Alpha]]\n- Beta [[Team/Sub/Beta.md|Beta]]\n- Other [[Gamma]]",
        );

        let result =
            rename_folder_in_workspace(&mut workspace, "team".to_string(), "people".to_string())
                .unwrap();

        assert_eq!(result.old_path, "team");
        assert_eq!(result.new_path, "people");
        assert_eq!(result.renamed_page_count, 2);
        assert_eq!(result.updated_link_count, 2);
        assert!(!root.join("team").exists());
        assert!(root.join("people").join("Alpha.md").is_file());
        assert!(root.join("people").join("sub").join("Beta.md").is_file());
        assert_eq!(
            fs::read_to_string(root.join("Source.md")).unwrap(),
            "- Alpha [[people/Alpha]]\n- Beta [[people/sub/Beta|Beta]]\n- Other [[Gamma]]"
        );
        assert!(workspace
            .backlinks
            .backlinks_for_target_key("team/alpha")
            .is_empty());
        assert_eq!(
            workspace
                .backlinks
                .backlinks_for_target_key("people/alpha")
                .len(),
            1
        );
        assert_eq!(
            workspace
                .backlinks
                .backlinks_for_target_key("people/sub/beta")
                .len(),
            1
        );
        assert!(workspace.contents.get("team/Alpha.md").is_none());
        assert_eq!(workspace.contents.get("people/Alpha.md"), Some("# Alpha"));
        assert_eq!(
            workspace.contents.get("Source.md"),
            Some("- Alpha [[people/Alpha]]\n- Beta [[people/sub/Beta|Beta]]\n- Other [[Gamma]]")
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rename_folder_allows_changing_only_the_folder_name_case() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("team")).unwrap();
        fs::write(root.join("team").join("Alpha.md"), "# Alpha").unwrap();
        fs::write(root.join("Source.md"), "- Link [[team/Alpha]]").unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["team/Alpha.md".to_string(), "Source.md".to_string()]),
        );
        workspace
            .backlinks
            .index_page("Source.md".to_string(), "- Link [[team/Alpha]]");

        let result =
            rename_folder_in_workspace(&mut workspace, "team".to_string(), "Team".to_string())
                .unwrap();

        assert_eq!(result.old_path, "team");
        assert_eq!(result.new_path, "Team");
        assert_eq!(result.renamed_page_count, 1);
        assert_eq!(result.updated_link_count, 1);
        let folder_names: Vec<_> = fs::read_dir(&root)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert!(folder_names.contains(&"Team".into()));
        assert!(!folder_names.contains(&"team".into()));
        assert!(root.join("Team").join("Alpha.md").is_file());
        assert_eq!(
            fs::read_to_string(root.join("Source.md")).unwrap(),
            "- Link [[Team/Alpha]]"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn search_pages_returns_matching_lines_with_context() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("projects")).unwrap();
        fs::write(
            root.join("projects").join("Alpha.md"),
            "# Alpha\nDiscuss Forecast\nAnother line",
        )
        .unwrap();
        fs::write(root.join("Inbox.md"), "No match").unwrap();
        let workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec![
                "projects/Alpha.md".to_string(),
                "Inbox.md".to_string(),
            ]),
        );

        let results = search_pages_in_workspace(&workspace, "forecast").unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].path, "projects/Alpha.md");
        assert_eq!(results[0].line, 2);
        assert_eq!(results[0].excerpt, "Discuss Forecast");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn search_pages_orders_results_by_relevance() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("01-filename")).unwrap();
        fs::create_dir_all(root.join("02-heading")).unwrap();
        fs::create_dir_all(root.join("03-text")).unwrap();
        fs::create_dir_all(root.join("04-link")).unwrap();
        fs::create_dir_all(root.join("05-compact-link")).unwrap();
        fs::write(
            root.join("01-filename").join("prognose.md"),
            "# Alpha\nNo hit",
        )
        .unwrap();
        fs::write(
            root.join("02-heading").join("Alpha.md"),
            "# Alpha\n## Prognose Review\nNo hit",
        )
        .unwrap();
        fs::write(
            root.join("03-text").join("Alpha.md"),
            "# Alpha\nDiscuss prognose in plain text",
        )
        .unwrap();
        fs::write(
            root.join("04-link").join("Alpha.md"),
            "# Alpha\nSee [[targets/Forecast|Prognose Alias]]",
        )
        .unwrap();
        fs::write(
            root.join("05-compact-link").join("Alpha.md"),
            "# Alpha\nSee #targets/prognose",
        )
        .unwrap();
        let workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec![
                "01-filename/prognose.md".to_string(),
                "02-heading/Alpha.md".to_string(),
                "03-text/Alpha.md".to_string(),
                "04-link/Alpha.md".to_string(),
                "05-compact-link/Alpha.md".to_string(),
            ]),
        );

        let results = search_pages_in_workspace(&workspace, "prognose").unwrap();

        assert_eq!(results.len(), 5);
        assert_eq!(results[0].path, "01-filename/prognose.md");
        assert_eq!(results[0].line, 1);
        assert_eq!(results[1].path, "02-heading/Alpha.md");
        assert_eq!(results[1].line, 2);
        assert_eq!(results[2].path, "03-text/Alpha.md");
        assert_eq!(results[2].line, 2);
        assert_eq!(results[3].path, "04-link/Alpha.md");
        assert_eq!(results[3].line, 2);
        assert_eq!(results[4].path, "05-compact-link/Alpha.md");
        assert_eq!(results[4].line, 2);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn search_pages_does_not_treat_folder_names_as_filename_matches() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("journal")).unwrap();
        fs::write(
            root.join("journal").join("2026-09-03.md"),
            "# Daily note\nNo hit",
        )
        .unwrap();
        let workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["journal/2026-09-03.md".to_string()]),
        );

        let results = search_pages_in_workspace(&workspace, "na").unwrap();

        assert!(results.is_empty());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn list_tasks_returns_task_blocks_with_source_lines() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("projects")).unwrap();
        fs::write(
            root.join("projects").join("Alpha.md"),
            "- TODO Prepare kickoff\n  - DONE Draft agenda\n- Discuss TODO wording",
        )
        .unwrap();
        let workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["projects/Alpha.md".to_string()]),
        );

        let tasks = list_tasks_in_workspace(&workspace).unwrap();

        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].status, "TODO");
        assert_eq!(tasks[0].path, "projects/Alpha.md");
        assert_eq!(tasks[0].line, 1);
        assert_eq!(tasks[1].status, "DONE");
        assert_eq!(tasks[1].line, 2);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn list_tasks_returns_optional_priority() {
        let root = temp_workspace();
        fs::write(
            root.join("Inbox.md"),
            "- TODO [#A] Prepare kickoff\n- WAITING No priority\n- INPROGRESS[#B] Attached priority",
        )
        .unwrap();
        let workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Inbox.md".to_string()]),
        );

        let tasks = list_tasks_in_workspace(&workspace).unwrap();

        assert_eq!(tasks[0].priority.as_deref(), Some("A"));
        assert_eq!(tasks[1].priority, None);
        assert_eq!(tasks[2].priority.as_deref(), Some("B"));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn list_tasks_returns_linked_pages() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("team")).unwrap();
        fs::write(
            root.join("Inbox.md"),
            "- TODO Call [[team/Nadine|Nadine]] for [[Missing Project]]\n  - ask about [[Team/Nadine.md]]",
        )
        .unwrap();
        fs::write(root.join("team").join("Nadine.md"), "# Nadine").unwrap();
        let workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Inbox.md".to_string(), "team/Nadine.md".to_string()]),
        );

        let tasks = list_tasks_in_workspace(&workspace).unwrap();

        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].linked_pages.len(), 3);
        assert_eq!(tasks[0].linked_pages[0].target, "team/Nadine");
        assert_eq!(tasks[0].linked_pages[0].label, "Nadine");
        assert_eq!(
            tasks[0].linked_pages[0].resolved_path.as_deref(),
            Some("team/Nadine.md")
        );
        assert!(tasks[0].linked_pages[0].exists);
        assert_eq!(tasks[0].linked_pages[1].target, "Missing Project");
        assert_eq!(tasks[0].linked_pages[1].label, "Missing Project");
        assert!(tasks[0].linked_pages[1].resolved_path.is_none());
        assert!(!tasks[0].linked_pages[1].exists);
        assert_eq!(
            tasks[0].linked_pages[2].resolved_path.as_deref(),
            Some("team/Nadine.md")
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn list_tasks_inherits_parent_block_links() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("projects")).unwrap();
        fs::write(
            root.join("Inbox.md"),
            "- Project [[projects/Alpha]]\n  - TODO Prepare kickoff",
        )
        .unwrap();
        fs::write(root.join("projects").join("Alpha.md"), "# Alpha").unwrap();
        let workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec![
                "Inbox.md".to_string(),
                "projects/Alpha.md".to_string(),
            ]),
        );

        let tasks = list_tasks_in_workspace(&workspace).unwrap();

        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].line, 2);
        assert_eq!(tasks[0].linked_pages.len(), 1);
        assert_eq!(tasks[0].linked_pages[0].target, "projects/Alpha");
        assert_eq!(
            tasks[0].linked_pages[0].resolved_path.as_deref(),
            Some("projects/Alpha.md")
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn list_tasks_returns_heading_and_parent_context() {
        let root = temp_workspace();
        fs::write(
            root.join("Inbox.md"),
            "# Project Alpha\n## Risks\n- Area planning\n  - Waiting on supplier\n    - TODO [#A] Confirm date",
        )
        .unwrap();
        let workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Inbox.md".to_string()]),
        );

        let tasks = list_tasks_in_workspace(&workspace).unwrap();

        assert_eq!(tasks.len(), 1);
        assert_eq!(
            tasks[0].source_headings,
            vec!["Project Alpha".to_string(), "Risks".to_string()]
        );
        assert_eq!(
            tasks[0].parent_blocks,
            vec![
                "Area planning".to_string(),
                "Waiting on supplier".to_string()
            ]
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn update_task_status_replaces_only_the_task_keyword() {
        let root = temp_workspace();
        fs::write(
            root.join("Inbox.md"),
            "- TODO [#A] Prepare kickoff\r\n  - Child remains untouched\r\n\r\n",
        )
        .unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Inbox.md".to_string()]),
        );

        let result =
            update_task_status_in_workspace(&mut workspace, "Inbox.md", 1, "TODO", "DONE").unwrap();

        assert_eq!(result.task.status, "DONE");
        assert_eq!(result.task.line, 1);
        assert_eq!(
            fs::read_to_string(root.join("Inbox.md")).unwrap(),
            "- DONE [#A] Prepare kickoff\r\n  - Child remains untouched\r\n\r\n"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn task_status_update_preserves_external_content_changes() {
        let root = temp_workspace();
        let page_path = root.join("Inbox.md");
        fs::write(&page_path, "# Inbox\n\n- TODO Plan\n- Original detail").unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Inbox.md".to_string()]),
        );
        fs::write(
            &page_path,
            "# Inbox\n\n- TODO Plan\n- Externally changed detail",
        )
        .unwrap();

        update_task_status_in_workspace(&mut workspace, "Inbox.md", 3, "TODO", "DONE").unwrap();

        assert_eq!(
            fs::read_to_string(&page_path).unwrap(),
            "# Inbox\n\n- DONE Plan\n- Externally changed detail"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn update_task_status_rejects_stale_expected_status() {
        let root = temp_workspace();
        fs::write(root.join("Inbox.md"), "- INPROGRESS Prepare kickoff").unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Inbox.md".to_string()]),
        );

        let result = update_task_status_in_workspace(&mut workspace, "Inbox.md", 1, "TODO", "DONE");

        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(root.join("Inbox.md")).unwrap(),
            "- INPROGRESS Prepare kickoff"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn update_task_status_rejects_unknown_target_status() {
        let root = temp_workspace();
        fs::write(root.join("Inbox.md"), "- TODO Prepare kickoff").unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Inbox.md".to_string()]),
        );

        let result =
            update_task_status_in_workspace(&mut workspace, "Inbox.md", 1, "TODO", "BLOCKED");

        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(root.join("Inbox.md")).unwrap(),
            "- TODO Prepare kickoff"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn update_task_status_supports_plain_task_blocks() {
        let root = temp_workspace();
        fs::write(root.join("Inbox.md"), "TODO Prepare kickoff\n").unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Inbox.md".to_string()]),
        );

        let result =
            update_task_status_in_workspace(&mut workspace, "Inbox.md", 1, "TODO", "WAITING")
                .unwrap();

        assert_eq!(result.task.status, "WAITING");
        assert_eq!(
            fs::read_to_string(root.join("Inbox.md")).unwrap(),
            "WAITING Prepare kickoff\n"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn update_task_status_tolerates_checkbox_spacing() {
        let root = temp_workspace();
        fs::write(root.join("Inbox.md"), "- [ ]   TODO Prepare kickoff\n").unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Inbox.md".to_string()]),
        );

        let result =
            update_task_status_in_workspace(&mut workspace, "Inbox.md", 1, "TODO", "INPROGRESS")
                .unwrap();

        assert_eq!(result.task.status, "INPROGRESS");
        assert_eq!(
            fs::read_to_string(root.join("Inbox.md")).unwrap(),
            "- [ ]   INPROGRESS Prepare kickoff\n"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn update_task_status_preserves_attached_priority_cookie() {
        let root = temp_workspace();
        fs::write(root.join("Inbox.md"), "- TODO[#A] Prepare kickoff\n").unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Inbox.md".to_string()]),
        );

        let result =
            update_task_status_in_workspace(&mut workspace, "Inbox.md", 1, "TODO", "DONE").unwrap();

        assert_eq!(result.task.status, "DONE");
        assert_eq!(result.task.priority.as_deref(), Some("A"));
        assert_eq!(
            fs::read_to_string(root.join("Inbox.md")).unwrap(),
            "- DONE[#A] Prepare kickoff\n"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn update_task_priority_sets_replaces_and_removes_cookie() {
        let root = temp_workspace();
        fs::write(
            root.join("Inbox.md"),
            "- TODO Prepare kickoff\n- WAITING[#A] Blocked\n- INPROGRESS [#A] Started\n- DONE [#B] Closed\n",
        )
        .unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Inbox.md".to_string()]),
        );

        let added =
            update_task_priority_in_workspace(&mut workspace, "Inbox.md", 1, Some("C".to_string()))
                .unwrap();
        let replaced =
            update_task_priority_in_workspace(&mut workspace, "Inbox.md", 2, Some("B".to_string()))
                .unwrap();
        let replaced_spaced =
            update_task_priority_in_workspace(&mut workspace, "Inbox.md", 3, Some("C".to_string()))
                .unwrap();
        let removed =
            update_task_priority_in_workspace(&mut workspace, "Inbox.md", 4, None).unwrap();

        assert_eq!(added.task.priority.as_deref(), Some("C"));
        assert_eq!(replaced.task.priority.as_deref(), Some("B"));
        assert_eq!(replaced_spaced.task.priority.as_deref(), Some("C"));
        assert_eq!(removed.task.priority, None);
        assert_eq!(
            fs::read_to_string(root.join("Inbox.md")).unwrap(),
            "- TODO [#C] Prepare kickoff\n- WAITING[#B] Blocked\n- INPROGRESS [#C] Started\n- DONE Closed\n"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn toggle_checkbox_updates_markdown_marker() {
        let root = temp_workspace();
        fs::write(root.join("Inbox.md"), "- [ ] Open item\n- [x] Done item\n").unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Inbox.md".to_string()]),
        );

        let first = toggle_checkbox_in_workspace(&mut workspace, "Inbox.md", 1).unwrap();
        let second = toggle_checkbox_in_workspace(&mut workspace, "Inbox.md", 2).unwrap();

        assert!(first.checked);
        assert!(!second.checked);
        assert_eq!(
            fs::read_to_string(root.join("Inbox.md")).unwrap(),
            "- [x] Open item\n- [ ] Done item\n"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn toggle_checkbox_rejects_non_checkbox_lines() {
        let root = temp_workspace();
        fs::write(root.join("Inbox.md"), "- TODO Plain task\n").unwrap();
        let mut workspace = test_workspace_state(
            root.clone(),
            PageIndex::from_paths(vec!["Inbox.md".to_string()]),
        );

        let result = toggle_checkbox_in_workspace(&mut workspace, "Inbox.md", 1);

        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(root.join("Inbox.md")).unwrap(),
            "- TODO Plain task\n"
        );

        fs::remove_dir_all(root).unwrap();
    }

    fn temp_workspace() -> PathBuf {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "manicule-command-test-{}-{counter}-{now}",
            std::process::id()
        ));
        if root.exists() {
            fs::remove_dir_all(&root).unwrap();
        }
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn test_workspace_state(root: PathBuf, pages: PageIndex) -> WorkspaceState {
        WorkspaceState {
            root,
            config: WorkspaceConfig::default(),
            folders: Vec::new(),
            pages,
            backlinks: BacklinkIndex::default(),
            contents: ContentSnapshot::default(),
        }
    }
}
