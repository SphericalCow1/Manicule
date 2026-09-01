use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::app_state::WorkspaceState;
use crate::dto::SavePageResultDto;
use crate::workspace::paths::resolve_workspace_relative_path;

pub fn content_hash(content: &str) -> String {
    let mut hash = 0xcbf29ce484222325_u64;

    for byte in content.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }

    format!("{hash:016x}")
}

pub(crate) fn save_page_to_disk(
    relative_path: String,
    absolute_path: PathBuf,
    content: String,
    _expected_modified_at: String,
    expected_content_hash: String,
) -> Result<SavePageResultDto, String> {
    if !absolute_path.is_file() {
        return Err("Page does not exist".to_string());
    }

    let disk_content = fs::read_to_string(&absolute_path)
        .map_err(|error| format!("Failed to read page '{}': {error}", relative_path))?;
    let current_modified_at = modified_at_millis(&absolute_path)?;
    let current_content_hash = content_hash(&disk_content);

    if current_content_hash != expected_content_hash {
        return Ok(SavePageResultDto::Conflict {
            path: relative_path,
            current_modified_at,
            current_content_hash,
            disk_content,
        });
    }

    fs::write(&absolute_path, &content)
        .map_err(|error| format!("Failed to write page '{}': {error}", relative_path))?;

    let modified_at = modified_at_millis(&absolute_path)
        .unwrap_or_else(|_| system_time_millis(SystemTime::now()));

    Ok(SavePageResultDto::Saved {
        path: relative_path,
        modified_at,
        content_hash: content_hash(&content),
    })
}

pub fn save_page_in_workspace(
    workspace: &mut WorkspaceState,
    path: &str,
    content: String,
    expected_modified_at: String,
    expected_content_hash: String,
) -> Result<SavePageResultDto, String> {
    let resolved_path = workspace
        .pages
        .resolve_path(path)?
        .ok_or_else(|| "Page is not indexed".to_string())?;
    let absolute_path = resolve_workspace_relative_path(&workspace.root, &resolved_path)
        .ok_or_else(|| "Invalid page path".to_string())?;

    let result = save_page_to_disk(
        resolved_path.clone(),
        absolute_path,
        content.clone(),
        expected_modified_at,
        expected_content_hash,
    )?;

    if matches!(result, SavePageResultDto::Saved { .. }) {
        workspace.pages.update_title(&resolved_path, &content);
        workspace.backlinks.index_page(resolved_path, &content);
    }

    Ok(result)
}

pub(crate) fn modified_at_millis(path: &PathBuf) -> Result<String, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Failed to read page metadata '{}': {error}", path.display()))?;
    let modified = metadata
        .modified()
        .map_err(|error| format!("Failed to read modified time '{}': {error}", path.display()))?;

    Ok(system_time_millis(modified))
}

fn system_time_millis(time: SystemTime) -> String {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;
    use crate::index::backlink_index::BacklinkIndex;
    use crate::index::page_index::PageIndex;
    use crate::workspace_config::WorkspaceConfig;
    use crate::workspace_index::reindex_workspace;

    static TEMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    #[test]
    fn workspace_save_updates_page_title_and_backlinks() {
        let root = temp_workspace();
        let page_path = root.join("Inbox.md");
        fs::write(&page_path, "# Old title\n\n- [[Old target]]").unwrap();
        fs::write(root.join("Target.md"), "# Target").unwrap();
        let mut workspace = WorkspaceState {
            root: root.clone(),
            config: WorkspaceConfig::default(),
            folders: Vec::new(),
            pages: PageIndex::default(),
            backlinks: BacklinkIndex::default(),
        };
        reindex_workspace(&mut workspace).unwrap();

        let content = "# New title\n\n- [[Target]]".to_string();
        let result = save_page_in_workspace(
            &mut workspace,
            "Inbox.md",
            content.clone(),
            String::new(),
            content_hash("# Old title\n\n- [[Old target]]"),
        )
        .unwrap();

        assert!(matches!(result, SavePageResultDto::Saved { .. }));
        assert_eq!(fs::read_to_string(&page_path).unwrap(), content);
        assert_eq!(
            workspace.pages.get_by_path("Inbox.md").unwrap().title,
            "New title"
        );
        assert!(workspace
            .backlinks
            .backlinks_for_target_key("old target")
            .is_empty());
        assert_eq!(
            workspace.backlinks.backlinks_for_target_key("target").len(),
            1
        );

        fs::remove_dir_all(root).unwrap();
    }

    fn temp_workspace() -> PathBuf {
        let unique = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "semtags-page-io-test-{}-{nanos}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }
}
