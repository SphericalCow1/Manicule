use std::fs;
use std::path::Path;

use crate::app_state::WorkspaceState;
use crate::index::backlink_index::BacklinkIndex;
use crate::index::page_index::PageIndex;
use crate::workspace::paths::resolve_workspace_relative_path;
use crate::workspace::scanner::scan_workspace;

pub(crate) fn build_backlink_index(
    root: &Path,
    pages: &PageIndex,
) -> Result<BacklinkIndex, String> {
    let mut backlinks = BacklinkIndex::default();

    for page in pages.pages() {
        let absolute_path = resolve_workspace_relative_path(root, &page.path)
            .ok_or_else(|| format!("Invalid page path '{}'", page.path))?;
        let content = fs::read_to_string(&absolute_path)
            .map_err(|error| format!("Failed to read page '{}': {error}", page.path))?;
        backlinks.index_page(page.path, &content);
    }

    Ok(backlinks)
}

pub fn reindex_workspace(workspace: &mut WorkspaceState) -> Result<(), String> {
    let scan = scan_workspace(&workspace.root)?;
    let mut pages = PageIndex::default();

    for path in scan.markdown_files {
        let absolute_path = resolve_workspace_relative_path(&workspace.root, &path)
            .ok_or_else(|| format!("Invalid page path '{path}'"))?;
        let content = fs::read_to_string(&absolute_path)
            .map_err(|error| format!("Failed to read page '{path}': {error}"))?;
        pages.insert_page(path, &content);
    }

    let backlinks = build_backlink_index(&workspace.root, &pages)?;

    workspace.pages = pages;
    workspace.backlinks = backlinks;
    workspace.folders = scan.folders;

    Ok(())
}
