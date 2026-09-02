use std::collections::{BTreeMap, BTreeSet};
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use notify::event::{CreateKind, ModifyKind, RemoveKind, RenameMode};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

use crate::app_state::AppState;
use crate::workspace_index::{reindex_workspace, reindex_workspace_paths};

pub struct WorkspaceWatcher {
    _watcher: RecommendedWatcher,
}

impl std::fmt::Debug for WorkspaceWatcher {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.debug_struct("WorkspaceWatcher").finish()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum WorkspaceChangeKind {
    Created,
    Modified,
    Removed,
    RenamedFrom,
    RenamedTo,
}

#[derive(Debug, Default, PartialEq, Eq)]
struct WorkspaceChangeBatch {
    changes: BTreeMap<String, BTreeSet<WorkspaceChangeKind>>,
    folder_structure_changed: bool,
    requires_full_reindex: bool,
}

impl WorkspaceChangeBatch {
    fn add_result(&mut self, root: &Path, result: notify::Result<Event>) {
        match result {
            Ok(event) => self.add_event(root, event),
            Err(_) => self.requires_full_reindex = true,
        }
    }

    fn add_event(&mut self, root: &Path, event: Event) {
        match event.kind {
            EventKind::Create(kind) => {
                self.add_regular_paths(root, &event.paths, WorkspaceChangeKind::Created);
                if matches!(kind, CreateKind::Folder)
                    || event.paths.iter().any(|path| path.is_dir())
                {
                    self.folder_structure_changed = true;
                }
            }
            EventKind::Modify(ModifyKind::Name(mode)) => {
                self.add_rename_paths(root, &event.paths, mode);
            }
            EventKind::Modify(_) => {
                self.add_regular_paths(root, &event.paths, WorkspaceChangeKind::Modified);
            }
            EventKind::Remove(kind) => {
                self.add_regular_paths(root, &event.paths, WorkspaceChangeKind::Removed);
                if matches!(kind, RemoveKind::Folder)
                    || matches!(kind, RemoveKind::Any)
                        && event.paths.iter().any(|path| !has_extension(path))
                {
                    self.folder_structure_changed = true;
                }
            }
            EventKind::Any => self.requires_full_reindex = true,
            EventKind::Access(_) | EventKind::Other => {}
        }
    }

    fn add_regular_paths(&mut self, root: &Path, paths: &[PathBuf], kind: WorkspaceChangeKind) {
        for path in paths {
            if let Some(relative_path) = markdown_event_path(root, path) {
                self.changes.entry(relative_path).or_default().insert(kind);
            }
        }
    }

    fn add_rename_paths(&mut self, root: &Path, paths: &[PathBuf], mode: RenameMode) {
        match mode {
            RenameMode::Both if paths.len() == 2 => {
                self.add_rename_path(root, &paths[0], WorkspaceChangeKind::RenamedFrom);
                self.add_rename_path(root, &paths[1], WorkspaceChangeKind::RenamedTo);
                if rename_may_be_directory(paths) {
                    self.requires_full_reindex = true;
                }
            }
            RenameMode::From => {
                for path in paths {
                    self.add_rename_path(root, path, WorkspaceChangeKind::RenamedFrom);
                }
            }
            RenameMode::To => {
                for path in paths {
                    self.add_rename_path(root, path, WorkspaceChangeKind::RenamedTo);
                }
            }
            RenameMode::Any | RenameMode::Other | RenameMode::Both => {
                self.requires_full_reindex = true;
            }
        }
    }

    fn add_rename_path(&mut self, root: &Path, path: &Path, kind: WorkspaceChangeKind) {
        if let Some(relative_path) = markdown_event_path(root, path) {
            self.changes.entry(relative_path).or_default().insert(kind);
        } else if !has_extension(path) || path.is_dir() {
            self.requires_full_reindex = true;
        }
    }

    fn has_work(&self) -> bool {
        !self.changes.is_empty() || self.folder_structure_changed || self.requires_full_reindex
    }

    fn changed_paths(&self) -> Vec<String> {
        self.changes.keys().cloned().collect()
    }
}

pub fn start_workspace_watcher(
    root: PathBuf,
    app_handle: AppHandle,
) -> Result<WorkspaceWatcher, String> {
    let (sender, receiver) = mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |result| {
        let _ = sender.send(result);
    })
    .map_err(|error| format!("Failed to start workspace watcher: {error}"))?;

    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|error| format!("Failed to watch workspace '{}': {error}", root.display()))?;

    let watched_root = root.clone();
    thread::spawn(move || {
        while let Ok(result) = receiver.recv() {
            let mut batch = WorkspaceChangeBatch::default();
            batch.add_result(&watched_root, result);

            while let Ok(result) = receiver.recv_timeout(Duration::from_millis(400)) {
                batch.add_result(&watched_root, result);
            }

            if !batch.has_work() {
                continue;
            }

            let state = app_handle.state::<AppState>();
            let update_result = state
                .with_workspace_mut(|workspace| {
                    if workspace.root != watched_root {
                        return Ok(false);
                    }

                    if batch.requires_full_reindex {
                        reindex_workspace(workspace)?;
                    } else if let Err(incremental_error) =
                        reindex_workspace_paths(workspace, batch.changed_paths())
                    {
                        reindex_workspace(workspace).map_err(|reindex_error| {
                            format!(
                                "Incremental index update failed: {incremental_error}. Full reindex failed: {reindex_error}"
                            )
                        })?;
                    }

                    Ok(true)
                })
                .and_then(|result| result);

            if matches!(update_result, Ok(true)) {
                let _ = app_handle.emit("page-list-changed", ());
                let _ = app_handle.emit("index-updated", ());
            }
        }
    });

    Ok(WorkspaceWatcher { _watcher: watcher })
}

