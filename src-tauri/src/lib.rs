pub mod app_error;
pub mod app_state;
pub mod commands;
pub mod config_commands;
pub mod content_snapshot;
pub mod dto;
pub mod index;
pub mod navigation_order;
pub mod page_io;
pub mod page_ops;
pub mod page_view;
pub mod parser;
pub mod query;
pub mod user_config;
pub mod watcher;
pub mod workspace;
pub mod workspace_config;
pub mod workspace_index;

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItemBuilder, MenuItemKind, PredefinedMenuItem, Submenu, SubmenuBuilder},
    AppHandle, Emitter, Runtime,
};

const MENU_OPEN_WORKSPACE: &str = "file.open_workspace";
const MENU_NEW_FILE: &str = "file.new_file";
const MENU_CLOSE_WORKSPACE: &str = "file.close_workspace";
const MENU_SAVE: &str = "file.save";
const MENU_UNDO: &str = "edit.undo";
const MENU_REDO: &str = "edit.redo";
const MENU_TOGGLE_DARK_MODE: &str = "view.toggle_dark_mode";
const MENU_TOGGLE_TASK_OVERVIEW: &str = "view.toggle_task_overview";
const MENU_TOGGLE_EDITOR_MODE: &str = "view.toggle_editor_mode";
const MENU_COLLAPSE_BLOCKS_BELOW_LEVEL_1: &str = "view.collapse_blocks_below_level_1";
const MENU_COLLAPSE_BLOCKS_BELOW_LEVEL_2: &str = "view.collapse_blocks_below_level_2";
const MENU_COLLAPSE_BLOCKS_BELOW_LEVEL_3: &str = "view.collapse_blocks_below_level_3";
const MENU_COLLAPSE_BLOCKS_BELOW_LEVEL_4: &str = "view.collapse_blocks_below_level_4";
const MENU_EXPAND_ALL_BLOCKS: &str = "view.expand_all_blocks";
const MENU_ZOOM_IN: &str = "view.zoom_in";
const MENU_ZOOM_OUT: &str = "view.zoom_out";
const MENU_RESET_ZOOM: &str = "view.reset_zoom";
const MENU_RESET_LAYOUT: &str = "view.reset_layout";
const MENU_KEYBOARD_SHORTCUTS: &str = "help.keyboard_shortcuts";
const MENU_ABOUT: &str = "help.about";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum DiagnosticSeverity {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Diagnostic {
    pub severity: DiagnosticSeverity,
    pub code: String,
    pub message: String,
    pub path: Option<String>,
}

impl Diagnostic {
    pub fn warning(
        code: impl Into<String>,
        message: impl Into<String>,
        path: Option<String>,
    ) -> Self {
        Self {
            severity: DiagnosticSeverity::Warning,
            code: code.into(),
            message: message.into(),
            path,
        }
    }
}

#[tauri::command]
fn ping() -> &'static str {
    "semtags-ready"
}

#[tauri::command]
fn update_edit_menu_labels(
    app: AppHandle,
    undo_label: Option<String>,
    redo_label: Option<String>,
    undo_enabled: bool,
    redo_enabled: bool,
) -> Result<(), String> {
    let menu = app
        .menu()
        .ok_or_else(|| "Application menu is not available".to_string())?;
    let undo_text = menu_action_text("Undo", undo_label.as_deref());
    let redo_text = menu_action_text("Redo", redo_label.as_deref());

    set_menu_item_text(&menu, MENU_UNDO, &undo_text)?;
    set_menu_item_text(&menu, MENU_REDO, &redo_text)?;
    set_menu_item_enabled(&menu, MENU_UNDO, undo_enabled)?;
    set_menu_item_enabled(&menu, MENU_REDO, redo_enabled)?;
    Ok(())
}

#[tauri::command]
fn update_theme_menu_label(app: AppHandle, is_dark: bool) -> Result<(), String> {
    let menu = app
        .menu()
        .ok_or_else(|| "Application menu is not available".to_string())?;

    set_menu_item_text(&menu, MENU_TOGGLE_DARK_MODE, theme_menu_text(is_dark))
}

