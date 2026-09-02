use std::fs;
use std::path::PathBuf;

use crate::app_error::{AppError, AppResult};
use crate::app_state::WorkspaceState;
use crate::dto::{
    page_summaries, page_summary, CreateFolderResultDto, CreatePageResultDto,
    DeleteFolderResultDto, DeletePageResultDto, MovePageResultDto, RenameFolderResultDto,
    RenamePageResultDto,
};
use crate::index::page_index::{default_h1_for_path, Page, PageIndex};
use crate::parser::wiki_links::rewrite_wiki_link_targets;
use crate::workspace::paths::{
    folder_path_from_target, markdown_path_from_page_target, page_key_from_link_target,
    page_key_from_relative_path, resolve_workspace_relative_path,
};
use crate::workspace::scanner::scan_workspace;
use crate::workspace_index::reindex_workspace;

struct LinkRewrite {
    page_path: String,
    absolute_path: PathBuf,
    rewritten: String,
    replacements: usize,
}

pub(crate) fn create_page_in_workspace(
    workspace: &mut WorkspaceState,
    path: String,
) -> AppResult<CreatePageResultDto> {
    let markdown_path =
        markdown_path_from_page_target(&path).ok_or_else(|| invalid_page_path(&path))?;
    let markdown_path = lowercase_markdown_file_name(&markdown_path);
    let key =
        page_key_from_relative_path(&markdown_path).ok_or_else(|| invalid_page_path(&path))?;

    if !workspace.pages.paths_for_key(&key).is_empty() {
        return Err(AppError::already_exists(
            "A page with this path already exists, ignoring case. Choose another name.",
        ));
    }

    let absolute_path = resolve_workspace_relative_path(&workspace.root, &markdown_path)
        .ok_or_else(|| invalid_page_path(&path))?;

    if absolute_path.exists() {
        return Err(AppError::already_exists(
            "A page with this path already exists. Choose another name.",
        ));
    }

    if let Some(parent) = absolute_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            AppError::io(
                "The page folder could not be created. Check its permissions and try again.",
                format!(
                    "Failed to create page directory '{}': {error}",
                    parent.display()
                ),
            )
        })?;
    }

    let content = default_page_content(&markdown_path);
    fs::write(&absolute_path, &content).map_err(|error| {
        AppError::io(
            "The page could not be created. Check the folder permissions and try again.",
            format!("Failed to create page '{}': {error}", markdown_path),
        )
    })?;

    let page = workspace
        .index_page_content(markdown_path.clone(), content)
        .ok_or_else(|| {
            AppError::internal(
                "The page was created, but Semtags could not add it to the workspace index. Refresh the workspace.",
                format!("Failed to index created page '{markdown_path}'"),
            )
        })?;
    refresh_workspace_folders(workspace)?;

    Ok(CreatePageResultDto {
        page: page_summary(page),
        pages: page_summaries(&workspace.pages),
        folders: workspace.folders.clone(),
        diagnostics: workspace.pages.collision_diagnostics(),
    })
}

pub(crate) fn create_folder_in_workspace(
    workspace: &mut WorkspaceState,
    path: String,
) -> AppResult<CreateFolderResultDto> {
    let folder_path = folder_path_from_target(&path).ok_or_else(|| invalid_folder_path(&path))?;
    let absolute_path = resolve_workspace_relative_path(&workspace.root, &folder_path)
        .ok_or_else(|| invalid_folder_path(&path))?;

    if absolute_path.exists() {
        return Err(AppError::already_exists(
            "A folder with this path already exists. Choose another name.",
        ));
    }

    fs::create_dir_all(&absolute_path).map_err(|error| {
        AppError::io(
            "The folder could not be created. Check the parent folder permissions and try again.",
            format!("Failed to create folder '{}': {error}", folder_path),
        )
    })?;
    refresh_workspace_folders(workspace)?;

    Ok(CreateFolderResultDto {
        path: folder_path,
        folders: workspace.folders.clone(),
    })
}

fn default_page_content(path: &str) -> String {
    default_h1_for_path(path)
}

fn lowercase_markdown_file_name(path: &str) -> String {
    let Some((folder, file_name)) = path.rsplit_once('/') else {
        return path.to_lowercase();
    };

    format!("{folder}/{}", file_name.to_lowercase())
}