fn markdown_event_path(root: &Path, path: &Path) -> Option<String> {
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        return None;
    }

    normalized_event_path(root, path).filter(|path| !is_ignored_path(path))
}

fn normalized_event_path(root: &Path, path: &Path) -> Option<String> {
    let relative = if path.is_absolute() {
        path.strip_prefix(root).ok()?
    } else {
        path
    };
    let mut segments = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(segment) => segments.push(segment.to_string_lossy().to_string()),
            _ => return None,
        }
    }
    (!segments.is_empty()).then(|| segments.join("/"))
}

fn is_ignored_path(path: &str) -> bool {
    path.split('/')
        .any(|segment| matches!(segment, ".git" | "node_modules" | "target"))
}

fn has_extension(path: &Path) -> bool {
    path.extension().is_some()
}

fn rename_may_be_directory(paths: &[PathBuf]) -> bool {
    paths.iter().any(|path| path.is_dir()) || paths.iter().all(|path| !has_extension(path))
}

#[cfg(test)]
mod tests {
    use std::io;

    use notify::event::{DataChange, MetadataKind};
    use notify::Error;

    use super::*;

    #[test]
    fn retains_paths_and_kinds_for_markdown_events() {
        let root = Path::new("/workspace");
        let mut batch = WorkspaceChangeBatch::default();

        batch.add_result(
            root,
            Ok(event(
                EventKind::Create(CreateKind::File),
                &["notes/new.md"],
            )),
        );
        batch.add_result(
            root,
            Ok(event(
                EventKind::Modify(ModifyKind::Data(DataChange::Any)),
                &["notes/new.md"],
            )),
        );
        batch.add_result(
            root,
            Ok(event(
                EventKind::Modify(ModifyKind::Metadata(MetadataKind::Any)),
                &["notes/changed.MD"],
            )),
        );
        batch.add_result(
            root,
            Ok(event(
                EventKind::Remove(RemoveKind::File),
                &["notes/deleted.md"],
            )),
        );

        assert_eq!(
            batch.changes["notes/new.md"],
            BTreeSet::from([WorkspaceChangeKind::Created, WorkspaceChangeKind::Modified])
        );
        assert_eq!(
            batch.changes["notes/changed.MD"],
            BTreeSet::from([WorkspaceChangeKind::Modified])
        );
        assert_eq!(
            batch.changes["notes/deleted.md"],
            BTreeSet::from([WorkspaceChangeKind::Removed])
        );
        assert!(!batch.requires_full_reindex);
    }

    #[test]
    fn retains_both_sides_of_a_markdown_rename() {
        let mut batch = WorkspaceChangeBatch::default();
        batch.add_result(
            Path::new("/workspace"),
            Ok(event(
                EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
                &["notes/old.md", "archive/new.md"],
            )),
        );

        assert_eq!(
            batch.changes["notes/old.md"],
            BTreeSet::from([WorkspaceChangeKind::RenamedFrom])
        );
        assert_eq!(
            batch.changes["archive/new.md"],
            BTreeSet::from([WorkspaceChangeKind::RenamedTo])
        );
        assert!(!batch.requires_full_reindex);
    }

    #[test]
    fn requests_full_reindex_for_folder_rename_and_watcher_error() {
        let root = Path::new("/workspace");
        let mut rename_batch = WorkspaceChangeBatch::default();
        rename_batch.add_result(
            root,
            Ok(event(
                EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
                &["notes", "archive"],
            )),
        );
        assert!(rename_batch.requires_full_reindex);

        let mut error_batch = WorkspaceChangeBatch::default();
        error_batch.add_result(root, Err(Error::io(io::Error::other("watch failed"))));
        assert!(error_batch.requires_full_reindex);
    }

    #[test]
    fn ignores_non_markdown_and_scanner_excluded_paths() {
        let mut batch = WorkspaceChangeBatch::default();
        batch.add_result(
            Path::new("/workspace"),
            Ok(event(
                EventKind::Modify(ModifyKind::Any),
                &["notes/readme.txt", ".config", "target/generated.md"],
            )),
        );

        assert!(!batch.has_work());
    }

    #[test]
    fn normalizes_absolute_paths_relative_to_the_workspace() {
        let root = std::env::temp_dir().join("semtags-watcher-path-test");
        let inside = root.join("notes").join("Page.md");
        let outside = root
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("outside")
            .join("Page.md");

        assert_eq!(
            markdown_event_path(&root, &inside),
            Some("notes/Page.md".to_string())
        );
        assert_eq!(markdown_event_path(&root, &outside), None);
    }

    fn event(kind: EventKind, paths: &[&str]) -> Event {
        let mut event = Event::new(kind);
        event.paths = paths.iter().map(PathBuf::from).collect();
        event
    }
}
