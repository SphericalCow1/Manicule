use std::collections::HashMap;

use tauri::State;

use crate::app_state::AppState;
use crate::workspace_config::{
    normalize_backlink_view_config, normalize_expanded_folders, normalize_folder_colors,
    normalize_folder_page_sort, normalize_manual_page_order, normalize_navigation_layout_config,
    normalize_optional_page_path, normalize_page_path_list, normalize_page_sort,
    normalize_task_overview_config, normalize_theme_mode, save_workspace_config,
    BacklinkViewConfig, NavigationLayoutConfig, TaskOverviewConfig, DEFAULT_PAGE_SORT,
};

#[tauri::command]
pub fn save_expanded_folders(
    expanded_folders: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.with_workspace_mut(|workspace| {
        workspace.config.expanded_folders = Some(normalize_expanded_folders(expanded_folders));
        save_workspace_config(&workspace.root, &workspace.config)
    })?
}

#[tauri::command]
pub fn save_task_overview_config(
    task_overview: TaskOverviewConfig,
    state: State<'_, AppState>,
) -> Result<TaskOverviewConfig, String> {
    state.with_workspace_mut(|workspace| {
        let normalized = normalize_task_overview_config(task_overview);
        workspace.config.task_overview = normalized.clone();
        save_workspace_config(&workspace.root, &workspace.config)?;
        Ok(normalized)
    })?
}

#[tauri::command]
pub fn save_backlink_view_config(
    backlink_view: BacklinkViewConfig,
    state: State<'_, AppState>,
) -> Result<BacklinkViewConfig, String> {
    state.with_workspace_mut(|workspace| {
        let backlink_view = normalize_backlink_view_config(backlink_view);
        workspace.config.backlink_view = backlink_view.clone();
        save_workspace_config(&workspace.root, &workspace.config)?;
        Ok(backlink_view)
    })?
}

#[tauri::command]
pub fn save_theme_config(theme_mode: String, state: State<'_, AppState>) -> Result<String, String> {
    state.with_workspace_mut(|workspace| {
        let theme_mode = normalize_theme_mode(theme_mode);
        workspace.config.theme_mode = theme_mode.clone();
        save_workspace_config(&workspace.root, &workspace.config)?;
        Ok(theme_mode)
    })?
}

#[tauri::command]
pub fn save_page_sort_config(
    default_page_sort: String,
    folder_page_sort: HashMap<String, String>,
    state: State<'_, AppState>,
) -> Result<(String, HashMap<String, String>), String> {
    state.with_workspace_mut(|workspace| {
        let default_page_sort = normalize_page_sort(default_page_sort, DEFAULT_PAGE_SORT);
        let folder_page_sort = normalize_folder_page_sort(folder_page_sort, &default_page_sort);
        workspace.config.default_page_sort = default_page_sort.clone();
        workspace.config.folder_page_sort = folder_page_sort.clone();
        save_workspace_config(&workspace.root, &workspace.config)?;
        Ok((default_page_sort, folder_page_sort))
    })?
}

#[tauri::command]
pub fn save_manual_page_order_config(
    manual_page_order: HashMap<String, Vec<String>>,
    state: State<'_, AppState>,
) -> Result<HashMap<String, Vec<String>>, String> {
    state.with_workspace_mut(|workspace| {
        let manual_page_order = normalize_manual_page_order(manual_page_order);
        workspace.config.manual_page_order = manual_page_order.clone();
        save_workspace_config(&workspace.root, &workspace.config)?;
        Ok(manual_page_order)
    })?
}

#[tauri::command]
pub fn save_folder_colors_config(
    folder_colors: HashMap<String, String>,
    state: State<'_, AppState>,
) -> Result<HashMap<String, String>, String> {
    state.with_workspace_mut(|workspace| {
        let folder_colors = normalize_folder_colors(folder_colors);
        workspace.config.folder_colors = folder_colors.clone();
        save_workspace_config(&workspace.root, &workspace.config)?;
        Ok(folder_colors)
    })?
}

#[tauri::command]
pub fn save_workspace_session_config(
    last_editor_path: Option<String>,
    last_right_pane_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.with_workspace_mut(|workspace| {
        workspace.config.last_editor_path = normalize_optional_page_path(last_editor_path);
        workspace.config.last_right_pane_path = normalize_optional_page_path(last_right_pane_path);
        save_workspace_config(&workspace.root, &workspace.config)
    })?
}

#[tauri::command]
pub fn save_navigation_config(
    page_favorites: Vec<String>,
    recent_pages: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(Vec<String>, Vec<String>), String> {
    state.with_workspace_mut(|workspace| {
        let page_favorites = normalize_page_path_list(page_favorites, usize::MAX);
        let recent_pages = normalize_page_path_list(recent_pages, 10);
        workspace.config.page_favorites = page_favorites.clone();
        workspace.config.recent_pages = recent_pages.clone();
        save_workspace_config(&workspace.root, &workspace.config)?;
        Ok((page_favorites, recent_pages))
    })?
}

#[tauri::command]
pub fn save_navigation_layout_config(
    navigation_layout: NavigationLayoutConfig,
    state: State<'_, AppState>,
) -> Result<NavigationLayoutConfig, String> {
    state.with_workspace_mut(|workspace| {
        let navigation_layout = normalize_navigation_layout_config(navigation_layout);
        workspace.config.navigation_layout = navigation_layout.clone();
        save_workspace_config(&workspace.root, &workspace.config)?;
        Ok(navigation_layout)
    })?
}