pub(crate) fn delete_page_in_workspace(
    workspace: &mut WorkspaceState,
    path: String,
) -> AppResult<DeletePageResultDto> {
    let resolved_path = workspace
        .pages
        .resolve_path(&path)
        .map_err(|detail| ambiguous_page_path(&path, detail))?
        .ok_or_else(|| page_not_found(&path))?;
    let absolute_path = resolve_workspace_relative_path(&workspace.root, &resolved_path)
        .ok_or_else(|| invalid_page_path(&path))?;

    if !absolute_path.is_file() {
        return Err(page_not_found(&resolved_path));
    }

    fs::remove_file(&absolute_path).map_err(|error| {
        AppError::io(
            "The page could not be deleted. Check its permissions and try again.",
            format!("Failed to delete page '{}': {error}", resolved_path),
        )
    })?;

    workspace.remove_indexed_page(&resolved_path);
    refresh_workspace_folders(workspace)?;

    Ok(DeletePageResultDto {
        deleted_path: resolved_path,
        pages: page_summaries(&workspace.pages),
        folders: workspace.folders.clone(),
        diagnostics: workspace.pages.collision_diagnostics(),
    })
}

pub(crate) fn delete_folder_in_workspace(
    workspace: &mut WorkspaceState,
    path: String,
) -> AppResult<DeleteFolderResultDto> {
    let folder = normalize_folder_path(&path)?;
    let absolute_path = resolve_workspace_relative_path(&workspace.root, &folder)
        .ok_or_else(|| invalid_folder_path(&path))?;

    if !absolute_path.is_dir() {
        return Err(folder_not_found(&folder));
    }

    if absolute_path
        .read_dir()
        .map_err(|error| {
            AppError::io(
                "The folder contents could not be checked. Check its permissions and try again.",
                format!("Failed to inspect folder '{}': {error}", folder),
            )
        })?
        .next()
        .is_some()
    {
        return Err(AppError::folder_not_empty(
            "The folder is not empty. Move or delete its contents first.",
        ));
    }

    fs::remove_dir(&absolute_path).map_err(|error| {
        AppError::io(
            "The folder could not be deleted. Check its permissions and try again.",
            format!("Failed to delete folder '{}': {error}", folder),
        )
    })?;

    reindex_after_file_operation(workspace)?;

    Ok(DeleteFolderResultDto {
        deleted_path: folder,
        deleted_page_paths: Vec::new(),
        pages: page_summaries(&workspace.pages),
        folders: workspace.folders.clone(),
        diagnostics: workspace.pages.collision_diagnostics(),
    })
}

pub(crate) fn move_page_in_workspace(
    workspace: &mut WorkspaceState,
    path: String,
    target_folder: String,
) -> AppResult<MovePageResultDto> {
    let resolved_path = workspace
        .pages
        .resolve_path(&path)
        .map_err(|detail| ambiguous_page_path(&path, detail))?
        .ok_or_else(|| page_not_found(&path))?;
    let file_name = resolved_path
        .rsplit('/')
        .next()
        .ok_or_else(|| invalid_page_path(&path))?;
    let target_folder = target_folder.trim().trim_matches('/');
    let target_path = if target_folder.is_empty() {
        file_name.to_string()
    } else {
        format!("{target_folder}/{file_name}")
    };

    if resolved_path == target_path {
        let page = workspace
            .pages
            .get_by_path(&resolved_path)
            .ok_or_else(|| page_not_found(&resolved_path))?
            .clone();
        return Ok(MovePageResultDto {
            old_path: resolved_path,
            page: page_summary(page),
            pages: page_summaries(&workspace.pages),
            folders: workspace.folders.clone(),
            diagnostics: workspace.pages.collision_diagnostics(),
            updated_link_count: 0,
        });
    }

    let source_key = page_key_from_relative_path(&resolved_path)
        .ok_or_else(|| invalid_page_path(&resolved_path))?;
    ensure_page_target_available(&workspace.pages, &target_path)?;

    let source_absolute_path = resolve_workspace_relative_path(&workspace.root, &resolved_path)
        .ok_or_else(|| invalid_page_path(&resolved_path))?;
    let target_absolute_path = resolve_workspace_relative_path(&workspace.root, &target_path)
        .ok_or_else(|| invalid_page_path(&target_path))?;

    if !source_absolute_path.is_file() {
        return Err(page_not_found(&resolved_path));
    }

    let content = fs::read_to_string(&source_absolute_path).map_err(|error| {
        AppError::io(
            "The page could not be read before moving it. Check its permissions and try again.",
            format!("Failed to read page '{}': {error}", resolved_path),
        )
    })?;

    if let Some(parent) = target_absolute_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            AppError::io(
                "The target folder could not be created. Check its permissions and try again.",
                format!(
                    "Failed to create target directory '{}': {error}",
                    parent.display()
                ),
            )
        })?;
    }

    fs::rename(&source_absolute_path, &target_absolute_path).map_err(|error| {
        AppError::io(
            "The page could not be moved. Check the source and target folder permissions and try again.",
            format!("Failed to move page '{resolved_path}' to '{target_path}': {error}"),
        )
    })?;

    workspace.remove_indexed_page(&resolved_path);
    let page = workspace
        .index_page_content(target_path.clone(), content)
        .ok_or_else(|| {
            AppError::internal(
                "The page was moved, but Semtags could not update the workspace index. Refresh the workspace.",
                format!("Failed to index moved page '{target_path}'"),
            )
        })?;
    let page_path = page.path.clone();
    let updated_link_count =
        rewrite_links_to_targets_with_recovery(workspace, &[(source_key, page_path)])?;
    refresh_workspace_folders(workspace)?;

    Ok(MovePageResultDto {
        old_path: resolved_path,
        page: page_summary(page),
        pages: page_summaries(&workspace.pages),
        folders: workspace.folders.clone(),
        diagnostics: workspace.pages.collision_diagnostics(),
        updated_link_count,
    })
}

