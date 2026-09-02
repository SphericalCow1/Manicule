use crate::app_state::WorkspaceState;
use crate::content_snapshot::ContentSnapshot;
use crate::index::backlink_index::BacklinkIndex;
use crate::index::page_index::PageIndex;
use crate::workspace::paths::resolve_workspace_relative_path;
use crate::workspace::scanner::scan_workspace;
use std::collections::HashSet;
use std::fs;

pub fn reindex_workspace(workspace: &mut WorkspaceState) -> Result<(), String> {
    let scan = scan_workspace(&workspace.root)?;
    let mut pages = PageIndex::default();
    let mut backlinks = BacklinkIndex::default();
    let mut contents = ContentSnapshot::default();

    for path in scan.markdown_files {
        let absolute_path = resolve_workspace_relative_path(&workspace.root, &path)
            .ok_or_else(|| format!("Invalid page path '{path}'"))?;
        let content = fs::read_to_string(&absolute_path)
            .map_err(|error| format!("Failed to read page '{path}': {error}"))?;
        pages.insert_page(path.clone(), &content);
        backlinks.index_page(path.clone(), &content);
        contents.insert(path, content);
    }

    workspace.pages = pages;
    workspace.backlinks = backlinks;
    workspace.contents = contents;
    workspace.folders = scan.folders;

    Ok(())
}

pub fn reindex_workspace_paths(
    workspace: &mut WorkspaceState,
    changed_paths: impl IntoIterator<Item = String>,
) -> Result<(), String> {
    let scan = scan_workspace(&workspace.root)?;
    let indexed_paths: HashSet<&str> = scan.markdown_files.iter().map(String::as_str).collect();

    for path in changed_paths {
        if indexed_paths.contains(path.as_str()) {
            let absolute_path = resolve_workspace_relative_path(&workspace.root, &path)
                .ok_or_else(|| format!("Invalid page path '{path}'"))?;
            let content = fs::read_to_string(&absolute_path)
                .map_err(|error| format!("Failed to read page '{path}': {error}"))?;
            workspace
                .index_page_content(path.clone(), content)
                .ok_or_else(|| format!("Failed to index page '{path}'"))?;
        } else {
            workspace.remove_indexed_page(&path);
        }
    }

    workspace.folders = scan.folders;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;
    use crate::content_snapshot::ContentSnapshot;
    use crate::workspace_config::WorkspaceConfig;

    static TEMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    #[test]
    fn incremental_reindex_matches_a_fresh_full_reindex() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("notes")).unwrap();
        fs::write(root.join("notes/Source.md"), "# Source\n\n- [[Old target]]").unwrap();
        fs::write(root.join("Old target.md"), "# Old target").unwrap();
        let mut incremental = empty_workspace(root.clone());
        reindex_workspace(&mut incremental).unwrap();

        fs::write(
            root.join("notes/Source.md"),
            "# Updated source\n\n- [[New page]]",
        )
        .unwrap();
        fs::write(root.join("New page.md"), "# New page\n\n- TODO Review").unwrap();
        fs::remove_file(root.join("Old target.md")).unwrap();

        reindex_workspace_paths(
            &mut incremental,
            [
                "notes/Source.md".to_string(),
                "New page.md".to_string(),
                "Old target.md".to_string(),
            ],
        )
        .unwrap();

        let mut full = empty_workspace(root.clone());
        reindex_workspace(&mut full).unwrap();

        assert_eq!(incremental.pages.pages(), full.pages.pages());
        assert_eq!(incremental.folders, full.folders);
        assert_eq!(incremental.contents, full.contents);
        assert_eq!(
            incremental.backlinks.backlinks_for_target_key("new page"),
            full.backlinks.backlinks_for_target_key("new page")
        );
        assert!(incremental
            .backlinks
            .backlinks_for_target_key("old target")
            .is_empty());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn incremental_reindex_uses_scanner_visibility_as_its_boundary() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("target")).unwrap();
        fs::write(root.join("target/Hidden.md"), "# Hidden").unwrap();
        let mut workspace = empty_workspace(root.clone());

        reindex_workspace_paths(&mut workspace, ["target/Hidden.md".to_string()]).unwrap();

        assert!(workspace.pages.pages().is_empty());
        assert!(workspace.contents.get("target/Hidden.md").is_none());

        fs::remove_dir_all(root).unwrap();
    }

    fn empty_workspace(root: std::path::PathBuf) -> WorkspaceState {
        WorkspaceState {
            root,
            config: WorkspaceConfig::default(),
            folders: Vec::new(),
            pages: PageIndex::default(),
            backlinks: BacklinkIndex::default(),
            contents: ContentSnapshot::default(),
        }
    }

    fn temp_workspace() -> std::path::PathBuf {
        let unique = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "mentinote-incremental-index-test-{}-{nanos}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }
}