#[tauri::command]
fn update_task_overview_menu_label(app: AppHandle, is_task_overview: bool) -> Result<(), String> {
    let menu = app
        .menu()
        .ok_or_else(|| "Application menu is not available".to_string())?;

    set_menu_item_text(
        &menu,
        MENU_TOGGLE_TASK_OVERVIEW,
        task_overview_menu_text(is_task_overview),
    )
}

#[tauri::command]
fn update_editor_mode_menu_label(app: AppHandle, is_live_preview: bool) -> Result<(), String> {
    let menu = app
        .menu()
        .ok_or_else(|| "Application menu is not available".to_string())?;

    set_menu_item_text(
        &menu,
        MENU_TOGGLE_EDITOR_MODE,
        editor_mode_menu_text(is_live_preview),
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .menu(build_app_menu)
        .on_menu_event(|app, event| {
            let event_name = match event.id().as_ref() {
                MENU_OPEN_WORKSPACE => Some("menu-open-workspace"),
                MENU_NEW_FILE => Some("menu-new-file"),
                MENU_CLOSE_WORKSPACE => Some("menu-close-workspace"),
                MENU_SAVE => Some("menu-save"),
                MENU_UNDO => Some("menu-undo"),
                MENU_REDO => Some("menu-redo"),
                MENU_TOGGLE_DARK_MODE => Some("menu-toggle-dark-mode"),
                MENU_TOGGLE_TASK_OVERVIEW => Some("menu-toggle-task-overview"),
                MENU_TOGGLE_EDITOR_MODE => Some("menu-toggle-editor-mode"),
                MENU_COLLAPSE_BLOCKS_BELOW_LEVEL_1 => Some("menu-collapse-blocks-below-level-1"),
                MENU_COLLAPSE_BLOCKS_BELOW_LEVEL_2 => Some("menu-collapse-blocks-below-level-2"),
                MENU_COLLAPSE_BLOCKS_BELOW_LEVEL_3 => Some("menu-collapse-blocks-below-level-3"),
                MENU_COLLAPSE_BLOCKS_BELOW_LEVEL_4 => Some("menu-collapse-blocks-below-level-4"),
                MENU_EXPAND_ALL_BLOCKS => Some("menu-expand-all-blocks"),
                MENU_ZOOM_IN => Some("menu-zoom-in"),
                MENU_ZOOM_OUT => Some("menu-zoom-out"),
                MENU_RESET_ZOOM => Some("menu-reset-zoom"),
                MENU_RESET_LAYOUT => Some("menu-reset-layout"),
                MENU_KEYBOARD_SHORTCUTS => Some("menu-keyboard-shortcuts"),
                MENU_ABOUT => Some("menu-about"),
                _ => None,
            };

            if let Some(event_name) = event_name {
                let _ = app.emit(event_name, ());
            }
        })
        .manage(app_state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            ping,
            update_edit_menu_labels,
            update_theme_menu_label,
            update_task_overview_menu_label,
            update_editor_mode_menu_label,
            commands::get_last_workspace,
            commands::open_workspace,
            commands::close_workspace,
            config_commands::save_expanded_folders,
            config_commands::save_page_sort_config,
            config_commands::save_manual_page_order_config,
            config_commands::save_folder_colors_config,
            config_commands::save_workspace_session_config,
            config_commands::save_navigation_config,
            config_commands::save_navigation_layout_config,
            config_commands::save_task_overview_config,
            config_commands::save_backlink_view_config,
            config_commands::save_theme_config,
            commands::list_pages,
            commands::create_page,
            commands::create_folder,
            commands::delete_page,
            commands::delete_folder,
            commands::move_page,
            commands::move_folder,
            commands::rename_page,
            commands::rename_folder,
            commands::open_page,
            commands::save_page,
            commands::get_page_view,
            commands::search_pages,
            commands::list_tasks,
            commands::update_task_status,
            commands::update_task_priority,
            commands::toggle_checkbox
        ])
        .run(tauri::generate_context!())
        .expect("error while running Semtags");
}

fn build_app_menu(handle: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::default(handle)?;
    ensure_file_menu(handle, &menu)?;
    ensure_edit_menu(handle, &menu)?;
    ensure_view_menu(handle, &menu)?;
    ensure_help_menu(handle, &menu)?;
    Ok(menu)
}