pub(crate) fn move_folder_in_workspace(
    workspace: &mut WorkspaceState,
    path: String,
    target_folder: String,
) -> AppResult<RenameFolderResultDto> {
    let old_folder = normalize_folder_path(&path)?;
    let target_folder = target_folder.trim().trim_matches('/').replace('\\', "/");
    if target_folder
        .split('/')
        .any(|segment| !segment.is_empty() && normalized_folder_name(segment).is_err())
    {
        return Err(invalid_folder_path(&target_folder));
    }
    if target_folder == old_folder || target_folder.starts_with(&format!("{old_folder}/")) {
        return Err(AppError::invalid_path(
            "A folder cannot be moved into itself. Choose a different target folder.",
        ));
    }
    let folder_name = old_folder
        .rsplit('/')
        .next()
        .ok_or_else(|| invalid_folder_path(&old_folder))?;
    let new_folder = if target_folder.is_empty() {
        folder_name.to_string()
    } else {
        format!("{target_folder}/{folder_name}")
    };

    move_folder_to_path(workspace, old_folder, new_folder)
}

pub(crate) fn rename_page_in_workspace(
    workspace: &mut WorkspaceState,
    path: String,
    new_name: String,
) -> AppResult<RenamePageResultDto> {
    let resolved_path = workspace
        .pages
        .resolve_path(&path)
        .map_err(|detail| ambiguous_page_path(&path, detail))?
        .ok_or_else(|| page_not_found(&path))?;
    let target_path = renamed_page_path(&resolved_path, &new_name)?;

    if resolved_path == target_path {
        let page = workspace
            .pages
            .get_by_path(&resolved_path)
            .ok_or_else(|| page_not_found(&resolved_path))?
            .clone();
        return Ok(RenamePageResultDto {
            old_path: resolved_path,
            page: page_summary(page),
            pages: page_summaries(&workspace.pages),
            folders: workspace.folders.clone(),
            diagnostics: workspace.pages.collision_diagnostics(),
            updated_link_count: 0,
        });
    }

    let source_key = page_key_from_relative_path(&resolved_path)
        .ok_or_else(|| invalid_page_path(&resolved_path))?;
    ensure_page_target_available(&workspace.pages, &target_path)?;

    let source_absolute_path = resolve_workspace_relative_path(&workspace.root, &resolved_path)
        .ok_or_else(|| invalid_page_path(&resolved_path))?;
    let target_absolute_path = resolve_workspace_relative_path(&workspace.root, &target_path)
        .ok_or_else(|| invalid_page_path(&target_path))?;

    if !source_absolute_path.is_file() {
        return Err(page_not_found(&resolved_path));
    }

    let content = fs::read_to_string(&source_absolute_path).map_err(|error| {
        AppError::io(
            "The page could not be read before renaming it. Check its permissions and try again.",
            format!("Failed to read page '{}': {error}", resolved_path),
        )
    })?;

    fs::rename(&source_absolute_path, &target_absolute_path).map_err(|error| {
        AppError::io(
            "The page could not be renamed. Check the folder permissions and try again.",
            format!("Failed to rename page '{resolved_path}' to '{target_path}': {error}"),
        )
    })?;

    workspace.remove_indexed_page(&resolved_path);
    let page = workspace
        .index_page_content(target_path.clone(), content)
        .ok_or_else(|| {
            AppError::internal(
                "The page was renamed, but Semtags could not update the workspace index. Refresh the workspace.",
                format!("Failed to index renamed page '{target_path}'"),
            )
        })?;
    let page_path = page.path.clone();
    let updated_link_count =
        rewrite_links_to_targets_with_recovery(workspace, &[(source_key, page_path)])?;
    refresh_workspace_folders(workspace)?;

    Ok(RenamePageResultDto {
        old_path: resolved_path,
        page: page_summary(page),
        pages: page_summaries(&workspace.pages),
        folders: workspace.folders.clone(),
        diagnostics: workspace.pages.collision_diagnostics(),
        updated_link_count,
    })
}

