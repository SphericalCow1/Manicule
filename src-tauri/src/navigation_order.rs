use std::cmp::Ordering;
use std::collections::HashMap;

use crate::app_state::WorkspaceState;
use crate::index::backlink_index::Backlink;
use crate::index::page_index::Page;

pub(crate) fn sort_backlinks_by_navigation_order(
    backlinks: &mut [Backlink],
    workspace: &WorkspaceState,
) {
    let order = page_navigation_order(workspace);

    backlinks.sort_by(|left, right| {
        let left_order = order.get(&left.source_path).copied().unwrap_or(usize::MAX);
        let right_order = order.get(&right.source_path).copied().unwrap_or(usize::MAX);

        left_order
            .cmp(&right_order)
            .then_with(|| left.source_path.cmp(&right.source_path))
            .then_with(|| left.line_start.cmp(&right.line_start))
    });
}

fn page_navigation_order(workspace: &WorkspaceState) -> HashMap<String, usize> {
    let entries_by_folder = entries_by_folder(workspace);
    let mut ordered_paths = Vec::new();
    append_ordered_pages("", &entries_by_folder, workspace, &mut ordered_paths);

    ordered_paths
        .into_iter()
        .enumerate()
        .map(|(index, path)| (path, index))
        .collect()
}

fn append_ordered_pages(
    folder_path: &str,
    entries_by_folder: &HashMap<String, Vec<NavigationEntry>>,
    workspace: &WorkspaceState,
    ordered_paths: &mut Vec<String>,
) {
    let Some(entries) = entries_by_folder.get(folder_path) else {
        return;
    };
    let mut entries = entries.clone();
    sort_navigation_entries(&mut entries, folder_path, workspace);

    for entry in entries {
        match entry.kind {
            NavigationEntryKind::Folder => {
                append_ordered_pages(&entry.path, entries_by_folder, workspace, ordered_paths);
            }
            NavigationEntryKind::Page => ordered_paths.push(entry.path),
        }
    }
}

fn entries_by_folder(workspace: &WorkspaceState) -> HashMap<String, Vec<NavigationEntry>> {
    let mut entries: HashMap<String, Vec<NavigationEntry>> = HashMap::new();

    for folder_path in &workspace.folders {
        let parent_path = parent_folder_path(folder_path);
        entries
            .entry(parent_path)
            .or_default()
            .push(NavigationEntry::folder(folder_path));
    }

    for page in workspace.pages.pages() {
        let parent_path = parent_folder_path(&page.path);
        entries
            .entry(parent_path)
            .or_default()
            .push(NavigationEntry::page(page));
    }

    entries
}

fn sort_navigation_entries(
    entries: &mut [NavigationEntry],
    folder_path: &str,
    workspace: &WorkspaceState,
) {
    let manual_rank: HashMap<String, usize> = workspace
        .config
        .manual_page_order
        .get(folder_path)
        .map(|paths| {
            paths
                .iter()
                .enumerate()
                .map(|(index, path)| (path.to_lowercase(), index))
                .collect()
        })
        .unwrap_or_default();
    let page_sort = workspace
        .config
        .folder_page_sort
        .get(folder_path)
        .unwrap_or(&workspace.config.default_page_sort);

    entries.sort_by(|left, right| {
        if !manual_rank.is_empty() {
            let left_rank = manual_rank.get(&left.path.to_lowercase()).copied();
            let right_rank = manual_rank.get(&right.path.to_lowercase()).copied();

            match (left_rank, right_rank) {
                (Some(left_rank), Some(right_rank)) if left_rank != right_rank => {
                    return left_rank.cmp(&right_rank);
                }
                (Some(_), None) => return Ordering::Less,
                (None, Some(_)) => return Ordering::Greater,
                _ => {}
            }
        }

        compare_navigation_entries(left, right, page_sort)
    });
}