fn ensure_file_menu<R: Runtime>(handle: &AppHandle<R>, menu: &Menu<R>) -> tauri::Result<()> {
    let new_file = MenuItemBuilder::with_id(MENU_NEW_FILE, "New File...")
        .accelerator("CmdOrCtrl+N")
        .build(handle)?;
    let open_workspace = MenuItemBuilder::with_id(MENU_OPEN_WORKSPACE, "Open Workspace Folder...")
        .accelerator("CmdOrCtrl+O")
        .build(handle)?;
    let close_workspace = MenuItemBuilder::with_id(MENU_CLOSE_WORKSPACE, "Close Workspace Folder")
        .accelerator("CmdOrCtrl+Shift+W")
        .build(handle)?;
    let save = MenuItemBuilder::with_id(MENU_SAVE, "Save")
        .accelerator("CmdOrCtrl+S")
        .build(handle)?;
    let separator = PredefinedMenuItem::separator(handle)?;
    let separator_after_workspace = PredefinedMenuItem::separator(handle)?;

    if let Some(file_menu) = find_submenu(menu, "File")? {
        file_menu.insert_items(
            &[
                &new_file,
                &open_workspace,
                &close_workspace,
                &separator_after_workspace,
                &save,
                &separator,
            ],
            0,
        )?;
    } else {
        let file_menu = SubmenuBuilder::new(handle, "File")
            .item(&new_file)
            .item(&open_workspace)
            .item(&close_workspace)
            .separator()
            .item(&save)
            .separator()
            .build()?;
        menu.prepend(&file_menu)?;
    }

    Ok(())
}

fn ensure_edit_menu<R: Runtime>(handle: &AppHandle<R>, menu: &Menu<R>) -> tauri::Result<()> {
    let undo = MenuItemBuilder::with_id(MENU_UNDO, "Undo")
        .accelerator("CmdOrCtrl+Z")
        .build(handle)?;
    let redo = MenuItemBuilder::with_id(MENU_REDO, "Redo")
        .accelerator("CmdOrCtrl+Shift+Z")
        .build(handle)?;

    if let Some(edit_menu) = find_submenu(menu, "Edit")? {
        while !edit_menu.items()?.is_empty() {
            let _ = edit_menu.remove_at(0)?;
        }
        let separator = PredefinedMenuItem::separator(handle)?;
        let cut = PredefinedMenuItem::cut(handle, None)?;
        let copy = PredefinedMenuItem::copy(handle, None)?;
        let paste = PredefinedMenuItem::paste(handle, None)?;
        let select_all = PredefinedMenuItem::select_all(handle, None)?;
        edit_menu.insert_items(
            &[&undo, &redo, &separator, &cut, &copy, &paste, &select_all],
            0,
        )?;
        return Ok(());
    }

    let edit_menu = SubmenuBuilder::new(handle, "Edit")
        .item(&undo)
        .item(&redo)
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    menu.append(&edit_menu)?;
    Ok(())
}