pub(crate) fn rename_folder_in_workspace(
    workspace: &mut WorkspaceState,
    path: String,
    new_name: String,
) -> AppResult<RenameFolderResultDto> {
    let old_folder = normalize_folder_path(&path)?;
    let new_folder = renamed_folder_path(&old_folder, &new_name)?;

    move_folder_to_path(workspace, old_folder, new_folder)
}

fn move_folder_to_path(
    workspace: &mut WorkspaceState,
    old_folder: String,
    new_folder: String,
) -> AppResult<RenameFolderResultDto> {
    if old_folder == new_folder {
        return Ok(RenameFolderResultDto {
            old_path: old_folder,
            new_path: new_folder,
            pages: page_summaries(&workspace.pages),
            folders: workspace.folders.clone(),
            diagnostics: workspace.pages.collision_diagnostics(),
            renamed_page_count: 0,
            updated_link_count: 0,
        });
    }

    let old_folder_prefix = format!("{old_folder}/");
    let pages_to_rename: Vec<Page> = workspace
        .pages
        .pages()
        .into_iter()
        .filter(|page| page.path.starts_with(&old_folder_prefix))
        .collect();
    let mut target_rewrites = Vec::new();
    for page in &pages_to_rename {
        let suffix = page.path.strip_prefix(&old_folder_prefix).ok_or_else(|| {
            AppError::internal(
                "Semtags could not prepare the folder move. Refresh the workspace and try again.",
                format!(
                    "Failed to derive folder-relative page path '{}' from '{old_folder}'",
                    page.path
                ),
            )
        })?;
        let new_page_path = format!("{new_folder}/{suffix}");
        ensure_page_target_available(&workspace.pages, &new_page_path)?;
        target_rewrites.push((page.key.clone(), new_page_path));
    }

    let old_absolute_path = resolve_workspace_relative_path(&workspace.root, &old_folder)
        .ok_or_else(|| invalid_folder_path(&old_folder))?;
    let new_absolute_path = resolve_workspace_relative_path(&workspace.root, &new_folder)
        .ok_or_else(|| invalid_folder_path(&new_folder))?;

    if !old_absolute_path.is_dir() {
        return Err(folder_not_found(&old_folder));
    }
    if new_absolute_path.exists() {
        return Err(AppError::already_exists(
            "A folder already exists at the target path. Choose a different destination.",
        ));
    }
    if let Some(parent) = new_absolute_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            AppError::io(
                "The target folder could not be created. Check its permissions and try again.",
                format!(
                    "Failed to create target parent directory '{}': {error}",
                    parent.display()
                ),
            )
        })?;
    }

    fs::rename(&old_absolute_path, &new_absolute_path).map_err(|error| {
        AppError::io(
            "The folder could not be moved. Check the source and target folder permissions and try again.",
            format!("Failed to move folder '{old_folder}' to '{new_folder}': {error}"),
        )
    })?;

    reindex_after_file_operation(workspace)?;
    let updated_link_count = rewrite_links_to_targets_with_recovery(workspace, &target_rewrites)?;

    Ok(RenameFolderResultDto {
        old_path: old_folder,
        new_path: new_folder,
        pages: page_summaries(&workspace.pages),
        folders: workspace.folders.clone(),
        diagnostics: workspace.pages.collision_diagnostics(),
        renamed_page_count: target_rewrites.len(),
        updated_link_count,
    })
}

fn refresh_workspace_folders(workspace: &mut WorkspaceState) -> AppResult<()> {
    workspace.folders = scan_workspace(&workspace.root)
        .map_err(|detail| {
            AppError::io(
                "The file operation completed, but the folder list could not be refreshed. Refresh the workspace.",
                detail,
            )
        })?
        .folders;
    Ok(())
}