fn compare_navigation_entries(
    left: &NavigationEntry,
    right: &NavigationEntry,
    page_sort: &str,
) -> Ordering {
    if left.kind != right.kind {
        return if left.kind == NavigationEntryKind::Folder {
            Ordering::Less
        } else {
            Ordering::Greater
        };
    }

    let ordering = left
        .name
        .to_lowercase()
        .cmp(&right.name.to_lowercase())
        .then_with(|| left.path.cmp(&right.path));

    if left.kind == NavigationEntryKind::Page && page_sort.ends_with("-desc") {
        ordering.reverse()
    } else {
        ordering
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct NavigationEntry {
    kind: NavigationEntryKind,
    path: String,
    name: String,
}

impl NavigationEntry {
    fn folder(path: &str) -> Self {
        Self {
            kind: NavigationEntryKind::Folder,
            path: path.to_string(),
            name: path.rsplit('/').next().unwrap_or(path).to_string(),
        }
    }

    fn page(page: Page) -> Self {
        let name = page_name_from_path(&page.path);
        Self {
            kind: NavigationEntryKind::Page,
            path: page.path,
            name,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NavigationEntryKind {
    Folder,
    Page,
}

fn parent_folder_path(path: &str) -> String {
    path.rsplit_once('/')
        .map(|(parent, _)| parent.to_string())
        .unwrap_or_default()
}

fn page_name_from_path(path: &str) -> String {
    let leaf = path.rsplit('/').next().unwrap_or(path);
    leaf.strip_suffix(".md").unwrap_or(leaf).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content_snapshot::ContentSnapshot;
    use crate::index::backlink_index::BacklinkIndex;
    use crate::index::page_index::PageIndex;
    use crate::workspace_config::WorkspaceConfig;
    use std::path::PathBuf;

    #[test]
    fn page_navigation_order_follows_manual_tree_order() {
        let mut config = WorkspaceConfig::default();
        config.manual_page_order = HashMap::from([
            (
                "".to_string(),
                vec![
                    "b.md".to_string(),
                    "projects".to_string(),
                    "a.md".to_string(),
                ],
            ),
            (
                "projects".to_string(),
                vec!["projects/a.md".to_string(), "projects/z.md".to_string()],
            ),
        ]);
        let workspace = WorkspaceState {
            root: PathBuf::new(),
            config,
            folders: vec!["projects".to_string()],
            pages: PageIndex::from_paths(vec![
                "a.md".to_string(),
                "b.md".to_string(),
                "projects/z.md".to_string(),
                "projects/a.md".to_string(),
            ]),
            backlinks: BacklinkIndex::default(),
            contents: ContentSnapshot::default(),
        };
        let order = page_navigation_order(&workspace);

        assert_eq!(order.get("b.md"), Some(&0));
        assert_eq!(order.get("projects/a.md"), Some(&1));
        assert_eq!(order.get("projects/z.md"), Some(&2));
        assert_eq!(order.get("a.md"), Some(&3));
    }

    #[test]
    fn page_navigation_order_sorts_folders_before_pages_and_page_names_descending() {
        let mut config = WorkspaceConfig::default();
        config.default_page_sort = "name-desc".to_string();
        let workspace = WorkspaceState {
            root: PathBuf::new(),
            config,
            folders: vec!["team".to_string(), "journal".to_string()],
            pages: PageIndex::from_paths(vec![
                "alpha.md".to_string(),
                "zeta.md".to_string(),
                "journal/2026-08-26.md".to_string(),
                "team/a.md".to_string(),
                "team/z.md".to_string(),
            ]),
            backlinks: BacklinkIndex::default(),
            contents: ContentSnapshot::default(),
        };
        let order = page_navigation_order(&workspace);

        assert!(order["journal/2026-08-26.md"] < order["team/z.md"]);
        assert!(order["team/z.md"] < order["team/a.md"]);
        assert!(order["zeta.md"] < order["alpha.md"]);
    }
}
