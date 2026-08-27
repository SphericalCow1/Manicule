use std::fs;

use crate::app_state::WorkspaceState;
use crate::dto::{backlink_view, page_summary, PageViewDto};
use crate::navigation_order::sort_backlinks_by_navigation_order;
use crate::workspace::paths::{page_key_from_relative_path, resolve_workspace_relative_path};

pub(crate) fn get_page_view_from_workspace(
    workspace: &WorkspaceState,
    path: &str,
) -> Result<PageViewDto, String> {
    let resolved_path = workspace
        .pages
        .resolve_path(path)?
        .ok_or_else(|| "Page is not indexed".to_string())?;
    let absolute_path = resolve_workspace_relative_path(&workspace.root, &resolved_path)
        .ok_or_else(|| "Invalid page path".to_string())?;
    let page = workspace
        .pages
        .get_by_path(&resolved_path)
        .ok_or_else(|| "Page is not indexed".to_string())?
        .clone();
    let key = page_key_from_relative_path(&resolved_path)
        .ok_or_else(|| "Invalid page path".to_string())?;
    let content = fs::read_to_string(&absolute_path)
        .map_err(|error| format!("Failed to read page '{}': {error}", resolved_path))?;
    let mut backlinks = workspace.backlinks.backlinks_for_target_key(&key);
    sort_backlinks_by_navigation_order(&mut backlinks, workspace);

    Ok(PageViewDto {
        page: page_summary(page),
        content,
        backlinks: backlinks.into_iter().map(backlink_view).collect(),
        diagnostics: workspace.pages.collision_diagnostics(),
    })
}