fn rewrite_links_to_targets(
    workspace: &mut WorkspaceState,
    target_rewrites: &[(String, String)],
) -> AppResult<usize> {
    let rewrite_plan = collect_link_rewrite_plan(workspace, target_rewrites)?;
    let updated_link_count = rewrite_plan
        .iter()
        .map(|rewrite| rewrite.replacements)
        .sum();

    for rewrite in rewrite_plan {
        fs::write(&rewrite.absolute_path, &rewrite.rewritten).map_err(|error| {
            AppError::io(
                "A linked page could not be updated. Check its permissions and review affected wiki links.",
                format!("Failed to update links in '{}': {error}", rewrite.page_path),
            )
        })?;
        workspace.index_page_content(rewrite.page_path, rewrite.rewritten);
    }

    Ok(updated_link_count)
}

fn rewrite_links_to_targets_with_recovery(
    workspace: &mut WorkspaceState,
    target_rewrites: &[(String, String)],
) -> AppResult<usize> {
    rewrite_links_to_targets(workspace, target_rewrites).map_err(|error| {
        let original_detail = error.detail.unwrap_or(error.message);
        match reindex_workspace(workspace) {
            Ok(()) => AppError::io(
                "The file operation completed, but not all wiki links could be updated. The workspace index was rebuilt; review affected links.",
                format!("{original_detail}. Workspace index was rebuilt after the link update failure."),
            ),
            Err(reindex_error) => AppError::internal(
                "The file operation completed, but wiki links and the workspace index could not be updated. Reopen the workspace before continuing.",
                format!(
                    "{original_detail}. Failed to rebuild workspace index after the link update failure: {reindex_error}"
                ),
            ),
        }
    })
}

fn collect_link_rewrite_plan(
    workspace: &WorkspaceState,
    target_rewrites: &[(String, String)],
) -> AppResult<Vec<LinkRewrite>> {
    let mut rewrite_plan = Vec::new();

    for page in workspace.pages.pages() {
        let absolute_path = resolve_workspace_relative_path(&workspace.root, &page.path)
            .ok_or_else(|| invalid_page_path(&page.path))?;
        let content = fs::read_to_string(&absolute_path).map_err(|error| {
            AppError::io(
                "A linked page could not be read. Check its permissions and try again.",
                format!("Failed to read page '{}': {error}", page.path),
            )
        })?;
        let (rewritten, replacements) = rewrite_wiki_link_targets(
            &content,
            |target| replacement_target_for_link(target, target_rewrites).is_some(),
            |target| replacement_target_for_link(target, target_rewrites),
        );

        if replacements == 0 {
            continue;
        }

        rewrite_plan.push(LinkRewrite {
            page_path: page.path,
            absolute_path,
            rewritten,
            replacements,
        });
    }

    Ok(rewrite_plan)
}

fn replacement_target_for_link(
    target: &str,
    target_rewrites: &[(String, String)],
) -> Option<String> {
    let target_key = page_key_from_link_target(target)?;
    target_rewrites
        .iter()
        .find(|(old_key, _)| old_key == &target_key)
        .map(|(_, new_page_path)| page_path_to_link_target(new_page_path))
}

fn ensure_page_target_available(pages: &PageIndex, target_path: &str) -> AppResult<()> {
    let target_key =
        page_key_from_relative_path(target_path).ok_or_else(|| invalid_page_path(target_path))?;
    if !pages.paths_for_key(&target_key).is_empty() {
        return Err(AppError::already_exists(
            "A page with this path already exists, ignoring case. Choose another name or folder.",
        ));
    }

    Ok(())
}

fn renamed_page_path(current_path: &str, new_name: &str) -> AppResult<String> {
    let new_file_name = normalized_leaf_markdown_file_name(new_name)?;
    let current_folder = current_path.rsplit_once('/').map(|(folder, _)| folder);

    Ok(match current_folder {
        Some(folder) => format!("{folder}/{new_file_name}"),
        None => new_file_name,
    })
}

fn renamed_folder_path(current_path: &str, new_name: &str) -> AppResult<String> {
    let new_folder_name = normalized_folder_name(new_name)?;
    let current_parent = current_path.rsplit_once('/').map(|(parent, _)| parent);

    Ok(match current_parent {
        Some(parent) => format!("{parent}/{new_folder_name}"),
        None => new_folder_name,
    })
}

fn normalize_folder_path(path: &str) -> AppResult<String> {
    let normalized = path.trim().trim_matches('/');
    if normalized.is_empty() {
        return Err(AppError::invalid_path("Enter a folder path."));
    }
    if normalized
        .split('/')
        .any(|segment| normalized_folder_name(segment).is_err())
    {
        return Err(invalid_folder_path(path));
    }

    Ok(normalized.to_string())
}

