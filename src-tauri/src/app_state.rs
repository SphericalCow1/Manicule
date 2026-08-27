use std::path::PathBuf;
use std::sync::Mutex;

use crate::index::backlink_index::BacklinkIndex;
use crate::index::page_index::PageIndex;
use crate::watcher::WorkspaceWatcher;
use crate::workspace_config::WorkspaceConfig;

#[derive(Default)]
pub struct AppState {
    workspace: Mutex<Option<WorkspaceState>>,
    watcher: Mutex<Option<WorkspaceWatcher>>,
}

#[derive(Debug)]
pub struct WorkspaceState {
    pub root: PathBuf,
    pub config: WorkspaceConfig,
    pub folders: Vec<String>,
    pub pages: PageIndex,
    pub backlinks: BacklinkIndex,
}

impl AppState {
    pub fn set_workspace(&self, workspace: WorkspaceState) -> Result<(), String> {
        let mut state = self
            .workspace
            .lock()
            .map_err(|_| "Failed to lock app state".to_string())?;
        *state = Some(workspace);
        Ok(())
    }

    pub fn with_workspace<T>(
        &self,
        callback: impl FnOnce(&WorkspaceState) -> T,
    ) -> Result<T, String> {
        let state = self
            .workspace
            .lock()
            .map_err(|_| "Failed to lock app state".to_string())?;
        let workspace = state
            .as_ref()
            .ok_or_else(|| "No workspace is open".to_string())?;
        Ok(callback(workspace))
    }

    pub fn with_workspace_mut<T>(
        &self,
        callback: impl FnOnce(&mut WorkspaceState) -> T,
    ) -> Result<T, String> {
        let mut state = self
            .workspace
            .lock()
            .map_err(|_| "Failed to lock app state".to_string())?;
        let workspace = state
            .as_mut()
            .ok_or_else(|| "No workspace is open".to_string())?;
        Ok(callback(workspace))
    }

    pub fn set_watcher(&self, watcher: WorkspaceWatcher) -> Result<(), String> {
        let mut state = self
            .watcher
            .lock()
            .map_err(|_| "Failed to lock watcher state".to_string())?;
        *state = Some(watcher);
        Ok(())
    }

    pub fn clear_workspace(&self) -> Result<(), String> {
        let mut workspace = self
            .workspace
            .lock()
            .map_err(|_| "Failed to lock app state".to_string())?;
        let mut watcher = self
            .watcher
            .lock()
            .map_err(|_| "Failed to lock watcher state".to_string())?;

        *watcher = None;
        *workspace = None;
        Ok(())
    }
}
