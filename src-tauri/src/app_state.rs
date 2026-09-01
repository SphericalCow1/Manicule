use std::path::PathBuf;
use std::sync::Mutex;

use crate::app_error::{AppError, AppResult};
use crate::content_snapshot::ContentSnapshot;
use crate::index::backlink_index::BacklinkIndex;
use crate::index::page_index::{Page, PageIndex};
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
    pub contents: ContentSnapshot,
}

impl WorkspaceState {
    pub fn index_page_content(&mut self, path: String, content: String) -> Option<Page> {
        if self.pages.get_by_path(&path).is_some() {
            self.pages.update_title(&path, &content);
        } else {
            self.pages.insert_page(path.clone(), &content)?;
        }
        self.backlinks.index_page(path.clone(), &content);
        self.contents.insert(path.clone(), content);
        self.pages.get_by_path(&path).cloned()
    }

    pub fn remove_indexed_page(&mut self, path: &str) -> Option<Page> {
        let page = self.pages.remove_path(path);
        self.backlinks.remove_page(path);
        self.contents.remove(path);
        page
    }
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

    pub fn with_workspace_mut_app<T>(
        &self,
        callback: impl FnOnce(&mut WorkspaceState) -> AppResult<T>,
    ) -> AppResult<T> {
        let mut state = self
            .workspace
            .lock()
            .map_err(|_| AppError::state_lock("Failed to lock app state"))?;
        let workspace = state
            .as_mut()
            .ok_or_else(|| AppError::not_found("Open a workspace before using this action."))?;
        callback(workspace)
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