fn normalized_leaf_markdown_file_name(value: &str) -> AppResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.contains('/') || trimmed.contains('\\') {
        return Err(AppError::invalid_path(
            "Enter a file name without a folder path.",
        ));
    }

    markdown_path_from_page_target(trimmed)
        .filter(|path| !path.contains('/'))
        .ok_or_else(|| AppError::invalid_path("Enter a valid page name."))
}

fn normalized_folder_name(value: &str) -> AppResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed == "."
        || trimmed == ".."
        || trimmed.contains('/')
        || trimmed.contains('\\')
    {
        return Err(AppError::invalid_path(
            "Enter a folder name without path separators or dot segments.",
        ));
    }

    Ok(trimmed.to_string())
}

fn reindex_after_file_operation(workspace: &mut WorkspaceState) -> AppResult<()> {
    reindex_workspace(workspace).map_err(|detail| {
        AppError::internal(
            "The file operation completed, but the workspace index could not be refreshed. Reopen the workspace before continuing.",
            detail,
        )
    })
}

fn invalid_page_path(path: &str) -> AppError {
    AppError::invalid_path(format!(
        "'{path}' is not a valid page path inside the workspace. Choose another path."
    ))
}

fn invalid_folder_path(path: &str) -> AppError {
    AppError::invalid_path(format!(
        "'{path}' is not a valid folder path inside the workspace. Choose another path."
    ))
}

fn page_not_found(path: &str) -> AppError {
    AppError::not_found(format!(
        "The page '{path}' no longer exists. Refresh the file list and try again."
    ))
}

fn folder_not_found(path: &str) -> AppError {
    AppError::not_found(format!(
        "The folder '{path}' no longer exists. Refresh the file list and try again."
    ))
}

fn ambiguous_page_path(path: &str, detail: String) -> AppError {
    AppError::conflict(
        format!(
            "More than one page matches '{path}' when letter case is ignored. Rename one of the pages and try again."
        ),
        detail,
    )
}

fn page_path_to_link_target(path: &str) -> String {
    path.strip_suffix(".md").unwrap_or(path).to_string()
}

#[cfg(test)]
mod tests {
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;
    use crate::content_snapshot::ContentSnapshot;
    use crate::index::backlink_index::BacklinkIndex;
    use crate::index::page_index::PageIndex;
    use crate::workspace_config::WorkspaceConfig;

