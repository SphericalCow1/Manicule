use serde::Serialize;
use std::collections::HashMap;

use crate::index::backlink_index::Backlink;
use crate::index::page_index::{Page, PageIndex};
use crate::workspace_config::{BacklinkViewConfig, NavigationLayoutConfig, TaskOverviewConfig};
use crate::Diagnostic;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageSummaryDto {
    pub path: String,
    pub title: String,
    pub key: String,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStateDto {
    pub root: String,
    pub pages: Vec<PageSummaryDto>,
    pub folders: Vec<String>,
    pub diagnostics: Vec<Diagnostic>,
    pub task_states: Vec<String>,
    pub task_state_colors: HashMap<String, String>,
    pub task_done_sound_enabled: bool,
    pub default_page_sort: String,
    pub folder_page_sort: HashMap<String, String>,
    pub manual_page_order: HashMap<String, Vec<String>>,
    pub folder_colors: HashMap<String, String>,
    pub expanded_folders: Option<Vec<String>>,
    pub page_favorites: Vec<String>,
    pub recent_pages: Vec<String>,
    pub navigation_layout: NavigationLayoutConfig,
    pub task_overview: TaskOverviewConfig,
    pub backlink_view: BacklinkViewConfig,
    pub last_editor_path: Option<String>,
    pub last_right_pane_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePageResultDto {
    pub page: PageSummaryDto,
    pub pages: Vec<PageSummaryDto>,
    pub folders: Vec<String>,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderResultDto {
    pub path: String,
    pub folders: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletePageResultDto {
    pub deleted_path: String,
    pub pages: Vec<PageSummaryDto>,
    pub folders: Vec<String>,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFolderResultDto {
    pub deleted_path: String,
    pub deleted_page_paths: Vec<String>,
    pub pages: Vec<PageSummaryDto>,
    pub folders: Vec<String>,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovePageResultDto {
    pub old_path: String,
    pub page: PageSummaryDto,
    pub pages: Vec<PageSummaryDto>,
    pub folders: Vec<String>,
    pub diagnostics: Vec<Diagnostic>,
    pub updated_link_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamePageResultDto {
    pub old_path: String,
    pub page: PageSummaryDto,
    pub pages: Vec<PageSummaryDto>,
    pub folders: Vec<String>,
    pub diagnostics: Vec<Diagnostic>,
    pub updated_link_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameFolderResultDto {
    pub old_path: String,
    pub new_path: String,
    pub pages: Vec<PageSummaryDto>,
    pub folders: Vec<String>,
    pub diagnostics: Vec<Diagnostic>,
    pub renamed_page_count: usize,
    pub updated_link_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageContentDto {
    pub path: String,
    pub content: String,
    pub modified_at: String,
    pub content_hash: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageViewDto {
    pub page: PageSummaryDto,
    pub content: String,
    pub backlinks: Vec<BacklinkViewDto>,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkViewDto {
    pub source_path: String,
    pub source_title: String,
    pub source_headings: Vec<String>,
    pub block_markdown: String,
    pub line_numbers: Vec<usize>,
    pub line_start: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultDto {
    pub path: String,
    pub title: String,
    pub line: usize,
    pub excerpt: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskItemDto {
    pub path: String,
    pub title: String,
    pub line: usize,
    pub status: String,
    pub priority: Option<String>,
    pub source_headings: Vec<String>,
    pub parent_blocks: Vec<String>,
    pub linked_pages: Vec<TaskLinkDto>,
    pub text: String,
    pub markdown: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskLinkDto {
    pub target: String,
    pub label: String,
    pub resolved_path: Option<String>,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskStatusResultDto {
    pub task: TaskItemDto,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleCheckboxResultDto {
    pub path: String,
    pub line: usize,
    pub checked: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum SavePageResultDto {
    #[serde(rename = "saved")]
    Saved {
        path: String,
        modified_at: String,
        content_hash: String,
    },
    #[serde(rename = "conflict")]
    Conflict {
        path: String,
        current_modified_at: String,
        current_content_hash: String,
        disk_content: String,
    },
}

pub(crate) fn page_summaries(index: &PageIndex) -> Vec<PageSummaryDto> {
    index.pages().into_iter().map(page_summary).collect()
}

pub(crate) fn page_summary(page: Page) -> PageSummaryDto {
    PageSummaryDto {
        path: page.path,
        title: page.title,
        key: page.key,
        exists: true,
    }
}

pub(crate) fn backlink_view(backlink: Backlink) -> BacklinkViewDto {
    BacklinkViewDto {
        source_path: backlink.source_path,
        source_title: backlink.source_title,
        source_headings: backlink.source_headings,
        block_markdown: backlink.block_markdown,
        line_numbers: backlink.line_numbers,
        line_start: backlink.line_start,
    }
}