fn ensure_view_menu<R: Runtime>(handle: &AppHandle<R>, menu: &Menu<R>) -> tauri::Result<()> {
    let toggle_dark_mode =
        MenuItemBuilder::with_id(MENU_TOGGLE_DARK_MODE, theme_menu_text(false)).build(handle)?;
    let toggle_task_overview =
        MenuItemBuilder::with_id(MENU_TOGGLE_TASK_OVERVIEW, task_overview_menu_text(false))
            .accelerator("CmdOrCtrl+Shift+T")
            .build(handle)?;
    let toggle_editor_mode =
        MenuItemBuilder::with_id(MENU_TOGGLE_EDITOR_MODE, editor_mode_menu_text(true))
            .accelerator("CmdOrCtrl+Shift+L")
            .build(handle)?;
    let collapse_below_level_1 =
        MenuItemBuilder::with_id(MENU_COLLAPSE_BLOCKS_BELOW_LEVEL_1, "Level 1")
            .accelerator("CmdOrCtrl+1")
            .build(handle)?;
    let collapse_below_level_2 =
        MenuItemBuilder::with_id(MENU_COLLAPSE_BLOCKS_BELOW_LEVEL_2, "Level 2")
            .accelerator("CmdOrCtrl+2")
            .build(handle)?;
    let collapse_below_level_3 =
        MenuItemBuilder::with_id(MENU_COLLAPSE_BLOCKS_BELOW_LEVEL_3, "Level 3")
            .accelerator("CmdOrCtrl+3")
            .build(handle)?;
    let collapse_below_level_4 =
        MenuItemBuilder::with_id(MENU_COLLAPSE_BLOCKS_BELOW_LEVEL_4, "Level 4")
            .accelerator("CmdOrCtrl+4")
            .build(handle)?;
    let collapse_blocks_submenu = SubmenuBuilder::new(handle, "Collapse All Blocks Below Level")
        .item(&collapse_below_level_1)
        .item(&collapse_below_level_2)
        .item(&collapse_below_level_3)
        .item(&collapse_below_level_4)
        .build()?;
    let expand_all_blocks = MenuItemBuilder::with_id(MENU_EXPAND_ALL_BLOCKS, "Expand All Blocks")
        .accelerator("CmdOrCtrl+Shift+E")
        .build(handle)?;
    let zoom_in = MenuItemBuilder::with_id(MENU_ZOOM_IN, "Zoom In")
        .accelerator("CmdOrCtrl+=")
        .build(handle)?;
    let zoom_out = MenuItemBuilder::with_id(MENU_ZOOM_OUT, "Zoom Out")
        .accelerator("CmdOrCtrl+-")
        .build(handle)?;
    let reset_zoom = MenuItemBuilder::with_id(MENU_RESET_ZOOM, "Reset Zoom")
        .accelerator("CmdOrCtrl+0")
        .build(handle)?;
    let reset_layout =
        MenuItemBuilder::with_id(MENU_RESET_LAYOUT, "Reset Column Layout").build(handle)?;
    let separator_after_theme = PredefinedMenuItem::separator(handle)?;
    let separator_after_mode = PredefinedMenuItem::separator(handle)?;
    let separator_after_zoom = PredefinedMenuItem::separator(handle)?;
    let separator_after_layout = PredefinedMenuItem::separator(handle)?;

    if let Some(view_menu) = find_submenu(menu, "View")? {
        view_menu.insert_items(
            &[
                &toggle_dark_mode,
                &separator_after_theme,
                &toggle_task_overview,
                &toggle_editor_mode,
                &separator_after_mode,
                &collapse_blocks_submenu,
                &expand_all_blocks,
                &separator_after_layout,
                &zoom_in,
                &zoom_out,
                &reset_zoom,
                &separator_after_zoom,
                &reset_layout,
            ],
            0,
        )?;
    } else {
        let view_menu = SubmenuBuilder::new(handle, "View")
            .item(&toggle_dark_mode)
            .separator()
            .item(&toggle_task_overview)
            .item(&toggle_editor_mode)
            .separator()
            .item(&collapse_blocks_submenu)
            .item(&expand_all_blocks)
            .separator()
            .item(&zoom_in)
            .item(&zoom_out)
            .item(&reset_zoom)
            .separator()
            .item(&reset_layout)
            .build()?;
        insert_submenu_before_label(menu, &view_menu, "Help")?;
    }
    Ok(())
}

fn ensure_help_menu<R: Runtime>(handle: &AppHandle<R>, menu: &Menu<R>) -> tauri::Result<()> {
    let shortcuts =
        MenuItemBuilder::with_id(MENU_KEYBOARD_SHORTCUTS, "Keyboard Shortcuts").build(handle)?;
    let about = MenuItemBuilder::with_id(MENU_ABOUT, "About Semtags").build(handle)?;

    if let Some(help_menu) = find_submenu(menu, "Help")? {
        while !help_menu.items()?.is_empty() {
            let _ = help_menu.remove_at(0)?;
        }
        help_menu.append(&shortcuts)?;
        help_menu.append(&about)?;
    } else {
        let help_menu = SubmenuBuilder::new(handle, "Help")
            .item(&shortcuts)
            .item(&about)
            .build()?;
        menu.append(&help_menu)?;
    }

    Ok(())
}

fn find_submenu<R: Runtime>(menu: &Menu<R>, text: &str) -> tauri::Result<Option<Submenu<R>>> {
    Ok(menu.items()?.into_iter().find_map(|item| {
        let submenu = item.as_submenu()?.clone();
        matches!(submenu.text().as_deref(), Ok(label) if label == text).then_some(submenu)
    }))
}