    static TEMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    #[cfg(unix)]
    #[test]
    fn link_rewrite_failure_rebuilds_workspace_index() {
        let root = temp_workspace();
        fs::write(root.join("Alpha.md"), "# Alpha").unwrap();
        let source_path = root.join("Source.md");
        fs::write(&source_path, "- Link to [[Alpha]]").unwrap();
        fs::set_permissions(&source_path, fs::Permissions::from_mode(0o444)).unwrap();

        let mut workspace = WorkspaceState {
            root: root.clone(),
            config: WorkspaceConfig::default(),
            folders: Vec::new(),
            pages: PageIndex::from_paths(vec!["Alpha.md".to_string(), "Source.md".to_string()]),
            backlinks: BacklinkIndex::default(),
            contents: ContentSnapshot::default(),
        };

        let result = rewrite_links_to_targets_with_recovery(
            &mut workspace,
            &[("alpha".to_string(), "archive/Alpha.md".to_string())],
        );

        fs::set_permissions(&source_path, fs::Permissions::from_mode(0o644)).unwrap();

        let error = result.unwrap_err();
        assert_eq!(error.code, crate::app_error::AppErrorCode::Io);
        let detail = error.detail.unwrap();
        assert!(detail.contains("Failed to update links in 'Source.md'"));
        assert!(detail.contains("Workspace index was rebuilt"));
        assert_eq!(
            fs::read_to_string(&source_path).unwrap(),
            "- Link to [[Alpha]]"
        );
        assert_eq!(workspace.pages.pages().len(), 2);
        assert_eq!(
            workspace.backlinks.backlinks_for_target_key("alpha").len(),
            1
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn partial_link_rewrite_failure_reindexes_changed_and_unchanged_pages() {
        let root = temp_workspace();
        fs::write(root.join("Alpha.md"), "# Alpha").unwrap();
        let first_source = root.join("A-source.md");
        let second_source = root.join("B-source.md");
        fs::write(&first_source, "- First [[Alpha]]").unwrap();
        fs::write(&second_source, "- Second [[Alpha]]").unwrap();

        let mut workspace = WorkspaceState {
            root: root.clone(),
            config: WorkspaceConfig::default(),
            folders: Vec::new(),
            pages: PageIndex::default(),
            backlinks: BacklinkIndex::default(),
            contents: ContentSnapshot::default(),
        };
        reindex_workspace(&mut workspace).unwrap();
        fs::set_permissions(&second_source, fs::Permissions::from_mode(0o444)).unwrap();

        let result = rewrite_links_to_targets_with_recovery(
            &mut workspace,
            &[("alpha".to_string(), "archive/Alpha.md".to_string())],
        );

        fs::set_permissions(&second_source, fs::Permissions::from_mode(0o644)).unwrap();

        let error = result.unwrap_err();
        assert_eq!(error.code, crate::app_error::AppErrorCode::Io);
        let detail = error.detail.unwrap();
        assert!(detail.contains("Failed to update links in 'B-source.md'"));
        assert!(detail.contains("Workspace index was rebuilt"));
        assert_eq!(
            fs::read_to_string(&first_source).unwrap(),
            "- First [[archive/Alpha]]"
        );
        assert_eq!(
            fs::read_to_string(&second_source).unwrap(),
            "- Second [[Alpha]]"
        );
        assert_eq!(
            workspace
                .backlinks
                .backlinks_for_target_key("archive/alpha")
                .len(),
            1
        );
        assert_eq!(
            workspace.backlinks.backlinks_for_target_key("alpha").len(),
            1
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn delete_folder_removes_empty_folder_and_reindexes_workspace() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("projects/archive")).unwrap();
        fs::write(root.join("Inbox.md"), "# Inbox").unwrap();
        let mut workspace = WorkspaceState {
            root: root.clone(),
            config: WorkspaceConfig::default(),
            folders: vec!["projects".to_string(), "projects/archive".to_string()],
            pages: PageIndex::from_paths(vec!["Inbox.md".to_string()]),
            backlinks: BacklinkIndex::default(),
            contents: ContentSnapshot::default(),
        };

        let result =
            delete_folder_in_workspace(&mut workspace, "projects/archive".to_string()).unwrap();

        assert_eq!(result.deleted_path, "projects/archive");
        assert!(result.deleted_page_paths.is_empty());
        assert!(root.join("projects").exists());
        assert!(!root.join("projects/archive").exists());
        assert_eq!(workspace.pages.pages().len(), 1);
        assert_eq!(workspace.pages.pages()[0].path, "Inbox.md");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn delete_folder_rejects_non_empty_folder() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("projects/archive")).unwrap();
        fs::write(root.join("projects/Alpha.md"), "# Alpha").unwrap();
        let mut workspace = WorkspaceState {
            root: root.clone(),
            config: WorkspaceConfig::default(),
            folders: vec!["projects".to_string(), "projects/archive".to_string()],
            pages: PageIndex::from_paths(vec!["projects/Alpha.md".to_string()]),
            backlinks: BacklinkIndex::default(),
            contents: ContentSnapshot::default(),
        };

        let error = delete_folder_in_workspace(&mut workspace, "projects".to_string())
            .expect_err("non-empty folders should not be deleted");

        assert_eq!(error.code, crate::app_error::AppErrorCode::FolderNotEmpty);
        assert_eq!(
            error.message,
            "The folder is not empty. Move or delete its contents first."
        );
        assert!(root.join("projects").exists());
        assert!(root.join("projects/Alpha.md").exists());
        assert_eq!(workspace.pages.pages().len(), 1);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn move_folder_moves_pages_and_updates_links() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("projects")).unwrap();
        fs::write(root.join("projects/Alpha.md"), "# Alpha").unwrap();
        fs::write(root.join("Source.md"), "- See [[projects/Alpha]]").unwrap();
        let mut workspace = WorkspaceState {
            root: root.clone(),
            config: WorkspaceConfig::default(),
            folders: vec!["projects".to_string()],
            pages: PageIndex::from_paths(vec![
                "projects/Alpha.md".to_string(),
                "Source.md".to_string(),
            ]),
            backlinks: BacklinkIndex::default(),
            contents: ContentSnapshot::default(),
        };

        let result = move_folder_in_workspace(
            &mut workspace,
            "projects".to_string(),
            "archive".to_string(),
        )
        .unwrap();

        assert_eq!(result.old_path, "projects");
        assert_eq!(result.new_path, "archive/projects");
        assert!(root.join("archive/projects/Alpha.md").is_file());
        assert_eq!(
            fs::read_to_string(root.join("Source.md")).unwrap(),
            "- See [[archive/projects/Alpha]]"
        );
        assert!(workspace
            .pages
            .get_by_path("archive/projects/Alpha.md")
            .is_some());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn move_and_rename_page_rewrite_links_for_non_ascii_paths() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("projekte")).unwrap();
        fs::write(root.join("projekte/übersicht.md"), "# Übersicht").unwrap();
        fs::write(root.join("Quelle.md"), "- Siehe [[PROJEKTE/ÜBERSICHT]]").unwrap();
        let mut workspace = WorkspaceState {
            root: root.clone(),
            config: WorkspaceConfig::default(),
            folders: Vec::new(),
            pages: PageIndex::default(),
            backlinks: BacklinkIndex::default(),
            contents: ContentSnapshot::default(),
        };
        reindex_workspace(&mut workspace).unwrap();

