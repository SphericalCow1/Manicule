use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

use crate::app_state::AppState;
use crate::workspace_index::reindex_workspace;

pub struct WorkspaceWatcher {
    _watcher: RecommendedWatcher,
}

impl std::fmt::Debug for WorkspaceWatcher {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.debug_struct("WorkspaceWatcher").finish()
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

    thread::spawn(move || {
        while let Ok(result) = receiver.recv() {
            if !is_relevant_event(result) {
                continue;
            }

            while let Ok(result) = receiver.recv_timeout(Duration::from_millis(400)) {
                if !is_relevant_event(result) {
                    continue;
                }
            }

            let state = app_handle.state::<AppState>();
            let reindex_result = state.with_workspace_mut(reindex_workspace);

            if reindex_result.is_ok() {
                let _ = app_handle.emit("page-list-changed", ());
                let _ = app_handle.emit("index-updated", ());
            }
        }
    });

    Ok(WorkspaceWatcher { _watcher: watcher })
}

fn is_relevant_event(result: notify::Result<notify::Event>) -> bool {
    let Ok(event) = result else {
        return false;
    };

    event.paths.iter().any(|path| {
        path.extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    })
}

#[cfg(test)]
mod tests {
    use std::io;
    use std::path::PathBuf;

    use notify::event::{CreateKind, DataChange, ModifyKind, RemoveKind, RenameMode};
    use notify::{Error, Event, EventKind};

    use super::is_relevant_event;

    #[test]
    fn classifies_markdown_create_modify_remove_and_rename_events_as_relevant() {
        for event in [
            event(EventKind::Create(CreateKind::File), &["notes/new.md"]),
            event(
                EventKind::Modify(ModifyKind::Data(DataChange::Any)),
                &["notes/changed.MD"],
            ),
            event(EventKind::Remove(RemoveKind::File), &["notes/deleted.md"]),
            event(
                EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
                &["notes/old.md", "archive/new.md"],
            ),
        ] {
            assert!(is_relevant_event(Ok(event)));
        }
    }

    #[test]
    fn ignores_non_markdown_config_and_failed_watcher_events() {
        assert!(!is_relevant_event(Ok(event(
            EventKind::Modify(ModifyKind::Any),
            &["notes/readme.txt", ".config"],
        ))));
        assert!(!is_relevant_event(Err(Error::io(io::Error::other(
            "watch failed",
        )))));
    }

    #[test]
    fn treats_any_markdown_path_in_a_multi_path_event_as_relevant() {
        assert!(is_relevant_event(Ok(event(
            EventKind::Modify(ModifyKind::Any),
            &["notes/readme.txt", "notes/page.md"],
        ))));
    }

    fn event(kind: EventKind, paths: &[&str]) -> Event {
        let mut event = Event::new(kind);
        event.paths = paths.iter().map(PathBuf::from).collect();
        event
    }
}