fn insert_submenu_before_label<R: Runtime>(
    menu: &Menu<R>,
    submenu: &Submenu<R>,
    label: &str,
) -> tauri::Result<()> {
    let position = menu
        .items()?
        .iter()
        .position(|item| {
            item.as_submenu()
                .and_then(|candidate| candidate.text().ok())
                .is_some_and(|text| text == label)
        })
        .unwrap_or_else(|| menu.items().map(|items| items.len()).unwrap_or(0));

    menu.insert(submenu, position)
}

fn menu_action_text(action: &str, label: Option<&str>) -> String {
    match label {
        Some(label) if !label.trim().is_empty() => format!("{action} {}", label.trim()),
        _ => action.to_string(),
    }
}

fn theme_menu_text(is_dark: bool) -> &'static str {
    if is_dark {
        "Switch to light mode"
    } else {
        "Switch to dark mode"
    }
}

fn task_overview_menu_text(is_task_overview: bool) -> &'static str {
    if is_task_overview {
        "Show Editor"
    } else {
        "Show Task Overview"
    }
}

fn editor_mode_menu_text(is_live_preview: bool) -> &'static str {
    if is_live_preview {
        "Plain markdown edit"
    } else {
        "Live preview edit"
    }
}

fn set_menu_item_text<R: Runtime>(menu: &Menu<R>, id: &str, text: &str) -> Result<(), String> {
    for item in menu
        .items()
        .map_err(|error| format!("Failed to read menu items: {error}"))?
    {
        if set_menu_item_kind_text(&item, id, text)? {
            return Ok(());
        }
    }

    Err(format!("Menu item '{id}' was not found"))
}

fn set_menu_item_enabled<R: Runtime>(
    menu: &Menu<R>,
    id: &str,
    enabled: bool,
) -> Result<(), String> {
    for item in menu
        .items()
        .map_err(|error| format!("Failed to read menu items: {error}"))?
    {
        if set_menu_item_kind_enabled(&item, id, enabled)? {
            return Ok(());
        }
    }

    Err(format!("Menu item '{id}' was not found"))
}

fn set_menu_item_kind_text<R: Runtime>(
    item: &MenuItemKind<R>,
    id: &str,
    text: &str,
) -> Result<bool, String> {
    if item.id().as_ref() == id {
        if let Some(menu_item) = item.as_menuitem() {
            menu_item
                .set_text(text)
                .map_err(|error| format!("Failed to update menu item '{id}': {error}"))?;
            return Ok(true);
        }
    }

    if let MenuItemKind::Submenu(submenu) = item {
        for child in submenu
            .items()
            .map_err(|error| format!("Failed to read submenu items: {error}"))?
        {
            if set_menu_item_kind_text(&child, id, text)? {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

fn set_menu_item_kind_enabled<R: Runtime>(
    item: &MenuItemKind<R>,
    id: &str,
    enabled: bool,
) -> Result<bool, String> {
    if item.id().as_ref() == id {
        if let Some(menu_item) = item.as_menuitem() {
            menu_item
                .set_enabled(enabled)
                .map_err(|error| format!("Failed to update menu item '{id}': {error}"))?;
            return Ok(true);
        }
    }

    if let MenuItemKind::Submenu(submenu) = item {
        for child in submenu
            .items()
            .map_err(|error| format!("Failed to read submenu items: {error}"))?
        {
            if set_menu_item_kind_enabled(&child, id, enabled)? {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::{editor_mode_menu_text, task_overview_menu_text, theme_menu_text};

    #[test]
    fn theme_menu_describes_the_available_switch() {
        assert_eq!(theme_menu_text(false), "Switch to dark mode");
        assert_eq!(theme_menu_text(true), "Switch to light mode");
    }

    #[test]
    fn task_overview_menu_describes_the_available_view() {
        assert_eq!(task_overview_menu_text(false), "Show Task Overview");
        assert_eq!(task_overview_menu_text(true), "Show Editor");
    }

    #[test]
    fn editor_mode_menu_describes_the_available_mode() {
        assert_eq!(editor_mode_menu_text(true), "Plain markdown edit");
        assert_eq!(editor_mode_menu_text(false), "Live preview edit");
    }
}