        move_page_in_workspace(
            &mut workspace,
            "projekte/übersicht.md".to_string(),
            "archiv".to_string(),
        )
        .unwrap();
        rename_page_in_workspace(
            &mut workspace,
            "archiv/übersicht.md".to_string(),
            "rückblick".to_string(),
        )
        .unwrap();

        assert!(root.join("archiv/rückblick.md").is_file());
        assert_eq!(
            fs::read_to_string(root.join("Quelle.md")).unwrap(),
            "- Siehe [[archiv/rückblick]]"
        );
        assert!(workspace.pages.get_by_path("archiv/rückblick.md").is_some());
        assert_eq!(
            workspace
                .backlinks
                .backlinks_for_target_key("archiv/rückblick")
                .len(),
            1
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_page_rename_keeps_files_index_and_config_unchanged() {
        let root = temp_workspace();
        fs::write(root.join("Alpha.md"), "# Alpha").unwrap();
        fs::write(root.join("Existing.md"), "# Existing").unwrap();
        let mut config = WorkspaceConfig::default();
        config.page_favorites = vec!["Alpha.md".to_string()];
        config.last_editor_path = Some("Alpha.md".to_string());
        let mut workspace = WorkspaceState {
            root: root.clone(),
            config,
            folders: Vec::new(),
            pages: PageIndex::default(),
            backlinks: BacklinkIndex::default(),
            contents: ContentSnapshot::default(),
        };
        reindex_workspace(&mut workspace).unwrap();
        let pages_before = workspace.pages.pages();
        let config_before = workspace.config.clone();

        let result = rename_page_in_workspace(
            &mut workspace,
            "Alpha.md".to_string(),
            "existing".to_string(),
        );

        let error = result.unwrap_err();
        assert_eq!(error.code, crate::app_error::AppErrorCode::AlreadyExists);
        assert!(root.join("Alpha.md").is_file());
        assert!(root.join("Existing.md").is_file());
        assert_eq!(workspace.pages.pages(), pages_before);
        assert_eq!(workspace.config, config_before);

        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn unreadable_page_is_not_moved_before_validation() {
        let root = temp_workspace();
        let source = root.join("Alpha.md");
        fs::write(&source, "# Alpha").unwrap();
        fs::set_permissions(&source, fs::Permissions::from_mode(0o000)).unwrap();
        let mut workspace = WorkspaceState {
            root: root.clone(),
            config: WorkspaceConfig::default(),
            folders: Vec::new(),
            pages: PageIndex::from_paths(vec!["Alpha.md".to_string()]),
            backlinks: BacklinkIndex::default(),
            contents: ContentSnapshot::default(),
        };

        let result = move_page_in_workspace(
            &mut workspace,
            "Alpha.md".to_string(),
            "archive".to_string(),
        );

        fs::set_permissions(&source, fs::Permissions::from_mode(0o644)).unwrap();

        let error = result.unwrap_err();
        assert_eq!(error.code, crate::app_error::AppErrorCode::Io);
        assert!(error
            .detail
            .unwrap()
            .contains("Failed to read page 'Alpha.md'"));
        assert!(source.is_file());
        assert!(!root.join("archive/Alpha.md").exists());
        assert!(workspace.pages.get_by_path("Alpha.md").is_some());

        fs::remove_dir_all(root).unwrap();
    }

    fn temp_workspace() -> PathBuf {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::SeqCst);
        let root = std::env::temp_dir().join(format!("semtags-page-ops-test-{now}-{counter}"));
        fs::create_dir_all(&root).unwrap();
        root
    }
}
